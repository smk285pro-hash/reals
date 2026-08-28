from __future__ import annotations

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel


class TelemetryData(BaseModel):
    bpm: float
    master_key: str                      # "C", "C#", "Db"..., "B"
    scale_mode: Literal["major", "minor"]
    time_signature: str                  # "4/4" | "3/4" | "6/8" | "2/4"
    duration: float


class BeatPoint(BaseModel):
    timestamp: float
    beat_number: int
    is_downbeat: bool


class ChordSegment(BaseModel):
    start: float
    end: float
    chord: str                           # hiển thị: "Am7", "G/B", "N"
    root: str
    bass: str
    quality: str                         # root/bass ∈ pitch-class names, "N" nếu không xác định
    confidence: float                    # 0..1


class StemInfo(BaseModel):
    url: str
    color: str
    default_gain_db: float = 0.0


class StemManifest(BaseModel):
    mode: Literal["2", "4", "6", "8"]    # 2=vocals+instrumental | 4=htdemucs | 6=htdemucs_6s (thêm guitar,piano) | 8=thử nghiệm
    stems: Dict[str, StemInfo]           # key: vocals|drums|bass|other|guitar|piano|instrumental...


class DeepAnalysisResponse(BaseModel):
    task_id: str
    telemetry: TelemetryData
    beats: List[BeatPoint]
    chords: List[ChordSegment]
    stems: StemManifest
    warnings: List[str] = []


class TaskState(BaseModel):
    task_id: str
    status: Literal["QUEUED", "RUNNING", "COMPLETE", "FAILED"]
    stage: str = ""
    percent: int = 0
    error: Optional[str] = None


STEM_COLORS: Dict[str, str] = {
    "vocals": "#a855f7",
    "drums": "#f97316",
    "bass": "#3b82f6",
    "other": "#22c55e",
    "guitar": "#eab308",
    "piano": "#ec4899",
    "instrumental": "#94a3b8",
    "strings": "#14b8a6",
    "synth": "#8b5cf6",
}
