## 2026-08-19T16:35:02Z

You are Test Writer (test_writer_1) for AI Audio Lab 2026.
Your working directory: c:/Users/smk28/Desktop/reals audio lab/.agents/test_writer_1
Workspace root: c:/Users/smk28/Desktop/reals audio lab

MANDATORY READING:
- c:/Users/smk28/Desktop/reals audio lab/.agents/ORIGINAL_REQUEST.md
- c:/Users/smk28/Desktop/reals audio lab/PROJECT.md
- c:/Users/smk28/Desktop/reals audio lab/.agents/sub_orch_e2e/SCOPE.md
- c:/Users/smk28/Desktop/reals audio lab/.agents/explorer_2/analysis.md
- c:/Users/smk28/Desktop/reals audio lab/.agents/explorer_3/analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

TASK OBJECTIVE:
Build the complete, opaque-box, requirement-driven 4-tier E2E test suite and test infrastructure for AI Audio Lab 2026.

FILES TO CREATE:
1. `TEST_INFRA.md` at project root `c:/Users/smk28/Desktop/reals audio lab/TEST_INFRA.md` using the template in Project Pattern:
   - Include Test Philosophy, Feature Inventory mapping, Test Architecture, Real-World Application Scenarios (Tier 4), and Coverage Thresholds.
2. `tests/__init__.py` and `tests/conftest.py`:
   - Pytest fixtures for TestClient (targeting `app.main:app` with graceful mock/import handling if app is being built), temporary audio directories, synthetic audio helper fixtures.
3. `tests/generators/__init__.py` and `tests/generators/synthetic_audio.py`:
   - Deterministic mathematical audio wave synthesizer:
     - `generate_sine_wave(freq: float, duration: float, sr: int = 44100) -> np.ndarray`
     - `generate_triad_audio(chord_name: str, duration: float, sr: int = 44100) -> np.ndarray` (supporting all 12 Major and 12 Minor triads with standard pitch frequencies)
     - `generate_rhythm_clicks(bpm: float, duration: float, sr: int = 44100) -> np.ndarray` (rhythmic pulse for exact ground-truth BPM)
     - `generate_synthetic_wav(bpm: float = 120.0, chords: list = ["C", "G", "Am", "F"], bar_duration: float = 2.0, sr: int = 44100) -> bytes`
     - `generate_pure_silence(duration: float = 2.0, sr: int = 44100) -> bytes`
     - `generate_white_noise(duration: float = 2.0, noise_level: float = 0.1, sr: int = 44100) -> bytes`
     - `generate_noisy_progression(bpm: float = 120.0, chords: list = ["C", "G", "Am", "F"], noise_level: float = 0.05, bar_duration: float = 2.0, sr: int = 44100) -> bytes`
     - `generate_meter_audio(bpm: float = 120.0, meter: str = "4/4", bars: int = 4, sr: int = 44100) -> bytes`
4. `tests/tier1_feature/`:
   - `test_bpm_tracking.py` (>=5 tests: 60, 90, 120, 140, 180 BPM ground truth verification)
   - `test_key_estimation.py` (>=5 tests: C Major, G Major, D Major, A Minor, D Minor, E Minor ground truth verification)
   - `test_triad_chords.py` (>=5 tests: C Major Triad, A Minor Triad, C-G-Am-F progression, Dm-G-C-Am progression, E-B-C#m-A progression)
   - `test_time_signature.py` (>=5 tests: 4/4 meter vs 3/4 waltz meter with different tempos)
   - `test_api_upload.py` (>=5 tests: WAV upload, task_id UUID format, audio_url format, file saved on disk, multiple audio extensions)
   - `test_api_analyze.py` (>=5 tests: basic analyze endpoint schema verification, bpm float, key string, time_signature string, beats list, chords list)
   - `test_api_audio_stream.py` (>=5 tests: audio streaming endpoint /api/audio/{task_id}, content-type headers, range request support)
   - `test_static_spa.py` (>=5 tests: GET / and /static/* files, HTML DOM structure, title, waveform container, chord canvas, mixer faders, telemetry badges)
5. `tests/tier2_boundary/`:
   - `test_silence.py` (Pure digital silence handling)
   - `test_durations.py` (0.5s short clip, 60s long clip)
   - `test_extreme_tempos.py` (40 BPM ultra-slow, 240 BPM ultra-fast)
   - `test_noisy_audio.py` (Audio mixed with noise / low SNR)
   - `test_corrupted_files.py` (0-byte file, truncated WAV headers, garbage random payload)
   - `test_unsupported_formats.py` (.txt, .pdf, .exe format rejection)
   - `test_missing_task_id.py` (Non-existent task_id handling)
6. `tests/tier3_combinatorial/`:
   - `test_pairwise_matrix.py` (Combinations of audio formats x tempos x keys x chord progressions)
7. `tests/tier4_scenarios/`:
   - `test_full_user_journey.py` (Comprehensive end-to-end scenario: Upload -> Analyze -> Validate Schema -> Stream -> Verify SPA HTML & DOM)
8. `pytest.ini` and `run_tests.py`:
   - `pytest.ini` with standard config, test paths, markers.
   - `run_tests.py` with standalone execution capability, tier filtering CLI argument (`--tier 1,2,3,4`), execution summary report, and exit code 0 when tests pass.
