from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import (
    SESSION_SWEEP_INTERVAL_SECONDS,
    SESSION_TTL_SECONDS,
    SETTINGS,
    ensure_storage_dirs,
)
from app.core.session_cleanup import sweep_stale_sessions
from app.core.task_manager import TASK_MANAGER

logger = logging.getLogger(__name__)


def _task_is_active(task_id: str) -> bool:
    """Preserve tasks that are still queued or running in this process."""
    state = TASK_MANAGER.get(task_id)
    return state is not None and state.status in ("QUEUED", "RUNNING")


async def _sweep_loop() -> None:
    """Periodically remove orphaned session storage (TTL-based)."""
    while True:
        try:
            await asyncio.to_thread(
                sweep_stale_sessions,
                SETTINGS.upload_dir,
                SETTINGS.stems_dir,
                SETTINGS.export_dir,
                SESSION_TTL_SECONDS,
                _task_is_active,
            )
        except Exception as exc:
            logger.warning("Session cleanup sweep failed: %s", exc)
        await asyncio.sleep(SESSION_SWEEP_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan context for startup and shutdown hooks."""
    ensure_storage_dirs()
    sweeper = asyncio.create_task(_sweep_loop())
    yield
    sweeper.cancel()
    try:
        await sweeper
    except asyncio.CancelledError:
        pass


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    application = FastAPI(
        title="AI Audio Lab API",
        version="2026.1.0",
        lifespan=lifespan,
    )

    # CORS: các origin của SPA stem-app (Bước 4 monorepo — trước đây hard-code
    # :3000 gây block khi frontend chạy :3100 / stem.reals.media).
    # Override bằng env REALS_ALLOWED_ORIGINS (comma-separated) khi deploy.
    default_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3100",
        "http://127.0.0.1:3100",
        "https://stem.reals.media",
    ]
    env_origins = os.getenv("REALS_ALLOWED_ORIGINS", "")
    allow_origins = (
        [o.strip() for o in env_origins.split(",") if o.strip()] if env_origins else default_origins
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(router, prefix="/api")

    return application


app: FastAPI = create_app()
