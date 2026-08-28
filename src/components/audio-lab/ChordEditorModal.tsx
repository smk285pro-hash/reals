"use client";

import React, { useEffect, useState } from "react";
import { parseChord, formatChord } from "@/lib/music-theory";
import { ChordSegment } from "@/lib/types";

interface ChordEditorModalProps {
  isOpen: boolean;
  chordIndex: number;
  currentSegment: ChordSegment | null;
  onSaved: (index: number, newChordStr: string) => void;
  onClose: () => void;
}

export const ChordEditorModal: React.FC<ChordEditorModalProps> = ({
  isOpen,
  chordIndex,
  currentSegment,
  onSaved,
  onClose,
}) => {
  const [inputText, setInputText] = useState<string>("");
  const [isValid, setIsValid] = useState<boolean>(true);
  const [previewName, setPreviewName] = useState<string>("");

  useEffect(() => {
    if (currentSegment) {
      setInputText(currentSegment.chord);
      const parsed = parseChord(currentSegment.chord);
      setIsValid(parsed !== null || currentSegment.chord === "N");
      setPreviewName(parsed ? formatChord(parsed.rootPc, parsed.quality, parsed.bassPc) : currentSegment.chord);
    }
  }, [currentSegment]);

  if (!isOpen || !currentSegment) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setInputText(val);

    if (val === "N" || val === "") {
      setIsValid(true);
      setPreviewName("N (Không xác định / Yên lặng)");
      return;
    }

    const parsed = parseChord(val);
    if (parsed) {
      setIsValid(true);
      setPreviewName(formatChord(parsed.rootPc, parsed.quality, parsed.bassPc));
    } else {
      setIsValid(false);
      setPreviewName("Hợp âm không hợp lệ!");
    }
  };

  const handleSave = () => {
    if (isValid && inputText) {
      onSaved(chordIndex, inputText);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const quickChords = ["C", "Dm", "Em", "F", "G", "Am", "Bdim", "Cmaj7", "G7", "F#m", "Bb", "Eb"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-[#14141e] border border-zinc-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="text-base font-bold text-zinc-100 flex items-center space-x-2">
            <span>✏️</span>
            <span>Chỉnh sửa Hợp âm đoạn #{chordIndex + 1}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 font-bold text-lg p-1"
          >
            ✕
          </button>
        </div>

        {/* Time Info */}
        <div className="text-xs text-zinc-400 font-mono bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800 flex flex-wrap justify-between gap-x-3 gap-y-1">
          <span>Bắt đầu: {currentSegment.start.toFixed(2)}s</span>
          <span>Kết thúc: {currentSegment.end.toFixed(2)}s</span>
        </div>

        {/* Input */}
        <div className="space-y-2">
          <label htmlFor="chord-input" className="block text-xs font-semibold text-zinc-300">
            Tên hợp âm (Ví dụ: C, Am, G/B, F#m7, Bbmaj7, N):
          </label>
          <input
            id="chord-input"
            type="text"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            autoFocus
            className={`w-full bg-zinc-900 border rounded-xl px-4 py-2.5 text-lg font-bold font-mono text-zinc-100 focus:outline-none transition ${
              isValid ? "border-emerald-500 focus:ring-1 focus:ring-emerald-500" : "border-red-500 focus:ring-1 focus:ring-red-500"
            }`}
          />
          <div className="flex items-center justify-between text-xs">
            <span className={isValid ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
              {previewName}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Nhấn Enter để Lưu</span>
          </div>
        </div>

        {/* Quick Pick Chips */}
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase font-bold text-zinc-500">Gợi ý hợp âm nhanh:</span>
          <div className="flex flex-wrap gap-1.5">
            {quickChords.map((qc) => (
              <button
                key={qc}
                type="button"
                onClick={() => {
                  setInputText(qc);
                  setIsValid(true);
                  const p = parseChord(qc);
                  setPreviewName(p ? formatChord(p.rootPc, p.quality, p.bassPc) : qc);
                }}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono font-bold text-zinc-300 border border-zinc-700 transition"
              >
                {qc}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid || !inputText}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white shadow-md shadow-emerald-900/30 transition"
          >
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  );
};
