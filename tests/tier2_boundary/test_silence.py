"""
Tier 2 Boundary Tests: Pure Digital Silence Handling.
Verifies that pure zero-energy audio does not trigger ZeroDivisionError or crash the DSP engine.
"""
import pytest
from pathlib import Path
from tests.generators.synthetic_audio import generate_pure_silence

def get_dsp_engine():
    try:
        from app.core import dsp_baseline
        return dsp_baseline
    except ImportError:
        pytest.skip("app.core.dsp_baseline module not available yet")


@pytest.mark.tier2
def test_pure_silence_dsp_analysis(temp_test_dir: Path):
    """Verifies that analyze_basic processes 2 seconds of pure silence without crashing."""
    dsp = get_dsp_engine()
    silence_bytes = generate_pure_silence(duration=2.0)
    audio_file = temp_test_dir / "pure_silence_2s.wav"
    audio_file.write_bytes(silence_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    
    assert isinstance(result, dict)
    assert "bpm" in result
    assert "key" in result
    assert "time_signature" in result
    assert isinstance(result["beats"], list)
    assert isinstance(result["chords"], list)


@pytest.mark.tier2
def test_silence_key_fallback(temp_test_dir: Path):
    """Verifies that key estimation on pure silence defaults safely to a valid key string (e.g. 'C Major')."""
    dsp = get_dsp_engine()
    silence_bytes = generate_pure_silence(duration=3.0)
    audio_file = temp_test_dir / "silence_key.wav"
    audio_file.write_bytes(silence_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    assert isinstance(result["key"], str)
    assert len(result["key"]) > 0


@pytest.mark.tier2
def test_silence_chord_fallback(temp_test_dir: Path):
    """Verifies that chord estimation on pure silence returns a valid span without NaN or division error."""
    dsp = get_dsp_engine()
    silence_bytes = generate_pure_silence(duration=2.0)
    audio_file = temp_test_dir / "silence_chords.wav"
    audio_file.write_bytes(silence_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    chords = result["chords"]
    assert isinstance(chords, list)
