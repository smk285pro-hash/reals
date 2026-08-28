"""
Unit & Integration Tests for SOTA 2026 Deep Engine & API (Phase 2).
"""

import os
import shutil
import tempfile
import numpy as np
import soundfile as sf
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from app.core.deep_engine import (
    UnifiedDeepMusicAnalyzer,
    CHORD_VOCABULARY,
    CHORD_TEMPLATE_MATRIX,
    PROGRESS_TRACKER
)
from tests.generators.synthetic_audio import (
    generate_synthetic_wav,
    generate_rhythm_clicks,
    generate_triad_audio
)

client = TestClient(app)


@pytest.fixture(scope="module")
def temp_test_env():
    temp_dir = Path(tempfile.mkdtemp(prefix="test_deep_engine_"))
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


def test_chord_vocabulary_170_plus():
    """Verifies that the extended chord vocabulary contains at least 170 chord types."""
    assert len(CHORD_VOCABULARY) >= 170, f"Expected >= 170 chords, got {len(CHORD_VOCABULARY)}"
    assert CHORD_TEMPLATE_MATRIX.shape[0] == len(CHORD_VOCABULARY)
    assert CHORD_TEMPLATE_MATRIX.shape[1] == 12

    # Check key representative chords
    expected_sample_chords = ["C", "Cm", "C7", "Cmaj7", "Cm7", "Csus4", "C9", "C11", "Cdim", "Caug", "N.C."]
    for c in expected_sample_chords:
        assert c in CHORD_VOCABULARY, f"Chord {c} missing from vocabulary"


def test_stem_demixing_pipeline(temp_test_env):
    """Tests 4-stem demixing producing vocals, drums, bass, other."""
    audio_path = str(temp_test_env / "test_synth.wav")
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C", "G", "Am", "F"], bar_duration=1.0)
    with open(audio_path, "wb") as f:
        f.write(wav_bytes)

    analyzer = UnifiedDeepMusicAnalyzer(device="cpu")
    out_dir = temp_test_env / "stems_output"
    stems = analyzer.separate_stems(audio_path, out_dir)

    for stem_name in ["vocals", "drums", "bass", "other"]:
        assert stem_name in stems
        p = Path(stems[stem_name])
        assert p.exists(), f"Stem {stem_name} file not created: {p}"
        assert p.stat().st_size > 1024, f"Stem {stem_name} file too small"


def test_rhythm_and_downbeat_tracking(temp_test_env):
    """Tests rhythm tracking with downbeat estimation on 4/4 meter."""
    audio_4_4 = str(temp_test_env / "track_4_4.wav")
    clicks = generate_rhythm_clicks(bpm=120.0, duration=6.0, accent_first=True, beats_per_bar=4)
    sf.write(audio_4_4, clicks, 44100)

    analyzer = UnifiedDeepMusicAnalyzer(device="cpu")
    y, sr = sf.read(audio_4_4, dtype='float32')

    bpm, beats, downbeats, time_sig = analyzer.track_rhythm(audio_4_4, y, sr)
    assert 110.0 <= bpm <= 130.0
    assert len(beats) >= 6
    assert len(downbeats) >= 1
    assert time_sig in ["4/4", "3/4"]


def test_viterbi_chord_decoding_and_inversions(temp_test_env):
    """Tests beat-synchronous pooling and Viterbi HMM decoding."""
    audio_path = str(temp_test_env / "progression.wav")
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C", "G", "Am", "F"], bar_duration=1.5)
    with open(audio_path, "wb") as f:
        f.write(wav_bytes)

    analyzer = UnifiedDeepMusicAnalyzer(device="cpu")
    y, sr = sf.read(audio_path, dtype='float32')
    stems = analyzer.separate_stems(audio_path, temp_test_env / "stems_viterbi")

    _, beats, _, _ = analyzer.track_rhythm(stems["drums"], y, sr)
    pooled_chroma, bass_notes, chroma_mean = analyzer.extract_harmony_and_bass(
        bass_path=stems["bass"],
        other_path=stems["other"],
        beat_times=beats,
        sr=sr,
        duration=6.0
    )

    master_key, chords = analyzer.decode_chords_viterbi(
        pooled_chroma=pooled_chroma,
        bass_notes=bass_notes,
        beat_times=beats,
        chroma_mean=chroma_mean,
        duration=6.0
    )

    assert "Major" in master_key or "Minor" in master_key
    assert len(chords) >= 1
    for seg in chords:
        assert "start" in seg
        assert "end" in seg
        assert "chord" in seg
        assert seg["end"] > seg["start"]


def test_api_analyze_deep_and_stems_endpoints(temp_test_env):
    """Tests end-to-end API upload, POST /api/analyze/deep, and GET /api/audio/{task_id}/{stem}."""
    test_wav = str(temp_test_env / "upload_test.wav")
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C", "G"], bar_duration=1.0)
    with open(test_wav, "wb") as f:
        f.write(wav_bytes)

    with open(test_wav, "rb") as f:
        upload_resp = client.post("/api/upload", files={"file": ("upload_test.wav", f, "audio/wav")})
    assert upload_resp.status_code == 200
    task_id = upload_resp.json()["task_id"]

    # Trigger Deep Analysis
    deep_resp = client.post("/api/analyze/deep", json={"task_id": task_id})
    assert deep_resp.status_code == 200
    data = deep_resp.json()

    assert data["task_id"] == task_id
    assert "stems" in data
    assert "vocals" in data["stems"]
    assert "drums" in data["stems"]
    assert "bass" in data["stems"]
    assert "other" in data["stems"]
    assert len(data["chords"]) >= 1

    # Verify individual stem streaming
    for stem_name in ["vocals", "drums", "bass", "other"]:
        stem_resp = client.get(f"/api/audio/{task_id}/{stem_name}")
        assert stem_resp.status_code == 200, f"Failed streaming stem {stem_name}: {stem_resp.status_code}"
        assert stem_resp.headers["content-type"] == "audio/wav"
        assert len(stem_resp.content) > 1024


def test_progress_tracker_subscribe_and_update():
    """Tests thread-safe progress tracker pub/sub."""
    test_task = "test-task-uuid-1234"
    q = PROGRESS_TRACKER.subscribe(test_task)

    PROGRESS_TRACKER.set_progress(test_task, "test_step", 50, "Testing progress...")
    payload = q.get(timeout=2.0)
    assert payload["task_id"] == test_task
    assert payload["percent"] == 50
    assert payload["message"] == "Testing progress..."

    PROGRESS_TRACKER.unsubscribe(test_task, q)
