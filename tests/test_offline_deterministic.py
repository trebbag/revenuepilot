import sqlite3
import importlib

import pytest
from fastapi.testclient import TestClient

import test_offline_mode as tom


@pytest.fixture
def offline_client_no_key(monkeypatch):
    """Test client with offline model enabled and no API key."""
    monkeypatch.setenv("USE_OFFLINE_MODEL", "true")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
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


def test_beautify_deterministic(offline_client_no_key):
    client, main_module = offline_client_no_key
    token = main_module.create_token("u", "user")
    payload = {"text": "hello"}
    first = client.post("/beautify", json=payload, headers=tom.auth_header(token)).json()
    second = client.post("/beautify", json=payload, headers=tom.auth_header(token)).json()
    assert first == second


def test_suggest_deterministic(offline_client_no_key):
    client, main_module = offline_client_no_key
    token = main_module.create_token("u", "user")
    payload = {"text": "note"}
    first = client.post("/suggest", json=payload, headers=tom.auth_header(token)).json()
    second = client.post("/suggest", json=payload, headers=tom.auth_header(token)).json()
    assert first == second
