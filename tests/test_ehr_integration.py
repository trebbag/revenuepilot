import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend import main, migrations, ehr_integration


class DummyResp:
    def __init__(self, data, status=200):
        self._data = data
        self.status_code = status
        self.ok = status < 400

    def raise_for_status(self):
        pass

    def json(self):
        return self._data

    @property
    def text(self):
        return "dummy"


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
            "procedures": ["PROC1"],
            "medications": ["MED1"],
        },
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "exported"
    assert calls and calls[0]["url"] == "http://fhir.test/Bundle"
    assert calls[0]["headers"]["Authorization"] == "Bearer tok123"
    bundle = calls[0]["json"]
    types = {entry["resource"]["resourceType"] for entry in bundle["entry"]}
    assert {"Observation", "DocumentReference", "Claim", "Procedure", "MedicationStatement"}.issubset(types)
    claim = next(e for e in bundle["entry"] if e["resource"]["resourceType"] == "Claim")
    assert (
        claim["resource"]["item"][0]["productOrService"]["coding"][0]["code"]
        == "A1"
    )


def test_reports_auth_errors(monkeypatch, client):
    token = client.post("/login", json={"username": "admin", "password": "pw"}).json()["access_token"]

    class DummyAuthResp:
        status_code = 401
        ok = False

        def raise_for_status(self):
            pass

        def json(self):
            return {}

        @property
        def text(self):
            return "auth"

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


def test_reports_fhir_errors(monkeypatch, client):
    token = client.post("/login", json={"username": "admin", "password": "pw"}).json()["access_token"]

    class DummyErrResp:
        status_code = 500
        ok = False

        def json(self):
            return {"issue": "boom"}

        @property
        def text(self):
            return "boom"

    def fake_post(url, json=None, headers=None, timeout=10):
        return DummyErrResp()

    monkeypatch.setattr(ehr_integration.requests, "post", fake_post)
    monkeypatch.setattr(ehr_integration, "get_ehr_token", lambda: None)

    resp = client.post(
        "/export_to_ehr",
        json={"note": "hi"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "error"
    assert "boom" in body["detail"]


def test_basic_auth(monkeypatch, client):
    token = client.post("/login", json={"username": "admin", "password": "pw"}).json()["access_token"]

    calls = []

    def fake_post(url, json=None, headers=None, timeout=10):
        calls.append(headers)
        return DummyResp({"id": "bundle1"})

    monkeypatch.setattr(ehr_integration.requests, "post", fake_post)
    monkeypatch.setattr(ehr_integration, "FHIR_SERVER_URL", "http://fhir.test")
    monkeypatch.setattr(ehr_integration, "TOKEN_URL", None)
    monkeypatch.setattr(ehr_integration, "CLIENT_ID", None)
    monkeypatch.setattr(ehr_integration, "CLIENT_SECRET", None)
    monkeypatch.setattr(ehr_integration, "STATIC_BEARER_TOKEN", None)
    monkeypatch.setattr(ehr_integration, "BASIC_AUTH_USER", "user")
    monkeypatch.setattr(ehr_integration, "BASIC_AUTH_PASSWORD", "pw")

    resp = client.post(
        "/export_to_ehr",
        json={"note": "hi"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert calls and calls[0]["Authorization"].startswith("Basic ")
