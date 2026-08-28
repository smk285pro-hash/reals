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
    if len(beats) > 0 and beats[0] > 0.05:
        raw_intervals.append({
            "start": 0.0,
            "end": float(beats[0]),
            "chord": beat_chords[0]
        })

    for i in range(len(beat_chords)):
        start_t = float(beats[i]) if i < len(beats) else 0.0
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
