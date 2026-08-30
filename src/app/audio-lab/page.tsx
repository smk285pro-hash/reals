"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/stores";
import { toast } from "sonner";

import dynamic from "next/dynamic";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { NotificationDropdown } from "@/components/layout/NotificationDropdown";
import { MobileNav } from "@/components/layout/MobileNav";
import { ScrollToTop } from "@/components/ui-custom/ScrollToTop";

const LoginModal = dynamic(
  () => import("@/components/auth/LoginModal").then((m) => m.LoginModal),
  { ssr: false }
);
const RegisterModal = dynamic(
  () => import("@/components/auth/RegisterModal").then((m) => m.RegisterModal),
  { ssr: false }
);
const ForgotPasswordModal = dynamic(
  () => import("@/components/auth/ForgotPasswordModal").then((m) => m.ForgotPasswordModal),
  { ssr: false }
);
const SellerApplyModal = dynamic(
  () => import("@/components/auth/SellerApplyModal").then((m) => m.SellerApplyModal),
  { ssr: false }
);

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
} from "@/lib/audio-lab/api-client";
import { parseChord, ParsedChord, transposeChord } from "@/lib/audio-lab/music-theory";
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
} from "@/lib/audio-lab/types";
import { audioEngine } from "@/lib/audio-lab/web-audio-engine";

export default function AudioStudioPage() {
  const { data: session, status: authStatus } = useSession();
  const {
    loginModalOpen,
    setLoginModalOpen,
    registerModalOpen,
    setRegisterModalOpen,
    forgotPasswordModalOpen,
    setForgotPasswordModalOpen,
    sellerApplyModalOpen,
    setSellerApplyModalOpen,
  } = useAppStore();

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

  // Check auth requirement for GPU features
  const requireAuth = useCallback((): boolean => {
    if (authStatus !== "authenticated") {
      toast.info("Vui lòng đăng nhập tài khoản RealS để sử dụng tính năng Tách nhạc AI (Miễn phí)", {
        duration: 4000,
      });
      setLoginModalOpen(true);
      return false;
    }
    return true;
  }, [authStatus, setLoginModalOpen]);

  const keyTelemetry = deepResult
    ? deepResult.telemetry
    : chordsResult
      ? chordsResult.telemetry
      : quickTelemetry;

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

    // Standalone feature modes launch their pipeline
    if (featureMode === "chords") {
      void launchChordsOnly(id);
    } else if (featureMode === "stems") {
      void launchStemsOnly(id, stemMode);
    } else if (featureMode === "denoise") {
      void launchDenoise(id, denoiseStrength);
    }
  };

  // 2. Quick analysis completed handler
  const handleQuickAnalyzed = (telemetry: TelemetryData) => {
    setQuickTelemetry(telemetry);
    setPhase("QUICK_READY");
  };

  // 3. Launch deep combo pipeline
  const launchDeepAnalysis = async () => {
    if (!taskId || deepInitiating || isStartingDeepRef.current) return;
    if (!requireAuth()) return;

    try {
      isStartingDeepRef.current = true;
      setDeepInitiating(true);
      setPhase("DEEP_RUNNING");
      setDeepProgress({ percent: 5, stage: "Đang khởi tạo bộ máy GPU NVIDIA T4..." });

      await startDeep(taskId, stemMode);

      if (sseCleanupRef.current) {
        sseCleanupRef.current();
        sseCleanupRef.current = null;
      }

      sseCleanupRef.current = streamProgress<DeepAnalysisResponse>(
        taskId,
        {
          onProgress: (prog) => {
            setDeepProgress(prog);
          },
          onComplete: async (result) => {
            setDeepResult(result);
            setRawChords(result.chords);
            setDisplayedChords(result.chords);
            setDeepInitiating(false);
            isStartingDeepRef.current = false;

            try {
              setDeepProgress({ percent: 95, stage: "Đang nạp dữ liệu âm thanh đa kênh..." });
              await audioEngine.loadStems(result.stems.stems);
              setPhase("READY");
            } catch (loadErr) {
              console.error("Failed loading audio stems into WebAudio engine:", loadErr);
              setPhase("READY");
            }
          },
          onError: (err) => {
            setErrorMessage(`Phân tích sâu thất bại: ${err}`);
            setPhase("QUICK_READY");
            setDeepInitiating(false);
            isStartingDeepRef.current = false;
          },
        },
        isValidDeepResult
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Không thể kích hoạt tiến trình phân tích sâu."
      );
      setPhase("QUICK_READY");
      setDeepInitiating(false);
      isStartingDeepRef.current = false;
    }
  };

  // 4. Standalone Chords-only pipeline
  const launchChordsOnly = async (id: string) => {
    if (!requireAuth()) {
      setPhase("QUICK_READY");
      return;
    }
    try {
      setPhase("CHORDS_RUNNING");
      setDeepProgress({ percent: 10, stage: "Đang giải mã hòa âm (Viterbi HMM)..." });
      await startChordsOnly(id);

      if (sseCleanupRef.current) {
        sseCleanupRef.current();
        sseCleanupRef.current = null;
      }

      sseCleanupRef.current = streamProgress<ChordsOnlyResult>(
        id,
        {
          onProgress: (prog) => setDeepProgress(prog),
          onComplete: (res) => {
            setChordsResult(res);
            setRawChords(res.chords);
            setDisplayedChords(res.chords);
            setPhase("CHORDS_READY");
          },
          onError: (err) => {
            setErrorMessage(`Giải mã hợp âm thất bại: ${err}`);
            setPhase("IDLE");
          },
        },
        isValidChordsResult
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Không thể kích hoạt giải mã hợp âm."
      );
      setPhase("IDLE");
    }
  };

  // 5. Standalone Stems-only pipeline
  const launchStemsOnly = async (id: string, mode: StemMode) => {
    if (!requireAuth()) {
      setPhase("QUICK_READY");
      return;
    }
    try {
      setPhase("STEMS_RUNNING");
      setDeepProgress({ percent: 10, stage: `Đang tách ${mode} stems bằng Demucs AI...` });
      await startStemsOnly(id, mode);

      if (sseCleanupRef.current) {
        sseCleanupRef.current();
        sseCleanupRef.current = null;
      }

      sseCleanupRef.current = streamProgress<StemsOnlyResult>(
        id,
        {
          onProgress: (prog) => setDeepProgress(prog),
          onComplete: async (res) => {
            setStemsResult(res);
            try {
              setDeepProgress({ percent: 95, stage: "Đang nạp âm thanh vào bàn trộn..." });
              await audioEngine.loadStems(res.stems.stems);
              setPhase("STEMS_READY");
            } catch (loadErr) {
              console.error("Failed loading stems into engine:", loadErr);
              setPhase("STEMS_READY");
            }
          },
          onError: (err) => {
            setErrorMessage(`Tách stem thất bại: ${err}`);
            setPhase("IDLE");
          },
        },
        isValidStemsResult
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Không thể kích hoạt tách stem."
      );
      setPhase("IDLE");
    }
  };

  // 6. Standalone Denoise pipeline
  const launchDenoise = async (id: string, strength: number) => {
    if (!requireAuth()) {
      setPhase("QUICK_READY");
      return;
    }
    try {
      setPhase("DENOISE_RUNNING");
      setDeepProgress({ percent: 10, stage: "Đang lọc nhiễu (DeepFilterNet)..." });
      await startDenoise(id, strength);

      if (sseCleanupRef.current) {
        sseCleanupRef.current();
        sseCleanupRef.current = null;
      }

      sseCleanupRef.current = streamProgress<DenoiseResult>(
        id,
        {
          onProgress: (prog) => setDeepProgress(prog),
          onComplete: async (res) => {
            setDenoiseResult(res);
            try {
              setDeepProgress({ percent: 95, stage: "Đang nạp tệp âm thanh đã lọc..." });
              await audioEngine.loadStems({}, res.denoise_url);
              setPhase("DENOISE_READY");
            } catch (loadErr) {
              console.error("Failed loading denoise audio:", loadErr);
              setPhase("DENOISE_READY");
            }
          },
          onError: (err) => {
            setErrorMessage(`Lọc nhiễu thất bại: ${err}`);
            setPhase("IDLE");
          },
        },
        isValidDenoiseResult
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Không thể kích hoạt lọc nhiễu."
      );
      setPhase("IDLE");
    }
  };

  // Synchronize dynamic Transpose shifting
  useEffect(() => {
    if (rawChords.length === 0) {
      setDisplayedChords([]);
      return;
    }
    const preferFlat = keyTelemetry?.master_key?.includes("b") || false;
    const transposed = rawChords.map((c) => ({
      ...c,
      chord: transposeChord(c.chord, transposeSemitones, preferFlat),
    }));
    setDisplayedChords(transposed);
  }, [rawChords, transposeSemitones, keyTelemetry]);

  // Audio Engine Time listener for Active Piano Roll display
  useEffect(() => {
    const handleTimeUpdate = (currentTime: number) => {
      if (displayedChords.length === 0) {
        setActiveChordParsed(null);
        setActiveChordName("");
        return;
      }

      const activeSeg = displayedChords.find(
        (c) => currentTime >= c.start && currentTime < c.end
      );

      if (activeSeg && activeSeg.chord !== "N") {
        setActiveChordParsed(parseChord(activeSeg.chord));
        setActiveChordName(activeSeg.chord);
      } else {
        setActiveChordParsed(null);
        setActiveChordName(activeSeg ? "N" : "");
      }
    };

    audioEngine.onTimeUpdate = handleTimeUpdate;
    return () => {
      audioEngine.onTimeUpdate = undefined;
    };
  }, [displayedChords]);

  // Keyboard Shortcuts (Space: Play/Pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
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
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Full reset state
  const handleReset = async () => {
    if (sseCleanupRef.current) {
      sseCleanupRef.current();
      sseCleanupRef.current = null;
    }
    isStartingDeepRef.current = false;
    setDeepInitiating(false);

    audioEngine.destroy();

    if (taskId) {
      void deleteSession(taskId);
    }

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
    setRawChords([]);
    setDisplayedChords([]);
    setTransposeSemitones(0);
    setActiveChordParsed(null);
    setActiveChordName("");
    setEditingChordIndex(null);
    setErrorMessage(null);
  };

  const handleSavedChord = (index: number, newChord: string) => {
    setRawChords((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], chord: newChord };
      }
      return updated;
    });
  };

  const isDeepRunning =
    phase === "DEEP_RUNNING" ||
    phase === "CHORDS_RUNNING" ||
    phase === "STEMS_RUNNING" ||
    phase === "DENOISE_RUNNING" ||
    deepInitiating;

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0f] text-zinc-100 font-sans pb-20 selection:bg-amber-500 selection:text-black">
      {/* RealS Global Navigation Bar */}
      <Navbar />
      <Sidebar />
      <CartDrawer />
      <NotificationDropdown />
      <ScrollToTop />
      <MobileNav />

      {/* Auth Modals */}
      <LoginModal
        open={loginModalOpen}
        onOpenChange={(open) => setLoginModalOpen(open)}
        onSwitchToRegister={() => {
          setLoginModalOpen(false);
          setTimeout(() => setRegisterModalOpen(true), 150);
        }}
        onSwitchToForgot={() => {
          setLoginModalOpen(false);
          setTimeout(() => setForgotPasswordModalOpen(true), 150);
        }}
      />
      <RegisterModal
        open={registerModalOpen}
        onOpenChange={(open) => setRegisterModalOpen(open)}
        onSwitchToLogin={() => {
          setRegisterModalOpen(false);
          setTimeout(() => setLoginModalOpen(true), 150);
        }}
      />
      <ForgotPasswordModal
        open={forgotPasswordModalOpen}
        onOpenChange={(open) => setForgotPasswordModalOpen(open)}
        onSwitchToLogin={() => {
          setForgotPasswordModalOpen(false);
          setTimeout(() => setLoginModalOpen(true), 150);
        }}
      />
      <SellerApplyModal
        open={sellerApplyModalOpen}
        onOpenChange={setSellerApplyModalOpen}
      />

      {/* Studio Header Bar */}
      <Header onReset={handleReset} isProcessing={isDeepRunning} />

      {/* Main Studio Container */}
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6">
        {/* Error Notification Alert */}
        {errorMessage && (
          <div className="w-full bg-red-950/60 border border-red-800 rounded-xl p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-3 text-red-300 text-sm">
              <span className="text-xl">⚠️</span>
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-red-200 text-xs font-bold px-2 py-1 bg-red-900/40 rounded border border-red-800 cursor-pointer"
            >
              Đóng
            </button>
          </div>
        )}

        {/* Phase 1: IDLE / Upload View */}
        {phase === "IDLE" && (
          <div className="space-y-6 py-6">
            <FeatureModePicker
              mode={featureMode}
              onChange={setFeatureMode}
              stemMode={stemMode}
              onStemModeChange={setStemMode}
              denoiseStrength={denoiseStrength}
              onDenoiseStrengthChange={setDenoiseStrength}
            />

            <UploadZone
              featureMode={featureMode}
              onUploaded={handleUploaded}
              onQuick={handleQuickAnalyzed}
              onError={(err) => setErrorMessage(err)}
              onUploadStart={() => setPhase("UPLOADING")}
            />
          </div>
        )}

        {/* Phase 2: UPLOADING */}
        {phase === "UPLOADING" && (
          <UploadZone
            featureMode={featureMode}
            onUploaded={handleUploaded}
            onQuick={handleQuickAnalyzed}
            onError={(err) => {
              setErrorMessage(err);
              setPhase("IDLE");
            }}
          />
        )}

        {/* Running Pipeline Progress Indicator */}
        {isDeepRunning && (
          <div className="w-full max-w-2xl mx-auto bg-[#12121a] border border-purple-900/50 rounded-2xl p-8 text-center space-y-6 shadow-2xl animate-fade-in my-10">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
              <div className="absolute inset-2 rounded-full border-4 border-amber-500/20 border-b-amber-500 animate-spin animate-reverse" />
              <div className="absolute inset-0 flex items-center justify-center font-bold font-mono text-sm text-amber-400">
                {deepProgress.percent}%
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-purple-300">
                {deepProgress.stage || "Đang xử lý trên GPU NVIDIA T4..."}
              </h3>
              <p className="text-xs text-zinc-400">
                Tách nguồn âm Demucs v4 • Hòa âm Viterbi HMM • Độ chính xác cấp độ phòng thu
              </p>
            </div>

            <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800">
              <div
                className="bg-gradient-to-r from-amber-500 via-purple-500 to-indigo-500 h-full rounded-full transition-all duration-300 shadow-sm shadow-purple-500/50"
                style={{ width: `${deepProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Phase: QUICK_READY (Telemetry ready, can launch deep analysis) */}
        {phase === "QUICK_READY" && quickTelemetry && (
          <div className="space-y-6 animate-fade-in">
            <TelemetryBar
              telemetry={quickTelemetry}
              transposeSemitones={transposeSemitones}
              stemMode={stemMode}
              onStemModeChange={setStemMode}
              onStartDeep={launchDeepAnalysis}
              isDeepRunning={isDeepRunning}
              showDeepButton={true}
            />

            {masterAudioUrl && (
              <WaveformPlayer
                masterAudioUrl={masterAudioUrl}
                waveformUrl={waveformUrl}
                duration={duration}
              />
            )}
          </div>
        )}

        {/* Phase: READY / Deep Complete Studio Workspace */}
        {(phase === "READY" ||
          phase === "CHORDS_READY" ||
          phase === "STEMS_READY" ||
          phase === "DENOISE_READY") && (
          <div className="space-y-6 animate-fade-in">
            {keyTelemetry && (
              <TelemetryBar
                telemetry={keyTelemetry}
                transposeSemitones={transposeSemitones}
                warnings={
                  deepResult?.warnings ||
                  chordsResult?.warnings ||
                  stemsResult?.warnings ||
                  denoiseResult?.warnings ||
                  []
                }
                stemMode={stemMode}
                onStemModeChange={setStemMode}
                showDeepButton={false}
              />
            )}

            {/* Transpose Bar */}
            {displayedChords.length > 0 && keyTelemetry && (
              <TransposeBar
                currentTranspose={transposeSemitones}
                originalKey={keyTelemetry.master_key}
                originalMode={keyTelemetry.scale_mode}
                onTransposeChange={(semis) => setTransposeSemitones(semis)}
              />
            )}

            {/* Waveform & Beat Grid */}
            {masterAudioUrl && (
              <WaveformPlayer
                masterAudioUrl={masterAudioUrl}
                waveformUrl={waveformUrl}
                duration={duration}
                beats={deepResult?.beats || chordsResult?.beats || []}
              />
            )}

            {/* Multi-Track Stem Mixer */}
            {deepResult?.stems && (
              <StemMixer manifest={deepResult.stems} duration={duration} />
            )}

            {stemsResult?.stems && (
              <StemMixer manifest={stemsResult.stems} duration={duration} />
            )}

            {/* Chord Timeline */}
            {displayedChords.length > 0 && (
              <ChordTimeline
                chords={displayedChords}
                duration={duration}
                onEditChord={(idx) => setEditingChordIndex(idx)}
              />
            )}

            {/* Interactive Piano Roll Visualizer */}
            {displayedChords.length > 0 && (
              <InteractivePianoRoll
                activeChord={activeChordParsed}
                activeChordName={activeChordName}
              />
            )}

            {/* Export Center Drawer */}
            {taskId && (
              <ExportDrawer
                taskId={taskId}
                deepResult={deepResult}
                editedChords={displayedChords}
                currentTranspose={transposeSemitones}
              />
            )}
          </div>
        )}
      </div>

      {/* Chord Double-Click Edit Modal */}
      {editingChordIndex !== null && displayedChords[editingChordIndex] && (
        <ChordEditorModal
          isOpen={true}
          chordIndex={editingChordIndex}
          currentSegment={displayedChords[editingChordIndex]}
          onSaved={handleSavedChord}
          onClose={() => setEditingChordIndex(null)}
        />
      )}
    </div>
  );
}
