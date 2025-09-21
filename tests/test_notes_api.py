import json
import sqlite3
import time

import pytest
from fastapi.testclient import TestClient

import backend.main as main
from backend.main import _init_core_tables


@pytest.fixture
def client(monkeypatch):
    main.db_conn = sqlite3.connect(":memory:", check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    _init_core_tables(main.db_conn)
    pwd = main.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("alice", pwd, "user"),
    )
    main.db_conn.commit()
    monkeypatch.setattr(main, "db_conn", main.db_conn)
    return TestClient(main.app)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def insert_note(content, status="draft"):
    ts = time.time()
    main.db_conn.execute(
        "INSERT INTO notes (content, status, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (content, status, ts, ts),
    )
    main.db_conn.commit()
    return main.db_conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def insert_note_with_timestamps(content, created, updated, status="draft"):
    main.db_conn.execute(
        "INSERT INTO notes (content, status, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (content, status, created, updated),
    )
    main.db_conn.commit()
    return main.db_conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def test_get_drafts(client):
    token = main.create_token("alice", "user")
    insert_note("first draft", "draft")
    insert_note("final note", "final")
    resp = client.get("/api/notes/drafts", headers=auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["status"] == "draft"


def test_search_and_bulk_update(client):
    token = main.create_token("alice", "user")
    id1 = insert_note("alpha beta")
    id2 = insert_note("beta gamma")
    resp = client.get("/api/notes/search?q=beta", headers=auth(token))
    assert {n["id"] for n in resp.json()} == {id1, id2}
    resp = client.post(
        "/api/notes/bulk-operations",
        json={"ids": [id1, id2], "status": "archived"},
        headers=auth(token),
    )
    assert resp.status_code == 200
    resp = client.get("/api/notes/search?q=beta&status=archived", headers=auth(token))
    assert {n["id"] for n in resp.json()} == {id1, id2}


def test_analytics_and_delete(client):
    token = main.create_token("alice", "user")
    id1 = insert_note("note one")
    id2 = insert_note("note two")
    resp = client.get("/api/analytics/drafts", headers=auth(token))
    assert resp.json()["drafts"] == 2
    resp = client.post(
        "/api/notes/bulk-operations",
        json={"ids": [id1], "delete": True},
        headers=auth(token),
    )
    assert resp.json()["deleted"] == 1
    resp = client.get("/api/analytics/drafts", headers=auth(token))
    assert resp.json()["drafts"] == 1


def test_draft_analytics_exposes_recent_activity(client):
    token = main.create_token("alice", "user")
    now = time.time()

    created_one = now - 10 * 24 * 60 * 60
    updated_one = created_one + 120
    created_two = now - 2 * 24 * 60 * 60
    updated_two = created_two + 240

    insert_note_with_timestamps(
        json.dumps(
            {
                "metadata": {
                    "patient": {"name": "Jane Doe", "id": "J-1"},
                    "title": "Annual wellness visit",
                },
                "content": "Annual wellness visit summary",
            }
        ),
        created_one,
        updated_one,
    )

    insert_note_with_timestamps(
        json.dumps(
            {
                "metadata": {
                    "patient": {"name": "Michael Rivera", "id": "M-2"},
                    "title": "Follow-up planning",
                },
                "content": "Follow-up note",
            }
        ),
        created_two,
        updated_two,
    )

    resp = client.get("/api/analytics/drafts", headers=auth(token))
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["drafts"] == 2
    assert payload["staleDrafts"] == 1
    assert payload["abandonmentRate"] == pytest.approx(0.5)
    assert payload["averageCompletionTimeMinutes"] == pytest.approx(3.0, rel=1e-3)
    assert len(payload["recentActivity"]) == 2
    most_recent = payload["recentActivity"][0]
    assert most_recent["title"] == "Follow-up planning"
    assert most_recent["patientName"] == "Michael Rivera"
