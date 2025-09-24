import sqlite3
import time
from typing import Dict, List, Sequence, Tuple

import pytest
from fastapi.testclient import TestClient
from prometheus_client import REGISTRY

from backend import main
from backend.db.models import AIJsonSnapshot, AINoteState
from backend.migrations import create_all_tables, session_scope
from backend.ai_gating import (
    AIGatingService,
    DiffSpan,
    EMBED_SENTINEL_NEW,
    EMBED_SENTINEL_OLD,
)
from backend.migrations import create_all_tables
from backend.encryption import decrypt_ai_payload



def _auth_header(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def mock_embedding_client(monkeypatch):
    class RecordingEmbeddingClient:
        def __init__(self) -> None:
            self.vectors: Dict[str, List[float]] = {}
            self.calls: List[Tuple[str, ...]] = []

        def reset(self) -> None:
            self.vectors.clear()
            self.calls.clear()

        def set_vector(self, text: str, vector: Sequence[float]) -> None:
            self.vectors[text] = [float(value) for value in vector]

        def embed(self, text: str) -> List[float]:
            return self.embed_many([text])[0]

        def embed_many(self, texts: Sequence[str]) -> List[List[float]]:
            self.calls.append(tuple(texts))
            vectors: List[List[float]] = []
            for text in texts:
                if text not in self.vectors:
                    raise RuntimeError(f"missing vector for {text}")
                vectors.append(list(self.vectors[text]))
            return vectors

    client = RecordingEmbeddingClient()
    monkeypatch.setattr(
        "backend.openai_client.get_embedding_client",
        lambda model="text-embedding-3-small": client,
    )
    return client


@pytest.fixture()
def gating_client(monkeypatch, mock_embedding_client):
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


def _get_metric(name: str, labels: Dict[str, str]) -> float:
    value = REGISTRY.get_sample_value(name, labels)
    return 0.0 if value is None else float(value)


def test_ai_gate_metrics_record_permitted_runs(gating_client):
    client = gating_client
    token = main.create_token("doc", "user")
    clinician_id = main._get_user_db_id("doc")
    assert clinician_id is not None

    note_id = "note-metrics"
    base_note = ("Sentence. " * 120).strip() + "."

    auto_labels = {"route": "auto", "clinician_id": str(clinician_id), "note_id": note_id}
    manual_labels = {
        "route": "manual_full",
        "clinician_id": str(clinician_id),
        "note_id": note_id,
    }
    final_labels = {
        "route": "finalization",
        "clinician_id": str(clinician_id),
        "note_id": note_id,
    }

    assert REGISTRY.get_sample_value("revenuepilot_ai_gate_auto4o_count", auto_labels) is None

    resp_auto = client.post(
        "/api/notes/ai/gate",
        json={
            "noteId": note_id,
            "noteContent": base_note,
            "requestType": "auto",
        },
        headers=_auth_header(token),
    )
    assert resp_auto.status_code == 202
    assert _get_metric("revenuepilot_ai_gate_auto4o_count", auto_labels) == pytest.approx(1.0)

    time.sleep(0.12)
    manual_note = base_note + " " + ("Additional sentence." * 8)
    resp_manual = client.post(
        "/api/notes/ai/gate",
        json={
            "noteId": note_id,
            "noteContent": manual_note,
            "requestType": "manual_full",
        },
        headers=_auth_header(token),
    )
    assert resp_manual.status_code == 202
    assert _get_metric("revenuepilot_ai_gate_manual4o_count", manual_labels) == pytest.approx(1.0)

    time.sleep(0.12)
    resp_final = client.post(
        "/api/notes/ai/gate",
        json={
            "noteId": note_id,
            "noteContent": manual_note,
            "requestType": "finalization",
        },
        headers=_auth_header(token),
    )
    assert resp_final.status_code == 202
    assert _get_metric("revenuepilot_ai_gate_finalization_count", final_labels) == pytest.approx(1.0)

    mean_value = _get_metric(
        "revenuepilot_ai_gate_mean_time_between_allowed_ms", final_labels
    )
    edits_value = _get_metric(
        "revenuepilot_ai_gate_edits_per_allowed_run", final_labels
    )
    assert mean_value > 0.0
    assert edits_value > 0.0

    row = main.db_conn.execute(
        """
        SELECT allowed_count, total_delta_chars, mean_time_between_allowed_ms
        FROM ai_note_state
        WHERE note_id = ?
        """,
        (note_id,),
    ).fetchone()
    assert row is not None
    expected_edits = row["total_delta_chars"] / max(row["allowed_count"], 1)
    assert edits_value == pytest.approx(expected_edits)
    assert mean_value == pytest.approx(row["mean_time_between_allowed_ms"])



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
        payload = decrypt_ai_payload(snapshot.payload)
        assert payload["reimbursementSummary"] == baseline["reimbursementSummary"]


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
        payload = decrypt_ai_payload(snapshot.payload)
        assert payload == merged

def _make_service(db, embed_client):
    create_all_tables(db)
    return AIGatingService(
        db,
        model_high=main.AI_MODEL_HIGH,
        model_mini=main.AI_MODEL_MINI,
        hash_salt="test",
        min_secs=0.0,
        cooldown_full=0.0,
        cooldown_mini=0.0,
        embed_model=main.AI_EMBED_MODEL,
        embedding_client=embed_client,
    )


def test_is_meaningful_uses_embedding_sentinels(mock_embedding_client):
    mock_embedding_client.reset()
    db = sqlite3.connect(":memory:")
    try:
        service = _make_service(db, mock_embedding_client)
        span = DiffSpan(
            old_text="A" * 120,
            new_text=("A" * 118) + "BC",
            old_range=(0, 120),
            new_range=(0, 120),
        )

        old_payload = f"{EMBED_SENTINEL_OLD}\n{span.old_text}"
        new_payload = f"{EMBED_SENTINEL_NEW}\n{span.new_text}"
        mock_embedding_client.set_vector(old_payload, [1.0, 0.0, 0.0])
        mock_embedding_client.set_vector(new_payload, [1.0, 0.0, 0.0])

        assert service._is_meaningful([span], {}) is False
        assert mock_embedding_client.calls[-1] == (old_payload, new_payload)
    finally:
        db.close()


def test_is_meaningful_treats_embedding_failure_as_meaningful(mock_embedding_client):
    mock_embedding_client.reset()
    db = sqlite3.connect(":memory:")
    try:
        service = _make_service(db, mock_embedding_client)
        span = DiffSpan(
            old_text="B" * 120,
            new_text=("B" * 118) + "ZZ",
            old_range=(0, 120),
            new_range=(0, 120),
        )

        old_payload = f"{EMBED_SENTINEL_OLD}\n{span.old_text}"
        new_payload = f"{EMBED_SENTINEL_NEW}\n{span.new_text}"

        with pytest.raises(RuntimeError):
            mock_embedding_client.embed_many([old_payload, new_payload])

        assert service._is_meaningful([span], {}) is True
        assert mock_embedding_client.calls[-1] == (old_payload, new_payload)
    finally:
        db.close()

