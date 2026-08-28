# Handoff Report — Explorer 3 (Frontend Architecture & E2E Testing)

**Author**: Explorer 3 (Frontend Architecture & E2E Testing Explorer)  
**Date**: 2026-08-19  
**Recipient**: Parent Orchestrator (1818e9a9-c7da-4503-b1b8-1cba5d8935d3)  
**Detailed Report**: `c:/Users/smk28/Desktop/reals audio lab/.agents/explorer_3/analysis.md`

---

## 1. Observation
- **Original Requirements**: Checked `c:/Users/smk28/Desktop/reals audio lab/.agents/ORIGINAL_REQUEST.md` lines 26-51:
  - R2 mandates Single-Page Application with Dark Studio Theme (TailwindCSS CDN), Header with device telemetry (CPU/GPU, connection), Drag & Drop upload zone with progress/analysis indicators, Interactive Waveform visualizer (Wavesurfer.js 7.x, Spacebar, seek, zoom, beat grid lines), Canvas API Chord Timeline (synchronized blocks, active chord highlight, playhead tracking), Music Telemetry Bar (BPM, Key, Time Signature, Duration), and 4-Stem Mixer Preview (Vocals, Drums, Bass, Other with volume faders, Solo, Mute).
  - Acceptance criteria mandate automated testing, DSP verification with ground truth, and comprehensive error handling.
- **GitNexus Codebase Intelligence**:
  - Queried GitNexus repository index (`ChordMiniApp-main`, `Reals Chord v1`, `Reals studio 2`).
  - Observed audio mixer and chord playback interfaces (`AudioMixerSettings` at `src/services/chord-playback/audioMixerService.ts:8-21`, `chordnet_ismir_naive.py`).
- **Workspace State**:
  - Workspace root `c:/Users/smk28/Desktop/reals audio lab/` currently contains only `.agents/` metadata. All frontend source files (`static/index.html`, `static/js/app.js`, `static/js/chordTimeline.js`, etc.) and test suites (`tests/tier1_feature/`, `tests/generators/synthetic_audio.py`, etc.) are to be built cleanly from scratch.

---

## 2. Logic Chain
1. **Frontend Architecture & Delivery**:
   - Because the user requirement specifies "không dùng bundler phức tạp, chạy trực tiếp" (zero-bundler SPA running directly), serving an HTML5 SPA from FastAPI via static files (`app.mount("/static", ...)` and root route `GET /`) with TailwindCSS CDN v3 and Wavesurfer 7.x CDN satisfies all deployment constraints without Node build overhead.
2. **Visualizer & Canvas Synchronization**:
   - Wavesurfer 7.x handles audio playback, zooming, seeking, and high-quality waveform rendering.
   - A dedicated `<canvas id="chord-timeline-canvas">` directly below the waveform utilizes pixel ratio scaling (`devicePixelRatio`) and maps time coordinates $t \in [0, \text{duration}]$ to canvas pixel $x = \left(\frac{t}{\text{duration}}\right) \times \text{width}$.
   - The active chord highlight and vertical playhead are updated at 60 FPS via Wavesurfer's `timeupdate` event and `requestAnimationFrame`.
   - Click events on the chord canvas map canvas $x \to t \to \text{wavesurfer.seekTo}(t / \text{duration})$ for bi-directional synchronization.
3. **Beat Grid Overlay**:
   - An overlaid transparent canvas on top of `#waveform` renders beat timestamps from `analysisResult.beats` (bright gold downbeats every 4 beats, dashed amber sub-beats) synchronized with Wavesurfer zoom and scroll factors.
4. **4-Stem Mixer Architecture**:
   - 4 channel strips (Vocals, Drums, Bass, Other) with volume sliders, Solo (exclusive or multi-solo), and Mute toggles.
   - Uses Web Audio API Gain nodes to control audio attenuation smoothly.
5. **E2E Testing & Synthetic Ground-Truth Strategy**:
   - Relying on external audio files in tests creates fragile tests and licensing issues.
   - Designing `tests/generators/synthetic_audio.py` using `numpy` and `scipy.io.wavfile` produces deterministic in-memory WAV audio with mathematically known BPM (e.g. 120.0 BPM rhythmic impulse clicks) and harmonic triads (C Major, G Major, A Minor, F Major).
   - Designing a 4-Tier Test Matrix guarantees complete coverage across Feature, Boundary, Combinatorial, and Stress dimensions.

---

## 3. Caveats
- **Browser Audio Autoplay Policies**: Modern web browsers require user interaction (e.g. clicking the Play button or Dropzone) before starting `AudioContext`. The SPA must initialize or resume `AudioContext` on first user gesture.
- **Stem Audio Previewing in Phase 1**: In Phase 1, the backend DSP baseline focuses on single-track analysis. The 4-Stem Mixer preview operates on the master audio track with simulated gain/filtering per channel until multi-stem separation (Phase 2) is hooked up.

---

## 4. Conclusion
The Frontend Studio Architecture and E2E Testing Architecture are fully analyzed, mapped, and specified:
1. **Frontend Architecture**: Ready for direct implementation with Dark Studio obsidian theme, Wavesurfer 7.x waveform engine, high-precision Canvas 2D chord timeline with active glowing highlight, music telemetry bar, and 4-stem mixer.
2. **E2E Testing Architecture**: Complete 4-tier test architecture designed with deterministic synthetic ground-truth audio generation and automated contract/DOM verification suites.
3. Complete implementation blueprints, HTML/JS code templates, and test matrices are published in `c:/Users/smk28/Desktop/reals audio lab/.agents/explorer_3/analysis.md`.

---

## 5. Verification Method
1. **Analysis Verification**:
   - Inspect `c:/Users/smk28/Desktop/reals audio lab/.agents/explorer_3/analysis.md` to verify all required UI components and E2E test tiers are specified with exact signatures and DOM IDs.
2. **Implementation & Test Verification**:
   - Once workers implement the backend and static assets:
     - Run `pytest -v tests/` to execute all 4 test tiers.
     - Launch `uvicorn app.main:app --port 8000` and verify the SPA at `http://localhost:8000`.
     - Inspect DOM elements `#waveform`, `#beat-grid-canvas`, `#chord-timeline-canvas`, `#telemetry-bar`, `#stem-mixer`.
