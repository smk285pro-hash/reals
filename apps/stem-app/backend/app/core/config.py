from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

from app.core.schemas import STEM_COLORS

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent
STORAGE_ROOT = Path(os.getenv("STORAGE_DIR", str(BASE_DIR.parent / "storage"))).resolve()

SAMPLE_RATE: int = 44100
LUFS_TARGET: float = -14.0
MAX_UPLOAD_MB: int = 100
STEM_MODES: tuple[str, ...] = ("2", "4", "6", "8")
CHORD_MIN_DURATION: float = 0.25
VITERBI_SELF: float = 0.62
VITERBI_GAMMA: float = 0.55
SSE_POLL_SECONDS: float = 0.4

# Orphaned-session cleanup (users abandoning the app mid-upload/analysis)
SESSION_TTL_SECONDS: float = float(os.getenv("SESSION_TTL_HOURS", "24")) * 3600.0
SESSION_SWEEP_INTERVAL_SECONDS: float = float(os.getenv("SESSION_SWEEP_INTERVAL_MINUTES", "60")) * 60.0


@dataclass(frozen=True)
class Settings:
    app_port: int = int(os.getenv("APP_PORT", "3031"))
    storage_dir: Path = STORAGE_ROOT
    upload_dir: Path = STORAGE_ROOT / "uploads"
    stems_dir: Path = STORAGE_ROOT / "stems"
    export_dir: Path = STORAGE_ROOT / "exports"


SETTINGS = Settings()


def ensure_storage_dirs() -> None:
    SETTINGS.storage_dir.mkdir(parents=True, exist_ok=True)
    SETTINGS.upload_dir.mkdir(parents=True, exist_ok=True)
    SETTINGS.stems_dir.mkdir(parents=True, exist_ok=True)
    SETTINGS.export_dir.mkdir(parents=True, exist_ok=True)
