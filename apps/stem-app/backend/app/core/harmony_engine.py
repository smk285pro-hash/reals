from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from app.core.config import SAMPLE_RATE


@dataclass
class HarmonyFeatures:
    beat_chroma: np.ndarray  # Shape: (n_beats, 12), L2-normalized per row
    beat_times: np.ndarray   # Shape: (n_beats + 1,)


def extract_harmony(
    other_path: Path,
    mono_mix_path: Path,
    beats: np.ndarray,
    bpm: float,
    bass_path: Path | None = None,
) -> HarmonyFeatures:
    """Extract beat-synchronous harmonic chroma representations from separated stems or mix."""
    # Load harmonic stem (other/accompaniment) with mix fallback
    audio: np.ndarray
    if other_path.exists():
        audio, _ = sf.read(str(other_path), dtype="float32")
    elif mono_mix_path.exists():
        audio, _ = sf.read(str(mono_mix_path), dtype="float32")
    else:
        raise FileNotFoundError(f"Neither {other_path} nor {mono_mix_path} exists.")

    if audio.ndim > 1:
        audio = np.mean(audio, axis=-1)

    hop_length = 512

    # High-resolution 36-bin CQT Chroma (3 bins per semitone)
    chroma_36 = librosa.feature.chroma_cqt(
        y=audio,
        sr=SAMPLE_RATE,
        hop_length=hop_length,
        n_chroma=36,
        bins_per_octave=36,
    )

    # Gaussian reduction from 36 bins down to 12 pitch classes
    n_frames = chroma_36.shape[1]
    chroma_12 = np.zeros((12, n_frames), dtype=np.float32)
    offsets = np.array([-1, 0, 1], dtype=np.float32)
    weights = np.exp(-0.5 * np.square(offsets / 1.0)).astype(np.float32)
    weights /= np.sum(weights)

    for pc in range(12):
        center_bin = pc * 3 + 1
        bin_indices = (center_bin + np.array([-1, 0, 1])) % 36
        sub_chroma = chroma_36[bin_indices, :]
        chroma_12[pc, :] = np.tensordot(weights, sub_chroma, axes=(0, 0))

    # Add bass stem chroma with 1.5x weighting if available
    if bass_path is not None and bass_path.exists():
        try:
            bass_audio, _ = sf.read(str(bass_path), dtype="float32")
            if bass_audio.ndim > 1:
                bass_audio = np.mean(bass_audio, axis=-1)
            chroma_bass = librosa.feature.chroma_cqt(
                y=bass_audio,
                sr=SAMPLE_RATE,
                hop_length=hop_length,
                n_chroma=12,
            )
            min_len = min(chroma_12.shape[1], chroma_bass.shape[1])
            chroma_12[:, :min_len] += 1.5 * chroma_bass[:, :min_len]
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Failed to extract bass chroma: %s", exc)

    # Construct beat interval boundaries: [b_0, b_1, ..., b_{n-1}, b_{n-1} + (60/bpm)]
    beat_step = 60.0 / max(bpm, 20.0)
    if len(beats) == 0:
        beat_times = np.array([0.0, beat_step], dtype=np.float64)
    else:
        beat_times = np.append(beats, beats[-1] + beat_step)

    n_beats = len(beat_times) - 1
    beat_chroma = np.zeros((n_beats, 12), dtype=np.float32)

    # Beat-synchronous pooling: average chroma across each beat interval and apply L2 normalization
    for k in range(n_beats):
        t_start = beat_times[k]
        t_end = beat_times[k + 1]

        start_frame = int(round(t_start * SAMPLE_RATE / hop_length))
        end_frame = int(round(t_end * SAMPLE_RATE / hop_length))

        start_frame = max(0, min(start_frame, n_frames - 1))
        end_frame = max(start_frame + 1, min(end_frame, n_frames))

        slice_chroma = chroma_12[:, start_frame:end_frame]
        if slice_chroma.shape[1] > 0:
            c_k = np.mean(slice_chroma, axis=1)
        else:
            c_k = chroma_12[:, start_frame]

        # Sharpen: subtract the median pitch-class energy as a leakage floor.
        # Harmonic overtones (3rd harmonic = fifth) and CQT leakage light up
        # every pitch class a little; without this floor the resulting smeared
        # chroma makes all chord templates look equally plausible.
        c_k = np.maximum(c_k - float(np.median(c_k)), 0.0)

        # L2 Normalization: C_k / (||C_k||_2 + 1e-9)
        norm = float(np.linalg.norm(c_k))
        if norm > 1e-9:
            c_k = c_k / norm

        beat_chroma[k, :] = c_k

    return HarmonyFeatures(
        beat_chroma=beat_chroma,
        beat_times=beat_times,
    )
