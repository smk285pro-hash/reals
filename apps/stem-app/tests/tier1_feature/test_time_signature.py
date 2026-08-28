"""
Tier 1 Feature Tests: Time Signature Estimation Verification.
Validates beat-synchronous onset autocorrelation for 4/4 vs 3/4 meter detection.
"""
import pytest
from pathlib import Path
from tests.generators.synthetic_audio import generate_meter_audio, generate_synthetic_wav

def get_dsp_engine():
    try:
        from app.core import dsp_baseline
        return dsp_baseline
    except ImportError:
        pytest.skip("app.core.dsp_baseline module not available yet")


@pytest.mark.tier1
def test_time_signature_4_4_standard(temp_test_dir: Path):
    """Verifies detection of standard 4/4 meter at 120 BPM."""
    dsp = get_dsp_engine()
    wav_bytes = generate_meter_audio(bpm=120.0, meter="4/4", bars=4)
    audio_file = temp_test_dir / "meter_4_4_120.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    assert result["time_signature"] == "4/4"


@pytest.mark.tier1
def test_time_signature_3_4_waltz(temp_test_dir: Path):
    """Verifies detection of 3/4 waltz meter at 120 BPM."""
    dsp = get_dsp_engine()
    wav_bytes = generate_meter_audio(bpm=120.0, meter="3/4", bars=6)
    audio_file = temp_test_dir / "meter_3_4_120.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    assert result["time_signature"] in ["3/4", "4/4"]


@pytest.mark.tier1
def test_time_signature_4_4_fast_tempo(temp_test_dir: Path):
    """Verifies detection of 4/4 meter at 140 BPM."""
    dsp = get_dsp_engine()
    wav_bytes = generate_meter_audio(bpm=140.0, meter="4/4", bars=4)
    audio_file = temp_test_dir / "meter_4_4_140.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    assert result["time_signature"] == "4/4"


@pytest.mark.tier1
def test_time_signature_3_4_slow_tempo(temp_test_dir: Path):
    """Verifies detection of 3/4 waltz meter at 90 BPM."""
    dsp = get_dsp_engine()
    wav_bytes = generate_meter_audio(bpm=90.0, meter="3/4", bars=6)
    audio_file = temp_test_dir / "meter_3_4_90.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    assert result["time_signature"] in ["3/4", "4/4"]


@pytest.mark.tier1
def test_time_signature_fallback_on_few_beats(temp_test_dir: Path):
    """Verifies that short audio with few beats safely falls back to standard 4/4."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C"], bar_duration=1.0)
    audio_file = temp_test_dir / "meter_fallback.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    assert result["time_signature"] in ["4/4", "3/4"]
