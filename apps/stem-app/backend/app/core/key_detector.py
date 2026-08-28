from __future__ import annotations

from typing import Literal, Tuple
import numpy as np

# Exact Krumhansl-Schmuckler key profiles
KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def detect_key(chroma_mean: np.ndarray) -> Tuple[str, Literal["major", "minor"], float]:
    """Detect musical key and scale mode using Krumhansl-Schmuckler profile correlation.

    Args:
        chroma_mean: 12-element numpy array representing average chroma energy (C to B).

    Returns:
        tuple of (master_key, scale_mode, correlation_score).
    """
    if chroma_mean.shape[0] != 12:
        raise ValueError(f"Expected 12-element chroma vector, got shape {chroma_mean.shape}")

    chroma_std = float(np.std(chroma_mean))
    if chroma_std < 1e-9:
        # Uniform or silent chroma
        return "C", "major", 0.0

    major_profile = np.array(KS_MAJOR, dtype=np.float64)
    minor_profile = np.array(KS_MINOR, dtype=np.float64)

    best_key = "C"
    best_mode: Literal["major", "minor"] = "major"
    max_correlation = -2.0

    for i in range(12):
        # Circular shift to test pitch class root i
        shifted_major = np.roll(major_profile, i)
        shifted_minor = np.roll(minor_profile, i)

        corr_major = float(np.corrcoef(chroma_mean, shifted_major)[0, 1])
        corr_minor = float(np.corrcoef(chroma_mean, shifted_minor)[0, 1])

        if corr_major > max_correlation:
            max_correlation = corr_major
            best_key = PITCH_CLASSES[i]
            best_mode = "major"

        if corr_minor > max_correlation:
            max_correlation = corr_minor
            best_key = PITCH_CLASSES[i]
            best_mode = "minor"

    return best_key, best_mode, round(max_correlation, 4)
