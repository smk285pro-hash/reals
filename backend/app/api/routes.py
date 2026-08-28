from __future__ import annotations

import asyncio
import io
import json
import re
from pathlib import Path
from typing import Any, Dict, Generator, List, Set, Tuple
import uuid
import zipfile

import librosa
import numpy as np
import soundfile as sf
from fastapi import APIRouter, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from app.core.audio_processor import (
    compute_peaks,
    get_duration,
    load_any_format,
    normalize_ebu_r128,
    resample,
    save_master,
)
from app.core.bass_engine import BassNote
from app.core.config import MAX_UPLOAD_MB, SAMPLE_RATE, SETTINGS, SSE_POLL_SECONDS, STEM_MODES
from app.core.feature_pipelines import (
    analyze_telemetry_raw,
    prepare_working_audio,
    run_chords_analysis,
    run_stems_only,
)
from app.core.denoise_engine import run_denoise
from app.core.key_detector import detect_key
from app.core.midi_exporter import export_midi
from app.core.schemas import BeatPoint, ChordSegment
from app.core.task_manager import TASK_MANAGER
from app.core.unified_pipeline import UnifiedDeepAnalyzer

router: APIRouter = APIRouter()

# Hold strong references to background tasks so the event loop cannot GC them mid-run.
_background_tasks: Set["asyncio.Task[None]"] = set()

_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def _validate_task_id(task_id: str) -> str:
    """Reject malformed task ids to prevent path traversal via URL segments."""
    if not _UUID_RE.match(task_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    return task_id


def _sanitize_filename(filename: str) -> str:
    """Strip any directory components; keep a safe basename for the stored original."""
    name = Path(filename.replace("\\", "/")).name.strip()
    if not name or name.startswith("."):
        return "audio_file.wav"
    return name


async def _save_upload_file(file: UploadFile) -> Tuple[str, Path]:
    """Validate and stream an uploaded audio file to disk; returns (task_id, original_path)."""
    content_type = file.content_type or ""
    filename = file.filename or "audio_file.wav"
    valid_extensions = (".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".aiff", ".wma")
    if not (content_type.startswith("audio/") or filename.lower().endswith(valid_extensions)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid content type '{content_type}'. Please upload a valid audio file.",
        )

    task_id = str(uuid.uuid4())
    task_dir = SETTINGS.upload_dir / task_id
    task_dir.mkdir(parents=True, exist_ok=True)

    original_path = task_dir / f"original_{_sanitize_filename(filename)}"
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    total_bytes = 0

    with open(original_path, "wb") as f_out:
        while True:
            chunk = await file.read(64 * 1024)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > max_bytes:
                if original_path.exists():
                    original_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum allowed limit of {MAX_UPLOAD_MB} MB",
                )
            f_out.write(chunk)

    return task_id, original_path


def parse_range_header(range_header: str, file_size: int) -> Tuple[int, int]:
    """Parse HTTP Range header string into start and end byte positions."""
    if not range_header.startswith("bytes="):
        raise ValueError("Invalid Range header prefix, expected 'bytes='")

    range_spec = range_header[len("bytes="):].strip()
    if "," in range_spec:
        range_spec = range_spec.split(",")[0].strip()

    parts = range_spec.split("-")
    if len(parts) != 2:
        raise ValueError("Invalid Range format")

    start_str, end_str = parts[0].strip(), parts[1].strip()
    if not start_str and not end_str:
        raise ValueError("Empty byte range specified")

    if not start_str:
        suffix_len = int(end_str)
        start = max(0, file_size - suffix_len)
        end = file_size - 1
    elif not end_str:
        start = int(start_str)
        end = file_size - 1
    else:
        start = int(start_str)
        end = int(end_str)

    if start < 0 or start >= file_size or end < start:
        raise ValueError("Requested range outside file boundaries")

    end = min(end, file_size - 1)
    return start, end


def iter_file_chunk(path: Path, start: int, end: int, chunk_size: int = 64 * 1024) -> Generator[bytes, None, None]:
    """Yield bytes chunk by chunk from the given file range."""
    with open(path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            bytes_to_read = min(chunk_size, remaining)
            chunk = f.read(bytes_to_read)
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def _build_stems_zip(wav_files: List[Path]) -> io.BytesIO:
    """Compress stem WAV files into an in-memory zip archive (blocking; run in a thread)."""
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for wf in wav_files:
            zip_file.write(wf, arcname=wf.name)
    zip_buffer.seek(0)
    return zip_buffer


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """Health check endpoint checking server status and optional GPU availability."""
    gpu_available = False
    try:
        import torch  # type: ignore[import-not-found]
        gpu_available = bool(torch.cuda.is_available())
    except Exception:
        gpu_available = False

    return {
        "status": "ok",
        "gpu_available": gpu_available,
        "version": "2026.1.0",
    }


@router.post("/upload")
async def upload_audio(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Upload and normalize an audio file, extracting master files and peak visualization."""
    try:
        content_type = file.content_type or ""
        filename = file.filename or "audio_file.wav"
        valid_extensions = (".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".aiff", ".wma")
        if not (content_type.startswith("audio/") or filename.lower().endswith(valid_extensions)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid content type '{content_type}'. Please upload a valid audio file.",
            )

        task_id = str(uuid.uuid4())
        task_dir = SETTINGS.upload_dir / task_id
        task_dir.mkdir(parents=True, exist_ok=True)

        original_path = task_dir / f"original_{_sanitize_filename(filename)}"
        max_bytes = MAX_UPLOAD_MB * 1024 * 1024
        total_bytes = 0

        with open(original_path, "wb") as f_out:
            while True:
                chunk = await file.read(64 * 1024)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    if original_path.exists():
                        original_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds maximum allowed limit of {MAX_UPLOAD_MB} MB",
                    )
                f_out.write(chunk)

        def _process() -> Tuple[float, List[List[float]]]:
            stereo_raw, sr_in = load_any_format(original_path)
            stereo_resampled = resample(stereo_raw, sr_in, SAMPLE_RATE)
            stereo_norm = normalize_ebu_r128(stereo_resampled, SAMPLE_RATE)
            save_master(task_id, stereo_norm)
            mono = np.mean(stereo_norm, axis=0)
            peaks = compute_peaks(mono, frames=2000)
            peaks_path = task_dir / "peaks.json"
            with open(peaks_path, "w", encoding="utf-8") as pf:
                json.dump(peaks, pf)
            dur = get_duration(stereo_norm, SAMPLE_RATE)
            return dur, peaks

        duration, _ = await asyncio.to_thread(_process)
        TASK_MANAGER.create(task_id)

        return {
            "task_id": task_id,
            "status": "QUEUED",
            "duration": round(duration, 3),
            "waveform_url": f"/api/waveform/{task_id}",
            "audio_url": f"/api/audio/{task_id}",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload processing failed: {str(e)}",
        )


@router.api_route("/audio/{task_id}", methods=["GET", "HEAD"])
async def get_audio(task_id: str, request: Request) -> Response:
    """Serve the master stereo audio WAV file with manual HTTP byte range support."""
    _validate_task_id(task_id)
    try:
        master_path = SETTINGS.upload_dir / task_id / "master_44k_stereo.wav"
        if not master_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Master audio not found for task {task_id}",
            )

        file_size = master_path.stat().st_size
        range_header = request.headers.get("Range")

        if range_header:
            try:
                start, end = parse_range_header(range_header, file_size)
            except Exception as parse_err:
                raise HTTPException(
                    status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                    detail=f"Invalid byte range request: {str(parse_err)}",
                    headers={"Content-Range": f"bytes */{file_size}"},
                )

            content_length = end - start + 1
            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                "Content-Type": "audio/wav",
            }
            return StreamingResponse(
                iter_file_chunk(master_path, start, end),
                status_code=status.HTTP_206_PARTIAL_CONTENT,
                headers=headers,
                media_type="audio/wav",
            )

        return FileResponse(
            path=str(master_path),
            media_type="audio/wav",
            headers={"Accept-Ranges": "bytes"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Streaming audio failed: {str(e)}",
        )


@router.get("/waveform/{task_id}")
async def get_waveform(task_id: str) -> List[List[float]]:
    """Retrieve precomputed waveform peak min/max array for UI rendering."""
    _validate_task_id(task_id)
    try:
        peaks_path = SETTINGS.upload_dir / task_id / "peaks.json"
        if not peaks_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Waveform data not found for task {task_id}",
            )

        with open(peaks_path, "r", encoding="utf-8") as f:
            data: List[List[float]] = json.load(f)
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Retrieving waveform failed: {str(e)}",
        )


@router.post("/analyze/quick/{task_id}")
async def analyze_quick(task_id: str) -> Dict[str, Any]:
    """Perform fast (<2s) telemetry analysis (BPM, key, scale mode, duration) on mono audio."""
    try:
        mono_path = SETTINGS.upload_dir / task_id / "master_mono.wav"
        if not mono_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Master mono audio not found for task {task_id}",
            )

        def _quick_analysis() -> Dict[str, Any]:
            mono, sr = sf.read(str(mono_path), dtype="float32")
            if mono.ndim > 1:
                mono = np.mean(mono, axis=-1)

            # Use robust multi-band onset + autocorrelation tempo estimation
            # instead of the basic librosa.beat.beat_track
            hop_length = 512
            onset_env = librosa.onset.onset_strength(
                y=mono, sr=sr, hop_length=hop_length, n_mels=128,
            )

            # Autocorrelation-based tempo (more stable than beat_track's DP)
            ac = librosa.autocorrelate(onset_env, max_size=len(onset_env) // 2)
            min_lag = int((60.0 / 240.0) * sr / hop_length)
            max_lag = int((60.0 / 40.0) * sr / hop_length)

            if min_lag < max_lag and max_lag < len(ac):
                ac_slice = ac[min_lag:max_lag]
                best_lag = min_lag + int(np.argmax(ac_slice))
                bpm_val = 60.0 / (best_lag * hop_length / sr)

                if bpm_val <= 0 or np.isnan(bpm_val):
                    bpm_val = 120.0
                else:
                    # Octave correction: check 0.5x, 1x, 1.5x, 2x
                    candidates = [bpm_val, bpm_val / 2, bpm_val * 2, bpm_val / 1.5, bpm_val * 1.5]
                    best_tempo = bpm_val
                    best_energy = 0.0
                    for cand in candidates:
                        if cand < 40 or cand > 240:
                            continue
                        cand_lag = int((60.0 / cand) * sr / hop_length)
                        if min_lag <= cand_lag < max_lag:
                            energy = float(ac[cand_lag])
                            if energy > best_energy:
                                best_energy = energy
                                best_tempo = cand
                    bpm_val = float(best_tempo)
            else:
                tempo_result, _ = librosa.beat.beat_track(y=mono, sr=sr)
                bpm_val = float(np.atleast_1d(tempo_result)[0])

            # Final sanity: clamp to valid range
            if bpm_val <= 0 or np.isnan(bpm_val) or bpm_val > 300:
                bpm_val = 120.0

            chroma = librosa.feature.chroma_cqt(y=mono, sr=sr)
            chroma_mean = np.mean(chroma, axis=1)
            master_key, scale_mode, _ = detect_key(chroma_mean)

            duration = float(len(mono) / sr)

            return {
                "bpm": round(bpm_val, 1),
                "master_key": master_key,
                "scale_mode": scale_mode,
                "duration": round(duration, 2),
            }

        result = await asyncio.to_thread(_quick_analysis)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Quick analysis failed: {str(e)}",
        )


@router.delete("/session/{task_id}")
async def delete_session(task_id: str) -> Dict[str, Any]:
    """Delete all session storage assets and remove task state."""
    _validate_task_id(task_id)
    try:
        import shutil

        dirs_to_clean = [
            SETTINGS.upload_dir / task_id,
            SETTINGS.stems_dir / task_id,
            SETTINGS.export_dir / task_id,
        ]
        for d in dirs_to_clean:
            if d.exists() and d.is_dir():
                shutil.rmtree(d, ignore_errors=True)

        TASK_MANAGER.delete(task_id)

        return {"status": "deleted", "task_id": task_id}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete session {task_id}: {str(e)}",
        )


# ==========================================
# STAGE 2 ENDPOINTS
# ==========================================


@router.post("/analyze/deep/{task_id}", status_code=status.HTTP_202_ACCEPTED)
async def analyze_deep(
    task_id: str,
    stem_mode: str = Query("4", description="Stem separation mode: 2, 4, 6, 8"),
) -> Dict[str, Any]:
    """Launch asynchronous full multi-stage DSP deep analysis pipeline."""
    try:
        if stem_mode not in STEM_MODES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid stem_mode '{stem_mode}'. Supported modes: {STEM_MODES}",
            )

        master_path = SETTINGS.upload_dir / task_id / "master_44k_stereo.wav"
        if not master_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found or master audio missing.",
            )

        # Defensive (re)create so the pipeline never updates a missing task
        # (e.g. server restarted between upload and deep analysis).
        if TASK_MANAGER.get(task_id) is None:
            TASK_MANAGER.create(task_id)
        if _task_is_busy(task_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Deep analysis for task {task_id} is already in progress.",
            )

        TASK_MANAGER.update(task_id, status="QUEUED", stage="Queued for deep analysis", percent=0)
        analyzer = UnifiedDeepAnalyzer(task_id=task_id, audio_path=master_path, stem_mode=stem_mode)
        bg_task = asyncio.create_task(analyzer.run(TASK_MANAGER))
        _background_tasks.add(bg_task)
        bg_task.add_done_callback(_background_tasks.discard)

        return {"task_id": task_id, "status": "QUEUED"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start deep analysis: {str(e)}",
        )


@router.get("/status/{task_id}")
async def get_status(task_id: str) -> Dict[str, Any]:
    """REST polling endpoint for deep analysis progress and completed result."""
    st = TASK_MANAGER.get(task_id)
    if st is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    payload: Dict[str, Any] = {
        "task_id": st.task_id,
        "status": st.status,
        "stage": st.stage,
        "percent": st.percent,
        "error": st.error,
        "result": None,
    }
    if st.status == "COMPLETE":
        result = TASK_MANAGER.get_result(task_id)
        payload["result"] = result

    return payload


@router.get("/progress/{task_id}")
async def get_progress(task_id: str) -> StreamingResponse:
    """Server-Sent Events (SSE) stream for tracking real-time deep analysis progress."""
    async def event_generator() -> Generator[str, None, None]:
        while True:
            st = TASK_MANAGER.get(task_id)
            if st is None:
                yield 'event: error\ndata: {"error":"task_not_found"}\n\n'
                return
            if st.status == "COMPLETE":
                result = TASK_MANAGER.get_result(task_id) or {}
                yield f"event: complete\ndata: {json.dumps(result, ensure_ascii=False)}\n\n"
                return
            if st.status == "FAILED":
                yield f"event: error\ndata: {json.dumps({'error': st.error}, ensure_ascii=False)}\n\n"
                return

            yield f"event: progress\ndata: {json.dumps({'percent': st.percent, 'stage': st.stage}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(SSE_POLL_SECONDS)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.api_route("/stems/{task_id}/{stem_name}", methods=["GET", "HEAD"])
async def get_stem(task_id: str, stem_name: str, request: Request) -> Response:
    """Serve individual audio stem WAV files supporting manual HTTP byte range requests."""
    _validate_task_id(task_id)
    if not re.fullmatch(r"[A-Za-z0-9_\-]{1,64}", stem_name):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stem '{stem_name}' not found for task {task_id}",
        )
    try:
        stem_path = SETTINGS.stems_dir / task_id / f"{stem_name}.wav"
        if not stem_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Stem '{stem_name}' not found for task {task_id}",
            )

        file_size = stem_path.stat().st_size
        range_header = request.headers.get("Range")

        if range_header:
            try:
                start, end = parse_range_header(range_header, file_size)
            except Exception as parse_err:
                raise HTTPException(
                    status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                    detail=f"Invalid byte range request: {str(parse_err)}",
                    headers={"Content-Range": f"bytes */{file_size}"},
                )

            content_length = end - start + 1
            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                "Content-Type": "audio/wav",
            }
            return StreamingResponse(
                iter_file_chunk(stem_path, start, end),
                status_code=status.HTTP_206_PARTIAL_CONTENT,
                headers=headers,
                media_type="audio/wav",
            )

        return FileResponse(
            path=str(stem_path),
            media_type="audio/wav",
            headers={"Accept-Ranges": "bytes"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to serve stem: {str(e)}",
        )


@router.get("/export/midi/{task_id}")
async def export_midi_endpoint(task_id: str) -> FileResponse:
    """Download multi-track MIDI file exported from deep analysis results."""
    _validate_task_id(task_id)
    try:
        midi_path = SETTINGS.export_dir / task_id / "multi_track.mid"
        if not midi_path.exists():
            # If not yet generated, attempt dynamic generation from stored task result
            res = TASK_MANAGER.get_result(task_id)
            if res is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"MIDI export not found and task result not available for {task_id}",
                )

            chords_data = [ChordSegment(**c) for c in res.get("chords", [])]
            beats_data = [BeatPoint(**b) for b in res.get("beats", [])]
            bass_data = [BassNote(**b) for b in res.get("bassline", [])]
            bpm = float(res.get("telemetry", {}).get("bpm", 120.0))

            midi_path = export_midi(
                task_id=task_id,
                chords=chords_data,
                bassline=bass_data,
                beats=beats_data,
                bpm=bpm,
            )

        return FileResponse(
            path=str(midi_path),
            media_type="audio/midi",
            filename=f"multi_track_{task_id}.mid",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export MIDI: {str(e)}",
        )


@router.get("/export/stems-zip/{task_id}")
async def export_stems_zip(task_id: str) -> StreamingResponse:
    """Download in-memory zip archive containing all separated stem audio files."""
    _validate_task_id(task_id)
    try:
        stems_dir = SETTINGS.stems_dir / task_id
        if not stems_dir.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Stems directory not found for task {task_id}",
            )

        wav_files = list(stems_dir.glob("*.wav"))
        if not wav_files:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No stem files found for task {task_id}",
            )

        # Compress off the event loop to avoid blocking the whole service
        zip_buffer = await asyncio.to_thread(_build_stems_zip, wav_files)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=stems_{task_id}.zip"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create stems zip: {str(e)}",
        )


@router.get("/export/json/{task_id}")
async def export_json(task_id: str) -> JSONResponse:
    """Download full deep analysis result structure as JSON file."""
    _validate_task_id(task_id)
    try:
        result = TASK_MANAGER.get_result(task_id)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Analysis result not found for task {task_id}",
            )

        return JSONResponse(
            content=result,
            headers={"Content-Disposition": f"attachment; filename=analysis_{task_id}.json"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export analysis JSON: {str(e)}",
        )


# ==========================================
# STANDALONE FEATURE ENDPOINTS (session-based)
# ==========================================


def _find_original_upload(task_id: str) -> Path:
    """Locate the user's original uploaded file for a task (processed as-is)."""
    task_dir = SETTINGS.upload_dir / task_id
    candidates = sorted(task_dir.glob("original_*")) if task_dir.exists() else []
    if candidates:
        return candidates[0]
    master = task_dir / "master_44k_stereo.wav"
    if master.exists():
        return master
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Audio not found for task {task_id}",
    )


def _task_is_busy(task_id: str) -> bool:
    """A task counts as busy only once a job has actually started on it.

    Upload leaves the state at QUEUED/"Initialized" — that is an idle session,
    not a running job, so it must not trigger a 409 conflict.
    """
    existing = TASK_MANAGER.get(task_id)
    if existing is None:
        return False
    if existing.status == "RUNNING":
        return True
    return existing.status == "QUEUED" and existing.stage != "Initialized"


def _guard_task_ready(task_id: str) -> Tuple[Path, Path]:
    """Validate the task has master audio and is not already running another job."""
    master_stereo = SETTINGS.upload_dir / task_id / "master_44k_stereo.wav"
    master_mono = SETTINGS.upload_dir / task_id / "master_mono.wav"
    if not master_stereo.exists() or not master_mono.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found or master audio missing.",
        )

    if TASK_MANAGER.get(task_id) is None:
        TASK_MANAGER.create(task_id)
    if _task_is_busy(task_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Another analysis for task {task_id} is already in progress.",
        )
    return master_stereo, master_mono


@router.post("/analyze/chords/{task_id}", status_code=status.HTTP_202_ACCEPTED)
async def analyze_chords_only(task_id: str) -> Dict[str, Any]:
    """Launch standalone chord-progression analysis (no stem separation) as a background task."""
    try:
        master_stereo, master_mono = _guard_task_ready(task_id)

        TASK_MANAGER.update(task_id, status="QUEUED", stage="Queued for chord analysis", percent=0)

        async def _job() -> None:
            try:
                TASK_MANAGER.update(task_id, status="RUNNING", stage="Khởi động phân tích hợp âm", percent=5)

                def _progress(pct: float, stage: str) -> None:
                    TASK_MANAGER.update(task_id, stage=stage, percent=int(pct))

                result = await asyncio.to_thread(run_chords_analysis, master_stereo, master_mono, _progress)
                result["task_id"] = task_id

                # Pre-export multi-track MIDI (chords + metronome) for the export endpoint
                try:
                    chords_data = [ChordSegment(**c) for c in result.get("chords", [])]
                    beats_data = [BeatPoint(**b) for b in result.get("beats", [])]
                    bpm_val = float(result.get("telemetry", {}).get("bpm", 120.0))
                    await asyncio.to_thread(export_midi, task_id, chords_data, [], beats_data, bpm_val)
                except Exception:
                    pass

                TASK_MANAGER.attach_result(task_id, result)
                TASK_MANAGER.update(task_id, status="COMPLETE", stage="Hoàn tất", percent=100)
            except Exception as e:
                TASK_MANAGER.set_failed(task_id, f"{type(e).__name__}: {str(e)}")

        bg_task = asyncio.create_task(_job())
        _background_tasks.add(bg_task)
        bg_task.add_done_callback(_background_tasks.discard)

        return {"task_id": task_id, "status": "QUEUED"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start chord analysis: {str(e)}",
        )


@router.post("/analyze/stems/{task_id}", status_code=status.HTTP_202_ACCEPTED)
async def analyze_stems_only(
    task_id: str,
    stem_mode: str = Query("4", description="Stem separation mode: 2, 4, 6, 8"),
) -> Dict[str, Any]:
    """Launch standalone stem separation (no chord/rhythm analysis) as a background task."""
    try:
        if stem_mode not in STEM_MODES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid stem_mode '{stem_mode}'. Supported modes: {STEM_MODES}",
            )

        master_stereo, _ = _guard_task_ready(task_id)

        TASK_MANAGER.update(task_id, status="QUEUED", stage="Queued for stem separation", percent=0)

        async def _job() -> None:
            try:
                TASK_MANAGER.update(task_id, status="RUNNING", stage="Khởi động tách stem", percent=5)

                def _stem_progress(sub_pct: float) -> None:
                    overall = 5 + int(sub_pct * 0.9)
                    TASK_MANAGER.update(
                        task_id,
                        stage=f"Đang tách stem AI ({int(sub_pct)}%)...",
                        percent=overall,
                    )

                result = await asyncio.to_thread(
                    run_stems_only, master_stereo, task_id, stem_mode, _stem_progress
                )
                result["task_id"] = task_id
                TASK_MANAGER.attach_result(task_id, result)
                TASK_MANAGER.update(task_id, status="COMPLETE", stage="Hoàn tất", percent=100)
            except Exception as e:
                TASK_MANAGER.set_failed(task_id, f"{type(e).__name__}: {str(e)}")

        bg_task = asyncio.create_task(_job())
        _background_tasks.add(bg_task)
        bg_task.add_done_callback(_background_tasks.discard)

        return {"task_id": task_id, "status": "QUEUED", "stem_mode": stem_mode}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start stem separation: {str(e)}",
        )


@router.post("/analyze/denoise/{task_id}", status_code=status.HTTP_202_ACCEPTED)
async def analyze_denoise(
    task_id: str,
    strength: int = Query(80, ge=0, le=100, description="Noise reduction strength 0-100"),
) -> Dict[str, Any]:
    """Launch standalone DeepFilterNet noise reduction on the original upload."""
    try:
        if TASK_MANAGER.get(task_id) is None:
            TASK_MANAGER.create(task_id)
        if _task_is_busy(task_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Another analysis for task {task_id} is already in progress.",
            )
        original_path = _find_original_upload(task_id)

        TASK_MANAGER.update(task_id, status="QUEUED", stage="Queued for noise reduction", percent=0)

        async def _job() -> None:
            try:
                TASK_MANAGER.update(task_id, status="RUNNING", stage="Khởi động lọc nhiễu", percent=5)

                def _progress(pct: float, stage: str) -> None:
                    TASK_MANAGER.update(task_id, stage=stage, percent=int(pct))

                result = await asyncio.to_thread(run_denoise, task_id, original_path, float(strength), _progress)
                TASK_MANAGER.attach_result(task_id, result)
                TASK_MANAGER.update(task_id, status="COMPLETE", stage="Hoàn tất", percent=100)
            except Exception as e:
                TASK_MANAGER.set_failed(task_id, f"{type(e).__name__}: {str(e)}")

        bg_task = asyncio.create_task(_job())
        _background_tasks.add(bg_task)
        bg_task.add_done_callback(_background_tasks.discard)

        return {"task_id": task_id, "status": "QUEUED", "strength": strength}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start noise reduction: {str(e)}",
        )


@router.api_route("/denoised/{task_id}", methods=["GET", "HEAD"])
async def get_denoised(task_id: str, request: Request) -> Response:
    """Serve the denoised WAV file with manual HTTP byte range support."""
    _validate_task_id(task_id)
    try:
        denoised_path = SETTINGS.export_dir / task_id / "denoised.wav"
        if not denoised_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Denoised audio not found for task {task_id}",
            )

        file_size = denoised_path.stat().st_size
        range_header = request.headers.get("Range")

        if range_header:
            try:
                start, end = parse_range_header(range_header, file_size)
            except Exception as parse_err:
                raise HTTPException(
                    status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                    detail=f"Invalid byte range request: {str(parse_err)}",
                    headers={"Content-Range": f"bytes */{file_size}"},
                )

            content_length = end - start + 1
            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                "Content-Type": "audio/wav",
            }
            return StreamingResponse(
                iter_file_chunk(denoised_path, start, end),
                status_code=status.HTTP_206_PARTIAL_CONTENT,
                headers=headers,
                media_type="audio/wav",
            )

        return FileResponse(
            path=str(denoised_path),
            media_type="audio/wav",
            headers={"Accept-Ranges": "bytes"},
            filename=f"denoised_{task_id}.wav",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Serving denoised audio failed: {str(e)}",
        )


# ==========================================
# PUBLIC DEVELOPER API (v1) — one-shot, audio processed as-is
# ==========================================


@router.post("/v1/analyze")
async def v1_analyze(file: UploadFile = File(...)) -> Dict[str, Any]:
    """[Dev API] Detect tempo (BPM), musical key & scale mode from an audio file.

    The audio is analysed exactly as uploaded — no loudness normalisation or any
    other optimisation is applied. Returns JSON synchronously.
    """
    task_id: str = ""
    try:
        task_id, original_path = await _save_upload_file(file)
        result = await asyncio.to_thread(analyze_telemetry_raw, original_path)
        result["task_id"] = task_id
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Tempo/key analysis failed: {str(e)}",
        )


@router.post("/v1/chords")
async def v1_chords(file: UploadFile = File(...)) -> Dict[str, Any]:
    """[Dev API] Detect the full chord progression of an audio file.

    Returns JSON: telemetry (bpm/key/mode/time signature), beat grid and the
    chord segments (start/end/chord/root/bass/quality/confidence). The audio is
    processed as-is (no loudness normalisation).
    """
    try:
        task_id, original_path = await _save_upload_file(file)
        stereo_path, mono_path = await asyncio.to_thread(
            prepare_working_audio, task_id, original_path
        )
        result = await asyncio.to_thread(run_chords_analysis, stereo_path, mono_path, None)
        result["task_id"] = task_id
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chord analysis failed: {str(e)}",
        )


@router.post("/v1/separate", status_code=status.HTTP_202_ACCEPTED)
async def v1_separate(
    file: UploadFile = File(...),
    stem_mode: str = Query("4", description="Stem separation mode: 2, 4, 6, 8"),
) -> Dict[str, Any]:
    """[Dev API] Separate an audio file into stems (vocals/drums/bass/other...).

    Stem separation takes minutes, so this endpoint is asynchronous: it returns
    a task_id immediately; poll GET /api/v1/jobs/{task_id} until COMPLETE, then
    download the stems (audio/wav) from the URLs in the result.
    """
    try:
        if stem_mode not in STEM_MODES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid stem_mode '{stem_mode}'. Supported modes: {STEM_MODES}",
            )

        task_id, original_path = await _save_upload_file(file)
        stereo_path, _ = await asyncio.to_thread(
            prepare_working_audio, task_id, original_path
        )

        TASK_MANAGER.create(task_id)
        TASK_MANAGER.update(task_id, status="QUEUED", stage="Queued for stem separation", percent=0)

        async def _job() -> None:
            try:
                TASK_MANAGER.update(task_id, status="RUNNING", stage="Khởi động tách stem", percent=5)

                def _stem_progress(sub_pct: float) -> None:
                    overall = 5 + int(sub_pct * 0.9)
                    TASK_MANAGER.update(
                        task_id,
                        stage=f"Đang tách stem AI ({int(sub_pct)}%)...",
                        percent=overall,
                    )

                result = await asyncio.to_thread(
                    run_stems_only, stereo_path, task_id, stem_mode, _stem_progress
                )
                result["task_id"] = task_id
                TASK_MANAGER.attach_result(task_id, result)
                TASK_MANAGER.update(task_id, status="COMPLETE", stage="Hoàn tất", percent=100)
            except Exception as e:
                TASK_MANAGER.set_failed(task_id, f"{type(e).__name__}: {str(e)}")

        bg_task = asyncio.create_task(_job())
        _background_tasks.add(bg_task)
        bg_task.add_done_callback(_background_tasks.discard)

        return {
            "task_id": task_id,
            "status": "QUEUED",
            "stem_mode": stem_mode,
            "status_url": f"/api/v1/jobs/{task_id}",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start stem separation: {str(e)}",
        )


@router.get("/v1/jobs/{task_id}")
async def v1_job_status(task_id: str) -> Dict[str, Any]:
    """[Dev API] Poll the status of an asynchronous v1 job (e.g. stem separation)."""
    _validate_task_id(task_id)
    st = TASK_MANAGER.get(task_id)
    if st is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {task_id} not found",
        )

    payload: Dict[str, Any] = {
        "task_id": st.task_id,
        "status": st.status,
        "stage": st.stage,
        "percent": st.percent,
        "error": st.error,
    }
    if st.status == "COMPLETE":
        result = TASK_MANAGER.get_result(task_id) or {}
        # Attach convenient audio download URLs for stem-separation jobs
        if isinstance(result.get("stems"), dict):
            result["zip_url"] = f"/api/export/stems-zip/{task_id}"
        payload["result"] = result
    return payload


@router.post("/v1/denoise", status_code=status.HTTP_202_ACCEPTED)
async def v1_denoise(
    file: UploadFile = File(...),
    strength: int = Query(80, ge=0, le=100, description="Noise reduction strength 0-100"),
) -> Dict[str, Any]:
    """[Dev API] Remove noise from an audio file with DeepFilterNet (async job).

    Returns a task_id immediately; poll GET /api/v1/jobs/{task_id} until
    COMPLETE, then download the cleaned audio (audio/wav) from
    ``result.denoise_url``. The audio is processed as-is (no normalisation) and
    returned at the original sample rate.
    """
    try:
        task_id, original_path = await _save_upload_file(file)

        TASK_MANAGER.create(task_id)
        TASK_MANAGER.update(task_id, status="QUEUED", stage="Queued for noise reduction", percent=0)

        async def _job() -> None:
            try:
                TASK_MANAGER.update(task_id, status="RUNNING", stage="Khởi động lọc nhiễu", percent=5)

                def _progress(pct: float, stage: str) -> None:
                    TASK_MANAGER.update(task_id, stage=stage, percent=int(pct))

                result = await asyncio.to_thread(run_denoise, task_id, original_path, float(strength), _progress)
                TASK_MANAGER.attach_result(task_id, result)
                TASK_MANAGER.update(task_id, status="COMPLETE", stage="Hoàn tất", percent=100)
            except Exception as e:
                TASK_MANAGER.set_failed(task_id, f"{type(e).__name__}: {str(e)}")

        bg_task = asyncio.create_task(_job())
        _background_tasks.add(bg_task)
        bg_task.add_done_callback(_background_tasks.discard)

        return {
            "task_id": task_id,
            "status": "QUEUED",
            "strength": strength,
            "status_url": f"/api/v1/jobs/{task_id}",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start noise reduction: {str(e)}",
        )
