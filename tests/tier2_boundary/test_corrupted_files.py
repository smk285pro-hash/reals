"""
Tier 2 Boundary Tests: Corrupted Audio Payloads & Malformed Headers.
Verifies that 0-byte files, truncated WAV headers, and random garbage byte streams are safely rejected.
"""
import os
import pytest
from fastapi.testclient import TestClient


@pytest.mark.tier2
def test_upload_empty_0byte_file(client: TestClient):
    """Verifies that uploading a 0-byte file returns HTTP 400 or 422 error."""
    files = {"file": ("empty.wav", b"", "audio/wav")}
    response = client.post("/api/upload", files=files)
    
    assert response.status_code in [400, 422], f"Expected 400/422 but got {response.status_code}: {response.text}"


@pytest.mark.tier2
def test_upload_truncated_wav_header(client: TestClient):
    """Verifies that uploading a file with only 8 bytes of header returns an error on upload or analysis."""
    truncated_header = b"RIFF\x00\x00\x00\x00"
    files = {"file": ("truncated.wav", truncated_header, "audio/wav")}
    
    response = client.post("/api/upload", files=files)
    if response.status_code == 200:
        # If upload allowed saving, analysis must reject decoding
        task_id = response.json()["task_id"]
        ana_resp = client.post("/api/analyze/basic", json={"task_id": task_id})
        assert ana_resp.status_code in [400, 422, 500]
    else:
        assert response.status_code in [400, 422]


@pytest.mark.tier2
def test_upload_garbage_binary_payload(client: TestClient):
    """Verifies that random non-audio binary data is rejected during analysis or upload."""
    garbage_bytes = os.urandom(2048)
    files = {"file": ("corrupt.wav", garbage_bytes, "audio/wav")}
    
    response = client.post("/api/upload", files=files)
    if response.status_code == 200:
        task_id = response.json()["task_id"]
        ana_resp = client.post("/api/analyze/basic", json={"task_id": task_id})
        assert ana_resp.status_code in [400, 422, 500]
    else:
        assert response.status_code in [400, 422]
