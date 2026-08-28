"""
Tier 1 Feature Tests: Audio File Upload Endpoint Verification (`POST /api/upload`).
Validates multipart form upload, task UUID generation, audio_url format, file persistence, and multi-format support.
"""
import uuid
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from tests.generators.synthetic_audio import generate_synthetic_wav


@pytest.mark.tier1
def test_upload_wav_success(client: TestClient):
    """Verifies that uploading a valid WAV audio file returns HTTP 200 and expected schema keys."""
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C", "G"], bar_duration=1.0)
    files = {"file": ("test_track.wav", wav_bytes, "audio/wav")}
    
    response = client.post("/api/upload", files=files)
    assert response.status_code == 200, f"Upload failed with status {response.status_code}: {response.text}"
    
    data = response.json()
    assert "task_id" in data
    assert "audio_url" in data


@pytest.mark.tier1
def test_upload_task_id_uuid4_format(client: TestClient):
    """Verifies that the generated task_id is a valid UUIDv4 string."""
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C"], bar_duration=1.0)
    files = {"file": ("sample.wav", wav_bytes, "audio/wav")}
    
    response = client.post("/api/upload", files=files)
    assert response.status_code == 200
    
    data = response.json()
    task_id = data["task_id"]
    # Must be parsable as a standard UUID
    parsed_uuid = uuid.UUID(task_id, version=4)
    assert str(parsed_uuid) == task_id


@pytest.mark.tier1
def test_upload_audio_url_format(client: TestClient):
    """Verifies that audio_url contains the task_id or valid endpoint path."""
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C"], bar_duration=1.0)
    files = {"file": ("beat.wav", wav_bytes, "audio/wav")}
    
    response = client.post("/api/upload", files=files)
    assert response.status_code == 200
    
    data = response.json()
    audio_url = data.get("audio_url", "")
    task_id = data["task_id"]
    assert task_id in audio_url or "/api/audio/" in audio_url or "/storage/" in audio_url


@pytest.mark.tier1
def test_upload_persists_file(client: TestClient):
    """Verifies that uploaded audio is stored and subsequent streaming endpoint can find it."""
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C"], bar_duration=1.0)
    files = {"file": ("persist_test.wav", wav_bytes, "audio/wav")}
    
    response = client.post("/api/upload", files=files)
    assert response.status_code == 200
    task_id = response.json()["task_id"]
    
    # Check if stream endpoint serves the file
    stream_resp = client.get(f"/api/audio/{task_id}")
    assert stream_resp.status_code in [200, 206]
    assert len(stream_resp.content) > 0


@pytest.mark.tier1
@pytest.mark.parametrize("extension", ["wav", "mp3", "flac", "ogg", "m4a"])
def test_upload_supported_audio_extensions(client: TestClient, extension: str):
    """Verifies that all supported audio extensions (.wav, .mp3, .flac, .ogg, .m4a) are accepted."""
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C"], bar_duration=0.5)
    files = {"file": (f"audio_track.{extension}", wav_bytes, f"audio/{extension}")}
    
    response = client.post("/api/upload", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "task_id" in data
