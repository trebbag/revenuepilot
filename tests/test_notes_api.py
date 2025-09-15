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
