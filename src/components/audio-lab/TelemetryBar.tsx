"use client";

import React from "react";
import { StemMode, TelemetryData } from "@/lib/types";

interface TelemetryBarProps {
  telemetry: TelemetryData;
  transposeSemitones: number;
  warnings?: string[];
  stemMode: StemMode;
  onStemModeChange: (mode: StemMode) => void;
  onStartDeep?: () => void;
  isDeepRunning?: boolean;
  showDeepButton?: boolean;
}

export const TelemetryBar: React.FC<TelemetryBarProps> = ({
  telemetry,
  transposeSemitones,
  warnings = [],
  stemMode,
  onStemModeChange,
  onStartDeep,
  isDeepRunning = false,
  showDeepButton = false,
}) => {
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="w-full bg-[#12121a] border border-zinc-800 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-md">
      {/* Musical Stats */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        {/* BPM Card */}
        <div className="flex items-center space-x-2 bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 rounded-lg">
          <span className="text-zinc-500 font-semibold uppercase text-[10px]">BPM</span>
          <span className="text-amber-400 font-bold text-sm">{telemetry.bpm.toFixed(1)}</span>
        </div>

        {/* Master Key Badge */}
        <div className="flex items-center space-x-2 bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 rounded-lg">
          <span className="text-zinc-500 font-semibold uppercase text-[10px]">Key</span>
          <span className="font-extrabold text-sm text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-300">
            {telemetry.master_key} {telemetry.scale_mode === "major" ? "Major" : "Minor"}
          </span>
        </div>

        {/* Time Signature */}
        <div className="flex items-center space-x-2 bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 rounded-lg">
          <span className="text-zinc-500 font-semibold uppercase text-[10px]">Meter</span>
          <span className="text-zinc-200 font-bold text-sm">{telemetry.time_signature || "4/4"}</span>
        </div>

        {/* Duration */}
        <div className="flex items-center space-x-2 bg-zinc-900/90 border border-zinc-800 px-3 py-1.5 rounded-lg">
          <span className="text-zinc-500 font-semibold uppercase text-[10px]">Thời lượng</span>
          <span className="text-zinc-300 font-medium">{formatDuration(telemetry.duration)}</span>
        </div>

        {/* Transpose Shift */}
        {transposeSemitones !== 0 && (
          <div className="flex items-center space-x-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg text-amber-300">
            <span className="text-[10px] font-bold uppercase">Transpose</span>
            <span className="font-bold text-sm">
              {transposeSemitones > 0 ? `+${transposeSemitones}` : transposeSemitones}
            </span>
          </div>
        )}

        {/* Warnings Alert */}
        {warnings.length > 0 && (
          <div className="flex items-center space-x-1.5 bg-yellow-950/40 border border-yellow-800/60 px-3 py-1.5 rounded-lg text-yellow-400 text-xs" title={warnings.join(" | ")}>
            <span>⚠️</span>
            <span className="font-medium truncate max-w-xs">{warnings[0]}</span>
          </div>
        )}
      </div>

      {/* Stem Mode & Action Controls */}
      {showDeepButton && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center space-x-2 text-xs">
            <label htmlFor="stem-mode-select" className="text-zinc-400 font-medium whitespace-nowrap">
              Chế độ Stem:
            </label>
            <select
              id="stem-mode-select"
              value={stemMode}
              disabled={isDeepRunning}
              onChange={(e) => onStemModeChange(e.target.value as StemMode)}
              className="max-w-[180px] sm:max-w-none truncate bg-zinc-900 text-zinc-200 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-amber-500 cursor-pointer disabled:opacity-50"
            >
              <option value="2">2 Stems (Vocals / Instrumental)</option>
              <option value="4">4 Stems chuẩn (Vocals, Drums, Bass, Other)</option>
              <option value="6">6 Stems (Thêm Guitar, Piano - cần GPU)</option>
              <option value="8">8 Stems (Toàn diện - cần GPU)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onStartDeep}
            disabled={isDeepRunning}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white text-xs font-bold shadow-md shadow-purple-900/30 transition-all duration-150 disabled:opacity-50 flex items-center space-x-2 whitespace-nowrap"
          >
            {isDeepRunning ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Đang phân tích sâu...</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>Phân tích sâu (Deep AI)</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
