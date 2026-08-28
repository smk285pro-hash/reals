"""
Tier 2 Boundary Tests: Extreme Tempo Verification.
Verifies DSP beat tracking on ultra-slow (40 BPM) and ultra-fast (240 BPM) signals.
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
def test_extreme_tempo_slow_40_bpm(temp_test_dir: Path):
    """Verifies that 40 BPM audio is analyzed without hang and returns valid tempo metrics."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=40.0, chords=["C", "G"], bar_duration=6.0)
    audio_file = temp_test_dir / "slow_40bpm.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    bpm = result["bpm"]
    assert isinstance(bpm, (int, float))
    assert bpm > 0.0
    # 40 BPM (or octave double 80 BPM / 160 BPM)
    assert abs(bpm - 40.0) <= 5.0 or abs(bpm - 80.0) <= 5.0 or abs(bpm - 160.0) <= 6.0


@pytest.mark.tier2
def test_extreme_tempo_fast_240_bpm(temp_test_dir: Path):
    """Verifies that 240 BPM audio is analyzed without hang and returns valid tempo metrics."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=240.0, chords=["Am", "F", "C", "G"], bar_duration=1.0)
    audio_file = temp_test_dir / "fast_240bpm.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    bpm = result["bpm"]
    assert isinstance(bpm, (int, float))
    assert bpm > 0.0
    # 240 BPM (or half-time 120 BPM)
    assert abs(bpm - 240.0) <= 8.0 or abs(bpm - 120.0) <= 4.0
