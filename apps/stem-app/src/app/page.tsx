"use client";

import React, { useEffect, useState, useRef } from "react";
import { Header } from "@/components/audio-lab/Header";
import { UploadZone } from "@/components/audio-lab/UploadZone";
import { FeatureModePicker } from "@/components/audio-lab/FeatureModePicker";
import { TelemetryBar } from "@/components/audio-lab/TelemetryBar";
import { WaveformPlayer } from "@/components/audio-lab/WaveformPlayer";
import { ChordTimeline } from "@/components/audio-lab/ChordTimeline";
import { StemMixer } from "@/components/audio-lab/StemMixer";
import { InteractivePianoRoll } from "@/components/audio-lab/InteractivePianoRoll";
import { ChordEditorModal } from "@/components/audio-lab/ChordEditorModal";
import { TransposeBar } from "@/components/audio-lab/TransposeBar";
import { ExportDrawer } from "@/components/audio-lab/ExportDrawer";

import {
  deleteSession,
  isValidChordsResult,
  isValidDeepResult,
  isValidDenoiseResult,
  isValidStemsResult,
  startChordsOnly,
  startDeep,
  startDenoise,
  startStemsOnly,
  streamProgress,
} from "@/lib/api-client";
import { initAuth, loadCurrentUser, type RealsAuthUser } from "@/lib/auth";
import { parseChord, ParsedChord, transposeChord } from "@/lib/music-theory";
import {
  ChordSegment,
  ChordsOnlyResult,
  DeepAnalysisResponse,
  DenoiseResult,
  FeatureMode,
  StemMode,
  StemsOnlyResult,
  StudioPhase,
  TelemetryData,
} from "@/lib/types";
import { audioEngine } from "@/lib/web-audio-engine";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export default function AudioStudioPage() {
  const [phase, setPhase] = useState<StudioPhase>("IDLE");
  const [featureMode, setFeatureMode] = useState<FeatureMode>("all");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(null);
  const [waveformUrl, setWaveformUrl] = useState<string | null>(null);

  const [quickTelemetry, setQuickTelemetry] = useState<TelemetryData | null>(null);
  const [deepResult, setDeepResult] = useState<DeepAnalysisResponse | null>(null);
  const [chordsResult, setChordsResult] = useState<ChordsOnlyResult | null>(null);
  const [stemsResult, setStemsResult] = useState<StemsOnlyResult | null>(null);
  const [denoiseResult, setDenoiseResult] = useState<DenoiseResult | null>(null);
  const [denoiseStrength, setDenoiseStrength] = useState<number>(80);
  const [stemMode, setStemMode] = useState<StemMode>("4");

  const [rawChords, setRawChords] = useState<ChordSegment[]>([]);
  const [displayedChords, setDisplayedChords] = useState<ChordSegment[]>([]);
  const [transposeSemitones, setTransposeSemitones] = useState<number>(0);

  const [activeChordParsed, setActiveChordParsed] = useState<ParsedChord | null>(null);
  const [activeChordName, setActiveChordName] = useState<string>("");

  const [editingChordIndex, setEditingChordIndex] = useState<number | null>(null);
  const [deepProgress, setDeepProgress] = useState<{ percent: number; stage: string }>({
    percent: 0,
    stage: "",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deepInitiating, setDeepInitiating] = useState<boolean>(false);

  const sseCleanupRef = useRef<(() => void) | null>(null);
  const isStartingDeepRef = useRef<boolean>(false);

  // Telemetry source of truth: deep result once available, otherwise standalone
  // chord analysis, otherwise quick analysis. Used consistently for ♯/♭ spelling.
  const keyTelemetry = deepResult
    ? deepResult.telemetry
    : chordsResult
      ? chordsResult.telemetry
      : quickTelemetry;

  // 0. SSO auth (Bước 4 monorepo): đọc #token= từ URL → localStorage;
  // thiếu token → redirect sang reals.media authorize (silent re-auth).
  // Sau khi có token, load user + tier để hiển thị badge + số lượt còn lại.
  const [authUser, setAuthUser] = useState<RealsAuthUser | null>(null);

  useEffect(() => {
    const token = initAuth();
    if (!token) return; // đang redirect sang main-app — dừng mọi flow
    let mounted = true;
    loadCurrentUser()
      .then((user) => {
        if (mounted) setAuthUser(user);
      })
      .catch((err) => {
        // 503 (main-app/DB lỗi) — app vẫn dùng được phần không cần tier;
        // 401 đã tự re-auth trong authFetch
        console.warn("[auth] Không tải được thông tin user:", err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  /** Cập nhật badge tier/credit từ quota info trong response 202 (không call thêm). */
  const applyQuota = (quota: { tier: RealsAuthUser["tier"]; limit: number | null; usedToday: number; creditsRemaining: number | null }) => {
    setAuthUser((prev) => (prev ? { ...prev, ...quota } : prev));
  };

  /** Fallback refresh badge (khi response không có quota). */
  const refreshAuthUser = () => {
    loadCurrentUser()
      .then((user) => setAuthUser(user))
      .catch(() => {
        // bỏ qua — badge giữ số liệu cũ, quota vẫn enforce ở backend
      });
  };

  // 1. Upload completed handler
  const handleUploaded = (
    id: string,
    dur: number,
    audioUrl: string,
    wUrl: string
  ) => {
    setTaskId(id);
    setDuration(dur);
    setMasterAudioUrl(audioUrl);
    setWaveformUrl(wUrl);
    setErrorMessage(null);

    // Standalone feature modes skip quick telemetry and launch their pipeline now
    if (featureMode === "chords") {
      void handleStartChords(id, audioUrl);
    } else if (featureMode === "stems") {
      void handleStartStems(id, audioUrl);
    } else if (featureMode === "denoise") {
      void handleStartDenoise(id);
    }
  };

  // 2. Quick Telemetry completed handler
  const handleQuick = (telemetry: TelemetryData) => {
    setQuickTelemetry(telemetry);
    setPhase("QUICK_READY");
  };

  // 3a. Start Standalone Chord Analysis
  const handleStartChords = async (id: string, audioUrl: string | null) => {
    if (isStartingDeepRef.current) return;
    isStartingDeepRef.current = true;
    setDeepInitiating(true);
    try {
      setPhase("CHORDS_RUNNING");
      setDeepProgress({ percent: 0, stage: "Đang khởi tạo phân tích hợp âm..." });
      await startChordsOnly(id);

      sseCleanupRef.current = streamProgress(id, {
        onProgress: (p) => {
          setDeepProgress(p);
        },
        onComplete: async (result) => {
          setChordsResult(result);
          setRawChords(result.chords);
          setDisplayedChords(result.chords);
          setTransposeSemitones(0);

          // Load master-only playback so the chord timeline stays in sync
          try {
            setDeepProgress({ percent: 99, stage: "Đang nạp âm thanh vào Web Audio Studio..." });
            await audioEngine.loadStems({}, audioUrl || undefined);
          } catch (err) {
            console.error("Failed loading master audio into WebAudio engine:", err);
            setErrorMessage(
              err instanceof Error
                ? `Không thể nạp âm thanh: ${err.message}`
                : "Không thể nạp âm thanh vào trình phát."
            );
            setPhase("IDLE");
            return;
          }

          setPhase("CHORDS_READY");
        },
        onError: (err) => {
          setErrorMessage(err);
          setPhase("IDLE");
        },
      }, isValidChordsResult);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Khởi chạy phân tích hợp âm thất bại.");
      setPhase("IDLE");
    } finally {
      isStartingDeepRef.current = false;
      setDeepInitiating(false);
    }
  };

  // 3b. Start Standalone Stem Separation
  const handleStartStems = async (id: string, audioUrl: string | null) => {
    if (isStartingDeepRef.current) return;
    isStartingDeepRef.current = true;
    setDeepInitiating(true);
    try {
      setPhase("STEMS_RUNNING");
      setDeepProgress({ percent: 0, stage: "Đang khởi tạo tách stem AI..." });
      const started = await startStemsOnly(id, stemMode);
      if (started.quota) applyQuota(started.quota); // badge "còn X lượt" cập nhật NGAY (không lag cache)

      sseCleanupRef.current = streamProgress(id, {
        onProgress: (p) => {
          setDeepProgress(p);
        },
        onComplete: async (result) => {
          setStemsResult(result);

          try {
            setDeepProgress({ percent: 99, stage: "Đang nạp âm thanh vào Web Audio Studio..." });
            await audioEngine.loadStems(result.stems.stems, audioUrl || undefined);
          } catch (err) {
            console.error("Failed loading stems into WebAudio engine:", err);
            setErrorMessage(
              err instanceof Error
                ? `Không thể nạp âm thanh stems: ${err.message}`
                : "Không thể nạp âm thanh stems vào trình phát."
            );
            setPhase("IDLE");
            return;
          }

          setPhase("STEMS_READY");
        },
        onError: (err) => {
          setErrorMessage(err);
          setPhase("IDLE");
        },
      }, isValidStemsResult);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Khởi chạy tách stem thất bại.");
      setPhase("IDLE");
    } finally {
      isStartingDeepRef.current = false;
      setDeepInitiating(false);
    }
  };

  // 3c. Start Standalone Noise Reduction (DeepFilterNet)
  const handleStartDenoise = async (id: string) => {
    if (isStartingDeepRef.current) return;
    isStartingDeepRef.current = true;
    setDeepInitiating(true);
    try {
      setPhase("DENOISE_RUNNING");
      setDeepProgress({ percent: 0, stage: "Đang khởi tạo lọc nhiễu DeepFilterNet..." });
      await startDenoise(id, denoiseStrength);

      sseCleanupRef.current = streamProgress(id, {
        onProgress: (p) => {
          setDeepProgress(p);
        },
        onComplete: (result) => {
          setDenoiseResult(result);
          setPhase("DENOISE_READY");
        },
        onError: (err) => {
          setErrorMessage(err);
          setPhase("IDLE");
        },
      }, isValidDenoiseResult);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Khởi chạy lọc nhiễu thất bại.");
      setPhase("IDLE");
    } finally {
      isStartingDeepRef.current = false;
      setDeepInitiating(false);
    }
  };

  // 3. Start Deep Analysis
  const handleStartDeep = async () => {
    if (!taskId) return;
    if (isStartingDeepRef.current) return; // guard against double-click before re-render
    isStartingDeepRef.current = true;
    setDeepInitiating(true);
    try {
      setPhase("DEEP_RUNNING");
      setDeepProgress({ percent: 0, stage: "Đang khởi tạo pipeline..." });
      const started = await startDeep(taskId, stemMode);
      if (started.quota) applyQuota(started.quota); // badge "còn X lượt" cập nhật NGAY (không lag cache)

      // Start SSE stream
      sseCleanupRef.current = streamProgress(taskId, {
        onProgress: (p) => {
          setDeepProgress(p);
        },
        onComplete: async (result) => {
          setDeepResult(result);
          setRawChords(result.chords);
          setDisplayedChords(result.chords);
          setTransposeSemitones(0);

          // Preload audio stems into WebAudio Engine
          try {
            setDeepProgress({ percent: 99, stage: "Đang nạp âm thanh vào Web Audio Studio..." });
            await audioEngine.loadStems(result.stems.stems, masterAudioUrl || undefined);
          } catch (err) {
            console.error("Failed loading stems into WebAudio engine:", err);
            setErrorMessage(
              err instanceof Error
                ? `Không thể nạp âm thanh stems: ${err.message}`
                : "Không thể nạp âm thanh stems vào trình phát."
            );
            setPhase("QUICK_READY");
            return;
          }

          setPhase("READY");
        },
        onError: (err) => {
          setErrorMessage(err);
          setPhase("QUICK_READY");
        },
      }, isValidDeepResult);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Khởi chạy phân tích sâu thất bại.");
      setPhase("QUICK_READY");
    } finally {
      isStartingDeepRef.current = false;
      setDeepInitiating(false);
    }
  };

  // 4. Handle Transposition
  const handleTransposeChange = (semitones: number) => {
    setTransposeSemitones(semitones);
    const preferFlat = keyTelemetry?.scale_mode === "minor";

    const transposed = rawChords.map((c) => ({
      ...c,
      chord: transposeChord(c.chord, semitones, preferFlat),
    }));

    setDisplayedChords(transposed);
  };

  // 5. Handle Chord edit save
  const handleSaveChord = (idx: number, newChordStr: string) => {    const updated = [...displayedChords];
    updated[idx] = {
      ...updated[idx],
      chord: newChordStr,
    };
    setDisplayedChords(updated);

    // Also update raw chords adjusted for current transposition
    const updatedRaw = [...rawChords];
    const preferFlat = keyTelemetry?.scale_mode === "minor";
    updatedRaw[idx] = {
      ...updatedRaw[idx],
      chord: transposeChord(newChordStr, -transposeSemitones, preferFlat),
    };
    setRawChords(updatedRaw);
  };

  // 5b. Download chords-only result as JSON (applies current edits & transposition)
  const handleDownloadChordsJson = () => {
    if (!chordsResult) return;

    const payload = {
      ...chordsResult,
      transpose_semitones: transposeSemitones,
      chords: displayedChords,
      exported_at: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chords_${chordsResult.task_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 6. Active Chord Voicing loop
  useEffect(() => {
    let animId: number;
    let lastChordName: string | null = null;

    const checkActiveChord = () => {
      if ((phase === "READY" || phase === "CHORDS_READY") && displayedChords.length > 0) {
        const curTime = audioEngine.currentTime;
        const currentSegment = displayedChords.find(
          (c) => curTime >= c.start && curTime < c.end
        );

        let nextName: string;
        let nextParsed: ParsedChord | null;
        if (currentSegment && currentSegment.chord !== "N") {
          nextName = currentSegment.chord;
          nextParsed = parseChord(currentSegment.chord);
        } else {
          nextName = currentSegment ? currentSegment.chord : "";
          nextParsed = null;
        }

        // Only setState when the active chord actually changed (avoid 60fps re-renders)
        if (nextName !== lastChordName) {
          lastChordName = nextName;
          setActiveChordName(nextName);
          setActiveChordParsed(nextParsed);
        }
      }
      animId = requestAnimationFrame(checkActiveChord);
    };

    animId = requestAnimationFrame(checkActiveChord);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [phase, displayedChords]);

  // 7. Global Keyboard Shortcuts (Space for Play/Pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        (phase !== "READY" && phase !== "CHORDS_READY" && phase !== "STEMS_READY")
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        if (audioEngine.isPlaying) {
          audioEngine.pause();
        } else {
          audioEngine.play();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase]);

  // 8. Reset Project Handler
  const handleReset = async () => {
    if (taskId) {
      try {
        await deleteSession(taskId);
      } catch (err) {
        console.warn("Error cleaning session on reset:", err);
      }
    }

    if (sseCleanupRef.current) {
      sseCleanupRef.current();
      sseCleanupRef.current = null;
    }

    audioEngine.destroy();

    setPhase("IDLE");
    setTaskId(null);
    setDuration(0);
    setMasterAudioUrl(null);
    setWaveformUrl(null);
    setQuickTelemetry(null);
    setDeepResult(null);
    setChordsResult(null);
    setStemsResult(null);
    setDenoiseResult(null);
    setStemMode("4");
    setDeepProgress({ percent: 0, stage: "" });
    setRawChords([]);
    setDisplayedChords([]);
    setTransposeSemitones(0);
    setActiveChordParsed(null);
    setActiveChordName("");
    setEditingChordIndex(null);
    setErrorMessage(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sseCleanupRef.current) {
        sseCleanupRef.current();
      }
      audioEngine.destroy();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100 flex flex-col">
      {/* 1. Header */}
      <Header
        authUser={authUser}
        onReset={handleReset}
        isProcessing={
          phase === "UPLOADING" ||
          phase === "DEEP_RUNNING" ||
          phase === "CHORDS_RUNNING" ||
          phase === "STEMS_RUNNING" ||
          phase === "DENOISE_RUNNING"
        }
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Error Alert */}
        {errorMessage && (
          <div className="w-full bg-red-950/60 border border-red-800 rounded-xl p-4 flex items-center justify-between text-red-200 text-xs shadow-lg">
            <div className="flex items-center space-x-2">
              <span className="text-base">⚠️</span>
              <span className="font-semibold">{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-white font-bold text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* 2. Upload Zone (Phases: IDLE / UPLOADING) */}
        {(phase === "IDLE" || phase === "UPLOADING") && (
          <div className="py-8 space-y-6">
            <FeatureModePicker
              mode={featureMode}
              onChange={setFeatureMode}
              stemMode={stemMode}
              onStemModeChange={setStemMode}
              denoiseStrength={denoiseStrength}
              onDenoiseStrengthChange={setDenoiseStrength}
              disabled={phase === "UPLOADING"}
            />
            <UploadZone
              featureMode={featureMode}
              onUploaded={handleUploaded}
              onQuick={handleQuick}
              onError={(err) => {
                setErrorMessage(err);
                setPhase("IDLE");
              }}
              onUploadStart={() => setPhase("UPLOADING")}
            />
          </div>
        )}

        {/* 3. Analysis Progress (Phases: DEEP_RUNNING / CHORDS_RUNNING / STEMS_RUNNING / DENOISE_RUNNING) */}
        {(phase === "DEEP_RUNNING" || phase === "CHORDS_RUNNING" || phase === "STEMS_RUNNING" || phase === "DENOISE_RUNNING") && (
          <div className="w-full max-w-2xl mx-auto my-12 bg-[#12121a] border border-zinc-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
            <div className="w-16 h-16 rounded-full border-3 border-amber-500 border-t-transparent animate-spin mx-auto shadow-lg shadow-amber-500/20" />
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-zinc-100">
                {phase === "CHORDS_RUNNING"
                  ? "Đang giải mã tiến trình hợp âm (Viterbi HMM)..."
                  : phase === "STEMS_RUNNING"
                    ? "Đang tách nguồn âm thanh bằng AI Demucs..."
                    : phase === "DENOISE_RUNNING"
                      ? "Đang khử nhiễu bằng DeepFilterNet AI..."
                      : "Đang xử lý phân tích âm nhạc chuyên sâu & tách Stems AI..."}
              </h3>
              <p className="text-xs text-amber-400 font-medium">{deepProgress.stage || "Đang tính toán..."}</p>

              <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden border border-zinc-800">
                <div
                  className="bg-gradient-to-r from-amber-500 via-purple-500 to-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${deepProgress.percent}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 font-mono">{deepProgress.percent}%</p>
            </div>
          </div>
        )}

        {/* 4. Quick Ready Phase: Telemetry Bar & Action */}
        {(phase === "QUICK_READY" || phase === "READY" || phase === "CHORDS_READY") && (
          <>
            <TelemetryBar
              telemetry={
                deepResult
                  ? deepResult.telemetry
                  : chordsResult
                    ? chordsResult.telemetry
                    : quickTelemetry || {
                        bpm: 120,
                        master_key: "C",
                        scale_mode: "major",
                        time_signature: "4/4",
                        duration,
                      }
              }
              transposeSemitones={transposeSemitones}
              warnings={deepResult?.warnings ?? chordsResult?.warnings}
              stemMode={stemMode}
              onStemModeChange={(m) => setStemMode(m)}
              onStartDeep={handleStartDeep}
              isDeepRunning={deepInitiating}
              showDeepButton={phase === "QUICK_READY"}
            />
          </>
        )}

        {/* 4b. Standalone feature launchers on the current upload (Phase: QUICK_READY) */}
        {phase === "QUICK_READY" && taskId && (
          <div className="w-full bg-[#12121a] border border-zinc-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-center gap-2.5 shadow-lg">
            <span className="text-[11px] uppercase tracking-wider font-bold text-zinc-500 mr-1">
              Hoặc chạy riêng lẻ:
            </span>
            <button
              type="button"
              onClick={() => void handleStartChords(taskId, masterAudioUrl)}
              disabled={deepInitiating}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-amber-950/60 hover:text-amber-300 hover:border-amber-700/50 border border-zinc-700 text-xs font-semibold text-zinc-300 transition disabled:opacity-50 flex items-center space-x-1.5"
            >
              <span>🎹</span>
              <span>Chỉ phân tích Hợp âm</span>
            </button>
            <button
              type="button"
              onClick={() => void handleStartStems(taskId, masterAudioUrl)}
              disabled={deepInitiating}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-purple-950/60 hover:text-purple-300 hover:border-purple-700/50 border border-zinc-700 text-xs font-semibold text-zinc-300 transition disabled:opacity-50 flex items-center space-x-1.5"
            >
              <span>🎚️</span>
              <span>Chỉ Tách stem (mode {stemMode})</span>
            </button>
            <button
              type="button"
              onClick={() => void handleStartDenoise(taskId)}
              disabled={deepInitiating}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-emerald-950/60 hover:text-emerald-300 hover:border-emerald-700/50 border border-zinc-700 text-xs font-semibold text-zinc-300 transition disabled:opacity-50 flex items-center space-x-1.5"
            >
              <span>🧹</span>
              <span>Chỉ Lọc nhiễu</span>
            </button>
          </div>
        )}

        {/* 4c. Chords-Only Workspace (Phase: CHORDS_READY) */}
        {phase === "CHORDS_READY" && chordsResult && masterAudioUrl && (
          <div className="space-y-5">
            {/* Waveform Beat Grid Canvas */}
            <WaveformPlayer
              masterAudioUrl={masterAudioUrl}
              waveformUrl={waveformUrl}
              duration={duration}
              beats={chordsResult.beats}
            />

            {/* Chord Progression Timeline */}
            <ChordTimeline
              chords={displayedChords}
              duration={duration}
              onEditChord={(idx) => setEditingChordIndex(idx)}
            />

            {/* Live Interactive Piano Roll */}
            <InteractivePianoRoll
              activeChord={activeChordParsed}
              activeChordName={activeChordName}
            />

            {/* Transpose Controls */}
            <TransposeBar
              currentTranspose={transposeSemitones}
              originalKey={chordsResult.telemetry.master_key}
              originalMode={chordsResult.telemetry.scale_mode}
              onTransposeChange={handleTransposeChange}
            />

            {/* Chords Export & Upgrade Row */}
            <div className="w-full bg-[#12121a] border border-zinc-800 rounded-xl p-5 shadow-lg space-y-3">
              <span className="text-xs font-bold uppercase text-zinc-300 tracking-wider flex items-center space-x-2">
                <span>💾</span>
                <span>Xuất kết quả Hợp âm</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <a
                  href={`${API_BASE}/api/export/midi/${chordsResult.task_id}`}
                  download={`chords_${chordsResult.task_id}.mid`}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-amber-500/50 transition group shadow-sm"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-sm">
                      MID
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-200 group-hover:text-amber-400 transition">
                        MIDI Hợp âm (SMF-1)
                      </h4>
                      <p className="text-[10px] text-zinc-400">Chords + Metronome</p>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-300">↓</span>
                </a>

                <button
                  type="button"
                  onClick={handleDownloadChordsJson}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-indigo-500/50 transition group shadow-sm text-left"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-sm">
                      JSON
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-200 group-hover:text-indigo-400 transition">
                        Tiến trình hợp âm (JSON)
                      </h4>
                      <p className="text-[10px] text-zinc-400">Kèm chỉnh sửa & dịch giọng</p>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-300">↓</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleStartDeep()}
                  disabled={deepInitiating}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-purple-600/10 border border-amber-500/30 hover:border-amber-400/60 transition group shadow-sm text-left disabled:opacity-50"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-300 font-black text-sm">
                      ⚡
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-200 group-hover:text-amber-300 transition">
                        Nâng cấp lên Tất cả
                      </h4>
                      <p className="text-[10px] text-zinc-400">Thêm tách stem & mixer đa track</p>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-300">→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4d. Stems-Only Workspace (Phase: STEMS_READY) */}
        {phase === "STEMS_READY" && stemsResult && masterAudioUrl && (
          <div className="space-y-5">
            {/* Waveform Canvas (master playback visual) */}
            <WaveformPlayer
              masterAudioUrl={masterAudioUrl}
              waveformUrl={waveformUrl}
              duration={duration}
              beats={[]}
            />

            {/* Dynamic Multi-Track Stem Mixer */}
            <StemMixer
              manifest={stemsResult.stems}
              duration={duration}
            />

            {/* Stems Export & Upgrade Row */}
            <div className="w-full bg-[#12121a] border border-zinc-800 rounded-xl p-5 shadow-lg space-y-3">
              <span className="text-xs font-bold uppercase text-zinc-300 tracking-wider flex items-center space-x-2">
                <span>💾</span>
                <span>Xuất kết quả Tách nhạc</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={`${API_BASE}/api/export/stems-zip/${stemsResult.task_id}`}
                  download={`stems_${stemsResult.task_id}.zip`}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-purple-500/50 transition group shadow-sm"
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

                <button
                  type="button"
                  onClick={() => void handleStartDeep()}
                  disabled={deepInitiating}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-purple-600/10 border border-amber-500/30 hover:border-amber-400/60 transition group shadow-sm text-left disabled:opacity-50"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300 font-black text-sm">
                      ⚡
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-200 group-hover:text-amber-300 transition">
                        Nâng cấp lên Tất cả
                      </h4>
                      <p className="text-[10px] text-zinc-400">Thêm hợp âm, beats & MIDI export</p>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-300">→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4e. Denoise Workspace (Phase: DENOISE_READY) */}
        {phase === "DENOISE_READY" && denoiseResult && masterAudioUrl && (
          <div className="space-y-5">
            {/* A/B Compare Panel */}
            <div className="w-full bg-[#12121a] border border-zinc-800 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <span className="text-xs font-bold uppercase text-zinc-300 tracking-wider flex items-center space-x-2">
                  <span>🧹</span>
                  <span>Kết quả Lọc nhiễu</span>
                </span>
                <div className="flex items-center space-x-2 text-[10px]">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-bold uppercase tracking-wider">
                    {denoiseResult.engine === "deepfilternet" ? "DeepFilterNet AI" : denoiseResult.engine}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono">
                    {denoiseResult.strength}% • {denoiseResult.sample_rate} Hz
                  </span>
                </div>
              </div>

              {denoiseResult.warnings.length > 0 && (
                <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded-lg px-3 py-2">
                  {denoiseResult.warnings.join(" • ")}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Original */}
                <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-2.5">
                  <div className="flex items-center space-x-2">
                    <span className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm">🎙️</span>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-200">Bản gốc</h4>
                      <p className="text-[10px] text-zinc-500">Trước khi lọc nhiễu</p>
                    </div>
                  </div>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls preload="metadata" src={masterAudioUrl} className="w-full h-9" />
                </div>

                {/* Denoised */}
                <div className="rounded-xl bg-emerald-950/20 border border-emerald-800/40 p-4 space-y-2.5">
                  <div className="flex items-center space-x-2">
                    <span className="w-7 h-7 rounded-lg bg-emerald-900/50 border border-emerald-700/50 flex items-center justify-center text-sm">✨</span>
                    <div>
                      <h4 className="text-xs font-bold text-emerald-200">Sau lọc nhiễu</h4>
                      <p className="text-[10px] text-emerald-400/70">DeepFilterNet • {denoiseResult.duration.toFixed(1)}s</p>
                    </div>
                  </div>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls preload="metadata" src={`${API_BASE}${denoiseResult.denoise_url}`} className="w-full h-9" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <a
                  href={`${API_BASE}${denoiseResult.denoise_url}`}
                  download={`denoised_${denoiseResult.task_id}.wav`}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-emerald-500/50 transition group shadow-sm"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-sm">
                      WAV
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-200 group-hover:text-emerald-400 transition">
                        Tải audio đã lọc nhiễu
                      </h4>
                      <p className="text-[10px] text-zinc-400">WAV {denoiseResult.sample_rate} Hz • {denoiseResult.channels} kênh</p>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-300">↓</span>
                </a>

                <button
                  type="button"
                  onClick={() => void handleStartDeep()}
                  disabled={deepInitiating}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-purple-600/10 border border-amber-500/30 hover:border-amber-400/60 transition group shadow-sm text-left disabled:opacity-50"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300 font-black text-sm">
                      ⚡
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-200 group-hover:text-amber-300 transition">
                        Nâng cấp lên Tất cả
                      </h4>
                      <p className="text-[10px] text-zinc-400">Thêm hợp âm, stems & mixer</p>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-300">→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5. Studio Workspace (Phase: READY) */}
        {phase === "READY" && deepResult && masterAudioUrl && (
          <div className="space-y-5">
            {/* Waveform Beat Grid Canvas */}
            <WaveformPlayer
              masterAudioUrl={masterAudioUrl}
              waveformUrl={waveformUrl}
              duration={duration}
              beats={deepResult.beats}
            />

            {/* Chord Progression Timeline */}
            <ChordTimeline
              chords={displayedChords}
              duration={duration}
              onEditChord={(idx) => setEditingChordIndex(idx)}
            />

            {/* Live Interactive Piano Roll */}
            <InteractivePianoRoll
              activeChord={activeChordParsed}
              activeChordName={activeChordName}
            />

            {/* Transpose Controls */}
            <TransposeBar
              currentTranspose={transposeSemitones}
              originalKey={deepResult.telemetry.master_key}
              originalMode={deepResult.telemetry.scale_mode}
              onTransposeChange={handleTransposeChange}
            />

            {/* Dynamic Multi-Track Stem Mixer */}
            <StemMixer
              manifest={deepResult.stems}
              duration={duration}
            />

            {/* Export Center Drawer */}
            <ExportDrawer
              taskId={deepResult.task_id}
              deepResult={deepResult}
              editedChords={displayedChords}
              currentTranspose={transposeSemitones}
            />
          </div>
        )}
      </main>

      {/* Chord Editor Modal */}
      <ChordEditorModal
        isOpen={editingChordIndex !== null}
        chordIndex={editingChordIndex ?? 0}
        currentSegment={
          editingChordIndex !== null ? displayedChords[editingChordIndex] : null
        }
        onSaved={handleSaveChord}
        onClose={() => setEditingChordIndex(null)}
      />
    </div>
  );
}
