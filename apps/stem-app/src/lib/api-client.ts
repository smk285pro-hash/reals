import { authFetch, authHeaders, RealsAuthRedirectError } from "@reals/auth-client";
import { ChordsOnlyResult, DeepAnalysisResponse, DenoiseResult, SseHandlers, StemMode, StemsOnlyResult, TelemetryData } from "./types";

export interface UploadResponse {
  task_id: string;
  duration: number;
  waveform_url: string;
  audio_url: string;
}

export interface HealthResponse {
  status: string;
  gpu_available: boolean;
  version: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function normalizeUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Rút message lỗi từ response FastAPI (detail có thể là string hoặc object
 * {message} — ví dụ quota_exceeded 429 từ consume_separation_credit).
 */
async function apiError(res: Response, fallback: string): Promise<Error> {
  let message = `${fallback} (HTTP ${res.status})`;
  try {
    const data = (await res.json()) as { detail?: string | { message?: string } };
    if (typeof data?.detail === "string") {
      message = data.detail;
    } else if (data?.detail && typeof data.detail.message === "string") {
      message = data.detail.message;
    }
  } catch {
    // giữ message mặc định
  }
  return new Error(message);
}

export { RealsAuthRedirectError };

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(normalizeUrl("/api/health"));
  if (!res.ok) {
    throw new Error(`Health check failed with status ${res.status}`);
  }
  return (await res.json()) as HealthResponse;
}

export function uploadWithProgress(
  file: File,
  onPercent?: (percent: number) => void
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onPercent) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onPercent(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as UploadResponse;
          data.waveform_url = normalizeUrl(data.waveform_url);
          data.audio_url = normalizeUrl(data.audio_url);
          resolve(data);
        } catch {
          reject(new Error("Invalid JSON response from server during upload."));
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText) as { detail?: string | { message?: string } };
          const message =
            typeof errData?.detail === "string"
              ? errData.detail
              : errData?.detail?.message || `Upload failed with status ${xhr.status}`;
          reject(new Error(message));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error occurred during audio upload."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Audio upload was aborted."));
    });

    // Bearer bridge token SSO (401 → upload bị chặn; caller hiển thị lỗi
    // và flow tự re-auth qua ensureAuth ở lần render sau).
    // LƯU Ý: setRequestHeader chỉ hợp lệ SAU open() — sai thứ tự sẽ throw
    // "The object's state must be OPENED" (bắt được qua browser test).
    xhr.open("POST", normalizeUrl("/api/upload"));
    const headers = authHeaders();
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(formData);
  });
}

/** Quota còn lại sau 1 lần tách — backend trả kèm trong response 202. */
export interface QuotaInfo {
  tier: "FREE" | "BASIC" | "MAX" | "ULTRA";
  limit: number | null;
  usedToday: number;
  creditsRemaining: number | null;
}

export async function quickAnalyze(taskId: string): Promise<TelemetryData> {
  const res = await authFetch(normalizeUrl(`/api/analyze/quick/${taskId}`), { method: "POST" });
  if (!res.ok) {
    throw await apiError(res, "Phân tích nhanh thất bại");
  }
  return (await res.json()) as TelemetryData;
}

export async function startDeep(
  taskId: string,
  mode: StemMode = "4"
): Promise<{ task_id: string; status: string; quota?: QuotaInfo }> {
  const res = await authFetch(normalizeUrl(`/api/analyze/deep/${taskId}?stem_mode=${mode}`), {
    method: "POST",
  });
  if (!res.ok) {
    throw await apiError(res, "Khởi chạy phân tích sâu thất bại");
  }
  return (await res.json()) as { task_id: string; status: string; quota?: QuotaInfo };
}

export async function startChordsOnly(
  taskId: string
): Promise<{ task_id: string; status: string }> {
  const res = await authFetch(normalizeUrl(`/api/analyze/chords/${taskId}`), { method: "POST" });
  if (!res.ok) {
    throw await apiError(res, "Khởi chạy phân tích hợp âm thất bại");
  }
  return (await res.json()) as { task_id: string; status: string };
}

export async function startStemsOnly(
  taskId: string,
  mode: StemMode = "4"
): Promise<{ task_id: string; status: string; quota?: QuotaInfo }> {
  const res = await authFetch(normalizeUrl(`/api/analyze/stems/${taskId}?stem_mode=${mode}`), {
    method: "POST",
  });
  if (!res.ok) {
    throw await apiError(res, "Khởi chạy tách stem thất bại");
  }
  return (await res.json()) as { task_id: string; status: string; quota?: QuotaInfo };
}

export async function startDenoise(
  taskId: string,
  strength: number = 80
): Promise<{ task_id: string; status: string }> {
  const res = await authFetch(normalizeUrl(`/api/analyze/denoise/${taskId}?strength=${strength}`), {
    method: "POST",
  });
  if (!res.ok) {
    throw await apiError(res, "Khởi chạy lọc nhiễu thất bại");
  }
  return (await res.json()) as { task_id: string; status: string };
}

export async function fetchStemBuffer(url: string, audioCtx: AudioContext): Promise<AudioBuffer> {
  const res = await fetch(normalizeUrl(url));
  if (!res.ok) {
    throw new Error(`Failed to load stem audio from ${url}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

export function isValidDeepResult(data: unknown): data is DeepAnalysisResponse {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<DeepAnalysisResponse>;
  return (
    typeof d.task_id === "string" &&
    !!d.telemetry &&
    typeof d.telemetry.bpm === "number" &&
    !!d.stems &&
    !!d.stems.stems &&
    Array.isArray(d.chords)
  );
}

export function isValidChordsResult(data: unknown): data is ChordsOnlyResult {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<ChordsOnlyResult>;
  return (
    typeof d.task_id === "string" &&
    !!d.telemetry &&
    typeof d.telemetry.bpm === "number" &&
    Array.isArray(d.chords) &&
    Array.isArray(d.beats)
  );
}

export function isValidStemsResult(data: unknown): data is StemsOnlyResult {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<StemsOnlyResult>;
  return (
    typeof d.task_id === "string" &&
    !!d.stems &&
    !!d.stems.stems &&
    typeof d.stems.stems === "object"
  );
}

export function isValidDenoiseResult(data: unknown): data is DenoiseResult {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<DenoiseResult>;
  return (
    typeof d.task_id === "string" &&
    typeof d.denoise_url === "string" &&
    d.denoise_url.length > 0
  );
}

export function streamProgress<T>(
  taskId: string,
  handlers: SseHandlers<T>,
  validate: (data: unknown) => data is T
): () => void {
  let isClosed = false;
  let pollingInterval: NodeJS.Timeout | null = null;
  let eventSource: EventSource | null = null;
  let pollInFlight = false;
  let consecutiveFailures = 0;

  const cleanup = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    if (eventSource) {
      try {
        eventSource.close();
      } catch {
        // ignore close error
      }
      eventSource = null;
    }
  };

  const finishWithComplete = (result: T) => {
    if (isClosed) return;
    isClosed = true;
    cleanup();
    handlers.onComplete?.(result);
  };

  const finishWithError = (message: string) => {
    if (isClosed) return;
    isClosed = true;
    cleanup();
    handlers.onError?.(message);
  };

  const checkStatus = async () => {
    if (isClosed || pollInFlight) return;
    pollInFlight = true;
    try {
      const res = await fetch(normalizeUrl(`/api/status/${taskId}`));
      if (isClosed) return;
      if (!res.ok) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 10) {
          finishWithError(`Mất kết nối với máy chủ khi theo dõi tiến trình (HTTP ${res.status}).`);
        }
        return;
      }
      consecutiveFailures = 0;
      const data = (await res.json()) as {
        status?: string;
        percent?: number;
        stage?: string;
        error?: string;
        result?: unknown;
      };
      if (isClosed) return;

      if (data.status === "COMPLETE" && validate(data.result)) {
        finishWithComplete(data.result);
      } else if (data.status === "FAILED") {
        finishWithError(data.error || "Phân tích GPU gặp sự cố");
      } else if (data.status === "COMPLETE") {
        finishWithError("Kết quả phân tích trả về không hợp lệ.");
      } else {
        handlers.onProgress?.({
          percent: typeof data.percent === "number" ? data.percent : 5,
          stage: data.stage ?? "Đang xử lý trên GPU NVIDIA T4",
        });
      }
    } catch {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 20 && !isClosed) {
        finishWithError("Mất kết nối với máy chủ khi theo dõi tiến trình.");
      }
    } finally {
      pollInFlight = false;
    }
  };

  const startPolling = () => {
    if (isClosed || pollingInterval) return;
    if (eventSource) {
      try {
        eventSource.close();
      } catch {
        // ignore close error
      }
      eventSource = null;
    }

    void checkStatus();
    pollingInterval = setInterval(() => void checkStatus(), 1500);
  };

  const fetchFullResultViaRest = async () => {
    try {
      const res = await fetch(normalizeUrl(`/api/status/${taskId}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        status?: string;
        error?: string;
        result?: unknown;
      };
      if (validate(data.result)) {
        finishWithComplete(data.result);
      } else {
        finishWithError("Kết quả phân tích trả về không hợp lệ.");
      }
    } catch {
      finishWithError("Không thể tải kết quả phân tích sau khi hoàn tất.");
    }
  };

  try {
    eventSource = new EventSource(normalizeUrl(`/api/progress/${taskId}`));

    eventSource.addEventListener("progress", (e: MessageEvent) => {
      if (isClosed) return;
      try {
        const data = JSON.parse(e.data) as { percent: number; stage: string };
        handlers.onProgress?.(data);
      } catch (err) {
        console.warn("Failed to parse progress SSE event:", err);
      }
    });

    eventSource.addEventListener("complete", (e: MessageEvent) => {
      if (isClosed) return;
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(e.data);
      } catch (err) {
        console.warn("Failed to parse complete SSE event:", err);
      }
      if (validate(parsed)) {
        finishWithComplete(parsed);
      } else {
        // SSE payload incomplete/corrupted — recover the full result via REST
        void fetchFullResultViaRest();
      }
    });

    eventSource.addEventListener("error", (e: Event) => {
      if (isClosed) return;
      const msgEvent = e as MessageEvent;
      if (typeof msgEvent.data === "string" && msgEvent.data.length > 0) {
        // Server-sent named "error" event carries a real failure payload
        try {
          const data = JSON.parse(msgEvent.data) as { error?: string };
          finishWithError(data.error || "Phân tích GPU gặp sự cố");
          return;
        } catch {
          finishWithError(String(msgEvent.data));
          return;
        }
      }
      // Native EventSource failure (stream dropped / HTTP error): fallback to REST polling
      startPolling();
    });
  } catch {
    startPolling();
  }

  return () => {
    isClosed = true;
    cleanup();
  };
}

export async function deleteSession(taskId: string): Promise<{ status: string; task_id: string }> {
  const res = await authFetch(normalizeUrl(`/api/session/${taskId}`), { method: "DELETE" });
  if (!res.ok) {
    throw await apiError(res, `Xoá phiên làm việc ${taskId} thất bại`);
  }
  return (await res.json()) as { status: string; task_id: string };
}
