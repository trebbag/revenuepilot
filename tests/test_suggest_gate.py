import hashlib
import sqlite3
from typing import Dict, List, Sequence, Tuple

import pytest
from fastapi import status

from backend import main
from backend.ai_gating import EMBED_SENTINEL_NEW, EMBED_SENTINEL_OLD, normalize_note_text
from backend.db.models import AINoteState
from backend.migrations import create_all_tables, session_scope


class RecordingEmbedder:
    def __init__(self) -> None:
        self.vectors: Dict[str, List[float]] = {}
        self.calls: List[Tuple[str, ...]] = []

    def set_vector(self, text: str, vector: Sequence[float]) -> None:
        self.vectors[text] = [float(x) for x in vector]

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


@pytest.fixture()
def suggest_gate_context(monkeypatch):
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    create_all_tables(conn)
    cursor = conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("doc", "pw", "user"),
    )
    clinician_id = cursor.lastrowid
    conn.commit()

    embedder = RecordingEmbedder()
    monkeypatch.setattr(main, "db_conn", conn)
    monkeypatch.setattr(main, "_suggest_embedder", None)
    monkeypatch.setattr(main, "get_embedding_client", lambda model="text-embedding-3-small": embedder)

    try:
        yield conn, clinician_id, embedder
    finally:
        conn.close()


def _set_span_vectors(embedder: RecordingEmbedder, old_text: str, new_text: str, *, old_vec=None, new_vec=None) -> None:
    if old_vec is None:
        old_vec = (1.0, 0.0, 0.0)
    if new_vec is None:
        new_vec = (0.0, 1.0, 0.0)
    embedder.set_vector(f"{EMBED_SENTINEL_OLD}\n{old_text}", old_vec)
    embedder.set_vector(f"{EMBED_SENTINEL_NEW}\n{new_text}", new_vec)


def test_suggest_gate_requires_structure(suggest_gate_context):
    _, clinician_id, embedder = suggest_gate_context
    decision = main._evaluate_suggest_gate(
        note_id="note-structure",
        clinician_id=clinician_id,
        normalized="words only",
        intent="auto",
        transcript_cursor=None,
        accepted_json=None,
        embedder=embedder,
    )
    assert decision.allowed is False
    assert decision.reason == "STRUCTURE"
    assert decision.status_code == status.HTTP_409_CONFLICT


def test_suggest_gate_cold_start_blocks(suggest_gate_context):
    _, clinician_id, embedder = suggest_gate_context
    short_note = normalize_note_text("Sentence. " * 20)
    decision = main._evaluate_suggest_gate(
        note_id="note-cold",
        clinician_id=clinician_id,
        normalized=short_note,
        intent="auto",
        transcript_cursor=None,
        accepted_json=None,
        embedder=embedder,
    )
    assert decision.allowed is False
    assert decision.reason == "COLD_START"


def test_suggest_gate_allows_then_blocks_duplicate(suggest_gate_context):
    conn, clinician_id, embedder = suggest_gate_context
    note_id = "note-dup"
    base_note = normalize_note_text("Sentence. " * 120 + "\nComplete.")
    _set_span_vectors(embedder, "", base_note)
    allowed = main._evaluate_suggest_gate(
        note_id=note_id,
        clinician_id=clinician_id,
        normalized=base_note,
        intent="auto",
        transcript_cursor="cursor-1",
        accepted_json={"a": 1},
        embedder=embedder,
    )
    assert allowed.allowed is True
    assert allowed.model == "gpt-4o"
    with session_scope(conn) as session:
        state = session.get(AINoteState, note_id)
        assert state is not None
        assert state.last_transcript_cursor == "cursor-1"
        assert state.last_call_note_hash == hashlib.sha256(base_note.encode("utf-8")).hexdigest()
        assert state.last_accepted_json_hash is not None

    duplicate = main._evaluate_suggest_gate(
        note_id=note_id,
        clinician_id=clinician_id,
        normalized=base_note,
        intent="auto",
        transcript_cursor="cursor-2",
        accepted_json=None,
        embedder=embedder,
    )
    assert duplicate.allowed is False
    assert duplicate.reason == "DUPLICATE_STATE"


def test_suggest_gate_manual_threshold_blocks(suggest_gate_context):
    _, clinician_id, embedder = suggest_gate_context
    note_id = "note-manual-thresh"
    base_note = normalize_note_text("Sentence. " * 130)
    _set_span_vectors(embedder, "", base_note)
    main._evaluate_suggest_gate(
        note_id=note_id,
        clinician_id=clinician_id,
        normalized=base_note,
        intent="auto",
        transcript_cursor=None,
        accepted_json=None,
        embedder=embedder,
    )

    addition = "\nAdded line."
    _set_span_vectors(embedder, "", addition)
    blocked = main._evaluate_suggest_gate(
        note_id=note_id,
        clinician_id=clinician_id,
        normalized=base_note + addition,
        intent="manual",
        transcript_cursor=None,
        accepted_json=None,
        embedder=embedder,
    )
    assert blocked.allowed is False
    assert blocked.reason == "MANUAL_THRESHOLD"
    assert blocked.detail["manualThreshold"] >= 60


def test_suggest_gate_auto_threshold_blocks(suggest_gate_context):
    _, clinician_id, embedder = suggest_gate_context
    note_id = "note-auto-thresh"
    base_note = normalize_note_text("Sentence. " * 150)
    _set_span_vectors(embedder, "", base_note)
    main._evaluate_suggest_gate(
        note_id=note_id,
        clinician_id=clinician_id,
        normalized=base_note,
        intent="auto",
        transcript_cursor=None,
        accepted_json=None,
        embedder=embedder,
    )

    addition = "\nTiny tweak."
    _set_span_vectors(embedder, "", addition)
    blocked = main._evaluate_suggest_gate(
        note_id=note_id,
        clinician_id=clinician_id,
        normalized=base_note + addition,
        intent="auto",
        transcript_cursor=None,
        accepted_json=None,
        embedder=embedder,
    )
    assert blocked.allowed is False
    assert blocked.reason == "AUTO_THRESHOLD"
    assert blocked.detail["autoThreshold"] >= 100


def test_suggest_gate_not_meaningful_blocks(suggest_gate_context):
    _, clinician_id, embedder = suggest_gate_context
    note_id = "note-not-meaningful"
    base_note = normalize_note_text("Sentence. " * 140)
    _set_span_vectors(embedder, "", base_note)
    main._evaluate_suggest_gate(
        note_id=note_id,
        clinician_id=clinician_id,
        normalized=base_note,
        intent="auto",
        transcript_cursor=None,
        accepted_json=None,
        embedder=embedder,
    )

    addition = "\nMinor edit."
    _set_span_vectors(embedder, "", addition, old_vec=(1.0, 0.0, 0.0), new_vec=(1.0, 0.0, 0.0))
    blocked = main._evaluate_suggest_gate(
        note_id=note_id,
        clinician_id=clinician_id,
        normalized=base_note + addition,
        intent="auto",
        transcript_cursor=None,
        accepted_json=None,
        embedder=embedder,
    )
    assert blocked.allowed is False
    assert blocked.reason == "NOT_MEANINGFUL"


def test_suggest_gate_salient_override_allows_manual(suggest_gate_context):
    _, clinician_id, embedder = suggest_gate_context
    note_id = "note-salient"
    base_note = normalize_note_text("Sentence. " * 130)
    _set_span_vectors(embedder, "", base_note)
    main._evaluate_suggest_gate(
        note_id=note_id,
        clinician_id=clinician_id,
        normalized=base_note,
        intent="auto",
        transcript_cursor=None,
        accepted_json=None,
        embedder=embedder,
    )

    salient_addition = "\nBP 120/80 today."
    decision = main._evaluate_suggest_gate(
        note_id=note_id,
        clinician_id=clinician_id,
        normalized=base_note + salient_addition,
        intent="manual",
        transcript_cursor=None,
        accepted_json=None,
        embedder=embedder,
    )
    assert decision.allowed is True
    assert decision.model == "gpt-4o-mini"
    assert decision.detail["salient"] is True
