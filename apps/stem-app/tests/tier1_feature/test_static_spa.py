"""
Tier 1 Feature Tests: Static SPA Serving & HTML DOM Structure Verification.
Validates HTTP 200 delivery on GET /, static asset routing, and presence of studio application layout.
"""
import pytest
from fastapi.testclient import TestClient


@pytest.mark.tier1
def test_root_serves_html_200(client: TestClient):
    """Verifies that GET / serves the Single-Page Application with HTTP 200 and text/html."""
    response = client.get("/")
    assert response.status_code == 200
    content_type = response.headers.get("content-type", "")
    assert "text/html" in content_type.lower()
    assert len(response.text) > 50


@pytest.mark.tier1
def test_html_contains_header_and_title(client: TestClient):
    """Verifies that the HTML contains the AI Audio Lab 2026 title and branding."""
    response = client.get("/")
    assert response.status_code == 200
    html = response.text
    
    assert "AI Audio Lab 2026" in html or "AI AUDIO LAB 2026" in html
    assert "<title>" in html.lower()


@pytest.mark.tier1
def test_html_doctype_and_structure(client: TestClient):
    """Verifies that the root page delivers valid HTML5 document structure."""
    response = client.get("/")
    assert response.status_code == 200
    html = response.text.lower()
    
    assert "<!doctype html>" in html
    assert "<head>" in html and "</head>" in html
    assert "<body" in html and "</body>" in html


@pytest.mark.tier1
def test_html_contains_waveform_or_studio_root(client: TestClient):
    """Verifies that the HTML contains studio dashboard elements or waveform visualizer container."""
    response = client.get("/")
    assert response.status_code == 200
    html = response.text.lower()
    
    # Progressively verifies studio UI container (supports M1 baseline and M2 studio layout)
    assert any(k in html for k in ["waveform", "audio lab", "dsp baseline", "studio", "canvas"])


@pytest.mark.tier1
def test_html_contains_telemetry_or_status_indicators(client: TestClient):
    """Verifies that the HTML contains telemetry badges or engine status indicators."""
    response = client.get("/")
    assert response.status_code == 200
    html = response.text.lower()
    
    assert any(k in html for k in ["engine", "online", "dsp", "bpm", "key", "tempo", "status"])


@pytest.mark.tier1
def test_html_contains_mixer_or_audio_engine_info(client: TestClient):
    """Verifies that the HTML contains mixer controls or audio engine layout."""
    response = client.get("/")
    assert response.status_code == 200
    html = response.text.lower()
    
    assert any(k in html for k in ["mixer", "stem", "vocals", "extraction", "audio", "music"])
