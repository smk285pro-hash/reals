"""
Empirical Adversarial Stress-Test Suite for DSP Baseline Engine and Audio Utils.
Challenger 1 Verification Harness for Milestone 1.

Tests cover:
1. Pure digital silence (all zeros).
2. Extremely quiet audio (amplitude 1e-6 and below/above threshold).
3. Extreme loud clipping signals (amplitude > 5.0).
4. Pure single frequencies (440 Hz A4, 261.63 Hz C4, 44 Hz Low sub, 10000 Hz High treble).
5. Polyphonic chords (C Major, A Minor, F# Major, Eb Minor).
6. Multi-chord temporal progressions (C Maj -> G Maj -> A Min -> F Maj with beat clicks).
7. Various sample rates (8kHz, 16kHz, 22.05kHz, 44.1kHz, 48kHz, 96kHz) and multi-channel (Stereo 2ch, 5.1 Surround 6ch).
8. Duration extremes: Very short (<0.5s, e.g. 0.15s, 0.3s) and longer (>15s, e.g. 16s, 20s).
9. Full schema compliance, boundary checks, interval contiguity, and exception safety.
"""

import os
import io
import math
import tempfile
import numpy as np
import scipy.io.wavfile as wavfile
import soundfile as sf
import pytest

from app.core.audio_utils import (
    load_and_preprocess_audio,
    validate_audio_file,
    TARGET_SR,
    TARGET_PEAK,
    MIN_AUDIO_DURATION_SEC
)
from app.core.dsp_baseline import (
    analyze_basic,
    estimate_key,
    estimate_chords,
    estimate_time_signature,
    generate_triad_templates
)
from app.api.schemas import AnalysisResponse, ChordSegment
from tests.generators.synthetic_audio import (
    generate_sine_wave,
    generate_triad_audio,
    generate_rhythm_clicks,
    generate_synthetic_wav,
    generate_pure_silence,
    PITCH_NAMES,
    TRIADS
)


def _write_wav(path: str, data: np.ndarray, sr: int = 44100):
    """Writes float or int numpy array to WAV file using soundfile."""
    sf.write(path, data, sr, subtype='PCM_16')


def _write_float_wav(path: str, data: np.ndarray, sr: int = 44100):
    """Writes raw float32 numpy array to WAV file using soundfile."""
    sf.write(path, data, sr, subtype='FLOAT')


# ===========================================================================
# 1. Pure Digital Silence (All Zeros)
# ===========================================================================
class TestDigitalSilence:
    """Stress tests on pure zero audio."""

    def test_pure_silence_short_and_long(self, tmp_path):
        for duration in [0.5, 2.0, 5.0]:
            wav_path = str(tmp_path / f"silence_{duration}s.wav")
            samples = np.zeros(int(44100 * duration), dtype=np.float32)
            _write_wav(wav_path, samples, sr=44100)

            # Preprocessing check
            y, sr, dur = load_and_preprocess_audio(wav_path)
            assert sr == 44100
            assert np.isclose(dur, duration, atol=0.01)
            assert np.max(np.abs(y)) == 0.0

            # DSP Basic Analysis check
            res = analyze_basic(wav_path, task_id="test-silence")
            # Verify schema
            validated = AnalysisResponse(**res)
            assert validated.task_id == "test-silence"
            assert validated.bpm == 0.0
            assert validated.tempo == 0.0
            assert validated.key == "Unknown"
            assert validated.time_signature == "4/4"
            assert validated.beats == []
            assert validated.chords == []
            assert np.isclose(validated.duration, duration, atol=0.05)


# ===========================================================================
# 2. Extremely Quiet Audio (Sub-Noise Floor & Near-Zero)
# ===========================================================================
class TestExtremelyQuietAudio:
    """Stress tests on ultra low amplitude audio."""

    def test_sub_threshold_quiet_audio(self, tmp_path):
        """Signals <= 1e-6 peak should be treated as silence safely."""
        wav_path = str(tmp_path / "quiet_1e_7.wav")
        # 440 Hz tone at 1e-7 amplitude
        t = np.linspace(0, 2.0, int(44100 * 2.0), endpoint=False)
        audio = (1e-7 * np.sin(2 * np.pi * 440.0 * t)).astype(np.float32)
        _write_float_wav(wav_path, audio, sr=44100)

        res = analyze_basic(wav_path, task_id="quiet-sub")
        validated = AnalysisResponse(**res)
        assert validated.bpm == 0.0
        assert validated.key == "Unknown"

    def test_above_threshold_micro_signal(self, tmp_path):
        """Signals slightly above 1e-6 (e.g. 5e-5) should normalize cleanly and not NaN."""
        wav_path = str(tmp_path / "quiet_5e_5.wav")
        t = np.linspace(0, 2.0, int(44100 * 2.0), endpoint=False)
        audio = (5e-5 * np.sin(2 * np.pi * 440.0 * t)).astype(np.float32)
        _write_float_wav(wav_path, audio, sr=44100)

        y, sr, dur = load_and_preprocess_audio(wav_path)
        assert np.isclose(np.max(np.abs(y)), TARGET_PEAK, atol=1e-3)
        assert not np.isnan(y).any()
        assert not np.isinf(y).any()

        res = analyze_basic(wav_path, task_id="quiet-norm")
        validated = AnalysisResponse(**res)
        assert validated.bpm >= 0.0
        assert not math.isnan(validated.bpm)
        assert validated.key != ""


# ===========================================================================
# 3. Extreme Loud / Clipping Signals (Amplitude > 5.0)
# ===========================================================================
class TestExtremeLoudClipping:
    """Stress tests on high-amplitude and clipped audio."""

    def test_extreme_high_amplitude_float(self, tmp_path):
        """Float WAV with amplitude up to 10.0 should normalize to TARGET_PEAK."""
        wav_path = str(tmp_path / "loud_10x.wav")
        t = np.linspace(0, 3.0, int(44100 * 3.0), endpoint=False)
        audio = (10.0 * np.sin(2 * np.pi * 261.63 * t)).astype(np.float32)
        _write_float_wav(wav_path, audio, sr=44100)

        y, sr, dur = load_and_preprocess_audio(wav_path)
        assert np.isclose(np.max(np.abs(y)), TARGET_PEAK, atol=1e-3)
        assert np.min(y) >= -1.0
        assert np.max(y) <= 1.0

        res = analyze_basic(wav_path, task_id="loud-analysis")
        validated = AnalysisResponse(**res)
        assert validated.duration == 3.0
        assert not math.isnan(validated.bpm)

    def test_hard_clipped_square_wave(self, tmp_path):
        """Severe hard clipped square waveform."""
        wav_path = str(tmp_path / "hard_clip.wav")
        t = np.linspace(0, 2.0, int(44100 * 2.0), endpoint=False)
        audio = np.sign(np.sin(2 * np.pi * 440.0 * t)).astype(np.float32) * 5.0
        _write_float_wav(wav_path, audio, sr=44100)

        res = analyze_basic(wav_path, task_id="hard-clip")
        validated = AnalysisResponse(**res)
        assert validated.key != ""
        assert len(validated.chords) >= 1


# ===========================================================================
# 4. Pure Single Frequencies (A4, C4, Low Sub 44Hz, High Treble 10kHz)
# ===========================================================================
class TestPureFrequencies:
    """Stress tests on isolated pure sinusoidal frequencies."""

    @pytest.mark.parametrize("freq,name,expected_pitch_class", [
        (440.0, "A4", "A"),
        (261.63, "C4", "C"),
        (44.0, "Low_Sub_F0", "F"),      # 44Hz corresponds to F1 (43.65 Hz)
        (10000.0, "High_Treble", None)  # 10kHz high treble tone
    ])
    def test_single_pure_tone(self, tmp_path, freq, name, expected_pitch_class):
        wav_path = str(tmp_path / f"pure_{name}.wav")
        tone = generate_sine_wave(freq=freq, duration=2.5, sr=44100, amp=0.8)
        _write_wav(wav_path, tone, sr=44100)

        res = analyze_basic(wav_path, task_id=f"pure-{name}")
        validated = AnalysisResponse(**res)
        assert validated.duration == 2.5
        assert isinstance(validated.key, str)
        assert len(validated.key) > 0
        assert isinstance(validated.bpm, float)
        assert not math.isnan(validated.bpm)

        # For well-defined fundamental pitches in audible midrange, key/chord root should match pitch class
        if expected_pitch_class in ["A", "C"]:
            assert expected_pitch_class in validated.key


# ===========================================================================
# 5. Polyphonic Chords (C Maj, A Min, F# Maj, Eb Min)
# ===========================================================================
class TestPolyphonicChords:
    """Stress tests on isolated polyphonic triad chords."""

    @pytest.mark.parametrize("chord_name,expected_root,expected_mode", [
        ("C", "C", "Major"),
        ("Am", "A", "Minor"),
        ("F#", "F#", "Major"),
        ("Ebm", "D#", "Minor"),  # Eb is enharmonically D#
    ])
    def test_polyphonic_triad_accuracy(self, tmp_path, chord_name, expected_root, expected_mode):
        wav_path = str(tmp_path / f"chord_{chord_name}.wav")
        audio = generate_triad_audio(chord_name, duration=3.0, sr=44100)
        _write_wav(wav_path, audio, sr=44100)

        res = analyze_basic(wav_path, task_id=f"poly-{chord_name}")
        validated = AnalysisResponse(**res)

        assert validated.duration == 3.0
        assert len(validated.chords) >= 1
        
        # Verify detected chord matches expected chord
        primary_detected_chord = validated.chords[0].chord
        # Check root or enharmonic root
        if chord_name == "Ebm":
            assert primary_detected_chord in ["Ebm", "D#m"]
        elif chord_name == "F#":
            assert primary_detected_chord in ["F#", "Gb"]
        else:
            assert primary_detected_chord == chord_name

        # Verify key estimation
        if chord_name in ["C", "Am"]:
            assert expected_root in validated.key
            assert expected_mode in validated.key


# ===========================================================================
# 6. Multi-Chord Temporal Progressions & Interval Contiguity
# ===========================================================================
class TestMultiChordProgression:
    """Stress tests on temporal progression C -> G -> Am -> F with beat clicks."""

    def test_four_chord_progression_intervals(self, tmp_path):
        wav_path = str(tmp_path / "progression_c_g_am_f.wav")
        wav_bytes = generate_synthetic_wav(
            bpm=120.0,
            chords=["C", "G", "Am", "F"],
            bar_duration=2.0,
            sr=44100
        )
        with open(wav_path, "wb") as f:
            f.write(wav_bytes)

        res = analyze_basic(wav_path, task_id="test-progression-4")
        validated = AnalysisResponse(**res)

        assert np.isclose(validated.duration, 8.0, atol=0.1)
        assert 110.0 <= validated.bpm <= 130.0
        assert len(validated.beats) >= 12

        chords = validated.chords
        assert len(chords) >= 4, f"Expected at least 4 chord segments, got {len(chords)}"

        # 1. Contiguity Check: Every segment [start, end] must be contiguous
        assert chords[0].start == 0.0, f"First chord start should be 0.0, got {chords[0].start}"
        for idx in range(len(chords) - 1):
            assert math.isclose(chords[idx].end, chords[idx + 1].start, abs_tol=0.05), \
                f"Gap detected between chord {idx} ({chords[idx]}) and {idx+1} ({chords[idx+1]})"
            assert chords[idx].end > chords[idx].start, f"Invalid zero/negative duration chord: {chords[idx]}"

        last_end = chords[-1].end
        assert math.isclose(last_end, validated.duration, abs_tol=0.1), \
            f"Last chord end ({last_end}) does not match duration ({validated.duration})"

        # 2. Chord Sequence accuracy check
        recognized_labels = [c.chord for c in chords]
        # Should recognize C, G, Am, F in progression
        assert "C" in recognized_labels
        assert "G" in recognized_labels
        assert "Am" in recognized_labels
        assert "F" in recognized_labels


# ===========================================================================
# 7. Various Sample Rates and Multi-Channel Audio
# ===========================================================================
class TestSampleRatesAndChannels:
    """Stress tests across standard sample rates and channel topologies."""

    @pytest.mark.parametrize("sr", [8000, 16000, 22050, 44100, 48000, 96000])
    def test_sample_rates(self, tmp_path, sr):
        wav_path = str(tmp_path / f"sr_{sr}hz.wav")
        tone = generate_sine_wave(freq=440.0, duration=2.0, sr=sr, amp=0.7)
        _write_wav(wav_path, tone, sr=sr)

        y, loaded_sr, dur = load_and_preprocess_audio(wav_path)
        assert loaded_sr == TARGET_SR
        assert np.isclose(dur, 2.0, atol=0.05)

        res = analyze_basic(wav_path, task_id=f"sr-{sr}")
        validated = AnalysisResponse(**res)
        assert validated.duration == 2.0
        assert not math.isnan(validated.bpm)

    def test_stereo_two_channels(self, tmp_path):
        """Stereo file (2 channels) with different audio in left and right."""
        wav_path = str(tmp_path / "stereo_audio.wav")
        num_samples = int(44100 * 2.5)
        t = np.linspace(0, 2.5, num_samples, endpoint=False)
        left = 0.5 * np.sin(2 * np.pi * 261.63 * t)  # C4
        right = 0.5 * np.sin(2 * np.pi * 329.63 * t) # E4
        stereo = np.column_stack([left, right]).astype(np.float32)
        _write_wav(wav_path, stereo, sr=44100)

        y, sr, dur = load_and_preprocess_audio(wav_path)
        assert y.ndim == 1, "Audio should be downmixed to 1D mono"
        assert sr == 44100

        res = analyze_basic(wav_path, task_id="stereo-test")
        validated = AnalysisResponse(**res)
        assert validated.duration == 2.5

    def test_surround_5_1_six_channels(self, tmp_path):
        """5.1 Surround audio (6 channels) downmixed cleanly."""
        wav_path = str(tmp_path / "surround_5_1.wav")
        num_samples = int(44100 * 2.0)
        t = np.linspace(0, 2.0, num_samples, endpoint=False)
        channels = [
            0.4 * np.sin(2 * np.pi * (200 + i * 50) * t).astype(np.float32)
            for i in range(6)
        ]
        multichannel = np.column_stack(channels)
        _write_wav(wav_path, multichannel, sr=44100)

        y, sr, dur = load_and_preprocess_audio(wav_path)
        assert y.ndim == 1
        assert len(y) > 0

        res = analyze_basic(wav_path, task_id="surround-5.1")
        validated = AnalysisResponse(**res)
        assert validated.duration == 2.0


# ===========================================================================
# 8. Very Short Audio (<0.5s) vs Longer Audio (>15s)
# ===========================================================================
class TestDurationBoundaries:
    """Stress tests on duration extremes."""

    @pytest.mark.parametrize("duration", [0.15, 0.25, 0.40])
    def test_very_short_audio(self, tmp_path, duration):
        """Audio under 0.5s should analyze safely without crashing or index errors."""
        wav_path = str(tmp_path / f"short_{duration}s.wav")
        tone = generate_sine_wave(freq=440.0, duration=duration, sr=44100, amp=0.8)
        _write_wav(wav_path, tone, sr=44100)

        res = analyze_basic(wav_path, task_id=f"short-{duration}")
        validated = AnalysisResponse(**res)
        assert np.isclose(validated.duration, duration, atol=0.02)
        assert isinstance(validated.chords, list)
        assert isinstance(validated.beats, list)

    def test_audio_below_minimum_duration_fails_validation(self, tmp_path):
        """Audio < 0.1s should fail validation cleanly with ValueError."""
        wav_path = str(tmp_path / "ultra_short_0_05s.wav")
        tone = generate_sine_wave(freq=440.0, duration=0.05, sr=44100, amp=0.8)
        _write_wav(wav_path, tone, sr=44100)

        with pytest.raises(ValueError, match="too short"):
            load_and_preprocess_audio(wav_path)

    @pytest.mark.parametrize("duration", [16.0, 20.0, 30.0])
    def test_longer_audio(self, tmp_path, duration):
        """Longer audio (>15s) with multi-bar chords should execute efficiently."""
        wav_path = str(tmp_path / f"long_{duration}s.wav")
        chords_cycle = ["C", "G", "Am", "F"] * int(duration // 8 + 1)
        wav_bytes = generate_synthetic_wav(
            bpm=120.0,
            chords=chords_cycle[:int(duration // 2)],
            bar_duration=2.0,
            sr=44100
        )
        with open(wav_path, "wb") as f:
            f.write(wav_bytes)

        res = analyze_basic(wav_path, task_id=f"long-{duration}")
        validated = AnalysisResponse(**res)
        assert np.isclose(validated.duration, duration, atol=0.5)
        assert 110.0 <= validated.bpm <= 130.0
        assert len(validated.beats) >= 20
        assert len(validated.chords) >= 4


# ===========================================================================
# 9. Time Signature & Meter Robustness
# ===========================================================================
class TestTimeSignatureInference:
    """Stress tests on 3/4 waltz vs 4/4 standard meter detection."""

    def test_3_4_waltz_meter(self, tmp_path):
        from tests.generators.synthetic_audio import generate_meter_audio
        wav_path = str(tmp_path / "meter_3_4.wav")
        audio_bytes = generate_meter_audio(bpm=120.0, meter="3/4", bars=8, sr=44100)
        with open(wav_path, "wb") as f:
            f.write(audio_bytes)

        res = analyze_basic(wav_path, task_id="meter-3-4")
        validated = AnalysisResponse(**res)
        assert validated.time_signature in ["3/4", "4/4"]

    def test_4_4_standard_meter(self, tmp_path):
        from tests.generators.synthetic_audio import generate_meter_audio
        wav_path = str(tmp_path / "meter_4_4.wav")
        audio_bytes = generate_meter_audio(bpm=120.0, meter="4/4", bars=8, sr=44100)
        with open(wav_path, "wb") as f:
            f.write(audio_bytes)

        res = analyze_basic(wav_path, task_id="meter-4-4")
        validated = AnalysisResponse(**res)
        assert validated.time_signature == "4/4"
