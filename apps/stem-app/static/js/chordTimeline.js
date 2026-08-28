/**
 * AI Audio Lab 2026 — Canvas 2D Chord Timeline Engine (Phase 2 SOTA)
 * Renders 170+ Chord Types, Inversions (Slash Chords C/E, G/B),
 * Downbeat markers, real-time 60 FPS playhead tracking, and click-to-seek.
 */

class ChordTimelineEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`ChordTimelineEngine: Canvas #${canvasId} not found.`);
      return;
    }
    this.ctx = this.canvas.getContext('2d');
    this.chords = [];
    this.downbeats = [];
    this.duration = 0;
    this.currentTime = 0;
    this.onSeekCallback = null;

    this.initCanvas();
    this.attachEvents();
  }

  initCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.displayWidth = rect.width || this.canvas.parentElement.clientWidth || 800;
    this.displayHeight = rect.height || 96;

    this.canvas.width = this.displayWidth * dpr;
    this.canvas.height = this.displayHeight * dpr;
    this.ctx.scale(dpr, dpr);
  }

  setData(chords, duration, downbeats = []) {
    this.chords = Array.isArray(chords) ? chords : [];
    this.downbeats = Array.isArray(downbeats) ? downbeats : [];
    this.duration = (typeof duration === 'number' && duration > 0) ? duration : 0;
    this.render();
  }

  updatePlayhead(currentTime) {
    this.currentTime = currentTime;
    this.render();
  }

  onSeek(callback) {
    this.onSeekCallback = callback;
  }

  attachEvents() {
    if (!this.canvas) return;

    this.canvas.addEventListener('click', (e) => {
      if (!this.duration || this.duration <= 0 || !this.onSeekCallback) return;
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const targetTime = Math.max(0, Math.min(this.duration, (clickX / rect.width) * this.duration));
      this.onSeekCallback(targetTime);
    });

    window.addEventListener('resize', () => {
      this.initCanvas();
      this.render();
    });
  }

  getChordColors(chordName, isActive) {
    // Determine chord category styling
    const isSlash = chordName.includes('/');
    const is7th = chordName.includes('7') || chordName.includes('9') || chordName.includes('11');
    const isSus = chordName.includes('sus');
    const isDim = chordName.includes('dim') || chordName.includes('aug');
    const isMinor = chordName.includes('m') && !chordName.includes('maj');

    let baseColor = '#06b6d4'; // Cyan default (Major)
    let fillRgba = 'rgba(6, 182, 212, 0.15)';
    let strokeRgba = 'rgba(6, 182, 212, 0.40)';

    if (isSlash) {
      baseColor = '#f59e0b'; // Amber Gold for Slash / Inversions
      fillRgba = 'rgba(245, 158, 11, 0.18)';
      strokeRgba = 'rgba(245, 158, 11, 0.50)';
    } else if (isDim) {
      baseColor = '#ef4444'; // Red for Diminished / Augmented
      fillRgba = 'rgba(239, 68, 68, 0.18)';
      strokeRgba = 'rgba(239, 68, 68, 0.50)';
    } else if (is7th) {
      baseColor = '#ec4899'; // Pink for 7th, 9th, 11th
      fillRgba = 'rgba(236, 72, 153, 0.18)';
      strokeRgba = 'rgba(236, 72, 153, 0.50)';
    } else if (isSus) {
      baseColor = '#10b981'; // Emerald for Sus chords
      fillRgba = 'rgba(16, 185, 129, 0.18)';
      strokeRgba = 'rgba(16, 185, 129, 0.50)';
    } else if (isMinor) {
      baseColor = '#a855f7'; // Purple for Minor
      fillRgba = 'rgba(168, 85, 247, 0.18)';
      strokeRgba = 'rgba(168, 85, 247, 0.50)';
    }

    if (isActive) {
      fillRgba = fillRgba.replace('0.15', '0.45').replace('0.18', '0.45');
      strokeRgba = baseColor;
    }

    return { baseColor, fillRgba, strokeRgba };
  }

  render() {
    if (!this.canvas || !this.ctx) return;
    const w = this.displayWidth;
    const h = this.displayHeight;
    const ctx = this.ctx;

    // 1. Clear background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, w, h);

    // 2. Empty state fallback
    if (!this.chords || this.chords.length === 0 || this.duration <= 0) {
      ctx.fillStyle = '#475569';
      ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Waiting for audio analysis to display chord timeline...', w / 2, h / 2);
      return;
    }

    // 3. Render Downbeat grid dividers
    if (this.downbeats && this.downbeats.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      this.downbeats.forEach((dTime) => {
        const dx = (dTime / this.duration) * w;
        ctx.beginPath();
        ctx.moveTo(dx, 0);
        ctx.lineTo(dx, h);
        ctx.stroke();
      });
      ctx.restore();
    }

    // 4. Render Chord Blocks
    this.chords.forEach((seg) => {
      const startX = (seg.start / this.duration) * w;
      const endX = (seg.end / this.duration) * w;
      const blockWidth = Math.max(endX - startX, 2);
      const isActive = this.currentTime >= seg.start && this.currentTime < seg.end;
      const chordName = seg.chord || 'N.C.';
      const colors = this.getChordColors(chordName, isActive);

      ctx.save();

      // Active Glow
      if (isActive) {
        ctx.shadowBlur = 14;
        ctx.shadowColor = colors.baseColor;
        ctx.lineWidth = 2;
      } else {
        ctx.lineWidth = 1;
      }

      ctx.fillStyle = colors.fillRgba;
      ctx.strokeStyle = colors.strokeRgba;

      // Draw Rounded Rectangle
      const radius = 6;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(startX + 1, 6, blockWidth - 2, h - 12, radius);
      } else {
        ctx.rect(startX + 1, 6, blockWidth - 2, h - 12);
      }
      ctx.fill();
      ctx.stroke();

      // Chord Label
      ctx.fillStyle = isActive ? '#ffffff' : '#e2e8f0';
      ctx.font = isActive ? 'bold 14px monospace' : 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(chordName, startX + blockWidth / 2, h / 2 - 4);

      // Start Time Timestamp
      ctx.font = '9px monospace';
      ctx.fillStyle = isActive ? colors.baseColor : '#64748b';
      ctx.fillText(seg.start.toFixed(1) + 's', startX + blockWidth / 2, h - 14);

      ctx.restore();
    });

    // 5. Playhead Line
    const playheadX = (this.currentTime / this.duration) * w;
    ctx.save();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();

    // Top Playhead Indicator Pin
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(playheadX - 6, 0);
    ctx.lineTo(playheadX + 6, 0);
    ctx.lineTo(playheadX, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

window.ChordTimelineEngine = ChordTimelineEngine;
