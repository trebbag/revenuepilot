from __future__ import annotations

from pathlib import Path
import sys

import pytest

import backend.db.models as db_models

if "backend.scheduling" in sys.modules:
    setattr(sys.modules["backend.scheduling"], "configure_database", lambda *args, **kwargs: None)

from backend import charts, main


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def authed_client(api_client, db_session):
    password_hash = main.hash_password("pw")
    db_session.execute(
        db_models.users.insert().values(
            username="user",
            password_hash=password_hash,
            role="user",
        )
    )
    db_session.commit()

    resp = api_client.post("/login", json={"username": "user", "password": "pw"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return api_client, token


def test_chart_upload_confines_to_directory(tmp_path: Path, authed_client, monkeypatch):
    client, token = authed_client
    monkeypatch.setattr(main, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(charts, "_UPLOAD_DIR", tmp_path)

    resp = client.post(
        "/api/charts/upload",
        headers=_auth_header(token),
        files={"file": ("../../../../etc/passwd", b"payload")},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["filename"] != "../../../../etc/passwd"

    stored = tmp_path / payload["filename"]
    assert stored.exists()
    assert stored.read_bytes() == b"payload"


def test_chart_upload_rejects_escape_attempt(tmp_path: Path, authed_client, monkeypatch):
    client, token = authed_client
    monkeypatch.setattr(main, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(charts, "_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(main, "sanitize_chart_filename", lambda _: "../escape.txt")

    resp = client.post(
        "/api/charts/upload",
        headers=_auth_header(token),
        files={"file": ("chart.txt", b"payload")},
    )
    assert resp.status_code == 400


def test_process_chart_rejects_escape_attempt(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(charts, "_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(main, "sanitize_chart_filename", lambda _: "../escape.txt")

    with pytest.raises(ValueError):
        charts.process_chart("chart.txt", b"payload")


def test_process_chart_persists_with_sanitized_name(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(charts, "_UPLOAD_DIR", tmp_path)
    sanitized_name = main.sanitize_chart_filename("../report.txt")

    result = charts.process_chart("../report.txt", b"payload")
    assert result is not None
    stored = tmp_path / sanitized_name
    assert stored.exists()
    assert stored.read_bytes() == b"payload"
