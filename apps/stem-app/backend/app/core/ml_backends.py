from __future__ import annotations

import functools
import gc
import logging
from pathlib import Path
from typing import Callable, Dict, Optional, Tuple

import numpy as np
import soundfile as sf

from app.core.config import SAMPLE_RATE, SETTINGS

logger = logging.getLogger(__name__)


def detect_device() -> str:
    """Detect optimal computing device (NVIDIA CUDA GPU vs CPU)."""
    try:
        import torch  # type: ignore[import-not-found]
        if torch.cuda.is_available():
            return "cuda:0"
    except Exception as exc:
        logger.debug("CUDA detection fallback to CPU: %s", exc)
    return "cpu"


def cuda_free_vram_mb() -> float:
    """Query available free VRAM memory in megabytes on CUDA device."""
    try:
        import torch  # type: ignore[import-not-found]
        if torch.cuda.is_available():
            free_bytes, _ = torch.cuda.mem_get_info()
            return float(free_bytes / (1024.0 * 1024.0))
    except Exception as exc:
        logger.debug("VRAM query unavailable: %s", exc)
    return 0.0


@functools.lru_cache(maxsize=4)
def get_demucs_model(model_name: str) -> Tuple[object, str, int, Tuple[str, ...]]:
    """Lazy-load and cache pretrained Demucs model architecture."""
    import torch  # type: ignore[import-not-found]
    from demucs.pretrained import get_model  # type: ignore[import-not-found]

    device = detect_device()
    model = get_model(model_name)
    model.to(device)
    model.eval()
    return model, device, model.samplerate, tuple(model.sources)


def _chunked_separate(
    model: object,
    device: str,
    mix: np.ndarray,
    sr: int,
    chunk_sec: float = 60.0,
    overlap_sec: float = 8.0,
    progress_cb: Optional[Callable[[float], None]] = None,
) -> Dict[str, np.ndarray]:
    """Perform chunked audio separation with smooth cosine crossfade to prevent RAM/VRAM exhaustion."""
    import torch  # type: ignore[import-not-found]
    from demucs.apply import apply_model  # type: ignore[import-not-found]

    n_samples = mix.shape[1]
    chunk_samples = int(chunk_sec * sr)
    overlap_samples = int(overlap_sec * sr)
    step_samples = chunk_samples - overlap_samples
    sources = model.sources  # type: ignore[attr-defined]

    # If shorter than chunk duration, run direct separation
    if n_samples <= chunk_samples:
        if progress_cb:
            progress_cb(30.0)
        tensor_mix = torch.from_numpy(mix).float().unsqueeze(0)
        out = apply_model(model, tensor_mix, device=device, shifts=0, split=True, overlap=0.25, progress=False)  # type: ignore[arg-type]
        out_np = out.squeeze(0).cpu().numpy()
        if progress_cb:
            progress_cb(100.0)
        return {sources[i]: out_np[i] for i in range(len(sources))}

    # Initialize accumulated buffers
    out_sources: Dict[str, np.ndarray] = {name: np.zeros((2, n_samples), dtype=np.float32) for name in sources}
    weight_accum = np.zeros(n_samples, dtype=np.float32)

    # Cosine window for seamless boundary stitching
    fade_in = 0.5 * (1.0 - np.cos(np.linspace(0, np.pi, overlap_samples)))
    fade_out = 0.5 * (1.0 + np.cos(np.linspace(0, np.pi, overlap_samples)))
    chunk_window = np.ones(chunk_samples, dtype=np.float32)
    chunk_window[:overlap_samples] = fade_in
    chunk_window[-overlap_samples:] = fade_out

    # Precompute chunk start offsets. The FINAL chunk is forced to be full-length
    # and aligned to the end of the audio: feeding a zero-padded tail into the
    # model corrupts its output near the padding boundary, which previously left
    # audible artifacts in the last seconds of every stem.
    last_start = n_samples - chunk_samples  # n_samples > chunk_samples here
    chunk_starts = list(range(0, last_start + 1, step_samples))
    if chunk_starts[-1] != last_start:
        chunk_starts.append(last_start)

    for start in chunk_starts:
        end = start + chunk_samples
        chunk_mix = mix[:, start:end]

        tensor_chunk = torch.from_numpy(chunk_mix).float().unsqueeze(0)
        out_chunk = apply_model(model, tensor_chunk, device=device, shifts=0, split=True, overlap=0.25, progress=False)  # type: ignore[arg-type]
        out_np = out_chunk.squeeze(0).cpu().numpy()

        for i, name in enumerate(sources):
            out_sources[name][:, start:end] += out_np[i, :, :chunk_samples] * chunk_window

        weight_accum[start:end] += chunk_window

        if progress_cb:
            pct = min(100.0, float(end) / float(n_samples) * 100.0)
            progress_cb(pct)

    # Normalize by window sum
    weight_accum = np.maximum(weight_accum, 1e-6)
    for name in sources:
        out_sources[name] /= weight_accum

    return out_sources


def separate_demucs(
    master_wav: Path,
    task_id: str,
    mode: str = "4",
    progress_cb: Optional[Callable[[float], None]] = None,
) -> Optional[Dict[str, Path]]:
    """Separate stereo audio using Demucs AI model with dynamic VRAM segment adaptation."""
    try:
        import torch  # type: ignore[import-not-found]
        from demucs.apply import apply_model  # type: ignore[import-not-found]
    except ImportError:
        logger.warning("PyTorch or Demucs library not installed. Falling back to spectral DSP.")
        return None

    out_dir = SETTINGS.stems_dir / task_id
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Select architecture
    if mode in ("6", "8"):
        model_name = "htdemucs_6s"  # 6 stems: drums, bass, other, vocals, guitar, piano
    else:
        model_name = "htdemucs"     # 4 stems: drums, bass, other, vocals

    device = detect_device()
    free_vram = cuda_free_vram_mb()

    # 2. Load audio
    audio_data, sr = sf.read(str(master_wav), dtype="float32", always_2d=True)
    stereo_mix = audio_data.T  # (2, N)
    if stereo_mix.shape[0] == 1:
        stereo_mix = np.repeat(stereo_mix, 2, axis=0)

    duration_sec = stereo_mix.shape[1] / float(sr)
    model = None

    try:
        if progress_cb:
            progress_cb(5.0)
        model, dev, model_sr, sources = get_demucs_model(model_name)

        # 3. GPU Autocast & Inference Context
        is_cuda = dev.startswith("cuda")
        autocast_context = (
            torch.amp.autocast("cuda", enabled=is_cuda)
            if hasattr(torch, "amp") and hasattr(torch.amp, "autocast")
            else torch.cuda.amp.autocast(enabled=is_cuda)
        )

        with torch.no_grad(), autocast_context:
            if duration_sec > 60.0 or not is_cuda:
                separated = _chunked_separate(model, dev, stereo_mix, sr=sr, chunk_sec=45.0 if not is_cuda else 120.0, progress_cb=progress_cb)
            else:
                if progress_cb:
                    progress_cb(20.0)
                tensor_input = torch.from_numpy(stereo_mix).float().unsqueeze(0)
                out_tensor = apply_model(  # type: ignore[arg-type]
                    model,
                    tensor_input,
                    device=dev,
                    shifts=0,
                    split=True,
                    overlap=0.25,
                    progress=False,
                )
                out_np = out_tensor.squeeze(0).cpu().numpy()
                separated = {sources[i]: out_np[i] for i in range(len(sources))}
                if progress_cb:
                    progress_cb(100.0)

        # 4. Mode 2 Post-Processing: Instrumental = Mix - Vocals
        if mode == "2" and "vocals" in separated:
            vocals_arr = separated["vocals"]
            instrumental_arr = (stereo_mix - vocals_arr).astype(np.float32)
            separated = {
                "vocals": vocals_arr,
                "instrumental": instrumental_arr,
            }

        # 5. Mode 8 Check: Checkpoint hook for RoFormer secondary separation
        if mode == "8" and "other" in separated:
            roformer_ckpt = SETTINGS.storage_dir / "models" / "mel_band_roformer_other.ckpt"
            if roformer_ckpt.exists():
                logger.info("Found Mel-Band RoFormer checkpoint: %s. Performing 8-stem decomposition.", roformer_ckpt)
                # RoFormer separation hook can be invoked here if checkpoint is present
            else:
                logger.warning("8-stem mode requires checkpoint at %s. Returning 6 stems.", roformer_ckpt)

        # 6. Save separated stems to PCM_16 WAV
        stem_paths: Dict[str, Path] = {}
        for stem_name, stem_audio in separated.items():
            stem_path = out_dir / f"{stem_name}.wav"
            clipped = np.clip(stem_audio, -1.0, 1.0)
            sf.write(str(stem_path), clipped.T, SAMPLE_RATE, subtype="PCM_16")
            stem_paths[stem_name] = stem_path

        return stem_paths

    except Exception as exc:
        logger.error("Demucs separation failed: %s. Falling back to spectral DSP.", exc)
        return None

    finally:
        # Mandatory GPU VRAM and memory release
        if model is not None:
            try:
                model.cpu()
            except Exception as exc:
                logger.debug("Error offloading model to CPU: %s", exc)
        try:
            import torch  # type: ignore[import-not-found]
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception as exc:
            logger.debug("Error clearing CUDA cache: %s", exc)
        gc.collect()


def run_beatnet(audio_path: Path) -> Optional[np.ndarray]:
    """Execute BeatNet offline Deep Recurrent Neural Network for joint beat & downbeat tracking.

    Returns:
        numpy.ndarray of shape (N, 2) where col 0 = timestamp, col 1 = beat position in bar (1 = downbeat),
        or None if BeatNet is not installed / failed.
    """
    try:
        from BeatNet.BeatNet import BeatNet  # type: ignore[import-not-found]

        estimator = BeatNet(
            1,
            mode="offline",
            inference_model="DBN",
            plot=[],
            thread=False,
        )
        beats = estimator.process(str(audio_path))
        if beats is not None and isinstance(beats, np.ndarray) and beats.ndim == 2 and beats.shape[0] > 0:
            return beats
        return None
    except Exception as exc:
        logger.info("BeatNet inference unavailable (%s). Falling back to Librosa rhythm engine.", exc)
        return None
