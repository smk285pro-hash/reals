from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List

import librosa
import numpy as np
import soundfile as sf

from app.core.config import SAMPLE_RATE


@dataclass
class BassNote:
    start: float
    end: float
    midi: int
    confidence: float


def extract_bassline(bass_path: Path) -> List[BassNote]:
    """Extract segmented bass notes with fundamental pitch (f0) using probabilistic YIN (pYIN)."""
    if not bass_path.exists():
        return []

    audio, sr = sf.read(str(bass_path), dtype="float32")
    if audio.ndim > 1:
        audio = np.mean(audio, axis=-1)

    if len(audio) == 0:
        return []

    frame_length = 2048
    hop_length = 512

    # pYIN fundamental pitch estimation for low register (40Hz to 300Hz)
    f0, voiced_flag, voiced_probs = librosa.pyin(
        audio,
        fmin=40,
        fmax=300,
        sr=SAMPLE_RATE,
        frame_length=frame_length,
        hop_length=hop_length,
    )

    times = librosa.times_like(f0, sr=SAMPLE_RATE, hop_length=hop_length)
    n_frames = len(f0)

    notes: List[BassNote] = []
    current_midi: int | None = None
    note_start: float = 0.0
    note_probs: List[float] = []

    for i in range(n_frames):
        is_voiced = bool(voiced_flag[i]) and (not np.isnan(f0[i])) and (f0[i] > 0.0)
        prob = float(voiced_probs[i]) if (not np.isnan(voiced_probs[i])) else 0.0

        if is_voiced:
            midi_pitch = int(round(float(librosa.hz_to_midi(f0[i]))))
            if current_midi is None:
                current_midi = midi_pitch
                note_start = float(times[i])
                note_probs = [prob]
            elif midi_pitch == current_midi:
                note_probs.append(prob)
            else:
                # Pitch transition: finalize previous note
                note_end = float(times[i])
                if (note_end - note_start) >= 0.08:  # Min 80ms duration
                    avg_conf = float(np.mean(note_probs)) if note_probs else 0.0
                    notes.append(
                        BassNote(
                            start=round(note_start, 4),
                            end=round(note_end, 4),
                            midi=current_midi,
                            confidence=round(avg_conf, 3),
                        )
                    )
                current_midi = midi_pitch
                note_start = float(times[i])
                note_probs = [prob]
        else:
            # Unvoiced / Silence: finalize active note if any
            if current_midi is not None:
                note_end = float(times[i])
                if (note_end - note_start) >= 0.08:
                    avg_conf = float(np.mean(note_probs)) if note_probs else 0.0
                    notes.append(
                        BassNote(
                            start=round(note_start, 4),
                            end=round(note_end, 4),
                            midi=current_midi,
                            confidence=round(avg_conf, 3),
                        )
                    )
                current_midi = None
                note_probs = []

    # Finalize trailing note
    if current_midi is not None and len(times) > 0:
        note_end = float(times[-1]) + (hop_length / SAMPLE_RATE)
        if (note_end - note_start) >= 0.08:
            avg_conf = float(np.mean(note_probs)) if note_probs else 0.0
            notes.append(
                BassNote(
                    start=round(note_start, 4),
                    end=round(note_end, 4),
                    midi=current_midi,
                    confidence=round(avg_conf, 3),
                )
            )

    return notes
