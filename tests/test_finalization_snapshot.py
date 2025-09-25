import sqlite3
from collections import defaultdict, deque

import pytest
from fastapi.testclient import TestClient

from backend import main, migrations
from backend.main import _init_core_tables


@pytest.fixture
def client(monkeypatch):
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


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def token(client: TestClient) -> str:
    resp = client.post("/login", json={"username": "user", "password": "pw"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    return data["access_token"]


def test_explain_anchors_returns_valid_offsets(client: TestClient, token: str) -> None:
    note = (
        "Chief Complaint: Follow-up visit.\n"
        "History: Longstanding hypertension with recent medication adjustments.\n"
        "Assessment: Hypertension remains uncontrolled with blood pressure 150/94."
    )
    response = client.post(
        "/api/ai/explain/anchors",
        headers=auth_header(token),
        json={"note": note, "code": "I10"},
    )
    assert response.status_code == 200
    payload = response.json()
    anchors = payload.get("anchors") or []
    assert anchors, "expected at least one anchor"
    for anchor in anchors:
        start = anchor["start"]
        end = anchor["end"]
        phrase = anchor["phrase"]
        assert isinstance(start, int) and isinstance(end, int)
        assert 0 <= start < end <= len(note)
        assert note[start:end] == phrase


def test_snapshot_suggestions_stable_across_calls(client: TestClient, token: str) -> None:
    base_note = (
        "Subjective: Patient here for hypertension follow up with medication management.\n"
        "Objective: Blood pressure 152/96 today, continues lisinopril.\n"
        "Assessment: Hypertension requires ongoing monitoring; diabetes reviewed." 
    )
    payload = {
        "snapshotId": "snapshot-001",
        "note": base_note,
        "selectedCodes": ["E11.9"],
        "patientContext": {"age": 58, "sex": "female"},
    }
    first = client.post(
        "/api/ai/codes/review-snapshot",
        headers=auth_header(token),
        json=payload,
    )
    assert first.status_code == 200
    second = client.post(
        "/api/ai/codes/review-snapshot",
        headers=auth_header(token),
        json={**payload, "note": base_note + " Additional note edits."},
    )
    assert second.status_code == 200
    assert first.json() == second.json()
    suggestions = first.json().get("newSuggestions") or []
    assert suggestions, "expected deterministic suggestions"
    codes = [item.get("code", "").upper() for item in suggestions]
    assert "E11.9" not in codes
    assert "I10" in codes
