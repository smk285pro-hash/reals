# AI Audio Lab 2026: 4-Tier Test Infrastructure Specification (`TEST_INFRA.md`)

## 1. Test Philosophy & Design Principles

The testing framework for **AI Audio Lab 2026** follows an **opaque-box, requirement-driven, deterministic verification methodology**.

### Core Tenets:
1. **Mathematical Ground-Truth Determinism**: Rather than relying on external, unverified, or copyrighted music files, all test audio is generated mathematically via pure tone synthesis, harmonic triad wave generation, and precise impulse click trains (`tests/generators/synthetic_audio.py`). This guarantees known ground-truth values for BPM, musical key, chord sequences, and time signatures.
2. **4-Tier Verification Hierarchy**:
   - **Tier 1: Feature Isolation Tests**: Verifies every isolated functional unit and interface contract (BPM, Key, Chord, Time Signature, Upload, Analyze, Audio Stream, SPA DOM).
   - **Tier 2: Boundary & Corner Cases**: Tests edge conditions including digital silence, extreme tempos (40 BPM, 240 BPM), extreme durations (0.5s to 60s), low SNR noise, zero-byte uploads, corrupted WAV headers, unsupported file extensions (.txt, .exe, .pdf), and non-existent task IDs.
   - **Tier 3: Combinatorial Pairwise Matrix**: Evaluates multi-dimensional parameter interactions (audio formats $\times$ tempos $\times$ keys $\times$ progressions).
   - **Tier 4: Real-World E2E Scenarios**: Exercises full end-to-end user journeys (Upload $\to$ Store $\to$ Stream with Range Requests $\to$ Analyze $\to$ Validate DSP Ground Truth $\to$ Inspect SPA HTML DOM).
3. **No Facade or Dummy Tests**: Every test exercises genuine DSP mathematical logic, HTTP requests, or schema validations. Tests are independent, idempotent, and self-cleaning.

---

## 2. Feature Inventory to Test Suite Mapping

| Feature # | Feature Name | Tier 1 Feature Tests | Tier 2 Boundary Tests | Tier 3 Combinatorial | Tier 4 Scenario |
|-----------|--------------|----------------------|-----------------------|----------------------|-----------------|
| **F1** | Audio Normalization & Standardization | `test_api_upload.py` | `test_corrupted_files.py`, `test_durations.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| **F2** | Beat & BPM Dynamic Tracking | `test_bpm_tracking.py` (6+ tests) | `test_extreme_tempos.py`, `test_durations.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| **F3** | Master Key Estimation (Krumhansl) | `test_key_estimation.py` (6+ tests) | `test_silence.py`, `test_noisy_audio.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| **F4** | Triad Chord Recognition (24 Triads) | `test_triad_chords.py` (6+ tests) | `test_silence.py`, `test_durations.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| **F5** | Time Signature Autocorrelation | `test_time_signature.py` (5+ tests) | `test_durations.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| **F6** | File Upload API (`POST /api/upload`) | `test_api_upload.py` (5+ tests) | `test_unsupported_formats.py`, `test_corrupted_files.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| **F7** | Audio Analysis API (`POST /api/analyze/basic`) | `test_api_analyze.py` (6+ tests) | `test_missing_task_id.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| **F8** | Audio Streaming API (`GET /api/audio/{id}`) | `test_api_audio_stream.py` (5+ tests) | `test_missing_task_id.py` | `test_pairwise_matrix.py` | `test_full_user_journey.py` |
| **F9** | Static SPA Serving (`GET /`) | `test_static_spa.py` (6+ tests) | `test_missing_task_id.py` | N/A | `test_full_user_journey.py` |
| **F10-F17** | Interactive Studio Web Visualizer Components | `test_static_spa.py` | N/A | N/A | `test_full_user_journey.py` |

---

## 3. Test Architecture & Directory Structure

```
tests/
├── __init__.py
├── conftest.py                       # Fixtures: TestClient, temporary storage, synthetic audio generators
├── generators/
│   ├── __init__.py
│   └── synthetic_audio.py            # Mathematical audio synthesizer (sine, triads, rhythm clicks, WAV encoding)
├── tier1_feature/                    # Tier 1: Isolated Feature & Contract Tests (>=5 tests per file)
│   ├── __init__.py
│   ├── test_bpm_tracking.py          # 60, 90, 120, 140, 180 BPM ground truth verification
│   ├── test_key_estimation.py        # C Maj, G Maj, D Maj, A Min, D Min, E Min ground truth
│   ├── test_triad_chords.py          # C Maj, A Min, C-G-Am-F, Dm-G-C-Am, E-B-C#m-A progressions
│   ├── test_time_signature.py        # 4/4 standard meter vs 3/4 waltz meter
│   ├── test_api_upload.py            # Upload endpoint, UUID v4 task_id, audio_url, storage persistence
│   ├── test_api_analyze.py           # Analyze endpoint schema, field types, and DSP output structure
│   ├── test_api_audio_stream.py      # Audio streaming, Content-Type, Accept-Ranges, 206 Partial Content
│   └── test_static_spa.py            # HTML DOM, Waveform, Beat Grid, Chord Canvas, Telemetry, 4-Stem Mixer
├── tier2_boundary/                   # Tier 2: Boundary, Corner & Adversarial Degradation Tests
│   ├── __init__.py
│   ├── test_silence.py               # Pure digital silence handling without ZeroDivisionError
│   ├── test_durations.py             # 0.5s subsecond clip to 60s long clip
│   ├── test_extreme_tempos.py        # 40 BPM ultra-slow and 240 BPM ultra-fast
│   ├── test_noisy_audio.py           # Low SNR audio mixed with white noise
│   ├── test_corrupted_files.py       # 0-byte file, truncated WAV headers, garbage binary payload
│   ├── test_unsupported_formats.py   # .txt, .pdf, .exe rejection (HTTP 400 Bad Request)
│   └── test_missing_task_id.py       # Non-existent task IDs return HTTP 404 Not Found
├── tier3_combinatorial/              # Tier 3: Multi-Dimensional Pairwise Matrix Tests
│   ├── __init__.py
│   └── test_pairwise_matrix.py       # Formats x Tempos x Keys x Progressions combinatorial matrix
├── tier4_scenarios/                  # Tier 4: Real-World End-to-End User Journeys
│   ├── __init__.py
│   └── test_full_user_journey.py     # Complete Upload -> Analyze -> Stream -> SPA DOM inspection workflow
├── pytest.ini                        # Pytest configuration, paths, and markers
└── run_tests.py                      # Standalone test runner with tier filtering CLI (--tier 1,2,3,4) & rich reports
```

---

## 4. Synthetic Audio Generator Specifications

The test suite incorporates a deterministic audio synthesizer in `tests/generators/synthetic_audio.py` that generates exact 16-bit PCM WAV streams in-memory:

1. **Fundamental Frequencies ($f_0$)**: Standard equal-temperament formula $f(n) = 440 \cdot 2^{\frac{n - 69}{12}}$ covering all 12 chromatic pitches across 5 octaves ($C_2$ to $B_6$).
2. **24 Harmonic Triads**:
   - **12 Major Triads**: Root ($0\text{ st}$), Major 3rd ($+4\text{ st}$), Perfect 5th ($+7\text{ st}$).
   - **12 Minor Triads**: Root ($0\text{ st}$), Minor 3rd ($+3\text{ st}$), Perfect 5th ($+7\text{ st}$).
3. **Percussive Impulse Clicks**: Exponentially decaying $1\text{ kHz}$ sinusoidal bursts ($20\text{ ms}$) placed at exact intervals $\Delta t = 60 / \text{BPM}$.
4. **Time Signature Accented Downbeats**: Emphasized downbeat pulses on beat 1 of each bar for 4/4 (period 4 beats) vs 3/4 (period 3 beats).
5. **Noisy Progression Synthesis**: Additive Gaussian white noise with controllable amplitude ratio.

---

## 5. Tier 4 Real-World Application Scenarios

The Tier 4 test suite simulates real-world user workflows in a professional audio laboratory:

### Scenario 1: Electronic Dance Music (EDM) Track Ingestion (128 BPM, 4/4, C Minor)
- User uploads `track_128bpm_cmin.wav`.
- The system parses metadata, generates a UUID task ID, and persists the payload.
- Client requests analysis $\to$ DSP engine extracts $128.0 \pm 2\text{ BPM}$, $4/4$ meter, and C Minor key.
- Visualizer streams audio using HTTP 206 Partial Content range requests and renders the chord canvas.

### Scenario 2: Acoustic Waltz Progression (90 BPM, 3/4, G Major)
- User uploads `waltz_90bpm_gmaj.wav`.
- DSP engine detects $90.0 \pm 2\text{ BPM}$, $3/4$ meter, and G Major tonal center.
- Frontend DOM contains 4-Stem mixer channel strips (Vocals, Drums, Bass, Other) and interactive fader controls.

---

## 6. Coverage & Quality Thresholds

| Metric | Target Threshold | Scope |
|--------|------------------|-------|
| **Tier 1 Feature Tests** | $\ge 5$ tests per feature file ($40+$ total) | Isolated unit & contract coverage |
| **Tier 2 Boundary Tests** | $7$ dedicated boundary suites ($15+$ tests) | Error handling & robustness |
| **Tier 3 Combinatorial** | Complete pairwise matrix coverage | Formats $\times$ Tempos $\times$ Keys |
| **Tier 4 Scenarios** | Full multi-step E2E journey | Complete pipeline integration |
| **Execution Pass Rate** | $100\%$ test pass rate | `python run_tests.py` |
| **DSP Accuracy Tolerance** | Tempo: $\pm 3\%$, Key: Tonic Match, Time Signature: 100% | Synthetic ground-truth tests |
