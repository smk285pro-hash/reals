"""
Tier 1 Feature Tests: Beat & BPM Tracking Verification.
Validates onset envelope extraction, tempo estimation, and beat timestamps against mathematical ground truth.
"""
import pytest
import numpy as np
import tempfile
import os
from pathlib import Path

from tests.generators.synthetic_audio import (
    generate_rhythm_clicks,
    generate_synthetic_wav,
    _encode_wav_bytes
)

# Helper function to dynamically import DSP baseline
def get_dsp_engine():
    try:
        from app.core import dsp_baseline
        return dsp_baseline
    except ImportError:
        pytest.skip("app.core.dsp_baseline module not available yet")


@pytest.mark.tier1
def test_bpm_60_ground_truth(temp_test_dir: Path):
    """Verifies BPM detection on 60 BPM ground-truth synthetic rhythm audio."""
    dsp = get_dsp_engine()
    target_bpm = 60.0
    wav_bytes = generate_synthetic_wav(bpm=target_bpm, chords=["C", "G"], bar_duration=4.0)
    audio_file = temp_test_dir / "test_60bpm.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    detected_bpm = result["bpm"]
    
    # 60 BPM allows tolerance within +-3% (or octave 120 BPM)
    assert abs(detected_bpm - target_bpm) <= 3.0 or abs(detected_bpm - 120.0) <= 4.0
    assert isinstance(result["beats"], list)
    assert len(result["beats"]) >= 4


@pytest.mark.tier1
def test_bpm_90_ground_truth(temp_test_dir: Path):
    """Verifies BPM detection on 90 BPM ground-truth synthetic rhythm audio."""
    dsp = get_dsp_engine()
    target_bpm = 90.0
    wav_bytes = generate_synthetic_wav(bpm=target_bpm, chords=["C", "Am", "F", "G"], bar_duration=2.67)
    audio_file = temp_test_dir / "test_90bpm.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    detected_bpm = result["bpm"]
    
    assert abs(detected_bpm - target_bpm) <= 3.0 or abs(detected_bpm - 180.0) <= 5.0
    assert len(result["beats"]) >= 8


@pytest.mark.tier1
def test_bpm_120_ground_truth(temp_test_dir: Path):
    """Verifies BPM detection on standard 120 BPM ground-truth audio."""
    dsp = get_dsp_engine()
    target_bpm = 120.0
    wav_bytes = generate_synthetic_wav(bpm=target_bpm, chords=["C", "G", "Am", "F"], bar_duration=2.0)
    audio_file = temp_test_dir / "test_120bpm.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    detected_bpm = result["bpm"]
    
    assert abs(detected_bpm - target_bpm) <= 3.0
    assert len(result["beats"]) >= 12
    # Verify beat intervals average approx 0.5 seconds
    beats = result["beats"]
    if len(beats) >= 4:
        diffs = np.diff(beats)
        mean_interval = float(np.median(diffs))
        assert abs(mean_interval - 0.5) <= 0.05


@pytest.mark.tier1
def test_bpm_140_ground_truth(temp_test_dir: Path):
    """Verifies BPM detection on 140 BPM ground-truth audio."""
    dsp = get_dsp_engine()
    target_bpm = 140.0
    wav_bytes = generate_synthetic_wav(bpm=target_bpm, chords=["Dm", "G", "C", "Am"], bar_duration=1.71)
    audio_file = temp_test_dir / "test_140bpm.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    detected_bpm = result["bpm"]
    
    assert abs(detected_bpm - target_bpm) <= 4.0 or abs(detected_bpm - 70.0) <= 2.0


@pytest.mark.tier1
def test_bpm_180_ground_truth(temp_test_dir: Path):
    """Verifies BPM detection on high-tempo 180 BPM ground-truth audio."""
    dsp = get_dsp_engine()
    target_bpm = 180.0
    wav_bytes = generate_synthetic_wav(bpm=target_bpm, chords=["Em", "C", "G", "D"], bar_duration=1.33)
    audio_file = temp_test_dir / "test_180bpm.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    detected_bpm = result["bpm"]
    
    # Allows 180 BPM or half-time 90 BPM
    assert abs(detected_bpm - target_bpm) <= 5.0 or abs(detected_bpm - 90.0) <= 3.0


@pytest.mark.tier1
def test_beat_timestamps_monotonicity(temp_test_dir: Path):
    """Verifies that all returned beat timestamps are strictly increasing and positive."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C", "G"], bar_duration=2.0)
    audio_file = temp_test_dir / "test_monotonic.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    beats = result["beats"]
    
    assert len(beats) > 0
    for i in range(len(beats) - 1):
        assert beats[i] < beats[i+1], f"Beat at index {i} ({beats[i]}) is not strictly less than {beats[i+1]}"
        assert beats[i] >= 0.0
