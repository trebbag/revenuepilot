import sqlite3
import time
from typing import Dict

import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.migrations import create_all_tables


def _auth_header(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def gating_client(monkeypatch):
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    create_all_tables(db)

    pwd = main.hash_password("pw")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("doc", pwd, "user"),
    )
    db.commit()

    monkeypatch.setattr(main, "db_conn", db)
    monkeypatch.setattr(main, "_ai_gate_service", None)
    monkeypatch.setattr(main, "_ai_gate_conn_id", None)
    monkeypatch.setenv("AI_GATING_ENABLED", "1")
    monkeypatch.setattr(main, "AI_GATE_COOLDOWN_FULL", 0.1)
    monkeypatch.setattr(main, "AI_GATE_COOLDOWN_MINI", 0.1)
    monkeypatch.setattr(main, "AI_GATE_MIN_SECS", 0.0)

    client = TestClient(main.app)
    try:
        yield client
    finally:
        client.close()
        db.close()


def test_ai_gate_cold_start_and_allow(gating_client):
    client = gating_client
    token = main.create_token("doc", "user")

    resp = client.post(
        "/api/notes/ai/gate",
        json={
            "noteId": "note-1",
            "noteContent": "Short note.",
            "requestType": "auto",
        },
        headers=_auth_header(token),
    )
    assert resp.status_code == 409
    data = resp.json()
    assert data["blocked"] is True
    assert data["reason"] == "BELOW_THRESHOLD"
    assert resp.headers["X-AI-Gate"] == "blocked:BELOW_THRESHOLD"

    long_note = "Sentence." * 80 + "\nComplete."
    resp_allow = client.post(
        "/api/notes/ai/gate",
        json={
            "noteId": "note-1",
            "noteContent": long_note,
            "requestType": "auto",
        },
        headers=_auth_header(token),
    )
    assert resp_allow.status_code == 202
    payload = resp_allow.json()
    assert payload["allowed"] is True
    assert payload["model"] == main.AI_MODEL_HIGH
    assert resp_allow.headers["X-AI-Gate"] == f"allowed:{main.AI_MODEL_HIGH}"


def test_ai_gate_enforces_cooldown(gating_client):
    client = gating_client
    token = main.create_token("doc", "user")

    base_note = ("Sentence. " * 60).strip() + "."
    resp_initial = client.post(
        "/api/notes/ai/gate",
        json={
            "noteId": "note-2",
            "noteContent": base_note,
            "requestType": "auto",
        },
        headers=_auth_header(token),
    )
    assert resp_initial.status_code == 202

    expanded_note = base_note + " " + ("Additional sentence." * 8)
    resp_cooldown = client.post(
        "/api/notes/ai/gate",
        json={
            "noteId": "note-2",
            "noteContent": expanded_note,
            "requestType": "auto",
        },
        headers=_auth_header(token),
    )
    assert resp_cooldown.status_code == 409
    assert resp_cooldown.json()["reason"] == "COOLDOWN"

    time.sleep(0.2)
    resp_after = client.post(
        "/api/notes/ai/gate",
        json={
            "noteId": "note-2",
            "noteContent": expanded_note,
            "requestType": "auto",
        },
        headers=_auth_header(token),
    )
    assert resp_after.status_code == 202
