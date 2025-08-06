import json
import sqlite3
import hashlib
import importlib

import pytest
from fastapi.testclient import TestClient


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def offline_client(monkeypatch):
    """Return a TestClient with offline model mode enabled."""
    monkeypatch.setenv("USE_OFFLINE_MODEL", "true")
    from backend import main as main_module
    importlib.reload(main_module)

    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT NOT NULL, timestamp REAL NOT NULL, details TEXT)"
    )
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
    )
    pwd = hashlib.sha256(b"pw").hexdigest()
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("u", pwd, "user"),
    )
    db.commit()
    monkeypatch.setattr(main_module, "db_conn", db)
    monkeypatch.setattr(main_module, "events", [])
    client = TestClient(main_module.app)
    yield client, main_module
    monkeypatch.delenv("USE_OFFLINE_MODEL", raising=False)
    importlib.reload(main_module)


def test_offline_beautify(offline_client):
    client, main_module = offline_client
    token = main_module.create_token("u", "user")
    resp = client.post("/beautify", json={"text": "hello"}, headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()["beautified"]


def test_offline_suggest(offline_client):
    client, main_module = offline_client
    token = main_module.create_token("u", "user")
    resp = client.post("/suggest", json={"text": "note"}, headers=auth_header(token))
    data = resp.json()
    assert data["codes"]
    assert data["compliance"]
    assert data["publicHealth"]
    assert data["differentials"]


def test_offline_summarize(offline_client):
    client, main_module = offline_client
    token = main_module.create_token("u", "user")
    resp = client.post("/summarize", json={"text": "hello"}, headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()["summary"]
