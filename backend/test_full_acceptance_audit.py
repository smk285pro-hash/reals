import asyncio
import io
import json
import os
import sys
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
import time
import zipfile
from pathlib import Path

import httpx
import mido
import numpy as np
import soundfile as sf

BASE_URL = "http://127.0.0.1:3031"


def create_test_song(filepath: Path, duration: float = 4.0, sr: int = 44100):
    """Generate a high-quality test audio signal with distinct musical frequencies."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # Bass (110Hz - A2), Chord (440Hz A4 + 554Hz C#5 + 659Hz E5), Drums click at 120BPM (every 0.5s)
    harmony = 0.3 * np.sin(2 * np.pi * 440 * t) + 0.2 * np.sin(2 * np.pi * 554 * t) + 0.2 * np.sin(2 * np.pi * 659 * t)
    bass = 0.4 * np.sin(2 * np.pi * 110 * t)
    
    # Add beat clicks
    clicks = np.zeros_like(t)
    click_interval = int(0.5 * sr)
    for idx in range(0, len(t), click_interval):
        end_idx = min(idx + int(0.02 * sr), len(t))
        clicks[idx:end_idx] = 0.5 * np.sin(2 * np.pi * 1000 * np.linspace(0, 0.02, end_idx - idx))

    left = harmony + bass + clicks
    right = harmony + bass + clicks
    stereo = np.column_stack([left, right]).astype(np.float32)
    sf.write(str(filepath), stereo, sr)


async def run_full_acceptance():
    print("=" * 60)
    print("AI AUDIO LAB 2026 — TOÀN DIỆN KIỂM TRA & NGHIỆM THU HỆ THỐNG")
    print("=" * 60)

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=180.0) as client:
        # 1. Health check
        print("\n[STEP 1/11] Kiểm tra sức khỏe hệ thống (GET /api/health)...")
        res = await client.get("/api/health")
        assert res.status_code == 200, f"Health check failed: {res.text}"
        health_data = res.json()
        print(f" -> Trạng thái: {health_data['status'].upper()}, Phiên bản: {health_data.get('version')}, GPU khả dụng: {health_data.get('gpu_available')}")

        # 2. Upload Audio
        print("\n[STEP 2/11] Upload và chuẩn hóa EBU R128 (POST /api/upload)...")
        temp_audio = Path("temp_acceptance_song.wav")
        create_test_song(temp_audio, duration=4.0)

        with open(temp_audio, "rb") as f:
            files = {"file": ("test_acceptance.wav", f, "audio/wav")}
            res = await client.post("/api/upload", files=files)
        
        if temp_audio.exists():
            temp_audio.unlink()

        assert res.status_code == 200, f"Upload failed: {res.text}"
        upload_data = res.json()
        task_id = upload_data["task_id"]
        duration = upload_data["duration"]
        print(f" -> Task ID: {task_id}")
        print(f" -> Thời lượng chuẩn hóa: {duration}s")
        print(f" -> Waveform URL: {upload_data['waveform_url']}")

        # 3. HTTP 206 Range Audio Streaming
        print("\n[STEP 3/11] Kiểm tra Streaming Master Audio HTTP 206 (GET /api/audio/{id})...")
        headers = {"Range": "bytes=0-2047"}
        res = await client.get(f"/api/audio/{task_id}", headers=headers)
        assert res.status_code == 206, f"Range streaming failed: {res.status_code}"
        assert len(res.content) == 2048, f"Expected 2048 bytes, got {len(res.content)}"
        assert "Content-Range" in res.headers
        print(f" -> Stream thành công: 2048 bytes (Content-Range: {res.headers['Content-Range']})")

        # 4. Waveform Peaks
        print("\n[STEP 4/11] Kiểm tra dữ liệu Waveform 2000 đỉnh (GET /api/waveform/{id})...")
        res = await client.get(f"/api/waveform/{task_id}")
        assert res.status_code == 200, f"Waveform failed: {res.text}"
        peaks = res.json()
        assert len(peaks) == 2000, f"Expected 2000 peaks, got {len(peaks)}"
        print(f" -> Nhận đủ {len(peaks)} cặp [min, max] chuẩn hóa để render Canvas UI.")

        # 5. Quick Telemetry Analysis
        print("\n[STEP 5/11] Phân tích nhanh Telemetry <2s (POST /api/analyze/quick/{id})...")
        t0 = time.perf_counter()
        res = await client.post(f"/api/analyze/quick/{task_id}")
        t1 = time.perf_counter()
        assert res.status_code == 200, f"Quick analysis failed: {res.text}"
        quick_data = res.json()
        print(f" -> Thời gian xử lý: {round(t1 - t0, 3)}s")
        print(f" -> BPM: {quick_data['bpm']}, Key: {quick_data['master_key']} {quick_data['scale_mode']}")

        # 6. Deep Analysis Mode 6 (htdemucs_6s) & SSE Tracking
        print("\n[STEP 6/11] Khởi chạy Deep Analysis Mode 6 Stems (POST /api/analyze/deep/{id}?stem_mode=6)...")
        res = await client.post(f"/api/analyze/deep/{task_id}?stem_mode=6")
        assert res.status_code == 202, f"Deep analysis trigger failed: {res.text}"

        print("\n[STEP 7/11] Lắng nghe tiến trình thời gian thực SSE (GET /api/progress/{id})...")
        deep_result = None
        async with client.stream("GET", f"/api/progress/{task_id}") as response:
            buffer = ""
            async for chunk in response.aiter_text():
                buffer += chunk
                while "\n\n" in buffer:
                    event_str, buffer = buffer.split("\n\n", 1)
                    lines = event_str.strip().split("\n")
                    event_type = ""
                    data_str = ""
                    for line in lines:
                        if line.startswith("event:"):
                            event_type = line[len("event:"):].strip()
                        elif line.startswith("data:"):
                            data_str = line[len("data:"):].strip()
                    
                    if event_type == "progress":
                        p_data = json.loads(data_str)
                        print(f"    [SSE] {p_data.get('percent')}% — {p_data.get('stage')}")
                    elif event_type == "complete":
                        deep_result = json.loads(data_str)
                        print(f"    [SSE] 100% — HOÀN TẤT!")
                        break
                    elif event_type == "error":
                        raise RuntimeError(f"SSE Error: {data_str}")
                if deep_result is not None:
                    break

        assert deep_result is not None, "Không nhận được kết quả Deep Analysis hoàn chỉnh qua SSE!"
        telemetry = deep_result["telemetry"]
        stems_manifest = deep_result["stems"]
        chords = deep_result["chords"]
        beats = deep_result["beats"]

        print(f" -> Telemetry: {telemetry['bpm']} BPM, Key {telemetry['master_key']} {telemetry['scale_mode']}, Nhịp {telemetry['time_signature']}")
        print(f" -> Số hợp âm giải mã (Viterbi 169-state): {len(chords)}")
        print(f" -> Số phách & downbeats: {len(beats)}")
        print(f" -> Danh sách Stems ({len(stems_manifest['stems'])}): {list(stems_manifest['stems'].keys())}")

        # 7. Check All Stems Audio (HTTP 206)
        print("\n[STEP 8/11] Kiểm tra Streaming tất cả các file Stems WAV đã tách...")
        for stem_name in stems_manifest["stems"]:
            stem_res = await client.get(f"/api/stems/{task_id}/{stem_name}", headers={"Range": "bytes=0-1023"})
            assert stem_res.status_code == 206, f"Stem {stem_name} failed: {stem_res.status_code}"
            assert len(stem_res.content) == 1024
            print(f"    - Stem '{stem_name}': OK (1024 bytes verified)")

        # 8. Verify Multi-track MIDI Export
        print("\n[STEP 9/11] Nghiệm thu file MIDI SMF-1 đa track (GET /api/export/midi/{id})...")
        midi_res = await client.get(f"/api/export/midi/{task_id}")
        assert midi_res.status_code == 200, f"MIDI export failed: {midi_res.status_code}"
        midi_bytes = midi_res.content
        assert midi_bytes[:4] == b"MThd", "Invalid MIDI header"

        # Parse with mido
        midi_file = mido.MidiFile(file=io.BytesIO(midi_bytes))
        print(f" -> MIDI Format: SMF Type {midi_file.type}, PPQ: {midi_file.ticks_per_beat}, Tổng số Track: {len(midi_file.tracks)}")
        for idx, tr in enumerate(midi_file.tracks):
            notes = [msg for msg in tr if msg.type in ("note_on", "note_off")]
            prog = [msg for msg in tr if msg.type == "program_change"]
            prog_val = prog[0].program if prog else "None/Drums"
            print(f"    * Track {idx+1} '{tr.name}': Program={prog_val}, Events={len(tr)}, Notes={len(notes)}")

        # 9. Verify Stems ZIP Export
        print("\n[STEP 10/11] Nghiệm thu xuất file nén ZIP Stems (GET /api/export/stems-zip/{id})...")
        zip_res = await client.get(f"/api/export/stems-zip/{task_id}")
        assert zip_res.status_code == 200, f"ZIP export failed: {zip_res.status_code}"
        assert zip_res.content[:2] == b"PK", "Invalid ZIP header"
        with zipfile.ZipFile(io.BytesIO(zip_res.content), "r") as zf:
            zip_names = zf.namelist()
            print(f" -> File ZIP hợp lệ, dung lượng {len(zip_res.content)} bytes, chứa {len(zip_names)} files: {zip_names}")

        # 10. Verify Full JSON Export
        print("\n[STEP 11/11] Nghiệm thu xuất JSON phân tích & Dọn dẹp session...")
        json_res = await client.get(f"/api/export/json/{task_id}")
        assert json_res.status_code == 200, f"JSON export failed: {json_res.status_code}"
        exported_json = json_res.json()
        assert exported_json["task_id"] == task_id
        print(f" -> Export JSON thành công.")

        # Cleanup
        del_res = await client.delete(f"/api/session/{task_id}")
        assert del_res.status_code == 200
        print(f" -> Session {task_id} đã được xóa và giải phóng hoàn toàn.")

    print("\n" + "=" * 60)
    print(">>> 100% TẤT CẢ 11 HẠNG MỤC NGHIỆM THU ĐÃ PASS XUẤT SẮC <<<")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_full_acceptance())
