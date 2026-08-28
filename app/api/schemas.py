"""
Pydantic Request and Response Schemas for AI Audio Lab 2026.
Includes Phase 1 DSP Baseline and Phase 2 SOTA Deep Music Analysis Schemas.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class UploadResponse(BaseModel):
    task_id: str = Field(..., description="Unique UUID identifier for the uploaded track")
    filename: str = Field(..., description="Original filename of the uploaded audio")
    message: str = Field(default="File uploaded successfully", description="Status message")
    audio_url: str = Field(..., description="API URL path to stream or download the audio file")


class ChordSegment(BaseModel):
    start: float = Field(..., description="Start timestamp in seconds")
    end: float = Field(..., description="End timestamp in seconds")
    chord: str = Field(..., description="Chord label (e.g., 'C', 'Am', 'G7', 'C/E')")


class DetailedChordSegment(BaseModel):
    start: float = Field(..., description="Start timestamp in seconds")
    end: float = Field(..., description="End timestamp in seconds")
    chord: str = Field(..., description="Detailed chord label (e.g., 'Cmaj7', 'G7/B', 'Fsus4')")
    confidence: Optional[float] = Field(default=None, description="Model emission confidence (0.0 - 1.0)")


class AnalysisRequest(BaseModel):
    task_id: Optional[str] = Field(None, description="Task UUID of a previously uploaded audio file")
    file_path: Optional[str] = Field(None, description="Direct file path on local filesystem")


class AnalysisResponse(BaseModel):
    task_id: str = Field(..., description="Task UUID associated with this analysis")
    bpm: float = Field(..., description="Estimated tempo in Beats Per Minute")
    tempo: float = Field(..., description="Alias for bpm")
    key: str = Field(..., description="Estimated musical key (e.g. 'C Major', 'A Minor')")
    time_signature: str = Field(default="4/4", description="Estimated meter (e.g. '4/4', '3/4')")
    duration: float = Field(..., description="Total audio duration in seconds")
    beats: List[float] = Field(default_factory=list, description="List of beat timestamps in seconds")
    chords: List[ChordSegment] = Field(default_factory=list, description="List of recognized chord segments")


class StemUrls(BaseModel):
    vocals: str = Field(..., description="URL endpoint for separated vocal audio stream")
    drums: str = Field(..., description="URL endpoint for separated drums audio stream")
    bass: str = Field(..., description="URL endpoint for separated bass audio stream")
    other: str = Field(..., description="URL endpoint for separated instruments audio stream")


class DeepAnalysisRequest(BaseModel):
    task_id: Optional[str] = Field(None, description="Task UUID of uploaded track")
    file_path: Optional[str] = Field(None, description="Direct file path on server")


class DeepAnalysisResponse(BaseModel):
    task_id: str = Field(..., description="Task UUID")
    bpm: float = Field(..., description="Estimated tempo in BPM")
    tempo: float = Field(..., description="Alias for bpm")
    key: str = Field(..., description="Estimated Master Key (e.g. 'C Major')")
    time_signature: str = Field(default="4/4", description="Estimated time signature (4/4, 3/4)")
    duration: float = Field(..., description="Audio duration in seconds")
    beats: List[float] = Field(default_factory=list, description="Beat timestamps in seconds")
    downbeats: List[float] = Field(default_factory=list, description="Downbeat (bar start) timestamps in seconds")
    chords: List[DetailedChordSegment] = Field(default_factory=list, description="170+ Chord & Inversion timeline")
    stems: StemUrls = Field(..., description="4-Stem separated audio streaming endpoints")
    model_version: str = Field(default="SOTA 2026", description="Active AI model pipeline descriptor")
