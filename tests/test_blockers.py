"""Failing tests for open blockers.

These tests highlight missing or incomplete functionality described in
`docs/ROADMAP.md`.  They are intentionally written to fail or be marked as
`xfail` so that subsequent development can drive them to green.  When
implementing these features, update or remove the `xfail` markers.
"""

import os
import json
import pytest

from fastapi.testclient import TestClient

# Import the backend modules under test.  Note: these imports rely on
# Python being executed from the project root (where `backend` is a
# package).  If tests cannot import, ensure that `PYTHONPATH` includes
# the repository root or install the package in editable mode.
from backend import audio_processing
from backend.main import app, deidentify


client = TestClient(app)


def test_audio_transcription_returns_text():
    """Audio transcription should return non‑empty text for non‑empty input.

    The current implementation in `audio_processing.simple_transcribe` is a
    stub that always returns an empty string.  Once a real speech‑to‑text
    engine is integrated, this test should pass.
    """
    # create dummy audio bytes (contents don't matter for this stub)
    dummy_audio = b"\x00\x01\x02"
    result = audio_processing.simple_transcribe(dummy_audio)
    # Expect the transcription to contain some text once implemented
    assert result.strip(), "Transcription should not be empty"


def test_deidentify_removes_names_and_dates():
    """Advanced PHI scrubber should remove names and dates beyond simple patterns.

    The current `deidentify` implementation removes phone numbers, standard
    dates and naïvely capitalised names.  It does not catch more complex
    patterns or multiple words.  This test documents the desired behaviour
    when a more sophisticated scrubber (e.g. ML‑based) is integrated.
    """
    text = "John A. Doe visited on 2023-07-15 and called (123) 456-7890."
    cleaned = deidentify(text)
    # Expect names and dates to be replaced with tokens
    assert "[NAME]" in cleaned, "Names should be redacted"
    assert "[DATE]" in cleaned, "Dates should be redacted"
    assert "[PHONE]" in cleaned, "Phone numbers should be redacted"


@pytest.mark.xfail(reason="Role‑based auth not implemented")
def test_metrics_requires_authentication():
    """Access to metrics should be restricted to authenticated users.

    Once a login system is added, unauthenticated requests to `/metrics`
    should return HTTP 401 or 403.  Currently the endpoint is open to
    anyone, so this test is marked xfail.
    """
    response = client.get("/metrics")
    assert response.status_code in {401, 403}


@pytest.mark.xfail(reason="Dashboard charts not yet implemented")
def test_metrics_contains_timeseries_data():
    """The metrics endpoint should return time‑series data for charts.

    After implementing analytics visualisation, `/metrics` should include
    a `timeseries` key containing daily/weekly counts.  Until then, the
    response only contains aggregate counts.
    """
    response = client.get("/metrics")
    data = response.json()
    assert "timeseries" in data and data["timeseries"], "timeseries data missing"


def test_electron_packaging_configuration_present():
    """Electron builder configuration should be present in package.json.

    The application now ships with Electron build tooling.  We verify that
    the package manifest defines an ``electron:build`` script and includes
    a basic electron-builder configuration block.
    """
    with open(os.path.join(os.path.dirname(__file__), "..", "package.json"), encoding="utf-8") as f:
        pkg = json.load(f)

    scripts = pkg.get("scripts", {})
    assert "electron:build" in scripts, "electron build script missing"

    build = pkg.get("build") or {}
    assert build.get("appId"), "electron-builder config missing"
