# Handoff Report - Challenger 2: Adversarial Stress-Testing (Milestone 1)

## 1. Observation

Adversarial stress-testing was executed against FastAPI application endpoints (`app/main.py`, `app/api/endpoints.py`, `app/core/audio_utils.py`) using `pytest -v tests/test_api_adversarial_challenger2.py`.

### Summary of Test Execution
- **Total Adversarial Tests Executed**: 84 tests
- **Passed**: 75 tests
- **Failed**: 9 tests (Exposing 3 distinct security & robustness vulnerabilities)
- **Execution Command**: `pytest -v tests/test_api_adversarial_challenger2.py`
- **Result Output**:
```
FAILED tests/test_api_adversarial_challenger2.py::TestUploadAdversarial::test_upload_filename_with_path_separators[subfolder/audio.wav]
FAILED tests/test_api_adversarial_challenger2.py::TestUploadAdversarial::test_upload_filename_with_path_separators[sub\\nested\\audio.wav]
FAILED tests/test_api_adversarial_challenger2.py::TestAnalyzeAdversarial::test_analyze_wildcard_glob_injection[*]
FAILED tests/test_api_adversarial_challenger2.py::TestAnalyzeAdversarial::test_analyze_wildcard_glob_injection[[0-9]*]
FAILED tests/test_api_adversarial_challenger2.py::TestAudioStreamAdversarial::test_get_audio_path_traversal_windows_backslashes[..\\main.py]
FAILED tests/test_api_adversarial_challenger2.py::TestAudioStreamAdversarial::test_get_audio_path_traversal_windows_backslashes[..\\PROJECT.md]
FAILED tests/test_api_adversarial_challenger2.py::TestAudioStreamAdversarial::test_get_audio_path_traversal_windows_backslashes[..\\requirements.txt]
FAILED tests/test_api_adversarial_challenger2.py::TestAudioStreamAdversarial::test_get_audio_wildcard_glob_injection[*]
FAILED tests/test_api_adversarial_challenger2.py::TestAudioStreamAdversarial::test_get_audio_wildcard_glob_injection[[a-z]*]
================== 9 failed, 75 passed, 7 warnings in 16.96s ==================
```

### Specific Empirical Observations

#### Finding 1 (CRITICAL): Path Traversal & Arbitrary Local File Disclosure in `GET /api/audio/{task_id}`
- **File**: `app/api/endpoints.py`, Lines 150–164.
- **Verbatim Test Execution**:
  ```python
  client.get('/api/audio/..\\main.py')
  # Response: Status 200 OK, Content: '"""\nAI Audio Lab 2026 Server Entry Point.\n"""\n\nimp...'
  client.get('/api/audio/..\\PROJECT.md')
  # Response: Status 200 OK, Content: '# Project: AI Audio Lab 2026 (Phase 1)\n\n## Archite...'
  client.get('/api/audio/..\\requirements.txt')
  # Response: Status 200 OK, Content: 'fastapi==0.111.0\nuvicorn==0.30.1\n...'
  ```
- **Observed Behavior**: Supplying relative path traversal sequences (e.g. `..\main.py`) causes the endpoint to escape `storage/` and return the raw source code / system files directly to unauthenticated clients.

#### Finding 2 (CRITICAL): Storage Leak / Insecure File Access via Glob Wildcard Injection (`*`, `?`, `[]`)
- **File**: `app/api/endpoints.py`, Lines 100–113 and Lines 150–164.
- **Verbatim Test Execution**:
  ```python
  client.get('/api/audio/*')
  # Response: Status 200 OK, Header: Content-Disposition: attachment; filename="000df1f7-4881-4c35-b35d-8ace39f41a34_stream_test.wav"
  client.post('/api/analyze/basic', json={'task_id': '*'})
  # Response: Status 200 OK, Content: {"task_id":"*","bpm":120.19,"tempo":120.19,"key":"G Major","time_signature":"4/4", ...}
  ```
- **Observed Behavior**: Using glob wildcards (`*`, `?`, `[0-9]*`) as `task_id` allows any user to stream or analyze arbitrary tracks uploaded by other users without knowing their UUID.

#### Finding 3 (HIGH): HTTP 500 Unhandled Server Crash on Upload Filenames with Path Separators
- **File**: `app/api/endpoints.py`, Lines 56–74.
- **Verbatim Test Execution**:
  ```python
  client.post('/api/upload', files={'file': ('subfolder/test.wav', b'RIFF1234WAVE', 'audio/wav')})
  # Response: Status 500 Internal Server Error
  # Detail: {"detail":"Failed to save audio file: [Errno 2] No such file or directory: 'storage\\\\3ddd0ff3-b5d2-46e6-9621-3bc7ded6ae23_subfolder\\\\test.wav'"}
  ```
- **Observed Behavior**: When an uploaded filename contains path separators (`/` or `\`), the application attempts to open a path inside a non-existent subdirectory inside `storage/`, raising `FileNotFoundError` which is caught by the generic handler and returned as HTTP 500 instead of being sanitized or returning HTTP 400.

---

## 2. Logic Chain

1. **Path Traversal Root Cause**:
   - In `app/api/endpoints.py` (lines 154-157):
     ```python
     if not matches:
         direct = STORAGE_DIR / task_id
         if direct.exists():
             target_path = direct
     ```
   - When `task_id = r"..\main.py"`, `STORAGE_DIR / task_id` evaluates to `Path("storage/..\\main.py")` which resolves to `main.py` in the root workspace.
   - `direct.exists()` returns `True`, and `FileResponse(path=str(target_path))` serves the file.
   - Conclusion: Missing path validation / containment check against `STORAGE_DIR.resolve()`.

2. **Glob Injection Root Cause**:
   - In `app/api/endpoints.py` (lines 100, 150):
     ```python
     pattern = str(STORAGE_DIR / f"{task_id}_*")
     matches = glob.glob(pattern)
     ```
   - `task_id` is interpolated directly into a `glob.glob()` pattern string.
   - When `task_id = "*"`, pattern becomes `storage/*_*`, matching all files in the directory.
   - Conclusion: `task_id` is treated as a glob pattern instead of an exact literal UUID.

3. **500 Crash on Upload Filename Root Cause**:
   - In `app/api/endpoints.py` (line 56):
     ```python
     safe_filename = f"{task_id}_{file.filename}"
     save_path = STORAGE_DIR / safe_filename
     ```
   - `file.filename` is not sanitized via `os.path.basename()` or `Path(file.filename).name`.
   - If `file.filename` contains slashes (from certain browsers or malicious payloads), `open(save_path, "wb")` throws `FileNotFoundError`, caught at line 70 and raised as HTTP 500.

4. **Successful Baseline Areas**:
   - Unsupported extensions (.exe, .pdf, .txt, etc.) are correctly rejected with HTTP 400.
   - 0-byte empty files are correctly rejected with HTTP 400.
   - Oversized files (>50MB) are correctly rejected with HTTP 422 during DSP processing.
   - Corrupted audio / random noise bytes are safely handled with HTTP 422 without 500 crashes.
   - Non-ASCII, Vietnamese Unicode, and Emoji filenames upload and analyze without encoding issues.
   - High concurrency (20 simultaneous uploads, 10 parallel DSP analyses) operates reliably without deadlocks or race conditions.

---

## 3. Caveats

- **OS Path Normalization**: The path traversal with backslashes (`..\`) was tested on Windows; on POSIX systems, web servers or ASGI frameworks may normalize forward slashes (`/`), but backslashes and URL-encoded variants may still bypass weak router filters if not strictly validated on the backend.
- **`file_path` Parameter in `/api/analyze/basic`**: `AnalysisRequest` accepts an optional `file_path`. Currently, it permits analyzing any valid audio file on the local filesystem. If this endpoint is exposed publicly in future milestones, `file_path` should be disabled or strictly restricted to an allowlist directory.

---

## 4. Conclusion

**Verdict**: **REQUEST_CHANGES**

The backend architecture and DSP engine are functional and pass basic feature/boundary suites, but fail critical adversarial security and robustness criteria:
1. **Critical**: Arbitrary file read / path traversal vulnerability in `GET /api/audio/{task_id}`.
2. **Critical**: Unauthorized audio retrieval & analysis via glob wildcard injection in `POST /api/analyze/basic` and `GET /api/audio/{task_id}`.
3. **High**: HTTP 500 server error on uploaded filenames containing folder paths or backslashes.

### Required Changes for Implementation Agents:
1. **Sanitize `task_id`**:
   - Enforce UUID validation (e.g. `uuid.UUID(task_id)` or regex `^[a-f0-9\-]{36}$`), OR
   - Escape glob characters using `glob.escape(task_id)`, AND
   - Verify that `Path(target_path).resolve().is_relative_to(STORAGE_DIR.resolve())` before serving.
2. **Sanitize Upload Filename**:
   - In `app/api/endpoints.py`, use `clean_filename = Path(file.filename).name` (or `os.path.basename(file.filename)`) before constructing `safe_filename`.

---

## 5. Verification Method

To independently verify these findings and reproduce the 9 failures:

1. **Run full adversarial test suite**:
   ```bash
   pytest -v tests/test_api_adversarial_challenger2.py
   ```
2. **Direct CLI Reproduction Commands**:
   ```bash
   # Test Path Traversal
   python -c "from fastapi.testclient import TestClient; from app.main import app; c = TestClient(app); r = c.get('/api/audio/..\main.py'); print('Status:', r.status_code, 'Content:', r.text[:60])"
   
   # Test Glob Wildcard Injection
   python -c "from fastapi.testclient import TestClient; from app.main import app; c = TestClient(app); r = c.get('/api/audio/*'); print('Status:', r.status_code, 'Header:', r.headers.get('content-disposition'))"
   
   # Test Upload Filename 500 Crash
   python -c "from fastapi.testclient import TestClient; from app.main import app; c = TestClient(app); r = c.post('/api/upload', files={'file': ('subfolder/test.wav', b'RIFF1234WAVE', 'audio/wav')}); print('Status:', r.status_code, 'Detail:', r.text)"
   ```
