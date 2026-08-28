## 2026-08-19T16:34:30Z

You are the Explorer for Milestone 1: Backend Architecture & DSP Baseline Engine for AI Audio Lab 2026.
Your working directory is: c:/Users/smk28/Desktop/reals audio lab/.agents/sub_orch_m1_explorer_1
(Create this directory if needed, store your progress.md, BRIEFING.md, blueprint.md, and handoff.md inside it).

Read the following reference files:
- c:/Users/smk28/Desktop/reals audio lab/.agents/ORIGINAL_REQUEST.md
- c:/Users/smk28/Desktop/reals audio lab/PROJECT.md
- c:/Users/smk28/Desktop/reals audio lab/.agents/explorer_1/analysis.md
- c:/Users/smk28/Desktop/reals audio lab/.agents/explorer_2/analysis.md
- c:/Users/smk28/Desktop/reals audio lab/.agents/sub_orch_m1/SCOPE.md

Your task:
Produce a comprehensive, line-by-line implementation blueprint and verification plan in `c:/Users/smk28/Desktop/reals audio lab/.agents/sub_orch_m1_explorer_1/blueprint.md` for:
1. `requirements.txt`: FastAPI, Uvicorn, python-multipart, librosa, soundfile, scipy, numpy, pydantic, pytest, httpx.
2. `app/core/audio_utils.py`:
   - SciPy 1.13.1 compatibility monkey-patch: `import scipy.signal; if not hasattr(scipy.signal, 'hann'): scipy.signal.hann = scipy.signal.windows.hann`.
   - `load_and_preprocess_audio(file_path: str, target_sr: int = 44100) -> tuple[np.ndarray, int, float]`: load with soundfile/librosa, convert to mono, resample to 44.1kHz, peak normalize to -0.45 dBFS (max amplitude approx 0.95), return `(y, sr, duration)`.
   - `validate_audio_file(file_path: str) -> bool`: check extension (.mp3, .wav, .flac, .m4a, .ogg) and basic header integrity.
3. `app/core/dsp_baseline.py`:
   - `estimate_key(chroma: np.ndarray) -> str`: Krumhansl-Schmuckler 24-key estimation with Major and Minor key profiles (Krumhansl & Kessler, 1982), normalized dot product / Pearson correlation across 12 pitch classes, returning Key name (e.g. "C Major", "A Minor").
   - `estimate_chords(y: np.ndarray, sr: int, beats: np.ndarray) -> list[dict]`:
     - Apply HPSS (`librosa.effects.hpss`) to separate harmonic component.
     - Compute Chroma CQT (`librosa.feature.chroma_cqt`) or STFT on harmonic component.
     - Synchronize chroma to beat intervals (`librosa.util.sync`).
     - Define 24 triad templates: 12 Major (root, major 3rd, perfect 5th) and 12 Minor (root, minor 3rd, perfect 5th).
     - Cosine similarity matching per beat frame to determine best chord.
     - Merge contiguous identical chord frames into segments `[{"start": round(start, 2), "end": round(end, 2), "chord": str}]`.
   - `estimate_time_signature(onset_env: np.ndarray, sr: int, beats: np.ndarray) -> str`: autocorrelation / pulse periodicity on onset envelope (4/4 vs 3/4).
   - `analyze_basic(audio_path: str) -> dict`:
     - Load audio via `audio_utils`.
     - Zero/silence check: if signal energy < threshold, return fallback (tempo=0, key="Unknown", chords=[], time_signature="4/4", duration=duration).
     - Extract onset envelope, run `librosa.beat.beat_track` for tempo and beat frames. Convert frames to timestamps.
     - Key estimation, chord estimation, time signature estimation.
     - Return complete dictionary matching API schema.
4. `app/api/schemas.py`: Pydantic models `UploadResponse` (`task_id`, `filename`, `message`, `audio_url`), `ChordSegment` (`start`, `end`, `chord`), `AnalysisResponse` (`task_id`, `tempo`, `key`, `time_signature`, `chords`, `duration`, `beats`).
5. `app/api/endpoints.py`:
   - `POST /api/upload`: save file with UUID task_id to `storage/{task_id}_{filename}`, return `UploadResponse`.
   - `POST /api/analyze/basic`: accept `task_id` or `file_path`, run `dsp_baseline.analyze_basic`, return `AnalysisResponse`.
   - `GET /api/audio/{task_id}`: serve raw audio file via `FileResponse`.
6. `app/main.py`: FastAPI app initialization, CORSMiddleware (allow all for local dev), static file mounting `/static` -> `static/`, API router prefix `/api`, and `GET /` serving SPA `static/index.html` or basic index.
7. `main.py`: Entrypoint with `uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)`.
8. `tests/test_milestone1.py`: Comprehensive test suite testing audio utils, dsp analysis with synthetic test tones (440Hz sine wave, C Major chord, silence), and FastAPI endpoint tests with `TestClient`.
