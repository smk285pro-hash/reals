"use client";

import React, { useState } from "react";
import { DeepAnalysisResponse, ChordSegment } from "@/lib/audio-lab/types";

interface ExportDrawerProps {
  taskId: string;
  deepResult: DeepAnalysisResponse | null;
  editedChords: ChordSegment[];
  currentTranspose: number;
}

const API_BASE =
  process.env.NEXT_PUBLIC_AUDIO_LAB_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://smk285pro--ai-audio-lab-fastapi-web.modal.run";

export const ExportDrawer: React.FC<ExportDrawerProps> = ({
  taskId,
  deepResult,
  editedChords,
  currentTranspose,
}) => {
  const [useEditedChords, setUseEditedChords] = useState<boolean>(true);

  const handleDownloadCustomJson = () => {
    if (!deepResult) return;

    const payload = {
      ...deepResult,
      transpose_semitones: currentTranspose,
      chords: useEditedChords ? editedChords : deepResult.chords,
      exported_at: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analysis_${taskId}_studio.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full bg-[#12121a] border border-zinc-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center space-x-2">
          <span className="text-base font-bold text-zinc-100 flex items-center space-x-2">
            <span>💾</span>
            <span>Trung Tâm Xuất Bản (Export Studio Center)</span>
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <input
            id="use-edited-chords"
            type="checkbox"
            checked={useEditedChords}
            onChange={(e) => setUseEditedChords(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-0 cursor-pointer"
          />
          <label htmlFor="use-edited-chords" className="text-xs text-zinc-300 cursor-pointer select-none">
            Áp dụng hợp âm đã chỉnh sửa / dịch giọng
          </label>
        </div>
      </div>

      {/* Export Action Buttons Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 1. MIDI Export */}
        <a
          href={`${API_BASE}/api/export/midi/${taskId}`}
          download={`multi_track_${taskId}.mid`}
          className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 hover:border-amber-500/50 transition group shadow-sm cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-sm">
              MID
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-200 group-hover:text-amber-400 transition">
                Multi-track MIDI (SMF-1)
              </h4>
              <p className="text-[10px] text-zinc-400">3 tracks: Chords, Bass, Metronome</p>
            </div>
          </div>
          <span className="text-xs text-zinc-500 group-hover:text-zinc-300">↓</span>
        </a>

        {/* 2. Stems ZIP Export */}
        <a
          href={`${API_BASE}/api/export/stems-zip/${taskId}`}
          download={`stems_${taskId}.zip`}
          className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 hover:border-purple-500/50 transition group shadow-sm cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-black text-sm">
              ZIP
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-200 group-hover:text-purple-400 transition">
                Trọn bộ Audio Stems (ZIP)
              </h4>
              <p className="text-[10px] text-zinc-400">Tất cả tệp WAV chất lượng 44.1kHz</p>
            </div>
          </div>
          <span className="text-xs text-zinc-500 group-hover:text-zinc-300">↓</span>
        </a>

        {/* 3. JSON Export */}
        {useEditedChords ? (
          <button
            type="button"
            onClick={handleDownloadCustomJson}
            className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 hover:border-indigo-500/50 transition group shadow-sm text-left cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-sm">
                JSON
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-200 group-hover:text-indigo-400 transition">
                  Dữ liệu phân tích (JSON Studio)
                </h4>
                <p className="text-[10px] text-zinc-400">Chứa hợp âm đã chỉnh sửa & dịch</p>
              </div>
            </div>
            <span className="text-xs text-zinc-500 group-hover:text-zinc-300">↓</span>
          </button>
        ) : (
          <a
            href={`${API_BASE}/api/export/json/${taskId}`}
            download={`analysis_${taskId}.json`}
            className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 hover:border-indigo-500/50 transition group shadow-sm cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-sm">
                JSON
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-200 group-hover:text-indigo-400 transition">
                  Dữ liệu phân tích (JSON gốc)
                </h4>
                <p className="text-[10px] text-zinc-400">Dữ liệu thô từ bộ máy DSP & AI</p>
              </div>
            </div>
            <span className="text-xs text-zinc-500 group-hover:text-zinc-300">↓</span>
          </a>
        )}
      </div>
    </div>
  );
};
