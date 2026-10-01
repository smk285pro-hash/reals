from __future__ import annotations

import io
import os
import shutil
import sys
from pathlib import Path
from typing import Generator

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Set local DAW mode by default during tests
os.environ["REALS_AUTH_DISABLED"] = "true"

from app.core.config import SETTINGS
from app.core.task_manager import TASK_MANAGER
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def configure_test_environment():
    """Ensure environment is configured for test runs."""
    os.environ["REALS_AUTH_DISABLED"] = "true"
    yield


@pytest.fixture
def synthetic_audio_factory():
    """Factory fixture to generate valid synthetic audio WAV bytes in memory."""
    def _create_wav(
        duration: float = 2.5,
        sr: int = 44100,
        bpm: float = 120.0,
        include_chords: bool = True,
        channels: int = 2,
    ) -> bytes:
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)

        if include_chords:
            # A Major triad: A4 (440Hz), C#5 (554.37Hz), E5 (659.25Hz)
            harmony = (
                0.25 * np.sin(2 * np.pi * 440.0 * t)
                + 0.20 * np.sin(2 * np.pi * 554.37 * t)
                + 0.20 * np.sin(2 * np.pi * 659.25 * t)
            )
            # Bass: A2 (110Hz)
            bass = 0.35 * np.sin(2 * np.pi * 110.0 * t)
        else:
            harmony = 0.4 * np.sin(2 * np.pi * 440.0 * t)
            bass = np.zeros_like(t)

        # Beat clicks at specified BPM
        clicks = np.zeros_like(t)
        beat_interval_sec = 60.0 / bpm
        click_interval_samples = int(beat_interval_sec * sr)
        click_len = int(0.015 * sr)

        for start_idx in range(0, len(t), click_interval_samples):
            end_idx = min(start_idx + click_len, len(t))
            n = end_idx - start_idx
            if n > 0:
                clicks[start_idx:end_idx] = 0.5 * np.sin(
                    2 * np.pi * 1200.0 * np.linspace(0, 0.015, n)
                )

        signal = harmony + bass + clicks
        signal = np.clip(signal, -0.95, 0.95).astype(np.float32)

        if channels == 2:
            stereo = np.column_stack([signal, signal])
        else:
            stereo = signal

        buf = io.BytesIO()
        sf.write(buf, stereo, sr, format="WAV", subtype="PCM_16")
        return buf.getvalue()

    return _create_wav


@pytest.fixture
def synthetic_wav_bytes(synthetic_audio_factory) -> bytes:
    """Standard 2.5-second test song WAV bytes."""
    return synthetic_audio_factory(duration=2.5, sr=44100, bpm=120.0, channels=2)


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """FastAPI TestClient configured with local DAW mode (REALS_AUTH_DISABLED=true)."""
    import app.core.reals_auth as auth_mod
    original_auth_disabled = auth_mod.AUTH_DISABLED
    auth_mod.AUTH_DISABLED = True
    os.environ["REALS_AUTH_DISABLED"] = "true"

    with TestClient(app) as test_client:
        yield test_client

    auth_mod.AUTH_DISABLED = original_auth_disabled


@pytest.fixture
def auth_enforced_client() -> Generator[TestClient, None, None]:
    """FastAPI TestClient configured with strict cloud auth mode (REALS_AUTH_DISABLED=false)."""
    import app.core.reals_auth as auth_mod
    original_auth_disabled = auth_mod.AUTH_DISABLED
    auth_mod.AUTH_DISABLED = False
    os.environ["REALS_AUTH_DISABLED"] = "false"
    auth_mod.clear_auth_cache()

    with TestClient(app) as test_client:
        yield test_client

    auth_mod.AUTH_DISABLED = original_auth_disabled
    auth_mod.clear_auth_cache()
