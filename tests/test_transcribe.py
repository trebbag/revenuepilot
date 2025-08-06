import sqlite3
from fastapi.testclient import TestClient

import backend.main as main


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def setup_module(module):
    # ensure in-memory db; transcribe endpoint doesn't touch DB but required for app
    main.db_conn = sqlite3.connect(":memory:", check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    main.last_transcript.clear()


def test_get_last_transcript_empty():
    client = TestClient(main.app)
    token = main.create_token("alice", "user")
    resp = client.get("/transcribe", headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json() == {}


def test_transcribe_updates_last_transcript(monkeypatch):
    client = TestClient(main.app)
    token = main.create_token("alice", "user")
    monkeypatch.setattr(main, "simple_transcribe", lambda b: "hi")
    resp = client.post(
        "/transcribe",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["provider"] == "hi"

    resp2 = client.get("/transcribe", headers=auth_header(token))
    assert resp2.json()["provider"] == "hi"
