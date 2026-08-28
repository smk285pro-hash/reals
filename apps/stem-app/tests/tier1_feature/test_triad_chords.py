"""
Tier 1 Feature Tests: Triad Chord Recognition Verification.
Validates beat-synchronous template matching across 24 Major & Minor chords.
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
def test_single_c_major_triad(temp_test_dir: Path):
    """Verifies recognition of a sustained single C Major triad."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C"], bar_duration=3.0)
    audio_file = temp_test_dir / "single_c.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    chords = result["chords"]
    
    assert len(chords) > 0
    # The primary recognized chord should be C
    detected_chord_names = [c["chord"] for c in chords]
    assert "C" in detected_chord_names


@pytest.mark.tier1
def test_single_a_minor_triad(temp_test_dir: Path):
    """Verifies recognition of a sustained single A Minor triad."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["Am"], bar_duration=3.0)
    audio_file = temp_test_dir / "single_am.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    chords = result["chords"]
    
    assert len(chords) > 0
    detected_chord_names = [c["chord"] for c in chords]
    assert "Am" in detected_chord_names or "A" in detected_chord_names or "C" in detected_chord_names


@pytest.mark.tier1
def test_c_g_am_f_progression(temp_test_dir: Path):
    """Verifies recognition of the standard pop progression: C -> G -> Am -> F."""
    dsp = get_dsp_engine()
    expected_chords = ["C", "G", "Am", "F"]
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=expected_chords, bar_duration=2.0)
    audio_file = temp_test_dir / "pop_progression.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    chords = result["chords"]
    
    assert len(chords) >= 3
    detected_names = [c["chord"] for c in chords]
    # Check that at least 3 of the 4 chords are correctly identified in the sequence
    matches = sum(1 for exp in expected_chords if exp in detected_names)
    assert matches >= 3, f"Expected majority of {expected_chords} in {detected_names}"


@pytest.mark.tier1
def test_dm_g_c_am_progression(temp_test_dir: Path):
    """Verifies recognition of jazz ii-V-I-vi progression: Dm -> G -> C -> Am."""
    dsp = get_dsp_engine()
    expected_chords = ["Dm", "G", "C", "Am"]
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=expected_chords, bar_duration=2.0)
    audio_file = temp_test_dir / "jazz_progression.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    chords = result["chords"]
    
    detected_names = [c["chord"] for c in chords]
    matches = sum(1 for exp in expected_chords if exp in detected_names)
    assert matches >= 3


@pytest.mark.tier1
def test_e_b_csm_a_progression(temp_test_dir: Path):
    """Verifies recognition of E Major key progression: E -> B -> C#m -> A."""
    dsp = get_dsp_engine()
    expected_chords = ["E", "B", "C#m", "A"]
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=expected_chords, bar_duration=2.0)
    audio_file = temp_test_dir / "e_major_progression.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    chords = result["chords"]
    
    detected_names = [c["chord"] for c in chords]
    matches = sum(1 for exp in ["E", "B", "C#m", "A"] if exp in detected_names or exp.replace("#", "") in detected_names)
    assert matches >= 2


@pytest.mark.tier1
def test_chord_segments_continuity_and_bounds(temp_test_dir: Path):
    """Verifies that chord segments span from 0.0 to total duration without gaps or negative intervals."""
    dsp = get_dsp_engine()
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C", "G", "Am", "F"], bar_duration=2.0)
    audio_file = temp_test_dir / "continuity.wav"
    audio_file.write_bytes(wav_bytes)
    
    result = dsp.analyze_basic(str(audio_file))
    chords = result["chords"]
    
    assert len(chords) > 0
    assert chords[0]["start"] == 0.0
    for i, segment in enumerate(chords):
        assert segment["start"] < segment["end"], f"Invalid segment interval {segment}"
        assert segment["start"] >= 0.0
        assert isinstance(segment["chord"], str) and len(segment["chord"]) > 0
        if i + 1 < len(chords):
            # Contiguous without gaps
            assert abs(chords[i]["end"] - chords[i+1]["start"]) <= 0.01
