/**
 * AI Audio Lab 2026 — Main Application Coordinator (Phase 2 SOTA)
 * Handles Drag & Drop, SOTA Deep Multi-Task Analysis, SSE Progress Streaming,
 * Synchronized 4-Stem Web Audio Playback, and Canvas Chord Timeline.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Sub-Engines
  const chordTimeline = new ChordTimelineEngine('chord-canvas');
  const stemMixer = new StemMixerEngine();
  const wsController = new WavesurferController('waveform-container');

  // 2. Application State
  const state = {
    taskId: null,
    audioUrl: null,
    filename: null,
    duration: 0,
    bpm: 0,
    key: '--',
    timeSignature: '4/4',
    beats: [],
    downbeats: [],
    chords: [],
    stems: null,
    isPlaying: false,
    eventSource: null
  };

  // 3. UI DOM Elements
  const dropzone = document.getElementById('dropzone');
  const audioInput = document.getElementById('audio-input');
  const progressContainer = document.getElementById('progress-container');
  const progressStatusText = document.getElementById('progress-status-text');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressPercentage = document.getElementById('progress-percentage');

  const btnPlay = document.getElementById('btn-play');
  const btnStop = document.getElementById('btn-stop');
  const playIcon = document.getElementById('play-icon');
  const timeCurrent = document.getElementById('time-current');
  const timeTotal = document.getElementById('time-total');
  const zoomSlider = document.getElementById('zoom-slider');

  // Telemetry Cards
  const valBpm = document.getElementById('val-bpm');
  const valKey = document.getElementById('val-key');
  const valMeter = document.getElementById('val-meter');
  const valDuration = document.getElementById('val-duration');
  const metronomeDot = document.getElementById('metronome-dot');
  const btnLoadDemo = document.getElementById('btn-load-demo');
  const btnDeepAnalyze = document.getElementById('btn-deep-analyze');
  const dspModelBadge = document.getElementById('dsp-model-badge');

  // 4. Synchronize Wavesurfer & Chord Timeline & Stem Mixer Seek
  chordTimeline.onSeek((targetTime) => {
    wsController.seekTo(targetTime);
    stemMixer.seek(targetTime);
  });

  wsController.onTimeUpdateCallback = (currentTime) => {
    state.currentTime = currentTime;
    chordTimeline.updatePlayhead(currentTime);
    updateTimeDisplay(currentTime, wsController.getDuration());
    stemMixer.animateVUMeters(wsController.isPlaying());
  };

  wsController.onReadyCallback = (duration) => {
    state.duration = duration;
    valDuration.textContent = formatTime(duration);
    timeTotal.textContent = formatTime(duration);
    chordTimeline.setData(state.chords, duration, state.downbeats);
    hideProgress();
  };

  wsController.onFinishCallback = () => {
    state.isPlaying = false;
    stemMixer.pause();
    updatePlayPauseButton(false);
    stemMixer.animateVUMeters(false);
  };

  // 5. Transport Controls
  if (btnPlay) {
    btnPlay.addEventListener('click', togglePlayPause);
  }

  if (btnStop) {
    btnStop.addEventListener('click', () => {
      wsController.stop();
      stemMixer.stop();
      state.isPlaying = false;
      updatePlayPauseButton(false);
      chordTimeline.updatePlayhead(0);
      updateTimeDisplay(0, state.duration);
    });
  }

  if (zoomSlider) {
    zoomSlider.addEventListener('input', (e) => {
      const zoomVal = parseInt(e.target.value, 10);
      wsController.zoom(zoomVal);
    });
  }

  // Keyboard Shortcuts (Spacebar to Play/Pause)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      togglePlayPause();
    }
  });

  function togglePlayPause() {
    if (wsController.isPlaying()) {
      wsController.pause();
      stemMixer.pause();
      state.isPlaying = false;
      updatePlayPauseButton(false);
    } else {
      wsController.play();
      stemMixer.play();
      state.isPlaying = true;
      updatePlayPauseButton(true);
    }
  }

  function updatePlayPauseButton(isPlaying) {
    if (!playIcon) return;
    if (isPlaying) {
      playIcon.setAttribute('data-lucide', 'pause');
    } else {
      playIcon.setAttribute('data-lucide', 'play');
    }
    if (window.lucide) lucide.createIcons();
  }

  function updateTimeDisplay(current, total) {
    if (timeCurrent) timeCurrent.textContent = formatTime(current);
    if (timeTotal) timeTotal.textContent = formatTime(total);
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  }

  // 6. File Upload Handlers
  if (dropzone && audioInput) {
    dropzone.addEventListener('click', (e) => {
      if (e.target.closest('#btn-load-demo') || e.target.closest('#btn-deep-analyze')) return;
      audioInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-cyan-400', 'bg-cyan-950/20');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-cyan-400', 'bg-cyan-950/20');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-cyan-400', 'bg-cyan-950/20');
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files[0]);
      }
    });

    audioInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileUpload(e.target.files[0]);
      }
    });
  }

  // 7. Demo Audio Loader & Deep Analysis Trigger
  if (btnLoadDemo) {
    btnLoadDemo.addEventListener('click', (e) => {
      e.stopPropagation();
      loadSyntheticDemo();
    });
  }

  if (btnDeepAnalyze) {
    btnDeepAnalyze.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.taskId) {
        alert("Please upload or load an audio track first!");
        return;
      }
      triggerDeepAnalysis(state.taskId);
    });
  }

  async function handleFileUpload(file) {
    showProgress("Uploading audio file...", 10);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.detail || "Upload failed");
      }

      const uploadData = await uploadRes.json();
      state.taskId = uploadData.task_id;
      state.audioUrl = uploadData.audio_url;
      state.filename = uploadData.filename;

      if (btnDeepAnalyze) {
        btnDeepAnalyze.classList.remove('hidden');
      }

      // Load wave in wavesurfer
      wsController.loadAudio(state.audioUrl);

      // Auto-trigger SOTA Deep Analysis
      await triggerDeepAnalysis(state.taskId);

    } catch (err) {
      alert(`Error: ${err.message}`);
      hideProgress();
    }
  }

  async function triggerDeepAnalysis(taskId) {
    showProgress("Starting SOTA Deep Multi-Task Analysis...", 15);
    listenToProgressSSE(taskId);

    try {
      const res = await fetch("/api/analyze/deep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Deep Analysis failed");
      }

      const analysisData = await res.json();
      applyAnalysisResults(analysisData);

    } catch (err) {
      console.error("Deep analysis error:", err);
      // Fallback to basic analysis if deep encounters network/model error
      showProgress("Falling back to DSP baseline...", 70);
      try {
        const basicRes = await fetch("/api/analyze/basic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: taskId })
        });
        if (basicRes.ok) {
          const basicData = await basicRes.json();
          applyAnalysisResults(basicData);
        }
      } catch (e) {
        alert(`Analysis Error: ${err.message}`);
      }
    }
  }

  function listenToProgressSSE(taskId) {
    if (state.eventSource) {
      state.eventSource.close();
    }

    try {
      const es = new EventSource(`/api/progress/${taskId}`);
      state.eventSource = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const pct = data.percent || 0;
          const msg = data.message || "Processing...";
          showProgress(msg, pct);

          if (pct >= 100 || data.step === 'complete') {
            es.close();
            state.eventSource = null;
            setTimeout(hideProgress, 1500);
          }
        } catch (e) {
          console.warn("SSE parse error:", e);
        }
      };

      es.onerror = () => {
        es.close();
        state.eventSource = null;
      };
    } catch (err) {
      console.warn("SSE connection error:", err);
    }
  }

  function applyAnalysisResults(data) {
    state.bpm = data.bpm || data.tempo || 0;
    state.key = data.key || '--';
    state.timeSignature = data.time_signature || '4/4';
    state.beats = data.beats || [];
    state.downbeats = data.downbeats || [];
    state.chords = data.chords || [];
    state.stems = data.stems || null;

    // Update Telemetry UI
    valBpm.textContent = `${state.bpm.toFixed(1)} BPM`;
    valKey.textContent = state.key;
    valMeter.textContent = state.timeSignature;

    if (dspModelBadge) {
      dspModelBadge.textContent = data.model_version || "SOTA 2026";
    }

    // Update Metronome pulse speed
    if (state.bpm > 0) {
      const periodSec = 60 / state.bpm;
      metronomeDot.style.animationDuration = `${periodSec}s`;
      metronomeDot.classList.add('metronome-active');
    }

    // Update Beat Grid & Chord Timeline
    wsController.setBeats(state.beats, state.downbeats);
    chordTimeline.setData(state.chords, wsController.getDuration() || data.duration || 10, state.downbeats);

    // Load real separated stems into Mixer
    if (state.stems) {
      stemMixer.loadSeparatedStems(state.stems);
      const stemStatusEl = document.getElementById('stem-status-text');
      if (stemStatusEl) {
        stemStatusEl.textContent = "AI 4-Stems Demixed & Active";
        stemStatusEl.className = "text-xs text-emerald-400 font-semibold flex items-center space-x-1";
      }
    }
  }

  function showProgress(text, pct) {
    if (!progressContainer) return;
    progressContainer.classList.remove('hidden');
    if (progressStatusText) progressStatusText.textContent = text;
    if (progressBarFill) progressBarFill.style.width = `${pct}%`;
    if (progressPercentage) progressPercentage.textContent = `${pct}%`;
  }

  function hideProgress() {
    if (progressContainer) progressContainer.classList.add('hidden');
  }

  // 8. Generate and upload an offline demo track
  function loadSyntheticDemo() {
    showProgress("Synthesizing multi-tone demo progression (C -> G -> Am -> F)...", 30);
    const sampleRate = 44100;
    const duration = 8.0;
    const numSamples = sampleRate * duration;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
    const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    const chords = [
      { name: "C", freqs: [261.63, 329.63, 392.00] },
      { name: "G", freqs: [196.00, 246.94, 293.66] },
      { name: "Am", freqs: [220.00, 261.63, 329.63] },
      { name: "F", freqs: [174.61, 220.00, 261.63] }
    ];

    const segLen = Math.floor(numSamples / 4);
    for (let c = 0; c < 4; c++) {
      const chord = chords[c];
      for (let i = 0; i < segLen; i++) {
        const t = i / sampleRate;
        const globalIdx = c * segLen + i;
        let val = 0;
        chord.freqs.forEach(f => {
          val += (0.25 / 3) * Math.sin(2 * Math.PI * f * t);
        });
        // Beat pulses (120 BPM)
        if (i % (sampleRate * 0.5) < 800) {
          val += 0.3 * Math.sin(2 * Math.PI * 1000 * (i % 800) / sampleRate);
        }
        data[globalIdx] = val;
      }
    }

    const wavBlob = audioBufferToWavBlob(buffer);
    const testFile = new File([wavBlob], "demo_synth_progression.wav", { type: "audio/wav" });
    handleFileUpload(testFile);
  }

  function audioBufferToWavBlob(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    let channels = [], i, sample, offset = 0, pos = 0;

    function setUint16(data) { out.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { out.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);  // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);          // length = 16
    setUint16(1);           // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16);          // 16-bit
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

    while (offset < buffer.length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        out.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([out.buffer], { type: "audio/wav" });
  }
});
