"""
Tier 4 Real-World Application Scenario Tests: Complete End-to-End User Workflows.
Simulates full client lifecycle: Ingestion -> Storage Verification -> Partial Stream -> DSP Analysis -> Frontend DOM.
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from tests.generators.synthetic_audio import generate_synthetic_wav, generate_meter_audio


@pytest.mark.tier4
def test_full_user_journey_pop_progression(client: TestClient):
    """
    Scenario 1: Complete User Journey for Pop Song Ingestion (120 BPM, C Major, C-G-Am-F).
    """
    # Step 1: Synthesize ground-truth 120 BPM C-G-Am-F 8-second audio
    wav_bytes = generate_synthetic_wav(bpm=120.0, chords=["C", "G", "Am", "F"], bar_duration=2.0)
    files = {"file": ("radio_hit.wav", wav_bytes, "audio/wav")}
    
    # Step 2: Upload Audio
    upload_response = client.post("/api/upload", files=files)
    assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
    up_data = upload_response.json()
    task_id = up_data["task_id"]
    assert task_id is not None
    assert uuid.UUID(task_id, version=4)
    
    # Step 3: Stream Audio with Range Seeking Request
    stream_response = client.get(f"/api/audio/{task_id}", headers={"Range": "bytes=0-4096"})
    assert stream_response.status_code in [200, 206]
    assert len(stream_response.content) > 0
    
    # Step 4: Execute DSP Analysis Pipeline
    analyze_response = client.post("/api/analyze/basic", json={"task_id": task_id})
    assert analyze_response.status_code == 200, f"Analyze failed: {analyze_response.text}"
    mir_data = analyze_response.json()
    
    # Validate MIR metrics
    assert abs(mir_data["bpm"] - 120.0) <= 3.0
    assert mir_data["key"] in ["C Major", "C", "A Minor"]
    assert mir_data["time_signature"] in ["4/4", "3/4"]
    assert len(mir_data["beats"]) >= 10
    assert len(mir_data["chords"]) >= 3
    
    # Step 5: Request Web Studio SPA HTML & Validate Component DOM
    spa_response = client.get("/")
    assert spa_response.status_code == 200
    html = spa_response.text
    
    # Verify Studio Header & Branding
    assert "AI Audio Lab" in html or "AI AUDIO LAB" in html


@pytest.mark.tier4
def test_full_user_journey_waltz_progression(client: TestClient):
    """
    Scenario 2: Complete User Journey for 3/4 Waltz Audio Ingestion (90 BPM, G Major).
    """
    wav_bytes = generate_meter_audio(bpm=90.0, meter="3/4", bars=6)
    files = {"file": ("waltz_allegro.wav", wav_bytes, "audio/wav")}
    
    upload_resp = client.post("/api/upload", files=files)
    assert upload_resp.status_code == 200
    task_id = upload_resp.json()["task_id"]
    
    analyze_resp = client.post("/api/analyze/basic", json={"task_id": task_id})
    assert analyze_resp.status_code == 200
    data = analyze_resp.json()
    
    # Verify Tempo & Meter
    assert abs(data["bpm"] - 90.0) <= 4.0 or abs(data["bpm"] - 180.0) <= 5.0
    assert data["time_signature"] in ["3/4", "4/4"]


@pytest.mark.tier4
def test_multi_session_storage_isolation(client: TestClient):
    """
    Scenario 3: Verifies multi-track upload isolation and distinct storage persistence.
    """
    tasks = []
    for i, chord in enumerate(["C", "Am", "F"]):
        wav_bytes = generate_synthetic_wav(bpm=100.0 + (i * 20.0), chords=[chord], bar_duration=1.0)
        files = {"file": (f"session_track_{i}.wav", wav_bytes, "audio/wav")}
        res = client.post("/api/upload", files=files)
        assert res.status_code == 200
        tasks.append(res.json()["task_id"])
        
    # All task IDs must be unique
    assert len(set(tasks)) == len(tasks)
    
    # Each task audio is streamable independently
    for t_id in tasks:
        resp = client.get(f"/api/audio/{t_id}")
        assert resp.status_code in [200, 206]
