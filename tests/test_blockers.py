"""Failing tests for open blockers.

These tests highlight missing or incomplete functionality described in
`docs/ROADMAP.md`.  They are intentionally written to fail or be marked as
`xfail` so that subsequent development can drive them to green.  When
implementing these features, update or remove the `xfail` markers.
"""

import os
import json
import pytest
import subprocess
import time
from urllib.request import urlopen

from fastapi.testclient import TestClient

# Import the backend modules under test.  Note: these imports rely on
# Python being executed from the project root (where `backend` is a
# package).  If tests cannot import, ensure that `PYTHONPATH` includes
# the repository root or install the package in editable mode.
from backend import audio_processing
from backend.main import app, deidentify, create_token


client = TestClient(app)


def test_audio_transcription_returns_text(monkeypatch):
    """Audio transcription should return non‑empty text for non‑empty input.

    Even if the Whisper API fails, the helpers should fall back to decoding
    raw bytes or a deterministic placeholder so callers always receive
    some text.  Both simple and diarising paths are exercised here.
    """

    class DummyCreate:
        def create(self, model, file):  # noqa: ARG002
            raise RuntimeError("boom")

    class DummyClient:
        audio = type("obj", (), {"transcriptions": DummyCreate()})()

    monkeypatch.setattr(audio_processing, "OpenAI", lambda api_key=None: DummyClient())
    monkeypatch.setattr(audio_processing, "get_api_key", lambda: "key")

    # create dummy audio bytes (contents don't matter for this stub)
    dummy_audio = b"\x00\x01\x02"
    result = audio_processing.simple_transcribe(dummy_audio)
    assert result.strip(), "Transcription should not be empty"

    diarised = audio_processing.diarize_and_transcribe(dummy_audio)
    assert diarised["provider"].strip(), "Diarised transcription should not be empty"


def test_deidentify_handles_complex_phi():
    """PHI scrubber should handle multi-word names, varied dates and IDs.

    This ensures the `deidentify` helper redacts more than trivial patterns,
    including different date formats and additional identifiers like email
    addresses or Social Security numbers.
    """

    text = (
        "Jane Mary Doe visited on July 15, 2023, 07/15/23 and 2023-07-15. "
        "She emailed jane.doe@example.com, called (123) 456-7890, "
        "gave SSN 123-45-6789 and lives at 789 Oak Avenue."
    )
    cleaned = deidentify(text)
    assert "[NAME]" in cleaned, "Multi-word names should be redacted"
    # Three different date styles should be redacted
    assert cleaned.count("[DATE]") >= 3, "Dates should be redacted"
    assert "[PHONE]" in cleaned, "Phone numbers should be redacted"
    assert "[EMAIL]" in cleaned, "Emails should be redacted"
    assert "[SSN]" in cleaned, "SSNs should be redacted"
    assert "[ADDRESS]" in cleaned, "Addresses should be redacted"


def test_metrics_requires_authentication():
    """Access to metrics should be restricted to authenticated users.

    Unauthenticated requests to `/metrics` should return HTTP 401 or 403.
    """
    response = client.get("/metrics")
    assert response.status_code in {401, 403}


def test_metrics_contains_timeseries_data():
    """The metrics endpoint should return time‑series data for charts.

    After implementing analytics visualisation, `/metrics` should include
    a `timeseries` key containing daily/weekly counts.
    """
    token = create_token("tester", "admin")
    response = client.get("/metrics", headers={"Authorization": f"Bearer {token}"})
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


def test_electron_auto_update_and_backend_spawn_present():
    """Electron main process should wire auto updates and spawn the FastAPI backend."""
    main_path = os.path.join(os.path.dirname(__file__), "..", "electron", "main.js")
    with open(main_path, encoding="utf-8") as f:
        content = f.read()

    assert "autoUpdater" in content, "auto-updater not referenced"
    assert "checkForUpdatesAndNotify" in content, "auto-update not triggered"
    assert "spawn(" in content and "uvicorn" in content, "backend spawn missing"


def test_update_server_serves_files(tmp_path):
    """The local update server script should serve packaged files over HTTP."""
    server_script = os.path.join(os.path.dirname(__file__), "..", "scripts", "update-server.js")
    assert os.path.exists(server_script), "update-server.js missing"

    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    file_path = dist_dir / "hello.txt"
    file_path.write_text("hi")

    port = "18080"
    env = {**os.environ, "UPDATE_SERVER_PORT": port, "UPDATE_DIR": str(dist_dir)}
    proc = subprocess.Popen(["node", server_script], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for _ in range(50):
            try:
                with urlopen(f"http://127.0.0.1:{port}/hello.txt") as resp:
                    body = resp.read().decode()
                    break
            except Exception:
                time.sleep(0.1)
        else:
            pytest.fail("update server did not start")

        assert body == "hi"
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
