"""
Pytest Configuration and Shared Test Fixtures for AI Audio Lab 2026.
Provides TestClient fixtures, temporary file storage fixtures, and deterministic synthetic audio fixtures.
"""
import os
import sys
import shutil
import tempfile
from pathlib import Path
from typing import Generator, Any
import pytest
from fastapi.testclient import TestClient

# Ensure workspace root is in sys.path for test discovery
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

# SciPy 1.13+ Hann Window Compatibility Patch for Librosa
import scipy.signal
import scipy.signal.windows
if not hasattr(scipy.signal, 'hann') and hasattr(scipy.signal.windows, 'hann'):
    scipy.signal.hann = scipy.signal.windows.hann

from tests.generators.synthetic_audio import (
    generate_synthetic_wav,
    generate_pure_silence,
    generate_white_noise,
    generate_noisy_progression,
    generate_meter_audio,
)


@pytest.fixture(scope="session")
def app_instance():
    """
    Returns the FastAPI application instance.
    Attempts importing from app.main or main.
    """
    try:
        from app.main import app
        return app
    except ImportError:
        try:
            from main import app
            return app
        except ImportError as e:
            pytest.skip(f"FastAPI application module not available: {e}")


@pytest.fixture(scope="function")
def client(app_instance) -> Generator[TestClient, None, None]:
    """Provides a FastAPI TestClient instance for API endpoint testing."""
    with TestClient(app_instance) as c:
        yield c


@pytest.fixture(scope="session")
def temp_test_dir() -> Generator[Path, None, None]:
    """Creates a temporary test directory that is cleaned up after the test session."""
    tmp_path = Path(tempfile.mkdtemp(prefix="audio_lab_test_"))
    yield tmp_path
    shutil.rmtree(tmp_path, ignore_errors=True)


@pytest.fixture(scope="session")
def synth_c_major_wav_bytes() -> bytes:
    """Generates standard 120 BPM C-G-Am-F synthetic WAV byte stream (8 seconds)."""
    return generate_synthetic_wav(bpm=120.0, chords=["C", "G", "Am", "F"], bar_duration=2.0)


@pytest.fixture(scope="session")
def synth_silence_wav_bytes() -> bytes:
    """Generates 2.0 seconds of pure digital silence WAV byte stream."""
    return generate_pure_silence(duration=2.0)


@pytest.fixture(scope="session")
def synth_noisy_wav_bytes() -> bytes:
    """Generates 120 BPM synthetic WAV contaminated with Gaussian noise."""
    return generate_noisy_progression(bpm=120.0, chords=["C", "G", "Am", "F"], noise_level=0.05)


@pytest.fixture(scope="function")
def synth_c_major_file(temp_test_dir: Path, synth_c_major_wav_bytes: bytes) -> Generator[Path, None, None]:
    """Writes a standard C-G-Am-F 120 BPM synthetic WAV file to disk and yields the path."""
    file_path = temp_test_dir / "synth_c_major_120bpm.wav"
    file_path.write_bytes(synth_c_major_wav_bytes)
    yield file_path
    if file_path.exists():
        file_path.unlink()


@pytest.fixture(scope="function")
def synth_silence_file(temp_test_dir: Path, synth_silence_wav_bytes: bytes) -> Generator[Path, None, None]:
    """Writes a silence WAV file to disk and yields the path."""
    file_path = temp_test_dir / "synth_silence.wav"
    file_path.write_bytes(synth_silence_wav_bytes)
    yield file_path
    if file_path.exists():
        file_path.unlink()


@pytest.fixture(scope="function")
def synth_short_file(temp_test_dir: Path) -> Generator[Path, None, None]:
    """Writes a 0.5-second subsecond audio WAV file to disk and yields the path."""
    file_path = temp_test_dir / "synth_short_0_5s.wav"
    data = generate_synthetic_wav(bpm=120.0, chords=["C"], bar_duration=0.5)
    file_path.write_bytes(data)
    yield file_path
    if file_path.exists():
        file_path.unlink()
