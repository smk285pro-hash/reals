"""Modal deployment cho stem-app backend (AI Audio Lab).

Cấu trúc:
- `fastapi_web` — ASGI web layer (REST + SSE), chạy thường trực (min_containers=1)
- `analyze_deep_task` / `analyze_stems_task` — GPU worker (NVIDIA T4, Demucs)
- `analyze_chords_task` — CPU worker (Viterbi HMM chords)
- `denoise_task` — CPU worker (DeepFilterNet)
- `cleanup_stale_sessions` — cron dọn session mỗi giờ

SSO + tier gating (monorepo Bước 4): web layer gate các endpoint đổi trạng thái /
tốn GPU bằng `require_auth` (verify bridge token qua main-app reals.media
`/api/auth/verify-session`, xem backend/app/core/reals_auth.py). Endpoint tách
nhạc (deep / stems / v1/separate) gọi `consume_separation_credit` NGAY TRƯỚC khi
spawn GPU worker — hết quota → 429, main-app lỗi → 503 (fail-closed). Các
endpoint polling / tải file (status, progress, audio, stems, export...) giữ
public — task_id là UUID khó đoán, tương thích <audio> tag không gắn được header.

Env (ghi đè bằng Modal Secret nếu cần):
- REALS_MAIN_APP_URL   — URL main-app cấp bridge token (mặc định https://reals.media)
- REALS_AUTH_CACHE_TTL — giây, mặc định 60 (cache verify)
- REALS_AUTH_TIMEOUT   — timeout HTTP tới main-app, giây, mặc định 5

Deploy: `modal deploy modal_app.py` (chạy trong apps/stem-app/ — image mount
thư mục `backend/` cạnh file này). Xem DEPLOY.md cho thứ tự deploy đúng.
"""
from __future__ import annotations

import asyncio
import io
import json
import os
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional, Tuple
import uuid
import zipfile

# Guarantee STORAGE_DIR is set before any backend modules are imported
os.environ["STORAGE_DIR"] = "/storage"

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
import modal

# 1. Initialize Modal App
app = modal.App("ai-audio-lab")

# 2. Build Container Image with system packages and Python dependencies
image = (
    modal.Image.debian_slim(python_version="3.10")
    # REALS_MAIN_APP_URL: main-app verify bridge token + ghi quota (SSO).
    # Ghi đè bằng Modal Secret `reals-sso` nếu cần (không bắt buộc).
    .env({"STORAGE_DIR": "/storage", "REALS_MAIN_APP_URL": "https://reals.media"})
    .apt_install("ffmpeg", "libsndfile1", "git")
    .pip_install(
        "fastapi==0.115.6",
        "uvicorn[standard]==0.34.0",
        "pydantic==2.10.4",
        "python-multipart==0.0.20",
        "numpy>=1.26,<2.1",
        "scipy>=1.11",
        "librosa==0.10.2.post1",
        "soundfile>=0.12.1",
        "pyloudnorm>=0.1.0",
        "pretty_midi>=0.2.10",
        "aiofiles>=23.2.1",
        "httpx>=0.27",
        "python-dotenv>=1.0.1",
        "torch>=2.3,<2.9",
        "torchaudio>=2.3,<2.9",
        "demucs==4.0.1",
        "einops>=0.8",
        "deepfilternet>=0.5.6,<0.6",
    )
    # Pre-download the DeepFilterNet checkpoint into the image layer so worker
    # cold starts never hit the network for model weights.
    .run_commands('python -c "from df.enhance import init_df; init_df()"')
    .add_local_dir("backend", remote_path="/root/backend")
)

# 3. Persistent Distributed Volume for persistent cross-container audio assets
storage_volume = modal.Volume.from_name("audio-storage", create_if_missing=True)


# ============================================================================
# SCHEDULED HOUSEKEEPING: TTL cleanup for orphaned sessions on the Volume
# ============================================================================


@app.function(
    image=image,
    cpu=0.5,
    memory=512,
    timeout=300,
    volumes={"/storage": storage_volume},
    schedule=modal.Cron("0 * * * *"),  # hourly
)
def cleanup_stale_sessions() -> Dict[str, Any]:
    """Hourly sweep of task dirs idle beyond SESSION_TTL_HOURS (default 24)."""
    import sys

    if "/root" not in sys.path:
        sys.path.insert(0, "/root")
    if "/root/backend" not in sys.path:
        sys.path.insert(0, "/root/backend")

    from backend.app.core.config import SETTINGS
    from backend.app.core.session_cleanup import read_status_file, sweep_stale_sessions

    def _active(task_id: str) -> bool:
        # Cross-container state lives in status.json written by web/GPU workers
        return read_status_file(SETTINGS.upload_dir, task_id) in ("QUEUED", "RUNNING")

    ttl_seconds = float(os.getenv("SESSION_TTL_HOURS", "24")) * 3600.0
    removed = sweep_stale_sessions(
        SETTINGS.upload_dir,
        SETTINGS.stems_dir,
        SETTINGS.export_dir,
        ttl_seconds=ttl_seconds,
        is_active=_active,
    )
    storage_volume.commit()
    return {"status": "ok", "removed_count": len(removed), "removed": sorted(removed)}


# ============================================================================
# SHARED WORKER BOOTSTRAP: sys.path, Volume sync, file-backed TaskManager
# ============================================================================


def _setup_task_env(task_id: str) -> Tuple[Any, Any, Path, Path]:
    """Bootstrap a Modal worker container for a task and wire progress to the Volume.

    Returns (SETTINGS, TASK_MANAGER, status_file, result_file). The TaskManager's
    update() is wrapped so every progress change is flushed to status.json on the
    shared Volume — the web layer reads those files for SSE/REST polling.
    """
    import sys

    if "/root" not in sys.path:
        sys.path.insert(0, "/root")
    if "/root/backend" not in sys.path:
        sys.path.insert(0, "/root/backend")

    os.environ["STORAGE_DIR"] = "/storage"

    from backend.app.core.config import SETTINGS, ensure_storage_dirs
    from backend.app.core.task_manager import TASK_MANAGER

    ensure_storage_dirs()
    storage_volume.reload()

    status_file = SETTINGS.upload_dir / task_id / "status.json"
    result_file = SETTINGS.upload_dir / task_id / "result.json"

    # The worker container starts with an empty in-memory TaskManager: without an
    # explicit create(), every update() below is a silent no-op and status.json
    # is never written from pipeline progress callbacks.
    TASK_MANAGER.create(task_id)

    _original_update = TASK_MANAGER.update

    def _file_synced_update(tid: str, **fields: Any) -> Any:
        result = _original_update(tid, **fields)
        try:
            state = TASK_MANAGER.get(tid)
            if state is not None and state.status != "COMPLETE":
                payload = {
                    "task_id": tid,
                    "status": state.status,
                    "stage": state.stage,
                    "percent": state.percent,
                    "error": state.error,
                }
                status_file.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
                storage_volume.commit()
        except Exception:
            pass
        return result

    TASK_MANAGER.update = _file_synced_update  # type: ignore[method-assign]

    return SETTINGS, TASK_MANAGER, status_file, result_file


def _write_task_state(status_file: Path, task_id: str, state: str, stage: str, percent: int, error: Any = None) -> None:
    """Persist a task status snapshot to the shared Volume."""
    payload = {
        "task_id": task_id,
        "status": state,
        "stage": stage,
        "percent": percent,
        "error": error,
    }
    status_file.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    storage_volume.commit()


# ============================================================================
# GPU WORKER FUNCTION: Multi-Stage Deep DSP & AI Demucs Analysis
# ============================================================================


@app.function(
    image=image,
    gpu="T4",
    timeout=900,
    scaledown_window=600,
    min_containers=0,
    volumes={"/storage": storage_volume},
)
def analyze_deep_task(task_id: str, stem_mode: str) -> Dict[str, Any]:
    """Execute end-to-end multi-track AI Demucs stem separation & Viterbi HMM analysis on GPU."""
    import sys

    if "/root" not in sys.path:
        sys.path.insert(0, "/root")
    if "/root/backend" not in sys.path:
        sys.path.insert(0, "/root/backend")

    os.environ["STORAGE_DIR"] = "/storage"

    from backend.app.core.config import SETTINGS, ensure_storage_dirs
    from backend.app.core.task_manager import TASK_MANAGER
    from backend.app.core.unified_pipeline import UnifiedDeepAnalyzer

    ensure_storage_dirs()
    storage_volume.reload()

    status_file = SETTINGS.upload_dir / task_id / "status.json"
    result_file = SETTINGS.upload_dir / task_id / "result.json"

    # The GPU container starts with an empty in-memory TaskManager: without an
    # explicit create(), every update() below is a silent no-op (get() returns
    # None) and status.json is never written from pipeline progress callbacks.
    TASK_MANAGER.create(task_id)

    # Wrap TaskManager to sync progress to status.json file on volume
    # (SSE endpoint reads from file, not from in-memory TaskManager)
    _original_update = TASK_MANAGER.update

    def _file_synced_update(tid: str, **fields: Any) -> Any:
        result = _original_update(tid, **fields)
        try:
            state = TASK_MANAGER.get(tid)
            if state is not None and state.status != "COMPLETE":
                payload = {
                    "task_id": tid,
                    "status": state.status,
                    "stage": state.stage,
                    "percent": state.percent,
                    "error": state.error,
                }
                status_file.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
                storage_volume.commit()
        except Exception:
            pass
        return result

    TASK_MANAGER.update = _file_synced_update  # type: ignore[method-assign]

    try:
        write_state = {
            "task_id": task_id,
            "status": "RUNNING",
            "stage": "Khoi tao moi truong GPU",
            "percent": 5,
            "error": None,
        }
        status_file.write_text(json.dumps(write_state, ensure_ascii=False), encoding="utf-8")
        storage_volume.commit()

        master_path = SETTINGS.upload_dir / task_id / "master_44k_stereo.wav"
        if not master_path.exists():
            raise FileNotFoundError(f"Master audio file not found at {master_path}")

        analyzer = UnifiedDeepAnalyzer(task_id=task_id, audio_path=master_path, stem_mode=stem_mode)

        async def _execute_analysis() -> None:
            await analyzer.run(TASK_MANAGER)

        asyncio.run(_execute_analysis())

        final_result = TASK_MANAGER.get_result(task_id)
        if final_result is not None:
            result_file.write_text(json.dumps(final_result, ensure_ascii=False), encoding="utf-8")

        write_state = {
            "task_id": task_id,
            "status": "COMPLETE",
            "stage": "Hoan tat phan tich chuyen sau",
            "percent": 100,
            "error": None,
        }
        status_file.write_text(json.dumps(write_state, ensure_ascii=False), encoding="utf-8")
        storage_volume.commit()

        return {
            "task_id": task_id,
            "status": "complete",
            "stem_mode": stem_mode,
        }
    except Exception as exc:
        write_state = {
            "task_id": task_id,
            "status": "FAILED",
            "stage": "Loi phan tich tren GPU",
            "percent": 0,
            "error": str(exc),
        }
        status_file.write_text(json.dumps(write_state, ensure_ascii=False), encoding="utf-8")
        storage_volume.commit()
        return {
            "task_id": task_id,
            "status": "failed",
            "error": str(exc),
        }


# ============================================================================
# CPU WORKER FUNCTION: Standalone Chord Progression Analysis (no stems)
# ============================================================================


@app.function(
    image=image,
    cpu=2,
    memory=4096,
    timeout=900,
    scaledown_window=300,
    min_containers=0,
    volumes={"/storage": storage_volume},
)
def analyze_chords_task(task_id: str) -> Dict[str, Any]:
    """Run the standalone chord-progression pipeline (rhythm + chroma + Viterbi) on CPU."""
    SETTINGS, TASK_MANAGER, status_file, result_file = _setup_task_env(task_id)

    from backend.app.core.feature_pipelines import run_chords_analysis

    try:
        _write_task_state(status_file, task_id, "RUNNING", "Khoi tao phan tich hop am", 5)
        TASK_MANAGER.update(task_id, status="RUNNING")

        master_stereo = SETTINGS.upload_dir / task_id / "master_44k_stereo.wav"
        master_mono = SETTINGS.upload_dir / task_id / "master_mono.wav"
        if not master_stereo.exists() or not master_mono.exists():
            raise FileNotFoundError(f"Master audio not found for task {task_id}")

        def _progress(pct: float, stage: str) -> None:
            TASK_MANAGER.update(task_id, stage=stage, percent=int(pct))

        result = run_chords_analysis(master_stereo, master_mono, _progress)
        result["task_id"] = task_id

        result_file.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        _write_task_state(status_file, task_id, "COMPLETE", "Hoan tat phan tich hop am", 100)

        return {"task_id": task_id, "status": "complete"}
    except Exception as exc:
        _write_task_state(status_file, task_id, "FAILED", "Loi phan tich hop am", 0, str(exc))
        return {"task_id": task_id, "status": "failed", "error": str(exc)}


# ============================================================================
# GPU WORKER FUNCTION: Standalone Stem Separation (no chord/rhythm analysis)
# ============================================================================


@app.function(
    image=image,
    gpu="T4",
    timeout=900,
    scaledown_window=600,
    min_containers=0,
    volumes={"/storage": storage_volume},
)
def analyze_stems_task(task_id: str, stem_mode: str) -> Dict[str, Any]:
    """Run standalone AI Demucs stem separation on GPU, without any music analysis."""
    SETTINGS, TASK_MANAGER, status_file, result_file = _setup_task_env(task_id)

    from backend.app.core.feature_pipelines import run_stems_only

    try:
        _write_task_state(status_file, task_id, "RUNNING", "Khoi tao tach stem tren GPU", 5)
        TASK_MANAGER.update(task_id, status="RUNNING")

        master_stereo = SETTINGS.upload_dir / task_id / "master_44k_stereo.wav"
        if not master_stereo.exists():
            raise FileNotFoundError(f"Master audio not found for task {task_id}")

        def _stem_progress(sub_pct: float) -> None:
            overall = 5 + int(sub_pct * 0.9)
            TASK_MANAGER.update(
                task_id,
                stage=f"Dang tach stem AI ({int(sub_pct)}%)...",
                percent=overall,
            )

        result = run_stems_only(master_stereo, task_id, stem_mode, _stem_progress)
        result["task_id"] = task_id

        result_file.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        _write_task_state(status_file, task_id, "COMPLETE", "Hoan tat tach stem", 100)

        return {"task_id": task_id, "status": "complete", "stem_mode": stem_mode}
    except Exception as exc:
        _write_task_state(status_file, task_id, "FAILED", "Loi tach stem tren GPU", 0, str(exc))
        return {"task_id": task_id, "status": "failed", "error": str(exc)}


# ============================================================================
# CPU WORKER FUNCTION: DeepFilterNet Noise Reduction (SOTA denoising)
# ============================================================================


@app.function(
    image=image,
    cpu=4,
    memory=4096,
    timeout=900,
    scaledown_window=300,
    min_containers=0,
    volumes={"/storage": storage_volume},
)
def denoise_task(task_id: str, strength: float = 80.0) -> Dict[str, Any]:
    """Run DeepFilterNet noise reduction on the original upload (processed as-is)."""
    SETTINGS, TASK_MANAGER, status_file, result_file = _setup_task_env(task_id)

    from backend.app.core.denoise_engine import run_denoise

    try:
        _write_task_state(status_file, task_id, "RUNNING", "Khoi tao loc nhieu DeepFilterNet", 5)
        TASK_MANAGER.update(task_id, status="RUNNING")

        task_dir = SETTINGS.upload_dir / task_id
        candidates = sorted(task_dir.glob("original_*")) if task_dir.exists() else []
        if candidates:
            input_path = candidates[0]
        else:
            input_path = task_dir / "master_44k_stereo.wav"
        if not input_path.exists():
            raise FileNotFoundError(f"Audio not found for task {task_id}")

        def _progress(pct: float, stage: str) -> None:
            TASK_MANAGER.update(task_id, stage=stage, percent=int(pct))

        result = run_denoise(task_id, input_path, strength, _progress)

        result_file.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        _write_task_state(status_file, task_id, "COMPLETE", "Hoan tat loc nhieu", 100)

        return {"task_id": task_id, "status": "complete", "engine": result.get("engine")}
    except Exception as exc:
        _write_task_state(status_file, task_id, "FAILED", "Loi loc nhieu", 0, str(exc))
        return {"task_id": task_id, "status": "failed", "error": str(exc)}


# ============================================================================
# FASTAPI WEB LAYER: ASGI Gateway & Realtime Telemetry/SSE Streamer
# ============================================================================


@app.function(
    image=image,
    cpu=2,
    memory=2048,
    # 300s ceiling so the synchronous /api/v1/chords endpoint can finish
    # CPU-bound chroma + Viterbi decoding on longer songs.
    timeout=300,
    scaledown_window=600,
    min_containers=1,
    volumes={"/storage": storage_volume},
)
@modal.asgi_app()
def fastapi_web() -> Any:
    """FastAPI Web ASGI Application Entry Point serving REST and SSE endpoints."""
    import sys

    if "/root" not in sys.path:
        sys.path.insert(0, "/root")
    if "/root/backend" not in sys.path:
        sys.path.insert(0, "/root/backend")

    os.environ["STORAGE_DIR"] = "/storage"

    import librosa
    import numpy as np
    import soundfile as sf

    from backend.app.core.audio_processor import (
        compute_peaks,
        get_duration,
        load_any_format,
        normalize_ebu_r128,
        resample,
        save_master,
    )
    from backend.app.core.config import MAX_UPLOAD_MB, SAMPLE_RATE, SETTINGS, STEM_MODES, ensure_storage_dirs
    from backend.app.core.key_detector import detect_key
    from backend.app.core.midi_exporter import export_midi
    # SSO + tier gating — verify bridge token qua main-app (fail-closed),
    # ghi quota tách nhạc qua /api/usage/separation (check-and-record atomic)
    from backend.app.core.reals_auth import consume_separation_credit, require_auth
    from backend.app.core.schemas import BeatPoint, ChordSegment

    ensure_storage_dirs()

    web_app = FastAPI(
        title="AI Audio Lab Modal API",
        version="2026.2.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS: SPA chạy trên domain khác (Vercel / stem.reals.media) gọi cross-origin
    # tới URL Modal này. Auth dùng Authorization: Bearer (cookie-less) nên
    # allow_origins=["*"] an toàn với fetch spec; giữ nguyên như bản cũ để không
    # break frontend đang chạy.
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        # "*" combined with allow_credentials=True is rejected by browsers per
        # the fetch spec; this API is cookie-less so credentials are unnecessary.
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def parse_range_header(range_header: str, file_size: int) -> Tuple[int, int]:
        if not range_header.startswith("bytes="):
            raise ValueError("Invalid Range header prefix")
        range_spec = range_header[len("bytes=") :].strip()
        if "," in range_spec:
            range_spec = range_spec.split(",")[0].strip()
        parts = range_spec.split("-")
        if len(parts) != 2:
            raise ValueError("Invalid Range format")
        start_str, end_str = parts[0].strip(), parts[1].strip()
        if not start_str and not end_str:
            raise ValueError("Empty range")
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
            raise ValueError("Range out of bounds")
        end = min(end, file_size - 1)
        return start, end

    def iter_file_chunk(path: Path, start: int, end: int, chunk_size: int = 64 * 1024) -> Generator[bytes, None, None]:
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

    @web_app.get("/api/health")
    async def health() -> Dict[str, Any]:
        """Health check endpoint for Vercel frontend probing."""
        return {
            "status": "ok",
            "gpu_available": True,
            "version": "2026.2.0",
            "platform": "modal-serverless",
        }

    @web_app.get("/api/auth/me")
    async def auth_me(user: Dict[str, Any] = Depends(require_auth)) -> Dict[str, Any]:
        """Thông tin user + tier hiện tại (verify bridge token qua main-app).

        SPA stem-app gọi endpoint này ngay sau khi nhận token (#token=...) để
        hiển thị badge tier + số lượt còn lại. Không trả bridge token về client.
        (Giống /api/auth/me của backend local — routes.py.)
        """
        return {k: v for k, v in user.items() if k != "token"}

    @web_app.post("/api/upload")
    async def upload(
        file: UploadFile = File(description="Tệp âm thanh tải lên"),
        user: Dict[str, Any] = Depends(require_auth),
    ) -> Dict[str, Any]:
        """Receive audio file, normalize EBU R128 (-14 LUFS), calculate peaks, and commit to Volume."""
        try:
            content_type = file.content_type or ""
            filename = file.filename or "audio_file.wav"
            valid_extensions = (".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".aiff", ".wma")
            if not (content_type.startswith("audio/") or filename.lower().endswith(valid_extensions)):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid content type '{content_type}'. Please upload an audio file.",
                )

            task_id = str(uuid.uuid4())
            task_dir = SETTINGS.upload_dir / task_id
            task_dir.mkdir(parents=True, exist_ok=True)

            safe_name = os.path.basename(filename.replace("\\", "/")).strip()
            if not safe_name or safe_name.startswith("."):
                safe_name = "audio_file.wav"
            original_path = task_dir / f"original_{safe_name}"
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

            status_payload = {
                "task_id": task_id,
                "status": "QUEUED",
                "stage": "Tải lên hoàn tất",
                "percent": 0,
                "error": None,
            }
            (task_dir / "status.json").write_text(json.dumps(status_payload, ensure_ascii=False), encoding="utf-8")
            await storage_volume.commit.aio()

            return {
                "task_id": task_id,
                "status": "QUEUED",
                "duration": round(duration, 3),
                "waveform_url": f"/api/waveform/{task_id}",
                "audio_url": f"/api/audio/{task_id}",
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Upload processing failed: {str(exc)}",
            )

    @web_app.api_route("/api/audio/{task_id}", methods=["GET", "HEAD"])
    async def get_audio(task_id: str, request: Request) -> Response:
        """Stream master stereo WAV file with HTTP 206 Partial Content byte range support."""
        await storage_volume.reload.aio()
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

    @web_app.get("/api/waveform/{task_id}")
    async def get_waveform(task_id: str) -> List[List[float]]:
        """Retrieve precomputed waveform min/max peak points."""
        await storage_volume.reload.aio()
        peaks_path = SETTINGS.upload_dir / task_id / "peaks.json"
        if not peaks_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Waveform data not found for task {task_id}",
            )
        with open(peaks_path, "r", encoding="utf-8") as f:
            data: List[List[float]] = json.load(f)
        return data

    @web_app.post("/api/analyze/quick/{task_id}")
    async def analyze_quick(
        task_id: str,
        user: Dict[str, Any] = Depends(require_auth),
    ) -> Dict[str, Any]:
        """Perform fast (<2s) CPU telemetry analysis (BPM, key, scale mode, duration)."""
        await storage_volume.reload.aio()
        mono_path = SETTINGS.upload_dir / task_id / "master_mono.wav"

        # Retry sync in case files are just flushed to volume
        if not mono_path.exists():
            for _ in range(6):
                await asyncio.sleep(0.5)
                await storage_volume.reload.aio()
                if mono_path.exists():
                    break

        if not mono_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Master mono audio not found for task {task_id}",
            )

        def _quick_analysis() -> Dict[str, Any]:
            try:
                mono, sr = sf.read(str(mono_path), dtype="float32")
                if mono.ndim > 1:
                    mono = np.mean(mono, axis=-1)

                # Robust autocorrelation-based tempo estimation
                hop_length = 512
                onset_env = librosa.onset.onset_strength(
                    y=mono, sr=sr, hop_length=hop_length, n_mels=128,
                )
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

                if bpm_val <= 0 or np.isnan(bpm_val) or bpm_val > 300:
                    bpm_val = 120.0

                chroma = librosa.feature.chroma_cqt(y=mono, sr=sr)
                chroma_mean = np.mean(chroma, axis=1)
                master_key, scale_mode, _ = detect_key(chroma_mean)
                dur = float(len(mono) / sr)

                return {
                    "bpm": round(bpm_val, 1),
                    "master_key": master_key,
                    "scale_mode": scale_mode,
                    "duration": round(dur, 2),
                }
            except Exception as exc:
                # Surface the real failure (consistent with the local backend)
                # instead of returning fabricated telemetry with duration=0.
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Quick analysis failed: {exc}",
                )

        result = await asyncio.to_thread(_quick_analysis)
        return result

    @web_app.post("/api/analyze/deep/{task_id}", status_code=status.HTTP_202_ACCEPTED)
    async def analyze_deep(
        task_id: str,
        stem_mode: str = Query("4", description="Stem separation mode: 2, 4, 6, 8"),
        user: Dict[str, Any] = Depends(require_auth),
    ) -> Dict[str, Any]:
        """Spawn asynchronous multi-track deep analysis on serverless NVIDIA T4 GPU container."""
        if stem_mode not in STEM_MODES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid stem_mode '{stem_mode}'. Supported modes: {STEM_MODES}",
            )

        await storage_volume.reload.aio()
        master_path = SETTINGS.upload_dir / task_id / "master_44k_stereo.wav"
        if not master_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found or master audio missing.",
            )

        # Ghi nhận quota tách nhạc TRƯỚC khi spawn GPU worker (main-app
        # check-and-record atomic; hết quota → 429, service lỗi → 503 fail-closed).
        # Trả kèm quota mới nhất để SPA cập nhật badge "còn X lượt" NGAY.
        credit = await consume_separation_credit(
            user, {"taskId": task_id, "stemMode": stem_mode, "endpoint": "analyze/deep"}
        )

        status_payload = {
            "task_id": task_id,
            "status": "QUEUED",
            "stage": "Đang khởi tạo container GPU NVIDIA T4",
            "percent": 2,
            "error": None,
        }
        (SETTINGS.upload_dir / task_id / "status.json").write_text(
            json.dumps(status_payload, ensure_ascii=False), encoding="utf-8"
        )
        await storage_volume.commit.aio()

        # Non-blocking async invocation of GPU worker function
        analyze_deep_task.spawn(task_id, stem_mode)

        return {"task_id": task_id, "status": "QUEUED", "stem_mode": stem_mode, "quota": credit}

    @web_app.post("/api/analyze/chords/{task_id}", status_code=status.HTTP_202_ACCEPTED)
    async def analyze_chords(
        task_id: str,
        user: Dict[str, Any] = Depends(require_auth),
    ) -> Dict[str, Any]:
        """Spawn standalone chord-progression analysis (no stems) on a CPU worker."""
        await storage_volume.reload.aio()
        master_path = SETTINGS.upload_dir / task_id / "master_44k_stereo.wav"
        mono_path = SETTINGS.upload_dir / task_id / "master_mono.wav"
        if not master_path.exists() or not mono_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found or master audio missing.",
            )

        status_payload = {
            "task_id": task_id,
            "status": "QUEUED",
            "stage": "Đang khởi tạo container phân tích hợp âm",
            "percent": 2,
            "error": None,
        }
        (SETTINGS.upload_dir / task_id / "status.json").write_text(
            json.dumps(status_payload, ensure_ascii=False), encoding="utf-8"
        )
        await storage_volume.commit.aio()

        analyze_chords_task.spawn(task_id)

        return {"task_id": task_id, "status": "QUEUED"}

    @web_app.post("/api/analyze/stems/{task_id}", status_code=status.HTTP_202_ACCEPTED)
    async def analyze_stems(
        task_id: str,
        stem_mode: str = Query("4", description="Stem separation mode: 2, 4, 6, 8"),
        user: Dict[str, Any] = Depends(require_auth),
    ) -> Dict[str, Any]:
        """Spawn standalone AI stem separation (no music analysis) on a GPU worker."""
        if stem_mode not in STEM_MODES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid stem_mode '{stem_mode}'. Supported modes: {STEM_MODES}",
            )

        await storage_volume.reload.aio()
        master_path = SETTINGS.upload_dir / task_id / "master_44k_stereo.wav"
        if not master_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found or master audio missing.",
            )

        # Ghi nhận quota tách nhạc TRƯỚC khi spawn GPU worker (xem analyze_deep)
        credit = await consume_separation_credit(
            user, {"taskId": task_id, "stemMode": stem_mode, "endpoint": "analyze/stems"}
        )

        status_payload = {
            "task_id": task_id,
            "status": "QUEUED",
            "stage": "Đang khởi tạo container GPU tách stem",
            "percent": 2,
            "error": None,
        }
        (SETTINGS.upload_dir / task_id / "status.json").write_text(
            json.dumps(status_payload, ensure_ascii=False), encoding="utf-8"
        )
        await storage_volume.commit.aio()

        analyze_stems_task.spawn(task_id, stem_mode)

        return {"task_id": task_id, "status": "QUEUED", "stem_mode": stem_mode, "quota": credit}

    @web_app.post("/api/analyze/denoise/{task_id}", status_code=status.HTTP_202_ACCEPTED)
    async def analyze_denoise(
        task_id: str,
        strength: int = Query(80, ge=0, le=100, description="Noise reduction strength 0-100"),
        user: Dict[str, Any] = Depends(require_auth),
    ) -> Dict[str, Any]:
        """Spawn DeepFilterNet noise reduction on a CPU worker."""
        await storage_volume.reload.aio()
        task_dir = SETTINGS.upload_dir / task_id
        has_original = task_dir.exists() and any(task_dir.glob("original_*"))
        has_master = (task_dir / "master_44k_stereo.wav").exists()
        if not has_original and not has_master:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found or audio missing.",
            )

        status_payload = {
            "task_id": task_id,
            "status": "QUEUED",
            "stage": "Đang khởi tạo container lọc nhiễu DeepFilterNet",
            "percent": 2,
            "error": None,
        }
        (SETTINGS.upload_dir / task_id / "status.json").write_text(
            json.dumps(status_payload, ensure_ascii=False), encoding="utf-8"
        )
        await storage_volume.commit.aio()

        denoise_task.spawn(task_id, float(strength))

        return {"task_id": task_id, "status": "QUEUED", "strength": strength}

    @web_app.get("/api/status/{task_id}")
    async def get_status(task_id: str) -> Dict[str, Any]:
        """Direct REST polling endpoint for deep analysis progress and completed result."""
        await storage_volume.reload.aio()
        status_file = SETTINGS.upload_dir / task_id / "status.json"
        result_file = SETTINGS.upload_dir / task_id / "result.json"

        if not status_file.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Status not found for task {task_id}",
            )

        try:
            status_data = json.loads(status_file.read_text(encoding="utf-8"))
        except Exception:
            status_data = {"status": "RUNNING", "percent": 5, "stage": "Đang đồng bộ"}

        current_status = status_data.get("status", "RUNNING")
        percent = status_data.get("percent", 0)
        stage = status_data.get("stage", "Đang xử lý")
        error = status_data.get("error")

        if current_status == "COMPLETE" and result_file.exists():
            try:
                result_data = json.loads(result_file.read_text(encoding="utf-8"))
                return {
                    "status": "COMPLETE",
                    "percent": 100,
                    "stage": "Hoàn tất phân tích",
                    "result": result_data,
                }
            except Exception:
                pass

        return {
            "status": current_status,
            "percent": percent,
            "stage": stage,
            "error": error,
        }

    @web_app.get("/api/progress/{task_id}")
    async def get_progress(task_id: str) -> StreamingResponse:
        """SSE stream for tracking real-time deep analysis progress via Volume state sync."""
        async def event_generator() -> Generator[str, None, None]:
            status_file = SETTINGS.upload_dir / task_id / "status.json"
            result_file = SETTINGS.upload_dir / task_id / "result.json"

            # Initial keepalive
            yield ": keepalive\n\n"

            while True:
                await storage_volume.reload.aio()

                if not status_file.exists():
                    yield 'event: error\ndata: {"error":"task_not_found"}\n\n'
                    return

                try:
                    status_data = json.loads(status_file.read_text(encoding="utf-8"))
                except Exception:
                    status_data = {"status": "RUNNING", "percent": 5, "stage": "Đang đồng bộ"}

                current_status = status_data.get("status", "RUNNING")
                percent = status_data.get("percent", 0)
                stage = status_data.get("stage", "Đang xử lý")
                error = status_data.get("error")

                if current_status == "COMPLETE":
                    if result_file.exists():
                        try:
                            result_data = json.loads(result_file.read_text(encoding="utf-8"))
                            yield f"event: complete\ndata: {json.dumps(result_data, ensure_ascii=False)}\n\n"
                            return
                        except Exception:
                            pass
                    yield f"event: complete\ndata: {json.dumps({'task_id': task_id, 'status': 'COMPLETE'}, ensure_ascii=False)}\n\n"
                    return

                if current_status == "FAILED":
                    yield f"event: error\ndata: {json.dumps({'error': error or 'Analysis failed'}, ensure_ascii=False)}\n\n"
                    return

                yield f"event: progress\ndata: {json.dumps({'percent': percent, 'stage': stage}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(1.0)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    @web_app.api_route("/api/stems/{task_id}/{stem_name}", methods=["GET", "HEAD"])
    async def get_stem(task_id: str, stem_name: str, request: Request) -> Response:
        """Serve separated stem audio file with HTTP 206 Partial Content byte range support."""
        await storage_volume.reload.aio()
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

    @web_app.api_route("/api/denoised/{task_id}", methods=["GET", "HEAD"])
    async def get_denoised(task_id: str, request: Request) -> Response:
        """Serve the denoised WAV file with HTTP 206 Partial Content byte range support."""
        await storage_volume.reload.aio()
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

    @web_app.get("/api/export/midi/{task_id}")
    async def export_midi_endpoint(task_id: str) -> FileResponse:
        """Download multi-track standard MIDI file (SMF-1)."""
        await storage_volume.reload.aio()
        midi_path = SETTINGS.export_dir / task_id / "multi_track.mid"
        if not midi_path.exists():
            result_file = SETTINGS.upload_dir / task_id / "result.json"
            if not result_file.exists():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"MIDI export not found and analysis result unavailable for {task_id}",
                )
            res = json.loads(result_file.read_text(encoding="utf-8"))
            chords_data = [ChordSegment(**c) for c in res.get("chords", [])]
            beats_data = [BeatPoint(**b) for b in res.get("beats", [])]
            bpm = float(res.get("telemetry", {}).get("bpm", 120.0))
            midi_path = export_midi(
                task_id=task_id,
                chords=chords_data,
                bassline=[],
                beats=beats_data,
                bpm=bpm,
            )
            await storage_volume.commit.aio()

        return FileResponse(
            path=str(midi_path),
            media_type="audio/midi",
            filename=f"multi_track_{task_id}.mid",
        )

    @web_app.get("/api/export/stems-zip/{task_id}")
    async def export_stems_zip(task_id: str) -> StreamingResponse:
        """Download in-memory ZIP archive containing all separated stem audio files."""
        await storage_volume.reload.aio()
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

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for wf in wav_files:
                zip_file.write(wf, arcname=wf.name)

        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=stems_{task_id}.zip"},
        )

    @web_app.get("/api/export/json/{task_id}")
    async def export_json(task_id: str) -> JSONResponse:
        """Download full deep analysis result structure as JSON."""
        await storage_volume.reload.aio()
        result_file = SETTINGS.upload_dir / task_id / "result.json"
        if not result_file.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Analysis result not found for task {task_id}",
            )
        result = json.loads(result_file.read_text(encoding="utf-8"))
        return JSONResponse(
            content=result,
            headers={"Content-Disposition": f"attachment; filename=analysis_{task_id}.json"},
        )

    @web_app.delete("/api/session/{task_id}")
    async def delete_session(
        task_id: str,
        user: Dict[str, Any] = Depends(require_auth),
    ) -> Dict[str, Any]:
        """Delete all session storage assets and clean Volume directories."""
        import shutil

        await storage_volume.reload.aio()
        dirs_to_clean = [
            SETTINGS.upload_dir / task_id,
            SETTINGS.stems_dir / task_id,
            SETTINGS.export_dir / task_id,
        ]
        for d in dirs_to_clean:
            if d.exists() and d.is_dir():
                shutil.rmtree(d, ignore_errors=True)

        await storage_volume.commit.aio()
        return {"status": "deleted", "task_id": task_id}

    # ========================================================================
    # PUBLIC DEVELOPER API (v1) — one-shot endpoints, audio processed as-is
    # ========================================================================

    async def _v1_save_upload(file: UploadFile) -> Tuple[str, Path]:
        """Validate and stream an uploaded audio file to the Volume (no processing)."""
        content_type = file.content_type or ""
        filename = file.filename or "audio_file.wav"
        valid_extensions = (".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".aiff", ".wma")
        if not (content_type.startswith("audio/") or filename.lower().endswith(valid_extensions)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid content type '{content_type}'. Please upload an audio file.",
            )

        task_id = str(uuid.uuid4())
        task_dir = SETTINGS.upload_dir / task_id
        task_dir.mkdir(parents=True, exist_ok=True)

        safe_name = os.path.basename(filename.replace("\\", "/")).strip()
        if not safe_name or safe_name.startswith("."):
            safe_name = "audio_file.wav"
        original_path = task_dir / f"original_{safe_name}"
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

    @web_app.post("/api/v1/analyze")
    async def v1_analyze(
        file: UploadFile = File(...),
        user: Dict[str, Any] = Depends(require_auth),
    ) -> Dict[str, Any]:
        """[Dev API] Detect tempo (BPM), key & scale mode from an audio file.

        The audio is analysed exactly as uploaded — no loudness normalisation or
        any other optimisation. Returns JSON synchronously.
        """
        from backend.app.core.feature_pipelines import analyze_telemetry_raw

        task_id, original_path = await _v1_save_upload(file)
        try:
            result = await asyncio.to_thread(analyze_telemetry_raw, original_path)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Tempo/key analysis failed: {str(exc)}",
            )
        result["task_id"] = task_id
        return result

    @web_app.post("/api/v1/chords")
    async def v1_chords(
        file: UploadFile = File(...),
        user: Dict[str, Any] = Depends(require_auth),
    ) -> Dict[str, Any]:
        """[Dev API] Detect the full chord progression of an audio file.

        Returns JSON synchronously: telemetry (bpm/key/mode/time signature),
        beat grid and chord segments. Audio is processed as-is (no loudness
        normalisation).
        """
        from backend.app.core.feature_pipelines import (
            prepare_working_audio,
            run_chords_analysis,
        )

        task_id, original_path = await _v1_save_upload(file)
        try:
            stereo_path, mono_path = await asyncio.to_thread(
                prepare_working_audio, task_id, original_path
            )
            await storage_volume.commit.aio()
            result = await asyncio.to_thread(
                run_chords_analysis, stereo_path, mono_path, None
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Chord analysis failed: {str(exc)}",
            )
        result["task_id"] = task_id
        return result

    @web_app.post("/api/v1/separate", status_code=status.HTTP_202_ACCEPTED)
    async def v1_separate(
        file: UploadFile = File(...),
        stem_mode: str = Query("4", description="Stem separation mode: 2, 4, 6, 8"),
        user: Dict[str, Any] = Depends(require_auth),
    ) -> Dict[str, Any]:
        """[Dev API] Separate an audio file into stems (async — poll the job).

        Stem separation takes minutes: this returns a task_id immediately; poll
        GET /api/v1/jobs/{task_id} until COMPLETE, then download the audio stems
        (audio/wav) from the URLs in the result. Audio is processed as-is.
        """
        from backend.app.core.feature_pipelines import prepare_working_audio

        if stem_mode not in STEM_MODES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid stem_mode '{stem_mode}'. Supported modes: {STEM_MODES}",
            )

        task_id, original_path = await _v1_save_upload(file)
        try:
            await asyncio.to_thread(prepare_working_audio, task_id, original_path)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Audio decoding failed: {str(exc)}",
            )

        # Ghi nhận quota tách nhạc TRƯỚC khi spawn GPU worker (xem analyze_deep);
        # trả kèm quota mới nhất cho client API
        credit = await consume_separation_credit(
            user, {"taskId": task_id, "stemMode": stem_mode, "endpoint": "v1/separate"}
        )

        status_payload = {
            "task_id": task_id,
            "status": "QUEUED",
            "stage": "Đang khởi tạo container GPU tách stem",
            "percent": 2,
            "error": None,
        }
        (SETTINGS.upload_dir / task_id / "status.json").write_text(
            json.dumps(status_payload, ensure_ascii=False), encoding="utf-8"
        )
        await storage_volume.commit.aio()

        analyze_stems_task.spawn(task_id, stem_mode)

        return {
            "task_id": task_id,
            "status": "QUEUED",
            "stem_mode": stem_mode,
            "status_url": f"/api/v1/jobs/{task_id}",
            "quota": credit,
        }

    @web_app.get("/api/v1/jobs/{task_id}")
    async def v1_job_status(task_id: str) -> Dict[str, Any]:
        """[Dev API] Poll the status of an asynchronous v1 job (e.g. stem separation)."""
        await storage_volume.reload.aio()
        status_file = SETTINGS.upload_dir / task_id / "status.json"
        result_file = SETTINGS.upload_dir / task_id / "result.json"

        if not status_file.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {task_id} not found",
            )

        try:
            status_data = json.loads(status_file.read_text(encoding="utf-8"))
        except Exception:
            status_data = {"status": "RUNNING", "percent": 5, "stage": "Đang đồng bộ"}

        payload: Dict[str, Any] = {
            "task_id": task_id,
            "status": status_data.get("status", "RUNNING"),
            "percent": status_data.get("percent", 0),
            "stage": status_data.get("stage", "Đang xử lý"),
            "error": status_data.get("error"),
        }

        if payload["status"] == "COMPLETE" and result_file.exists():
            try:
                result_data = json.loads(result_file.read_text(encoding="utf-8"))
                if isinstance(result_data.get("stems"), dict):
                    result_data["zip_url"] = f"/api/export/stems-zip/{task_id}"
                payload["result"] = result_data
            except Exception:
                pass

        return payload

    @web_app.post("/api/v1/denoise", status_code=status.HTTP_202_ACCEPTED)
    async def v1_denoise(
        file: UploadFile = File(...),
        strength: int = Query(80, ge=0, le=100, description="Noise reduction strength 0-100"),
        user: Dict[str, Any] = Depends(require_auth),
    ) -> Dict[str, Any]:
        """[Dev API] Remove noise from an audio file with DeepFilterNet (async job).

        Returns a task_id immediately; poll GET /api/v1/jobs/{task_id} until
        COMPLETE, then download the cleaned audio (audio/wav) from
        ``result.denoise_url``. Audio is processed as-is (no normalisation) and
        returned at the original sample rate.
        """
        task_id, original_path = await _v1_save_upload(file)

        status_payload = {
            "task_id": task_id,
            "status": "QUEUED",
            "stage": "Đang khởi tạo container lọc nhiễu DeepFilterNet",
            "percent": 2,
            "error": None,
        }
        (SETTINGS.upload_dir / task_id / "status.json").write_text(
            json.dumps(status_payload, ensure_ascii=False), encoding="utf-8"
        )
        await storage_volume.commit.aio()

        denoise_task.spawn(task_id, float(strength))

        return {
            "task_id": task_id,
            "status": "QUEUED",
            "strength": strength,
            "status_url": f"/api/v1/jobs/{task_id}",
        }

    return web_app
