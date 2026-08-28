# Project: AI Audio Lab 2026 (Phase 1)

## Architecture
- **Backend**: FastAPI modular application (`main.py`, `app/core/audio_utils.py`, `app/core/dsp_baseline.py`, `app/api/endpoints.py`, `app/api/schemas.py`, `storage/`).
- **DSP Engine**: Librosa + NumPy + SciPy audio pipeline. Features: 44.1kHz resampling, mono conversion, amplitude normalization, onset strength envelope, dynamic programming beat tracking (`librosa.beat.beat_track`), HPSS harmonic extraction, Chroma CQT, Krumhansl-Schmuckler 24-key estimation, beat-synchronous Triad chord template matching (12 Major, 12 Minor), and 4/4 vs 3/4 time signature autocorrelation.
- **Frontend**: Zero-bundler Dark Studio SPA served via FastAPI static files (`static/`). Uses TailwindCSS CDN v3, Wavesurfer.js 7.x, HTML5 Canvas 2D for high-precision Chord Timeline with 60 FPS real-time playhead tracking and active chord glow, overlaid Beat Grid, Music Telemetry Bar, and 4-Stem Mixer Preview (Vocals, Drums, Bass, Other) with volume faders, Solo, and Mute toggles.
- **E2E Testing**: Deterministic synthetic ground-truth audio generators (`tests/generators/synthetic_audio.py`), 4-tier opaque-box test suite (`tests/tier1_feature/`, `tests/tier2_boundary/`, `tests/tier3_combinatorial/`, `tests/tier4_scenarios/`), and automated test runner.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Audio Standardization & Normalization | Resample 44.1kHz mono, peak amplitude normalization (-0.45 dBFS), format checking | M1 | ORIGINAL_REQUEST § R1 |
| F2 | Beat & BPM Tracking | Onset envelope & DP beat tracking via `librosa.beat.beat_track` returning precise tempo and beat timestamps | M1 | ORIGINAL_REQUEST § R1 |
| F3 | Master Key Estimation | HPSS harmonic separation, Chroma CQT, Pearson correlation against Krumhansl-Kessler Major/Minor 24-key profiles | M1 | ORIGINAL_REQUEST § R1 |
| F4 | Triad Chord Recognition | Beat-synchronous median chroma aggregation and cosine similarity template matching against 24 Triads | M1 | ORIGINAL_REQUEST § R1 |
| F5 | Time Signature Estimation | Normalized autocorrelation of beat-synced onset envelope evaluating lag 3 vs lag 4 | M1 | ORIGINAL_REQUEST § R1 |
| F6 | File Upload API Endpoint | `POST /api/upload` accepting MP3, WAV, FLAC, M4A, OGG, generating UUID, saving to `storage/`, returning `task_id` & `audio_url` | M1 | ORIGINAL_REQUEST § R1 |
| F7 | Audio Analysis API Endpoint | `POST /api/analyze/basic` accepting `task_id`, executing DSP pipeline, returning standard JSON schema | M1 | ORIGINAL_REQUEST § R1 |
| F8 | SPA Static File Serving & Root Route | `GET /` and `/static/*` delivering the HTML5 studio application and static assets | M1 | ORIGINAL_REQUEST § R1 |
| F9 | Error Handling & Exceptions | Proper HTTP 400/422/404/500 responses for invalid formats, missing files, corrupted audio, and silence | M1 | ORIGINAL_REQUEST § R3 |
| F10 | Requirements & Run Script | `requirements.txt` listing all verified dependencies and startup configuration for `uvicorn main:app --reload` | M1 | ORIGINAL_REQUEST § R3 |
| F11 | Studio Look & Telemetry Header | Dark Studio theme with Obsidian/Neon accents, connection status badge, CPU/GPU processing indicator | M2 | ORIGINAL_REQUEST § R2 |
| F12 | Drag & Drop Audio Upload Zone | Drag & Drop box, file picker button, upload progress bar, and DSP analysis status indicator | M2 | ORIGINAL_REQUEST § R2 |
| F13 | Interactive Waveform Visualizer | Wavesurfer.js 7.x audio rendering, Play/Pause toggle, Spacebar keyboard shortcut, seek, zoom slider | M2 | ORIGINAL_REQUEST § R2 |
| F14 | Beat Grid Visual Overlay | Visual beat lines matching backend beat timestamps with prominent downbeats | M2 | ORIGINAL_REQUEST § R2 |
| F15 | Canvas API Chord Timeline | High-precision Canvas 2D rendering chord blocks synchronized with waveform, click-to-seek, and real-time glowing playhead highlight | M2 | ORIGINAL_REQUEST § R2 |
| F16 | Music Telemetry Bar | Visual badges displaying BPM, Master Key, Time Signature, and Audio Duration | M2 | ORIGINAL_REQUEST § R2 |
| F17 | 4-Stem Mixer Preview | 4 channels (Vocals, Drums, Bass, Other) with interactive volume faders, Solo buttons, and Mute buttons | M2 | ORIGINAL_REQUEST § R2 |
| F18 | Deterministic Synthetic Audio Generator | Generator creating mathematically exact test audio for ground-truth BPM, Keys, and Chords | E2E-TEST | ORIGINAL_REQUEST § AC |
| F19 | Tier 1 Feature Coverage Tests | ≥5 isolated tests per feature (BPM, Key, Chord, Upload, Analysis, Error handling) | E2E-TEST | ORIGINAL_REQUEST § AC |
| F20 | Tier 2 Boundary & Corner Tests | Edge cases: silence, tiny clips, extreme tempos (40 BPM, 240 BPM), noisy audio, corrupted formats | E2E-TEST | ORIGINAL_REQUEST § AC |
| F21 | Tier 3 Combinatorial Tests | Pairwise combinations of audio formats, tempos, keys, chords, and UI endpoints | E2E-TEST | ORIGINAL_REQUEST § AC |
| F22 | Tier 4 Real-World Scenario Tests | End-to-end full workflow tests (Upload -> Analyze -> Validate Schema -> UI DOM Verification) | E2E-TEST | ORIGINAL_REQUEST § AC |
| F23 | 100% E2E Test Suite Pass | Passing all automated test tiers (Tiers 1-4) | M3 | ORIGINAL_REQUEST § AC |
| F24 | Tier 5 Adversarial Hardening | White-box adversarial testing, stress testing, and edge case coverage | M3 | ORIGINAL_REQUEST § AC |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend & DSP Engine | `app/core/audio_utils.py`, `app/core/dsp_baseline.py`, `app/api/`, `main.py`, `requirements.txt` (F1-F10) | none | PLANNED |
| M2 | Frontend Interactive Studio | `static/index.html`, `static/js/app.js`, `static/js/chordTimeline.js`, `static/js/stemMixer.js`, `static/css/style.css` (F11-F17) | M1 | PLANNED |
| E2E-TEST | E2E Testing Suite | `tests/generators/`, `tests/tier1_feature/`, `tests/tier2_boundary/`, `tests/tier3_combinatorial/`, `tests/tier4_scenarios/`, `run_tests.py` (F18-F22) | none (parallel) | PLANNED |
| M3 | Final Integration & Hardening | Pass 100% E2E tests (Phase 1) + Adversarial Hardening Tier 5 (Phase 2) (F23-F24) | M1, M2, E2E-TEST | PLANNED |

## Interface Contracts
### Client ↔ `POST /api/upload`
- **Request**: Multipart Form Data with field `file: UploadFile`.
- **Response**: `200 OK`
  ```json
  {
    "task_id": "uuid-v4-string",
    "filename": "song.mp3",
    "audio_url": "/api/audio/{task_id}",
    "message": "File uploaded successfully"
  }
  ```
- **Errors**: `400 Bad Request` for unsupported formats or empty files; `422 Unprocessable Entity` for invalid parameters.

### Client ↔ `POST /api/analyze/basic`
- **Request**: JSON body `{"task_id": "uuid-v4-string"}`
- **Response**: `200 OK`
  ```json
  {
    "task_id": "uuid-v4-string",
    "bpm": 120.0,
    "key": "C Major",
    "time_signature": "4/4",
    "duration": 8.0,
    "beats": [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
    "chords": [
      {"start": 0.0, "end": 2.0, "chord": "C"},
      {"start": 2.0, "end": 4.0, "chord": "G"},
      {"start": 4.0, "end": 6.0, "chord": "Am"},
      {"start": 6.0, "end": 8.0, "chord": "F"}
    ]
  }
  ```
- **Errors**: `404 Not Found` if `task_id` does not exist; `422 Unprocessable Entity` if audio decoding fails.

### Client ↔ `GET /api/audio/{task_id}`
- **Response**: `200 OK` with `FileResponse` or `StreamingResponse` serving the audio file with proper `Content-Type` and `Accept-Ranges: bytes` for Wavesurfer seeking.

### Client ↔ `GET /`
- **Response**: `200 OK` serving `static/index.html`.

## Code Layout
```
reals audio lab/
├── app/
│   ├── __init__.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── audio_utils.py      # Audio loading, resampling (44.1kHz), mono, normalization
│   │   └── dsp_baseline.py     # BPM DP tracking, Master Key, Triad template matching
│   ├── api/
│   │   ├── __init__.py
│   │   ├── endpoints.py        # /api/upload, /api/analyze/basic, /api/audio/{task_id}
│   │   └── schemas.py          # Pydantic request/response models
│   └── main.py                 # FastAPI application, static mounting, CORS
├── storage/                    # Uploaded audio file directory (task UUID named)
├── static/
│   ├── index.html              # Studio SPA HTML
│   ├── css/
│   │   └── style.css           # Custom dark theme styles
│   └── js/
│       ├── app.js              # Main UI controller & API glue
│       ├── wavesurferController.js # Wavesurfer 7.x lifecycle & beat grid overlay
│       ├── chordTimeline.js    # Canvas 2D chord timeline renderer & playhead tracker
│       └── stemMixer.js        # 4-Stem preview mixer controller
├── tests/
│   ├── conftest.py
│   ├── generators/
│   │   ├── __init__.py
│   │   └── synthetic_audio.py  # Deterministic test audio generators
│   ├── tier1_feature/          # Feature tests (>=5 per feature)
│   ├── tier2_boundary/         # Edge cases & error handling tests
│   ├── tier3_combinatorial/    # Combinatorial tests
│   └── tier4_scenarios/        # End-to-end user scenario tests
├── requirements.txt            # Python dependencies
├── main.py                     # Root entrypoint redirecting to app.main
└── PROJECT.md                  # Project master plan
```
