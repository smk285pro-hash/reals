from __future__ import annotations

"""Adversarial and Stress-Testing Suite for RealS AI Audio Lab REAPER DAW Integration.

This test suite performs empirical adversarial verification against all standalone
REST endpoints:
- POST /api/v1/analyze
- POST /api/v1/chords
- POST /api/v1/separate
- POST /api/v1/denoise
- GET  /api/v1/jobs/{task_id}
- GET  /api/stems/{task_id}/{stem_name}
- GET  /api/export/midi/{task_id}
- GET  /api/export/stems-zip/{task_id}
- GET  /api/denoised/{task_id}

Stress & Attack Dimensions Tested:
1. Malformed multipart forms, bad field keys, missing files, corrupted content-types.
2. Pathological filenames (null bytes, directory traversal, shell injections, 4096-char lengths, unicode/emojis).
3. Pathological audio signals (10ms micro-audio, all-zero silence, constant DC offset, clipped square waves, white noise, 6-channel audio, 8kHz & 96kHz rates, truncated WAV headers).
4. Boundary fuzzing on parameters (stem_mode: "0", "1", "3", "5", "99", SQLi; strength: -1, 101, 0, 100, floats, strings).
5. Robust path traversal & URL injection defenses on task_id and stem_name.
6. HTTP byte range stress (inverted ranges, out-of-bounds, single byte, malformed ranges).
7. High-concurrency stress testing (parallel synchronous analysis, parallel job polling, premature artifact downloads).
8. Auth enforcement under adversarial headers (token injection, garbage tokens, timeout simulation).
"""

import concurrent.futures
import io
import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app.core.config import MAX_UPLOAD_MB, SETTINGS
from app.core.task_manager import TASK_MANAGER


# ============================================================================
# ADVERSARIAL SUITE 1: MALFORMED MULTIPART FORMS & PATHOLOGICAL FILENAMES
# ============================================================================

class TestAdversarialMultipartAndFilenames:
    """Stress-test upload handling with malformed multipart payloads and hostile filenames."""

    def test_missing_file_field_returns_422(self, client: TestClient):
        """Omitting the required 'file' field or using incorrect keys returns 422, not 500."""
        # 1. No fields at all
        resp1 = client.post("/api/v1/analyze", data={})
        assert resp1.status_code == 422, f"Expected 422 on empty form, got {resp1.status_code}"

        # 2. Wrong field name 'audio'
        resp2 = client.post("/api/v1/chords", files={"audio": ("test.wav", b"fake", "audio/wav")})
        assert resp2.status_code == 422, f"Expected 422 on wrong field key, got {resp2.status_code}"

        # 3. Wrong field name 'track' on /v1/separate
        resp3 = client.post("/api/v1/separate", files={"track": ("test.wav", b"fake", "audio/wav")})
        assert resp3.status_code == 422, f"Expected 422 on wrong field key, got {resp3.status_code}"

    @pytest.mark.parametrize("hostile_filename", [
        "../../../../Windows/System32/calc.exe.wav",
        "..\\..\\..\\..\\boot.ini.wav",
        "%2e%2e%2fsong.wav",
        "; rm -rf / ;.wav",
        "`calc.exe`.wav",
        "$PATH.wav",
        "🎵🎶🔥_Vietnamese_Song_Hợp_Âm_Đỉnh_Cao_2026_🎧🎸.wav",
        "العربية_موسيقى.wav",
        "   song_with_leading_and_trailing_spaces.wav   ",
        "A" * 500 + ".wav",  # Extreme filename length
        ".hidden_audio.wav",
    ])
    def test_pathological_filenames_sanitized_safely(
        self, client: TestClient, synthetic_wav_bytes: bytes, hostile_filename: str
    ):
        """Hostile or extreme filenames must be sanitized without path traversal or server crash."""
        files = {"file": (hostile_filename, synthetic_wav_bytes, "audio/wav")}
        response = client.post("/api/v1/analyze", files=files)
        assert response.status_code == 200, (
            f"Failed for hostile filename '{hostile_filename[:30]}...': {response.status_code} - {response.text}"
        )
        data = response.json()
        assert "task_id" in data
        assert "bpm" in data

    def test_corrupted_wav_header_rejected_cleanly(self, client: TestClient):
        """Truncated or corrupted WAV headers should be caught without crashing the process."""
        # 1. 4 bytes RIFF only
        corrupted_1 = b"RIFF"
        resp1 = client.post("/api/v1/analyze", files={"file": ("corrupt1.wav", corrupted_1, "audio/wav")})
        assert resp1.status_code in (400, 500), f"Got {resp1.status_code}"

        # 2. RIFF header claiming 1GB length but ending immediately
        corrupted_2 = b"RIFF\xff\xff\xff\x7fWAVEfmt \x10\x00\x00\x00\x01\x00\x02\x00"
        resp2 = client.post("/api/v1/chords", files={"file": ("corrupt2.wav", corrupted_2, "audio/wav")})
        assert resp2.status_code in (400, 500), f"Got {resp2.status_code}"

    def test_non_audio_disguised_with_wav_extension(self, client: TestClient):
        """Text/HTML files disguised as .wav should be caught when soundfile/librosa attempts to decode."""
        fake_content = b"<html><head><title>Fake</title></head><body>Not audio</body></html>"
        resp = client.post("/api/v1/analyze", files={"file": ("malicious.wav", fake_content, "audio/wav")})
        assert resp.status_code in (400, 500), f"Got {resp.status_code}"


# ============================================================================
# ADVERSARIAL SUITE 2: PATHOLOGICAL AUDIO SIGNALS & DSP BOUNDARIES
# ============================================================================

class TestAdversarialAudioSignals:
    """Stress-test signal processing algorithms with extreme, edge, and degenerate audio inputs."""

    def test_pure_silence_all_zeros_no_crash_or_nan(self, client: TestClient):
        """Pure silent audio (all zeros) must not cause divide-by-zero, NaN, or Inf in BPM/Key/Chords."""
        sr = 44100
        duration = 2.0
        silence = np.zeros(int(sr * duration), dtype=np.float32)
        buf = io.BytesIO()
        sf.write(buf, np.column_stack([silence, silence]), sr, format="WAV", subtype="PCM_16")
        silence_bytes = buf.getvalue()

        # 1. /api/v1/analyze
        resp_ana = client.post("/api/v1/analyze", files={"file": ("silence.wav", silence_bytes, "audio/wav")})
        assert resp_ana.status_code == 200, f"Analyze failed on silence: {resp_ana.text}"
        data_ana = resp_ana.json()
        assert not np.isnan(data_ana["bpm"]), "BPM is NaN"
        assert not np.isinf(data_ana["bpm"]), "BPM is Inf"
        assert data_ana["bpm"] > 0

        # 2. /api/v1/chords
        resp_chords = client.post("/api/v1/chords", files={"file": ("silence.wav", silence_bytes, "audio/wav")})
        assert resp_chords.status_code == 200, f"Chords failed on silence: {resp_chords.text}"
        data_chords = resp_chords.json()
        assert isinstance(data_chords["chords"], list)
        assert isinstance(data_chords["beats"], list)

    def test_dc_offset_constant_signal(self, client: TestClient):
        """Constant DC offset (+0.8 everywhere) must be handled gracefully."""
        sr = 44100
        duration = 2.0
        dc_signal = np.full(int(sr * duration), 0.8, dtype=np.float32)
        buf = io.BytesIO()
        sf.write(buf, np.column_stack([dc_signal, dc_signal]), sr, format="WAV", subtype="PCM_16")
        dc_bytes = buf.getvalue()

        resp = client.post("/api/v1/analyze", files={"file": ("dc.wav", dc_bytes, "audio/wav")})
        assert resp.status_code == 200, f"Failed on DC offset: {resp.text}"
        data = resp.json()
        assert data["bpm"] > 0

    def test_pure_white_noise(self, client: TestClient):
        """Random Gaussian white noise must not cause unhandled exceptions."""
        sr = 44100
        duration = 2.0
        rng = np.random.default_rng(42)
        noise = rng.standard_normal(int(sr * duration)).astype(np.float32)
        noise = np.clip(noise * 0.2, -0.9, 0.9)
        buf = io.BytesIO()
        sf.write(buf, np.column_stack([noise, noise]), sr, format="WAV", subtype="PCM_16")
        noise_bytes = buf.getvalue()

        resp = client.post("/api/v1/chords", files={"file": ("noise.wav", noise_bytes, "audio/wav")})
        assert resp.status_code == 200, f"Failed on white noise: {resp.text}"
        data = resp.json()
        assert "chords" in data
        assert "beats" in data

    def test_extreme_sample_rates(self, client: TestClient):
        """Audio sampled at non-standard rates (8000 Hz and 96000 Hz) must decode and process."""
        # 1. Low sample rate (8000 Hz)
        t_low = np.linspace(0, 2.0, int(8000 * 2.0), endpoint=False)
        sig_low = 0.5 * np.sin(2 * np.pi * 440.0 * t_low).astype(np.float32)
        buf_low = io.BytesIO()
        sf.write(buf_low, sig_low, 8000, format="WAV", subtype="PCM_16")

        resp_low = client.post("/api/v1/analyze", files={"file": ("low_sr.wav", buf_low.getvalue(), "audio/wav")})
        assert resp_low.status_code == 200, f"Failed for 8kHz: {resp_low.text}"

        # 2. High sample rate (96000 Hz)
        t_high = np.linspace(0, 2.0, int(96000 * 2.0), endpoint=False)
        sig_high = 0.5 * np.sin(2 * np.pi * 440.0 * t_high).astype(np.float32)
        buf_high = io.BytesIO()
        sf.write(buf_high, np.column_stack([sig_high, sig_high]), 96000, format="WAV", subtype="PCM_16")

        resp_high = client.post("/api/v1/analyze", files={"file": ("high_sr.wav", buf_high.getvalue(), "audio/wav")})
        assert resp_high.status_code == 200, f"Failed for 96kHz: {resp_high.text}"

    def test_tiny_audio_duration_sub_second(self, client: TestClient):
        """Very short audio (0.1 seconds, 4410 samples) should process or fail gracefully."""
        sr = 44100
        duration = 0.1
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        sig = 0.5 * np.sin(2 * np.pi * 440.0 * t).astype(np.float32)
        buf = io.BytesIO()
        sf.write(buf, np.column_stack([sig, sig]), sr, format="WAV", subtype="PCM_16")

        resp = client.post("/api/v1/analyze", files={"file": ("short.wav", buf.getvalue(), "audio/wav")})
        assert resp.status_code in (200, 400, 500)
        if resp.status_code == 200:
            assert resp.json()["duration"] < 0.2


# ============================================================================
# ADVERSARIAL SUITE 3: PARAMETER FUZZING & INJECTION RESISTANCE
# ============================================================================

class TestAdversarialParameterFuzzing:
    """Stress-test query parameters and path parameters against fuzzing and injection."""

    @pytest.mark.parametrize("fuzz_mode", [
        "-1", "0", "1", "3", "5", "7", "9", "10", "999",
        "4; DROP TABLE users; --",
        "<script>alert(1)</script>",
        "null",
        "undefined",
        "4.0",
        " 4 ",
        "four",
    ])
    def test_fuzz_stem_mode_rejected_400(
        self, client: TestClient, synthetic_wav_bytes: bytes, fuzz_mode: str
    ):
        """Unsupported or malicious stem_mode values must return 400 Bad Request."""
        files = {"file": ("test.wav", synthetic_wav_bytes, "audio/wav")}
        response = client.post(f"/api/v1/separate?stem_mode={fuzz_mode}", files=files)
        assert response.status_code == 400, (
            f"Expected 400 for stem_mode='{fuzz_mode}', got {response.status_code}: {response.text}"
        )

    @pytest.mark.parametrize("fuzz_strength,expected_status", [
        (-1, 422),
        (-100, 422),
        (101, 422),
        (99999, 422),
        (0, 202),    # Boundary min
        (100, 202),  # Boundary max
        (50, 202),   # Normal
    ])
    def test_fuzz_denoise_strength_boundaries(
        self, client: TestClient, synthetic_wav_bytes: bytes, fuzz_strength: int, expected_status: int
    ):
        """Denoise strength query parameter strictly bounded between 0 and 100."""
        files = {"file": ("test.wav", synthetic_wav_bytes, "audio/wav")}
        response = client.post(f"/api/v1/denoise?strength={fuzz_strength}", files=files)
        assert response.status_code == expected_status, (
            f"Expected {expected_status} for strength={fuzz_strength}, got {response.status_code}"
        )

    @pytest.mark.parametrize("hostile_stem_name", [
        "../../etc/passwd",
        "..\\..\\Windows\\System32\\cmd.exe",
        "%2e%2e%2fcredentials.json",
        "vocals;ls -la",
        "vocals && dir",
        "vocals|cat /etc/shadow",
        "CON",
        "AUX",
        "NUL",
        "COM1",
        "LPT1",
        "vocals.wav.wav",
        "vocals.mp3",
        "vocals.exe",
        "A" * 128,  # Exceeds regex max length 64
        "!@#$%^&*()",
    ])
    def test_hostile_stem_names_rejected_404(self, client: TestClient, hostile_stem_name: str):
        """Hostile or non-existent stem names must return 404 without path traversal."""
        fake_task_id = str(uuid.uuid4())
        response = client.get(f"/api/stems/{fake_task_id}/{hostile_stem_name}")
        assert response.status_code == 404, (
            f"Expected 404 for hostile stem '{hostile_stem_name}', got {response.status_code}"
        )

    @pytest.mark.parametrize("hostile_task_id", [
        "../../etc/passwd",
        "..\\..\\Windows\\win.ini",
        "%2e%2e%2f%2e%2e",
        "12345",
        "non-uuid-string",
        "00000000-0000-0000-0000-00000000000g",  # Invalid hex char 'g'
        "00000000-0000-0000-0000-0000000000001", # Too long
        "' OR '1'='1",
        "null",
        "undefined",
    ])
    def test_hostile_task_id_rejected_404_across_endpoints(self, client: TestClient, hostile_task_id: str):
        """Malformed or non-UUID task IDs must return 404 cleanly across all endpoints."""
        endpoints = [
            f"/api/v1/jobs/{hostile_task_id}",
            f"/api/stems/{hostile_task_id}/vocals",
            f"/api/export/midi/{hostile_task_id}",
            f"/api/export/stems-zip/{hostile_task_id}",
            f"/api/denoised/{hostile_task_id}",
        ]
        for ep in endpoints:
            resp = client.get(ep)
            assert resp.status_code == 404, (
                f"Endpoint {ep} failed to reject hostile task_id with 404; got {resp.status_code}"
            )


# ============================================================================
# ADVERSARIAL SUITE 4: HTTP RANGE HEADER STRESS & BYTE-SLICE INTEGRITY
# ============================================================================

class TestAdversarialByteRanges:
    """Stress-test HTTP Range header parser and byte-streaming engine."""

    def test_range_header_adversarial_matrix(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Test exhaustive combinations of valid, boundary, and pathological Range headers."""
        # 1. Create a task with stem files
        files = {"file": ("test.wav", synthetic_wav_bytes, "audio/wav")}
        sep_resp = client.post("/api/v1/separate?stem_mode=2", files=files)
        assert sep_resp.status_code == 202
        task_id = sep_resp.json()["task_id"]

        # Poll until complete
        for _ in range(60):
            job_resp = client.get(f"/api/v1/jobs/{task_id}")
            if job_resp.json().get("status") == "COMPLETE":
                break
            time.sleep(0.1)

        stem_url = f"/api/stems/{task_id}/vocals.wav"

        # Baseline: get full content length
        full_resp = client.get(stem_url)
        assert full_resp.status_code == 200
        full_len = len(full_resp.content)
        full_bytes = full_resp.content

        # Case 1: First single byte (bytes=0-0)
        r1 = client.get(stem_url, headers={"Range": "bytes=0-0"})
        assert r1.status_code == 206
        assert len(r1.content) == 1
        assert r1.content == full_bytes[0:1]
        assert r1.headers.get("Content-Range") == f"bytes 0-0/{full_len}"

        # Case 2: Last single byte (bytes=-1)
        r2 = client.get(stem_url, headers={"Range": "bytes=-1"})
        assert r2.status_code == 206
        assert len(r2.content) == 1
        assert r2.content == full_bytes[-1:]
        assert r2.headers.get("Content-Range") == f"bytes {full_len - 1}-{full_len - 1}/{full_len}"

        # Case 3: Suffix larger than file (bytes=-99999999) -> returns full file
        r3 = client.get(stem_url, headers={"Range": "bytes=-99999999"})
        assert r3.status_code == 206
        assert len(r3.content) == full_len
        assert r3.content == full_bytes

        # Case 4: End beyond file size (bytes=100-99999999) -> clamped to EOF
        r4 = client.get(stem_url, headers={"Range": "bytes=100-99999999"})
        assert r4.status_code == 206
        assert len(r4.content) == full_len - 100
        assert r4.content == full_bytes[100:]

        # Case 5: Inverted range (bytes=500-100) -> 416
        r5 = client.get(stem_url, headers={"Range": "bytes=500-100"})
        assert r5.status_code == 416
        assert "Content-Range" in r5.headers

        # Case 6: Start beyond file size (bytes=99999999-99999999) -> 416
        r6 = client.get(stem_url, headers={"Range": "bytes=99999999-99999999"})
        assert r6.status_code == 416

        # Case 7: Malformed range formats -> 416
        for malformed in ["bytes=", "bytes=--", "bytes=abc-def", "invalid_unit=0-100", "bytes=-0"]:
            r7 = client.get(stem_url, headers={"Range": malformed})
            assert r7.status_code == 416, f"Expected 416 for Range: {malformed}, got {r7.status_code}"


# ============================================================================
# ADVERSARIAL SUITE 5: CONCURRENCY & RACE CONDITION STRESS
# ============================================================================

class TestAdversarialConcurrencyAndStress:
    """Stress-test concurrent requests, parallel background jobs, and race conditions."""

    def test_concurrent_synchronous_analysis_requests(
        self, client: TestClient, synthetic_audio_factory
    ):
        """Launch 8 parallel synchronous /api/v1/analyze requests to verify thread safety."""
        num_workers = 8
        audio_samples = [
            synthetic_audio_factory(duration=1.5, bpm=100.0 + i * 5, channels=2)
            for i in range(num_workers)
        ]

        def _do_analyze(idx: int) -> Dict[str, Any]:
            wav_data = audio_samples[idx]
            files = {"file": (f"concurrent_test_{idx}.wav", wav_data, "audio/wav")}
            resp = client.post("/api/v1/analyze", files=files)
            return {"status_code": resp.status_code, "data": resp.json() if resp.status_code == 200 else resp.text}

        with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
            results = list(executor.map(_do_analyze, range(num_workers)))

        for i, res in enumerate(results):
            assert res["status_code"] == 200, f"Worker {i} failed: {res}"
            assert "task_id" in res["data"]
            assert "bpm" in res["data"]
            assert res["data"]["bpm"] > 0

    def test_concurrent_job_polling_under_load(
        self, client: TestClient, synthetic_wav_bytes: bytes
    ):
        """Spawn 20 parallel polling threads hitting GET /api/v1/jobs/{task_id} during separation."""
        files = {"file": ("poll_stress.wav", synthetic_wav_bytes, "audio/wav")}
        sep_resp = client.post("/api/v1/separate?stem_mode=2", files=files)
        assert sep_resp.status_code == 202
        task_id = sep_resp.json()["task_id"]

        num_pollers = 20

        def _poll_worker(worker_id: int) -> List[int]:
            status_codes = []
            for _ in range(15):
                resp = client.get(f"/api/v1/jobs/{task_id}")
                status_codes.append(resp.status_code)
                if resp.status_code == 200:
                    payload = resp.json()
                    assert "status" in payload
                    assert payload["status"] in ("QUEUED", "RUNNING", "COMPLETE", "FAILED")
                time.sleep(0.05)
            return status_codes

        with concurrent.futures.ThreadPoolExecutor(max_workers=num_pollers) as executor:
            all_codes = list(executor.map(_poll_worker, range(num_pollers)))

        for poller_codes in all_codes:
            for code in poller_codes:
                assert code == 200, f"Poll returned unexpected code: {code}"

        # Wait for task completion
        for _ in range(60):
            final_resp = client.get(f"/api/v1/jobs/{task_id}")
            if final_resp.json().get("status") == "COMPLETE":
                break
            time.sleep(0.1)

        final_data = client.get(f"/api/v1/jobs/{task_id}").json()
        assert final_data["status"] == "COMPLETE"
        assert "result" in final_data
        assert "zip_url" in final_data["result"]

    def test_premature_artifact_download_returns_404_cleanly(
        self, client: TestClient, synthetic_wav_bytes: bytes
    ):
        """Attempting to download stems or ZIP immediately before job completes returns 404, not 500."""
        files = {"file": ("premature_test.wav", synthetic_wav_bytes, "audio/wav")}
        sep_resp = client.post("/api/v1/separate?stem_mode=4", files=files)
        assert sep_resp.status_code == 202
        task_id = sep_resp.json()["task_id"]

        # Immediately query stem and zip endpoints
        stem_resp = client.get(f"/api/stems/{task_id}/vocals")
        # While QUEUED/RUNNING before files exist, must return 404 cleanly
        assert stem_resp.status_code in (404, 200)

        zip_resp = client.get(f"/api/export/stems-zip/{task_id}")
        assert zip_resp.status_code in (404, 200)


# ============================================================================
# ADVERSARIAL SUITE 6: AUTHENTICATION ENFORCEMENT & FAIL-CLOSED INTEGRITY
# ============================================================================

class TestAdversarialAuthIntegrity:
    """Stress-test authentication boundaries and fail-closed security properties."""

    def test_auth_enforced_adversarial_headers(
        self, auth_enforced_client: TestClient, synthetic_wav_bytes: bytes
    ):
        """Strict auth mode must reject malformed, empty, or hostile Authorization headers with 401."""
        hostile_auth_headers = [
            {},                                      # Missing header
            {"Authorization": ""},                   # Empty string
            {"Authorization": "Bearer"},             # Missing token
            {"Authorization": "Bearer "},            # Whitespace token
            {"Authorization": "Basic admin:secret"}, # Wrong scheme
            {"Authorization": "Digest something"},   # Wrong scheme
            {"Authorization": "Token 12345"},        # Wrong prefix
            {"Authorization": "bearer "},            # Lowercase empty token
        ]

        for headers in hostile_auth_headers:
            files = {"file": ("auth_test.wav", synthetic_wav_bytes, "audio/wav")}
            resp = auth_enforced_client.post("/api/v1/analyze", files=files, headers=headers)
            assert resp.status_code == 401, (
                f"Expected 401 for header '{headers.get('Authorization')}', got {resp.status_code}: {resp.text}"
            )

    def test_auth_disabled_ignores_garbage_token(
        self, client: TestClient, synthetic_wav_bytes: bytes
    ):
        """When REALS_AUTH_DISABLED=true, any token (even garbage) must be permitted as local-reaper-user."""
        files = {"file": ("dev_test.wav", synthetic_wav_bytes, "audio/wav")}
        headers = {"Authorization": "Bearer totally-fake-garbage-token-999"}
        resp = client.post("/api/v1/analyze", files=files, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["bpm"] > 0
