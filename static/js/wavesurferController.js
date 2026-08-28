/**
 * AI Audio Lab 2026 — Wavesurfer 7.x Controller & Beat Grid Engine (Phase 2 SOTA)
 */

class WavesurferController {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.wavesurfer = null;
    this.beats = [];
    this.downbeats = [];
    this.duration = 0;
    this.options = options;
    this.onTimeUpdateCallback = null;
    this.onReadyCallback = null;
    this.onFinishCallback = null;

    this.initWavesurfer();
  }

  initWavesurfer() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`WavesurferController: Container #${this.containerId} not found.`);
      return;
    }

    if (typeof WaveSurfer === 'undefined') {
      console.warn("WaveSurfer is not loaded yet.");
      return;
    }

    this.wavesurfer = WaveSurfer.create({
      container: `#${this.containerId}`,
      waveColor: '#1e293b',
      progressColor: '#06b6d4',
      cursorColor: '#f43f5e',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 120,
      normalize: true,
      backend: 'WebAudio',
      ...this.options
    });

    this.wavesurfer.on('ready', (duration) => {
      this.duration = duration;
      this.renderBeatGrid();
      if (this.onReadyCallback) this.onReadyCallback(duration);
    });

    this.wavesurfer.on('timeupdate', (currentTime) => {
      if (this.onTimeUpdateCallback) this.onTimeUpdateCallback(currentTime);
    });

    this.wavesurfer.on('finish', () => {
      if (this.onFinishCallback) this.onFinishCallback();
    });
  }

  loadAudio(url) {
    if (!this.wavesurfer) return;
    this.wavesurfer.load(url);
  }

  playPause() {
    if (!this.wavesurfer) return;
    this.wavesurfer.playPause();
  }

  play() {
    if (!this.wavesurfer) return;
    this.wavesurfer.play();
  }

  pause() {
    if (!this.wavesurfer) return;
    this.wavesurfer.pause();
  }

  stop() {
    if (!this.wavesurfer) return;
    this.wavesurfer.stop();
  }

  seekTo(time) {
    if (!this.wavesurfer || !this.duration || this.duration <= 0) return;
    const progress = Math.max(0, Math.min(1, time / this.duration));
    this.wavesurfer.seekTo(progress);
  }

  zoom(pxPerSec) {
    if (!this.wavesurfer) return;
    this.wavesurfer.zoom(pxPerSec);
    this.renderBeatGrid();
  }

  setBeats(beats, downbeats = []) {
    this.beats = Array.isArray(beats) ? beats : [];
    this.downbeats = Array.isArray(downbeats) ? downbeats : [];
    this.renderBeatGrid();
  }

  renderBeatGrid() {
    const gridContainer = document.getElementById('beat-grid-overlay');
    if (!gridContainer || !this.duration || this.duration <= 0 || !this.beats || this.beats.length === 0) {
      if (gridContainer) gridContainer.innerHTML = '';
      return;
    }

    gridContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const downbeatSet = new Set(this.downbeats.map(d => d.toFixed(2)));

    this.beats.forEach((beatTime, idx) => {
      const line = document.createElement('div');
      const isDownbeat = downbeatSet.has(beatTime.toFixed(2)) || (idx % 4 === 0);
      line.className = isDownbeat ? 'beat-grid-line downbeat-grid-line' : 'beat-grid-line';
      line.style.left = `${(beatTime / this.duration) * 100}%`;
      line.title = `${isDownbeat ? 'Downbeat (Bar 1)' : 'Beat'}: ${beatTime.toFixed(2)}s`;
      fragment.appendChild(line);
    });

    gridContainer.appendChild(fragment);
  }

  isPlaying() {
    return this.wavesurfer ? this.wavesurfer.isPlaying() : false;
  }

  getCurrentTime() {
    return this.wavesurfer ? this.wavesurfer.getCurrentTime() : 0;
  }

  getDuration() {
    return this.duration || (this.wavesurfer ? this.wavesurfer.getDuration() : 0);
  }
}

window.WavesurferController = WavesurferController;
