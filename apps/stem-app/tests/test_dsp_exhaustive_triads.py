"""
Extended 24-Triad Exhaustive Empirical Benchmark and Noise Stress Harness.
"""
import math
import numpy as np
import pytest
import soundfile as sf
from app.core.dsp_baseline import analyze_basic, estimate_chords, estimate_key, generate_triad_templates, PITCH_CLASSES
from app.api.schemas import AnalysisResponse
from tests.generators.synthetic_audio import generate_triad_audio, FLAT_TO_SHARP, TRIADS


class TestAll24TriadsEmpirical:
    """Exhaustively benchmarks all 12 Major and 12 Minor triads."""

    @pytest.mark.parametrize("root", PITCH_CLASSES)
    def test_all_12_major_triads(self, tmp_path, root):
        wav_path = str(tmp_path / f"chord_{root}_maj.wav")
        audio = generate_triad_audio(root, duration=2.5, sr=44100)
        sf.write(wav_path, audio, 44100, subtype='PCM_16')

        res = analyze_basic(wav_path, task_id=f"maj-{root}")
        validated = AnalysisResponse(**res)
        assert len(validated.chords) >= 1
        top_chord = validated.chords[0].chord
        assert top_chord == root, f"Expected {root}, got {top_chord}"
        assert f"{root} Major" == validated.key or root in validated.key

    @pytest.mark.parametrize("root", PITCH_CLASSES)
    def test_all_12_minor_triads(self, tmp_path, root):
        minor_name = f"{root}m"
        wav_path = str(tmp_path / f"chord_{root}_min.wav")
        audio = generate_triad_audio(minor_name, duration=2.5, sr=44100)
        sf.write(wav_path, audio, 44100, subtype='PCM_16')

        res = analyze_basic(wav_path, task_id=f"min-{root}")
        validated = AnalysisResponse(**res)
        assert len(validated.chords) >= 1
        top_chord = validated.chords[0].chord
        assert top_chord == minor_name, f"Expected {minor_name}, got {top_chord}"
        assert f"{root} Minor" == validated.key or root in validated.key


class TestAdversarialNoiseAndDrift:
    """Stress tests on heavy noise injection and DC offset."""

    def test_dc_bias_offset(self, tmp_path):
        """Signal with strong DC bias (+0.8 offset) should normalize safely without clipping artifacts."""
        wav_path = str(tmp_path / "dc_offset.wav")
        t = np.linspace(0, 2.0, int(44100 * 2.0), endpoint=False)
        audio = (0.3 * np.sin(2 * np.pi * 440.0 * t) + 0.8).astype(np.float32)
        sf.write(wav_path, audio, 44100, subtype='FLOAT')

        res = analyze_basic(wav_path, task_id="dc-test")
        validated = AnalysisResponse(**res)
        assert not math.isnan(validated.bpm)
        assert validated.key != ""

    def test_heavy_white_noise_floor(self, tmp_path):
        """C Major chord buried in SNR = +6dB Gaussian white noise."""
        wav_path = str(tmp_path / "noisy_c_maj.wav")
        audio = generate_triad_audio("C", duration=3.0, sr=44100)
        noise = np.random.normal(0, 0.15, len(audio)).astype(np.float32)
        combined = audio + noise
        sf.write(wav_path, combined, 44100, subtype='PCM_16')

        res = analyze_basic(wav_path, task_id="noise-c-maj")
        validated = AnalysisResponse(**res)
        assert "C" in [c.chord for c in validated.chords]
        assert "C" in validated.key
