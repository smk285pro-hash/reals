# Original User Request

## 2026-08-30T10:45:57Z

<USER_REQUEST>
Audit and verify the RealS AI Audio Lab standalone FastAPI backend and REST API endpoints for seamless external integration with REAPER DAW (ReaScript Lua/Python).

Working directory: c:\Users\smk28\Desktop\reals media\reals\apps\stem-app\backend

## Requirements

### R1. Standalone Endpoint Readiness
All core Audio Lab features must expose clean, independent REST endpoints capable of being called directly from REAPER ReaScript (or curl / Python) without browser session dependencies:
- `POST /api/v1/analyze`: Synchronous Tempo (BPM), Key & Scale mode extraction.
- `POST /api/v1/chords`: Synchronous full chord progression + beat grid + downbeat array.
- `POST /api/v1/separate`: Asynchronous 2/4/6/8-stem separation with task polling (`GET /api/v1/jobs/{task_id}`).
- `POST /api/v1/denoise`: Asynchronous DeepFilterNet noise reduction with strength adjustment (0-100%).
- `GET /api/export/midi/{task_id}`: Multi-track SMF-1 MIDI export (Chords, Bassline, Metronome Click).
- `GET /api/export/stems-zip/{task_id}` & `GET /api/stems/{task_id}/{stem_name}`: Stem audio download.

### R2. Flexible Authentication & Local DAW Mode
The backend must support both cloud production authentication (`Authorization: Bearer <token>`) and offline/local development mode (`REALS_AUTH_DISABLED=true`) so REAPER scripts can run locally without cloud dependencies.

### R3. File Name & Extension Sanitization
Stem and audio retrieval endpoints must tolerate requests with or without `.wav` extensions (e.g. `/api/stems/{task_id}/vocals` and `/api/stems/{task_id}/vocals.wav`) without throwing regex 404 validation errors.

## Acceptance Criteria

### API Verification
- [ ] All endpoints return proper HTTP status codes (200, 202, 400, 404, 429).
- [ ] `POST /api/v1/analyze` and `POST /api/v1/chords` respond synchronously with valid JSON within expected latency thresholds.
- [ ] Asynchronous jobs (`separate`, `denoise`) emit proper status progression and output downloadable WAV/MIDI artifacts.
- [ ] `get_stem` accepts both `vocals` and `vocals.wav` safely.
- [ ] Local REAPER testing works out-of-the-box when `REALS_AUTH_DISABLED=true`.

</USER_REQUEST>
