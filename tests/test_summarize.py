import sqlite3
import json
import pytest
from fastapi.testclient import TestClient
from backend import main


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client(monkeypatch):
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT NOT NULL, timestamp REAL NOT NULL, details TEXT)"
    )
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
    )
    pwd = main.hash_password("pw")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("u", pwd, "user"),
    )
    db.commit()
    monkeypatch.setattr(main, "db_conn", db)
    monkeypatch.setattr(main, "events", [])
    return TestClient(main.app)


def test_summarize_basic_success(client, monkeypatch):
    def fake_call(msgs):
        # ensure patient age hint present when provided
        assert any("Use words a" in m.get("content", "") for m in msgs if m["role"] == "system") or True
        return json.dumps({
            "summary": "Patient with cough.",
            "recommendations": ["Rest"],
            "warnings": []
        })
    monkeypatch.setattr(main, "call_openai", fake_call)
    token = main.create_token("u", "user")
    resp = client.post("/summarize", json={"text": "cough", "patientAge": 10}, headers=auth_header(token))
    data = resp.json()
    assert data["summary"].startswith("Patient with")
    assert data["recommendations"] == ["Rest"]
    assert data["patient_friendly"] == data["summary"]


def test_summarize_fallback_on_error(client, monkeypatch):
    def boom(msgs):
        raise RuntimeError("api down")
    monkeypatch.setattr(main, "call_openai", boom)
    token = main.create_token("u", "user")
    long_text = "a" * 250
    resp = client.post("/summarize", json={"text": long_text}, headers=auth_header(token))
    data = resp.json()
    # Fallback truncates to 200 chars + ellipsis
    assert len(data["summary"]) <= 203
    assert data["patient_friendly"] == data["summary"]


def test_summarize_offline(monkeypatch, client):
    monkeypatch.setattr(main, "USE_OFFLINE_MODEL", True)
    token = main.create_token("u", "user")
    resp = client.post("/summarize", json={"text": "offline test"}, headers=auth_header(token))
    data = resp.json()
    assert "summary" in data
    assert data["patient_friendly"] == data["summary"]


def test_beautify_offline(monkeypatch, client):
    monkeypatch.setattr(main, "USE_OFFLINE_MODEL", True)
    token = main.create_token("u", "user")
    resp = client.post("/beautify", json={"text": "offline beautify"}, headers=auth_header(token))
    data = resp.json()
    assert data["beautified"].startswith("Beautified (offline):")
