"""Adversarial Empirical Verification & Stress Test Suite.

Author: Empirical Challenger Agent
Target Codebase: reals/apps/stem-app/backend
Scope:
1. SMF-1 Multi-Track MIDI Binary Structure Verification (Headers, Tracks, Channels, Velocity, Note Intervals, Range Clamping)
2. HTTP 206 Partial Content Byte-Range Streaming (RFC 7233 byte-exact verification across all streaming endpoints)
3. Stem Extension Normalization & Sanitization (.wav vs non-.wav, security fuzzing, path traversal defense)
4. Simulated REAPER Lua/Python ReaScript DAW Integration Workflows & Dual-Mode Auth (Local vs Cloud)
"""
from __future__ import annotations

import io
import json
import os
import shutil
import struct
import sys
import tempfile
import time
import urllib.parse
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Fix Windows console encoding
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Enable local DAW auth mode
os.environ["REALS_AUTH_DISABLED"] = "true"

import httpx
import mido
import numpy as np
import pretty_midi
import soundfile as sf
from fastapi.testclient import TestClient

from app.core.bass_engine import BassNote
from app.core.config import SETTINGS
from app.core.midi_exporter import export_midi
from app.core.schemas import BeatPoint, ChordSegment
from app.core.task_manager import TASK_MANAGER
import app.core.reals_auth as auth_mod
from app.main import app

client = TestClient(app)

print(f"=== INITIALIZING EMPIRICAL CHALLENGER TEST SUITE ===")
print(f"Target Backend: {backend_dir}")
print(f"Python: {sys.version}")


# Helper to generate test audio
def generate_synthetic_audio(duration: float = 3.0, sr: int = 44100) -> bytes:
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # Harmony (A major triad: 440, 554.37, 659.25), Bass (110Hz), Beat Clicks
    sig = 0.3 * np.sin(2 * np.pi * 440.0 * t) + 0.2 * np.sin(2 * np.pi * 554.37 * t) + 0.2 * np.sin(2 * np.pi * 659.25 * t)
    bass = 0.3 * np.sin(2 * np.pi * 110.0 * t)
    stereo = np.column_stack([sig + bass, sig + bass]).astype(np.float32)
    buf = io.BytesIO()
    sf.write(buf, stereo, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


test_wav_bytes = generate_synthetic_audio(duration=2.5)


# ============================================================================
# SECTION 1: SMF-1 MULTI-TRACK MIDI BINARY STRUCTURE EMPIRICAL TESTS
# ============================================================================

def test_smf1_midi_binary_structure():
    print("\n--- [TEST 1] SMF-1 Multi-Track MIDI Binary Structures ---")
    task_id = f"test-midi-{uuid.uuid4()}"

    # Rich chord progression including slash chords and varied qualities
    chords = [
        ChordSegment(start=0.0, end=1.0, chord="C", root="C", bass="C", quality="maj", confidence=0.98),
        ChordSegment(start=1.0, end=2.0, chord="G/B", root="G", bass="B", quality="maj", confidence=0.95),
        ChordSegment(start=2.0, end=3.0, chord="Am7", root="A", bass="A", quality="min7", confidence=0.92),
        ChordSegment(start=3.0, end=4.0, chord="Fmaj7", root="F", bass="F", quality="maj7", confidence=0.90),
        ChordSegment(start=4.0, end=5.0, chord="N", root="N", bass="N", quality="none", confidence=0.0), # Should be skipped
        ChordSegment(start=5.0, end=5.0, chord="G", root="G", bass="G", quality="maj", confidence=0.8), # Zero length -> skipped
    ]

    bassline = [
        BassNote(start=0.0, end=1.0, midi=36.0, confidence=0.95),   # C2 (36) -> within 28-53
        BassNote(start=1.0, end=2.0, midi=71.0, confidence=0.90),   # B4 (71) -> must transpose down into [28, 53] (71 - 24 = 47, B2)
        BassNote(start=2.0, end=3.0, midi=21.0, confidence=0.92),   # A0 (21) -> must transpose up into [28, 53] (21 + 12 = 33, A1)
        BassNote(start=3.0, end=4.0, midi=41.0, confidence=0.88),   # F2 (41) -> within 28-53
        BassNote(start=4.0, end=4.0, midi=43.0, confidence=0.5),    # Zero-length -> skipped
    ]

    beats = [
        BeatPoint(timestamp=0.0, beat_number=1, is_downbeat=True, confidence=0.99),
        BeatPoint(timestamp=0.5, beat_number=2, is_downbeat=False, confidence=0.95),
        BeatPoint(timestamp=1.0, beat_number=3, is_downbeat=False, confidence=0.94),
        BeatPoint(timestamp=1.5, beat_number=4, is_downbeat=False, confidence=0.96),
        BeatPoint(timestamp=2.0, beat_number=1, is_downbeat=True, confidence=0.99),
    ]

    bpm = 120.0
    midi_path = export_midi(task_id=task_id, chords=chords, bassline=bassline, beats=beats, bpm=bpm)
    assert midi_path.exists(), f"MIDI file not created at {midi_path}"
    midi_bytes = midi_path.read_bytes()

    # 1.1 Binary Header Chunk Inspection (MThd)
    assert len(midi_bytes) >= 14, "MIDI file too short for SMF header"
    header_tag = midi_bytes[:4]
    assert header_tag == b"MThd", f"Invalid MIDI header tag: {header_tag}"
    header_length, smf_format, num_tracks, division = struct.unpack(">IHHh", midi_bytes[4:14])
    assert header_length == 6, f"Expected MThd header length 6, got {header_length}"
    assert smf_format == 1, f"Expected SMF-1 (Format 1) multi-track MIDI, got Format {smf_format}"
    print(f" -> Header OK: SMF Format {smf_format}, {num_tracks} tracks declared, Division {division} ticks/beat")

    # 1.2 Mido Low-Level Track Parsing
    midi_file = mido.MidiFile(file=io.BytesIO(midi_bytes))
    assert midi_file.type == 1, f"Mido reports non-type-1 file: {midi_file.type}"
    print(f" -> Total parsed tracks in file: {len(midi_file.tracks)}")

    track_names = [tr.name for tr in midi_file.tracks]
    print(f" -> Track names found: {track_names}")

    # 1.3 PrettyMIDI High-Level Semantic Inspection
    pm = pretty_midi.PrettyMIDI(io.BytesIO(midi_bytes))
    assert len(pm.instruments) == 3, f"Expected 3 instruments (Chords, Bassline, Beat Click), got {len(pm.instruments)}"

    # Check Chords Track
    chord_inst = next((inst for inst in pm.instruments if inst.name == "Chords"), None)
    assert chord_inst is not None, "Missing 'Chords' track"
    assert chord_inst.program == 0, f"Expected Acoustic Grand Piano (0), got {chord_inst.program}"
    assert not chord_inst.is_drum, "Chords track should not be marked as drum"
    assert len(chord_inst.notes) > 0, "Chords track contains 0 notes"

    # Verify slash chord inversion: G/B has B2 (pitch 48 + 11 = 59)
    gb_notes = [n for n in chord_inst.notes if 1.0 <= n.start < 2.0]
    gb_pitches = [n.pitch for n in gb_notes]
    assert 59 in gb_pitches, f"G/B slash bass note B2 (pitch 59) not found in {gb_pitches}"
    print(f" -> Chords Track OK: {len(chord_inst.notes)} notes generated. Slash bass G/B verified with pitch 59.")

    # Check Bassline Track
    bass_inst = next((inst for inst in pm.instruments if inst.name == "Bassline"), None)
    assert bass_inst is not None, "Missing 'Bassline' track"
    assert bass_inst.program == 33, f"Expected Electric Bass Finger (33), got {bass_inst.program}"
    assert not bass_inst.is_drum, "Bassline track should not be marked as drum"
    assert len(bass_inst.notes) == 4, f"Expected 4 active bass notes (1 zero-len skipped), got {len(bass_inst.notes)}"

    # Verify Bass Octave Clamping: strictly between 28 (E1) and 53 (F3)
    for bn in bass_inst.notes:
        assert 28 <= bn.pitch <= 53, f"Bass pitch {bn.pitch} outside standard bass range [28, 53]!"
    print(f" -> Bassline Track OK: {len(bass_inst.notes)} notes, all pitches strictly in range [28, 53].")

    # Check Beat Click Track
    click_inst = next((inst for inst in pm.instruments if inst.name == "Beat Click"), None)
    assert click_inst is not None, "Missing 'Beat Click' track"
    assert click_inst.is_drum, "Beat Click must be marked as drum channel"
    assert len(click_inst.notes) == 5, f"Expected 5 click events, got {len(click_inst.notes)}"

    downbeats = [n for n in click_inst.notes if n.pitch == 34]
    regular_beats = [n for n in click_inst.notes if n.pitch == 37]
    assert len(downbeats) == 2, f"Expected 2 downbeats (pitch 34 Metronome Bell), got {len(downbeats)}"
    assert len(regular_beats) == 3, f"Expected 3 regular beats (pitch 37 Side Stick), got {len(regular_beats)}"
    for db in downbeats:
        assert db.velocity == 115, f"Expected downbeat velocity 115, got {db.velocity}"
    for rb in regular_beats:
        assert rb.velocity == 100, f"Expected beat velocity 100, got {rb.velocity}"
    print(f" -> Beat Click Track OK: 2 Metronome Bells (pitch 34, vel 115), 3 Side Sticks (pitch 37, vel 100).")

    # 1.4 Edge cases & Stress testing
    # A. Empty inputs
    empty_path = export_midi(task_id=f"{task_id}-empty", chords=[], bassline=[], beats=[], bpm=0.0)
    assert empty_path.exists()
    empty_pm = pretty_midi.PrettyMIDI(str(empty_path))
    assert len(empty_pm.instruments) == 3
    for inst in empty_pm.instruments:
        assert len(inst.notes) == 0
    print(f" -> Empty MIDI generation edge case: OK.")

    # Cleanup
    shutil.rmtree(SETTINGS.export_dir / task_id, ignore_errors=True)
    shutil.rmtree(SETTINGS.export_dir / f"{task_id}-empty", ignore_errors=True)
    print(" [PASS] SMF-1 MIDI Binary Structure Verification Passed!")


# ============================================================================
# SECTION 2: HTTP 206 PARTIAL CONTENT BYTE-RANGE STREAMING TESTS
# ============================================================================

def test_http_206_byte_range_streaming():
    print("\n--- [TEST 2] HTTP 206 Partial Content Byte-Range Streaming ---")
    task_id = str(uuid.uuid4())
    upload_dir = SETTINGS.upload_dir / task_id
    stems_dir = SETTINGS.stems_dir / task_id
    export_dir = SETTINGS.export_dir / task_id

    upload_dir.mkdir(parents=True, exist_ok=True)
    stems_dir.mkdir(parents=True, exist_ok=True)
    export_dir.mkdir(parents=True, exist_ok=True)

    master_file = upload_dir / "master_44k_stereo.wav"
    stem_file = stems_dir / "vocals.wav"
    denoised_file = export_dir / "denoised.wav"

    master_file.write_bytes(test_wav_bytes)
    stem_file.write_bytes(test_wav_bytes)
    denoised_file.write_bytes(test_wav_bytes)

    total_len = len(test_wav_bytes)
    endpoints_to_test = [
        f"/api/audio/{task_id}",
        f"/api/stems/{task_id}/vocals",
        f"/api/stems/{task_id}/vocals.wav",
        f"/api/denoised/{task_id}",
    ]

    try:
        for ep in endpoints_to_test:
            # 2.1 Full request without Range header -> 200 OK
            res_full = client.get(ep)
            assert res_full.status_code == 200, f"{ep} full request failed: {res_full.status_code}"
            assert res_full.headers.get("accept-ranges") == "bytes"
            assert len(res_full.content) == total_len

            # 2.2 First 512 bytes (bytes=0-511) -> 206 Partial Content
            res_first = client.get(ep, headers={"Range": "bytes=0-511"})
            assert res_first.status_code == 206, f"{ep} 0-511 failed: {res_first.status_code}"
            assert res_first.headers.get("content-range") == f"bytes 0-511/{total_len}"
            assert res_first.headers.get("content-length") == "512"
            assert res_first.content == test_wav_bytes[0:512]

            # 2.3 Mid segment (bytes=1000-1999) -> 206 Partial Content
            res_mid = client.get(ep, headers={"Range": "bytes=1000-1999"})
            assert res_mid.status_code == 206
            assert res_mid.headers.get("content-range") == f"bytes 1000-1999/{total_len}"
            assert res_mid.headers.get("content-length") == "1000"
            assert res_mid.content == test_wav_bytes[1000:2000]

            # 2.4 Open-ended range (bytes=2048-) -> 206 Partial Content
            res_open = client.get(ep, headers={"Range": "bytes=2048-"})
            assert res_open.status_code == 206
            assert res_open.headers.get("content-range") == f"bytes 2048-{total_len - 1}/{total_len}"
            assert len(res_open.content) == total_len - 2048
            assert res_open.content == test_wav_bytes[2048:]

            # 2.5 Suffix range (bytes=-256) -> last 256 bytes
            res_suffix = client.get(ep, headers={"Range": "bytes=-256"})
            assert res_suffix.status_code == 206
            assert res_suffix.headers.get("content-range") == f"bytes {total_len - 256}-{total_len - 1}/{total_len}"
            assert len(res_suffix.content) == 256
            assert res_suffix.content == test_wav_bytes[-256:]

            # 2.6 Single byte range (bytes=0-0)
            res_one = client.get(ep, headers={"Range": "bytes=0-0"})
            assert res_one.status_code == 206
            assert res_one.headers.get("content-length") == "1"
            assert res_one.content == test_wav_bytes[0:1]

            # 2.7 Multiple range request (bytes=0-100, 200-300) -> first range handled gracefully
            res_multi = client.get(ep, headers={"Range": "bytes=0-100, 200-300"})
            assert res_multi.status_code == 206
            assert res_multi.headers.get("content-range") == f"bytes 0-100/{total_len}"
            assert len(res_multi.content) == 101

            # 2.8 Out-of-bounds range -> 416 Range Not Satisfiable
            res_oob = client.get(ep, headers={"Range": f"bytes={total_len + 1000}-{total_len + 2000}"})
            assert res_oob.status_code == 416, f"Expected 416 for OOB range, got {res_oob.status_code}"
            assert res_oob.headers.get("content-range") == f"bytes */{total_len}"

            # 2.9 Inverted range (bytes=500-100) -> 416
            res_inv = client.get(ep, headers={"Range": "bytes=500-100"})
            assert res_inv.status_code == 416

            # 2.10 Malformed syntax -> 416
            res_malformed = client.get(ep, headers={"Range": "bytes=abc-xyz"})
            assert res_malformed.status_code == 416

        print(f" -> Successfully validated RFC 7233 range streaming across 4 endpoints & 10 range variants.")
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)
        shutil.rmtree(stems_dir, ignore_errors=True)
        shutil.rmtree(export_dir, ignore_errors=True)

    print(" [PASS] HTTP 206 Partial Content Byte-Range Streaming Passed!")


# ============================================================================
# SECTION 3: STEM EXTENSION NORMALIZATION & SECURITY SANITIZATION TESTS
# ============================================================================

def test_stem_extension_normalization_and_sanitization():
    print("\n--- [TEST 3] Stem Extension Normalization & Security Sanitization ---")
    task_id = str(uuid.uuid4())
    stem_dir = SETTINGS.stems_dir / task_id
    stem_dir.mkdir(parents=True, exist_ok=True)

    stems = ["vocals", "drums", "bass", "other", "piano", "guitar"]
    for s in stems:
        (stem_dir / f"{s}.wav").write_bytes(test_wav_bytes)

    try:
        # 3.1 Verify with vs without .wav extension for all stems
        for s in stems:
            res_no_ext = client.get(f"/api/stems/{task_id}/{s}")
            res_with_ext = client.get(f"/api/stems/{task_id}/{s}.wav")
            res_upper_ext = client.get(f"/api/stems/{task_id}/{s}.WAV")

            assert res_no_ext.status_code == 200, f"Failed for {s} without ext: {res_no_ext.status_code}"
            assert res_with_ext.status_code == 200, f"Failed for {s}.wav: {res_with_ext.status_code}"
            assert res_upper_ext.status_code == 200, f"Failed for {s}.WAV: {res_upper_ext.status_code}"
            assert res_no_ext.content == res_with_ext.content == res_upper_ext.content == test_wav_bytes
            print(f" -> Stem '{s}': OK (tested bare, .wav, .WAV)")

        # 3.2 Security fuzzing & Injection Defense
        adversarial_stem_inputs = [
            "../../etc/passwd",
            "..\\..\\windows\\system32",
            "vocals;cat /etc/shadow",
            "vocals|rm -rf /",
            "vocals`whoami`",
            "vocals$(id)",
            "vocals%00.wav",
            "<script>alert(1)</script>",
            "vocals' OR '1'='1",
            "vocals with spaces",
            "v" * 65,  # Exceeds max length of 64
        ]

        for bad_name in adversarial_stem_inputs:
            encoded_name = urllib.parse.quote(bad_name, safe="")
            res = client.get(f"/api/stems/{task_id}/{encoded_name}")
            assert res.status_code in (404, 422), f"Adversarial input '{bad_name}' should return 404/422, got {res.status_code}"
        print(f" -> Successfully rejected all {len(adversarial_stem_inputs)} adversarial injection payloads with 404/422.")
    finally:
        shutil.rmtree(stem_dir, ignore_errors=True)

    print(" [PASS] Stem Extension Normalization & Sanitization Passed!")


# ============================================================================
# SECTION 4: SIMULATED REAPER REASCRIPT INTEGRATION WORKFLOWS & AUTH
# ============================================================================

def test_simulated_reascript_workflows():
    print("\n--- [TEST 4] Simulated REAPER Lua/Python ReaScript Integration Workflows ---")

    # Workflow 1: ReaScript Auto-Tempo & Key Alignment
    print("\n -> [ReaScript 1] RealS_AlignProjectTempoKey.lua")
    files = {"file": ("reaper_take_audio.wav", test_wav_bytes, "audio/wav")}
    res_analyze = client.post("/api/v1/analyze", files=files)
    assert res_analyze.status_code == 200, f"Analyze failed with {res_analyze.status_code}: {res_analyze.text}"
    meta = res_analyze.json()
    bpm = meta["bpm"]
    master_key = meta["master_key"]
    scale_mode = meta["scale_mode"]

    # ReaScript calculations
    quarter_note_sec = 60.0 / bpm
    assert 40.0 <= bpm <= 240.0
    assert master_key in ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    print(f"    ReaScript parsed: BPM={bpm}, Key={master_key} {scale_mode}, 1/4 note={round(quarter_note_sec, 4)}s")

    # Workflow 2: ReaScript Harmony & MIDI Track Generation
    print("\n -> [ReaScript 2] RealS_CreateChordTrackFromAudio.lua")
    res_chords = client.post("/api/v1/chords", files={"file": ("harmony_take.wav", test_wav_bytes, "audio/wav")})
    assert res_chords.status_code == 200
    chords_payload = res_chords.json()
    chords_task_id = chords_payload["task_id"]

    # ReaScript downloads MIDI
    res_midi = client.get(f"/api/export/midi/{chords_task_id}")
    assert res_midi.status_code == 200
    assert res_midi.content.startswith(b"MThd")
    midi_parsed = pretty_midi.PrettyMIDI(io.BytesIO(res_midi.content))
    assert len(midi_parsed.instruments) >= 1
    print(f"    ReaScript downloaded MIDI: {len(midi_parsed.instruments)} tracks, {len(midi_parsed.instruments[0].notes)} chord notes")

    # Workflow 3: ReaScript Async Stem Separation
    print("\n -> [ReaScript 3] RealS_SeparateSelectedTakeToTracks.lua")
    res_sep = client.post("/api/v1/separate?stem_mode=4", files={"file": ("song_take.wav", test_wav_bytes, "audio/wav")})
    assert res_sep.status_code == 202
    sep_task_id = res_sep.json()["task_id"]

    # Simulate background completion by placing stem files
    stems_dir = SETTINGS.stems_dir / sep_task_id
    stems_dir.mkdir(parents=True, exist_ok=True)
    stems_list = ["vocals", "drums", "bass", "other"]
    for s in stems_list:
        (stems_dir / f"{s}.wav").write_bytes(test_wav_bytes)

    TASK_MANAGER.attach_result(sep_task_id, {
        "stems": {s: {"url": f"/api/stems/{sep_task_id}/{s}"} for s in stems_list}
    })
    TASK_MANAGER.update(sep_task_id, status="COMPLETE", stage="Hoàn tất", percent=100)

    # ReaScript polls status
    res_job = client.get(f"/api/v1/jobs/{sep_task_id}")
    assert res_job.status_code == 200
    assert res_job.json()["status"] == "COMPLETE"

    # ReaScript downloads each stem to place on new tracks
    for s in stems_list:
        res_stem = client.get(f"/api/stems/{sep_task_id}/{s}")
        assert res_stem.status_code == 200
        assert res_stem.headers.get("content-type") == "audio/wav"
        data, sr = sf.read(io.BytesIO(res_stem.content))
        assert sr == 44100
        assert len(data) > 0
    print(f"    ReaScript fetched all {len(stems_list)} stems for REAPER multi-track placement.")

    # Workflow 4: ReaScript Vocal Take Denoising
    print("\n -> [ReaScript 4] RealS_DenoiseVocalTake.lua")
    res_denoise = client.post("/api/v1/denoise?strength=85", files={"file": ("noisy_vocal.wav", test_wav_bytes, "audio/wav")})
    assert res_denoise.status_code == 202
    denoise_task_id = res_denoise.json()["task_id"]

    denoise_dir = SETTINGS.export_dir / denoise_task_id
    denoise_dir.mkdir(parents=True, exist_ok=True)
    (denoise_dir / "denoised.wav").write_bytes(test_wav_bytes)

    TASK_MANAGER.attach_result(denoise_task_id, {
        "task_id": denoise_task_id,
        "denoise_url": f"/api/denoised/{denoise_task_id}",
        "strength": 85,
    })
    TASK_MANAGER.update(denoise_task_id, status="COMPLETE", stage="Hoàn tất", percent=100)

    res_denoise_poll = client.get(f"/api/v1/jobs/{denoise_task_id}")
    assert res_denoise_poll.status_code == 200
    assert res_denoise_poll.json()["status"] == "COMPLETE"
    cleaned_audio_res = client.get(f"/api/denoised/{denoise_task_id}")
    assert cleaned_audio_res.status_code == 200
    assert cleaned_audio_res.content.startswith(b"RIFF")
    print("    ReaScript fetched cleaned denoised audio stream for take replacement.")

    # 4.5 Dual-Mode Authentication Verification
    print("\n -> [Auth Verification] Testing Cloud Auth Enforcement (REALS_AUTH_DISABLED=false)")
    auth_mod.AUTH_DISABLED = False
    os.environ["REALS_AUTH_DISABLED"] = "false"
    auth_mod.clear_auth_cache()

    # Rejection of unauthenticated request
    res_unauth = client.post("/api/v1/analyze", files=files)
    assert res_unauth.status_code == 401, f"Expected 401 Unauthorized in cloud mode, got {res_unauth.status_code}"
    print("    Cloud mode: correctly rejected missing Bearer token with 401.")

    # Re-enable local DAW mode
    auth_mod.AUTH_DISABLED = True
    os.environ["REALS_AUTH_DISABLED"] = "true"
    auth_mod.clear_auth_cache()
    res_local = client.post("/api/v1/analyze", files=files)
    assert res_local.status_code == 200
    print("    Local DAW mode: successfully restored unauthenticated access.")

    # Cleanup
    shutil.rmtree(stems_dir, ignore_errors=True)
    shutil.rmtree(denoise_dir, ignore_errors=True)
    print(" [PASS] Simulated REAPER ReaScript Integration Workflows Passed!")


# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == "__main__":
    t_start = time.perf_counter()
    test_smf1_midi_binary_structure()
    test_http_206_byte_range_streaming()
    test_stem_extension_normalization_and_sanitization()
    test_simulated_reascript_workflows()
    t_end = time.perf_counter()
    print(f"\n==================================================================")
    print(f" ALL EMPIRICAL CHALLENGER VERIFICATION TESTS PASSED ({round(t_end - t_start, 3)}s)")
    print(f"==================================================================")
