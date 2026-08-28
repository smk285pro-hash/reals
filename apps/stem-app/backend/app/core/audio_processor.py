from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import List, Tuple, Union

import librosa
import numpy as np
import pyloudnorm as pyln
import scipy.signal
import soundfile as sf

from app.core.config import LUFS_TARGET, SAMPLE_RATE, SETTINGS

logger = logging.getLogger(__name__)


def load_any_format(path: Union[Path, str]) -> Tuple[np.ndarray, int]:
    """Load an audio file into float32 stereo format (2, N) using soundfile, torchaudio, or librosa."""
    path_obj = Path(path)
    if not path_obj.exists():
        raise FileNotFoundError(f"Audio file not found: {path_obj}")

    stereo: np.ndarray | None = None
    sr: int = SAMPLE_RATE

    # 1. Primary: Soundfile
    try:
        data, file_sr = sf.read(str(path_obj), dtype="float32", always_2d=True)
        stereo = data.T
        sr = int(file_sr)
    except Exception as exc:
        logger.debug("Soundfile read failed: %s, attempting alternative decoders.", exc)

    # 2. Secondary: Torchaudio (robust MP3, AAC, FLAC, M4A backend)
    if stereo is None:
        try:
            import torchaudio  # type: ignore[import-not-found]
            wav_tensor, torch_sr = torchaudio.load(str(path_obj))
            stereo = wav_tensor.numpy().astype(np.float32)
            sr = int(torch_sr)
        except Exception as exc:
            logger.debug("Torchaudio load failed: %s, attempting librosa.", exc)

    # 3. Tertiary: Librosa / audioread
    if stereo is None:
        try:
            mono_or_multi, lib_sr = librosa.load(str(path_obj), sr=None, mono=False, dtype=np.float32)
            if mono_or_multi.ndim == 1:
                stereo = np.stack([mono_or_multi, mono_or_multi], axis=0)
            else:
                stereo = mono_or_multi
            sr = int(lib_sr)
        except Exception as exc:
            raise RuntimeError(f"Không thể giải mã tệp âm thanh: {exc}")

    # Ensure stereo shape is strictly (2, N)
    if stereo.ndim == 1:
        stereo = np.stack([stereo, stereo], axis=0)
    elif stereo.shape[0] == 1:
        stereo = np.repeat(stereo, 2, axis=0)
    elif stereo.shape[0] > 2:
        stereo = stereo[:2, :]

    return stereo.astype(np.float32), sr


def resample(audio: np.ndarray, sr_in: int, sr_out: int = SAMPLE_RATE) -> np.ndarray:
    """Resample audio array of shape (channels, samples) using scipy.signal.resample_poly."""
    if sr_in == sr_out:
        return audio.astype(np.float32)
    if sr_in <= 0 or sr_out <= 0:
        raise ValueError(f"Invalid sample rates: sr_in={sr_in}, sr_out={sr_out}")

    gcd = math.gcd(sr_in, sr_out)
    up = sr_out // gcd
    down = sr_in // gcd

    resampled = scipy.signal.resample_poly(audio, up, down, axis=-1)
    return resampled.astype(np.float32)


def normalize_ebu_r128(stereo: np.ndarray, sr: int) -> np.ndarray:
    """Normalize stereo audio (2, N) to target LUFS using pyloudnorm with clipping guard."""
    try:
        data_t = stereo.T
        meter = pyln.Meter(sr)
        loudness = meter.integrated_loudness(data_t)

        # Guard against silence / -inf / NaN
        if math.isinf(loudness) or np.isneginf(loudness) or math.isnan(loudness) or loudness <= -70.0:
            return np.clip(stereo, -1.0, 1.0).astype(np.float32)

        normalized_t = pyln.normalize.loudness(data_t, loudness, LUFS_TARGET)
        clipped = np.clip(normalized_t.T, -1.0, 1.0)
        return clipped.astype(np.float32)
    except Exception as exc:
        logger.warning("EBU R128 loudness normalization failed (%s). Using peak normalization.", exc)
        peak = float(np.max(np.abs(stereo)))
        if peak > 1e-6:
            gain = float(10 ** (-1.0 / 20.0)) / peak
            return np.clip(stereo * gain, -1.0, 1.0).astype(np.float32)
        return stereo.astype(np.float32)


def save_master(task_id: str, stereo: np.ndarray) -> Path:
    """Save normalized master stereo and mono WAV files in PCM_16 format."""
    task_dir = SETTINGS.upload_dir / task_id
    task_dir.mkdir(parents=True, exist_ok=True)

    stereo_path = task_dir / "master_44k_stereo.wav"
    mono_path = task_dir / "master_mono.wav"

    # Convert (2, N) float32 to (N, 2) for soundfile write
    stereo_t = stereo.T
    sf.write(str(stereo_path), stereo_t, SAMPLE_RATE, subtype="PCM_16")

    # Average to mono (N,)
    mono = np.mean(stereo, axis=0)
    sf.write(str(mono_path), mono, SAMPLE_RATE, subtype="PCM_16")

    return stereo_path


def compute_peaks(mono: np.ndarray, frames: int = 2000) -> List[List[float]]:
    """Compute min/max peaks for waveform visualization downsampled to `frames` points."""
    if frames <= 0:
        frames = 2000

    num_samples = len(mono)
    if num_samples == 0:
        return [[0.0, 0.0] for _ in range(frames)]

    # Vectorized bucket min/max: single reshape instead of a per-frame Python loop.
    bucket = int(math.ceil(num_samples / float(frames)))
    padded_len = bucket * frames
    if padded_len != num_samples:
        mono = np.pad(mono, (0, padded_len - num_samples), mode="edge")

    matrix = mono[:padded_len].reshape(frames, bucket)
    mins = matrix.min(axis=1)
    maxs = matrix.max(axis=1)

    return [
        [round(float(lo), 4), round(float(hi), 4)]
        for lo, hi in zip(mins, maxs)
    ]


def get_duration(audio: np.ndarray, sr: int = SAMPLE_RATE) -> float:
    """Calculate the total duration of audio in seconds."""
    if audio.ndim == 2:
        return float(audio.shape[1] / float(sr))
    return float(len(audio) / float(sr))
