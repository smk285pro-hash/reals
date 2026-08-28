"""
Tier 1 Feature Tests: Audio Analysis Endpoint Verification (`POST /api/analyze/basic`).
Validates JSON schema, response keys, value types, and DSP extraction structure.
"""
import pytest
from fastapi.testclient import TestClient
from tests.generators.synthetic_audio import generate_synthetic_wav


@pytest.fixture(scope="function")
def uploaded_task_id(client: TestClient) -> str:
    """Helper fixture to upload a known test WAV and yield its task_id."""
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C", "G", "Am", "F"], bar_duration=1.5)
    files = {"file": ("analyze_fixture.wav", wav_bytes, "audio/wav")}
    res = client.post("/api/upload", files=files)
    assert res.status_code == 200, f"Upload fixture failed: {res.text}"
    return res.json()["task_id"]


@pytest.mark.tier1
def test_analyze_basic_success_schema(client: TestClient, uploaded_task_id: str):
    """Verifies that calling /api/analyze/basic returns HTTP 200 and all required schema fields."""
    payload = {"task_id": uploaded_task_id}
    response = client.post("/api/analyze/basic", json=payload)
    assert response.status_code == 200, f"Analyze request failed: {response.text}"
    
    data = response.json()
    required_keys = ["task_id", "bpm", "key", "time_signature", "beats", "chords"]
    for key in required_keys:
        assert key in data, f"Missing required response key: '{key}' in {data}"


@pytest.mark.tier1
def test_analyze_basic_bpm_field(client: TestClient, uploaded_task_id: str):
    """Verifies that the 'bpm' field is a positive float near expected 120 BPM."""
    payload = {"task_id": uploaded_task_id}
    response = client.post("/api/analyze/basic", json=payload)
    assert response.status_code == 200
    
    bpm = response.json()["bpm"]
    assert isinstance(bpm, (int, float))
    assert 110.0 <= bpm <= 130.0


@pytest.mark.tier1
def test_analyze_basic_key_field(client: TestClient, uploaded_task_id: str):
    """Verifies that the 'key' field is a non-empty string."""
    payload = {"task_id": uploaded_task_id}
    response = client.post("/api/analyze/basic", json=payload)
    assert response.status_code == 200
    
    key = response.json()["key"]
    assert isinstance(key, str)
    assert len(key.strip()) > 0


@pytest.mark.tier1
def test_analyze_basic_time_signature_field(client: TestClient, uploaded_task_id: str):
    """Verifies that 'time_signature' field contains standard meter (e.g. '4/4' or '3/4')."""
    payload = {"task_id": uploaded_task_id}
    response = client.post("/api/analyze/basic", json=payload)
    assert response.status_code == 200
    
    meter = response.json()["time_signature"]
    assert isinstance(meter, str)
    assert meter in ["4/4", "3/4", "6/8", "2/4"]


@pytest.mark.tier1
def test_analyze_basic_beats_list(client: TestClient, uploaded_task_id: str):
    """Verifies that 'beats' is a non-empty list of sorted positive timestamps."""
    payload = {"task_id": uploaded_task_id}
    response = client.post("/api/analyze/basic", json=payload)
    assert response.status_code == 200
    
    beats = response.json()["beats"]
    assert isinstance(beats, list)
    assert len(beats) > 0
    for i in range(len(beats)):
        assert isinstance(beats[i], (int, float))
        assert beats[i] >= 0.0
        if i > 0:
            assert beats[i] >= beats[i-1]


@pytest.mark.tier1
def test_analyze_basic_chords_list_structure(client: TestClient, uploaded_task_id: str):
    """Verifies that 'chords' is a list of chord dictionaries with 'start', 'end', 'chord' keys."""
    payload = {"task_id": uploaded_task_id}
    response = client.post("/api/analyze/basic", json=payload)
    assert response.status_code == 200
    
    chords = response.json()["chords"]
    assert isinstance(chords, list)
    assert len(chords) > 0
    for seg in chords:
        assert "start" in seg and isinstance(seg["start"], (int, float))
        assert "end" in seg and isinstance(seg["end"], (int, float))
        assert "chord" in seg and isinstance(seg["chord"], str)
        assert seg["start"] <= seg["end"]
