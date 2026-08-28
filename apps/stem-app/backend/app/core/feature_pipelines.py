from __future__ import annotations

"""Standalone feature pipelines shared by the local FastAPI backend and Modal.

Each public function powers one independent feature so users/developers can run
only what they need instead of the full deep-analysis combo:

- ``analyze_telemetry_raw``: fast BPM/key/scale detection on the raw upload.
- ``run_chords_analysis``: Viterbi HMM chord progression decoding from the mix.
- ``run_stems_only``: AI/spectral stem separation only.

``prepare_working_audio`` decodes an arbitrary upload for analysis WITHOUT any
loudness optimisation (no EBU R128 normalisation) — audio is processed as-is;
resampling to the internal 44.1 kHz rate only happens because the DSP engines
are tuned for it.
"""

import math
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import librosa
import numpy as np
import soundfile as sf

from app.core.audio_processor import get_duration, load_any_format, resample
from app.core.chord_viterbi import decode_chords
from app.core.config import SAMPLE_RATE, SETTINGS
from app.core.harmony_engine import extract_harmony
from app.core.key_detector import detect_key
from app.core.rhythm_engine import analyze_rhythm
from app.core.schemas import STEM_COLORS
from app.core.stem_extractor import extract_stems

ProgressCb = Optional[Callable[[float, str], None]]


def _estimate_bpm_robust(mono: np.ndarray, sr: int) -> float:
    """Autocorrelation-based tempo estimation with octave correction (40-240 BPM)."""
    hop_length = 512
    onset_env = librosa.onset.onset_strength(
        y=mono, sr=sr, hop_length=hop_length, n_mels=128,
    )

    ac = librosa.autocorrelate(onset_env, max_size=len(onset_env) // 2)
    min_lag = int((60.0 / 240.0) * sr / hop_length)
    max_lag = int((60.0 / 40.0) * sr / hop_length)

    if min_lag < max_lag and max_lag < len(ac):
        ac_slice = ac[min_lag:max_lag]
        best_lag = min_lag + int(np.argmax(ac_slice))
        bpm_val = 60.0 / (best_lag * hop_length / sr)

        if bpm_val <= 0 or np.isnan(bpm_val):
            bpm_val = 120.0
        else:
            candidates = [bpm_val, bpm_val / 2, bpm_val * 2, bpm_val / 1.5, bpm_val * 1.5]
            best_tempo = bpm_val
            best_energy = 0.0
            for cand in candidates:
                if cand < 40 or cand > 240:
                    continue
                cand_lag = int((60.0 / cand) * sr / hop_length)
                if min_lag <= cand_lag < max_lag:
                    energy = float(ac[cand_lag])
                    if energy > best_energy:
                        best_energy = energy
                        best_tempo = cand
            bpm_val = float(best_tempo)
    else:
        tempo_result, _ = librosa.beat.beat_track(y=mono, sr=sr)
        bpm_val = float(np.atleast_1d(tempo_result)[0])

    if bpm_val <= 0 or np.isnan(bpm_val) or bpm_val > 300:
        bpm_val = 120.0
    return bpm_val


def analyze_telemetry_raw(audio_path: Path) -> Dict[str, Any]:
    """Fast BPM/key/scale/duration detection on the original upload, processed as-is.

    No resampling and no loudness normalisation: librosa operates directly at the
    file's native sample rate.
    """
    stereo, sr = load_any_format(audio_path)
    mono = np.mean(stereo, axis=0)

    bpm_val = _estimate_bpm_robust(mono, sr)

    chroma = librosa.feature.chroma_cqt(y=mono, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)
    master_key, scale_mode, _ = detect_key(chroma_mean)

    return {
        "bpm": round(bpm_val, 1),
        "master_key": master_key,
        "scale_mode": scale_mode,
        "duration": round(get_duration(stereo, sr), 2),
        "sample_rate": int(sr),
        "channels": int(stereo.shape[0]),
    }


def prepare_working_audio(task_id: str, original_path: Path) -> Tuple[Path, Path]:
    """Decode any upload into 44.1 kHz working WAVs WITHOUT loudness optimisation.

    The DSP engines are tuned for 44.1 kHz, so audio is resampled when needed —
    but no EBU R128 normalisation or peak processing is applied. The audio the
    user sent is the audio being analysed.
    """
    stereo_raw, sr_in = load_any_format(original_path)
    stereo = resample(stereo_raw, sr_in, SAMPLE_RATE)

    task_dir = SETTINGS.upload_dir / task_id
    task_dir.mkdir(parents=True, exist_ok=True)

    stereo_path = task_dir / "master_44k_stereo.wav"
    mono_path = task_dir / "master_mono.wav"

    sf.write(str(stereo_path), stereo.T, SAMPLE_RATE, subtype="PCM_16")
    mono = np.mean(stereo, axis=0)
    sf.write(str(mono_path), mono, SAMPLE_RATE, subtype="PCM_16")

    return stereo_path, mono_path


def run_chords_analysis(
    stereo_path: Path,
    mono_path: Path,
    progress_cb: ProgressCb = None,
) -> Dict[str, Any]:
    """Chord-progression-only pipeline: rhythm tracking + harmony chroma + Viterbi decode.

    Works directly on the stereo/mono mix (no stem separation required), making it
    much faster than the full deep pipeline.
    """

    def _report(pct: float, stage: str) -> None:
        if progress_cb is not None:
            progress_cb(pct, stage)

    _report(10, "Dò nhịp & downbeat trên mix")
    rhythm_res = analyze_rhythm(mono_path, mono_path)

    _report(40, "Trích xuất chroma hòa âm")
    beats_arr = np.array([bp.timestamp for bp in rhythm_res.beats], dtype=np.float64)
    harmony_features = extract_harmony(
        mono_path,
        mono_path,
        beats_arr,
        rhythm_res.bpm,
        bass_path=None,
    )

    _report(75, "Giải mã hợp âm Viterbi HMM")
    mono_data, _ = sf.read(str(mono_path), dtype="float32")
    duration = get_duration(mono_data, SAMPLE_RATE)
    decode_res = decode_chords(harmony_features, [], duration)

    _report(95, "Hoàn tất kết quả hợp âm")
    return {
        "telemetry": {
            "bpm": rhythm_res.bpm,
            "master_key": decode_res.master_key,
            "scale_mode": decode_res.scale_mode,
            "time_signature": rhythm_res.time_signature,
            "duration": round(duration, 3),
        },
        "beats": [bp.model_dump() for bp in rhythm_res.beats],
        "chords": [c.model_dump() for c in decode_res.chords],
        "warnings": list(rhythm_res.warnings),
    }


def run_stems_only(
    stereo_path: Path,
    task_id: str,
    stem_mode: str = "4",
    progress_cb: Optional[Callable[[float], None]] = None,
) -> Dict[str, Any]:
    """Stem-separation-only pipeline: Demucs ML (or spectral fallback), nothing else."""
    stem_res = extract_stems(
        stereo_path,
        task_id,
        stem_mode,
        progress_cb=progress_cb,
    )

    stems_dict: Dict[str, Any] = {}
    for name in stem_res.stem_paths:
        stems_dict[name] = {
            "url": f"/api/stems/{task_id}/{name}",
            "color": STEM_COLORS.get(name, "#94a3b8"),
            "default_gain_db": 0.0,
        }

    return {
        "stems": {
            "mode": stem_res.mode_used,
            "stems": stems_dict,
        },
        "warnings": list(stem_res.warnings),
    }


def build_stems_zip(task_id: str) -> "Tuple[bytes, List[str]]":
    """Collect separated stem WAVs into an in-memory ZIP archive for one-shot download."""
    import io
    import zipfile

    stems_dir = SETTINGS.stems_dir / task_id
    wav_files = sorted(stems_dir.glob("*.wav")) if stems_dir.exists() else []
    if not wav_files:
        raise FileNotFoundError(f"No stem files found for task {task_id}")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for wf in wav_files:
            zip_file.write(wf, arcname=wf.name)
    return buffer.getvalue(), [wf.name for wf in wav_files]


def clamp_pct(value: float) -> int:
    """Clamp a progress percentage into the 0-100 integer range."""
    if math.isnan(value):
        return 0
    return max(0, min(100, int(value)))
