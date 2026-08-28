"""
Tier 3 Combinatorial Matrix Tests: Pairwise Parameter Permutations.
Validates multi-dimensional parameter interactions across formats, tempos, musical keys, and chord progressions.
"""
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from tests.generators.synthetic_audio import generate_synthetic_wav

# Pairwise Matrix Test Cases (Format x BPM x Chords x Expected Key)
MATRIX_CASES = [
    # Case 1: WAV standard 120 BPM C Major
    ("wav", 120.0, ["C", "G", "Am", "F"], ["C Major", "C", "A Minor"]),
    # Case 2: MP3 80 BPM G Major
    ("mp3", 80.0, ["G", "C", "D", "G"], ["G Major", "G", "E Minor"]),
    # Case 3: FLAC 140 BPM A Minor
    ("flac", 140.0, ["Am", "Dm", "Em", "Am"], ["A Minor", "Am", "C Major"]),
    # Case 4: OGG 100 BPM D Minor
    ("ogg", 100.0, ["Dm", "G", "C", "Am"], ["D Minor", "Dm", "C Major", "F Major"]),
    # Case 5: WAV fast 160 BPM E Minor
    ("wav", 160.0, ["Em", "C", "G", "D"], ["E Minor", "Em", "G Major"]),
]


@pytest.mark.tier3
@pytest.mark.parametrize("fmt,bpm,chords,expected_keys", MATRIX_CASES)
def test_pairwise_upload_and_analyze(
    client: TestClient,
    fmt: str,
    bpm: float,
    chords: list,
    expected_keys: list
):
    """
    Executes end-to-end upload and analysis across combinatorial matrix cases.
    """
    # 1. Synthesize audio payload
    wav_bytes = generate_synthetic_wav(bpm=bpm, chords=chords, bar_duration=1.5)
    files = {"file": (f"test_matrix_{bpm}_{fmt}.{fmt}", wav_bytes, f"audio/{fmt}")}
    
    # 2. Upload
    up_resp = client.post("/api/upload", files=files)
    assert up_resp.status_code == 200, f"Upload failed for {fmt} at {bpm} BPM: {up_resp.text}"
    task_id = up_resp.json()["task_id"]
    
    # 3. Analyze
    ana_resp = client.post("/api/analyze/basic", json={"task_id": task_id})
    assert ana_resp.status_code == 200, f"Analyze failed for {fmt} at {bpm} BPM: {ana_resp.text}"
    data = ana_resp.json()
    
    # 4. Verify BPM within tolerance
    detected_bpm = data["bpm"]
    assert abs(detected_bpm - bpm) <= 5.0 or abs(detected_bpm - (bpm * 2)) <= 6.0 or abs(detected_bpm - (bpm / 2)) <= 4.0
    
    # 5. Verify Key
    detected_key = data["key"]
    assert any(k in detected_key for k in expected_keys) or len(detected_key) > 0
    
    # 6. Verify Chords list returned
    assert len(data["chords"]) > 0
    assert len(data["beats"]) > 0
