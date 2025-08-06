import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend import main, migrations, ehr_integration


class DummyResp:
    def __init__(self, data, status=200):
        self._data = data
        self.status_code = status

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

    def fake_post(url, json=None, headers=None, timeout=10):
        calls.append({"url": url, "json": json, "headers": headers})
        return DummyResp({"id": "bundle1"})

    monkeypatch.setattr(ehr_integration.requests, "post", fake_post)
    monkeypatch.setattr(ehr_integration, "FHIR_SERVER_URL", "http://fhir.test")
    monkeypatch.setattr(ehr_integration, "get_ehr_token", lambda: "tok123")

    resp = client.post(
        "/export_to_ehr",
        json={
            "note": "Example note",
            "codes": ["A1"],
            "patientId": "p1",
            "encounterId": "e1",
        },
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "exported"
    assert calls and calls[0]["url"] == "http://fhir.test/Bundle"
    assert calls[0]["headers"]["Authorization"] == "Bearer tok123"
    bundle = calls[0]["json"]
    types = {entry["resource"]["resourceType"] for entry in bundle["entry"]}
    assert {"Observation", "DocumentReference", "Claim"}.issubset(types)
    claim = next(e for e in bundle["entry"] if e["resource"]["resourceType"] == "Claim")
    assert (
        claim["resource"]["item"][0]["productOrService"]["coding"][0]["code"]
        == "A1"
    )


def test_reports_auth_errors(monkeypatch, client):
    token = client.post("/login", json={"username": "admin", "password": "pw"}).json()["access_token"]

    class DummyAuthResp:
        status_code = 401

        def raise_for_status(self):
            pass

        def json(self):
            return {}

    def fake_post(url, json=None, headers=None, timeout=10):
        return DummyAuthResp()

    monkeypatch.setattr(ehr_integration.requests, "post", fake_post)
    monkeypatch.setattr(ehr_integration, "get_ehr_token", lambda: None)

    resp = client.post(
        "/export_to_ehr",
        json={"note": "hi"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "auth_error"
