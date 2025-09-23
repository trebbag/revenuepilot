import sqlite3
import time
from typing import Dict, List, Sequence, Tuple

import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.ai_gating import (
    AIGatingService,
    DiffSpan,
    EMBED_SENTINEL_NEW,
    EMBED_SENTINEL_OLD,
)
from backend.migrations import create_all_tables


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
