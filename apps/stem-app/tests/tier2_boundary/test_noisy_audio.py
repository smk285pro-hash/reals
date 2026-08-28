"""
Tier 2 Boundary Tests: Noisy Audio and Low SNR Verification.
Verifies HPSS harmonic separation and robust key/chord estimation in the presence of noise.
"""
import pytest
from pathlib import Path
from tests.generators.synthetic_audio import generate_noisy_progression, generate_white_noise

def get_dsp_engine():
    try:
        from app.core import dsp_baseline
        return dsp_baseline
    except ImportError:
        pytest.skip("app.core.dsp_baseline module not available yet")


@pytest.mark.tier2
def test_noisy_progression_key_and_tempo(temp_test_dir: Path):
    """Verifies that a chord progression with 5% additive Gaussian noise is correctly identified."""
    dsp = get_dsp_engine()
    noisy_wav = generate_noisy_progression(bpm=120.0, chords=["C", "G", "Am", "F"], noise_level=0.05)
    audio_file = temp_test_dir / "noisy_prog.wav"
    audio_file.write_bytes(noisy_wav)
    
    result = dsp.analyze_basic(str(audio_file))
    
    assert abs(result["bpm"] - 120.0) <= 4.0
    assert result["key"] in ["C Major", "C", "A Minor"]
    assert len(result["chords"]) > 0


@pytest.mark.tier2
def test_pure_white_noise_graceful_handling(temp_test_dir: Path):
    """Verifies that pure white noise input is handled gracefully without crashing."""
    dsp = get_dsp_engine()
    noise_wav = generate_white_noise(duration=2.0, noise_level=0.2)
    audio_file = temp_test_dir / "white_noise.wav"
    audio_file.write_bytes(noise_wav)
    
    result = dsp.analyze_basic(str(audio_file))
    assert isinstance(result, dict)
    assert "bpm" in result
    assert "key" in result
    assert "time_signature" in result
