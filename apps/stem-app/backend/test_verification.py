import io
import sys
from pathlib import Path
import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.main import app

def run_acceptance_tests():
    print("=== STARTING PHASE 1 ACCEPTANCE AUDIT ===", flush=True)
    with TestClient(app) as client:
        # 1. Health check
        print("\n[TEST 1] GET /api/health", flush=True)
        res = client.get("/api/health")
        print(f"Status: {res.status_code}, Response: {res.json()}", flush=True)
        assert res.status_code == 200
        assert res.json()["status"] == "ok"
        assert "gpu_available" in res.json()
        assert res.json()["version"] == "2026.1.0"
        print("-> PASS: Health check", flush=True)

        # Generate synthetic audio for testing (440Hz A4 sine tone, 2.5 seconds, 44100Hz stereo)
        sr = 44100
        duration_s = 2.5
        t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
        tone = 0.5 * np.sin(2 * np.pi * 440 * t)
        audio_stereo = np.column_stack([tone, tone])
        
        wav_bytes = io.BytesIO()
        sf.write(wav_bytes, audio_stereo, sr, format="WAV")
        wav_bytes.seek(0)

        # 2. Upload
        print("\n[TEST 2] POST /api/upload", flush=True)
        files = {"file": ("baitest.wav", wav_bytes.read(), "audio/wav")}
        res = client.post("/api/upload", files=files)
        print(f"Status: {res.status_code}, Response: {res.json()}", flush=True)
        assert res.status_code == 200
        data = res.json()
        task_id = data["task_id"]
        assert data["status"] == "QUEUED"
        assert abs(data["duration"] - duration_s) < 0.1
        assert data["waveform_url"] == f"/api/waveform/{task_id}"
        assert data["audio_url"] == f"/api/audio/{task_id}"
        print(f"-> PASS: Upload test (task_id={task_id})", flush=True)

        # 3. Waveform
        print(f"\n[TEST 3] GET /api/waveform/{task_id}", flush=True)
        res = client.get(f"/api/waveform/{task_id}")
        print(f"Status: {res.status_code}, Peak count: {len(res.json())}", flush=True)
        assert res.status_code == 200
        peaks = res.json()
        assert len(peaks) == 2000
        assert len(peaks[0]) == 2
        print(f"Sample peak [0]: {peaks[0]}", flush=True)
        print("-> PASS: Waveform peaks test", flush=True)

        # 4. Audio streaming & Range header
        print(f"\n[TEST 4] GET /api/audio/{task_id} (Full & Partial Range)", flush=True)
        res_full = client.get(f"/api/audio/{task_id}")
        assert res_full.status_code == 200
        assert "audio/wav" in res_full.headers.get("content-type", "")
        total_len = len(res_full.content)
        print(f"Full audio status: {res_full.status_code}, Size: {total_len} bytes", flush=True)

        range_headers = {"Range": "bytes=0-1023"}
        res_range = client.get(f"/api/audio/{task_id}", headers=range_headers)
        print(f"Range 0-1023 status: {res_range.status_code}, Length: {len(res_range.content)}, Content-Range: {res_range.headers.get('content-range')}", flush=True)
        assert res_range.status_code == 206
        assert len(res_range.content) == 1024
        assert res_range.headers.get("accept-ranges") == "bytes"
        assert res_range.headers.get("content-range") == f"bytes 0-1023/{total_len}"
        print("-> PASS: Audio HTTP 206 Range test", flush=True)

        # 5. Quick Analysis
        print(f"\n[TEST 5] POST /api/analyze/quick/{task_id}", flush=True)
        res_quick = client.post(f"/api/analyze/quick/{task_id}")
        print(f"Status: {res_quick.status_code}, Response: {res_quick.json()}", flush=True)
        assert res_quick.status_code == 200
        analysis = res_quick.json()
        assert "bpm" in analysis
        assert "master_key" in analysis
        assert "scale_mode" in analysis
        assert "duration" in analysis
        print(f"-> PASS: Quick analysis test (Key: {analysis['master_key']} {analysis['scale_mode']}, BPM: {analysis['bpm']})", flush=True)

        # 6. Delete Session
        print(f"\n[TEST 6] DELETE /api/session/{task_id}", flush=True)
        res_del = client.delete(f"/api/session/{task_id}")
        print(f"Status: {res_del.status_code}, Response: {res_del.json()}", flush=True)
        assert res_del.status_code == 200
        assert res_del.json()["status"] == "deleted"

        res_after = client.get(f"/api/waveform/{task_id}")
        assert res_after.status_code == 404
        print("-> PASS: Session deletion and cleanup test", flush=True)

        print("\n==========================================", flush=True)
        print(">>> ALL 6 ACCEPTANCE TESTS PASSED 100% <<<", flush=True)
        print("==========================================", flush=True)

if __name__ == "__main__":
    run_acceptance_tests()
