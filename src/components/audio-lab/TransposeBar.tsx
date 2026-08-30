"use client";

import React from "react";
import { transposeChord } from "@/lib/audio-lab/music-theory";

interface TransposeBarProps {
  currentTranspose: number;
  originalKey: string;
  originalMode: "major" | "minor";
  onTransposeChange: (semitones: number) => void;
}

export const TransposeBar: React.FC<TransposeBarProps> = ({
  currentTranspose,
  originalKey,
  originalMode,
  onTransposeChange,
}) => {
  const semitoneSteps = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

  // Calculate transposed key name
  const isMinor = originalMode === "minor";
  const dummyChord = isMinor ? `${originalKey}m` : originalKey;
  const transposedKeyDisplay = transposeChord(dummyChord, currentTranspose);

  return (
    <div className="w-full bg-[#12121a] border border-zinc-800 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-md">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-sm">
          ♯♭
        </div>
        <div>
          <span className="text-xs font-bold uppercase text-zinc-300 tracking-wider">
            Dịch Giọng Toàn Diện (Instant Transpose Engine)
          </span>
          <p className="text-[11px] text-zinc-400">
            Hiện tại:{" "}
            <span className="font-bold text-amber-400">
              {currentTranspose === 0 ? "Tone gốc" : `${currentTranspose > 0 ? `+${currentTranspose}` : currentTranspose} bán cung`}
            </span>{" "}
            →{" "}
            <span className="font-extrabold text-purple-300">{transposedKeyDisplay}</span>
          </p>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap items-center gap-1 bg-zinc-900/90 border border-zinc-800 p-1.5 rounded-xl">
        {semitoneSteps.map((step) => {
          const isSelected = currentTranspose === step;
          const isZero = step === 0;

          return (
            <button
              key={step}
              type="button"
              onClick={() => onTransposeChange(step)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                isSelected
                  ? "bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/40 scale-105"
                  : isZero
                  ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  : "bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
              title={isZero ? "Khôi phục tone gốc (0)" : `Dịch ${step > 0 ? `+${step}` : step} bán cung`}
            >
              {isZero ? "0" : step > 0 ? `+${step}` : step}
            </button>
          );
        })}
      </div>
    </div>
  );
};
