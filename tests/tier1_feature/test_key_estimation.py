"""
Tier 1 Feature Tests: Master Key Estimation Verification.
Validates Krumhansl-Schmuckler cognitive pitch profile correlation across 24 keys.
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


@pytest.mark.tier1
def test_key_c_major_ground_truth(temp_test_dir: Path):
    """Verifies Master Key detection on pure C Major chord progression (C - F - G - C)."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C", "F", "G", "C"], bar_duration=2.0)
    audio_file = temp_test_dir / "key_c_major.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    detected_key = result["key"]
    
    # Must be C Major (or closely related A Minor relative key)
    assert detected_key in ["C Major", "C", "A Minor"]


@pytest.mark.tier1
def test_key_g_major_ground_truth(temp_test_dir: Path):
    """Verifies Master Key detection on G Major chord progression (G - C - D - G)."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["G", "C", "D", "G"], bar_duration=2.0)
    audio_file = temp_test_dir / "key_g_major.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    detected_key = result["key"]
    
    assert detected_key in ["G Major", "G", "E Minor"]


@pytest.mark.tier1
def test_key_d_major_ground_truth(temp_test_dir: Path):
    """Verifies Master Key detection on D Major chord progression (D - G - A - D)."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["D", "G", "A", "D"], bar_duration=2.0)
    audio_file = temp_test_dir / "key_d_major.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    detected_key = result["key"]
    
    assert detected_key in ["D Major", "D", "B Minor"]


@pytest.mark.tier1
def test_key_a_minor_ground_truth(temp_test_dir: Path):
    """Verifies Master Key detection on A Minor chord progression (Am - Dm - Em - Am)."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["Am", "Dm", "Em", "Am"], bar_duration=2.0)
    audio_file = temp_test_dir / "key_a_minor.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    detected_key = result["key"]
    
    assert detected_key in ["A Minor", "Am", "C Major"]


@pytest.mark.tier1
def test_key_d_minor_ground_truth(temp_test_dir: Path):
    """Verifies Master Key detection on D Minor chord progression (Dm - Gm - A - Dm)."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["Dm", "Gm", "A", "Dm"], bar_duration=2.0)
    audio_file = temp_test_dir / "key_d_minor.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    detected_key = result["key"]
    
    assert detected_key in ["D Minor", "Dm", "F Major"]


@pytest.mark.tier1
def test_key_e_minor_ground_truth(temp_test_dir: Path):
    """Verifies Master Key detection on E Minor chord progression (Em - C - G - D)."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["Em", "C", "G", "D"], bar_duration=2.0)
    audio_file = temp_test_dir / "key_e_minor.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    detected_key = result["key"]
    
    assert detected_key in ["E Minor", "Em", "G Major"]
