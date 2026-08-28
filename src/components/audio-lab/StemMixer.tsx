"use client";

import React, { useEffect, useRef, useState } from "react";
import { audioEngine, TrackState } from "@/lib/web-audio-engine";
import { StemManifest } from "@/lib/types";

interface StemMixerProps {
  manifest: StemManifest;
  duration: number;
}

export const StemMixer: React.FC<StemMixerProps> = ({ manifest, duration }) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [, setTick] = useState<number>(0);

  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Subscribe to audio engine updates
  useEffect(() => {
    const handleTime = (t: number) => {
      setCurrentTime(t);
      setIsPlaying(audioEngine.isPlaying);
    };

    audioEngine.onTimeUpdate = handleTime;
    audioEngine.onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const timer = setInterval(() => {
      if (audioEngine.isPlaying) {
        setCurrentTime(audioEngine.currentTime);
      }
      setIsPlaying(audioEngine.isPlaying);
    }, 100);

    return () => {
      clearInterval(timer);
      // Release singleton callbacks so unmounted component stops receiving events
      audioEngine.onTimeUpdate = undefined;
      audioEngine.onEnded = undefined;
    };
  }, []);

  // VU Meter Render Loop (rAF)
  useEffect(() => {
    let animId: number;

    const renderVUs = () => {
      manifest &&
        Object.keys(manifest.stems).forEach((stemName) => {
          const canvas = canvasRefs.current.get(stemName);
          if (!canvas) return;

          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          // Background
          ctx.fillStyle = "#18181b";
          ctx.fillRect(0, 0, w, h);

          const db = audioEngine.getLevel(stemName);
          // Map -60dB..+6dB to 0..h
          const norm = Math.max(0, Math.min(1, (db + 60) / 66));
          const barH = norm * h;

          // Gradient: Green (-60..-12dB) -> Yellow (-12..-3dB) -> Red (>0dB)
          const grad = ctx.createLinearGradient(0, h, 0, 0);
          grad.addColorStop(0, "#22c55e");
          grad.addColorStop(0.7, "#eab308");
          grad.addColorStop(1, "#ef4444");

          ctx.fillStyle = grad;
          ctx.fillRect(0, h - barH, w, barH);
        });

      animId = requestAnimationFrame(renderVUs);
    };

    renderVUs();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [manifest]);

  const handlePlayPause = () => {
    if (audioEngine.isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      audioEngine.play();
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m}:${s < 10 ? "0" : ""}${s}.${ms}`;
  };

  const getStemLabel = (name: string) => {
    const map: Record<string, string> = {
      vocals: "Vocals (Giọng hát)",
      drums: "Drums (Bộ gõ)",
      bass: "Bass (Âm trầm)",
      other: "Other (Phối khí)",
      guitar: "Guitar (Bộ dây)",
      piano: "Piano (Dương cầm)",
      instrumental: "Instrumental (Beat)",
    };
    return map[name] || name.toUpperCase();
  };

  return (
    <div className="w-full bg-[#12121a] border border-zinc-800 rounded-xl p-5 shadow-lg space-y-5">
      {/* Top Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handlePlayPause}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white font-bold flex items-center justify-center shadow-md shadow-purple-900/40 transition active:scale-95"
            title={isPlaying ? "Tạm dừng (Space)" : "Phát (Space)"}
          >
            {isPlaying ? (
              <span className="text-sm">⏸</span>
            ) : (
              <span className="text-sm ml-0.5">▶</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleStop}
            className="w-9 h-9 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center border border-zinc-700 transition"
            title="Dừng và tua về đầu"
          >
            <span className="text-xs">⏹</span>
          </button>

          {/* Time Display */}
          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg text-xs font-mono font-bold">
            <span className="text-amber-400">{formatTime(currentTime)}</span>
            <span className="text-zinc-600 mx-1.5">/</span>
            <span className="text-zinc-400">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Bàn Trộn Đa Kênh (Stem Mixer • Mode {manifest.mode})
          </span>
        </div>
      </div>

      {/* Dynamic Stems Rack */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {Object.entries(manifest.stems).map(([stemName, info]) => {
          const state: TrackState = audioEngine.getTrackState(stemName) || {
            volumeDb: 0,
            pan: 0,
            isMuted: false,
            isSolo: false,
          };

          return (
            <div
              key={stemName}
              className="bg-[#0e0e16] border border-zinc-800/80 rounded-xl p-3 flex flex-col items-center space-y-3 shadow-inner relative group"
            >
              {/* Channel Header */}
              <div className="flex items-center space-x-1.5 w-full justify-center">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: info.color }}
                />
                <span className="text-[11px] font-bold text-zinc-200 truncate" title={getStemLabel(stemName)}>
                  {stemName.toUpperCase()}
                </span>
              </div>

              {/* Fader & VU Meter Section */}
              <div className="flex items-center justify-center space-x-2.5 h-44 py-1">
                {/* VU Meter Canvas */}
                <canvas
                  ref={(el) => {
                    if (el) {
                      canvasRefs.current.set(stemName, el);
                    } else {
                      canvasRefs.current.delete(stemName);
                    }
                  }}
                  width={6}
                  height={150}
                  className="rounded-sm border border-zinc-800"
                />

                {/* Vertical Fader */}
                <div className="h-36 w-8 flex items-center justify-center relative">
                  <input
                    type="range"
                    min="-60"
                    max="6"
                    step="0.5"
                    value={state.volumeDb}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      audioEngine.setTrackVolume(stemName, val);
                      setTick((t) => t + 1);
                    }}
                    className="vertical-fader w-36 h-2 -rotate-90 origin-center"
                    title={`Âm lượng: ${state.volumeDb.toFixed(1)} dB`}
                  />
                </div>
              </div>

              {/* dB Label */}
              <div className="text-[10px] font-mono text-zinc-400">
                {state.volumeDb <= -60 ? "-∞ dB" : `${state.volumeDb > 0 ? `+${state.volumeDb.toFixed(1)}` : state.volumeDb.toFixed(1)} dB`}
              </div>

              {/* Mute & Solo Toggles */}
              <div className="flex items-center space-x-1.5 w-full">
                <button
                  type="button"
                  onClick={() => {
                    audioEngine.setTrackMute(stemName, !state.isMuted);
                    setTick((t) => t + 1);
                  }}
                  className={`flex-1 py-1 rounded text-[10px] font-extrabold transition ${
                    state.isMuted
                      ? "bg-red-600 text-white shadow-sm shadow-red-600/50"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                  title="Tắt tiếng kênh (Mute)"
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => {
                    audioEngine.setTrackSolo(stemName, !state.isSolo);
                    setTick((t) => t + 1);
                  }}
                  className={`flex-1 py-1 rounded text-[10px] font-extrabold transition ${
                    state.isSolo
                      ? "bg-amber-500 text-zinc-950 shadow-sm shadow-amber-500/50"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                  title="Phát đơn kênh (Solo)"
                >
                  S
                </button>
              </div>

              {/* Pan Slider */}
              <div className="w-full space-y-1">
                <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                  <span>L</span>
                  <span>{state.pan === 0 ? "C" : state.pan > 0 ? `R${Math.round(state.pan * 100)}` : `L${Math.round(Math.abs(state.pan) * 100)}`}</span>
                  <span>R</span>
                </div>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={state.pan}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    audioEngine.setTrackPan(stemName, val);
                    setTick((t) => t + 1);
                  }}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
