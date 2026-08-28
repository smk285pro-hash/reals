"use client";

import React from "react";
import { FeatureMode, StemMode } from "@/lib/types";

interface FeatureModePickerProps {
  mode: FeatureMode;
  onChange: (mode: FeatureMode) => void;
  stemMode: StemMode;
  onStemModeChange: (mode: StemMode) => void;
  denoiseStrength: number;
  onDenoiseStrengthChange: (strength: number) => void;
  disabled?: boolean;
}

interface ModeCard {
  id: FeatureMode;
  icon: string;
  title: string;
  description: string;
  badge?: string;
  disabled?: boolean;
}

const MODE_CARDS: ModeCard[] = [
  {
    id: "all",
    icon: "⚡",
    title: "Tất cả (Combo)",
    description: "Tempo, Key, Hợp âm, Tách stem & Mixer — quy trình đầy đủ",
  },
  {
    id: "tempo",
    icon: "🎼",
    title: "Tempo & Key",
    description: "Chỉ dò BPM, giọng chủ & điệu thức — siêu nhanh (<2s)",
  },
  {
    id: "chords",
    icon: "🎹",
    title: "Hợp âm",
    description: "Chỉ giải mã tiến trình hợp âm (Viterbi) — bỏ qua tách stem",
  },
  {
    id: "stems",
    icon: "🎚️",
    title: "Tách nhạc",
    description: "Chỉ tách stem AI (Demucs) — bỏ qua phân tích hợp âm",
  },
  {
    id: "denoise",
    icon: "🧹",
    title: "Lọc nhiễu",
    description: "Khử noise & hum bằng DeepFilterNet (SOTA AI)",
  },
];

export const FeatureModePicker: React.FC<FeatureModePickerProps> = ({
  mode,
  onChange,
  stemMode,
  onStemModeChange,
  denoiseStrength,
  onDenoiseStrengthChange,
  disabled = false,
}) => {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 space-y-3">
      <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 text-center">
        Chọn tính năng muốn sử dụng
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {MODE_CARDS.map((card) => {
          const isActive = mode === card.id;
          const isDisabled = disabled || card.disabled;
          return (
            <button
              key={card.id}
              type="button"
              disabled={isDisabled}
              onClick={() => onChange(card.id)}
              className={`relative flex flex-col items-center text-center p-3.5 rounded-xl border transition-all duration-150 ${
                isActive
                  ? "bg-amber-500/10 border-amber-500/60 shadow-md shadow-amber-900/20"
                  : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/90"
              } ${isDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {card.badge && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700/60">
                  {card.badge}
                </span>
              )}
              <span className="text-2xl mb-1.5">{card.icon}</span>
              <span
                className={`text-xs font-bold ${isActive ? "text-amber-300" : "text-zinc-200"}`}
              >
                {card.title}
              </span>
              <span className="text-[10px] text-zinc-500 mt-1 leading-snug">
                {card.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stem mode selector appears upfront when stems-only mode is chosen */}
      {mode === "stems" && (
        <div className="flex items-center justify-center space-x-2 text-xs pt-1">
          <label htmlFor="picker-stem-mode" className="text-zinc-400 font-medium">
            Chế độ Stem:
          </label>
          <select
            id="picker-stem-mode"
            value={stemMode}
            disabled={disabled}
            onChange={(e) => onStemModeChange(e.target.value as StemMode)}
            className="max-w-[220px] sm:max-w-none truncate bg-zinc-900 text-zinc-200 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-amber-500 cursor-pointer disabled:opacity-50"
          >
            <option value="2">2 Stems (Vocals / Instrumental)</option>
            <option value="4">4 Stems chuẩn (Vocals, Drums, Bass, Other)</option>
            <option value="6">6 Stems (Thêm Guitar, Piano - cần GPU)</option>
            <option value="8">8 Stems (Toàn diện - cần GPU)</option>
          </select>
        </div>
      )}

      {/* Denoise strength slider appears upfront when denoise mode is chosen */}
      {mode === "denoise" && (
        <div className="flex items-center justify-center space-x-3 text-xs pt-1">
          <label htmlFor="picker-denoise-strength" className="text-zinc-400 font-medium whitespace-nowrap">
            Cường độ lọc:
          </label>
          <input
            id="picker-denoise-strength"
            type="range"
            min={0}
            max={100}
            step={5}
            value={denoiseStrength}
            disabled={disabled}
            onChange={(e) => onDenoiseStrengthChange(Number(e.target.value))}
            className="w-40 sm:w-56 accent-emerald-500 cursor-pointer disabled:opacity-50"
          />
          <span className="text-emerald-400 font-bold font-mono w-10 text-right">
            {denoiseStrength}%
          </span>
        </div>
      )}
    </div>
  );
};
