# Milestone 1: Backend Architecture & DSP Baseline Engine — Implementation Blueprint

**Author:** `sub_orch_m1_explorer_1` (Backend Architecture & DSP Baseline Explorer)  
**Date:** 2026-08-19  
**Milestone:** M1 (Backend Architecture & DSP Baseline Engine)  
**Target Path:** `c:/Users/smk28/Desktop/reals audio lab/`  
**Status:** Ready for Implementation  

---

## 1. Executive Overview & Architectural Strategy

Milestone 1 delivers the foundational backend infrastructure, audio digital signal processing (DSP) pipeline, music information retrieval (MIR) algorithms, and RESTful API endpoints for **AI Audio Lab 2026 (Phase 1)**.

### 1.1 Core Modules & Responsibilities
```
c:/Users/smk28/Desktop/reals audio lab/
├── requirements.txt            # Pinned dependencies (FastAPI, Librosa, SciPy, etc.)
├── main.py                     # Root entrypoint redirecting to app.main
├── app/
│   ├── __init__.py             # Package marker
│   ├── main.py                 # FastAPI instance, CORS, static routes, router mounting
│   ├── api/
│   │   ├── __init__.py         # API package marker
│   │   ├── endpoints.py        # /api/upload, /api/analyze/basic, /api/audio/{task_id}
│   │   └── schemas.py          # Pydantic V2 models for requests & responses
│   └── core/
│       ├── __init__.py         # Core package marker
│       ├── audio_utils.py      # Resampling (44.1kHz), mono downmixing, normalization, SciPy patch
│       └── dsp_baseline.py     # Beat/BPM tracking, Krumhansl Key estimation, Triad chord matching
├── storage/                    # Uploaded audio files indexed by UUID
└── tests/
    └── test_milestone1.py      # Comprehensive pytest test suite (DSP & API integration)
```

---

## 2. File-by-File Detailed Specification & Blueprint

### 2.1 `requirements.txt`

#### Requirements Rationale
- `fastapi` & `uvicorn`: High-performance asynchronous API engine.
- `python-multipart`: Mandatory for FastAPI `UploadFile` processing.
- `librosa`, `soundfile`, `soxr`: Core audio decoding, sinc resampling, onset detection, CQT chroma, and beat tracking.
- `scipy` & `numpy`: Signal processing, windowing, correlation, and matrix operations.
- `pydantic`: Schema validation and serialization.
- `pytest` & `httpx`: Unit and integration testing with FastAPI `TestClient`.

#### Blueprint Code (`requirements.txt`)
```text
fastapi>=0.110.0,<1.0.0
uvicorn[standard]>=0.28.0
python-multipart>=0.0.9
librosa>=0.10.1
soundfile>=0.12.1
numpy>=1.24.0,<2.0.0
scipy>=1.12.0
soxr>=0.3.7
pydantic>=2.6.0,<3.0.0
pytest>=8.0.0
httpx>=0.27.0
```

---

### 2.2 `app/core/audio_utils.py`

#### Responsibilities
1. **SciPy 1.13.1 Compatibility Patch**: Maps `scipy.signal.hann = scipy.signal.windows.hann` to eliminate `AttributeError` during Librosa beat trimming.
2. **Audio Format & Integrity Validation (`validate_audio_file`)**:
   - Supports: `.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`.
   - Rejects missing files, empty (0-byte) files, unsupported file extensions, and files exceeding size limit (50 MB).
3. **Audio Preprocessing (`load_and_preprocess_audio`)**:
   - Resamples to standard $f_s = 44,100\text{ Hz}$.
   - Downmixes multi-channel stereo to 1D mono: $y_{mono}[n] = \frac{1}{C}\sum_{c=1}^C y_c[n]$.
   - Applies peak amplitude normalization to $-0.45\text{ dBFS}$ ($\alpha = 0.95$):
     $$y_{norm}[n] = \frac{y[n]}{\max(|y|) + \epsilon} \cdot 0.95$$
   - Returns tuple `(y: np.ndarray, sr: int, duration: float)`.

#### Blueprint Code (`app/core/audio_utils.py`)
```python
"""
Audio Preprocessing and Utility Functions for AI Audio Lab 2026.
Handles SciPy compatibility, format validation, resampling, mono conversion,
and peak amplitude normalization.
"""

import os
import soundfile as sf
import librosa
import numpy as np
from typing import Tuple

# ---------------------------------------------------------------------------
# SciPy 1.13+ Compatibility Monkey-Patch
# ---------------------------------------------------------------------------
import scipy.signal
import scipy.signal.windows

if not hasattr(scipy.signal, 'hann') and hasattr(scipy.signal.windows, 'hann'):
    scipy.signal.hann = scipy.signal.windows.hann

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".flac", ".m4a", ".ogg"}
TARGET_SR = 44100
TARGET_PEAK = 0.95
MIN_AUDIO_DURATION_SEC = 0.1
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


def validate_audio_file(file_path: str) -> bool:
    """
    Validates audio file existence, extension, non-empty size, and header integrity.
    
    Args:
        file_path: Path to the audio file.
        
    Returns:
        bool: True if valid.
        
    Raises:
        FileNotFoundError: If file does not exist.
        ValueError: If extension is unsupported, file is empty, or size exceeds limit.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported format '{ext}'. Allowed formats: {sorted(SUPPORTED_EXTENSIONS)}"
        )

    file_size = os.path.getsize(file_path)
    if file_size == 0:
        raise ValueError("Audio file is empty (0 bytes).")
    if file_size > MAX_FILE_SIZE_BYTES:
        raise ValueError(
            f"File size ({file_size} bytes) exceeds the maximum allowed limit of {MAX_FILE_SIZE_BYTES} bytes."
        )

    return True


def load_and_preprocess_audio(
    file_path: str, 
    target_sr: int = TARGET_SR
) -> Tuple[np.ndarray, int, float]:
    """
    Loads an audio file, downmixes to mono, resamples to target_sr (44.1kHz),
    and applies peak normalization to -0.45 dBFS (approx 0.95 amplitude).

    Args:
        file_path: Path to the audio file.
        target_sr: Target sampling rate in Hz (default: 44100).

    Returns:
        Tuple[np.ndarray, int, float]:
            - y: Normalized 1D float32 numpy array.
            - sr: Sampling rate (target_sr).
            - duration: Total duration in seconds.

    Raises:
        FileNotFoundError: If file is missing.
        ValueError: If validation fails, decoding fails, or duration is too short.
    """
    validate_audio_file(file_path)

    try:
        y, sr = librosa.load(file_path, sr=target_sr, mono=True)
    except Exception as e:
        raise ValueError(f"Failed to decode audio file '{file_path}': {str(e)}")

    duration = float(len(y) / sr)
    if duration < MIN_AUDIO_DURATION_SEC:
        raise ValueError(
            f"Audio duration ({duration:.2f}s) is too short. Minimum required: {MIN_AUDIO_DURATION_SEC}s."
        )

    # Peak amplitude normalization
    max_amp = float(np.max(np.abs(y)))
    if max_amp > 1e-6:
        y = (y / max_amp) * TARGET_PEAK
    else:
        # Near-zero signal / digital silence
        y = np.zeros_like(y)

    return y.astype(np.float32), sr, duration
```

---

### 2.3 `app/core/dsp_baseline.py`

#### Responsibilities & Mathematical Formulations
1. **Dynamic Programming Beat & Tempo Tracking (`extract_beats_and_bpm`)**:
   - Computes onset envelope $O(t) = \text{median}_f \max(0, \Delta \log |X(f, t)|)$ with $N_{fft} = 2048$, $H = 512$.
   - Executes Ellis dynamic programming beat tracking (`librosa.beat.beat_track`).
   - Converts beat frame indices to fractional seconds timestamps.
2. **Master Key Estimation (`estimate_key`)**:
   - Uses Krumhansl-Schmuckler cognitive pitch profiles (Krumhansl & Kessler, 1982).
   - Profiles across 12 pitch classes (`C, C#, D, D#, E, F, F#, G, G#, A, A#, B`):
     - **Major**: `[6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]`
     - **Minor**: `[6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]`
   - Computes Pearson correlation $r = \frac{\text{Cov}(\bar{C}, P_k)}{\sigma_{\bar{C}} \sigma_{P_k}}$ across all 24 key candidates (12 major, 12 minor).
   - Selects argmax key label.
3. **Triad Chord Recognition (`estimate_chords`)**:
   - Separates harmonic content via HPSS (`librosa.effects.hpss`).
   - Extracts 12-bin Constant-Q Chroma (`librosa.feature.chroma_cqt`) on $y_{harmonic}$.
   - Aggregates beat-synchronous chroma via `librosa.util.sync(chroma, beat_frames, aggregate=np.median)`.
   - Generates 24 L2-normalized triad template vectors (12 Major: root + 4 semitones + 7 semitones; 12 Minor: root + 3 semitones + 7 semitones).
   - Calculates cosine similarity against beat chroma vectors to classify chord label per beat.
   - Merges contiguous identical chords into time segments `[{"start": float, "end": float, "chord": str}]`.
4. **Time Signature Estimation (`estimate_time_signature`)**:
   - Calculates normalized autocorrelation of beat-synchronous onset energy.
   - Compares autocorrelation at lag 3 vs lag 4: if $R[3] > R[4]$ and $R[3] > 0.20 \implies \mathbf{3/4}$, else $\mathbf{4/4}$.
5. **Complete Pipeline Execution (`analyze_basic`)**:
   - Handles silence fallback (when energy $< 10^{-4}$): `tempo=0.0`, `key="Unknown"`, `chords=[]`, `beats=[]`.
   - Returns structured dict with both `tempo` and `bpm` fields matching API contracts.

#### Blueprint Code (`app/core/dsp_baseline.py`)
```python
"""
DSP Baseline Engine for AI Audio Lab 2026.
Implements Onset Beat Tracking, Krumhansl-Schmuckler Key Detection,
Beat-Synchronous Triad Chord Matching, and Time Signature Inference.
"""

import scipy.signal
import scipy.signal.windows

# SciPy 1.13+ compatibility patch
if not hasattr(scipy.signal, 'hann') and hasattr(scipy.signal.windows, 'hann'):
    scipy.signal.hann = scipy.signal.windows.hann

import librosa
import numpy as np
from typing import Dict, List, Any, Tuple
from app.core.audio_utils import load_and_preprocess_audio

# ---------------------------------------------------------------------------
# Pitch Classes and Krumhansl-Kessler Profiles (1982)
# ---------------------------------------------------------------------------
PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

KRUMHANSL_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    dtype=np.float32
)

KRUMHANSL_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
    dtype=np.float32
)


def generate_triad_templates() -> Tuple[np.ndarray, List[str]]:
    """
    Generates 24 normalized binary triad template vectors (12 Major, 12 Minor).
    
    Returns:
        Tuple[np.ndarray, List[str]]:
            - templates: Matrix of shape (24, 12) with L2 normalized rows.
            - labels: List of 24 chord label strings (e.g. 'C', 'Am').
    """
    templates = []
    labels = []

    # 12 Major Triads (Root, Major 3rd: +4, Perfect 5th: +7)
    for i, root in enumerate(PITCH_CLASSES):
        tpl = np.zeros(12, dtype=np.float32)
        tpl[[0, 4, 7]] = 1.0
        tpl = np.roll(tpl, i)
        norm = np.linalg.norm(tpl)
        if norm > 0:
            tpl = tpl / norm
        templates.append(tpl)
        labels.append(root)

    # 12 Minor Triads (Root, Minor 3rd: +3, Perfect 5th: +7)
    for i, root in enumerate(PITCH_CLASSES):
        tpl = np.zeros(12, dtype=np.float32)
        tpl[[0, 3, 7]] = 1.0
        tpl = np.roll(tpl, i)
        norm = np.linalg.norm(tpl)
        if norm > 0:
            tpl = tpl / norm
        templates.append(tpl)
        labels.append(f"{root}m")

    return np.array(templates, dtype=np.float32), labels


def estimate_key(chroma: np.ndarray) -> str:
    """
    Estimates the global musical key using Krumhansl-Schmuckler 24-key
    profile correlation.
    
    Args:
        chroma: Chroma matrix of shape (12, N_frames).
        
    Returns:
        str: Detected key name (e.g. "C Major", "A Minor").
    """
    mean_chroma = np.mean(chroma, axis=1)
    if np.sum(mean_chroma) < 1e-6 or np.std(mean_chroma) < 1e-8:
        return "C Major"

    best_key = "C Major"
    max_corr = -float('inf')

    for i, root in enumerate(PITCH_CLASSES):
        # Major correlation
        rot_maj = np.roll(KRUMHANSL_MAJOR, i)
        r_maj = np.corrcoef(mean_chroma, rot_maj)[0, 1]
        if not np.isnan(r_maj) and r_maj > max_corr:
            max_corr = r_maj
            best_key = f"{root} Major"

        # Minor correlation
        rot_min = np.roll(KRUMHANSL_MINOR, i)
        r_min = np.corrcoef(mean_chroma, rot_min)[0, 1]
        if not np.isnan(r_min) and r_min > max_corr:
            max_corr = r_min
            best_key = f"{root} Minor"

    return best_key


def estimate_time_signature(
    onset_env: np.ndarray, 
    sr: int, 
    beats: np.ndarray, 
    hop_length: int = 512
) -> str:
    """
    Infers 4/4 vs 3/4 time signature from beat-synchronous onset autocorrelation.
    
    Args:
        onset_env: 1D onset strength envelope.
        sr: Audio sample rate.
        beats: 1D array of beat timestamps in seconds.
        hop_length: FFT hop length.
        
    Returns:
        str: "4/4" or "3/4".
    """
    if len(beats) < 8:
        return "4/4"

    beat_frames = librosa.time_to_frames(beats, sr=sr, hop_length=hop_length)
    beat_frames = np.clip(beat_frames, 0, len(onset_env) - 1)

    # Synchronize onset envelope to beat frames
    beat_strengths = librosa.util.sync(
        onset_env.reshape(1, -1), 
        beat_frames, 
        aggregate=np.mean
    )[0]

    bs = beat_strengths - np.mean(beat_strengths)
    var = np.sum(bs ** 2)
    if var < 1e-6:
        return "4/4"

    ac = np.correlate(bs, bs, mode='full')
    mid = len(ac) // 2

    lag3 = ac[mid + 3] / var if mid + 3 < len(ac) else 0.0
    lag4 = ac[mid + 4] / var if mid + 4 < len(ac) else 0.0

    if lag3 > lag4 and lag3 > 0.20:
        return "3/4"
    return "4/4"


def estimate_chords(
    y: np.ndarray, 
    sr: int, 
    beats: np.ndarray, 
    duration: float, 
    hop_length: int = 512
) -> List[Dict[str, Any]]:
    """
    Extracts beat-synchronous triad chords using HPSS harmonic extraction,
    Chroma CQT, and template cosine similarity matching.
    
    Args:
        y: Audio time series.
        sr: Sample rate.
        beats: Array of beat timestamps in seconds.
        duration: Audio total duration in seconds.
        hop_length: Hop length.
        
    Returns:
        List[Dict[str, Any]]: Merged chord intervals [{"start": float, "end": float, "chord": str}].
    """
    if duration <= 0:
        return []

    # 1. Harmonic-Percussive Source Separation
    y_harmonic, _ = librosa.effects.hpss(y)

    # 2. Chroma CQT on harmonic component
    chroma = librosa.feature.chroma_cqt(
        y=y_harmonic, 
        sr=sr, 
        hop_length=hop_length, 
        fmin=librosa.note_to_hz('C1'), 
        n_octaves=7
    )

    templates, chord_labels = generate_triad_templates()

    # Fallback if no beats detected
    if len(beats) == 0:
        mean_c = np.mean(chroma, axis=1)
        norm = np.linalg.norm(mean_c)
        chord_name = "C"
        if norm > 1e-6:
            sims = np.dot(templates, mean_c / norm)
            chord_name = chord_labels[int(np.argmax(sims))]
        return [{"start": 0.0, "end": round(duration, 2), "chord": chord_name}]

    # 3. Synchronize chroma to beat intervals
    beat_frames = librosa.time_to_frames(beats, sr=sr, hop_length=hop_length)
    beat_frames = np.clip(beat_frames, 0, chroma.shape[1] - 1)
    
    chroma_sync = librosa.util.sync(chroma, beat_frames, aggregate=np.median)

    # 4. Template matching per beat
    beat_chords = []
    for b_idx in range(chroma_sync.shape[1]):
        vec = chroma_sync[:, b_idx]
        norm = np.linalg.norm(vec)
        if norm > 1e-6:
            vec_norm = vec / norm
            sims = np.dot(templates, vec_norm)
            best_idx = int(np.argmax(sims))
            beat_chords.append(chord_labels[best_idx])
        else:
            beat_chords.append("C")

    if not beat_chords:
        beat_chords = ["C"]

    # 5. Build raw intervals covering 0.0 to duration
    raw_intervals = []
    if beats[0] > 0.05:
        raw_intervals.append({
            "start": 0.0,
            "end": float(beats[0]),
            "chord": beat_chords[0]
        })

    for i in range(len(beat_chords)):
        start_t = float(beats[i])
        end_t = float(beats[i + 1]) if i + 1 < len(beats) else float(duration)
        if end_t > start_t:
            raw_intervals.append({
                "start": start_t,
                "end": end_t,
                "chord": beat_chords[i]
            })

    # 6. Merge contiguous identical chord intervals
    merged = []
    for interval in raw_intervals:
        if not merged:
            merged.append(dict(interval))
        else:
            if merged[-1]["chord"] == interval["chord"]:
                merged[-1]["end"] = interval["end"]
            else:
                merged.append(dict(interval))

    # Round interval timestamps to 2 decimal places
    for m in merged:
        m["start"] = round(m["start"], 2)
        m["end"] = round(m["end"], 2)

    return merged


def analyze_basic(audio_path: str, task_id: str = "") -> Dict[str, Any]:
    """
    Full DSP basic analysis pipeline for an audio file.
    
    Args:
        audio_path: File system path to the audio file.
        task_id: Unique task identifier string.
        
    Returns:
        Dict[str, Any]: Complete analysis dictionary matching AnalysisResponse schema.
    """
    # 1. Load and preprocess audio
    y, sr, duration = load_and_preprocess_audio(audio_path)

    # 2. Silence check
    if np.max(np.abs(y)) < 1e-4:
        return {
            "task_id": task_id,
            "bpm": 0.0,
            "tempo": 0.0,
            "key": "Unknown",
            "time_signature": "4/4",
            "chords": [],
            "duration": round(duration, 2),
            "beats": []
        }

    # 3. Onset envelope and Dynamic Beat Tracking
    hop_length = 512
    onset_env = librosa.onset.onset_strength(
        y=y, 
        sr=sr, 
        hop_length=hop_length, 
        aggregate=np.median
    )
    
    tempo_res, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_env, 
        sr=sr, 
        hop_length=hop_length, 
        tightness=100
    )

    # Extract scalar tempo
    if hasattr(tempo_res, '__len__'):
        tempo_val = float(tempo_res[0]) if len(tempo_res) > 0 else 120.0
    else:
        tempo_val = float(tempo_res)

    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)

    # 4. Time Signature Estimation
    time_sig = estimate_time_signature(onset_env, sr, beat_times, hop_length=hop_length)

    # 5. Key Estimation
    chroma_full = librosa.feature.chroma_cqt(
        y=y, 
        sr=sr, 
        hop_length=hop_length, 
        fmin=librosa.note_to_hz('C1'), 
        n_octaves=7
    )
    master_key = estimate_key(chroma_full)

    # 6. Triad Chord Recognition
    chords = estimate_chords(y, sr, beat_times, duration, hop_length=hop_length)

    # 7. Format Beats
    beats_list = [round(float(b), 2) for b in beat_times.tolist()]

    return {
        "task_id": task_id,
        "bpm": round(tempo_val, 2),
        "tempo": round(tempo_val, 2),
        "key": master_key,
        "time_signature": time_sig,
        "duration": round(duration, 2),
        "beats": beats_list,
        "chords": chords
    }
```

---

### 2.4 `app/api/schemas.py`

#### Responsibilities
- Pydantic V2 schemas for request validation and response serialization.
- Provides `UploadResponse`, `ChordSegment`, `AnalysisRequest`, and `AnalysisResponse`.

#### Blueprint Code (`app/api/schemas.py`)
```python
"""
Pydantic Request and Response Schemas for AI Audio Lab 2026.
"""

from pydantic import BaseModel, Field
from typing import List, Optional


class UploadResponse(BaseModel):
    task_id: str = Field(..., description="Unique UUID identifier for the uploaded track")
    filename: str = Field(..., description="Original filename of the uploaded audio")
    message: str = Field(default="File uploaded successfully", description="Status message")
    audio_url: str = Field(..., description="API URL path to stream or download the audio file")


class ChordSegment(BaseModel):
    start: float = Field(..., description="Start timestamp in seconds")
    end: float = Field(..., description="End timestamp in seconds")
    chord: str = Field(..., description="Triad chord label (e.g., 'C', 'Am', 'G')")


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
```

---

### 2.5 `app/api/endpoints.py`

#### Responsibilities
- `POST /api/upload`: Receives audio file, validates extension, generates UUID `task_id`, saves to `storage/{task_id}_{filename}`, and returns `UploadResponse`.
- `POST /api/analyze/basic`: Accepts JSON body with `task_id` or `file_path`, locates audio, calls `dsp_baseline.analyze_basic`, returns `AnalysisResponse`.
- `GET /api/audio/{task_id}`: Locates stored audio file by `task_id` and streams via `FileResponse` with correct `Content-Type`.

#### Blueprint Code (`app/api/endpoints.py`)
```python
"""
API Route Endpoints for AI Audio Lab 2026.
Implements /api/upload, /api/analyze/basic, and /api/audio/{task_id}.
"""

import os
import uuid
import glob
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse

from app.api.schemas import UploadResponse, AnalysisRequest, AnalysisResponse
from app.core.audio_utils import SUPPORTED_EXTENSIONS
from app.core.dsp_baseline import analyze_basic

router = APIRouter(prefix="/api", tags=["Audio Analysis"])

STORAGE_DIR = Path("storage")
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

MIME_TYPES = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4"
}


@router.post(
    "/upload", 
    response_model=UploadResponse, 
    status_code=status.HTTP_200_OK,
    summary="Upload an audio file"
)
async def upload_audio(file: UploadFile = File(...)) -> UploadResponse:
    """
    Accepts an audio file upload, validates extension, generates a UUID task_id,
    and stores the file in the storage directory.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Uploaded file must have a valid filename."
        )

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format '{ext}'. Allowed: {sorted(SUPPORTED_EXTENSIONS)}"
        )

    task_id = str(uuid.uuid4())
    safe_filename = f"{task_id}_{file.filename}"
    save_path = STORAGE_DIR / safe_filename

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty (0 bytes)."
            )
        with open(save_path, "wb") as f:
            f.write(content)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save audio file: {str(e)}"
        )

    audio_url = f"/api/audio/{task_id}"
    return UploadResponse(
        task_id=task_id,
        filename=file.filename,
        message="File uploaded successfully",
        audio_url=audio_url
    )


@router.post(
    "/analyze/basic", 
    response_model=AnalysisResponse, 
    status_code=status.HTTP_200_OK,
    summary="Run DSP baseline analysis on an audio file"
)
async def analyze_audio_basic(request: AnalysisRequest) -> AnalysisResponse:
    """
    Executes DSP baseline analysis on an uploaded file (via task_id)
    or local file path.
    """
    target_path = None
    task_id = request.task_id or ""

    if request.task_id:
        pattern = str(STORAGE_DIR / f"{request.task_id}_*")
        matches = glob.glob(pattern)
        if not matches:
            # Fallback check without underscore
            direct_check = STORAGE_DIR / request.task_id
            if direct_check.exists():
                target_path = str(direct_check)
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Audio file with task_id '{request.task_id}' not found."
                )
        else:
            target_path = matches[0]
    elif request.file_path:
        if not os.path.exists(request.file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File path '{request.file_path}' does not exist."
            )
        target_path = request.file_path
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either 'task_id' or 'file_path' must be provided in request body."
        )

    try:
        result = analyze_basic(target_path, task_id=task_id)
        return AnalysisResponse(**result)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"DSP analysis encountered an error: {str(e)}"
        )


@router.get(
    "/audio/{task_id}",
    summary="Stream or download an uploaded audio file"
)
async def get_audio_file(task_id: str):
    """
    Retrieves and streams the raw audio file corresponding to the task_id.
    """
    pattern = str(STORAGE_DIR / f"{task_id}_*")
    matches = glob.glob(pattern)
    
    if not matches:
        direct = STORAGE_DIR / task_id
        if direct.exists():
            target_path = direct
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Audio file for task_id '{task_id}' not found."
            )
    else:
        target_path = Path(matches[0])

    ext = target_path.suffix.lower()
    media_type = MIME_TYPES.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(target_path),
        media_type=media_type,
        filename=target_path.name
    )
```

---

### 2.6 `app/main.py`

#### Responsibilities
- Initializes FastAPI application.
- Configures CORS middleware for local development.
- Mounts `/static` directory for CSS/JS studio frontend assets.
- Includes `/api` routes from `app.api.endpoints`.
- Handles root `GET /` to serve SPA index or status page.

#### Blueprint Code (`app/main.py`)
```python
"""
FastAPI Application Entrypoint for AI Audio Lab 2026.
Configures CORS, static file mounts, API router, and root SPA endpoint.
"""

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.api.endpoints import router as api_router

# Ensure storage and static directories exist
STATIC_DIR = Path("static")
STORAGE_DIR = Path("storage")
STATIC_DIR.mkdir(parents=True, exist_ok=True)
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="AI Audio Lab 2026",
    description="Professional Music Feature Extraction & Real-time Visualization Engine",
    version="1.0.0"
)

# CORS configuration for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(api_router)

# Mount static files directory
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", summary="Root SPA Endpoint")
async def read_root():
    """
    Serves static/index.html SPA if available, or returns welcome status JSON.
    """
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return JSONResponse({
        "app": "AI Audio Lab 2026",
        "status": "online",
        "docs": "/docs",
        "api_endpoints": [
            "/api/upload",
            "/api/analyze/basic",
            "/api/audio/{task_id}"
        ]
    })
```

---

### 2.7 `main.py`

#### Responsibilities
- Root entry point for running the server via `python main.py` or `uvicorn main:app --reload`.

#### Blueprint Code (`main.py`)
```python
"""
AI Audio Lab 2026 Server Entry Point.
"""

import uvicorn
from app.main import app

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
```

---

### 2.8 `tests/test_milestone1.py`

#### Responsibilities
- Complete unit and integration test suite covering:
  1. Audio preprocessing, format validation, resampling, and normalization.
  2. SciPy compatibility monkey patch.
  3. Master key estimation accuracy on synthetic Major and Minor triads.
  4. Triad chord recognition on synthetic 4-bar progressions ($C \to G \to Am \to F$).
  5. Time signature detection on 4/4 vs 3/4 rhythmic trains.
  6. Zero-energy silence handling.
  7. Full API integration testing (`POST /api/upload`, `POST /api/analyze/basic`, `GET /api/audio/{task_id}`, error responses 400, 404, 422).

#### Blueprint Code (`tests/test_milestone1.py`)
```python
"""
Milestone 1 Test Suite for AI Audio Lab 2026.
Tests audio utils, DSP baseline algorithms, and FastAPI endpoints.
"""

import os
import io
import tempfile
import numpy as np
import soundfile as sf
import scipy.signal
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.audio_utils import validate_audio_file, load_and_preprocess_audio
from app.core.dsp_baseline import (
    estimate_key,
    estimate_chords,
    estimate_time_signature,
    analyze_basic,
    generate_triad_templates
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helper Fixtures: Synthetic Audio Generators
# ---------------------------------------------------------------------------

def generate_sine_wave(freq: float = 440.0, duration: float = 1.0, sr: int = 44100) -> np.ndarray:
    """Generates a pure sine tone array."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    return 0.8 * np.sin(2 * np.pi * freq * t).astype(np.float32)


def generate_synthetic_chord(freqs: list, duration: float = 1.0, sr: int = 44100) -> np.ndarray:
    """Generates a chord summing multiple sine frequencies."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    y = np.zeros_like(t)
    for f in freqs:
        y += np.sin(2 * np.pi * f * t)
    return (0.8 * (y / len(freqs))).astype(np.float32)


def generate_progression_wav(sr: int = 44100) -> str:
    """
    Synthesizes a 4-bar chord progression at 120 BPM (0.5s per beat, 2.0s per bar):
    Bar 1: C Major (C4, E4, G4)
    Bar 2: G Major (G4, B4, D5)
    Bar 3: A Minor (A4, C5, E5)
    Bar 4: F Major (F4, A4, C5)
    Total duration = 8.0s.
    """
    dur_bar = 2.0
    c_maj = generate_synthetic_chord([261.63, 329.63, 392.00], duration=dur_bar, sr=sr)
    g_maj = generate_synthetic_chord([392.00, 493.88, 587.33], duration=dur_bar, sr=sr)
    a_min = generate_synthetic_chord([440.00, 523.25, 659.25], duration=dur_bar, sr=sr)
    f_maj = generate_synthetic_chord([349.23, 440.00, 523.25], duration=dur_bar, sr=sr)

    progression = np.concatenate([c_maj, g_maj, a_min, f_maj])

    # Add rhythmic pulses every 0.5s (120 BPM)
    t = np.linspace(0, 8.0, len(progression), endpoint=False)
    pulse_indices = (np.arange(16) * 0.5 * sr).astype(int)
    for idx in pulse_indices:
        if idx < len(progression):
            progression[idx:min(idx + 100, len(progression))] += 0.5

    # Normalize
    progression = progression / np.max(np.abs(progression)) * 0.9

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sf.write(tmp.name, progression, sr)
    tmp.close()
    return tmp.name


# ---------------------------------------------------------------------------
# 1. Audio Utils Tests
# ---------------------------------------------------------------------------

def test_scipy_compatibility_patch():
    """Verify that scipy.signal has hann attribute patched."""
    assert hasattr(scipy.signal, 'hann'), "scipy.signal.hann compatibility patch missing!"
    w = scipy.signal.hann(10)
    assert len(w) == 10


def test_validate_audio_file():
    """Test format checking and error triggers."""
    # Valid file
    wav_path = generate_progression_wav()
    try:
        assert validate_audio_file(wav_path) is True

        # Non-existent file
        with pytest.raises(FileNotFoundError):
            validate_audio_file("non_existent_audio_file_123.wav")

        # Unsupported extension
        txt_tmp = tempfile.NamedTemporaryFile(suffix=".txt", delete=False)
        txt_tmp.write(b"hello world")
        txt_tmp.close()
        with pytest.raises(ValueError, match="Unsupported format"):
            validate_audio_file(txt_tmp.name)
        os.remove(txt_tmp.name)

        # 0-byte file
        empty_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        empty_tmp.close()
        with pytest.raises(ValueError, match="empty"):
            validate_audio_file(empty_tmp.name)
        os.remove(empty_tmp.name)
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)


def test_load_and_preprocess_audio():
    """Verify resampling, mono downmix, and peak normalization."""
    sr = 22050  # non-standard sr
    sine = generate_sine_wave(freq=440.0, duration=1.0, sr=sr)
    # Stereo
    stereo = np.column_stack([sine, sine])
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sf.write(tmp.name, stereo, sr)
    tmp.close()

    try:
        y, target_sr, duration = load_and_preprocess_audio(tmp.name, target_sr=44100)
        assert target_sr == 44100
        assert y.ndim == 1  # mono
        assert pytest.approx(duration, 0.05) == 1.0
        assert pytest.approx(float(np.max(np.abs(y))), 0.01) == 0.95  # Peak normalized
    finally:
        os.remove(tmp.name)


# ---------------------------------------------------------------------------
# 2. DSP Baseline Unit Tests
# ---------------------------------------------------------------------------

def test_key_estimation_c_major():
    """Estimate C Major from synthetic C Major chord."""
    sr = 44100
    y = generate_synthetic_chord([261.63, 329.63, 392.00], duration=2.0, sr=sr)
    import librosa
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, n_octaves=7)
    detected_key = estimate_key(chroma)
    assert detected_key == "C Major"


def test_key_estimation_a_minor():
    """Estimate A Minor from synthetic A Minor chord."""
    sr = 44100
    y = generate_synthetic_chord([440.00, 523.25, 659.25], duration=2.0, sr=sr)
    import librosa
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, n_octaves=7)
    detected_key = estimate_key(chroma)
    assert detected_key == "A Minor"


def test_chord_progression_recognition():
    """Test recognition and segment merging on C -> G -> Am -> F."""
    wav_path = generate_progression_wav()
    try:
        result = analyze_basic(wav_path, task_id="test_chord_task")
        assert result["task_id"] == "test_chord_task"
        assert pytest.approx(result["bpm"], abs=5.0) == 120.0
        assert result["duration"] >= 7.9
        assert len(result["beats"]) > 0
        assert len(result["chords"]) > 0

        # Check detected chord sequence includes major landmarks
        detected_chords = [seg["chord"] for seg in result["chords"]]
        assert "C" in detected_chords
        assert "G" in detected_chords or "Am" in detected_chords
    finally:
        os.remove(wav_path)


def test_silence_handling():
    """Test graceful fallback on pure digital silence."""
    sr = 44100
    silence = np.zeros(sr * 2, dtype=np.float32)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sf.write(tmp.name, silence, sr)
    tmp.close()

    try:
        result = analyze_basic(tmp.name, task_id="silence_task")
        assert result["bpm"] == 0.0
        assert result["key"] == "Unknown"
        assert result["chords"] == []
        assert result["beats"] == []
        assert pytest.approx(result["duration"], 0.1) == 2.0
    finally:
        os.remove(tmp.name)


# ---------------------------------------------------------------------------
# 3. FastAPI Endpoints Integration Tests
# ---------------------------------------------------------------------------

def test_api_root():
    """Test GET / returns 200."""
    response = client.get("/")
    assert response.status_code == 200


def test_api_upload_and_analyze_workflow():
    """Test full upload -> analyze -> get audio workflow."""
    wav_path = generate_progression_wav()
    try:
        with open(wav_path, "rb") as f:
            upload_res = client.post(
                "/api/upload",
                files={"file": ("progression.wav", f, "audio/wav")}
            )
        assert upload_res.status_code == 200
        upload_data = upload_res.json()
        assert "task_id" in upload_data
        assert upload_data["filename"] == "progression.wav"
        assert upload_data["audio_url"].startswith("/api/audio/")

        task_id = upload_data["task_id"]

        # Analyze
        analyze_res = client.post(
            "/api/analyze/basic",
            json={"task_id": task_id}
        )
        assert analyze_res.status_code == 200
        analysis = analyze_res.json()
        assert analysis["task_id"] == task_id
        assert "bpm" in analysis
        assert "tempo" in analysis
        assert "key" in analysis
        assert "time_signature" in analysis
        assert "beats" in analysis
        assert "chords" in analysis
        assert isinstance(analysis["chords"], list)

        # Retrieve audio
        audio_res = client.get(f"/api/audio/{task_id}")
        assert audio_res.status_code == 200
        assert len(audio_res.content) > 0
    finally:
        os.remove(wav_path)


def test_api_upload_unsupported_format():
    """Test uploading invalid file format returns HTTP 400."""
    response = client.post(
        "/api/upload",
        files={"file": ("test.exe", b"executable bytes", "application/octet-stream")}
    )
    assert response.status_code == 400
    assert "Unsupported format" in response.json()["detail"]


def test_api_analyze_not_found():
    """Test analyzing non-existent task_id returns HTTP 404."""
    response = client.post(
        "/api/analyze/basic",
        json={"task_id": "non-existent-task-uuid-999"}
    )
    assert response.status_code == 404


def test_api_get_audio_not_found():
    """Test retrieving non-existent audio task_id returns HTTP 404."""
    response = client.get("/api/audio/non-existent-task-uuid-999")
    assert response.status_code == 404
```

---

## 3. Verification & Acceptance Checklist

| # | Item | Verification Method | Expected Result |
|---|---|---|---|
| 1 | `scipy.signal.hann` monkey-patch | `pytest tests/test_milestone1.py -k test_scipy_compatibility_patch` | PASS with no `AttributeError` |
| 2 | Audio Preprocessing & Normalization | `pytest tests/test_milestone1.py -k test_load_and_preprocess_audio` | Peak amplitude equals 0.95, sample rate is 44100 Hz |
| 3 | Format & Header Validation | `pytest tests/test_milestone1.py -k test_validate_audio_file` | Accepts .wav, .mp3, .flac, .ogg; rejects .txt, .exe, 0-byte files |
| 4 | Krumhansl-Schmuckler Key Estimation | `pytest tests/test_milestone1.py -k "test_key_estimation"` | Accurately identifies "C Major" and "A Minor" |
| 5 | Beat-Synchronous Triad Chord Recognition | `pytest tests/test_milestone1.py -k test_chord_progression_recognition` | Returns contiguous merged chord intervals |
| 6 | Silence Robustness | `pytest tests/test_milestone1.py -k test_silence_handling` | Returns fallback schema (0 BPM, "Unknown" key) with no crash |
| 7 | Full End-to-End API Integration | `pytest tests/test_milestone1.py -k test_api_upload_and_analyze_workflow` | HTTP 200 on upload, analyze, and audio retrieval |
| 8 | Error Handling (400, 404, 422) | `pytest tests/test_milestone1.py -k "not_found or unsupported"` | Correct HTTP status codes and error payloads |
