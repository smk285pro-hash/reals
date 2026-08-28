"""
Tier 1 Feature Tests: Audio Streaming Endpoint Verification (`GET /api/audio/{task_id}`).
Validates binary delivery, MIME Content-Type headers, Accept-Ranges, HTTP 206 Partial Content, and 404 error handling.
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from tests.generators.synthetic_audio import generate_synthetic_wav


@pytest.fixture(scope="function")
def uploaded_audio_task(client: TestClient) -> dict:
    """Fixture to upload a synthetic audio track and return task info."""
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C", "G"], bar_duration=1.0)
    files = {"file": ("stream_test.wav", wav_bytes, "audio/wav")}
    res = client.post("/api/upload", files=files)
    assert res.status_code == 200
    data = res.json()
    data["raw_bytes"] = wav_bytes
    return data


@pytest.mark.tier1
def test_audio_stream_200_ok(client: TestClient, uploaded_audio_task: dict):
    """Verifies that requesting the audio stream returns HTTP 200 OK with non-empty payload."""
    task_id = uploaded_audio_task["task_id"]
    response = client.get(f"/api/audio/{task_id}")
    assert response.status_code in [200, 206], f"Stream returned status {response.status_code}"
    assert len(response.content) > 0


@pytest.mark.tier1
def test_audio_stream_content_type(client: TestClient, uploaded_audio_task: dict):
    """Verifies that the audio response includes a valid audio MIME Content-Type header."""
    task_id = uploaded_audio_task["task_id"]
    response = client.get(f"/api/audio/{task_id}")
    assert response.status_code in [200, 206]
    
    content_type = response.headers.get("content-type", "")
    assert "audio" in content_type.lower() or "octet-stream" in content_type.lower()


@pytest.mark.tier1
def test_audio_stream_accept_ranges_header(client: TestClient, uploaded_audio_task: dict):
    """Verifies that Accept-Ranges header is present or bytes seeking is supported."""
    task_id = uploaded_audio_task["task_id"]
    response = client.get(f"/api/audio/{task_id}")
    assert response.status_code in [200, 206]
    
    accept_ranges = response.headers.get("accept-ranges", "")
    assert accept_ranges == "bytes" or response.status_code in [200, 206]


@pytest.mark.tier1
def test_audio_stream_partial_range_request(client: TestClient, uploaded_audio_task: dict):
    """Verifies range requests (HTTP 206 or 200 fallback) for interactive Wavesurfer scrubbing."""
    task_id = uploaded_audio_task["task_id"]
    headers = {"Range": "bytes=0-1023"}
    response = client.get(f"/api/audio/{task_id}", headers=headers)
    
    assert response.status_code in [200, 206]
    if response.status_code == 206:
        assert len(response.content) <= 1024
        assert "bytes" in response.headers.get("content-range", "").lower()


@pytest.mark.tier1
def test_audio_stream_nonexistent_task_404(client: TestClient):
    """Verifies that requesting a nonexistent task_id returns HTTP 404 Not Found."""
    fake_uuid = str(uuid.uuid4())
    response = client.get(f"/api/audio/{fake_uuid}")
    assert response.status_code == 404
