import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend import main, migrations, ehr_integration


class DummyResp:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


@pytest.fixture
def client(monkeypatch):
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT NOT NULL, timestamp REAL NOT NULL, details TEXT, revenue REAL, codes TEXT, compliance_flags TEXT, public_health INTEGER, satisfaction INTEGER)"
    )
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
    )
    db.execute(
        "CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL, username TEXT, action TEXT, details TEXT)"
    )
    migrations.ensure_settings_table(db)
    pwd = main.hash_password("pw")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("admin", pwd, "admin"),
    )
    db.commit()
    monkeypatch.setattr(main, "db_conn", db)
    monkeypatch.setattr(main, "events", [])
    return TestClient(main.app)


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_posts_bundle_to_fhir(monkeypatch, client):
    token = client.post("/login", json={"username": "admin", "password": "pw"}).json()["access_token"]

    calls = []

    def fake_post(url, json=None, timeout=10):
        calls.append({"url": url, "json": json})
        return DummyResp({"id": "bundle1"})

    monkeypatch.setattr(ehr_integration.requests, "post", fake_post)
    monkeypatch.setattr(ehr_integration, "FHIR_SERVER_URL", "http://fhir.test")

    resp = client.post(
        "/export_to_ehr",
        json={"note": "Example note", "codes": ["A1"]},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert calls and calls[0]["url"] == "http://fhir.test/Bundle"
    bundle = calls[0]["json"]
    assert bundle["entry"][0]["resource"]["valueString"] == "Example note"
    assert bundle["entry"][1]["resource"]["code"]["coding"][0]["code"] == "A1"
