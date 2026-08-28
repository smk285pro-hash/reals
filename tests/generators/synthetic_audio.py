"""
Synthetic Audio Wave Generator for Deterministic MIR Ground-Truth Verification.
Generates mathematically precise sine tones, harmonic triad chords, rhythmic beat clicks,
and encoded 16-bit PCM WAV byte streams.
"""
import io
import math
from typing import Dict, List, Optional
import numpy as np
import scipy.io.wavfile as wavfile

# Standard Pitch Class Mapping (0 = C, 1 = C#/Db, ..., 11 = B)
PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_TO_SHARP = {
    "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#",
    "Dbm": "C#m", "Ebm": "D#m", "Gbm": "F#m", "Abm": "G#m", "Bbm": "A#m"
}

def midi_to_hz(midi_note: int) -> float:
    """Calculates frequency in Hz for a MIDI note number using A440 tuning."""
    return 440.0 * (2.0 ** ((midi_note - 69) / 12.0))

# Precompute note frequencies for standard octaves 2 through 6
NOTE_FREQS: Dict[str, float] = {}
for octave in range(2, 7):
    for i, name in enumerate(PITCH_NAMES):
        midi_val = 12 * (octave + 1) + i
        note_name = f"{name}{octave}"
        NOTE_FREQS[note_name] = midi_to_hz(midi_val)

def _build_triad_frequencies() -> Dict[str, List[float]]:
    """Builds frequency lists for all 12 Major and 12 Minor Triads (octave 4 base)."""
    triads: Dict[str, List[float]] = {}
    
    # 12 Major Chords (Root + 4 st + 7 st)
    for i, root in enumerate(PITCH_NAMES):
        base_midi = 60 + i  # C4 is 60
        f_root = midi_to_hz(base_midi)
        f_third = midi_to_hz(base_midi + 4)
        f_fifth = midi_to_hz(base_midi + 7)
        triads[root] = [f_root, f_third, f_fifth]
        
    # 12 Minor Chords (Root + 3 st + 7 st)
    for i, root in enumerate(PITCH_NAMES):
        base_midi = 60 + i
        f_root = midi_to_hz(base_midi)
        f_third = midi_to_hz(base_midi + 3)
        f_fifth = midi_to_hz(base_midi + 7)
        triads[f"{root}m"] = [f_root, f_third, f_fifth]

    # Add flat aliases
    for flat, sharp in FLAT_TO_SHARP.items():
        if sharp in triads:
            triads[flat] = triads[sharp]
            
    return triads

TRIADS: Dict[str, List[float]] = _build_triad_frequencies()


def generate_sine_wave(freq: float, duration: float, sr: int = 44100, amp: float = 0.5) -> np.ndarray:
    """
    Generates a pure continuous sinusoidal waveform.
    
    Args:
        freq: Frequency in Hertz.
        duration: Duration in seconds.
        sr: Sample rate in Hz (default 44100).
        amp: Peak amplitude (default 0.5).
        
    Returns:
        1D float32 numpy array.
    """
    num_samples = int(round(duration * sr))
    t = np.linspace(0, duration, num_samples, endpoint=False, dtype=np.float32)
    return (amp * np.sin(2.0 * np.pi * freq * t)).astype(np.float32)


def generate_triad_audio(chord_name: str, duration: float, sr: int = 44100) -> np.ndarray:
    """
    Synthesizes a rich harmonic triad chord (Root + Third + Fifth) with overtones.
    
    Args:
        chord_name: Standard chord name, e.g. "C", "Am", "G#m", "F".
        duration: Duration in seconds.
        sr: Sample rate in Hz.
        
    Returns:
        1D float32 numpy array.
    """
    normalized_name = FLAT_TO_SHARP.get(chord_name, chord_name)
    freqs = TRIADS.get(normalized_name, [440.0, 554.37, 659.25])
    
    num_samples = int(round(duration * sr))
    t = np.linspace(0, duration, num_samples, endpoint=False, dtype=np.float32)
    signal = np.zeros(num_samples, dtype=np.float32)
    
    # Envelope: gentle attack and release to avoid sharp boundary clicks
    env = np.ones(num_samples, dtype=np.float32)
    fade_samples = min(int(0.02 * sr), num_samples // 4)
    if fade_samples > 0:
        env[:fade_samples] = np.linspace(0, 1, fade_samples)
        env[-fade_samples:] = np.linspace(1, 0, fade_samples)
    
    for f in freqs:
        # Fundamental tone
        component = 0.25 * np.sin(2.0 * np.pi * f * t)
        # 1st Harmonic overtone (2 * f)
        component += 0.08 * np.sin(2.0 * np.pi * (2.0 * f) * t)
        # Sub-harmonic (f / 2) for rich root warmth
        component += 0.05 * np.sin(2.0 * np.pi * (0.5 * f) * t)
        signal += component
        
    signal = signal * env
    return signal.astype(np.float32)


def generate_rhythm_clicks(
    bpm: float,
    duration: float,
    sr: int = 44100,
    accent_first: bool = False,
    beats_per_bar: int = 4
) -> np.ndarray:
    """
    Generates high-precision percussive transient impulse clicks at exact BPM intervals.
    
    Args:
        bpm: Tempo in beats per minute.
        duration: Total audio duration in seconds.
        sr: Sample rate in Hz.
        accent_first: Whether to accent the first beat of each bar.
        beats_per_bar: Number of beats in each bar (e.g. 4 for 4/4, 3 for 3/4).
        
    Returns:
        1D float32 numpy array.
    """
    total_samples = int(round(duration * sr))
    signal = np.zeros(total_samples, dtype=np.float32)
    beat_interval = 60.0 / bpm
    
    click_duration = 0.025  # 25ms click
    click_samples = int(round(click_duration * sr))
    click_t = np.linspace(0, click_duration, click_samples, endpoint=False, dtype=np.float32)
    
    # Base click: 1200Hz tone with exponential decay
    base_click = 0.7 * np.sin(2.0 * np.pi * 1200.0 * click_t) * np.exp(-click_t * 150.0)
    # Accent click: 1800Hz louder tone with sharp decay
    accent_click = 1.0 * np.sin(2.0 * np.pi * 1800.0 * click_t) * np.exp(-click_t * 120.0)
    
    beat_idx = 0
    cur_time = 0.0
    while cur_time < duration:
        start_sample = int(round(cur_time * sr))
        if start_sample >= total_samples:
            break
        end_sample = min(start_sample + click_samples, total_samples)
        segment_len = end_sample - start_sample
        
        is_accent = accent_first and (beat_idx % beats_per_bar == 0)
        click_to_use = accent_click[:segment_len] if is_accent else base_click[:segment_len]
        signal[start_sample:end_sample] += click_to_use
        
        cur_time += beat_interval
        beat_idx += 1
        
    return signal.astype(np.float32)


def _encode_wav_bytes(audio_signal: np.ndarray, sr: int = 44100) -> bytes:
    """Encodes a float32 audio signal into 16-bit PCM WAV byte stream."""
    max_val = np.max(np.abs(audio_signal))
    if max_val > 1e-6:
        normalized = (audio_signal / max_val) * 0.95
    else:
        normalized = audio_signal
        
    int16_audio = (normalized * 32767.0).clip(-32768, 32767).astype(np.int16)
    
    buffer = io.BytesIO()
    wavfile.write(buffer, sr, int16_audio)
    buffer.seek(0)
    return buffer.getvalue()


def generate_synthetic_wav(
    bpm: float = 120.0,
    chords: Optional[List[str]] = None,
    bar_duration: float = 2.0,
    sr: int = 44100
) -> bytes:
    """
    Generates a complete multi-bar WAV audio file in bytes with exact BPM, chords, and beat grid.
    
    Args:
        bpm: Tempo in beats per minute.
        chords: Sequence of chord names (default: ["C", "G", "Am", "F"]).
        bar_duration: Duration of each chord segment in seconds (default: 2.0s).
        sr: Sample rate in Hz.
        
    Returns:
        16-bit PCM WAV byte stream.
    """
    if chords is None:
        chords = ["C", "G", "Am", "F"]
        
    total_duration = len(chords) * bar_duration
    total_samples = int(round(total_duration * sr))
    audio = np.zeros(total_samples, dtype=np.float32)
    
    for i, chord in enumerate(chords):
        start_sample = int(round(i * bar_duration * sr))
        end_sample = int(round((i + 1) * bar_duration * sr))
        segment_len = end_sample - start_sample
        segment_duration = segment_len / sr
        
        chord_wave = generate_triad_audio(chord, segment_duration, sr)
        audio[start_sample:end_sample] += chord_wave[:segment_len]
        
    clicks = generate_rhythm_clicks(bpm, total_duration, sr)
    audio += clicks
    
    return _encode_wav_bytes(audio, sr)


def generate_pure_silence(duration: float = 2.0, sr: int = 44100) -> bytes:
    """
    Generates a pure digital silence WAV byte stream (all zero samples).
    
    Args:
        duration: Duration in seconds.
        sr: Sample rate in Hz.
        
    Returns:
        16-bit PCM WAV byte stream of silence.
    """
    total_samples = int(round(duration * sr))
    silence = np.zeros(total_samples, dtype=np.float32)
    return _encode_wav_bytes(silence, sr)


def generate_white_noise(duration: float = 2.0, noise_level: float = 0.1, sr: int = 44100) -> bytes:
    """
    Generates a pure Gaussian white noise WAV byte stream.
    
    Args:
        duration: Duration in seconds.
        noise_level: Noise scaling factor.
        sr: Sample rate in Hz.
        
    Returns:
        16-bit PCM WAV byte stream.
    """
    total_samples = int(round(duration * sr))
    noise = np.random.normal(0, noise_level, total_samples).astype(np.float32)
    return _encode_wav_bytes(noise, sr)


def generate_noisy_progression(
    bpm: float = 120.0,
    chords: Optional[List[str]] = None,
    noise_level: float = 0.05,
    bar_duration: float = 2.0,
    sr: int = 44100
) -> bytes:
    """
    Generates a synthetic chord progression contaminated with additive Gaussian white noise.
    
    Args:
        bpm: Tempo in beats per minute.
        chords: Sequence of chord names.
        noise_level: Gaussian noise amplitude level.
        bar_duration: Duration of each chord segment in seconds.
        sr: Sample rate in Hz.
        
    Returns:
        Contaminated 16-bit PCM WAV byte stream.
    """
    if chords is None:
        chords = ["C", "G", "Am", "F"]
        
    total_duration = len(chords) * bar_duration
    total_samples = int(round(total_duration * sr))
    audio = np.zeros(total_samples, dtype=np.float32)
    
    for i, chord in enumerate(chords):
        start_sample = int(round(i * bar_duration * sr))
        end_sample = int(round((i + 1) * bar_duration * sr))
        segment_len = end_sample - start_sample
        segment_duration = segment_len / sr
        
        chord_wave = generate_triad_audio(chord, segment_duration, sr)
        audio[start_sample:end_sample] += chord_wave[:segment_len]
        
    clicks = generate_rhythm_clicks(bpm, total_duration, sr)
    audio += clicks
    
    # Add Gaussian white noise
    noise = np.random.normal(0, noise_level, total_samples).astype(np.float32)
    audio += noise
    
    return _encode_wav_bytes(audio, sr)


def generate_meter_audio(
    bpm: float = 120.0,
    meter: str = "4/4",
    bars: int = 4,
    sr: int = 44100
) -> bytes:
    """
    Generates rhythmic audio with accented downbeats specifically tailored for meter/time signature evaluation.
    
    Args:
        bpm: Tempo in beats per minute.
        meter: Target meter ("4/4" or "3/4").
        bars: Number of musical bars to generate.
        sr: Sample rate in Hz.
        
    Returns:
        16-bit PCM WAV byte stream.
    """
    beats_per_bar = 3 if meter == "3/4" else 4
    total_beats = bars * beats_per_bar
    duration = (60.0 / bpm) * total_beats
    
    # Generate accented rhythmic clicks
    clicks = generate_rhythm_clicks(
        bpm=bpm,
        duration=duration,
        sr=sr,
        accent_first=True,
        beats_per_bar=beats_per_bar
    )
    
    # Underlying harmonic bass pedal tone
    f_root = 130.81  # C3
    t = np.linspace(0, duration, len(clicks), endpoint=False, dtype=np.float32)
    harmony = 0.2 * np.sin(2.0 * np.pi * f_root * t)
    
    audio = clicks + harmony
    return _encode_wav_bytes(audio, sr)
