"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { audioEngine } from "@/lib/web-audio-engine";
import { BeatPoint } from "@/lib/types";

interface WaveformPlayerProps {
  masterAudioUrl: string;
  waveformUrl?: string | null;
  duration: number;
  beats?: BeatPoint[];
  onSeek?: (time: number) => void;
}

const WAVE_HEIGHT = 96;

export const WaveformPlayer: React.FC<WaveformPlayerProps> = ({
  waveformUrl,
  duration,
  beats = [],
  onSeek,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pxPerSec, setPxPerSec] = useState<number>(50); // Zoom level
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [peaks, setPeaks] = useState<number[][]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch precomputed min/max peaks from the backend (single source of truth
  // for the waveform shape — same 44.1k master used by the beat detector).
  useEffect(() => {
    if (!waveformUrl) {
      setPeaks([]);
      return;
    }
    let cancelled = false;
    fetch(waveformUrl)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setPeaks(data as number[][]);
        }
      })
      .catch(() => {
        if (!cancelled) setPeaks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [waveformUrl]);

  // Measure container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const totalWidth = Math.max(containerWidth, duration * pxPerSec);

  // Pre-render the waveform shape to an offscreen canvas so the per-frame
  // loop only needs drawImage + composite ops instead of ~2000 rects/frame.
  const waveformLayer = useMemo(() => {
    if (typeof document === "undefined" || peaks.length === 0) return null;
    const dpr = window.devicePixelRatio || 1;
    const off = document.createElement("canvas");
    off.width = totalWidth * dpr;
    off.height = WAVE_HEIGHT * dpr;
    const octx = off.getContext("2d");
    if (!octx) return null;
    octx.scale(dpr, dpr);

    const barW = totalWidth / peaks.length;
    octx.fillStyle = "#3f3f46";
    for (let i = 0; i < peaks.length; i++) {
      const [mn, mx] = peaks[i];
      const x = i * barW;
      const yTop = ((1 - mx) / 2) * WAVE_HEIGHT;
      const yBot = ((1 - mn) / 2) * WAVE_HEIGHT;
      const h = Math.max(1, yBot - yTop);
      octx.fillRect(x, yTop, Math.max(1, barW - 0.5), h);
    }
    return off;
  }, [peaks, totalWidth]);

  // Render loop: waveform (with amber progress tint) + beat grid + playhead
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrameId: number;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = totalWidth * dpr;
    canvas.height = WAVE_HEIGHT * dpr;
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${WAVE_HEIGHT}px`;

    const render = () => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, totalWidth, WAVE_HEIGHT);

      // 1. Waveform: unplayed part in zinc, played part tinted amber.
      //    Both regions come from the SAME canvas coordinate system as the
      //    beat grid below, so grid lines always match the visible shape.
      if (waveformLayer) {
        const playheadX = audioEngine.currentTime * pxPerSec;
        ctx.drawImage(waveformLayer, 0, 0, totalWidth, WAVE_HEIGHT);
        if (playheadX > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, playheadX, WAVE_HEIGHT);
          ctx.clip();
          ctx.drawImage(waveformLayer, 0, 0, totalWidth, WAVE_HEIGHT);
          ctx.globalCompositeOperation = "source-atop";
          ctx.fillStyle = "#f59e0b";
          ctx.fillRect(0, 0, playheadX, WAVE_HEIGHT);
          ctx.restore();
        }
      }

      // 2. Beat grid lines
      let barCount = 1;
      let beatInBar = 0;
      beats.forEach((bp) => {
        const x = bp.timestamp * pxPerSec;
        if (x < -50 || x > totalWidth + 50) return;

        ctx.beginPath();
        if (bp.is_downbeat) {
          beatInBar = 0;
          // Downbeat: Gold Solid Line
          ctx.setLineDash([]);
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 2;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, WAVE_HEIGHT);
          ctx.stroke();

          ctx.fillStyle = "#fbbf24";
          ctx.font = "bold 9px monospace";
          ctx.fillText(`Bar ${barCount}`, x + 4, 12);
          barCount += 1;
        } else {
          beatInBar += 1;
          // Regular Beat: White Dashed Line
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
          ctx.lineWidth = 1;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, WAVE_HEIGHT);
          ctx.stroke();
        }

        // Beat number label on every beat (subtle)
        ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
        ctx.font = "7px monospace";
        const label = bp.is_downbeat ? "" : `${beatInBar}`;
        if (label && x > 0 && x < totalWidth - 10) {
          ctx.fillText(label, x + 2, WAVE_HEIGHT - 4);
        }
      });

      // 3. Playhead
      const playheadX = audioEngine.currentTime * pxPerSec;

      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, WAVE_HEIGHT);
      ctx.stroke();

      // Playhead Top Pointer Triangle
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(playheadX - 4, 0);
      ctx.lineTo(playheadX + 4, 0);
      ctx.lineTo(playheadX, 6);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
      animFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [waveformLayer, beats, duration, pxPerSec, totalWidth]);

  // Handle Seek click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // getBoundingClientRect already accounts for container scroll
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const targetTime = Math.max(0, Math.min(clickX / pxPerSec, duration));
    audioEngine.seek(targetTime);
    onSeek?.(targetTime);
  };

  return (
    <div className="w-full bg-[#12121a] border border-zinc-800 rounded-xl p-4 shadow-lg space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold uppercase text-zinc-300 tracking-wider">Sóng âm & Lưới nhịp (Beat Grid)</span>
          <span className="text-[10px] text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
            {beats.length} phách phát hiện
          </span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center space-x-2 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800 text-xs">
          <span className="text-zinc-500 text-[10px] uppercase font-bold">Zoom</span>
          <button
            type="button"
            onClick={() => setPxPerSec((prev) => Math.max(15, prev - 10))}
            className="w-5 h-5 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold"
          >
            -
          </button>
          <span className="text-zinc-300 font-mono w-8 text-center text-[11px]">{pxPerSec}x</span>
          <button
            type="button"
            onClick={() => setPxPerSec((prev) => Math.min(200, prev + 10))}
            className="w-5 h-5 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold"
          >
            +
          </button>
        </div>
      </div>

      {/* Waveform & Canvas Container (single scroll context for everything) */}
      <div ref={containerRef} className="relative w-full overflow-x-auto rounded-lg bg-[#0d0d14] border border-zinc-800/80">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="block cursor-crosshair"
        />
      </div>
    </div>
  );
};
