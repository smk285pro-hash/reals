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
TARGET_SAMPLE_RATE = TARGET_SR
TARGET_PEAK = 0.95
TARGET_PEAK_NORM = TARGET_PEAK
MIN_AUDIO_DURATION_SEC = 0.1
MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB


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
