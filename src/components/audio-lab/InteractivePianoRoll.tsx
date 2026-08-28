"use client";

import React from "react";
import { chordToPitchClasses, ParsedChord, pcToName } from "@/lib/music-theory";
import { audioEngine } from "@/lib/web-audio-engine";

interface InteractivePianoRollProps {
  activeChord: ParsedChord | null;
  activeChordName?: string;
}

export const InteractivePianoRoll: React.FC<InteractivePianoRollProps> = ({
  activeChord,
  activeChordName,
}) => {
  // 3 Octaves: C3 (MIDI 48) to B5 (MIDI 83)
  const startMidi = 48;
  const numOctaves = 3;
  const whiteKeyWidth = 24;
  const whiteKeyHeight = 100;
  const blackKeyWidth = 14;
  const blackKeyHeight = 62;

  // Active pitch class highlights
  const activePitchClasses = new Set<number>();
  let activeBassPc: number | null = null;

  if (activeChord) {
    const intervals = chordToPitchClasses(activeChord.quality);
    intervals.forEach((interval) => {
      activePitchClasses.add((activeChord.rootPc + interval) % 12);
    });
    activeBassPc = activeChord.bassPc !== null ? activeChord.bassPc : activeChord.rootPc;
  }

  // Generate piano keys structure
  const whiteKeys: { midi: number; pc: number; x: number }[] = [];
  const blackKeys: { midi: number; pc: number; x: number }[] = [];

  let currentWhiteX = 0;
  const isBlackNote = (pc: number) => [1, 3, 6, 8, 10].includes(pc);

  for (let octave = 0; octave < numOctaves; octave++) {
    for (let note = 0; note < 12; note++) {
      const midi = startMidi + octave * 12 + note;
      const pc = note;

      if (!isBlackNote(pc)) {
        whiteKeys.push({ midi, pc, x: currentWhiteX });
        currentWhiteX += whiteKeyWidth;
      }
    }
  }

  // Calculate black key X positions relative to white keys
  let wIndex = 0;
  for (let octave = 0; octave < numOctaves; octave++) {
    for (let note = 0; note < 12; note++) {
      const midi = startMidi + octave * 12 + note;
      const pc = note;

      if (isBlackNote(pc)) {
        // Black key sits on the border between previous white key and current white key
        const xPos = whiteKeys[wIndex].x - blackKeyWidth / 2;
        blackKeys.push({ midi, pc, x: xPos });
      } else {
        wIndex += 1;
      }
    }
  }

  const totalSvgWidth = currentWhiteX;

  // Synthesize preview tone on key click
  const handleKeyClick = (midi: number) => {
    try {
      const ctx = audioEngine.ensureContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.type = "sine";

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {
      // AudioContext not ready or error
    }
  };

  return (
    <div className="w-full bg-[#12121a] border border-zinc-800 rounded-xl p-4 shadow-lg space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center space-x-2 min-w-0 flex-wrap gap-y-1">
          <span className="text-xs font-bold uppercase text-zinc-300 tracking-wider">
            Bàn Phím Piano Thời Gian Thực (Active Voicing)
          </span>
          {activeChordName && (
            <span className="text-xs font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded">
              {activeChordName}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-3 text-[10px] text-zinc-400">
          <div className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            <span>Nốt hòa âm</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block border border-white" />
            <span>Nốt Bass</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto py-2 flex justify-center">
        <svg
          width={totalSvgWidth}
          height={whiteKeyHeight + 10}
          className="select-none rounded-lg shadow-md bg-[#0a0a0f] border border-zinc-800"
        >
          {/* White Keys */}
          {whiteKeys.map((k) => {
            const isBass = k.pc === activeBassPc;
            const isChord = activePitchClasses.has(k.pc);

            let fill = "#f4f4f5";
            let stroke = "#27272a";
            let strokeWidth = 1;

            if (isBass) {
              fill = "#ef4444";
              stroke = "#ffffff";
              strokeWidth = 2;
            } else if (isChord) {
              fill = "#fbbf24";
            }

            return (
              <g key={k.midi} onClick={() => handleKeyClick(k.midi)} className="cursor-pointer group">
                <rect
                  x={k.x}
                  y={0}
                  width={whiteKeyWidth}
                  height={whiteKeyHeight}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  rx={2}
                  className="transition-colors duration-100"
                />
                {k.pc === 0 && (
                  <text
                    x={k.x + whiteKeyWidth / 2}
                    y={whiteKeyHeight - 8}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="bold"
                    fill={isChord || isBass ? "#18181b" : "#71717a"}
                  >
                    C{Math.floor(k.midi / 12) - 1}
                  </text>
                )}
              </g>
            );
          })}

          {/* Black Keys */}
          {blackKeys.map((k) => {
            const isBass = k.pc === activeBassPc;
            const isChord = activePitchClasses.has(k.pc);

            let fill = "#18181b";
            let stroke = "#3f3f46";
            let strokeWidth = 1;

            if (isBass) {
              fill = "#ef4444";
              stroke = "#ffffff";
              strokeWidth = 2;
            } else if (isChord) {
              fill = "#f59e0b";
            }

            return (
              <g key={k.midi} onClick={() => handleKeyClick(k.midi)} className="cursor-pointer group">
                <rect
                  x={k.x}
                  y={0}
                  width={blackKeyWidth}
                  height={blackKeyHeight}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  rx={2}
                  className="transition-colors duration-100"
                />
                <text
                  x={k.x + blackKeyWidth / 2}
                  y={blackKeyHeight - 6}
                  textAnchor="middle"
                  fontSize="7"
                  fontWeight="bold"
                  fill="#71717a"
                >
                  {pcToName(k.pc)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
