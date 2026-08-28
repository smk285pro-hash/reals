# Concrete Remediation Plan: API Security & Robustness Hardening

**Project**: AI Audio Lab 2026 (Milestone 1 — Iteration 2)  
**Target File**: `app/api/endpoints.py`  
**Related Files**: `app/api/schemas.py`, `app/core/audio_utils.py`  
**Author**: Explorer Agent (`sub_orch_m1_explorer_2`)  
**Date**: 2026-08-19  

---

## 1. Executive Summary & Root Cause Analysis

In Milestone 1 Iteration 1, Challenger 2 identified 3 security and robustness vulnerabilities causing 9 test failures across 84 adversarial stress tests (`tests/test_api_adversarial_challenger2.py`):

| ID | Vulnerability | Severity | Location | Root Cause |
|---|---|---|---|---|
| **V1** | **Path Traversal & Arbitrary File Disclosure** | **CRITICAL** | `app/api/endpoints.py:154-164` | `direct = STORAGE_DIR / task_id` evaluated relative paths without sanitization or containment validation against `STORAGE_DIR.resolve()`, allowing traversal out to root (e.g. `..\main.py`, `..\PROJECT.md`). |
| **V2** | **Glob Wildcard Injection** | **CRITICAL** | `app/api/endpoints.py:100-113`, `150-164` | `task_id` was interpolated directly into `glob.glob(f"{STORAGE_DIR}/{task_id}_*")`. Supplying `*`, `?`, `[0-9]*`, or `[a-z]*` matched files belonging to other users. |
| **V3** | **HTTP 500 Crash on Upload Filenames with Path Separators** | **HIGH** | `app/api/endpoints.py:56-74` | `file.filename` was concatenated directly (`f"{task_id}_{file.filename}"`). Slashes (`/` or `\`) created paths with non-existent parent subdirectories, triggering unhandled `FileNotFoundError` returned as HTTP 500. |

---

## 2. Security Blueprint & Design Principles

### Principle 1: Whitelist-based Task ID Validation & Non-Glob Directory Iteration
Instead of passing user input into `glob.glob`, use a two-layer defense:
1. **Format Validation**: Reject any `task_id` containing characters outside `^[a-zA-Z0-9_\-]+$` or exceeding 128 characters (immediately returns HTTP 404). This eliminates wildcards (`*`, `?`, `[]`), backslashes (`\`), forward slashes (`/`), and traversal dots (`..`).
2. **Safe Directory Scan**: Iterate `STORAGE_DIR.iterdir()` using exact string prefix matching (`file_path.name.startswith(f"{task_id}_")` or `file_path.name == task_id`).
3. **Path Containment Assurance**: Ensure `resolved_file.is_relative_to(STORAGE_DIR.resolve())` and `resolved_file.exists()`.

### Principle 2: Strict Upload Filename Sanitization
1. Strip all directory components and path separators across both Windows (`\`) and POSIX (`/`):
   ```python
   clean_filename = Path(file.filename.replace("\\", "/")).name
   ```
2. If `clean_filename` is empty or whitespace, reject with HTTP 400.
3. Validate audio extension against `SUPPORTED_EXTENSIONS`.
4. Ensure `(STORAGE_DIR / f"{task_id}_{clean_filename}").resolve().is_relative_to(STORAGE_DIR.resolve())`.

---

## 3. Concrete Line-by-Line Changes for `app/api/endpoints.py`

### 3.1 Imports & Helper Function

#### Before (Lines 6-10):
```python
import os
import uuid
import glob
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse
```

#### After:
```python
import os
import re
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse
```

#### New Helper Function: `get_safe_storage_file` (Insert right after `MIME_TYPES` definition):
```python
SAFE_TASK_ID_REGEX = re.compile(r"^[a-zA-Z0-9_\-]+$")


def get_safe_storage_file(task_id: str) -> Optional[Path]:
    """
    Safely locates an audio file in STORAGE_DIR matching task_id.
    Guarantees protection against:
    - Path traversal (.., /, \\)
    - Glob wildcard injection (*, ?, [])
    - Unauthorized access outside STORAGE_DIR
    """
    if not task_id or len(task_id) > 128 or not SAFE_TASK_ID_REGEX.fullmatch(task_id):
        return None

    storage_resolved = STORAGE_DIR.resolve()
    prefix = f"{task_id}_"

    try:
        for file_path in STORAGE_DIR.iterdir():
            if file_path.is_file():
                if file_path.name.startswith(prefix) or file_path.name == task_id:
                    resolved_file = file_path.resolve()
                    if resolved_file.is_relative_to(storage_resolved) and resolved_file.exists():
                        return resolved_file
    except Exception:
        return None

    return None
```

---

### 3.2 Remediation for `POST /api/upload` (`upload_audio`)

#### Target Location: Lines 37-82 in `app/api/endpoints.py`

```python
@router.post(
    "/upload", 
    response_model=UploadResponse, 
    status_code=status.HTTP_200_OK,
    summary="Upload an audio file"
)
async def upload_audio(file: UploadFile = File(...)) -> UploadResponse:
    """
    Accepts an audio file upload, validates extension, sanitizes filename,
    generates a UUID task_id, and stores the file in the storage directory.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Uploaded file must have a valid filename."
        )

    # 1. Sanitize filename: strip directory prefixes and path separators
    clean_filename = Path(file.filename.replace("\\", "/")).name
    if not clean_filename or clean_filename.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename."
        )

    # 2. Validate audio extension
    ext = os.path.splitext(clean_filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format '{ext}'. Allowed: {sorted(SUPPORTED_EXTENSIONS)}"
        )

    task_id = str(uuid.uuid4())
    safe_filename = f"{task_id}_{clean_filename}"
    save_path = STORAGE_DIR / safe_filename

    # 3. Containment check (defense-in-depth)
    resolved_save_path = save_path.resolve()
    resolved_storage = STORAGE_DIR.resolve()
    if not resolved_save_path.is_relative_to(resolved_storage):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename: path traversal detected."
        )

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty (0 bytes)."
            )
        with open(resolved_save_path, "wb") as f:
            f.write(content)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save audio file: {str(e)}"
        )

    audio_url = f"/api/audio/{task_id}"
    return UploadResponse(
        task_id=task_id,
        filename=clean_filename,
        message="File uploaded successfully",
        audio_url=audio_url
    )
```

---

### 3.3 Remediation for `POST /api/analyze/basic` (`analyze_audio_basic`)

#### Target Location: Lines 85-140 in `app/api/endpoints.py`

```python
@router.post(
    "/analyze/basic", 
    response_model=AnalysisResponse, 
    status_code=status.HTTP_200_OK,
    summary="Run DSP baseline analysis on an audio file"
)
async def analyze_audio_basic(request: AnalysisRequest) -> AnalysisResponse:
    """
    Executes DSP baseline analysis on an uploaded file (via task_id)
    or local file path.
    """
    target_path = None
    task_id = request.task_id or ""

    if request.task_id:
        found_file = get_safe_storage_file(request.task_id)
        if not found_file:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Audio file with task_id '{request.task_id}' not found."
            )
        target_path = str(found_file)
    elif request.file_path:
        if not os.path.exists(request.file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File path '{request.file_path}' does not exist."
            )
        target_path = request.file_path
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either 'task_id' or 'file_path' must be provided in request body."
        )

    try:
        result = analyze_basic(target_path, task_id=task_id)
        return AnalysisResponse(**result)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"DSP analysis encountered an error: {str(e)}"
        )
```

---

### 3.4 Remediation for `GET /api/audio/{task_id}` (`get_audio_file`)

#### Target Location: Lines 142-173 in `app/api/endpoints.py`

```python
@router.get(
    "/audio/{task_id}",
    summary="Stream or download an uploaded audio file"
)
async def get_audio_file(task_id: str):
    """
    Retrieves and streams the raw audio file corresponding to the task_id.
    """
    found_file = get_safe_storage_file(task_id)
    if not found_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audio file for task_id '{task_id}' not found."
        )

    ext = found_file.suffix.lower()
    media_type = MIME_TYPES.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(found_file),
        media_type=media_type,
        filename=found_file.name
    )
```

---

## 4. Full Proposed File Content: `app/api/endpoints.py`

```python
"""
API Route Endpoints for AI Audio Lab 2026.
Implements /api/upload, /api/analyze/basic, and /api/audio/{task_id}.
Hardened against path traversal, wildcard glob injection, and unhandled filename exceptions.
"""

import os
import re
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse

from app.api.schemas import UploadResponse, AnalysisRequest, AnalysisResponse
from app.core.audio_utils import SUPPORTED_EXTENSIONS
from app.core.dsp_baseline import analyze_basic

router = APIRouter(prefix="/api", tags=["Audio Analysis"])

STORAGE_DIR = Path("storage")
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

MIME_TYPES = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4"
}

SAFE_TASK_ID_REGEX = re.compile(r"^[a-zA-Z0-9_\-]+$")


def get_safe_storage_file(task_id: str) -> Optional[Path]:
    """
    Safely locates an audio file in STORAGE_DIR matching task_id.
    Guarantees protection against:
    - Path traversal (.., /, \\)
    - Glob wildcard injection (*, ?, [])
    - Unauthorized access outside STORAGE_DIR
    """
    if not task_id or len(task_id) > 128 or not SAFE_TASK_ID_REGEX.fullmatch(task_id):
        return None

    storage_resolved = STORAGE_DIR.resolve()
    prefix = f"{task_id}_"

    try:
        for file_path in STORAGE_DIR.iterdir():
            if file_path.is_file():
                if file_path.name.startswith(prefix) or file_path.name == task_id:
                    resolved_file = file_path.resolve()
                    if resolved_file.is_relative_to(storage_resolved) and resolved_file.exists():
                        return resolved_file
    except Exception:
        return None

    return None


@router.post(
    "/upload", 
    response_model=UploadResponse, 
    status_code=status.HTTP_200_OK,
    summary="Upload an audio file"
)
async def upload_audio(file: UploadFile = File(...)) -> UploadResponse:
    """
    Accepts an audio file upload, validates extension, sanitizes filename,
    generates a UUID task_id, and stores the file in the storage directory.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Uploaded file must have a valid filename."
        )

    # 1. Sanitize filename: strip directory prefixes and path separators
    clean_filename = Path(file.filename.replace("\\", "/")).name
    if not clean_filename or clean_filename.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename."
        )

    # 2. Validate audio extension
    ext = os.path.splitext(clean_filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format '{ext}'. Allowed: {sorted(SUPPORTED_EXTENSIONS)}"
        )

    task_id = str(uuid.uuid4())
    safe_filename = f"{task_id}_{clean_filename}"
    save_path = STORAGE_DIR / safe_filename

    # 3. Containment check (defense-in-depth)
    resolved_save_path = save_path.resolve()
    resolved_storage = STORAGE_DIR.resolve()
    if not resolved_save_path.is_relative_to(resolved_storage):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename: path traversal detected."
        )

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty (0 bytes)."
            )
        with open(resolved_save_path, "wb") as f:
            f.write(content)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save audio file: {str(e)}"
        )

    audio_url = f"/api/audio/{task_id}"
    return UploadResponse(
        task_id=task_id,
        filename=clean_filename,
        message="File uploaded successfully",
        audio_url=audio_url
    )


@router.post(
    "/analyze/basic", 
    response_model=AnalysisResponse, 
    status_code=status.HTTP_200_OK,
    summary="Run DSP baseline analysis on an audio file"
)
async def analyze_audio_basic(request: AnalysisRequest) -> AnalysisResponse:
    """
    Executes DSP baseline analysis on an uploaded file (via task_id)
    or local file path.
    """
    target_path = None
    task_id = request.task_id or ""

    if request.task_id:
        found_file = get_safe_storage_file(request.task_id)
        if not found_file:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Audio file with task_id '{request.task_id}' not found."
            )
        target_path = str(found_file)
    elif request.file_path:
        if not os.path.exists(request.file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File path '{request.file_path}' does not exist."
            )
        target_path = request.file_path
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either 'task_id' or 'file_path' must be provided in request body."
        )

    try:
        result = analyze_basic(target_path, task_id=task_id)
        return AnalysisResponse(**result)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"DSP analysis encountered an error: {str(e)}"
        )


@router.get(
    "/audio/{task_id}",
    summary="Stream or download an uploaded audio file"
)
async def get_audio_file(task_id: str):
    """
    Retrieves and streams the raw audio file corresponding to the task_id.
    """
    found_file = get_safe_storage_file(task_id)
    if not found_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audio file for task_id '{task_id}' not found."
        )

    ext = found_file.suffix.lower()
    media_type = MIME_TYPES.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(found_file),
        media_type=media_type,
        filename=found_file.name
    )
```

---

## 5. Verification & Testing Matrix

### Expected Results Post-Remediation:
| Suite | Command | Total Tests | Current | Target |
|---|---|---|---|---|
| **Adversarial Suite** | `pytest -v tests/test_api_adversarial_challenger2.py` | 84 | 75 passed, 9 failed | **84 passed (100%)** |
| **Milestone 1 Core** | `pytest -v tests/test_milestone1.py` | 14 | 14 passed | **14 passed (100%)** |
| **DSP Empirical** | `pytest -v tests/test_dsp_empirical_adversarial.py` | 57 | 57 passed | **57 passed (100%)** |
| **24-Triad Benchmark** | `pytest -v tests/test_dsp_exhaustive_triads.py` | 26 | 26 passed | **26 passed (100%)** |
| **Full 4-Tier Suite** | `python run_tests.py` | 236 | 227 passed, 9 failed | **236 passed (100%)** |

### Detailed Test Resolution Mapping for the 9 Failures:
1. `test_upload_filename_with_path_separators[subfolder/audio.wav]` -> **PASS**: Sanitized to `audio.wav`, saved to `storage/<uuid>_audio.wav`, returns HTTP 200.
2. `test_upload_filename_with_path_separators[sub\\nested\\audio.wav]` -> **PASS**: Sanitized to `audio.wav`, returns HTTP 200.
3. `test_analyze_wildcard_glob_injection[*]` -> **PASS**: `SAFE_TASK_ID_REGEX` rejects `*`, returns HTTP 404.
4. `test_analyze_wildcard_glob_injection[[0-9]*]` -> **PASS**: `SAFE_TASK_ID_REGEX` rejects brackets and asterisk, returns HTTP 404.
5. `test_get_audio_path_traversal_windows_backslashes[..\\main.py]` -> **PASS**: `SAFE_TASK_ID_REGEX` rejects backslashes/dots, returns HTTP 404.
6. `test_get_audio_path_traversal_windows_backslashes[..\\PROJECT.md]` -> **PASS**: Returns HTTP 404.
7. `test_get_audio_path_traversal_windows_backslashes[..\\requirements.txt]` -> **PASS**: Returns HTTP 404.
8. `test_get_audio_wildcard_glob_injection[*]` -> **PASS**: Returns HTTP 404.
9. `test_get_audio_wildcard_glob_injection[[a-z]*]` -> **PASS**: Returns HTTP 404.

---

## 6. GitNexus Impact Analysis Summary
- **Symbol**: `upload_audio` (Risk: LOW, direct callers: 0, internal endpoint)
- **Symbol**: `analyze_audio_basic` (Risk: LOW, direct callers: 0, internal endpoint)
- **Symbol**: `get_audio_file` (Risk: LOW, direct callers: 0, internal endpoint)
- **Conclusion**: The modifications strictly affect internal routing logic and input validation inside `app/api/endpoints.py` without breaking external contract schemas or DSP modules.
