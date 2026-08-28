# Scope: Milestone 1 - Backend Architecture & DSP Baseline Engine

## Architecture
- FastAPI application entrypoint and routing.
- Audio utilities for format validation, 44.1kHz resampling, normalization, and SciPy compatibility patching.
- DSP Baseline analysis: librosa beat tracking, Krumhansl-Schmuckler key estimation (Major/Minor), beat-synchronous Triad chord template matching (24 chords) with segment merging, time signature estimation, and silence handling.
- API endpoints for upload, basic analysis, and audio retrieval.
- Storage folder management.

## Deliverables & Code Boundaries
1. `requirements.txt`
2. `app/core/audio_utils.py`
3. `app/core/dsp_baseline.py`
4. `app/api/schemas.py`
5. `app/api/endpoints.py`
6. `app/main.py`
7. `main.py`
8. `storage/`
9. `tests/test_milestone1.py` (unit & integration verification test suite)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Backend & DSP Baseline | FastAPI, Audio Utils, DSP Baseline, API Schemas & Endpoints, Tests | none | IN_PROGRESS |

## Interface Contracts
### Audio Processing Pipeline
- `audio_utils.load_and_preprocess_audio(file_path: str) -> tuple[np.ndarray, int, float]`
- `dsp_baseline.analyze_basic(audio_path: str) -> dict`
  - Returns dict conforming to `AnalysisResponse` schema:
    - `tempo`: float (BPM)
    - `key`: str (e.g. "C Major", "A Minor")
    - `time_signature`: str ("4/4", "3/4")
    - `chords`: list of `{"start": float, "end": float, "chord": str}`
    - `duration`: float (seconds)
    - `beats`: list of float timestamps
