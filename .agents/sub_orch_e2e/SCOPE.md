# Scope: E2E Testing Track for AI Audio Lab 2026

## Architecture
The E2E Testing Track provides an opaque-box, requirement-driven 4-tier verification suite for AI Audio Lab 2026.
It utilizes deterministic synthetic audio generation based on exact mathematical frequencies and rhythmic impulse trains to test the DSP baseline engine and FastAPI endpoints without relying on external or copyrighted audio samples.

## Test Architecture & Modules
```
tests/
├── conftest.py                       # TestClient, fixture audio generators, temp dirs
├── generators/
│   ├── __init__.py
│   └── synthetic_audio.py            # Mathematical pure-tone, chord triad, and beat click wave generator
├── tier1_feature/                    # Tier 1: Isolated Feature Coverage (>=5 per feature)
│   ├── __init__.py
│   ├── test_bpm_tracking.py          # 5+ tempo tests (60, 90, 120, 140, 180 BPM)
│   ├── test_key_estimation.py        # 5+ key tests (C Maj, G Maj, D Maj, A Min, D Min, etc.)
│   ├── test_triad_chords.py          # 5+ chord tests (C, G, Am, F, Dm, Em triads)
│   ├── test_time_signature.py        # 4/4 vs 3/4 meter tests
│   ├── test_api_upload.py            # /api/upload endpoint feature tests
│   ├── test_api_analyze.py           # /api/analyze/basic endpoint feature tests
│   ├── test_api_audio_stream.py      # /api/audio/{task_id} streaming tests
│   └── test_static_spa.py            # GET / and static file serving tests
├── tier2_boundary/                   # Tier 2: Boundary & Corner Cases
│   ├── __init__.py
│   ├── test_silence.py               # Pure digital silence handling
│   ├── test_durations.py             # 0.5s short clip, 60s long clip
│   ├── test_extreme_tempos.py        # 40 BPM and 240 BPM extremes
│   ├── test_noisy_audio.py           # Audio mixed with white noise
│   ├── test_corrupted_files.py       # Truncated streams, corrupt headers
│   ├── test_unsupported_formats.py   # .txt, .pdf, .exe rejection
│   └── test_missing_task_id.py       # Non-existent task IDs
├── tier3_combinatorial/              # Tier 3: Pairwise Combinatorial Tests
│   ├── __init__.py
│   └── test_pairwise_matrix.py       # Formats (WAV, MP3, FLAC, OGG) x Tempos x Keys x Chords
├── tier4_scenarios/                  # Tier 4: Real-World Workload Scenarios
│   ├── __init__.py
│   └── test_full_user_journey.py     # Upload -> Analyze -> Telemetry Verify -> HTML DOM inspection
├── pytest.ini                        # Pytest configuration
└── run_tests.py                      # Standalone test runner script with tier filtering & reporting
```

## Feature Test Mapping
| Feature # | Feature Name | Tier 1 Tests | Tier 2 Boundary Tests | Tier 3 Combinatorial | Tier 4 Scenario |
|-----------|--------------|--------------|-----------------------|----------------------|-----------------|
| F1 | Audio Standardization | `test_api_upload.py` | `test_corrupted_files.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| F2 | Beat & BPM Tracking | `test_bpm_tracking.py` (5+) | `test_extreme_tempos.py`, `test_durations.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| F3 | Master Key Estimation | `test_key_estimation.py` (5+) | `test_silence.py`, `test_noisy_audio.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| F4 | Triad Chord Recognition | `test_triad_chords.py` (5+) | `test_silence.py`, `test_durations.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| F5 | Time Signature Estimation | `test_time_signature.py` (5+) | `test_durations.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| F6 | File Upload API Endpoint | `test_api_upload.py` (5+) | `test_unsupported_formats.py`, `test_corrupted_files.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| F7 | Audio Analysis API Endpoint | `test_api_analyze.py` (5+) | `test_missing_task_id.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| F8 | SPA Static File Serving | `test_static_spa.py` (5+) | `test_missing_task_id.py` | N/A | `test_full_user_journey.py` |
| F9 | Error Handling & Exceptions | `test_api_upload.py`, `test_api_analyze.py` | All Tier 2 tests | `test_pairwise_matrix.py` | `test_full_user_journey.py` |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E-1 | Synthetic Audio Generator & Test Harness | `tests/generators/synthetic_audio.py`, `tests/conftest.py`, `pytest.ini`, `TEST_INFRA.md` | none | IN_PROGRESS |
| E2E-2 | Tier 1 Feature Test Suite | `tests/tier1_feature/*.py` (BPM, Key, Chord, TimeSig, Upload, Analyze, Audio, Static) | E2E-1 | PLANNED |
| E2E-3 | Tier 2 Boundary & Corner Cases | `tests/tier2_boundary/*.py` (Silence, Durations, Extreme Tempos, Noise, Corrupt, Bad Formats) | E2E-1 | PLANNED |
| E2E-4 | Tier 3 Combinatorial & Tier 4 Scenarios | `tests/tier3_combinatorial/*.py`, `tests/tier4_scenarios/*.py`, `run_tests.py` | E2E-2, E2E-3 | PLANNED |
| E2E-5 | Review, Challenger & Forensic Audit | Reviewers, Challengers, and Forensic Auditor verification | E2E-1..4 | PLANNED |
| E2E-6 | Publish TEST_READY.md & Handoff | Generate `TEST_READY.md` and complete handoff to Project Orchestrator | E2E-5 | PLANNED |
