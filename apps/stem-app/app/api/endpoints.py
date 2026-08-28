"""
API Route Endpoints for AI Audio Lab 2026.
Implements:
- /api/upload: Upload audio file
- /api/analyze/basic: DSP baseline analysis
- /api/analyze/deep: SOTA 2026 Multi-Task Deep Analysis (Stems, BeatNet, 170+ Chords)
- /api/progress/{task_id}: Server-Sent Events (SSE) live progress stream
- /api/audio/{task_id}: Stream full mix audio
- /api/audio/{task_id}/{stem}: Stream individual separated stem track (vocals, drums, bass, other)
"""

import os
import re
import json
import uuid
import asyncio
from pathlib import Path
from typing import Optional, AsyncGenerator, Any

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, status
from fastapi.responses import FileResponse, StreamingResponse

from app.api.schemas import (
    UploadResponse,
    AnalysisRequest,
    AnalysisResponse,
    DeepAnalysisRequest,
    DeepAnalysisResponse
)
from app.core.audio_utils import SUPPORTED_EXTENSIONS
from app.core.dsp_baseline import analyze_basic
from app.core.deep_engine import (
    UnifiedDeepMusicAnalyzer,
    PROGRESS_TRACKER
)

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
ALLOWED_STEMS = {"vocals", "drums", "bass", "other"}

# Initialize global deep analyzer
_deep_analyzer = UnifiedDeepMusicAnalyzer()


def get_safe_storage_file(task_id: str) -> Optional[Path]:
    """Safely locates an audio file in STORAGE_DIR matching task_id."""
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
    """Accepts an audio file upload, validates format and size, generates a task_id."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Uploaded file must have a valid filename."
        )

    clean_filename = Path(file.filename.replace("\\", "/")).name
    if not clean_filename or clean_filename.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename."
        )

    ext = os.path.splitext(clean_filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format '{ext}'. Allowed: {sorted(SUPPORTED_EXTENSIONS)}"
        )

    task_id = str(uuid.uuid4())
    safe_filename = f"{task_id}_{clean_filename}"
    save_path = STORAGE_DIR / safe_filename

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
    """Executes DSP baseline analysis on an uploaded file."""
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


def _run_deep_analysis_worker(audio_path: str, task_id: str, storage_dir: Path):
    """Worker function executed in background thread."""
    try:
        _deep_analyzer.analyze_deep(audio_path, task_id, storage_dir)
    except Exception as e:
        PROGRESS_TRACKER.set_progress(task_id, "error", 0, f"Analysis failed: {str(e)}")


@router.post(
    "/analyze/deep",
    response_model=DeepAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Run SOTA 2026 Deep Multi-Task Analysis (Stems, BeatNet, 170+ Chords)"
)
async def analyze_audio_deep(
    request: DeepAnalysisRequest,
    background_tasks: BackgroundTasks
) -> Any:
    """
    Triggers SOTA 2026 Deep Analysis pipeline.
    Separates 4 stems, tracks beats/downbeats on drums, pools beat-synchronous features,
    and decodes 170+ chords with Slash Inversions via Viterbi HMM.
    """
    target_path = None
    task_id = request.task_id or str(uuid.uuid4())

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

    # Set initial progress state
    PROGRESS_TRACKER.set_progress(task_id, "starting", 0, "Initializing Deep AI Engine...")

    # Execute deep analysis
    try:
        result = _deep_analyzer.analyze_deep(target_path, task_id, STORAGE_DIR)
        return DeepAnalysisResponse(**result)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Deep analysis error: {str(e)}")


@router.get(
    "/progress/{task_id}",
    summary="Subscribe to live analysis progress via Server-Sent Events (SSE)"
)
async def get_analysis_progress(task_id: str):
    """
    Streams realtime progress events for task_id using SSE protocol.
    """
    if not task_id or not SAFE_TASK_ID_REGEX.fullmatch(task_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid task_id format.")

    async def event_generator() -> AsyncGenerator[str, None]:
        q = PROGRESS_TRACKER.subscribe(task_id)
        try:
            while True:
                # Poll queue asynchronously without blocking event loop
                try:
                    payload = q.get_nowait()
                    json_data = json.dumps(payload)
                    yield f"data: {json_data}\n\n"
                    if payload.get("percent") == 100 or payload.get("step") in ["complete", "error"]:
                        break
                except Exception:
                    await asyncio.sleep(0.2)
        finally:
            PROGRESS_TRACKER.unsubscribe(task_id, q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get(
    "/audio/{task_id}",
    summary="Stream or download the full mix audio file"
)
async def get_audio_file(task_id: str):
    """Retrieves and streams the full mix audio file for task_id."""
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


@router.get(
    "/audio/{task_id}/{stem}",
    summary="Stream a separated stem audio file (vocals, drums, bass, other)"
)
async def get_stem_audio_file(task_id: str, stem: str):
    """Retrieves and streams an individual separated stem track."""
    if not task_id or not SAFE_TASK_ID_REGEX.fullmatch(task_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid task_id format.")

    stem_lower = stem.lower()
    if stem_lower not in ALLOWED_STEMS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid stem name '{stem}'. Allowed stems: {sorted(list(ALLOWED_STEMS))}"
        )

    stem_dir = (STORAGE_DIR / f"{task_id}_stems").resolve()
    storage_resolved = STORAGE_DIR.resolve()
    if not stem_dir.is_relative_to(storage_resolved):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path traversal detected.")

    stem_file = (stem_dir / f"{stem_lower}.wav").resolve()
    if not stem_file.is_relative_to(storage_resolved) or not stem_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Separated stem '{stem_lower}' for task_id '{task_id}' not found. Run /api/analyze/deep first."
        )

    return FileResponse(
        path=str(stem_file),
        media_type="audio/wav",
        filename=f"{task_id}_{stem_lower}.wav"
    )
