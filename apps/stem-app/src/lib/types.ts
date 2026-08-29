export type StemMode = "2" | "4" | "6" | "8";

export interface TelemetryData {
  bpm: number;
  master_key: string;
  scale_mode: "major" | "minor";
  time_signature: string;
  duration: number;
}

export interface BeatPoint {
  timestamp: number;
  beat_number: number;
  is_downbeat: boolean;
}

export interface ChordSegment {
  start: number;
  end: number;
  chord: string;
  root: string;
  bass: string;
  quality: string;
  confidence: number;
}

export interface StemInfo {
  url: string;
  color: string;
  default_gain_db: number;
}

export interface StemManifest {
  mode: StemMode;
  stems: Record<string, StemInfo>;
}

export interface DeepAnalysisResponse {
  task_id: string;
  telemetry: TelemetryData;
  beats: BeatPoint[];
  chords: ChordSegment[];
  stems: StemManifest;
  warnings: string[];
}

/** Standalone chord-analysis result (no stems). */
export interface ChordsOnlyResult {
  task_id: string;
  telemetry: TelemetryData;
  beats: BeatPoint[];
  chords: ChordSegment[];
  warnings: string[];
}

/** Standalone stem-separation result (no music analysis). */
export interface StemsOnlyResult {
  task_id: string;
  stems: StemManifest;
  warnings: string[];
}

/** Standalone noise-reduction result. */
export interface DenoiseResult {
  task_id: string;
  denoise_url: string;
  engine: string;
  strength: number;
  sample_rate: number;
  channels: number;
  duration: number;
  warnings: string[];
}

/** User-selectable processing mode: full combo pipeline or a single feature. */
export type FeatureMode = "all" | "tempo" | "chords" | "stems" | "denoise";

export type StudioPhase =
  | "IDLE"
  | "UPLOADING"
  | "QUICK_READY"
  | "DEEP_RUNNING"
  | "READY"
  | "CHORDS_RUNNING"
  | "STEMS_RUNNING"
  | "CHORDS_READY"
  | "STEMS_READY"
  | "DENOISE_RUNNING"
  | "DENOISE_READY";

export interface SseHandlers<T = DeepAnalysisResponse> {
  onProgress?: (data: { percent: number; stage: string }) => void;
  onComplete?: (data: T) => void;
  onError?: (error: string) => void;
}
