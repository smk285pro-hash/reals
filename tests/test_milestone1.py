"""
Milestone 1 Test Suite for AI Audio Lab 2026.
Tests audio utils, DSP baseline algorithms, and FastAPI endpoints.
"""

import os
import io
import tempfile
import numpy as np
import soundfile as sf
import scipy.signal
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.audio_utils import validate_audio_file, load_and_preprocess_audio
from app.core.dsp_baseline import (
    estimate_key,
    estimate_chords,
    estimate_time_signature,
    analyze_basic,
    generate_triad_templates
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helper Fixtures: Synthetic Audio Generators
# ---------------------------------------------------------------------------

def generate_sine_wave(freq: float = 440.0, duration: float = 1.0, sr: int = 44100) -> np.ndarray:
    """Generates a pure sine tone array."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    return 0.8 * np.sin(2 * np.pi * freq * t).astype(np.float32)


def generate_synthetic_chord(freqs: list, duration: float = 1.0, sr: int = 44100) -> np.ndarray:
    """Generates a chord summing multiple sine frequencies."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    y = np.zeros_like(t)
    for f in freqs:
        y += np.sin(2 * np.pi * f * t)
    return (0.8 * (y / len(freqs))).astype(np.float32)


def generate_progression_wav(sr: int = 44100) -> str:
    """
    Synthesizes a 4-bar chord progression at 120 BPM (0.5s per beat, 2.0s per bar):
    Bar 1: C Major (C4, E4, G4)
    Bar 2: G Major (G4, B4, D5)
    Bar 3: A Minor (A4, C5, E5)
    Bar 4: F Major (F4, A4, C5)
    Total duration = 8.0s.
    """
    dur_bar = 2.0
    c_maj = generate_synthetic_chord([261.63, 329.63, 392.00], duration=dur_bar, sr=sr)
    g_maj = generate_synthetic_chord([392.00, 493.88, 587.33], duration=dur_bar, sr=sr)
    a_min = generate_synthetic_chord([440.00, 523.25, 659.25], duration=dur_bar, sr=sr)
    f_maj = generate_synthetic_chord([349.23, 440.00, 523.25], duration=dur_bar, sr=sr)

    progression = np.concatenate([c_maj, g_maj, a_min, f_maj])

    # Add rhythmic pulses every 0.5s (120 BPM)
    pulse_indices = (np.arange(16) * 0.5 * sr).astype(int)
    for idx in pulse_indices:
        if idx < len(progression):
            progression[idx:min(idx + 100, len(progression))] += 0.5

    # Normalize
    progression = progression / np.max(np.abs(progression)) * 0.9

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sf.write(tmp.name, progression, sr)
    tmp.close()
    return tmp.name


# ---------------------------------------------------------------------------
# 1. Audio Utils Tests
# ---------------------------------------------------------------------------

def test_scipy_compatibility_patch():
    """Verify that scipy.signal has hann attribute patched."""
    assert hasattr(scipy.signal, 'hann'), "scipy.signal.hann compatibility patch missing!"
    w = scipy.signal.hann(10)
    assert len(w) == 10


def test_validate_audio_file():
    """Test format checking and error triggers."""
    # Valid file
    wav_path = generate_progression_wav()
    try:
        assert validate_audio_file(wav_path) is True

        # Non-existent file
        with pytest.raises(FileNotFoundError):
            validate_audio_file("non_existent_audio_file_123.wav")

        # Unsupported extension
        txt_tmp = tempfile.NamedTemporaryFile(suffix=".txt", delete=False)
        txt_tmp.write(b"hello world")
        txt_tmp.close()
        with pytest.raises(ValueError, match="Unsupported format"):
            validate_audio_file(txt_tmp.name)
        os.remove(txt_tmp.name)

        # 0-byte file
        empty_tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        empty_tmp.close()
        with pytest.raises(ValueError, match="empty"):
            validate_audio_file(empty_tmp.name)
        os.remove(empty_tmp.name)
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)


def test_load_and_preprocess_audio():
    """Verify resampling, mono downmix, and peak normalization."""
    sr = 22050  # non-standard sr
    sine = generate_sine_wave(freq=440.0, duration=1.0, sr=sr)
    # Stereo
    stereo = np.column_stack([sine, sine])
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sf.write(tmp.name, stereo, sr)
    tmp.close()

    try:
        y, target_sr, duration = load_and_preprocess_audio(tmp.name, target_sr=44100)
        assert target_sr == 44100
        assert y.ndim == 1  # mono
        assert pytest.approx(duration, 0.05) == 1.0
        assert pytest.approx(float(np.max(np.abs(y))), 0.01) == 0.95  # Peak normalized
    finally:
        os.remove(tmp.name)


# ---------------------------------------------------------------------------
# 2. DSP Baseline Unit Tests
# ---------------------------------------------------------------------------

def test_key_estimation_c_major():
    """Estimate C Major from synthetic C Major chord."""
    sr = 44100
    y = generate_synthetic_chord([261.63, 329.63, 392.00], duration=2.0, sr=sr)
    import librosa
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, n_octaves=7)
    detected_key = estimate_key(chroma)
    assert detected_key == "C Major"


def test_key_estimation_a_minor():
    """Estimate A Minor from synthetic A Minor chord."""
    sr = 44100
    y = generate_synthetic_chord([440.00, 523.25, 659.25], duration=2.0, sr=sr)
    import librosa
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, n_octaves=7)
    detected_key = estimate_key(chroma)
    assert detected_key == "A Minor"


def test_chord_progression_recognition():
    """Test recognition and segment merging on C -> G -> Am -> F."""
    wav_path = generate_progression_wav()
    try:
        result = analyze_basic(wav_path, task_id="test_chord_task")
        assert result["task_id"] == "test_chord_task"
        assert pytest.approx(result["bpm"], abs=5.0) == 120.0
        assert result["duration"] >= 7.9
        assert len(result["beats"]) > 0
        assert len(result["chords"]) > 0

        # Check detected chord sequence includes major landmarks
        detected_chords = [seg["chord"] for seg in result["chords"]]
        assert "C" in detected_chords
        assert "G" in detected_chords or "Am" in detected_chords
    finally:
        os.remove(wav_path)


def test_silence_handling():
    """Test graceful fallback on pure digital silence."""
    sr = 44100
    silence = np.zeros(sr * 2, dtype=np.float32)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    sf.write(tmp.name, silence, sr)
    tmp.close()

    try:
        result = analyze_basic(tmp.name, task_id="silence_task")
        assert result["bpm"] == 0.0
        assert result["key"] == "Unknown"
        assert result["chords"] == []
        assert result["beats"] == []
        assert pytest.approx(result["duration"], 0.1) == 2.0
    finally:
        os.remove(tmp.name)


def test_triad_templates_generation():
    """Test 24 triad templates structure and normalization."""
    templates, labels = generate_triad_templates()
    assert templates.shape == (24, 12)
    assert len(labels) == 24
    for i in range(24):
        norm = np.linalg.norm(templates[i])
        assert pytest.approx(norm, 1e-4) == 1.0


# ---------------------------------------------------------------------------
# 3. FastAPI Endpoints Integration Tests
# ---------------------------------------------------------------------------

def test_api_root():
    """Test GET / returns 200."""
    response = client.get("/")
    assert response.status_code == 200


def test_api_upload_and_analyze_workflow():
    """Test full upload -> analyze -> get audio workflow."""
    wav_path = generate_progression_wav()
    try:
        with open(wav_path, "rb") as f:
            upload_res = client.post(
                "/api/upload",
                files={"file": ("progression.wav", f, "audio/wav")}
            )
        assert upload_res.status_code == 200
        upload_data = upload_res.json()
        assert "task_id" in upload_data
        assert upload_data["filename"] == "progression.wav"
        assert upload_data["audio_url"].startswith("/api/audio/")

        task_id = upload_data["task_id"]

        # Analyze
        analyze_res = client.post(
            "/api/analyze/basic",
            json={"task_id": task_id}
        )
        assert analyze_res.status_code == 200
        analysis = analyze_res.json()
        assert analysis["task_id"] == task_id
        assert "bpm" in analysis
        assert "tempo" in analysis
        assert "key" in analysis
        assert "time_signature" in analysis
        assert "beats" in analysis
        assert "chords" in analysis
        assert isinstance(analysis["chords"], list)

        # Retrieve audio
        audio_res = client.get(f"/api/audio/{task_id}")
        assert audio_res.status_code == 200
        assert len(audio_res.content) > 0
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)


def test_api_upload_unsupported_format():
    """Test uploading invalid file format returns HTTP 400."""
    response = client.post(
        "/api/upload",
        files={"file": ("test.exe", b"executable bytes", "application/octet-stream")}
    )
    assert response.status_code == 400
    assert "Unsupported format" in response.json()["detail"]


def test_api_upload_empty_file():
    """Test uploading empty file returns HTTP 400."""
    response = client.post(
        "/api/upload",
        files={"file": ("empty.wav", b"", "audio/wav")}
    )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"]


def test_api_analyze_not_found():
    """Test analyzing non-existent task_id returns HTTP 404."""
    response = client.post(
        "/api/analyze/basic",
        json={"task_id": "non-existent-task-uuid-999"}
    )
    assert response.status_code == 404


def test_api_get_audio_not_found():
    """Test retrieving non-existent audio task_id returns HTTP 404."""
    response = client.get("/api/audio/non-existent-task-uuid-999")
    assert response.status_code == 404
