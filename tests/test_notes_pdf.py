import hashlib
import sqlite3
import sys
import types
from collections import defaultdict, deque

import pytest
from fastapi.testclient import TestClient

stub = types.ModuleType("presidio_analyzer")
sys.modules.setdefault("presidio_analyzer", stub)

from backend import main, migrations
from backend.main import _init_core_tables


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client(monkeypatch):
    main.reset_export_workers_for_tests()
    main.db_conn = sqlite3.connect(":memory:", check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    _init_core_tables(main.db_conn)
    migrations.ensure_settings_table(main.db_conn)
    pwd = main.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("user", pwd, "user"),
    )
    main.db_conn.commit()
    monkeypatch.setattr(main, "db_conn", main.db_conn)
    monkeypatch.setattr(main, "events", [])
    monkeypatch.setattr(
        main,
        "transcript_history",
        defaultdict(lambda: deque(maxlen=main.TRANSCRIPT_HISTORY_LIMIT)),
    )
    return TestClient(main.app)


def test_finalized_note_pdf_is_deterministic(client):
    token = main.create_token("det-user", "user")
    payload = {
        "content": "Subjective findings and plan.",
        "codes": ["99213", "93000"],
        "prevention": ["Vaccination"],
        "diagnoses": ["I10"],
        "differentials": ["E11.9"],
        "compliance": ["HIPAA"],
        "patientId": "hash-patient",
    }

    finalize_resp = client.post(
        "/api/notes/finalize",
        json=payload,
        headers=auth_header(token),
    )
    assert finalize_resp.status_code == 200
    finalized_note_id = finalize_resp.json()["finalizedNoteId"]

    pdf_resp = client.get(
        f"/api/notes/{finalized_note_id}/pdf",
        params={"variant": "note", "patientId": "hash-patient"},
        headers=auth_header(token),
    )

    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"
    digest = hashlib.sha256(pdf_resp.content[:1024]).hexdigest()
    assert digest == "ebcb02e89fe696eb49e7c4ae0ca3984008f1e06ee7a62645be37068f627e589b"


def test_missing_summary_returns_placeholder(client):
    token = main.create_token("summary-user", "user")
    payload = {
        "content": "Assessment and plan go here.",
        "codes": [],
        "prevention": [],
        "diagnoses": [],
        "differentials": [],
        "compliance": [],
    }

    finalize_resp = client.post(
        "/api/notes/finalize",
        json=payload,
        headers=auth_header(token),
    )
    finalized_note_id = finalize_resp.json()["finalizedNoteId"]

    main.db_conn.execute(
        "UPDATE notes SET finalized_summary = NULL WHERE finalized_note_id = ?",
        (finalized_note_id,),
    )
    main.db_conn.commit()

    summary_resp = client.get(
        f"/api/notes/{finalized_note_id}/pdf",
        params={"variant": "summary"},
        headers=auth_header(token),
    )

    assert summary_resp.status_code == 200
    assert summary_resp.headers["content-type"] == "application/pdf"
    assert b"Summary not available" in summary_resp.content
