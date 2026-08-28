"""Synthetic Audio Generators Package."""
from tests.generators.synthetic_audio import (
    generate_sine_wave,
    generate_triad_audio,
    generate_rhythm_clicks,
    generate_synthetic_wav,
    generate_pure_silence,
    generate_white_noise,
    generate_noisy_progression,
    generate_meter_audio,
    NOTE_FREQS,
    TRIADS
)

__all__ = [
    "generate_sine_wave",
    "generate_triad_audio",
    "generate_rhythm_clicks",
    "generate_synthetic_wav",
    "generate_pure_silence",
    "generate_white_noise",
    "generate_noisy_progression",
    "generate_meter_audio",
    "NOTE_FREQS",
    "TRIADS",
]
