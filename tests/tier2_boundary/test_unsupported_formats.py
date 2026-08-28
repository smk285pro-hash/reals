"""
Tier 2 Boundary Tests: Unsupported Format Rejection.
Verifies that non-audio file extensions (.txt, .pdf, .exe, .json) are rejected with HTTP 400 or 422.
"""
import pytest
from fastapi.testclient import TestClient


@pytest.mark.tier2
@pytest.mark.parametrize("filename,mimetype", [
    ("notes.txt", "text/plain"),
    ("document.pdf", "application/pdf"),
    ("binary.exe", "application/octet-stream"),
    ("data.json", "application/json"),
])
def test_unsupported_extensions_rejected(client: TestClient, filename: str, mimetype: str):
    """Verifies that non-audio file uploads return HTTP 400 or 422 Bad Request."""
    dummy_payload = b"Hello, this is not an audio file."
    files = {"file": (filename, dummy_payload, mimetype)}
    
    response = client.post("/api/upload", files=files)
    assert response.status_code in [400, 422], f"Expected 400/422 for {filename}, got {response.status_code}"
