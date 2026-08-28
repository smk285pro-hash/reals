import io
import json
import sys
from pathlib import Path
import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.main import app

def run_stage2_tests():
    print("=== STARTING PHASE 2 ACCEPTANCE AUDIT ===", flush=True)
    with TestClient(app) as client:
        # Generate synthetic audio: C major triad (C4, E4, G4) followed by A minor triad (A3, C4, E4) with drum pulses
        sr = 44100
        duration_s = 4.0
        t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
        
        # Chord tones
        # C major: 261.63Hz (C4), 329.63Hz (E4), 392.00Hz (G4)
        c_chord = 0.3 * (np.sin(2 * np.pi * 261.63 * t) + np.sin(2 * np.pi * 329.63 * t) + np.sin(2 * np.pi * 392.00 * t))
        # Bass tone: 65.4Hz (C2)
        c_bass = 0.4 * np.sin(2 * np.pi * 65.41 * t)
        
        # Rhythm beat pulses (every 0.5s = 120 bpm)
        beat_pulses = np.zeros_like(t)
        for beat_idx in range(0, int(duration_s / 0.5)):
            beat_sample = int(beat_idx * 0.5 * sr)
            if beat_sample < len(t):
                pulse_len = int(0.05 * sr)
                beat_pulses[beat_sample:min(len(t), beat_sample + pulse_len)] += 0.5 * np.random.randn(min(len(t) - beat_sample, pulse_len))

        mix = c_chord + c_bass + beat_pulses
        mix = np.clip(mix, -1.0, 1.0)
        stereo = np.column_stack([mix, mix])

        wav_bytes = io.BytesIO()
        sf.write(wav_bytes, stereo, sr, format="WAV")
        wav_bytes.seek(0)

        # 1. Upload
        print("\n[TEST 1] POST /api/upload", flush=True)
        files = {"file": ("test_song.wav", wav_bytes.read(), "audio/wav")}
        res_upload = client.post("/api/upload", files=files)
        assert res_upload.status_code == 200
        task_id = res_upload.json()["task_id"]
        print(f"-> Uploaded task_id: {task_id}", flush=True)

        # 2. Trigger Deep Analysis
        print(f"\n[TEST 2] POST /api/analyze/deep/{task_id}?stem_mode=4", flush=True)
        res_deep = client.post(f"/api/analyze/deep/{task_id}?stem_mode=4")
        assert res_deep.status_code == 202
        assert res_deep.json()["status"] == "QUEUED"
        print("-> Deep analysis accepted (202 QUEUED)", flush=True)

        # 3. Stream SSE Progress
        print(f"\n[TEST 3] GET /api/progress/{task_id} (SSE)", flush=True)
        with client.stream("GET", f"/api/progress/{task_id}") as response:
            assert response.status_code == 200
            complete_received = False
            for line in response.iter_lines():
                if line:
                    if line.startswith("event: complete"):
                        complete_received = True
                    if line.startswith("data:") and complete_received:
                        data_str = line[len("data:"):].strip()
                        analysis_data = json.loads(data_str)
                        print("-> SSE Complete Event received!", flush=True)
                        print(f"   BPM: {analysis_data['telemetry']['bpm']}, Key: {analysis_data['telemetry']['master_key']} {analysis_data['telemetry']['scale_mode']}", flush=True)
                        print(f"   Decoded {len(analysis_data['chords'])} chord segments, {len(analysis_data['beats'])} beats", flush=True)
                        break

        assert complete_received, "Failed to receive SSE complete event"

        # 4. Check Stems & HTTP 206 Range
        print(f"\n[TEST 4] GET /api/stems/{task_id}/drums (HTTP 206 Range)", flush=True)
        res_stem = client.get(f"/api/stems/{task_id}/drums", headers={"Range": "bytes=0-1023"})
        assert res_stem.status_code == 206
        assert len(res_stem.content) == 1024
        print(f"-> Stem Range 206 OK (Length: {len(res_stem.content)})", flush=True)

        # 5. Export MIDI
        print(f"\n[TEST 5] GET /api/export/midi/{task_id}", flush=True)
        res_midi = client.get(f"/api/export/midi/{task_id}")
        assert res_midi.status_code == 200
        assert "audio/midi" in res_midi.headers.get("content-type", "")
        assert res_midi.content.startswith(b"MThd"), "Invalid MIDI header"
        print(f"-> MIDI export valid (Size: {len(res_midi.content)} bytes, header: MThd)", flush=True)

        # 6. Export Stems Zip
        print(f"\n[TEST 6] GET /api/export/stems-zip/{task_id}", flush=True)
        res_zip = client.get(f"/api/export/stems-zip/{task_id}")
        assert res_zip.status_code == 200
        assert "application/zip" in res_zip.headers.get("content-type", "")
        assert res_zip.content.startswith(b"PK\x03\x04"), "Invalid Zip header"
        print(f"-> Stems Zip export valid (Size: {len(res_zip.content)} bytes, header: PK)", flush=True)

        # 7. Export JSON
        print(f"\n[TEST 7] GET /api/export/json/{task_id}", flush=True)
        res_json = client.get(f"/api/export/json/{task_id}")
        assert res_json.status_code == 200
        json_body = res_json.json()
        assert json_body["task_id"] == task_id
        assert "telemetry" in json_body
        assert "chords" in json_body
        assert "stems" in json_body
        print(f"-> JSON export valid for task {task_id}", flush=True)

        # 8. Clean up Session
        print(f"\n[TEST 8] DELETE /api/session/{task_id}", flush=True)
        res_del = client.delete(f"/api/session/{task_id}")
        assert res_del.status_code == 200
        print("-> Session cleaned up successfully", flush=True)

        print("\n==========================================", flush=True)
        print(">>> ALL 8 PHASE 2 ACCEPTANCE TESTS PASSED 100% <<<", flush=True)
        print("==========================================", flush=True)

if __name__ == "__main__":
    run_stage2_tests()
