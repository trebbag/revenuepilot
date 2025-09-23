import sqlite3
import time
from typing import Dict

import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.ai_gating import AIGatingService
from backend.db.models import AIJsonSnapshot, AINoteState
from backend.migrations import create_all_tables, session_scope


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


@pytest.fixture()
def gating_service_state():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    create_all_tables(conn)
    cursor = conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("svc-doc", "pw", "user"),
    )
    clinician_id = cursor.lastrowid
    conn.commit()
    service = AIGatingService(
        conn,
        model_high="high-test",
        model_mini="mini-test",
        hash_salt="unit-test",
        min_secs=0.0,
        cooldown_full=0.0,
        cooldown_mini=0.0,
    )
    try:
        yield conn, service, clinician_id
    finally:
        conn.close()


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


def test_reconcile_json_merges_small_divergence(gating_service_state):
    conn, service, clinician_id = gating_service_state
    note_id = "note-json-1"
    baseline = {
        "selectedCodes": [{"code": "A1"}],
        "reimbursementSummary": {"total": 120.0, "codes": ["A1"]},
        "validation": {"issues": []},
        "sessionProgress": {"step": 2},
        "meta": {"version": 1},
    }

    merged_initial, meta_initial = service.reconcile_structured_json(note_id, clinician_id, baseline)
    assert merged_initial == baseline
    assert meta_initial["mergedFromAccepted"] is False
    assert meta_initial["currentHash"]
    assert meta_initial["divergence"] is None

    new_output = {
        key: value
        for key, value in baseline.items()
        if key != "reimbursementSummary"
    }

    merged, meta = service.reconcile_structured_json(note_id, clinician_id, new_output)
    assert merged["reimbursementSummary"] == baseline["reimbursementSummary"]
    assert meta["mergedFromAccepted"] is True
    assert meta["previousHash"] == meta_initial["currentHash"]
    assert meta["currentHash"]
    assert meta["divergence"] is not None
    assert meta["divergence"] <= service.JSON_STICKY_DIVERGENCE_THRESHOLD

    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        assert state.last_accepted_json_hash == meta["currentHash"]
        snapshot = session.get(AIJsonSnapshot, state.last_accepted_json_hash)
        assert snapshot is not None
        assert snapshot.payload["reimbursementSummary"] == baseline["reimbursementSummary"]


def test_reconcile_json_skips_merge_for_large_divergence(gating_service_state):
    conn, service, clinician_id = gating_service_state
    note_id = "note-json-2"
    baseline = {
        "selectedCodes": [{"code": "B2"}],
        "reimbursementSummary": {"total": 210.0, "codes": ["B2"]},
        "validation": {"issues": ["missing"]},
        "sessionProgress": {"step": 3},
        "meta": {"version": 5},
    }

    service.reconcile_structured_json(note_id, clinician_id, baseline)

    divergent_output = {"completely": {"different": True}}
    merged, meta = service.reconcile_structured_json(note_id, clinician_id, divergent_output)

    assert merged == {"completely": {"different": True}}
    assert meta["mergedFromAccepted"] is False
    assert meta["previousHash"] is not None
    assert meta["divergence"] is not None
    assert meta["divergence"] > service.JSON_STICKY_DIVERGENCE_THRESHOLD

    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        assert state.last_accepted_json_hash == meta["currentHash"]
        snapshot = session.get(AIJsonSnapshot, state.last_accepted_json_hash)
        assert snapshot is not None
        assert snapshot.payload == merged
