"use client";

import React, { useEffect, useState } from "react";
import { getHealth, HealthResponse } from "@/lib/audio-lab/api-client";

interface HeaderProps {
  onReset: () => void;
  isProcessing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onReset, isProcessing = false }) => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    const check = async () => {
      try {
        const data = await getHealth();
        if (isMounted) {
          setHealth(data);
          setIsOnline(data.status === "ok");
        }
      } catch {
        if (isMounted) {
          setIsOnline(false);
        }
      }
    };

    void check();
    const interval = setInterval(check, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="w-full bg-[#12121a]/90 backdrop-blur-md border-b border-zinc-800/80 px-3 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 sticky top-14 z-40">
      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
        <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-amber-500 via-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
          <span className="text-white font-black text-lg tracking-tighter">⚡</span>
        </div>
        <div className="min-w-0">
          <h1 className="font-extrabold text-base sm:text-lg tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-purple-300 to-indigo-300 whitespace-nowrap">
            AI AUDIO LAB <span className="hidden sm:inline text-xs font-semibold text-amber-500/90 ml-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">STUDIO 2026</span>
          </h1>
          <p className="hidden sm:block text-[11px] text-zinc-400 font-medium tracking-tight truncate">
            DSP & AI Demucs Multi-Track Stem Separator & Viterbi Chord Analyzer
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-4">
        {/* Backend & GPU Status Indicator */}
        <div className="flex items-center space-x-2 bg-zinc-900/90 px-2.5 sm:px-3 py-1.5 rounded-full border border-zinc-800 text-xs">
          <span
            className={`w-2.5 h-2.5 shrink-0 rounded-full ${
              isOnline ? "bg-emerald-500 shadow-sm shadow-emerald-500/80 animate-pulse" : "bg-red-500 shadow-sm shadow-red-500/80"
            }`}
          />
          <span className="hidden md:inline text-zinc-300 font-medium">{isOnline ? "Backend Connected" : "Disconnected"}</span>
          <span className="hidden md:inline text-zinc-600">|</span>
          <span
            className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
              health?.gpu_available
                ? "bg-purple-950 text-purple-300 border border-purple-800/60 shadow-xs shadow-purple-500/30"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700"
            }`}
          >
            {health?.gpu_available ? "GPU" : "CPU"}
          </span>
        </div>

        {/* Reset Project Button */}
        <button
          type="button"
          onClick={onReset}
          disabled={isProcessing}
          className="px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800/80 hover:bg-red-950/80 hover:text-red-300 hover:border-red-800/60 border border-zinc-700 transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none flex items-center space-x-1.5 cursor-pointer"
          title="Xóa phiên làm việc hiện tại và bắt đầu dự án mới"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="hidden sm:inline">Làm mới (Reset)</span>
        </button>
      </div>
    </header>
  );
};
