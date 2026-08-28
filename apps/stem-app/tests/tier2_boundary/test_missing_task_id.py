"""
Tier 2 Boundary Tests: Non-Existent & Invalid Task IDs.
Verifies that unknown or malformed task IDs return HTTP 404 Not Found or HTTP 422 Unprocessable Entity.
"""
import uuid
import pytest
from fastapi.testclient import TestClient


@pytest.mark.tier2
def test_analyze_nonexistent_task_id(client: TestClient):
    """Verifies that requesting analysis for a random non-existent task_id returns HTTP 404."""
    random_uuid = str(uuid.uuid4())
    response = client.post("/api/analyze/basic", json={"task_id": random_uuid})
    assert response.status_code == 404


@pytest.mark.tier2
def test_audio_stream_nonexistent_task_id(client: TestClient):
    """Verifies that streaming a non-existent task_id returns HTTP 404."""
    random_uuid = str(uuid.uuid4())
    response = client.get(f"/api/audio/{random_uuid}")
    assert response.status_code == 404


@pytest.mark.tier2
def test_analyze_malformed_task_id_string(client: TestClient):
    """Verifies that submitting a non-UUID malformed task_id returns HTTP 404 or 422."""
    response = client.post("/api/analyze/basic", json={"task_id": "invalid-uuid-string-12345"})
    assert response.status_code in [404, 422]


@pytest.mark.tier2
def test_analyze_empty_task_id(client: TestClient):
    """Verifies that submitting an empty task_id string returns HTTP 404 or 422."""
    response = client.post("/api/analyze/basic", json={"task_id": ""})
    assert response.status_code in [400, 404, 422]
