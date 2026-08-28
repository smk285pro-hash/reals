from __future__ import annotations

from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Callable, Dict, List, Optional

import librosa
import numpy as np
import scipy.signal
import soundfile as sf

from app.core.audio_processor import load_any_format
from app.core.config import SAMPLE_RATE, SETTINGS

logger = logging.getLogger(__name__)


@dataclass
class StemResult:
    stem_paths: Dict[str, Path]
    mode_used: str
    warnings: List[str]


def _separate_ml(
    master_stereo: Path,
    task_id: str,
    stem_mode: str,
    progress_cb: Optional[Callable[[float], None]] = None,
) -> Optional[Dict[str, Path]]:
    """Attempt ML-based stem separation via Demucs backend (Stage 3)."""
    try:
        from app.core.ml_backends import separate_demucs
        return separate_demucs(master_stereo, task_id, stem_mode, progress_cb=progress_cb)
    except Exception as exc:
        logger.warning("ML backend unavailable (%s), falling back to spectral DSP.", exc)
        return None


def extract_stems(
    master_stereo: Path,
    task_id: str,
    stem_mode: str = "4",
    progress_cb: Optional[Callable[[float], None]] = None,
) -> StemResult:
    """Extract audio stems using Demucs ML backend when available, with full spectral DSP fallback."""
    out_dir = SETTINGS.stems_dir / task_id
    out_dir.mkdir(parents=True, exist_ok=True)

    warnings: List[str] = []
    mode_to_use = stem_mode if stem_mode in ("2", "4", "6", "8") else "4"

    # 1. Primary AI/ML Path: Demucs
    ml_result = _separate_ml(master_stereo, task_id, mode_to_use, progress_cb=progress_cb)
    if ml_result is not None:
        actual_mode = mode_to_use
        if mode_to_use == "8" and len(ml_result) < 8:
            # Snap to the nearest supported manifest mode — StemManifest.mode is a
            # Literal["2","4","6","8"]; an off-grid value (e.g. "3") would crash
            # Pydantic validation AFTER stems were already separated.
            n = len(ml_result)
            actual_mode = "6" if n >= 6 else ("4" if n >= 3 else "2")
            warnings.append("8-stem cần checkpoint bổ sung — đã trả 6 stem")

        return StemResult(
            stem_paths=ml_result,
            mode_used=actual_mode,
            warnings=warnings,
        )

    # 2. Secondary DSP Path: Pure Spectral HPSS Fallback
    if mode_to_use in ("6", "8"):
        warnings.append("Spectral fallback chỉ hỗ trợ tối đa 4 stem — cài ML backend (GĐ3) để bật 6/8")
        mode_to_use = "4"
    else:
        warnings.append("Đang chạy ở chế độ Spectral DSP Fallback (chưa nạp model ML Demucs)")

    stereo, sr = load_any_format(master_stereo)
    n_samples = stereo.shape[1]

    # STFT with n_fft=8192, hop_length=2048
    n_fft = 8192
    hop_length = 2048

    stft_left = librosa.stft(stereo[0], n_fft=n_fft, hop_length=hop_length)
    stft_right = librosa.stft(stereo[1], n_fft=n_fft, hop_length=hop_length)

    # HPSS Harmonic & Percussive separation (margin=3.0)
    h_left, p_left = librosa.decompose.hpss(stft_left, margin=3.0)
    h_right, p_right = librosa.decompose.hpss(stft_right, margin=3.0)

    # ISTFT reconstruction
    drums_left = librosa.istft(p_left, hop_length=hop_length, length=n_samples)
    drums_right = librosa.istft(p_right, hop_length=hop_length, length=n_samples)
    drums = np.stack([drums_left, drums_right], axis=0).astype(np.float32)

    harm_left = librosa.istft(h_left, hop_length=hop_length, length=n_samples)
    harm_right = librosa.istft(h_right, hop_length=hop_length, length=n_samples)
    harmonic = np.stack([harm_left, harm_right], axis=0).astype(np.float32)

    nyquist = SAMPLE_RATE / 2.0

    # Bass/Vocals split with ASYMMETRIC crossovers (LP@180Hz / BP@320Hz).
    # A single shared corner (250Hz) made both Butterworth filters pass ~-3dB
    # around the cutoff, doubling that band into bass AND vocals (mix artifact)
    # before the residual subtraction. The 180–320Hz gap now falls into "other".
    b_bass, a_bass = scipy.signal.butter(4, 180.0 / nyquist, btype="low")
    bass = scipy.signal.filtfilt(b_bass, a_bass, harmonic, axis=-1).astype(np.float32)

    # Vocals filter: 4th order Butterworth band-pass at 320Hz - 3800Hz
    b_vox, a_vox = scipy.signal.butter(4, [320.0 / nyquist, 3800.0 / nyquist], btype="band")
    vocals = scipy.signal.filtfilt(b_vox, a_vox, harmonic, axis=-1).astype(np.float32)

    stems_dict: Dict[str, np.ndarray] = {}

    if mode_to_use == "2":
        # Mode 2: Vocals + Instrumental (residual subtraction ensures perfect conservation)
        instrumental = (stereo - vocals).astype(np.float32)
        stems_dict["vocals"] = vocals
        stems_dict["instrumental"] = instrumental
    else:
        # Mode 4: Vocals, Drums, Bass, Other
        other = (stereo - (drums + bass + vocals)).astype(np.float32)
        stems_dict["vocals"] = vocals
        stems_dict["drums"] = drums
        stems_dict["bass"] = bass
        stems_dict["other"] = other

    stem_paths: Dict[str, Path] = {}
    for name, audio_data in stems_dict.items():
        stem_file = out_dir / f"{name}.wav"
        # Clip guard [-1, 1]
        clipped = np.clip(audio_data, -1.0, 1.0)
        sf.write(str(stem_file), clipped.T, SAMPLE_RATE, subtype="PCM_16")
        stem_paths[name] = stem_file

    return StemResult(stem_paths=stem_paths, mode_used=mode_to_use, warnings=warnings)
