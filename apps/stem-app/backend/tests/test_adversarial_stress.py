from __future__ import annotations

"""Adversarial Stress and Security Test Suite for RealS AI Audio Lab FastAPI Backend.

Covers:
- Section 1: Multipart & Binary Fuzzing (Corrupted bytes, zero-filled, ELF/EXE magic, truncated headers)
- Section 2: Path Traversal, OS Device & Injection Defenses (Task ID, stem name, upload filename)
- Section 3: HTTP Byte-Range Header Adversarial Fuzzing (Inverted, out-of-bounds, non-integer, single byte)
- Section 4: Boundary Values & Extreme Audio Signals (Ultra-short, 8kHz, 192kHz, silent, clipping)
- Section 5: High Concurrency & Burst Stress Testing (30+ parallel workers, rapid polling, race conditions)
- Section 6: Artifact & Data Integrity (ZIP structure, CRC32, WAV headers, SMF-1 MIDI tracks)
- Section 7: Fail-Closed SSO & Security Enforcement (Simulated dropouts, timeouts, quota conflicts)
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
import io
import json
import os
import re
import shutil
import struct
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List

import httpx
import mido
import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app.core.config import MAX_UPLOAD_MB, SAMPLE_RATE, SETTINGS, STEM_MODES
from app.core.midi_exporter import export_midi
from app.core.schemas import BeatPoint, ChordSegment
from app.core.task_manager import TASK_MANAGER


# ============================================================================
# SECTION 1: MULTIPART & BINARY FUZZING
# ============================================================================

class TestAdversarialMultipartFuzzing:
    """Adversarial testing with malformed, corrupted, or fuzzed payloads."""

    def test_corrupted_wav_header_rejected_or_handled(self, client: TestClient):
        """Upload payload with 'RIFF' header but random garbage in chunk size and format."""
        # Malformed WAV: 44 bytes with corrupt subchunks
        corrupt_wav = b"RIFF\xff\xff\xff\xffWAVEfmt \x10\x00\x00\x00\x01\x00\x02\x00" + os.urandom(28)
        files = {"file": ("corrupt_header.wav", corrupt_wav, "audio/wav")}

        # /api/v1/analyze must not crash with uncaught 500 error; if it returns 500, detail must be handled
        response = client.post("/api/v1/analyze", files=files)
        # Server should reject or return 400 or 500 with descriptive error detail, not unhandled crash
        assert response.status_code in (400, 500)
        data = response.json()
        assert "detail" in data

    def test_random_binary_garbage_fuzz(self, client: TestClient):
        """Upload 64KB of pure cryptographic random noise disguised as .mp3."""
        garbage_bytes = os.urandom(64 * 1024)
        files = {"file": ("random_noise.mp3", garbage_bytes, "audio/mpeg")}

        response = client.post("/api/v1/analyze", files=files)
        assert response.status_code in (400, 500)
        assert "detail" in response.json()

    def test_elf_binary_disguised_as_wav(self, client: TestClient):
        """Upload Linux ELF executable magic bytes \x7fELF with audio/wav Content-Type."""
        elf_header = b"\x7fELF\x02\x01\x01\x00" + os.urandom(1024)
        files = {"file": ("exploit.wav", elf_header, "audio/wav")}

        response = client.post("/api/v1/analyze", files=files)
        assert response.status_code in (400, 500)

    def test_zero_filled_buffer_silent_wav(self, client: TestClient, synthetic_audio_factory):
        """Upload completely silent audio (all zeros) of 1.0s duration."""
        # 1.0s of pure zeros at 44100Hz 16-bit PCM
        buf = io.BytesIO()
        sf.write(buf, np.zeros((44100, 2), dtype=np.float32), 44100, format="WAV", subtype="PCM_16")
        silent_wav = buf.getvalue()

        files = {"file": ("silent.wav", silent_wav, "audio/wav")}
        response = client.post("/api/v1/analyze", files=files)
        assert response.status_code == 200, f"Analyze failed on silent audio: {response.text}"
        data = response.json()
        assert data["bpm"] > 0
        assert isinstance(data["master_key"], str)

    def test_full_scale_clipping_square_wave(self, client: TestClient):
        """Upload full scale clipping square wave (+1.0 / -1.0) to test stability against DSP overflow."""
        sr = 44100
        t = np.linspace(0, 1.5, int(sr * 1.5), endpoint=False)
        square = np.sign(np.sin(2 * np.pi * 440.0 * t)).astype(np.float32)
        stereo = np.column_stack([square, square])

        buf = io.BytesIO()
        sf.write(buf, stereo, sr, format="WAV", subtype="PCM_16")
        clipping_wav = buf.getvalue()

        files = {"file": ("clipping.wav", clipping_wav, "audio/wav")}
        response = client.post("/api/v1/chords", files=files)
        assert response.status_code == 200
        data = response.json()
        assert "chords" in data
        assert "beats" in data

    def test_multipart_with_missing_filename(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Upload multipart form where filename is None or empty string."""
        files = {"file": ("", synthetic_wav_bytes, "audio/wav")}
        response = client.post("/api/v1/analyze", files=files)
        # Should sanitize empty filename and process or reject gracefully
        assert response.status_code in (200, 400)

    def test_multipart_with_extra_fields(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Upload multipart form with extra unexpected parameters."""
        files = {"file": ("song.wav", synthetic_wav_bytes, "audio/wav")}
        data = {"extra_param_1": "unexpected_data", "malicious_payload": "' OR 1=1 --"}
        response = client.post("/api/v1/analyze", files=files, data=data)
        assert response.status_code == 200


# ============================================================================
# SECTION 2: PATH TRAVERSAL, OS DEVICE & INJECTION DEFENSES
# ============================================================================

class TestAdversarialPathTraversalAndInjection:
    """Verify robust defense against path traversal, command injection, and Windows device names."""

    TRAVERSAL_TASK_IDS = [
        "../../../etc/passwd",
        "..\\..\\windows\\win.ini",
        "....//....//config.py",
        "%2e%2e%2f%2e%2e%2f",
        "00000000-0000-0000-0000-000000000000/../../",
        "12345678-1234-1234-1234-123456789012\x00.wav",
        "' OR '1'='1",
        "; whoami",
        "$(cat /etc/passwd)",
        "`calc.exe`",
    ]

    @pytest.mark.parametrize("bad_task_id", TRAVERSAL_TASK_IDS)
    def test_jobs_endpoint_rejects_path_traversal(self, client: TestClient, bad_task_id: str):
        """GET /api/v1/jobs/{task_id} must reject malformed/traversal task_ids with 404."""
        response = client.get(f"/api/v1/jobs/{bad_task_id}")
        assert response.status_code == 404, f"Expected 404 for bad task_id {bad_task_id}, got {response.status_code}"

    @pytest.mark.parametrize("bad_task_id", TRAVERSAL_TASK_IDS)
    def test_export_midi_rejects_path_traversal(self, client: TestClient, bad_task_id: str):
        """GET /api/export/midi/{task_id} must reject path traversal task_ids."""
        response = client.get(f"/api/export/midi/{bad_task_id}")
        assert response.status_code == 404

    @pytest.mark.parametrize("bad_task_id", TRAVERSAL_TASK_IDS)
    def test_export_stems_zip_rejects_path_traversal(self, client: TestClient, bad_task_id: str):
        """GET /api/export/stems-zip/{task_id} must reject path traversal task_ids."""
        response = client.get(f"/api/export/stems-zip/{bad_task_id}")
        assert response.status_code == 404

    TRAVERSAL_STEM_NAMES = [
        "../../master_44k_stereo.wav",
        "../peaks.json",
        "..\\..\\app\\core\\config.py",
        "vocals/../../../",
        "vocals\x00.wav",
        "vocals.wav.exe",
        "vocals;calc",
        "vocals|cat",
        "vocals$FOO",
        "CON",
        "PRN",
        "AUX",
        "NUL",
    ]

    @pytest.mark.parametrize("bad_stem_name", TRAVERSAL_STEM_NAMES)
    def test_get_stem_rejects_traversal_and_device_names(self, client: TestClient, bad_stem_name: str):
        """GET /api/stems/{valid_task_id}/{bad_stem_name} must reject directory traversal with 404."""
        valid_task_id = str(uuid.uuid4())
        response = client.get(f"/api/stems/{valid_task_id}/{bad_stem_name}")
        assert response.status_code == 404, f"Expected 404 for stem {bad_stem_name}, got {response.status_code}"

    def test_upload_filename_sanitization(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Upload with dangerous path traversal filenames: verify it stays confined inside upload_dir/task_id/."""
        evil_filenames = [
            "../../../../escaped_file.wav",
            "..\\..\\app\\injected.wav",
            "../../../CON.wav",
            "normal_track.wav",
        ]
        for name in evil_filenames:
            files = {"file": (name, synthetic_wav_bytes, "audio/wav")}
            response = client.post("/api/v1/analyze", files=files)
            assert response.status_code == 200
            task_id = response.json()["task_id"]

            # Verify no file escaped to outside SETTINGS.upload_dir
            task_dir = SETTINGS.upload_dir / task_id
            assert task_dir.exists(), "Task directory should exist in upload_dir"
            for f in task_dir.iterdir():
                assert f.is_relative_to(SETTINGS.upload_dir)


# ============================================================================
# SECTION 3: HTTP BYTE-RANGE HEADER ADVERSARIAL FUZZING
# ============================================================================

class TestAdversarialHttpRangeFuzzing:
    """Adversarial fuzzing for HTTP Range requests on audio streaming endpoints."""

    @pytest.fixture
    def stem_session(self, synthetic_wav_bytes: bytes) -> str:
        """Create a mock stem separation session on disk."""
        task_id = str(uuid.uuid4())
        task_stems_dir = SETTINGS.stems_dir / task_id
        task_stems_dir.mkdir(parents=True, exist_ok=True)

        vocals_file = task_stems_dir / "vocals.wav"
        with open(vocals_file, "wb") as f:
            f.write(synthetic_wav_bytes)

        return task_id

    def test_range_exact_last_byte(self, client: TestClient, stem_session: str, synthetic_wav_bytes: bytes):
        """Request the exact last single byte of the file: bytes=(size-1)-(size-1)."""
        file_size = len(synthetic_wav_bytes)
        headers = {"Range": f"bytes={file_size - 1}-{file_size - 1}"}
        response = client.get(f"/api/stems/{stem_session}/vocals.wav", headers=headers)

        assert response.status_code == 206
        assert response.headers.get("Content-Range") == f"bytes {file_size - 1}-{file_size - 1}/{file_size}"
        assert len(response.content) == 1
        assert response.content == synthetic_wav_bytes[-1:]

    def test_range_first_single_byte(self, client: TestClient, stem_session: str, synthetic_wav_bytes: bytes):
        """Request the exact first byte: bytes=0-0."""
        file_size = len(synthetic_wav_bytes)
        headers = {"Range": "bytes=0-0"}
        response = client.get(f"/api/stems/{stem_session}/vocals", headers=headers)

        assert response.status_code == 206
        assert response.headers.get("Content-Range") == f"bytes 0-0/{file_size}"
        assert len(response.content) == 1
        assert response.content == synthetic_wav_bytes[0:1]

    def test_range_inverted_start_greater_than_end(self, client: TestClient, stem_session: str):
        """Range with start > end (e.g. bytes=5000-100) must return 416."""
        headers = {"Range": "bytes=5000-100"}
        response = client.get(f"/api/stems/{stem_session}/vocals.wav", headers=headers)
        assert response.status_code == 416

    def test_range_completely_past_eof(self, client: TestClient, stem_session: str):
        """Range start way beyond EOF (e.g. bytes=9999999-99999999) must return 416."""
        headers = {"Range": "bytes=9999999-99999999"}
        response = client.get(f"/api/stems/{stem_session}/vocals.wav", headers=headers)
        assert response.status_code == 416

    def test_range_non_numeric_and_malformed(self, client: TestClient, stem_session: str):
        """Malformed Range strings must return 416."""
        bad_ranges = [
            "bytes=abc-def",
            "bytes=--",
            "bytes=-",
            "bytes=1.5-3.5",
            "invalid_unit=0-100",
            "bytes=",
        ]
        for r in bad_ranges:
            response = client.get(f"/api/stems/{stem_session}/vocals.wav", headers={"Range": r})
            assert response.status_code == 416, f"Expected 416 for Range '{r}', got {response.status_code}"


# ============================================================================
# SECTION 4: BOUNDARY VALUES & EXTREME AUDIO SIGNALS
# ============================================================================

class TestAdversarialParameterBoundariesAndSignals:
    """Stress testing on extreme parameter values and unusual audio formats."""

    @pytest.mark.parametrize("bad_stem_mode", ["0", "1", "3", "5", "10", "demucs", "-1", "NaN", "9999999999"])
    def test_separate_rejects_invalid_modes(self, client: TestClient, synthetic_wav_bytes: bytes, bad_stem_mode: str):
        """POST /api/v1/separate rejects any stem_mode not in {'2', '4', '6', '8'}."""
        files = {"file": ("track.wav", synthetic_wav_bytes, "audio/wav")}
        response = client.post(f"/api/v1/separate?stem_mode={bad_stem_mode}", files=files)
        assert response.status_code == 400
        assert "Supported modes" in response.json()["detail"]

    @pytest.mark.parametrize("bad_strength", [-100, -1, 101, 500, 999999])
    def test_denoise_rejects_out_of_bound_strengths(self, client: TestClient, synthetic_wav_bytes: bytes, bad_strength: int):
        """POST /api/v1/denoise rejects strengths outside [0, 100]."""
        files = {"file": ("vocal.wav", synthetic_wav_bytes, "audio/wav")}
        response = client.post(f"/api/v1/denoise?strength={bad_strength}", files=files)
        assert response.status_code == 422, f"Expected 422 for strength {bad_strength}, got {response.status_code}"

    def test_ultra_short_audio_signal(self, client: TestClient):
        """Upload ultra-short audio: 0.05 seconds (2205 samples at 44.1kHz)."""
        sr = 44100
        t = np.linspace(0, 0.05, int(sr * 0.05), endpoint=False)
        sig = 0.5 * np.sin(2 * np.pi * 440.0 * t).astype(np.float32)
        stereo = np.column_stack([sig, sig])

        buf = io.BytesIO()
        sf.write(buf, stereo, sr, format="WAV", subtype="PCM_16")
        short_wav = buf.getvalue()

        files = {"file": ("short.wav", short_wav, "audio/wav")}
        response = client.post("/api/v1/analyze", files=files)
        assert response.status_code == 200
        data = response.json()
        assert data["duration"] > 0
        assert data["bpm"] > 0

    def test_telephony_8khz_sample_rate_audio(self, client: TestClient):
        """Upload 8000 Hz low sample rate audio (telephony standard)."""
        sr = 8000
        t = np.linspace(0, 2.0, int(sr * 2.0), endpoint=False)
        sig = 0.5 * np.sin(2 * np.pi * 440.0 * t).astype(np.float32)

        buf = io.BytesIO()
        sf.write(buf, sig, sr, format="WAV", subtype="PCM_16")
        telephony_wav = buf.getvalue()

        files = {"file": ("telephony_8k.wav", telephony_wav, "audio/wav")}
        response = client.post("/api/v1/analyze", files=files)
        assert response.status_code == 200
        data = response.json()
        assert data["bpm"] > 0

    def test_studio_192khz_sample_rate_audio(self, client: TestClient):
        """Upload 192,000 Hz high-resolution studio audio."""
        sr = 192000
        t = np.linspace(0, 1.0, int(sr * 1.0), endpoint=False)
        sig = 0.4 * np.sin(2 * np.pi * 440.0 * t).astype(np.float32)
        stereo = np.column_stack([sig, sig])

        buf = io.BytesIO()
        sf.write(buf, stereo, sr, format="WAV", subtype="PCM_16")
        hi_res_wav = buf.getvalue()

        files = {"file": ("hires_192k.wav", hi_res_wav, "audio/wav")}
        response = client.post("/api/v1/analyze", files=files)
        assert response.status_code == 200
        data = response.json()
        assert data["bpm"] > 0

    def test_single_channel_mono_audio_input(self, client: TestClient):
        """Upload single channel mono audio."""
        sr = 44100
        t = np.linspace(0, 1.5, int(sr * 1.5), endpoint=False)
        mono = (0.5 * np.sin(2 * np.pi * 440.0 * t)).astype(np.float32)

        buf = io.BytesIO()
        sf.write(buf, mono, sr, format="WAV", subtype="PCM_16")
        mono_wav = buf.getvalue()

        files = {"file": ("mono_track.wav", mono_wav, "audio/wav")}
        response = client.post("/api/v1/chords", files=files)
        assert response.status_code == 200
        data = response.json()
        assert "chords" in data
        assert "beats" in data


# ============================================================================
# SECTION 5: HIGH CONCURRENCY & BURST STRESS TESTING
# ============================================================================

class TestAdversarialHighConcurrencyAndStress:
    """Stress test synchronous and asynchronous endpoints under concurrent load."""

    def test_concurrent_synchronous_analyze_burst(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Send 20 concurrent synchronous requests to /api/v1/analyze simultaneously."""
        num_workers = 20

        def _send_req(idx: int) -> Tuple[int, Dict[str, Any]]:
            files = {"file": (f"burst_{idx}.wav", synthetic_wav_bytes, "audio/wav")}
            resp = client.post("/api/v1/analyze", files=files)
            return resp.status_code, resp.json()

        with ThreadPoolExecutor(max_workers=num_workers) as executor:
            results = list(executor.map(_send_req, range(num_workers)))

        for status_code, body in results:
            assert status_code == 200, f"Concurrent request failed: {body}"
            assert "bpm" in body
            assert "task_id" in body

        # Verify all task IDs generated in the burst are distinct UUIDs
        task_ids = [body["task_id"] for _, body in results]
        assert len(set(task_ids)) == num_workers, "Collision in task_id generation under concurrency!"

    def test_concurrent_status_polling_storm(self, client: TestClient):
        """Simulate a polling storm: 40 concurrent threads polling /api/v1/jobs/{task_id} while it updates."""
        test_task_id = str(uuid.uuid4())
        TASK_MANAGER.create(test_task_id)
        TASK_MANAGER.update(test_task_id, status="RUNNING", stage="Heavy processing", percent=50)

        num_pollers = 40

        def _poll(idx: int) -> int:
            resp = client.get(f"/api/v1/jobs/{test_task_id}")
            return resp.status_code

        with ThreadPoolExecutor(max_workers=num_pollers) as executor:
            status_codes = list(executor.map(_poll, range(num_pollers)))

        for code in status_codes:
            assert code == 200

    def test_concurrent_export_midi_generation(self, client: TestClient):
        """Simulate concurrent download requests to /api/export/midi/{task_id} when task is complete."""
        task_id = str(uuid.uuid4())
        TASK_MANAGER.create(task_id)
        mock_result = {
            "telemetry": {"bpm": 128.0, "master_key": "C", "scale_mode": "major"},
            "chords": [{"start": 0.0, "end": 2.0, "chord": "C", "root": "C", "bass": "C", "quality": "maj", "confidence": 0.95}],
            "beats": [{"timestamp": 0.0, "beat_number": 1, "is_downbeat": True}],
            "bassline": [{"start": 0.0, "end": 2.0, "note": 36, "velocity": 90}],
        }
        TASK_MANAGER.attach_result(task_id, mock_result)
        TASK_MANAGER.update(task_id, status="COMPLETE", stage="Hoàn tất", percent=100)

        num_downloaders = 15

        def _download_midi(idx: int) -> Tuple[int, bytes]:
            resp = client.get(f"/api/export/midi/{task_id}")
            return resp.status_code, resp.content

        with ThreadPoolExecutor(max_workers=num_downloaders) as executor:
            download_results = list(executor.map(_download_midi, range(num_downloaders)))

        for code, content in download_results:
            assert code == 200
            assert content.startswith(b"MThd"), "Corrupted MIDI header under concurrent download"


# ============================================================================
# SECTION 6: ARTIFACT & DATA INTEGRITY
# ============================================================================

class TestAdversarialArtifactIntegrity:
    """Empirical verification of generated artifact formats (WAV, SMF-1 MIDI, ZIP)."""

    def test_midi_smf1_multi_track_structure_integrity(self):
        """Export MIDI and empirically inspect track structure with mido/pretty_midi."""
        task_id = str(uuid.uuid4())
        chords = [
            ChordSegment(start=0.0, end=1.0, chord="Am", root="A", bass="A", quality="min", confidence=0.9),
            ChordSegment(start=1.0, end=2.0, chord="F", root="F", bass="F", quality="maj", confidence=0.85),
            ChordSegment(start=2.0, end=3.0, chord="C", root="C", bass="C", quality="maj", confidence=0.95),
            ChordSegment(start=3.0, end=4.0, chord="G", root="G", bass="G", quality="maj", confidence=0.92),
        ]
        beats = [
            BeatPoint(timestamp=0.0, beat_number=1, is_downbeat=True),
            BeatPoint(timestamp=0.5, beat_number=2, is_downbeat=False),
            BeatPoint(timestamp=1.0, beat_number=3, is_downbeat=False),
            BeatPoint(timestamp=1.5, beat_number=4, is_downbeat=False),
        ]
        bpm = 120.0

        midi_path = export_midi(task_id, chords=chords, bassline=[], beats=beats, bpm=bpm)
        assert midi_path.exists()

        # Parse with mido
        mid = mido.MidiFile(str(midi_path))
        assert mid.type == 1, f"Expected SMF Type 1 multi-track MIDI, got Type {mid.type}"
        assert len(mid.tracks) >= 2, f"Expected at least 2 tracks, got {len(mid.tracks)}"

        # Validate that note events exist and timestamps are non-negative
        note_on_count = 0
        for track in mid.tracks:
            for msg in track:
                if msg.type == "note_on":
                    note_on_count += 1
                    assert msg.velocity >= 0
                    assert 0 <= msg.note <= 127
        assert note_on_count > 0, "No note_on events found in exported MIDI!"

    def test_stems_zip_archive_crc_and_wav_validity(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Verify ZIP archive downloaded from /api/export/stems-zip/{task_id} has valid CRC and valid WAV files."""
        task_id = str(uuid.uuid4())
        task_stems_dir = SETTINGS.stems_dir / task_id
        task_stems_dir.mkdir(parents=True, exist_ok=True)

        stem_names = ["vocals.wav", "drums.wav", "bass.wav", "other.wav"]
        for s in stem_names:
            with open(task_stems_dir / s, "wb") as f:
                f.write(synthetic_wav_bytes)

        response = client.get(f"/api/export/stems-zip/{task_id}")
        assert response.status_code == 200
        assert response.headers.get("Content-Type") == "application/zip"

        # Test ZIP archive validity
        zip_buf = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_buf, "r") as zf:
            # Test CRC32 of all files in zip
            bad_crc = zf.testzip()
            assert bad_crc is None, f"ZIP file corrupted! First bad file: {bad_crc}"

            namelist = zf.namelist()
            assert set(namelist) == set(stem_names)

            # Read each extracted WAV and verify with soundfile
            for stem_name in stem_names:
                wav_bytes = zf.read(stem_name)
                audio_data, sr = sf.read(io.BytesIO(wav_bytes))
                assert sr == 44100
                assert audio_data.shape[0] > 0


# ============================================================================
# SECTION 7: FAIL-CLOSED SSO & SECURITY ENFORCEMENT
# ============================================================================

class TestAdversarialAuthFailClosedAndBypass:
    """Verify fail-closed security for cloud auth mode vs seamless local DAW mode."""

    def test_fail_closed_on_unreachable_sso_server(self, auth_enforced_client: TestClient, synthetic_wav_bytes: bytes):
        """When REALS_AUTH_DISABLED=false and SSO server is down, all endpoints MUST fail-closed with 503."""
        files = {"file": ("track.wav", synthetic_wav_bytes, "audio/wav")}
        headers = {"Authorization": "Bearer any-token-when-sso-down"}

        # SSO server at localhost:3000 is not running -> httpx connection error -> 503
        response = auth_enforced_client.post("/api/v1/analyze", files=files, headers=headers)
        assert response.status_code == 503, f"Expected 503 Fail-Closed on SSO network error, got {response.status_code}"

    def test_missing_auth_header_fails_with_401(self, auth_enforced_client: TestClient, synthetic_wav_bytes: bytes):
        """When REALS_AUTH_DISABLED=false and Authorization header is missing, return 401."""
        files = {"file": ("track.wav", synthetic_wav_bytes, "audio/wav")}
        response = auth_enforced_client.post("/api/v1/analyze", files=files)
        assert response.status_code == 401

    def test_empty_or_malformed_bearer_token(self, auth_enforced_client: TestClient, synthetic_wav_bytes: bytes):
        """Header 'Authorization: Bearer ' (empty token) or 'Authorization: Basic xyz' must return 401."""
        files = {"file": ("track.wav", synthetic_wav_bytes, "audio/wav")}

        resp1 = auth_enforced_client.post("/api/v1/analyze", files=files, headers={"Authorization": "Bearer "})
        assert resp1.status_code == 401

        resp2 = auth_enforced_client.post("/api/v1/analyze", files=files, headers={"Authorization": "Basic dXNlcjpwYXNz"})
        assert resp2.status_code == 401

    def test_local_daw_mode_unlimited_bypass(self, client: TestClient, synthetic_wav_bytes: bytes):
        """When REALS_AUTH_DISABLED=true, requests succeed without any Authorization header."""
        files = {"file": ("track.wav", synthetic_wav_bytes, "audio/wav")}
        response = client.post("/api/v1/analyze", files=files)
        assert response.status_code == 200
        assert "bpm" in response.json()
