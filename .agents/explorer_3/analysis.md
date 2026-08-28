# AI Audio Lab 2026: Frontend Architecture & E2E Testing Architecture Analysis

**Author**: Explorer 3 (Frontend Architecture & E2E Testing Explorer)  
**Date**: 2026-08-19  
**Status**: Completed  
**Target Project**: AI Audio Lab 2026 (Phase 1)  
**Scope**: Frontend Studio Single-Page Application (SPA), Wavesurfer 7.x, Canvas Chord Timeline, Stem Mixer, and Complete 4-Tier E2E Testing Framework.

---

## 1. Executive Summary

AI Audio Lab 2026 Phase 1 requires an interactive, high-performance web audio studio paired with an end-to-end testing and verification architecture. The goal is to provide instantaneous visual feedback for audio feature extraction (BPM, Key, Beat Timestamps, and Chord Progressions) and an intuitive DAW-style interface (Waveform visualizer with beat grid overlay, synchronized canvas chord timeline, telemetry metrics, and a 4-stem mixer preview).

This document details:
1. **Frontend Studio Architecture**: Zero-bundler CDN-based Single Page Application (HTML5, TailwindCSS CDN, Wavesurfer.js 7.x, Canvas 2D API, Web Audio API) with a Dark Studio theme.
2. **Interactive Audio Components**:
   - Header with dynamic device/GPU/CPU telemetry and backend connection state.
   - Drag & Drop Audio Upload Zone with file validation, upload progress, and analysis state stepper.
   - Wavesurfer.js 7.x Waveform Visualizer with transport controls, spacebar shortcut, zoom slider, and beat grid lines overlay.
   - High-performance Canvas API Chord Timeline with synchronized time-to-pixel mapping, major/minor color palettes, real-time playhead tracking, glowing active chord highlights, and click-to-seek navigation.
   - Music Telemetry Bar with animated BPM metronome pulse, Master Key Camelot badges, Time Signature indicator, and Duration counters.
   - 4-Stem Mixer Preview (Vocals, Drums, Bass, Other) with volume faders, Solo/Mute logic, and peak level indicators.
3. **E2E Testing & Verification Architecture**:
   - Ground-truth Synthetic Audio Generator using `numpy`/`scipy` to synthesize mathematically precise beat tracks, pure chord triads, and multi-chord progressions.
   - Comprehensive 4-Tier Test Suite (`pytest`, `httpx`, `fastapi.testclient.TestClient`, DOM parser) covering Feature, Boundary, Combinatorial, and Stress testing.

---

## 2. Frontend Studio Architecture

### 2.1 Technology Stack & Zero-Bundler Strategy
To ensure maximum ease of deployment and instant startup without complex Node/Webpack/Vite toolchains, the frontend is built as a modular vanilla JavaScript / HTML5 SPA served directly by FastAPI.

- **Styling**: TailwindCSS 3.x via CDN (`<script src="https://cdn.tailwindcss.com"></script>`).
- **Icons**: Lucide Icons CDN (`<script src="https://unpkg.com/lucide@latest"></script>`).
- **Waveform Engine**: Wavesurfer.js 7.x ESM/UMD (`<script src="https://unpkg.com/wavesurfer.js@7"></script>`).
- **Canvas Rendering**: Native HTML5 Canvas 2D Context with `window.devicePixelRatio` scaling.
- **Audio Routing**: Web Audio API (`AudioContext`, `GainNode`, `AnalyserNode`, `BiquadFilterNode`).

### 2.2 Design System: "Dark Obsidian Studio" Theme
The UI adopts a DAW aesthetic (Ableton / FL Studio / Logic Pro dark mode inspiration):
- **Backgrounds**: Deep Obsidian `#0a0e17` and Slate Black `#0f172a`.
- **Card Panels**: Glassmorphism `#131b2e` with subtle borders `rgba(255, 255, 255, 0.08)`.
- **Accent Palette**:
  - Cyan (`#06b6d4` / `#22d3ee`): Primary actions, transport controls, waveform progress, Major chords.
  - Violet / Purple (`#8b5cf6` / `#a855f7`): Minor chords, Bass stem, harmonic telemetry.
  - Gold / Amber (`#eab308` / `#f59e0b`): Beat grid lines, Drums stem, tempo metronome pulse.
  - Rose / Pink (`#f43f5e` / `#ec4899`): Playhead cursor, Vocals stem, recording/error alerts.
  - Emerald (`#10b981`): Connection active, DSP engine ready.
- **Typography**: Clean modern sans-serif (`Inter`, `system-ui`) for UI labels, monospace (`JetBrains Mono`, `ui-monospace`) for timestamps, BPM, and technical telemetry.

```javascript
// Tailwind Custom Configuration in HTML head
tailwind.config = {
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#0a0e17',
          surface: '#111827',
          panel: '#161f38',
          border: 'rgba(255, 255, 255, 0.08)',
          cyan: '#06b6d4',
          purple: '#8b5cf6',
          gold: '#eab308',
          rose: '#f43f5e',
          emerald: '#10b981'
        }
      }
    }
  }
}
```

---

## 3. Detailed Frontend Component Specifications

### 3.1 Component 1: Studio Header & Hardware Telemetry
- **Branding**: "AI AUDIO LAB 2026" with gradient typography and a glowing "STUDIO EDITION" badge.
- **Live Device Telemetry Bar**:
  - **Backend Status**: Live indicator badge (Green pulsing dot `● ONLINE` when FastAPI responds, Red `● OFFLINE` on disconnect).
  - **DSP Engine**: "Librosa 0.10+ Accelerated / 44.1kHz 32-bit Float".
  - **Client Hardware**: Web Audio API & WebGL status detection (e.g. `AudioContext 48kHz Active`).
  - **Session Task ID**: Displays current active task UUID with one-click copy button.

### 3.2 Component 2: Drag & Drop Audio Upload Zone & Analysis Stepper
- **Dropzone Area**:
  - Interactive drop area with dashed border, animated floating upload icon, and supported format tags (`.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`).
  - Visual feedback on `dragover` / `dragleave` / `drop` (cyan border glow, background tint shift).
  - Fallback `<input type="file" id="audio-file-input">` button.
  - **Quick Demo Button**: "⚡ Load Demo Audio (120 BPM Synth Track)" generating or loading an instant synthetic audio sample for immediate testing.
- **Multi-Stage Progress Stepper**:
  - Visual progress bar (0% - 100%) during upload using `XMLHttpRequest.upload.onprogress`.
  - Multi-step status indicator:
    1. `[✓] Uploading Audio Payload` (File transfer)
    2. `[✓] Decoding & Normalizing Audio` (44.1kHz Resample & Mono conversion)
    3. `[✓] Beat Tracking & Tempo Extraction` (Librosa DP Beat Tracking)
    4. `[✓] Harmonic & Key Correlation` (Chroma STFT / Krumhansl-Schmuckler)
    5. `[✓] Chord Triad Recognition` (Segment Template Matching)
    6. `[✓] Studio Ready!` (Visualizer initialization)

### 3.3 Component 3: Interactive Waveform Visualizer (Wavesurfer.js 7.x)
- **Configuration**:
  ```javascript
  const wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#334155',
    progressColor: '#06b6d4',
    cursorColor: '#f43f5e',
    cursorWidth: 2,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    height: 120,
    normalize: true,
    backend: 'WebAudio'
  });
  ```
- **Transport Controls**:
  - Play / Pause button toggling icons (`play` / `pause`) and updating button color.
  - Global `Spacebar` listener (`e.code === 'Space'`) to toggle playback seamlessly.
  - Seek bar and time display (`#current-time` / `#total-duration`) formatted as `MM:SS.ss`.
  - Zoom slider (`#zoom-slider`, range 10 to 200 px/sec) updating `wavesurfer.zoom(pxPerSec)`.
  - Master volume slider and mute toggle.
- **Beat Grid Lines Overlay Engine**:
  - An overlay canvas (`#beat-grid-canvas`) positioned directly over the waveform container.
  - On wavesurfer `ready`, `zoom`, `scroll`, and `redraw`, calculate x-coordinates for every beat timestamp:
    $$\text{x} = \left(\frac{\text{beatTimestamp}}{\text{duration}}\right) \times \text{waveformWidth}$$
  - **Downbeat / Bar Markers** (every 4th beat in 4/4): Solid bright gold vertical line (`rgba(234, 179, 8, 0.85)`), width 2px, with bar numbers ("1.1", "2.1", "3.1").
  - **Sub-beats**: Dashed semi-transparent gold line (`rgba(234, 179, 8, 0.4)`), width 1px (`setLineDash([3, 3])`).

### 3.4 Component 4: Canvas API Chord Timeline & Real-Time Playhead
- **Canvas Implementation**:
  - Dedicated `<canvas id="chord-canvas">` directly under the waveform.
  - High-DPI support:
    ```javascript
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ```
- **Chord Segmentation & Coloring**:
  - Major Chords (`C`, `G`, `F`, `D`, etc.): Blue/Cyan gradient theme (`rgba(6, 182, 212, 0.25)` fill, `#06b6d4` border).
  - Minor Chords (`Am`, `Em`, `Dm`, `Bm`, etc.): Purple/Violet gradient theme (`rgba(168, 85, 247, 0.25)` fill, `#a855f7` border).
  - Diminished / Augmented / Other: Amber/Rose theme (`rgba(244, 63, 94, 0.25)` fill, `#f43f5e` border).
- **Active Chord Highlight & Playhead**:
  - During playback, query current time $t$: find chord where $\text{chord.start} \le t < \text{chord.end}$.
  - The active chord block renders with a glowing drop shadow (`ctx.shadowBlur = 16`, `ctx.shadowColor = '#06b6d4'`), higher opacity fill (`rgba(6, 182, 212, 0.6)`), and an animated pulsing border.
  - Vertical red cursor (`#f43f5e`) drawn across the canvas synchronized with Wavesurfer's current position.
- **Interactive Click-to-Seek**:
  - Canvas click listener translates `event.offsetX` to timestamp $t = \left(\frac{x}{\text{width}}\right) \times \text{duration}$.
  - Calls `wavesurfer.seekTo(t / duration)` and updates audio position instantly.

### 3.5 Component 5: Music Telemetry Bar
Displays 4 real-time musical cards:
1. **Tempo (BPM)**:
   - Primary metric: e.g. `128.0 BPM`.
   - Visual metronome LED: Blinking dot with CSS keyframe animation pulsing precisely at $\text{interval} = \frac{60}{\text{BPM}} \text{ seconds}$.
2. **Master Key & Scale**:
   - Primary metric: e.g. `C Major` or `A Minor`.
   - Camelot Wheel equivalent badge: e.g. `8B` / `8A`.
   - Tonic pitch class indicator.
3. **Time Signature**:
   - Primary metric: `4/4` (or `3/4`, `6/8`).
   - Meter pulse bar (4 visual beat dots).
4. **Track Duration & Harmonic Density**:
   - Total length: `03:42.50`.
   - Stats: Total detected beats and unique chord transitions.

### 3.6 Component 6: 4-Stem Mixer Preview
Provides an interactive 4-track mixer interface:
- **4 Dedicated Channels**:
  1. **Vocals** (Pink `#ec4899`)
  2. **Drums** (Gold `#eab308`)
  3. **Bass** (Purple `#8b5cf6`)
  4. **Other / Instruments** (Cyan `#06b6d4`)
- **Per-Channel Controls**:
  - **Fader Slider**: Range 0% to 100% (or $-\infty\text{ dB}$ to $+6\text{ dB}$) with live numerical readouts.
  - **Solo Button (S)**:
    - Normal: Slate dark button.
    - Active: Glowing yellow (`bg-yellow-500 text-black shadow-lg shadow-yellow-500/30`).
    - Logic: When any channel is soloed, only soloed channels remain audible; all non-soloed channels are attenuated to 0. Supports multi-channel soloing.
  - **Mute Button (M)**:
    - Normal: Slate dark button.
    - Active: Glowing red (`bg-red-600 text-white shadow-lg shadow-red-600/30`).
    - Logic: Forces channel volume to 0.
  - **Simulated VU / Peak Meter**: Dynamic LED bar (Green $\to$ Yellow $\to$ Red) responding to playback and fader levels.
- **Web Audio Architecture for Mixer**:
  - `SourceNode` $\to$ 4 Parallel `GainNode`s $\to$ `MasterGainNode` $\to$ `AudioContext.destination`.
  - Filter simulation (e.g. Lowpass for Bass channel preview, Highpass for Vocals preview) when playing a single master track in Phase 1 preview mode.

---

## 4. E2E Testing & Verification Architecture

To ensure 100% test coverage and rock-solid reliability across the entire system, we design a multi-tier test framework.

### 4.1 Ground-Truth Synthetic Audio Generator (`tests/generators/synthetic_audio.py`)
To test DSP algorithms deterministically without relying on copyrighted external audio files, we build a pure mathematical audio generator using `numpy` and `scipy`:
- **Sine Wave Generator**: Generates fundamental frequencies for musical notes:
  $$f(n) = 440 \times 2^{\frac{n - 69}{12}}$$
- **Chord Synthesizer**: Mixes pure sine waves for triads:
  - C Major Triad: C4 (261.63 Hz) + E4 (329.63 Hz) + G4 (392.00 Hz)
  - A Minor Triad: A4 (440.00 Hz) + C5 (523.25 Hz) + E5 (659.25 Hz)
  - G Major Triad: G4 (392.00 Hz) + B4 (493.88 Hz) + D5 (587.33 Hz)
  - F Major Triad: F4 (349.23 Hz) + A4 (440.00 Hz) + C5 (523.25 Hz)
- **Rhythm / Beat Generator**: Inserts synthesized percussive transient clicks/envelopes (short noise bursts + exponential decay) at precise intervals:
  $$\Delta t = \frac{60}{\text{BPM}}$$
- **Progression Generator**: Sequences chords (e.g. 4-bar progression C $\to$ G $\to$ Am $\to$ F at 120 BPM) and writes to standard 16-bit PCM WAV in memory (`io.BytesIO`).

### 4.2 4-Tier Test Matrix Design

```
+-------------------------------------------------------------------+
|               AI AUDIO LAB 2026 - TEST MATRIX                     |
+-------------------------------------------------------------------+
|  TIER 1: Feature Tests (Core Functionality & Contract Verification)|
|  - API Health & Root Static SPA Delivery                          |
|  - Valid Audio Upload (Task UUID generation & file storage)       |
|  - DSP Analysis Schema & Baseline Values                          |
|  - Frontend DOM Structure & Component Verification                |
+-------------------------------------------------------------------+
|  TIER 2: Boundary & Adversarial Edge Cases                        |
|  - 0-Byte / Empty Audio Files                                     |
|  - Corrupted Audio Headers / Truncated Streams                    |
|  - Non-Audio File Uploads (.txt, .exe, .pdf)                      |
|  - Extreme Durations (0.2s ultra-short, 10-min long)              |
|  - Extreme Tempos (40 BPM, 240 BPM) & Pure Silence               |
+-------------------------------------------------------------------+
|  TIER 3: Combinatorial Matrix                                     |
|  - Audio Formats: WAV (16/24/32-bit), MP3, FLAC, OGG, M4A         |
|  - Sample Rates: 22050 Hz, 44100 Hz, 48000 Hz, 96000 Hz           |
|  - Channel Formats: Mono (1ch) vs Stereo (2ch)                    |
|  - Harmonic Keys: All 12 Major & 12 Minor Tonics                  |
+-------------------------------------------------------------------+
|  TIER 4: Real-World Stress & Performance                          |
|  - High Concurrency Uploads (10+ simultaneous requests)           |
|  - Large File Handling (25MB - 50MB audio files)                  |
|  - Memory Stability & Canvas 60 FPS Render Benchmark              |
|  - Rapid Frontend State Machine Hammering (Play/Seek/Mute loops)  |
+-------------------------------------------------------------------+
```

#### Detailed Test Tiers:

1. **Tier 1: Feature & Contract Tests**:
   - `test_root_spa_served()`: Verifies `GET /` returns HTTP 200, Content-Type `text/html`, and contains required DOM roots (`#waveform`, `#chord-canvas`, `#stem-mixer`, `#bpm-badge`, `#key-badge`).
   - `test_upload_valid_wav()`: Verifies `POST /api/upload` returns HTTP 200, valid `task_id` (UUID4 string), and valid `audio_url`.
   - `test_analyze_basic_schema()`: Verifies `POST /api/analyze/basic` returns HTTP 200 with schema:
     ```json
     {
       "task_id": "uuid-string",
       "bpm": 120.0,
       "key": "C Major",
       "time_signature": "4/4",
       "beats": [0.0, 0.5, 1.0, 1.5, ...],
       "chords": [
         {"start": 0.0, "end": 2.0, "chord": "C"},
         {"start": 2.0, "end": 4.0, "chord": "G"}
       ]
     }
     ```
   - `test_dsp_known_tempo_120()`: Verifies detected BPM on 120 BPM synthetic audio is within tolerance $[118.0, 122.0]$.
   - `test_dsp_known_key_c_major()`: Verifies detected Key on C Major synthetic audio is `C Major` or `C`.

2. **Tier 2: Boundary & Edge Case Tests**:
   - `test_upload_empty_file()`: Verifies uploading 0-byte file returns HTTP 400 or 422 with clear error message.
   - `test_upload_invalid_extension()`: Verifies uploading `.pdf` or `.exe` returns HTTP 400 Bad Request.
   - `test_upload_corrupted_payload()`: Verifies uploading random garbage bytes returns HTTP 422 Unprocessable Entity.
   - `test_dsp_pure_silence()`: Verifies analyzing all-zero audio array returns default/safe metrics without crashing or dividing by zero.
   - `test_dsp_subsecond_audio()`: Verifies analyzing 0.5s audio completes without frame out-of-bounds error.

3. **Tier 3: Combinatorial Tests**:
   - `test_format_combinatorial()`: Parametrized across `['wav', 'mp3', 'flac', 'ogg']`.
   - `test_samplerate_combinatorial()`: Parametrized across `[22050, 44100, 48000, 96000]`.
   - `test_channels_combinatorial()`: Parametrized across `[1 (mono), 2 (stereo)]`.
   - `test_musical_keys_matrix()`: Parametrized across Major triads (C, D, E, F, G, A, B) and Minor triads (Am, Em, Dm).

4. **Tier 4: Real-World Stress & Reliability Tests**:
   - `test_concurrent_uploads()`: Dispatches 10 parallel upload tasks using `asyncio` / threads and verifies all complete with isolated file paths.
   - `test_large_file_upload()`: Verifies uploading a 25MB file completes within memory limits.
   - `test_frontend_dom_integrity()`: Validates complete HTML semantics, script imports, event listener bindings, and CSS class validity.

---

## 5. File Structure Blueprint

```
reals audio lab/
├── app/
│   ├── __init__.py
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py              # Upload & Analysis endpoints
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py              # App settings & storage paths
│   │   ├── audio_utils.py         # Audio normalization & conversion
│   │   └── dsp_baseline.py        # Librosa beat, key & chord extraction
│   └── main.py                    # FastAPI app entry point & SPA static mount
├── static/
│   ├── index.html                 # Studio SPA (Dark Obsidian Theme)
│   ├── css/
│   │   └── studio.css             # Custom studio glow & fader styles
│   └── js/
│       ├── app.js                 # App state machine & initialization
│       ├── visualizer.js          # Wavesurfer 7 & Beat Grid Engine
│       ├── chordTimeline.js       # Canvas 2D Chord Timeline Engine
│       ├── mixer.js               # 4-Stem Mixer & Web Audio Routing
│       └── telemetry.js           # Live Telemetry & Metronome Engine
├── storage/                       # Uploaded audio files (gitignored)
├── tests/
│   ├── __init__.py
│   ├── conftest.py                # Pytest fixtures & FastAPI TestClient
│   ├── generators/
│   │   ├── __init__.py
│   │   └── synthetic_audio.py     # Ground-truth audio wave synthesizer
│   ├── tier1_feature/
│   │   ├── test_api_endpoints.py
│   │   ├── test_dsp_baseline.py
│   │   └── test_frontend_dom.py
│   ├── tier2_boundary/
│   │   ├── test_bad_payloads.py
│   │   └── test_dsp_edge_cases.py
│   ├── tier3_combinatorial/
│   │   ├── test_audio_formats.py
│   │   └── test_harmonic_keys.py
│   └── tier4_stress/
│       ├── test_concurrency.py
│       └── test_performance.py
├── requirements.txt               # Dependencies
└── README.md                      # Usage & running instructions
```

---

## 6. Implementation Architecture Details

### 6.1 Frontend Single-Page Application (`static/index.html`)

The frontend HTML incorporates all requested components into a cohesive studio dashboard:

```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Audio Lab 2026 - Interactive Audio Studio</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Lucide Icons CDN -->
  <script src="https://unpkg.com/lucide@latest"></script>
  <!-- Wavesurfer.js 7.x CDN -->
  <script src="https://unpkg.com/wavesurfer.js@7"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            studio: {
              bg: '#0a0e17',
              card: '#111827',
              border: '#1f293d',
              cyan: '#06b6d4',
              purple: '#8b5cf6',
              gold: '#eab308',
              rose: '#f43f5e'
            }
          }
        }
      }
    }
  </script>
  <style>
    @keyframes pulse-glow {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.95); }
    }
    .metronome-pulse {
      animation: pulse-glow 0.5s ease-in-out infinite;
    }
  </style>
</head>
<body class="bg-[#0a0e17] text-slate-100 min-h-screen flex flex-col font-sans selection:bg-cyan-500 selection:text-black">

  <!-- 1. Header & Device Telemetry -->
  <header class="border-b border-gray-800/80 bg-gray-900/60 backdrop-blur px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">
    <div class="flex items-center space-x-3">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
        <i data-lucide="music" class="w-5 h-5 text-white"></i>
      </div>
      <div>
        <h1 class="text-xl font-bold tracking-wider bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
          AI AUDIO LAB 2026
        </h1>
        <p class="text-xs text-slate-400">MIR Feature Extraction & Web Audio Studio</p>
      </div>
      <span class="ml-2 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/50">
        Phase 1 Studio
      </span>
    </div>

    <!-- Live Telemetry Badges -->
    <div class="flex items-center space-x-3 text-xs">
      <div id="connection-status" class="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gray-800/80 border border-gray-700">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span class="text-slate-300 font-mono">BACKEND: ONLINE</span>
      </div>
      <div class="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gray-800/80 border border-gray-700">
        <i data-lucide="cpu" class="w-3.5 h-3.5 text-purple-400"></i>
        <span class="text-slate-300 font-mono">DSP: LIBROSA 44.1kHz</span>
      </div>
      <div class="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gray-800/80 border border-gray-700">
        <i data-lucide="activity" class="w-3.5 h-3.5 text-cyan-400"></i>
        <span class="text-slate-300 font-mono">WEB AUDIO: 24-BIT</span>
      </div>
    </div>
  </header>

  <!-- Main Studio Workspace -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">

    <!-- 2. Drag & Drop Upload Zone -->
    <section id="upload-section" class="bg-gray-900/50 border border-gray-800/80 rounded-2xl p-6 backdrop-blur transition-all duration-300">
      <div id="dropzone" class="border-2 border-dashed border-gray-700 hover:border-cyan-500 rounded-xl p-8 text-center cursor-pointer transition-all duration-200 bg-gray-950/40 hover:bg-cyan-950/10 group">
        <input type="file" id="audio-input" class="hidden" accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg">
        <div class="flex flex-col items-center justify-center space-y-3">
          <div class="w-14 h-14 rounded-2xl bg-gray-800/80 group-hover:bg-cyan-500/20 group-hover:text-cyan-400 flex items-center justify-center text-slate-400 transition-colors">
            <i data-lucide="upload-cloud" class="w-7 h-7"></i>
          </div>
          <div class="text-sm">
            <span class="font-semibold text-cyan-400">Click to upload</span> or drag and drop audio file here
          </div>
          <p class="text-xs text-slate-500">Supports WAV, MP3, FLAC, M4A, OGG (Up to 50MB)</p>
          <div class="pt-2 flex items-center space-x-3">
            <button id="btn-load-demo" type="button" class="px-3.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition flex items-center space-x-1.5">
              <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
              <span>Load Demo Synth Progression</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Upload & Analysis Progress Stepper -->
      <div id="progress-container" class="hidden mt-4 space-y-2">
        <div class="flex justify-between text-xs text-slate-400 font-mono">
          <span id="progress-status-text">Uploading audio...</span>
          <span id="progress-percentage">0%</span>
        </div>
        <div class="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
          <div id="progress-bar-fill" class="bg-gradient-to-r from-cyan-500 to-indigo-500 h-2 rounded-full transition-all duration-300 w-0"></div>
        </div>
      </div>
    </section>

    <!-- 3. Music Telemetry Bar -->
    <section id="telemetry-bar" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <!-- BPM Card -->
      <div class="bg-gray-900/60 border border-gray-800/80 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tempo</p>
          <div class="flex items-baseline space-x-1 mt-1">
            <span id="badge-bpm" class="text-2xl font-bold font-mono text-cyan-400">--</span>
            <span class="text-xs text-slate-500">BPM</span>
          </div>
        </div>
        <div id="metronome-dot" class="w-4 h-4 rounded-full bg-cyan-500/20 border border-cyan-400"></div>
      </div>

      <!-- Master Key Card -->
      <div class="bg-gray-900/60 border border-gray-800/80 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Master Key</p>
          <div class="flex items-baseline space-x-1 mt-1">
            <span id="badge-key" class="text-2xl font-bold font-mono text-purple-400">--</span>
          </div>
        </div>
        <div class="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
          <i data-lucide="key" class="w-4 h-4"></i>
        </div>
      </div>

      <!-- Time Signature Card -->
      <div class="bg-gray-900/60 border border-gray-800/80 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Time Signature</p>
          <div class="flex items-baseline space-x-1 mt-1">
            <span id="badge-meter" class="text-2xl font-bold font-mono text-amber-400">4/4</span>
          </div>
        </div>
        <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <i data-lucide="clock" class="w-4 h-4"></i>
        </div>
      </div>

      <!-- Duration & Segments Card -->
      <div class="bg-gray-900/60 border border-gray-800/80 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Duration</p>
          <div class="flex items-baseline space-x-1 mt-1">
            <span id="badge-duration" class="text-2xl font-bold font-mono text-slate-200">00:00</span>
          </div>
        </div>
        <div class="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
          <i data-lucide="timer" class="w-4 h-4"></i>
        </div>
      </div>
    </section>

    <!-- 4. Interactive Waveform & Chord Canvas Studio -->
    <section class="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-6 backdrop-blur space-y-4">
      <div class="flex items-center justify-between pb-2 border-b border-gray-800">
        <h2 class="text-sm font-semibold tracking-wider text-slate-300 uppercase flex items-center space-x-2">
          <i data-lucide="sliders" class="w-4 h-4 text-cyan-400"></i>
          <span>Waveform & Synchronized Chord Timeline</span>
        </h2>
        <div class="flex items-center space-x-3 text-xs">
          <label class="text-slate-400 flex items-center space-x-1.5">
            <i data-lucide="zoom-in" class="w-3.5 h-3.5"></i>
            <span>Zoom:</span>
          </label>
          <input type="range" id="zoom-slider" min="10" max="200" value="50" class="w-28 accent-cyan-400 cursor-pointer">
        </div>
      </div>

      <!-- Waveform + Beat Grid Container -->
      <div class="relative w-full rounded-xl overflow-hidden bg-gray-950/80 border border-gray-800">
        <div id="waveform" class="w-full h-[120px]"></div>
        <!-- Beat Grid Overlay Canvas -->
        <canvas id="beat-grid-canvas" class="absolute inset-0 pointer-events-none w-full h-[120px]"></canvas>
      </div>

      <!-- Canvas Chord Timeline -->
      <div class="relative w-full rounded-xl overflow-hidden bg-gray-950/90 border border-gray-800">
        <canvas id="chord-timeline-canvas" class="w-full h-[90px] cursor-pointer"></canvas>
      </div>

      <!-- Transport Controls Bar -->
      <div class="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div class="flex items-center space-x-3">
          <button id="btn-play-pause" type="button" class="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-cyan-500/25 transition active:scale-95" title="Play / Pause (Spacebar)">
            <i data-lucide="play" id="play-icon" class="w-5 h-5 ml-0.5"></i>
          </button>
          <button id="btn-stop" type="button" class="w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-slate-300 flex items-center justify-center border border-gray-700 transition" title="Stop & Reset">
            <i data-lucide="square" class="w-4 h-4"></i>
          </button>
          <div class="font-mono text-sm font-semibold text-slate-200 px-3 py-1.5 rounded-lg bg-gray-950/80 border border-gray-800">
            <span id="time-current">00:00.00</span> / <span id="time-total" class="text-slate-500">00:00.00</span>
          </div>
        </div>

        <div class="flex items-center space-x-3 text-xs text-slate-400">
          <span class="px-2 py-1 rounded bg-gray-800 border border-gray-700 font-mono">SPACE</span>
          <span>Play/Pause Shortcut</span>
        </div>
      </div>
    </section>

    <!-- 5. 4-Stem Mixer Preview -->
    <section class="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-6 backdrop-blur space-y-4">
      <div class="flex items-center justify-between pb-2 border-b border-gray-800">
        <h2 class="text-sm font-semibold tracking-wider text-slate-300 uppercase flex items-center space-x-2">
          <i data-lucide="layers" class="w-4 h-4 text-purple-400"></i>
          <span>4-Stem Mixer Preview</span>
        </h2>
        <span class="text-xs text-slate-500">Channel Faders · Solo · Mute</span>
      </div>

      <!-- 4 Channel Strips Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Stem 1: Vocals -->
        <div class="bg-gray-950/60 border border-pink-950/40 rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 text-pink-400">
              <i data-lucide="mic" class="w-4 h-4"></i>
              <span class="font-semibold text-sm">Vocals</span>
            </div>
            <span id="vol-label-vocals" class="text-xs font-mono text-pink-300">80%</span>
          </div>
          <input type="range" id="fader-vocals" min="0" max="100" value="80" class="w-full accent-pink-500 cursor-pointer">
          <div class="flex space-x-2">
            <button id="solo-vocals" class="flex-1 py-1 text-xs font-bold rounded bg-gray-800 hover:bg-yellow-500/20 text-slate-300 hover:text-yellow-400 border border-gray-700 transition">S</button>
            <button id="mute-vocals" class="flex-1 py-1 text-xs font-bold rounded bg-gray-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-gray-700 transition">M</button>
          </div>
        </div>

        <!-- Stem 2: Drums -->
        <div class="bg-gray-950/60 border border-amber-950/40 rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 text-amber-400">
              <i data-lucide="drum" class="w-4 h-4"></i>
              <span class="font-semibold text-sm">Drums</span>
            </div>
            <span id="vol-label-drums" class="text-xs font-mono text-amber-300">80%</span>
          </div>
          <input type="range" id="fader-drums" min="0" max="100" value="80" class="w-full accent-amber-500 cursor-pointer">
          <div class="flex space-x-2">
            <button id="solo-drums" class="flex-1 py-1 text-xs font-bold rounded bg-gray-800 hover:bg-yellow-500/20 text-slate-300 hover:text-yellow-400 border border-gray-700 transition">S</button>
            <button id="mute-drums" class="flex-1 py-1 text-xs font-bold rounded bg-gray-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-gray-700 transition">M</button>
          </div>
        </div>

        <!-- Stem 3: Bass -->
        <div class="bg-gray-950/60 border border-purple-950/40 rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 text-purple-400">
              <i data-lucide="disc" class="w-4 h-4"></i>
              <span class="font-semibold text-sm">Bass</span>
            </div>
            <span id="vol-label-bass" class="text-xs font-mono text-purple-300">80%</span>
          </div>
          <input type="range" id="fader-bass" min="0" max="100" value="80" class="w-full accent-purple-500 cursor-pointer">
          <div class="flex space-x-2">
            <button id="solo-bass" class="flex-1 py-1 text-xs font-bold rounded bg-gray-800 hover:bg-yellow-500/20 text-slate-300 hover:text-yellow-400 border border-gray-700 transition">S</button>
            <button id="mute-bass" class="flex-1 py-1 text-xs font-bold rounded bg-gray-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-gray-700 transition">M</button>
          </div>
        </div>

        <!-- Stem 4: Other -->
        <div class="bg-gray-950/60 border border-cyan-950/40 rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 text-cyan-400">
              <i data-lucide="music-2" class="w-4 h-4"></i>
              <span class="font-semibold text-sm">Other</span>
            </div>
            <span id="vol-label-other" class="text-xs font-mono text-cyan-300">80%</span>
          </div>
          <input type="range" id="fader-other" min="0" max="100" value="80" class="w-full accent-cyan-500 cursor-pointer">
          <div class="flex space-x-2">
            <button id="solo-other" class="flex-1 py-1 text-xs font-bold rounded bg-gray-800 hover:bg-yellow-500/20 text-slate-300 hover:text-yellow-400 border border-gray-700 transition">S</button>
            <button id="mute-other" class="flex-1 py-1 text-xs font-bold rounded bg-gray-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-gray-700 transition">M</button>
          </div>
        </div>
      </div>
    </section>

  </main>

  <!-- Footer -->
  <footer class="border-t border-gray-800/60 py-4 px-6 text-center text-xs text-slate-500">
    AI Audio Lab 2026 — High Precision MIR & Web Audio Visualizer Engine
  </footer>

  <!-- Main JavaScript App -->
  <script src="/static/js/app.js"></script>
  <script>
    lucide.createIcons();
  </script>
</body>
</html>
```

---

### 6.2 Canvas 2D Chord Timeline Engine (`static/js/chordTimeline.js`)

The Canvas engine ensures 60 FPS smooth rendering and click-to-seek interactivity:

```javascript
class ChordTimelineEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.chords = [];
    this.duration = 0;
    this.currentTime = 0;
    this.onSeekCallback = null;

    this.initCanvas();
    this.attachEvents();
  }

  initCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = (rect.width || 800) * dpr;
    this.canvas.height = (rect.height || 90) * dpr;
    this.ctx.scale(dpr, dpr);
    this.displayWidth = rect.width || 800;
    this.displayHeight = rect.height || 90;
  }

  setData(chords, duration) {
    this.chords = chords || [];
    this.duration = duration || 1;
    this.render();
  }

  updatePlayhead(currentTime) {
    this.currentTime = currentTime;
    this.render();
  }

  attachEvents() {
    this.canvas.addEventListener('click', (e) => {
      if (!this.duration || !this.onSeekCallback) return;
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const targetTime = (clickX / rect.width) * this.duration;
      this.onSeekCallback(targetTime);
    });

    window.addEventListener('resize', () => {
      this.initCanvas();
      this.render();
    });
  }

  render() {
    const w = this.displayWidth;
    const h = this.displayHeight;
    const ctx = this.ctx;

    // Clear background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, w, h);

    if (!this.chords || this.chords.length === 0 || this.duration <= 0) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No chord data available', w / 2, h / 2);
      return;
    }

    // Render chord blocks
    this.chords.forEach((chord) => {
      const startX = (chord.start / this.duration) * w;
      const endX = (chord.end / this.duration) * w;
      const blockWidth = Math.max(endX - startX, 2);
      const isActive = this.currentTime >= chord.start && this.currentTime < chord.end;
      const isMinor = chord.chord.includes('m') && !chord.chord.includes('maj');

      // Block Styling
      ctx.save();
      if (isActive) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = isMinor ? '#a855f7' : '#06b6d4';
        ctx.fillStyle = isMinor ? 'rgba(168, 85, 247, 0.45)' : 'rgba(6, 182, 212, 0.45)';
        ctx.strokeStyle = isMinor ? '#c084fc' : '#38bdf8';
        ctx.lineWidth = 2;
      } else {
        ctx.fillStyle = isMinor ? 'rgba(168, 85, 247, 0.15)' : 'rgba(6, 182, 212, 0.15)';
        ctx.strokeStyle = isMinor ? 'rgba(168, 85, 247, 0.4)' : 'rgba(6, 182, 212, 0.4)';
        ctx.lineWidth = 1;
      }

      // Draw Rounded Block
      const radius = 6;
      ctx.beginPath();
      ctx.roundRect(startX + 1, 6, blockWidth - 2, h - 12, radius);
      ctx.fill();
      ctx.stroke();

      // Text label
      ctx.fillStyle = isActive ? '#ffffff' : '#cbd5e1';
      ctx.font = isActive ? 'bold 15px monospace' : 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(chord.chord, startX + blockWidth / 2, h / 2 - 4);

      // Start time stamp
      ctx.font = '9px monospace';
      ctx.fillStyle = isActive ? '#38bdf8' : '#64748b';
      ctx.fillText(chord.start.toFixed(1) + 's', startX + blockWidth / 2, h - 14);

      ctx.restore();
    });

    // Playhead Line
    const playheadX = (this.currentTime / this.duration) * w;
    ctx.save();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();

    // Top Playhead Pin
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(playheadX - 5, 0);
    ctx.lineTo(playheadX + 5, 0);
    ctx.lineTo(playheadX, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
```

---

### 6.3 Synthetic Audio Generator (`tests/generators/synthetic_audio.py`)

```python
"""
Synthetic Audio Generator for Deterministic MIR Ground-Truth Testing
Generates mathematical waveforms with exact known BPM, Keys, and Triad Progressions.
"""
import io
import numpy as np
import scipy.io.wavfile as wavfile

NOTE_FREQS = {
    "C3": 130.81, "E3": 164.81, "G3": 196.00,
    "A3": 220.00, "C4": 261.63, "D4": 293.66,
    "E4": 329.63, "F4": 349.23, "G4": 392.00,
    "A4": 440.00, "B4": 493.88, "C5": 523.25,
    "E5": 659.25
}

TRIADS = {
    "C": [NOTE_FREQS["C4"], NOTE_FREQS["E4"], NOTE_FREQS["G4"]],
    "G": [NOTE_FREQS["G3"], NOTE_FREQS["B4"], NOTE_FREQS["D4"]],
    "Am": [NOTE_FREQS["A3"], NOTE_FREQS["C4"], NOTE_FREQS["E4"]],
    "F": [NOTE_FREQS["F4"], NOTE_FREQS["A4"], NOTE_FREQS["C5"]],
}

def generate_sine_wave(freq: float, duration: float, sr: int = 44100) -> np.ndarray:
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    return 0.3 * np.sin(2 * np.pi * freq * t)

def generate_triad_audio(chord_name: str, duration: float, sr: int = 44100) -> np.ndarray:
    freqs = TRIADS.get(chord_name, [440.0])
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    signal = np.zeros_like(t)
    for f in freqs:
        signal += (0.3 / len(freqs)) * np.sin(2 * np.pi * f * t)
    return signal

def generate_rhythm_clicks(bpm: float, duration: float, sr: int = 44100) -> np.ndarray:
    """Generates percussive transient clicks at precise BPM intervals."""
    total_samples = int(sr * duration)
    signal = np.zeros(total_samples, dtype=np.float32)
    beat_interval = 60.0 / bpm
    beat_times = np.arange(0, duration, beat_interval)
    
    click_length = int(sr * 0.02)  # 20ms click
    click_t = np.linspace(0, 0.02, click_length, endpoint=False)
    click_wave = 0.8 * np.sin(2 * np.pi * 1000.0 * click_t) * np.exp(-click_t * 200)

    for bt in beat_times:
        idx = int(bt * sr)
        end_idx = min(idx + click_length, total_samples)
        signal[idx:end_idx] += click_wave[:end_idx - idx]

    return signal

def generate_synthetic_progression(
    bpm: float = 120.0,
    chords = ["C", "G", "Am", "F"],
    bar_duration: float = 2.0,
    sr: int = 44100
) -> bytes:
    """Generates complete WAV file in bytes with known progression and beat track."""
    total_duration = len(chords) * bar_duration
    audio = np.zeros(int(sr * total_duration), dtype=np.float32)

    for i, chord in enumerate(chords):
        start_idx = int(i * bar_duration * sr)
        end_idx = int((i + 1) * bar_duration * sr)
        triad_wave = generate_triad_audio(chord, bar_duration, sr)
        audio[start_idx:end_idx] += triad_wave

    clicks = generate_rhythm_clicks(bpm, total_duration, sr)
    audio += clicks

    # Normalize to 16-bit PCM
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.9
    
    int_audio = (audio * 32767).astype(np.int16)
    buffer = io.BytesIO()
    wavfile.write(buffer, sr, int_audio)
    buffer.seek(0)
    return buffer.getvalue()
```

---

## 7. Comprehensive 4-Tier Test Suite Specification

### 7.1 Tier 1: Feature & Contract Tests (`tests/tier1_feature/test_api_endpoints.py`)
- Tests `GET /` serves HTML SPA.
- Tests `POST /api/upload` returns UUID and valid storage path.
- Tests `POST /api/analyze/basic` returns full DSP schema.
- Tests BPM accuracy ($120 \pm 2$ BPM).
- Tests Master Key accuracy (C Major tonic detection).

### 7.2 Tier 2: Boundary & Edge Case Tests (`tests/tier2_boundary/test_bad_payloads.py`)
- Tests 0-byte upload $\to$ HTTP 400/422.
- Tests `.txt` upload $\to$ HTTP 400.
- Tests corrupted byte stream $\to$ HTTP 422.
- Tests pure silence audio $\to$ gracefully handles zero energy without `ZeroDivisionError`.
- Tests 0.2s ultra-short file $\to$ padding/windowing prevents crashes.

### 7.3 Tier 3: Combinatorial Tests (`tests/tier3_combinatorial/test_audio_formats.py`)
- Parametrized tests across formats (`.wav`, `.mp3`, `.flac`, `.ogg`).
- Parametrized tests across sample rates (22.05kHz, 44.1kHz, 48kHz, 96kHz).
- Parametrized tests across channel modes (mono, stereo).
- Parametrized tests across keys (all 12 chromatic tonics).

### 7.4 Tier 4: Stress & Concurrency Tests (`tests/tier4_stress/test_concurrency.py`)
- 10 parallel upload and analysis tasks executed concurrently via `concurrent.futures`.
- Verifies storage isolation (each task gets unique UUID and unique audio file).
- Verifies non-blocking async execution.

---

## 8. Summary of Architectural Recommendations

1. **Keep Zero-Bundler SPA**: Direct CDN delivery (Tailwind + Wavesurfer 7 + Lucide) eliminates Node.js build bottlenecks and guarantees immediate out-of-the-box operation.
2. **Synchronized Dual-Canvas Pipeline**: Use separate layered canvases for the beat grid overlay and the chord timeline for optimal frame rates ($>60\text{ FPS}$) and separation of concerns.
3. **Robust Ground-Truth Synthesizer**: Use the `numpy`/`scipy` synthetic audio generator in automated CI/CD tests to eliminate external audio dependencies and verify mathematical precision.
4. **Clean Web Audio Graph**: Implement stem mixer faders, solo, and mute controls using Web Audio `GainNode`s with smooth audio parameter ramps (`linearRampToValueAtTime`) to avoid click/pop artifacts.
