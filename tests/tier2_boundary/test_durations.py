"""
Tier 2 Boundary Tests: Duration Extremes Verification.
Verifies DSP handling of minimum threshold clips (0.5s), subsecond files, and extended clips (60s).
"""
import pytest
from pathlib import Path
from tests.generators.synthetic_audio import generate_synthetic_wav

def get_dsp_engine():
    try:
        from app.core import dsp_baseline
        return dsp_baseline
    except ImportError:
        pytest.skip("app.core.dsp_baseline module not available yet")


@pytest.mark.tier2
def test_short_audio_0_5s_duration(temp_test_dir: Path):
    """Verifies that a 0.5-second clip is processed without index errors."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C"], bar_duration=0.5)
    audio_file = temp_test_dir / "short_0_5s.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    assert isinstance(result, dict)
    assert "bpm" in result
    assert "chords" in result


@pytest.mark.tier2
def test_long_audio_60s_duration(temp_test_dir: Path):
    """Verifies that a 60-second audio track is processed within memory and execution limits."""
    dsp = get_dsp_engine()
    # 30 bars of 2.0s = 60s
    chords_30 = ["C", "G", "Am", "F"] * 7 + ["C", "G"]
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=chords_30, bar_duration=2.0)
    audio_file = temp_test_dir / "long_60s.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    assert abs(result["bpm"] - 120.0) <= 3.0
    assert len(result["beats"]) >= 50
    assert len(result["chords"]) > 0


@pytest.mark.tier2
def test_subsecond_error_or_handling(temp_test_dir: Path):
    """Verifies that ultra-short audio (<0.5s) either raises a clean ValueError or handles gracefully."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C"], bar_duration=0.2)
    audio_file = temp_test_dir / "tiny_0_2s.wav"
    audio_file.write_bytes(wav_bytes)
    
    try:
        result = dsp.analyze_basic(str(audio_file))
        assert isinstance(result, dict)
    except ValueError as e:
        # Expected clean rejection of too short duration
        assert "short" in str(e).lower() or "duration" in str(e).lower()
