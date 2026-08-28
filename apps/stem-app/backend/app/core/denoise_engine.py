from __future__ import annotations

"""Noise-reduction pipeline ("lọc nhiễu").

Primary engine: **DeepFilterNet** — the current state of the art in deep-learning
audio denoising (ERB-domain masking + deep filtering, 48 kHz, with harmonics
post-filter for natural reconstruction).

Fallback engine: a pure NumPy spectral noise gate, used automatically when the
DeepFilterNet model is not available (e.g. lightweight local dev). The job
result always reports which engine ran via ``engine``.

Audio contract: the upload is decoded as-is (no loudness normalisation). The
model works internally at 48 kHz, but the returned WAV is written back at the
original sample rate of the user's file.
"""

import logging
from pathlib import Path
from typing import Any, Callable, Dict, Optional

import numpy as np
import soundfile as sf

from app.core.audio_processor import load_any_format, resample
from app.core.config import SETTINGS

logger = logging.getLogger(__name__)

DF_SAMPLE_RATE = 48000

ProgressCb = Optional[Callable[[float, str], None]]


def _strength_to_atten_lim_db(strength: float) -> float:
    """Map a user-friendly 0-100 strength to DeepFilterNet's attenuation limit.

    0%   -> 6 dB   (light, most natural)
    100% -> 100 dB (maximum suppression)
    """
    s = max(0.0, min(100.0, float(strength)))
    return 6.0 + (s / 100.0) * 94.0


def _import_deepfilternet() -> Any:
    """Import DeepFilterNet, shimming ``torchaudio.backend`` on torchaudio >= 2.9.

    deepfilternet 0.5.x imports ``torchaudio.backend.common.AudioMetaData``,
    which was removed in torchaudio 2.9. The symbol is only used for type
    annotations, so a lightweight stand-in keeps the library fully functional.
    """
    import sys
    import types
    from typing import NamedTuple

    try:
        import torchaudio  # type: ignore[import-not-found]

        if not hasattr(torchaudio, "backend") and "torchaudio.backend" not in sys.modules:
            class AudioMetaData(NamedTuple):  # noqa: D101 - compatibility shim
                sample_rate: int = -1
                num_frames: int = -1
                num_channels: int = -1
                bits_per_sample: int = 0
                encoding: str = ""

            backend_pkg = types.ModuleType("torchaudio.backend")
            common_mod = types.ModuleType("torchaudio.backend.common")
            common_mod.AudioMetaData = AudioMetaData  # type: ignore[attr-defined]
            backend_pkg.common = common_mod  # type: ignore[attr-defined]
            sys.modules["torchaudio.backend"] = backend_pkg
            sys.modules["torchaudio.backend.common"] = common_mod
            torchaudio.backend = backend_pkg  # type: ignore[attr-defined]
    except ImportError:
        pass

    from df.enhance import enhance, init_df  # type: ignore[import-not-found]

    return enhance, init_df


def _denoise_deepfilternet(mono_in: np.ndarray, sr_in: int, strength: float) -> np.ndarray:
    """Run DeepFilterNet enhancement on mono audio; returns mono audio at sr_in."""
    import torch  # type: ignore[import-not-found]

    enhance, init_df = _import_deepfilternet()

    try:
        model, df_state, _ = init_df(post_filter=True)
    except TypeError:
        # Older deepfilternet releases do not accept post_filter
        model, df_state, _ = init_df()

    audio_48k = resample(mono_in[np.newaxis, :], sr_in, DF_SAMPLE_RATE)[0]

    # df.enhance() requires a torch Tensor of shape [C, T] on the model's device
    device = next(model.parameters()).device
    audio_tensor = torch.from_numpy(
        np.ascontiguousarray(audio_48k[np.newaxis, :], dtype=np.float32)
    ).to(device)

    atten_lim = _strength_to_atten_lim_db(strength)
    try:
        enhanced = enhance(model, df_state, audio_tensor, atten_lim_db=atten_lim)
    except TypeError:
        enhanced = enhance(model, df_state, audio_tensor)

    enhanced_np = enhanced.detach().cpu().numpy().astype(np.float32)
    if enhanced_np.ndim > 1:
        enhanced_np = enhanced_np[0]
    return resample(enhanced_np[np.newaxis, :], DF_SAMPLE_RATE, sr_in)[0]


def _spectral_gate_channel(channel: np.ndarray, sr: int, reduction_db: float) -> np.ndarray:
    """Classical spectral-subtraction noise gate for one channel.

    The noise floor is estimated from the quietest 10% of STFT frames, then a
    smoothed spectral mask with a musical-noise floor is applied.
    """
    n_fft = 2048
    hop = n_fft // 4
    window = np.hanning(n_fft).astype(np.float32)

    # STFT via librosa for consistency with the rest of the codebase
    import librosa

    stft = librosa.stft(channel, n_fft=n_fft, hop_length=hop, window=window)
    mag = np.abs(stft)
    phase = np.exp(1j * np.angle(stft))

    frame_energy = np.sum(mag ** 2, axis=0)
    n_quiet = max(1, int(len(frame_energy) * 0.10))
    quiet_idx = np.argsort(frame_energy)[:n_quiet]
    noise_profile = np.mean(mag[:, quiet_idx], axis=1, keepdims=True)

    gain_reduction = 10.0 ** (-reduction_db / 20.0)
    floor = 0.02  # keep 2% of the noise to avoid musical-noise artefacts

    mask = 1.0 - np.minimum(noise_profile / (mag + 1e-10), 1.0) * (1.0 - floor)
    # Temporal smoothing of the mask (attack/release feel)
    kernel = np.array([0.25, 0.5, 0.25], dtype=np.float32)
    for k in range(mask.shape[0]):
        mask[k, :] = np.convolve(mask[k, :], kernel, mode="same")

    # Additional broadband gate on frames close to the noise floor
    quiet_gate = frame_energy < (np.median(frame_energy) * 0.5)
    mask[:, quiet_gate] *= max(gain_reduction, floor)

    cleaned = librosa.istft(mag * mask * phase, hop_length=hop, window=window, length=len(channel))
    return cleaned.astype(np.float32)


def _denoise_spectral(stereo: np.ndarray, sr: int, strength: float) -> np.ndarray:
    """Apply the spectral noise gate per channel; returns stereo (2, N)."""
    reduction_db = 6.0 + (max(0.0, min(100.0, strength)) / 100.0) * 30.0
    out = np.empty_like(stereo)
    for ch in range(stereo.shape[0]):
        out[ch] = _spectral_gate_channel(stereo[ch], sr, reduction_db)
    return out


def run_denoise(
    task_id: str,
    input_path: Path,
    strength: float = 80.0,
    progress_cb: ProgressCb = None,
) -> Dict[str, Any]:
    """Denoise an audio file and write the cleaned WAV to the export storage.

    Returns a result payload with the download URL, engine used and warnings.
    """

    def _report(pct: float, stage: str) -> None:
        if progress_cb is not None:
            progress_cb(pct, stage)

    warnings: list[str] = []

    _report(10, "Giải mã audio đầu vào")
    stereo, sr_in = load_any_format(input_path)
    n_samples = stereo.shape[1]
    duration = float(n_samples / float(sr_in))

    engine = "deepfilternet"
    _report(25, "Khởi nạp model DeepFilterNet (SOTA)")
    try:
        mono = np.mean(stereo, axis=0)
        enhanced_mono = _denoise_deepfilternet(mono, sr_in, strength)

        # The resample round-trip (sr_in -> 48kHz -> sr_in) can drift the output
        # length by a sample or two on longer files; align before computing the
        # per-sample suppression ratio.
        if enhanced_mono.shape[0] > mono.shape[0]:
            enhanced_mono = enhanced_mono[: mono.shape[0]]
        elif enhanced_mono.shape[0] < mono.shape[0]:
            enhanced_mono = np.pad(
                enhanced_mono,
                (0, mono.shape[0] - enhanced_mono.shape[0]),
                mode="constant",
            )

        # DeepFilterNet is a mono speech/enhancement model: rebuild stereo by
        # applying the mono suppression ratio to both original channels so the
        # stereo image of the user's file is preserved.
        eps = 1e-8
        ratio = enhanced_mono / (mono + eps)
        ratio = np.clip(ratio, 0.0, 1.5)
        cleaned = np.clip(stereo * ratio[np.newaxis, :], -1.0, 1.0).astype(np.float32)
    except Exception as exc:
        engine = "spectral-fallback"
        logger.exception("DeepFilterNet unavailable (%s); using spectral fallback.", exc)
        warnings.append("Model DeepFilterNet không khả dụng — đã dùng bộ lọc spectral dự phòng")
        _report(35, "Đang lọc nhiễu (spectral fallback)")
        cleaned = _denoise_spectral(stereo, sr_in, strength)

    _report(85, "Ghi tệp WAV đã lọc nhiễu")
    # Length guard: resampling round-trips can drift by a few samples
    if cleaned.shape[1] > n_samples:
        cleaned = cleaned[:, :n_samples]
    elif cleaned.shape[1] < n_samples:
        pad = n_samples - cleaned.shape[1]
        cleaned = np.pad(cleaned, ((0, 0), (0, pad)), mode="constant")

    out_dir = SETTINGS.export_dir / task_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "denoised.wav"
    sf.write(str(out_path), cleaned.T, sr_in, subtype="PCM_16")

    _report(100, "Hoàn tất lọc nhiễu")
    return {
        "task_id": task_id,
        "denoise_url": f"/api/denoised/{task_id}",
        "engine": engine,
        "strength": int(max(0.0, min(100.0, strength))),
        "sample_rate": int(sr_in),
        "channels": int(stereo.shape[0]),
        "duration": round(duration, 3),
        "warnings": warnings,
    }
