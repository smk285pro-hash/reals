# AI Audio Lab 2026 — Codebase & Runtime Environment Analysis

**Author:** Explorer 1 (Codebase & Runtime Environment Explorer)  
**Date:** 2026-08-19  
**Working Directory:** `c:/Users/smk28/Desktop/reals audio lab/.agents/explorer_1`  
**Workspace Root:** `c:/Users/smk28/Desktop/reals audio lab`  

---

## 1. Executive Summary

AI Audio Lab 2026 (Phase 1) is a complete full-stack web application designed for audio feature extraction (BPM, Key estimation, Triad chord recognition) and real-time interactive audio visualization (Wavesurfer waveform, beat grid lines, canvas chord blocks with playhead tracking, telemetry display, and 4-stem mixer preview).

This investigation conducted a comprehensive analysis of the existing workspace, Python runtime, audio DSP library stack, dependencies, and architectural requirements. All critical runtime quirks (notably SciPy 1.13 compatibility with Librosa 0.10.1 and FastAPI multipart requirements) were identified and verified with working code.

---

## 2. Workspace & Environment Audit

### 2.1 Workspace Status
- **Root Path:** `c:/Users/smk28/Desktop/reals audio lab`
- **Initial Files:** Clean directory containing only `.agents/` metadata directory.
- **Git Status:** Git repository not yet initialized.

### 2.2 Python Runtime & Interpreter
- **Active Python Executable:** `C:\Users\smk28\AppData\Local\Programs\Python\Python310\python.exe`
- **Python Version:** `3.10.11` (64-bit AMD64)
- **Secondary Installed Python:** `Python 3.12` available in WindowsApps.
- **Operating System:** Windows 10/11 x64 (PowerShell environment).

### 2.3 Package Audit & Verification

| Package | Installed Version | Status | Verified Functionality |
|---|---|---|---|
| `fastapi` | `0.137.2` | Available | App routing, ASGI application creation, dependency injection |
| `uvicorn` | `0.49.0` | Available | ASGI high-performance server |
| `pydantic` | `2.12.5` | Available | Pydantic V2 schema validation and JSON serialization |
| `librosa` | `0.10.1` | Available | DSP feature extraction, beat tracking, Chroma CQT/STFT |
| `numpy` | `1.26.4` | Available | Fast array operations, correlation matrices, vector norms |
| `scipy` | `1.13.1` | Available | Signal processing (requires Hann window compatibility patch) |
| `soundfile` | `0.12.1` | Available | Audio decoding/encoding via libsndfile (WAV, MP3, FLAC, OGG) |
| `soxr` | `0.5.0.post1` | Available | Fast resampling backend for librosa |
| `httpx` | `0.28.1` | Available | Async HTTP client & FastAPI TestClient support |
| `pytest` | `9.1.0` | Available | Test runner for unit & integration testing |
| `python-multipart` | `0.0.32` | **Newly Installed** | Multipart form data and `UploadFile` processing |

### 2.4 FFmpeg & Audio Decoding Capabilities
- System `where.exe ffmpeg` check confirmed `ffmpeg.exe` is not currently in system PATH.
- `soundfile 0.12.1` bundles `libsndfile` which provides native decoding for:
  - **WAV** (Microsoft PCM/Float)
  - **MP3** (MPEG-1/2 Audio)
  - **FLAC** (Free Lossless Audio Codec)
  - **OGG** (OGG Vorbis container)
  - **AIFF / CAF / RAW**
- All required Phase 1 audio formats (MP3, WAV, FLAC, OGG) are natively supported by `soundfile` and `librosa` without needing system-level FFmpeg binaries.

---

## 3. Critical Runtime Insights & Fixes

### 3.1 SciPy 1.13.x Window Function Deprecation
- **Problem:** When calling `librosa.beat.beat_track(y, sr)`, Librosa 0.10.1 executes `__trim_beats` which invokes `scipy.signal.hann(5)`. In SciPy 1.13+, `scipy.signal.hann` was relocated to `scipy.signal.windows.hann`, triggering:
  `AttributeError: module 'scipy.signal' has no attribute 'hann'`.
- **Solution:** Inject the compatibility patch in `app/core/audio_utils.py` and `app/core/dsp_baseline.py` before any Librosa DSP functions execute:
  ```python
  import scipy.signal
  import scipy.signal.windows
  if not hasattr(scipy.signal, 'hann'):
      scipy.signal.hann = scipy.signal.windows.hann
  ```
- **Verification:** Tested with synthetic pulsed audio; tempo (120.18 BPM) and beat timestamps were tracked accurately with zero errors.

### 3.2 FastAPI UploadFile Multipart Requirement
- **Problem:** FastAPI routes declaring `file: UploadFile = File(...)` throw `RuntimeError: Form data requires "python-multipart" to be installed.` if `python-multipart` is absent.
- **Solution:** Installed `python-multipart` and added to `requirements.txt`.
- **Verification:** Verified via `TestClient` multipart POST request returning HTTP 200.

---

## 4. Backend Architecture & Engine Design

### 4.1 Recommended Project Directory Structure

```
c:/Users/smk28/Desktop/reals audio lab/
├── app/
│   ├── __init__.py
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes.py          # API route definitions (/upload, /analyze/basic, /audio/{task_id})
│   │   └── schemas.py         # Pydantic models for request/response validation
│   └── core/
│       ├── __init__.py
│       ├── config.py          # Global settings, upload directory, allowed extensions
│       ├── audio_utils.py     # Resampling, stereo-to-mono, normalization, validation
│       └── dsp_baseline.py    # BPM/Beat tracking, Key estimation, Chord recognition
├── static/
│   ├── index.html             # Studio Dark UI SPA (Vanilla JS + Tailwind CSS)
│   ├── css/
│   │   └── styles.css         # Dark theme custom styles, animations, canvas layout
│   └── js/
│       ├── app.js             # Main frontend controller & orchestrator
│       ├── visualizer.js      # Wavesurfer 7.x wrapper & Beat Grid overlay
│       ├── chord_canvas.js    # Canvas API real-time chord blocks & playhead tracker
│       └── mixer.js           # 4-Stem mixer simulation (Vocals, Drums, Bass, Other)
├── storage/
│   ├── .gitkeep
│   └── uploads/               # Uploaded audio files indexed by UUID
├── tests/
│   ├── __init__.py
│   ├── test_audio_utils.py    # Unit tests for audio preprocessing
│   ├── test_dsp_baseline.py   # Unit tests for DSP algorithms
│   └── test_api.py            # Integration tests for FastAPI endpoints
├── main.py                    # App entry point, CORS, StaticFiles mount
├── requirements.txt           # Pinned production dependencies
└── README.md                  # Project documentation & run guide
```

### 4.2 DSP Engine Algorithms

#### A. Preprocessing (`audio_utils.py`)
1. **Validation:** Check file extension against `['.mp3', '.wav', '.flac', '.ogg', '.m4a']` and file size limit (50 MB).
2. **Audio Loading & Resampling:** Load audio via `soundfile` or `librosa.load(audio_path, sr=44100, mono=True)`.
3. **Stereo to Mono:** If multi-channel, average channels: `y = np.mean(y, axis=0)`.
4. **Amplitude Normalization:** Scale peak amplitude to 0.95: `y = (y / (np.max(np.abs(y)) + 1e-8)) * 0.95`.

#### B. BPM & Beat Timestamps (`dsp_baseline.py`)
1. Compute onset strength envelope:
   `onset_env = librosa.onset.onset_strength(y=y, sr=sr, aggregate=np.median)`
2. Run dynamic programming beat tracker:
   `tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, tightness=100)`
3. Convert frames to timestamp seconds:
   `beats = librosa.frames_to_time(beat_frames, sr=sr).tolist()`
4. If tempo is an array (in some librosa versions), extract scalar `float(tempo)`.

#### C. Master Key Estimation (Krumhansl-Schmuckler Algorithm)
1. Extract Chroma CQT: `chroma = librosa.feature.chroma_cqt(y=y, sr=sr)`
2. Calculate time-averaged pitch distribution (12 pitch classes C through B): `mean_chroma = np.mean(chroma, axis=1)`
3. Correlate with standard Krumhansl-Kessler Major profile `[6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]` and Minor profile `[6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]` across all 12 circular shifts.
4. Select the key with maximum Pearson correlation coefficient `r`.

#### D. Triad Chord Recognition (Template Matching)
1. Construct 24 template vectors of length 12:
   - **Major Triad (root $i$):** $i$, $(i+4)\%12$, $(i+7)\%12 = 1.0$ (normalized)
   - **Minor Triad (root $i$):** $i$, $(i+3)\%12$, $(i+7)\%12 = 1.0$ (normalized)
2. Segment audio based on beat timestamps `[beats[i], beats[i+1]]` (or fixed 0.5s windows for unvoiced/intro sections).
3. For each window, compute the window mean chroma vector, normalize, and calculate cosine similarity `np.dot(template_matrix, segment_chroma)`.
4. Pick argmax chord name (e.g. `C`, `Am`, `G`, `Em`, `F`).
5. Merge adjacent consecutive windows with identical chords into merged time intervals `[{"start": float, "end": float, "chord": str}]`.

### 4.3 API Endpoints & Schemas

| Endpoint | Method | Input | Output | Description |
|---|---|---|---|---|
| `/` | `GET` | None | HTML (SPA) | Serves the frontend web studio |
| `/api/upload` | `POST` | `multipart/form-data` (`file`) | `{"task_id": str, "audio_url": str, "filename": str}` | Saves audio file to `storage/uploads/` |
| `/api/analyze/basic` | `POST` | `{"task_id": str}` | `BasicAnalysisResponse` | Runs DSP pipeline and returns BPM, Key, Beats, Chords |
| `/storage/uploads/{file_name}` | `GET` | Path param | Audio stream (Binary) | Serves audio for Wavesurfer playback |

**JSON Schema for `/api/analyze/basic` Response:**
```json
{
  "task_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "bpm": 120.0,
  "key": "C Major",
  "time_signature": "4/4",
  "beats": [0.058, 0.511, 1.01, 1.509, 2.009, 2.519, 3.019],
  "chords": [
    {"start": 0.0, "end": 2.0, "chord": "C"},
    {"start": 2.0, "end": 4.0, "chord": "Am"}
  ]
}
```

---

## 5. Requirements.txt Specification

```text
fastapi>=0.110.0,<1.0.0
uvicorn[standard]>=0.28.0
pydantic>=2.6.0,<3.0.0
python-multipart>=0.0.9
librosa>=0.10.1
soundfile>=0.12.1
numpy>=1.24.0,<2.0.0
scipy>=1.12.0
soxr>=0.3.7
httpx>=0.27.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
```

---

## 6. Recommendations for Downstream Agents

1. **Backend Implementer:**
   - Include the `scipy.signal.hann = scipy.signal.windows.hann` patch at the very top of `audio_utils.py` and `dsp_baseline.py`.
   - Ensure `storage/uploads` directory is automatically created on startup in `main.py` using `os.makedirs("storage/uploads", exist_ok=True)`.
   - Add proper HTTP exception handling: 400 for invalid file extensions, 404 for missing task IDs, 422 for corrupt audio bytes.
2. **Frontend Implementer:**
   - Use Wavesurfer.js 7.x loaded via CDN (unpkg/cdnjs) to avoid bundling requirements.
   - Use HTML5 Canvas API for the Chord Timeline Canvas, synchronizing rendering on Wavesurfer's `timeupdate` / `audioprocess` events.
   - Ensure the 4-Stem mixer UI includes volume sliders (0-100%), Solo, and Mute state handlers.
3. **Tester & QA Agent:**
   - Create synthetic test audio fixtures (WAV, MP3) in test suite to verify full integration without requiring external audio asset downloads.
