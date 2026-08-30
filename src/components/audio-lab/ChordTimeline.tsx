"use client";

import React, { useEffect, useRef, useState } from "react";
import { audioEngine } from "@/lib/audio-lab/web-audio-engine";
import { ChordSegment } from "@/lib/audio-lab/types";

interface ChordTimelineProps {
  chords: ChordSegment[];
  duration: number;
  onEditChord: (index: number) => void;
  onSeek?: (time: number) => void;
}

export const ChordTimeline: React.FC<ChordTimelineProps> = ({
  chords,
  duration,
  onEditChord,
  onSeek,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const lastClickRef = useRef<{ time: number; idx: number }>({ time: 0, idx: -1 });

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

  const getChordColor = (chordStr: string, quality: string) => {
    if (chordStr === "N") return { bg: "rgba(39, 39, 42, 0.6)", text: "#a1a1aa", border: "#3f3f46" };
    if (quality.includes("min") || quality === "min7") {
      return { bg: "rgba(167, 139, 250, 0.2)", text: "#c4b5fd", border: "#a78bfa" }; // Purple
    }
    if (quality === "7" || quality === "9" || quality === "add9") {
      return { bg: "rgba(251, 191, 36, 0.2)", text: "#fde68a", border: "#fbbf24" }; // Amber
    }
    if (quality.includes("dim") || quality === "aug" || quality === "m7b5") {
      return { bg: "rgba(248, 113, 113, 0.2)", text: "#fca5a5", border: "#f87171" }; // Red
    }
    if (quality.includes("sus") || quality === "6") {
      return { bg: "rgba(56, 189, 248, 0.2)", text: "#7dd3fc", border: "#38bdf8" }; // Cyan
    }
    // Major
    return { bg: "rgba(52, 211, 153, 0.2)", text: "#6ee7b7", border: "#34d399" }; // Emerald
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;
    if (containerWidth <= 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const height = 64;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = containerWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${height}px`;

    const render = () => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, containerWidth, height);

      const currentTime = audioEngine.currentTime;

      if (chords.length === 0) {
        ctx.fillStyle = "#71717a";
        ctx.font = "13px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Không có dữ liệu hợp âm", containerWidth / 2, height / 2);
      } else {
        chords.forEach((seg) => {
          const xStart = (seg.start / duration) * containerWidth;
          const xEnd = (seg.end / duration) * containerWidth;
          const w = Math.max(1, xEnd - xStart);

          const isActive = currentTime >= seg.start && currentTime < seg.end;
          const colors = getChordColor(seg.chord, seg.quality || "");

          // Chord Block Background
          ctx.fillStyle = colors.bg;
          ctx.fillRect(xStart, 0, w, height);

          // Border
          if (isActive) {
            ctx.save();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2.5;
            ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
            ctx.shadowBlur = 12;
            ctx.strokeRect(xStart + 1, 1, w - 2, height - 2);
            ctx.restore();
          } else {
            ctx.strokeStyle = colors.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(xStart, 0, w, height);
          }

          // Chord Name Text
          ctx.fillStyle = isActive ? "#ffffff" : colors.text;
          ctx.font = `bold ${w < 35 ? "10px" : "13px"} monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const label = seg.chord;
          if (w >= 20) {
            ctx.fillText(label, xStart + w / 2, height / 2 - 4);
          }

          // Confidence Indicator Bar (3px at bottom)
          const conf = Math.max(0, Math.min(1, seg.confidence || 0));
          ctx.fillStyle = colors.border;
          ctx.fillRect(xStart + 2, height - 6, (w - 4) * conf, 3);
        });
      }

      // Red Playhead Indicator
      const playheadX = (currentTime / duration) * containerWidth;
      ctx.beginPath();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [chords, duration, containerWidth]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickedTime = (clickX / containerWidth) * duration;

    // Find clicked chord segment index
    const clickedIdx = chords.findIndex((c) => clickedTime >= c.start && clickedTime <= c.end);
    const now = Date.now();

    if (
      clickedIdx !== -1 &&
      lastClickRef.current.idx === clickedIdx &&
      now - lastClickRef.current.time < 350
    ) {
      // Double Click -> Edit Modal
      onEditChord(clickedIdx);
      lastClickRef.current = { time: 0, idx: -1 };
    } else {
      // Single Click -> Seek
      if (clickedIdx !== -1) {
        audioEngine.seek(chords[clickedIdx].start);
        onSeek?.(chords[clickedIdx].start);
      } else {
        audioEngine.seek(clickedTime);
        onSeek?.(clickedTime);
      }
      lastClickRef.current = { time: now, idx: clickedIdx };
    }
  };

  return (
    <div ref={containerRef} className="w-full bg-[#12121a] border border-zinc-800 rounded-xl p-4 shadow-lg space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center space-x-2 min-w-0">
          <span className="text-xs font-bold uppercase text-zinc-300 tracking-wider">Tiến trình Hợp âm (Chord Sheet)</span>
          <span className="shrink-0 text-[10px] text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
            {chords.length} đoạn hợp âm
          </span>
        </div>
        <span className="hidden sm:inline text-[11px] text-zinc-500 italic">
          Nhấp đơn để tua • Nhấp đúp để chỉnh sửa hợp âm
        </span>
      </div>

      <div className="relative w-full rounded-lg overflow-hidden bg-[#0d0d14] border border-zinc-800">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="cursor-pointer block"
        />
      </div>
    </div>
  );
};
