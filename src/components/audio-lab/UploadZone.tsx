"use client";

import React, { useRef, useState } from "react";
import { quickAnalyze, uploadWithProgress } from "@/lib/audio-lab/api-client";
import { FeatureMode, TelemetryData } from "@/lib/audio-lab/types";

interface UploadZoneProps {
  onUploaded: (taskId: string, duration: number, audioUrl: string, waveformUrl: string) => void;
  onQuick: (telemetry: TelemetryData) => void;
  onError: (error: string) => void;
  onUploadStart?: () => void;
  featureMode: FeatureMode;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onUploaded, onQuick, onError, onUploadStart, featureMode }) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileProcess = async (file: File) => {
    // 1. Validation
    const validExtensions = [".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".aiff", ".wma"];
    const fileNameLower = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => fileNameLower.endsWith(ext));

    if (!file.type.startsWith("audio/") && !hasValidExt) {
      onError("Định dạng tệp không hợp lệ! Vui lòng tải lên tệp âm thanh (MP3, WAV, FLAC, M4A, OGG).");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      onError("Dung lượng tệp vượt quá giới hạn cho phép (tối đa 100 MB).");
      return;
    }

    let uploadRes: Awaited<ReturnType<typeof uploadWithProgress>>;
    try {
      setIsUploading(true);
      setUploadPercent(0);
      setStatusMessage("Đang tải lên và chuẩn hóa EBU R128 (-14.0 LUFS)...");
      onUploadStart?.();

      // 2. Upload with progress
      uploadRes = await uploadWithProgress(file, (pct) => {
        setUploadPercent(pct);
        if (pct < 100) {
          setStatusMessage(`Đang tải tệp lên máy chủ... ${pct}%`);
        } else {
          setStatusMessage("Đang chuẩn hóa độ lớn âm thanh và tính toán sóng âm...");
        }
      });

      onUploaded(uploadRes.task_id, uploadRes.duration, uploadRes.audio_url, uploadRes.waveform_url);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi tải tệp lên.");
      setIsUploading(false);
      return;
    }

    // 3. Standalone chords/stems/denoise modes launch their own pipelines immediately
    if (featureMode === "chords" || featureMode === "stems" || featureMode === "denoise") {
      return;
    }

    // 4. Fast Telemetry Quick Analysis (<2s) — modes "all" & "tempo"
    setStatusMessage("Đang phân tích nhanh BPM và điệu thức chính...");
    try {
      const quickTelemetry = await quickAnalyze(uploadRes.task_id);
      onQuick(quickTelemetry);
    } catch (err) {
      console.warn("Quick analysis warning:", err);
      onError(
        err instanceof Error
          ? `Phân tích nhanh thất bại: ${err.message}`
          : "Phân tích nhanh thất bại. Vui lòng thử tải lên lại."
      );
      setIsUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files.length > 0 ? e.target.files[0] : null;
    e.target.value = "";
    if (file) {
      void handleFileProcess(file);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto my-8 px-4">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-10 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-amber-500 bg-amber-500/10 scale-[1.01]"
            : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 hover:bg-zinc-900/90"
        } ${isUploading ? "pointer-events-none opacity-90" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac,.aiff"
          className="hidden"
          onChange={onFileChange}
        />

        {!isUploading ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-purple-500/20 border border-amber-500/30 flex items-center justify-center text-3xl shadow-inner">
              🎵
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-zinc-100">
                Kéo thả tệp bài hát hoặc nhấp để chọn tệp
              </h3>
              <p className="text-xs text-zinc-400">
                Hỗ trợ định dạng MP3, WAV, FLAC, M4A, OGG, AAC (Tối đa 100 MB)
              </p>
            </div>
            <div className="inline-flex items-center px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Chọn tệp từ máy tính
            </div>
          </div>
        ) : (
          <div className="space-y-5 max-w-md mx-auto py-2">
            <div className="w-12 h-12 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mx-auto" />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-200">{statusMessage}</p>
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-purple-500 h-full rounded-full transition-all duration-200"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500">{uploadPercent}% hoàn tất</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
