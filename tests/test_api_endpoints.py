import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend import main


@pytest.fixture
def client(monkeypatch, tmp_path):
    # Isolate database and events
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT NOT NULL, timestamp REAL NOT NULL, details TEXT)"
    )
    db.execute(
        "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    )
    db.commit()
    monkeypatch.setattr(main, "db_conn", db)
    monkeypatch.setattr(main, "events", [])
    return TestClient(main.app)


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_and_settings(client):
    resp = client.post("/login", json={"username": "alice", "role": "admin"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    assert token

    resp = client.get("/settings")
    assert resp.status_code == 200
    assert "advanced_scrubber" in resp.json()

    resp = client.post("/settings", json={"advanced_scrubber": True})
    assert resp.json()["advanced_scrubber"] is True
    # reset to keep other tests deterministic
    client.post("/settings", json={"advanced_scrubber": False})

    resp = client.post("/settings", json={"advanced_scrubber": None})
    assert resp.status_code == 422


def test_events_metrics_with_auth(client):
    # no auth
    resp = client.get("/events")
    assert resp.status_code in {401, 403}

    # user without admin role
    token_user = client.post("/login", json={"username": "u", "role": "user"}).json()["access_token"]
    resp = client.get("/events", headers=auth_header(token_user))
    assert resp.status_code == 403

    # log event and fetch with admin
    token_admin = client.post("/login", json={"username": "a", "role": "admin"}).json()["access_token"]
    client.post("/event", json={"eventType": "note_started"})
    resp = client.get("/events", headers=auth_header(token_admin))
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    resp = client.get("/metrics", headers=auth_header(token_admin))
    assert resp.status_code == 200
    assert resp.json()["total_notes"] >= 1


def test_summarize_and_fallback(client, monkeypatch):
    monkeypatch.setattr(main, "call_openai", lambda msgs: "great summary")
    resp = client.post("/summarize", json={"text": "hello"})
    assert resp.json()["summary"] == "great summary"

    def boom(_):
        raise RuntimeError("no key")

    monkeypatch.setattr(main, "call_openai", boom)
    long_text = "a" * 300
    resp = client.post("/summarize", json={"text": long_text})
    assert resp.status_code == 200
    assert len(resp.json()["summary"]) <= 203  # truncated fallback


def test_transcribe_endpoint(client, monkeypatch):
    monkeypatch.setattr(main, "simple_transcribe", lambda b: "hello")
    resp = client.post("/transcribe", files={"file": ("a.wav", b"bytes")})
    assert resp.json()["provider"] == "hello"

    resp = client.post("/transcribe")
    assert resp.status_code == 422


def test_apikey_validation(client, monkeypatch):
    monkeypatch.setattr(main, "save_api_key", lambda key: None)
    valid = "sk-" + "a" * 22
    resp = client.post("/apikey", json={"key": valid})
    assert resp.json()["status"] == "saved"

    resp = client.post("/apikey", json={"key": ""})
    assert resp.status_code == 400

    resp = client.post("/apikey", json={"key": "abc"})
    assert resp.status_code == 400


def test_beautify_and_fallback(client, monkeypatch):
    monkeypatch.setattr(main, "call_openai", lambda msgs: "nice note")
    resp = client.post("/beautify", json={"text": "hello"})
    assert resp.json()["beautified"] == "nice note"

    def fail(_):
        raise ValueError("bad")

    monkeypatch.setattr(main, "call_openai", fail)
    resp = client.post("/beautify", json={"text": "hi"})
    assert resp.json()["beautified"] == "HI"


def test_suggest_and_fallback(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "call_openai",
        lambda msgs: json.dumps(
            {
                "codes": [{"code": "A1"}],
                "compliance": ["c"],
                "publicHealth": ["p"],
                "differentials": ["d"],
            }
        ),
    )
    resp = client.post("/suggest", json={"text": "note"})
    data = resp.json()
    assert data["codes"][0]["code"] == "A1"

    def boom(_):
        raise RuntimeError("fail")

    monkeypatch.setattr(main, "call_openai", boom)
    resp = client.post("/suggest", json={"text": "cough"})
    data = resp.json()
    assert any(c["code"] == "99213" for c in data["codes"])
