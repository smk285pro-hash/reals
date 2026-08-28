"""
Adversarial Stress Test Suite - Challenger 2
Milestone 1: Backend Architecture & DSP Baseline Engine
Covers:
1. /api/upload:
   - Unsupported file extensions (.exe, .txt, .pdf, .py, .sh, .zip, etc.)
   - Empty files (0 bytes)
   - Oversized files (>50MB)
   - Corrupted audio headers / random byte streams
   - Non-ASCII, Unicode, emoji, and special character filenames
   - Path separators and traversal in uploaded filename (subfolder/test.wav, ..\\test.wav)
2. /api/analyze/basic:
   - Non-existent task_id (UUID and arbitrary strings)
   - Glob injection in task_id ("*", "?", "[a-z]")
   - Invalid JSON bodies (missing task_id, malformed fields, wrong data types, nulls)
   - Path traversal in file_path (../../app/main.py, /etc/passwd, C:/Windows/win.ini)
3. GET /api/audio/{task_id}:
   - Non-existent task_id
   - Path traversal task_ids (e.g. ../../app/main.py, ..\\main.py, ..\\PROJECT.md)
   - Glob wildcard task_ids ("*", "?")
4. Concurrency:
   - Concurrent uploads (high concurrency)
   - Concurrent analysis requests
   - Mixed interleaved upload & analysis workloads
"""

import io
import os
import time
import uuid
import pytest
import asyncio
import numpy as np
import soundfile as sf
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient

from app.main import app
from app.core.audio_utils import MAX_FILE_SIZE_BYTES, SUPPORTED_EXTENSIONS

client = TestClient(app)


def generate_valid_wav_bytes(duration_sec=1.0, sr=44100, freq=440.0):
    """Generates valid in-memory 16-bit PCM WAV bytes."""
    t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False)
    audio = (0.5 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.read()


# ===========================================================================
# 1. /api/upload ADVERSARIAL TESTS
# ===========================================================================
class TestUploadAdversarial:
    """Stress tests for POST /api/upload."""

    @pytest.mark.parametrize("ext", [
        ".exe", ".txt", ".pdf", ".py", ".sh", ".bin", ".js", ".zip",
        ".doc", ".html", ".png", ".jpg", ".iso", ".bat", ".cmd", ".dll",
        ".tar.gz", ".wav.exe", ".mp3.txt", ""
    ])
    def test_upload_unsupported_extensions(self, ext):
        """Unsupported extensions must be rejected with HTTP 400 Bad Request."""
        filename = f"malicious_test{ext}" if ext else "malicious_no_ext"
        payload = b"FAKE PAYLOAD CONTENT FOR TESTING"
        
        response = client.post(
            "/api/upload",
            files={"file": (filename, payload, "application/octet-stream")}
        )
        assert response.status_code == 400, f"Expected 400 for '{filename}', got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        assert "Unsupported format" in data["detail"] or "valid filename" in data["detail"]

    def test_upload_missing_filename(self):
        """Uploading without a filename must return 400 or 422."""
        response = client.post(
            "/api/upload",
            files={"file": ("", b"dummy data", "audio/wav")}
        )
        assert response.status_code in [400, 422], f"Expected 400 or 422 for empty filename, got {response.status_code}"

    @pytest.mark.parametrize("ext", [".wav", ".mp3", ".flac", ".ogg", ".m4a"])
    def test_upload_empty_files_0_bytes(self, ext):
        """0-byte files with valid extensions must be rejected with HTTP 400."""
        filename = f"empty_test{ext}"
        response = client.post(
            "/api/upload",
            files={"file": (filename, b"", "application/octet-stream")}
        )
        assert response.status_code == 400, f"Expected 400 for empty {ext}, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        assert "empty" in data["detail"].lower()

    def test_upload_oversized_simulated_file(self):
        """Files exceeding MAX_FILE_SIZE_BYTES should be handled cleanly."""
        oversized_size = MAX_FILE_SIZE_BYTES + 1024 * 1024
        large_bytes = b"0" * oversized_size
        response = client.post(
            "/api/upload",
            files={"file": ("oversized_track.wav", large_bytes, "audio/wav")}
        )
        if response.status_code == 200:
            task_id = response.json()["task_id"]
            analyze_resp = client.post("/api/analyze/basic", json={"task_id": task_id})
            assert analyze_resp.status_code == 422, f"Expected 422 for oversized audio analysis, got {analyze_resp.status_code}"
            assert "exceeds" in analyze_resp.json()["detail"].lower()
        else:
            assert response.status_code in [400, 413, 422]

    @pytest.mark.parametrize("corrupted_payload, desc", [
        (b"RIFF\x00\x00\x00\x00WAVEfmt ", "Truncated WAV header"),
        (b"\xff\xfb\x90\x44" + os.urandom(128), "Malformed MP3 header"),
        (b"fLaC\x00\x00\x00\x22" + b"\x00" * 30, "Malformed FLAC header"),
        (b"OggS\x00\x02\x00\x00" + os.urandom(64), "Corrupted OGG stream"),
        (os.urandom(1024), "1KB Pure Random Noise Bytes"),
        (b"\x00" * 2048, "2KB All-Zero Bytes with .wav extension"),
        (b"NOT AUDIO AT ALL HELLO WORLD", "ASCII Text masquerading as WAV")
    ])
    def test_upload_and_analyze_corrupted_audio(self, corrupted_payload, desc):
        """Corrupted audio must not cause 500 server crash during upload or analysis."""
        up_resp = client.post(
            "/api/upload",
            files={"file": (f"corrupted_{desc.replace(' ', '_')}.wav", corrupted_payload, "audio/wav")}
        )
        assert up_resp.status_code == 200, f"Upload of raw bytes failed: {up_resp.status_code}"
        task_id = up_resp.json()["task_id"]

        an_resp = client.post("/api/analyze/basic", json={"task_id": task_id})
        assert an_resp.status_code in [200, 422], f"Expected 422 or 200 for {desc}, got {an_resp.status_code}: {an_resp.text}"
        assert an_resp.status_code != 500, f"Server crashed with 500 on {desc}!"

    @pytest.mark.parametrize("filename", [
        "bản_nhạc_thử_nghiệm_tiếng_việt_2026.wav",
        "🎵_fire_edm_remix_🔥_bass.mp3",
        "japanese_日本語_テスト_音源.flac",
        "special_chars_!@#$%^&()_+={}[];,.wav",
        "track with multiple   spaces and (parentheses).ogg",
        "dots..in..middle..of..name.m4a",
        "accentué_français_mélodie.wav"
    ])
    def test_upload_non_ascii_and_special_character_filenames(self, filename):
        """Non-ASCII, Unicode, emoji, and special filenames must upload cleanly."""
        wav_data = generate_valid_wav_bytes(0.5)
        response = client.post(
            "/api/upload",
            files={"file": (filename, wav_data, "audio/wav")}
        )
        assert response.status_code == 200, f"Failed to upload '{filename}': {response.text}"
        data = response.json()
        assert data["filename"] == filename
        assert "task_id" in data
        assert f"/api/audio/{data['task_id']}" in data["audio_url"]

    @pytest.mark.parametrize("path_filename", [
        "subfolder/audio.wav",
        "sub\\nested\\audio.wav",
        "../../traversal.wav",
        "..\\..\\traversal.wav"
    ])
    def test_upload_filename_with_path_separators(self, path_filename):
        """
        Adversarial test: Filenames containing path separators must not cause HTTP 500.
        They should either be sanitized (HTTP 200 with sanitized basename) or rejected with HTTP 400.
        """
        wav_data = generate_valid_wav_bytes(0.5)
        response = client.post(
            "/api/upload",
            files={"file": (path_filename, wav_data, "audio/wav")}
        )
        # Note: If server returns 500 due to unhandled FileNotFoundError, this assertion fails and flags the bug.
        assert response.status_code in [200, 400], f"CRITICAL: Upload with path '{path_filename}' returned {response.status_code} ({response.text}) instead of 200 or 400!"


# ===========================================================================
# 2. /api/analyze/basic ADVERSARIAL TESTS
# ===========================================================================
class TestAnalyzeAdversarial:
    """Stress tests for POST /api/analyze/basic."""

    @pytest.mark.parametrize("fake_task_id", [
        "00000000-0000-0000-0000-000000000000",
        "ffffffff-ffff-ffff-ffff-ffffffffffff",
        "non-existent-task-id-12345",
        "some-random-uuid-like-string",
        "12345678"
    ])
    def test_analyze_non_existent_task_id(self, fake_task_id):
        """Non-existent task_id must return HTTP 404 Not Found."""
        response = client.post("/api/analyze/basic", json={"task_id": fake_task_id})
        assert response.status_code == 404, f"Expected 404 for '{fake_task_id}', got {response.status_code}: {response.text}"
        assert "not found" in response.json()["detail"].lower()

    @pytest.mark.parametrize("invalid_payload, expected_status", [
        ({}, 422),
        ({"task_id": ""}, 422),
        ({"task_id": None}, 422),
        ({"task_id": None, "file_path": None}, 422),
        ({"task_id": 123456}, 422),
        ({"task_id": ["not", "a", "string"]}, 422),
        ({"task_id": {"nested": "dict"}}, 422),
        ({"unknown_key": "some_value"}, 422),
        ({"file_path": ""}, 422),
        ({"task_id": "a" * 50000}, 404)
    ])
    def test_analyze_invalid_json_bodies(self, invalid_payload, expected_status):
        """Invalid JSON bodies must return 422 or 404, never 500."""
        response = client.post("/api/analyze/basic", json=invalid_payload)
        assert response.status_code == expected_status, f"Expected {expected_status} for {invalid_payload}, got {response.status_code}: {response.text}"
        assert response.status_code != 500

    def test_analyze_malformed_raw_json_syntax(self):
        """Malformed raw JSON syntax must return 422 Unprocessable Entity."""
        response = client.post(
            "/api/analyze/basic",
            content=b"{malformed json without quotes: 123,",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 422, f"Expected 422 for malformed JSON syntax, got {response.status_code}"

    @pytest.mark.parametrize("traversal_path", [
        "../../app/main.py",
        "../PROJECT.md",
        "../../requirements.txt",
        "C:/Windows/win.ini",
        "/etc/passwd",
        "storage/../../app/core/audio_utils.py"
    ])
    def test_analyze_file_path_traversal_attempts(self, traversal_path):
        """Path traversal via file_path must NOT expose source/system files or crash."""
        response = client.post("/api/analyze/basic", json={"file_path": traversal_path})
        assert response.status_code in [404, 422], f"Expected 404 or 422 for path '{traversal_path}', got {response.status_code}: {response.text}"
        assert response.status_code != 500

    @pytest.mark.parametrize("wildcard_task_id", ["*", "?", "[0-9]*"])
    def test_analyze_wildcard_glob_injection(self, wildcard_task_id):
        """
        Adversarial test: Wildcard characters in task_id must NOT match and analyze other files in storage.
        Must return 404 Not Found.
        """
        response = client.post("/api/analyze/basic", json={"task_id": wildcard_task_id})
        assert response.status_code == 404, f"CRITICAL: Wildcard task_id '{wildcard_task_id}' was matched via glob and returned {response.status_code}!"


# ===========================================================================
# 3. GET /api/audio/{task_id} ADVERSARIAL TESTS
# ===========================================================================
class TestAudioStreamAdversarial:
    """Stress tests for GET /api/audio/{task_id}."""

    @pytest.mark.parametrize("non_existent_id", [
        "00000000-0000-0000-0000-000000000000",
        "does-not-exist",
        "random_id_99999",
        "a" * 64
    ])
    def test_get_audio_non_existent_task_id(self, non_existent_id):
        """Non-existent task_id must return 404 Not Found."""
        response = client.get(f"/api/audio/{non_existent_id}")
        assert response.status_code == 404, f"Expected 404 for '{non_existent_id}', got {response.status_code}"

    @pytest.mark.parametrize("traversal_id", [
        "..\\main.py",
        "..\\PROJECT.md",
        "..\\requirements.txt",
        "..\\..\\app\\main.py"
    ])
    def test_get_audio_path_traversal_windows_backslashes(self, traversal_id):
        """
        Adversarial test: Path traversal using Windows backslashes must NOT serve server files.
        Must return 400 or 404.
        """
        response = client.get(f"/api/audio/{traversal_id}")
        assert response.status_code in [400, 404], (
            f"CRITICAL SECURITY VULNERABILITY: Path traversal returned {response.status_code} for '{traversal_id}'! "
            f"Server file leaked: {response.text[:100]}"
        )

    @pytest.mark.parametrize("wildcard_id", ["*", "?", "[a-z]*"])
    def test_get_audio_wildcard_glob_injection(self, wildcard_id):
        """
        Adversarial test: Wildcard task_id must NOT match and stream other users' files.
        Must return 400 or 404.
        """
        response = client.get(f"/api/audio/{wildcard_id}")
        assert response.status_code in [400, 404], (
            f"CRITICAL SECURITY VULNERABILITY: Wildcard '{wildcard_id}' returned {response.status_code} "
            f"and served file: {response.headers.get('content-disposition')}"
        )


# ===========================================================================
# 4. CONCURRENCY STRESS TESTS
# ===========================================================================
class TestConcurrencyStress:
    """Concurrency and throughput stress tests."""

    def test_concurrent_uploads(self):
        """20 parallel uploads must all succeed with unique task_ids and no race conditions."""
        num_requests = 20
        wav_bytes = generate_valid_wav_bytes(0.5, freq=440.0)

        def upload_worker(idx):
            filename = f"concurrent_track_{idx}.wav"
            res = client.post(
                "/api/upload",
                files={"file": (filename, wav_bytes, "audio/wav")}
            )
            return res.status_code, res.json() if res.status_code == 200 else res.text

        with ThreadPoolExecutor(max_workers=10) as executor:
            results = list(executor.map(upload_worker, range(num_requests)))

        task_ids = set()
        for idx, (status_code, data) in enumerate(results):
            assert status_code == 200, f"Worker {idx} failed with {status_code}: {data}"
            assert "task_id" in data
            task_ids.add(data["task_id"])

        assert len(task_ids) == num_requests, f"Expected {num_requests} unique task_ids, got {len(task_ids)}"

    def test_concurrent_dsp_analyses(self):
        """10 parallel DSP analysis requests on uploaded audio must complete without crashing."""
        wav_bytes = generate_valid_wav_bytes(2.0, freq=440.0)
        up_resp = client.post(
            "/api/upload",
            files={"file": ("concurrent_analysis_test.wav", wav_bytes, "audio/wav")}
        )
        assert up_resp.status_code == 200
        task_id = up_resp.json()["task_id"]

        def analyze_worker(idx):
            res = client.post("/api/analyze/basic", json={"task_id": task_id})
            return res.status_code, res.json() if res.status_code == 200 else res.text

        with ThreadPoolExecutor(max_workers=5) as executor:
            results = list(executor.map(analyze_worker, range(10)))

        for idx, (status_code, data) in enumerate(results):
            assert status_code == 200, f"Analysis worker {idx} failed with {status_code}: {data}"
            assert data["task_id"] == task_id
            assert "bpm" in data
            assert "key" in data
            assert "chords" in data
            assert "beats" in data

    def test_interleaved_concurrent_pipeline(self):
        """Interleaved upload, analyze, and stream operations executed in parallel."""
        wav_data_1 = generate_valid_wav_bytes(1.0, freq=330.0)
        wav_data_2 = generate_valid_wav_bytes(1.5, freq=550.0)

        def full_pipeline_worker(idx):
            data = wav_data_1 if idx % 2 == 0 else wav_data_2
            fname = f"pipeline_{idx}.wav"
            
            up = client.post("/api/upload", files={"file": (fname, data, "audio/wav")})
            if up.status_code != 200:
                return False, f"Upload failed: {up.status_code}"
            t_id = up.json()["task_id"]

            stream = client.get(f"/api/audio/{t_id}")
            if stream.status_code != 200:
                return False, f"Audio stream failed: {stream.status_code}"

            an = client.post("/api/analyze/basic", json={"task_id": t_id})
            if an.status_code != 200:
                return False, f"Analyze failed: {an.status_code}"
            
            return True, "OK"

        with ThreadPoolExecutor(max_workers=6) as executor:
            results = list(executor.map(full_pipeline_worker, range(12)))

        for idx, (success, msg) in enumerate(results):
            assert success, f"Interleaved pipeline worker {idx} failed: {msg}"
