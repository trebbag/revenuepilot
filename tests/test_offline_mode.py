import json
import sqlite3
import importlib
import sqlite3

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
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT NOT NULL, timestamp REAL NOT NULL, details TEXT, revenue REAL, codes TEXT, compliance_flags TEXT, public_health INTEGER, satisfaction INTEGER)"
    )
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
    )
    pwd = main_module.hash_password("pw")
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
    payload = {"text": "hello"}
    resp1 = client.post("/beautify", json=payload, headers=auth_header(token))
    resp2 = client.post("/beautify", json=payload, headers=auth_header(token))
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp1.json()["beautified"] == "Beautified (offline): hello"
    assert resp1.json()["beautified"] == resp2.json()["beautified"]


def test_offline_suggest(offline_client):
    client, main_module = offline_client
    token = main_module.create_token("u", "user")
    payload = {"text": "note"}
    r1 = client.post("/suggest", json=payload, headers=auth_header(token)).json()
    r2 = client.post("/suggest", json=payload, headers=auth_header(token)).json()
    assert r1 == r2
    assert r1["codes"]
    assert r1["compliance"]
    assert r1["publicHealth"]
    assert r1["differentials"]


def test_offline_summarize(offline_client):
    client, main_module = offline_client
    token = main_module.create_token("u", "user")
    payload = {"text": "hello"}
    r1 = client.post("/summarize", json=payload, headers=auth_header(token))
    r2 = client.post("/summarize", json=payload, headers=auth_header(token))
    assert r1.status_code == 200
    assert r2.status_code == 200
    d1 = r1.json()
    d2 = r2.json()
    assert d1 == d2
    assert d1["summary"]
    assert d1["recommendations"] == []
    assert d1["warnings"] == []

