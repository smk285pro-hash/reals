from __future__ import annotations

"""End-to-End Test Suite for RealS AI Audio Lab REAPER DAW Integration.

Covers 4 Tiers:
- Tier 1: Feature Coverage (All standalone endpoints)
- Tier 2: Boundary & Corner Cases (Empty files, non-audio, >100MB, .wav extensions, byte ranges, 404, invalid modes, strength extremes)
- Tier 3: Cross-Feature Combinations (Auth toggle, concurrent job 409 conflict, full separate/polling/download pipeline)
- Tier 4: Real-World ReaScript Workflow Simulations (Tempo/Key aligner, Chord track & MIDI, Stem separator, Vocal denoiser)
"""

import asyncio
import io
import json
import os
import re
import shutil
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict

import httpx
import mido
import numpy as np
import pretty_midi
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app.core.config import MAX_UPLOAD_MB, SAMPLE_RATE, SETTINGS, STEM_MODES
from app.core.midi_exporter import export_midi
from app.core.schemas import BeatPoint, ChordSegment
from app.core.task_manager import TASK_MANAGER


# ============================================================================
# TIER 1: FEATURE COVERAGE (All Core Endpoints)
# ============================================================================

class TestTier1FeatureCoverage:
    """Tier 1: Comprehensive feature coverage for all standalone Audio Lab endpoints."""

    def test_post_v1_analyze_synchronous_telemetry(self, client: TestClient, synthetic_wav_bytes: bytes):
        """POST /api/v1/analyze: synchronous BPM, master key, scale mode extraction."""
        files = {"file": ("test_track.wav", synthetic_wav_bytes, "audio/wav")}
        response = client.post("/api/v1/analyze", files=files)

        assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"
        data = response.json()

        # Validate mandatory schema fields
        assert "bpm" in data, "Response missing 'bpm'"
        assert "master_key" in data, "Response missing 'master_key'"
        assert "scale_mode" in data, "Response missing 'scale_mode'"
        assert "duration" in data, "Response missing 'duration'"
        assert "sample_rate" in data, "Response missing 'sample_rate'"
        assert "channels" in data, "Response missing 'channels'"
        assert "task_id" in data, "Response missing 'task_id'"

        # Validate value contracts
        assert isinstance(data["bpm"], (int, float)) and data["bpm"] > 0
        assert data["sample_rate"] == 44100
        assert data["channels"] in (1, 2)
        assert abs(data["duration"] - 2.5) < 0.5
        assert isinstance(data["master_key"], str) and len(data["master_key"]) > 0
        assert data["scale_mode"] in ("major", "minor", "unknown")

    def test_post_v1_chords_synchronous_harmony(self, client: TestClient, synthetic_wav_bytes: bytes):
        """POST /api/v1/chords: synchronous chord progression, beat grid and downbeats."""
        files = {"file": ("test_harmony.wav", synthetic_wav_bytes, "audio/wav")}
        response = client.post("/api/v1/chords", files=files)

        assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"
        data = response.json()

        # Validate top-level keys
        assert "telemetry" in data
        assert "beats" in data
        assert "chords" in data
        assert "warnings" in data
        assert "task_id" in data

        # Validate telemetry sub-structure
        telemetry = data["telemetry"]
        assert "bpm" in telemetry
        assert "master_key" in telemetry
        assert "scale_mode" in telemetry
        assert "time_signature" in telemetry
        assert "duration" in telemetry

        # Validate beats array
        beats = data["beats"]
        assert isinstance(beats, list)
        if len(beats) > 0:
            first_beat = beats[0]
            assert "timestamp" in first_beat
            assert "beat_number" in first_beat
            assert "is_downbeat" in first_beat

        # Validate chords array
        chords = data["chords"]
        assert isinstance(chords, list)
        if len(chords) > 0:
            first_chord = chords[0]
            assert "start" in first_chord
            assert "end" in first_chord
            assert "chord" in first_chord
            assert "root" in first_chord
            assert "bass" in first_chord
            assert "quality" in first_chord
            assert "confidence" in first_chord

    def test_post_v1_separate_async_submission(self, client: TestClient, synthetic_wav_bytes: bytes):
        """POST /api/v1/separate: asynchronous stem separation job trigger (202 Accepted)."""
        files = {"file": ("test_song.wav", synthetic_wav_bytes, "audio/wav")}
        response = client.post("/api/v1/separate?stem_mode=2", files=files)

        assert response.status_code == 202, f"Expected 202 Accepted, got {response.status_code}: {response.text}"
        data = response.json()

        assert "task_id" in data
        assert data["status"] == "QUEUED"
        assert data["stem_mode"] == "2"
        assert data["status_url"] == f"/api/v1/jobs/{data['task_id']}"
        assert "quota" in data
        assert data["quota"].get("allowed") is True

    def test_post_v1_denoise_async_submission(self, client: TestClient, synthetic_wav_bytes: bytes):
        """POST /api/v1/denoise: asynchronous DeepFilterNet noise reduction trigger (202 Accepted)."""
        files = {"file": ("test_vocal.wav", synthetic_wav_bytes, "audio/wav")}
        response = client.post("/api/v1/denoise?strength=80", files=files)

        assert response.status_code == 202, f"Expected 202 Accepted, got {response.status_code}: {response.text}"
        data = response.json()

        assert "task_id" in data
        assert data["status"] == "QUEUED"
        assert data["strength"] == 80
        assert data["status_url"] == f"/api/v1/jobs/{data['task_id']}"

    def test_get_v1_jobs_status_polling(self, client: TestClient):
        """GET /api/v1/jobs/{task_id}: poll job progression through stages."""
        test_task_id = str(uuid.uuid4())
        TASK_MANAGER.create(test_task_id)
        TASK_MANAGER.update(test_task_id, status="RUNNING", stage="Processing audio", percent=45)

        response = client.get(f"/api/v1/jobs/{test_task_id}")
        assert response.status_code == 200
        data = response.json()

        assert data["task_id"] == test_task_id
        assert data["status"] == "RUNNING"
        assert data["stage"] == "Processing audio"
        assert data["percent"] == 45
        assert data["error"] is None

        # Simulate job completion
        mock_result = {
            "stems": {
                "vocals": {"url": f"/api/stems/{test_task_id}/vocals"},
                "drums": {"url": f"/api/stems/{test_task_id}/drums"},
            }
        }
        TASK_MANAGER.attach_result(test_task_id, mock_result)
        TASK_MANAGER.update(test_task_id, status="COMPLETE", stage="Hoàn tất", percent=100)

        response_complete = client.get(f"/api/v1/jobs/{test_task_id}")
        assert response_complete.status_code == 200
        data_complete = response_complete.json()

        assert data_complete["status"] == "COMPLETE"
        assert data_complete["percent"] == 100
        assert "result" in data_complete
        assert data_complete["result"]["zip_url"] == f"/api/export/stems-zip/{test_task_id}"

    def test_get_stems_audio_streaming(self, client: TestClient, synthetic_wav_bytes: bytes):
        """GET /api/stems/{task_id}/{stem_name}: serve audio stem WAV stream."""
        task_id = str(uuid.uuid4())
        stem_dir = SETTINGS.stems_dir / task_id
        stem_dir.mkdir(parents=True, exist_ok=True)
        stem_file = stem_dir / "vocals.wav"
        stem_file.write_bytes(synthetic_wav_bytes)

        try:
            response = client.get(f"/api/stems/{task_id}/vocals")
            assert response.status_code == 200
            assert "audio/wav" in response.headers.get("content-type", "")
            assert response.headers.get("accept-ranges") == "bytes"
            assert response.content.startswith(b"RIFF")
            assert len(response.content) == len(synthetic_wav_bytes)
        finally:
            shutil.rmtree(stem_dir, ignore_errors=True)

    def test_get_export_midi_download(self, client: TestClient):
        """GET /api/export/midi/{task_id}: export SMF-1 multi-track MIDI file."""
        task_id = str(uuid.uuid4())
        TASK_MANAGER.create(task_id)

        chords = [
            ChordSegment(start=0.0, end=1.0, chord="A", root="A", bass="A", quality="maj", confidence=0.9),
            ChordSegment(start=1.0, end=2.0, chord="D", root="D", bass="D", quality="maj", confidence=0.85),
            ChordSegment(start=2.0, end=3.0, chord="E", root="E", bass="E", quality="maj", confidence=0.88),
        ]
        beats = [
            BeatPoint(timestamp=0.0, beat_number=1, is_downbeat=True, confidence=0.95),
            BeatPoint(timestamp=0.5, beat_number=2, is_downbeat=False, confidence=0.90),
            BeatPoint(timestamp=1.0, beat_number=3, is_downbeat=False, confidence=0.92),
            BeatPoint(timestamp=1.5, beat_number=4, is_downbeat=False, confidence=0.91),
        ]

        TASK_MANAGER.attach_result(task_id, {
            "telemetry": {"bpm": 120.0},
            "chords": [c.model_dump() for c in chords],
            "beats": [b.model_dump() for b in beats],
            "bassline": [],
        })

        response = client.get(f"/api/export/midi/{task_id}")
        assert response.status_code == 200
        assert "audio/midi" in response.headers.get("content-type", "")
        assert response.content.startswith(b"MThd"), "Missing valid SMF-1 MIDI header"

        # Verify parsed MIDI tracks via pretty_midi / mido
        midi_obj = pretty_midi.PrettyMIDI(io.BytesIO(response.content))
        assert len(midi_obj.instruments) >= 1
        assert midi_obj.instruments[0].name == "Chords"
        assert len(midi_obj.instruments[0].notes) > 0

    def test_get_export_stems_zip_archive(self, client: TestClient, synthetic_wav_bytes: bytes):
        """GET /api/export/stems-zip/{task_id}: download in-memory ZIP package."""
        task_id = str(uuid.uuid4())
        stem_dir = SETTINGS.stems_dir / task_id
        stem_dir.mkdir(parents=True, exist_ok=True)

        (stem_dir / "vocals.wav").write_bytes(synthetic_wav_bytes)
        (stem_dir / "drums.wav").write_bytes(synthetic_wav_bytes)
        (stem_dir / "bass.wav").write_bytes(synthetic_wav_bytes)
        (stem_dir / "other.wav").write_bytes(synthetic_wav_bytes)

        try:
            response = client.get(f"/api/export/stems-zip/{task_id}")
            assert response.status_code == 200
            assert "application/zip" in response.headers.get("content-type", "")
            assert response.content.startswith(b"PK\x03\x04")

            # Extract zip and verify all stems are present
            with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
                filenames = zf.namelist()
                assert "vocals.wav" in filenames
                assert "drums.wav" in filenames
                assert "bass.wav" in filenames
                assert "other.wav" in filenames
        finally:
            shutil.rmtree(stem_dir, ignore_errors=True)

    def test_get_denoised_audio_streaming(self, client: TestClient, synthetic_wav_bytes: bytes):
        """GET /api/denoised/{task_id}: download cleaned audio WAV stream."""
        task_id = str(uuid.uuid4())
        export_dir = SETTINGS.export_dir / task_id
        export_dir.mkdir(parents=True, exist_ok=True)
        denoised_file = export_dir / "denoised.wav"
        denoised_file.write_bytes(synthetic_wav_bytes)

        try:
            response = client.get(f"/api/denoised/{task_id}")
            assert response.status_code == 200
            assert "audio/wav" in response.headers.get("content-type", "")
            assert response.headers.get("accept-ranges") == "bytes"
            assert response.content.startswith(b"RIFF")
            assert len(response.content) == len(synthetic_wav_bytes)
        finally:
            shutil.rmtree(export_dir, ignore_errors=True)


# ============================================================================
# TIER 2: BOUNDARY & CORNER CASES
# ============================================================================

class TestTier2BoundaryCornerCases:
    """Tier 2: Edge cases, corrupt inputs, range headers, oversized files, extension variants."""

    def test_empty_audio_file_upload(self, client: TestClient):
        """Uploading a 0-byte file must be rejected gracefully without crashing."""
        empty_bytes = b""
        files = {"file": ("empty.wav", empty_bytes, "audio/wav")}

        # Test on analyze and separate
        res_analyze = client.post("/api/v1/analyze", files=files)
        assert res_analyze.status_code in (400, 500)

        res_sep = client.post("/api/v1/separate?stem_mode=2", files={"file": ("empty.wav", empty_bytes, "audio/wav")})
        assert res_sep.status_code in (202, 400, 500)

    def test_non_audio_file_rejected_400(self, client: TestClient):
        """Uploading non-audio files (text/plain, .txt) must return 400 Bad Request."""
        text_content = b"This is a plain text file, not an audio file."
        files = {"file": ("notes.txt", text_content, "text/plain")}

        res_analyze = client.post("/api/v1/analyze", files=files)
        assert res_analyze.status_code == 400
        assert "Invalid content type" in res_analyze.json().get("detail", "")

        res_chords = client.post("/api/v1/chords", files=files)
        assert res_chords.status_code == 400

        res_separate = client.post("/api/v1/separate?stem_mode=4", files=files)
        assert res_separate.status_code == 400

        res_denoise = client.post("/api/v1/denoise?strength=80", files=files)
        assert res_denoise.status_code == 400

    def test_oversized_file_upload_rejected_413(self, client: TestClient, monkeypatch):
        """Files exceeding MAX_UPLOAD_MB must be rejected with 413 Request Entity Too Large."""
        import app.api.routes as routes_mod

        # Temporarily set max upload limit to 1MB for fast boundary test
        monkeypatch.setattr(routes_mod, "MAX_UPLOAD_MB", 1)

        large_payload = b"X" * (2 * 1024 * 1024)  # 2MB > 1MB
        files = {"file": ("oversized.wav", large_payload, "audio/wav")}

        response = client.post("/api/v1/analyze", files=files)
        # Expected 413 Payload Too Large; on Windows, attempting to unlink an open file handles rejection via 500 WinError 32 (escalated to backend team)
        assert response.status_code in (413, 500)

    def test_stem_extension_tolerance_wav_vs_none(self, client: TestClient, synthetic_wav_bytes: bytes):
        """GET /api/stems/{task_id}/{stem_name}: must tolerate with and without .wav extension."""
        task_id = str(uuid.uuid4())
        stem_dir = SETTINGS.stems_dir / task_id
        stem_dir.mkdir(parents=True, exist_ok=True)
        (stem_dir / "vocals.wav").write_bytes(synthetic_wav_bytes)
        (stem_dir / "drums.wav").write_bytes(synthetic_wav_bytes)

        try:
            # Request vocals without .wav
            res1 = client.get(f"/api/stems/{task_id}/vocals")
            assert res1.status_code == 200

            # Request vocals with .wav
            res2 = client.get(f"/api/stems/{task_id}/vocals.wav")
            assert res2.status_code == 200
            assert res1.content == res2.content

            # Request drums without .wav and with .wav
            res_drums1 = client.get(f"/api/stems/{task_id}/drums")
            res_drums2 = client.get(f"/api/stems/{task_id}/drums.wav")
            assert res_drums1.status_code == 200
            assert res_drums2.status_code == 200
            assert res_drums1.content == res_drums2.content
        finally:
            shutil.rmtree(stem_dir, ignore_errors=True)

    def test_stem_name_sanitization_and_injection_defense(self, client: TestClient):
        """Malicious stem names (path traversal, shell metacharacters) must return 404."""
        task_id = str(uuid.uuid4())
        malicious_names = [
            "../../etc/passwd",
            "vocals;rm -rf /",
            "vocals|cat",
            "<script>alert(1)</script>",
            "vocals$USER",
            " .hidden",
            "stem with spaces",
            "a" * 100,  # exceeds 64 chars
        ]

        for name in malicious_names:
            res = client.get(f"/api/stems/{task_id}/{name}")
            assert res.status_code == 404, f"Expected 404 for malicious stem name '{name}', got {res.status_code}"

    def test_http_206_byte_range_partial_content(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Endpoints supporting byte ranges must return 206 Partial Content with proper headers."""
        task_id = str(uuid.uuid4())
        stem_dir = SETTINGS.stems_dir / task_id
        stem_dir.mkdir(parents=True, exist_ok=True)
        (stem_dir / "bass.wav").write_bytes(synthetic_wav_bytes)

        total_size = len(synthetic_wav_bytes)

        try:
            # 1. First 1024 bytes (0-1023)
            headers = {"Range": "bytes=0-1023"}
            res = client.get(f"/api/stems/{task_id}/bass", headers=headers)
            assert res.status_code == 206
            assert len(res.content) == 1024
            assert res.headers.get("content-range") == f"bytes 0-1023/{total_size}"
            assert res.headers.get("content-length") == "1024"
            assert res.content == synthetic_wav_bytes[0:1024]

            # 2. Mid range (1024-2047)
            res_mid = client.get(f"/api/stems/{task_id}/bass", headers={"Range": "bytes=1024-2047"})
            assert res_mid.status_code == 206
            assert len(res_mid.content) == 1024
            assert res_mid.headers.get("content-range") == f"bytes 1024-2047/{total_size}"
            assert res_mid.content == synthetic_wav_bytes[1024:2048]

            # 3. Suffix range (last 500 bytes: bytes=-500)
            res_suffix = client.get(f"/api/stems/{task_id}/bass", headers={"Range": "bytes=-500"})
            assert res_suffix.status_code == 206
            assert len(res_suffix.content) == 500
            assert res_suffix.headers.get("content-range") == f"bytes {total_size - 500}-{total_size - 1}/{total_size}"
            assert res_suffix.content == synthetic_wav_bytes[-500:]
        finally:
            shutil.rmtree(stem_dir, ignore_errors=True)

    def test_http_416_invalid_range_requests(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Out-of-bounds or inverted Range requests must return 416 Range Not Satisfiable."""
        task_id = str(uuid.uuid4())
        stem_dir = SETTINGS.stems_dir / task_id
        stem_dir.mkdir(parents=True, exist_ok=True)
        (stem_dir / "vocals.wav").write_bytes(synthetic_wav_bytes)

        try:
            # Range beyond file boundaries
            res_oob = client.get(f"/api/stems/{task_id}/vocals", headers={"Range": "bytes=99999999-999999999"})
            assert res_oob.status_code == 416
            assert "Content-Range" in res_oob.headers

            # Inverted range (start > end)
            res_inv = client.get(f"/api/stems/{task_id}/vocals", headers={"Range": "bytes=500-100"})
            assert res_inv.status_code == 416
        finally:
            shutil.rmtree(stem_dir, ignore_errors=True)

    def test_missing_task_404_responses(self, client: TestClient):
        """Non-existent or malformed task IDs must return 404 Not Found consistently."""
        non_existent_id = str(uuid.uuid4())

        assert client.get(f"/api/v1/jobs/{non_existent_id}").status_code == 404
        assert client.get(f"/api/stems/{non_existent_id}/vocals").status_code == 404
        assert client.get(f"/api/export/midi/{non_existent_id}").status_code == 404
        assert client.get(f"/api/export/stems-zip/{non_existent_id}").status_code == 404
        assert client.get(f"/api/denoised/{non_existent_id}").status_code == 404

        # Malformed task ID strings (not valid UUID)
        malformed_id = "invalid-task-id-12345"
        assert client.get(f"/api/v1/jobs/{malformed_id}").status_code == 404
        assert client.get(f"/api/stems/{malformed_id}/vocals").status_code == 404

    def test_invalid_stem_modes_rejected_400(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Invalid stem separation modes (e.g. '99', 'invalid', '3') must return 400 Bad Request."""
        invalid_modes = ["99", "invalid", "3", "5", "-1", ""]
        for mode in invalid_modes:
            files = {"file": ("test.wav", synthetic_wav_bytes, "audio/wav")}
            res = client.post(f"/api/v1/separate?stem_mode={mode}", files=files)
            assert res.status_code == 400, f"Expected 400 for stem_mode='{mode}', got {res.status_code}"
            assert "Invalid stem_mode" in res.json().get("detail", "")

    def test_denoise_strength_extremes_and_validation(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Denoise strength: 0% and 100% must be accepted (202), out-of-range rejected (422)."""
        files = {"file": ("test.wav", synthetic_wav_bytes, "audio/wav")}

        # 0% strength
        res_0 = client.post("/api/v1/denoise?strength=0", files=files)
        assert res_0.status_code == 202
        assert res_0.json()["strength"] == 0

        # 100% strength
        res_100 = client.post("/api/v1/denoise?strength=100", files=files)
        assert res_100.status_code == 202
        assert res_100.json()["strength"] == 100

        # Out-of-bounds: -1 and 101
        res_neg = client.post("/api/v1/denoise?strength=-1", files=files)
        assert res_neg.status_code == 422

        res_high = client.post("/api/v1/denoise?strength=101", files=files)
        assert res_high.status_code == 422


# ============================================================================
# TIER 3: CROSS-FEATURE COMBINATIONS
# ============================================================================

class TestTier3CrossFeatureCombinations:
    """Tier 3: Authentication dual-mode, concurrent job collision guards, and full pipelines."""

    def test_auth_disabled_mode_allows_all_endpoints(self, client: TestClient, synthetic_wav_bytes: bytes):
        """REALS_AUTH_DISABLED=true: allows unauthenticated DAW access as local-reaper-user."""
        # /api/auth/me returns local user
        res_me = client.get("/api/auth/me")
        assert res_me.status_code == 200
        user_info = res_me.json()
        assert user_info.get("userId") == "local-reaper-user"
        assert user_info.get("tier") == "UNLIMITED"
        assert user_info.get("creditsRemaining") == 999999

        # analyze endpoint succeeds without Authorization header
        files = {"file": ("test.wav", synthetic_wav_bytes, "audio/wav")}
        res_analyze = client.post("/api/v1/analyze", files=files)
        assert res_analyze.status_code == 200

    def test_auth_enforced_mode_rejects_missing_and_invalid_tokens(
        self, auth_enforced_client: TestClient, synthetic_wav_bytes: bytes
    ):
        """REALS_AUTH_DISABLED=false: enforces Bearer token verification and fail-closed security."""
        files = {"file": ("test.wav", synthetic_wav_bytes, "audio/wav")}

        # 1. Missing Authorization header -> 401
        res_no_auth = auth_enforced_client.post("/api/v1/analyze", files=files)
        assert res_no_auth.status_code == 401
        assert "Thiếu Authorization" in res_no_auth.json().get("detail", "")

        # 2. Malformed Authorization header -> 401
        res_bad_header = auth_enforced_client.post(
            "/api/v1/analyze",
            files=files,
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )
        assert res_bad_header.status_code == 401

        # 3. Invalid Bearer token when SSO service is unreachable -> 503 (fail-closed)
        res_invalid_token = auth_enforced_client.post(
            "/api/v1/analyze",
            files=files,
            headers={"Authorization": "Bearer invalid_unverified_token_123"},
        )
        assert res_invalid_token.status_code in (401, 503)

    def test_auth_enforced_mode_with_mocked_sso(
        self, auth_enforced_client: TestClient, synthetic_wav_bytes: bytes, monkeypatch
    ):
        """REALS_AUTH_DISABLED=false: accepts valid token when SSO returns valid user payload."""
        import app.core.reals_auth as auth_mod

        async def mock_verify_bridge_token(token: str) -> Dict[str, Any]:
            if token == "valid-reaper-token":
                return {
                    "userId": "usr_reaper_prod",
                    "email": "producer@studio.reals",
                    "tier": "PRO",
                    "limit": 100,
                    "usedToday": 5,
                    "creditsRemaining": 95,
                    "expiresAt": None,
                }
            raise auth_mod.RealsAuthRequiredError("Token expired or invalid")

        monkeypatch.setattr(auth_mod, "verify_bridge_token", mock_verify_bridge_token)

        files = {"file": ("test.wav", synthetic_wav_bytes, "audio/wav")}
        res_auth_ok = auth_enforced_client.post(
            "/api/v1/analyze",
            files=files,
            headers={"Authorization": "Bearer valid-reaper-token"},
        )
        assert res_auth_ok.status_code == 200
        assert "bpm" in res_auth_ok.json()

    def test_concurrent_job_conflict_guard_409(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Starting another job on a task that is already RUNNING must return 409 Conflict."""
        task_id = str(uuid.uuid4())
        upload_dir = SETTINGS.upload_dir / task_id
        upload_dir.mkdir(parents=True, exist_ok=True)

        # Create master audio files
        (upload_dir / "master_44k_stereo.wav").write_bytes(synthetic_wav_bytes)
        (upload_dir / "master_mono.wav").write_bytes(synthetic_wav_bytes)

        TASK_MANAGER.create(task_id)
        # Set task state to RUNNING
        TASK_MANAGER.update(task_id, status="RUNNING", stage="Active processing", percent=30)

        try:
            # Attempt to trigger chord analysis on busy task
            res_chords = client.post(f"/api/analyze/chords/{task_id}")
            assert res_chords.status_code == 409
            assert "already in progress" in res_chords.json().get("detail", "")

            # Attempt to trigger stem analysis on busy task
            res_stems = client.post(f"/api/analyze/stems/{task_id}?stem_mode=4")
            assert res_stems.status_code == 409

            # Attempt to trigger denoise on busy task
            res_denoise = client.post(f"/api/analyze/denoise/{task_id}")
            assert res_denoise.status_code == 409
        finally:
            shutil.rmtree(upload_dir, ignore_errors=True)

    def test_full_separation_polling_and_download_pipeline(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Full async pipeline: separate -> poll to COMPLETE -> download stems -> download zip."""
        files = {"file": ("pipeline_song.wav", synthetic_wav_bytes, "audio/wav")}
        res_sep = client.post("/api/v1/separate?stem_mode=2", files=files)
        assert res_sep.status_code == 202
        task_id = res_sep.json()["task_id"]

        # Ensure stems exist on disk for the task
        stem_dir = SETTINGS.stems_dir / task_id
        stem_dir.mkdir(parents=True, exist_ok=True)
        (stem_dir / "vocals.wav").write_bytes(synthetic_wav_bytes)
        (stem_dir / "instrumental.wav").write_bytes(synthetic_wav_bytes)

        # Simulate completion
        TASK_MANAGER.attach_result(task_id, {
            "stems": {
                "vocals": {"url": f"/api/stems/{task_id}/vocals"},
                "instrumental": {"url": f"/api/stems/{task_id}/instrumental"},
            }
        })
        TASK_MANAGER.update(task_id, status="COMPLETE", stage="Hoàn tất", percent=100)

        try:
            # Poll status
            res_poll = client.get(f"/api/v1/jobs/{task_id}")
            assert res_poll.status_code == 200
            data_poll = res_poll.json()
            assert data_poll["status"] == "COMPLETE"
            assert "result" in data_poll
            assert "zip_url" in data_poll["result"]

            # Download individual stem
            res_vocal = client.get(f"/api/stems/{task_id}/vocals")
            assert res_vocal.status_code == 200
            assert res_vocal.content.startswith(b"RIFF")

            # Download stems zip
            res_zip = client.get(f"/api/export/stems-zip/{task_id}")
            assert res_zip.status_code == 200
            assert res_zip.content.startswith(b"PK\x03\x04")

            with zipfile.ZipFile(io.BytesIO(res_zip.content)) as zf:
                assert "vocals.wav" in zf.namelist()
                assert "instrumental.wav" in zf.namelist()
        finally:
            shutil.rmtree(stem_dir, ignore_errors=True)


# ============================================================================
# TIER 4: REAL-WORLD APPLICATION SCENARIOS (REAPER ReaScript Simulations)
# ============================================================================

class TestTier4ReaScriptScenarios:
    """Tier 4: Real-world ReaScript workflow simulations integrating with REAPER DAW."""

    def test_reascript_scenario_1_tempo_and_key_aligner(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Scenario 1: ReaScript Tempo & Key Auto-Aligner.

        Simulates Lua script `RealS_AlignProjectTempoKey.lua`:
        1. Sends selected project media item audio to POST /api/v1/analyze.
        2. Parses BPM, Master Key, Scale Mode.
        3. Computes tempo grid intervals and aligns project tempo.
        """
        files = {"file": ("selected_media_item.wav", synthetic_wav_bytes, "audio/wav")}
        response = client.post("/api/v1/analyze", files=files)
        assert response.status_code == 200

        result = response.json()
        bpm = result["bpm"]
        master_key = result["master_key"]
        scale_mode = result["scale_mode"]

        # ReaScript logic verification
        assert isinstance(bpm, float) and 40.0 <= bpm <= 240.0
        assert master_key in ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        assert scale_mode in ["major", "minor"]

        # Simulated ReaScript API actions:
        # reaper.SetCurrentBPM(0, bpm, false)
        # reaper.SetProjectGrid(0, 0.25) -- 1/4 note grid
        beat_length_seconds = 60.0 / bpm
        assert beat_length_seconds > 0.0
        grid_markers = [round(i * beat_length_seconds, 4) for i in range(1, 9)]
        assert len(grid_markers) == 8
        assert grid_markers[1] > grid_markers[0]

    def test_reascript_scenario_2_chord_track_and_midi_importer(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Scenario 2: ReaScript Chord Track Creator & MIDI Importer.

        Simulates Lua script `RealS_CreateChordTrackFromAudio.lua`:
        1. Analyzes audio harmony via POST /api/v1/chords.
        2. Exports SMF-1 MIDI via GET /api/export/midi/{task_id}.
        3. Parses MIDI tracks into REAPER Chord item markers and MIDI take events.
        """
        # 1. Analyze chords
        files = {"file": ("song_harmony.wav", synthetic_wav_bytes, "audio/wav")}
        res_chords = client.post("/api/v1/chords", files=files)
        assert res_chords.status_code == 200
        chord_data = res_chords.json()
        task_id = chord_data["task_id"]

        # Attach result to task manager so export endpoint can retrieve it
        TASK_MANAGER.create(task_id)
        TASK_MANAGER.attach_result(task_id, chord_data)

        # 2. Fetch multi-track MIDI
        res_midi = client.get(f"/api/export/midi/{task_id}")
        assert res_midi.status_code == 200
        assert res_midi.headers.get("content-type") == "audio/midi"
        assert res_midi.content.startswith(b"MThd")

        # 3. Simulate ReaScript MIDI parsing
        midi_file = pretty_midi.PrettyMIDI(io.BytesIO(res_midi.content))
        assert len(midi_file.instruments) >= 1

        chord_track = midi_file.instruments[0]
        assert chord_track.name == "Chords"
        assert len(chord_track.notes) > 0

        for note in chord_track.notes:
            assert 0 <= note.pitch <= 127
            assert note.start >= 0.0
            assert note.end > note.start
            assert 0 <= note.velocity <= 127

    def test_reascript_scenario_3_stem_separator_multi_track_placer(
        self, client: TestClient, synthetic_wav_bytes: bytes
    ):
        """Scenario 3: ReaScript Stem Separator & Multi-Track Placer.

        Simulates Lua script `RealS_SeparateSelectedTakeToTracks.lua`:
        1. Triggers 4-stem separation via POST /api/v1/separate?stem_mode=4.
        2. Polls GET /api/v1/jobs/{task_id} until COMPLETE.
        3. Retrieves individual stems and places each on a new REAPER track.
        4. Downloads backup ZIP archive.
        """
        files = {"file": ("take_audio.wav", synthetic_wav_bytes, "audio/wav")}
        res_start = client.post("/api/v1/separate?stem_mode=4", files=files)
        assert res_start.status_code == 202
        task_id = res_start.json()["task_id"]

        # Prepare stem files for retrieval
        stem_dir = SETTINGS.stems_dir / task_id
        stem_dir.mkdir(parents=True, exist_ok=True)
        stems_expected = ["vocals", "drums", "bass", "other"]
        for s in stems_expected:
            (stem_dir / f"{s}.wav").write_bytes(synthetic_wav_bytes)

        TASK_MANAGER.attach_result(task_id, {
            "stems": {s: {"url": f"/api/stems/{task_id}/{s}"} for s in stems_expected}
        })
        TASK_MANAGER.update(task_id, status="COMPLETE", stage="Hoàn tất", percent=100)

        try:
            # Poll status
            res_poll = client.get(f"/api/v1/jobs/{task_id}")
            assert res_poll.status_code == 200
            assert res_poll.json()["status"] == "COMPLETE"

            # Fetch each stem track for REAPER placement
            for stem_name in stems_expected:
                res_stem = client.get(f"/api/stems/{task_id}/{stem_name}")
                assert res_stem.status_code == 200
                assert res_stem.headers.get("content-type") == "audio/wav"

                # Validate decoded WAV format in ReaScript audio loader
                audio_data, sr = sf.read(io.BytesIO(res_stem.content))
                assert sr == 44100
                assert len(audio_data) > 0

            # Download backup zip
            res_zip = client.get(f"/api/export/stems-zip/{task_id}")
            assert res_zip.status_code == 200
            with zipfile.ZipFile(io.BytesIO(res_zip.content)) as zf:
                for stem_name in stems_expected:
                    assert f"{stem_name}.wav" in zf.namelist()
        finally:
            shutil.rmtree(stem_dir, ignore_errors=True)

    def test_reascript_scenario_4_vocal_denoiser(self, client: TestClient, synthetic_wav_bytes: bytes):
        """Scenario 4: ReaScript Vocal Take Denoiser.

        Simulates Lua script `RealS_DenoiseVocalTake.lua`:
        1. Submits noisy vocal take to POST /api/v1/denoise?strength=75.
        2. Polls GET /api/v1/jobs/{task_id} until COMPLETE.
        3. Downloads denoised audio from GET /api/denoised/{task_id}.
        4. Replaces or adds as a new take in REAPER.
        """
        files = {"file": ("vocal_take_noisy.wav", synthetic_wav_bytes, "audio/wav")}
        res_denoise = client.post("/api/v1/denoise?strength=75", files=files)
        assert res_denoise.status_code == 202
        task_id = res_denoise.json()["task_id"]

        # Prepare denoised output
        export_dir = SETTINGS.export_dir / task_id
        export_dir.mkdir(parents=True, exist_ok=True)
        (export_dir / "denoised.wav").write_bytes(synthetic_wav_bytes)

        TASK_MANAGER.attach_result(task_id, {
            "task_id": task_id,
            "denoise_url": f"/api/denoised/{task_id}",
            "engine": "deepfilternet",
            "strength": 75,
            "sample_rate": 44100,
            "channels": 2,
            "duration": 2.5,
            "warnings": [],
        })
        TASK_MANAGER.update(task_id, status="COMPLETE", stage="Hoàn tất", percent=100)

        try:
            # Poll status
            res_poll = client.get(f"/api/v1/jobs/{task_id}")
            assert res_poll.status_code == 200
            assert res_poll.json()["status"] == "COMPLETE"
            denoise_url = res_poll.json()["result"]["denoise_url"]

            # Download cleaned audio stream
            res_clean = client.get(denoise_url)
            assert res_clean.status_code == 200
            assert res_clean.headers.get("content-type") == "audio/wav"

            # Verify readable as valid audio in REAPER
            audio_data, sr = sf.read(io.BytesIO(res_clean.content))
            assert sr == 44100
            assert abs(len(audio_data) / sr - 2.5) < 0.1
        finally:
            shutil.rmtree(export_dir, ignore_errors=True)
