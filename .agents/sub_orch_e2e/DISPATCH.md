# Dispatch Instructions

## 2026-08-19T16:34:09Z

Scope of E2E Testing Track:
- Create `TEST_INFRA.md` at project root based on the template in Project Pattern.
- Build the comprehensive, opaque-box, requirement-driven 4-tier E2E test suite:
  1. `tests/generators/synthetic_audio.py`: Deterministic synthetic WAV generator producing mathematically exact audio for ground-truth BPM (e.g. 60, 90, 120, 140, 180 BPM), Key profiles (C Major, G Major, A Minor, D Minor, etc.), and Triad chord progressions (e.g., C-G-Am-F, Dm-G-C).
  2. `tests/tier1_feature/`: >=5 isolated feature tests per feature (BPM tracking, Key estimation, Triad chord recognition, Time signature, `/api/upload`, `/api/analyze/basic`, audio streaming, static file serving).
  3. `tests/tier2_boundary/`: >=5 boundary/corner tests (silence, 0.5s short clip, 60s long clip, 40 BPM vs 240 BPM extremes, noisy audio, corrupted audio file, unsupported format, missing task_id).
  4. `tests/tier3_combinatorial/`: Pairwise combinations of formats (WAV, MP3, FLAC, OGG) x tempos x keys x chord progressions.
  5. `tests/tier4_scenarios/`: Real-world end-to-end workload tests (Complete user journey: Upload -> Async/Sync Analyze -> Verify Full JSON Telemetry -> Validate UI static files & HTML structure).
  6. `run_tests.py` / `pytest.ini`: Unified test runner.
- Create and publish `TEST_READY.md` at project root with the full test runner command and coverage summary.

Orchestrator Protocol:
1. Maintain your own BRIEFING.md, progress.md, and SCOPE.md in c:/Users/smk28/Desktop/reals audio lab/.agents/sub_orch_e2e.
2. Execute the Iteration Loop with Test Writers (`teamwork_preview_test_writer` / `teamwork_preview_worker`), Reviewers, Challengers, and Forensic Auditor.
3. Verify that all test cases execute and validate against expected contracts.
4. Publish `TEST_READY.md` at project root, write handoff.md in c:/Users/smk28/Desktop/reals audio lab/.agents/sub_orch_e2e/handoff.md, and send completion message back to parent.
