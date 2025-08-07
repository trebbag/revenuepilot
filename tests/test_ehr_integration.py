import sqlite3
from collections import defaultdict, deque

import pytest
import requests
from fastapi.testclient import TestClient

from backend import main, migrations, ehr_integration


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
    monkeypatch.setattr(
        main,
        "transcript_history",
        defaultdict(lambda: deque(maxlen=main.TRANSCRIPT_HISTORY_LIMIT)),
    )
    return TestClient(main.app)


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_posts_bundle_to_fhir(client, monkeypatch, requests_mock):
    token = client.post("/login", json={"username": "admin", "password": "pw"}).json()[
        "access_token"
    ]

    monkeypatch.setattr(ehr_integration, "FHIR_SERVER_URL", "http://fhir.test")
    monkeypatch.setattr(ehr_integration, "get_ehr_token", lambda: "tok123")
    m = requests_mock.post("http://fhir.test/Bundle", json={"id": "bundle1"})

    resp = client.post(
        "/export",
        json={
            "note": "Example note",
            "codes": ["A1"],
            "patientID": "p1",
            "encounterID": "e1",
            "procedures": ["PROC1"],
            "medications": ["MED1"],
        },
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "exported"
    assert m.called
    req = requests_mock.request_history[0]
    assert req.headers["Authorization"] == "Bearer tok123"
    bundle = req.json()
    types = {entry["resource"]["resourceType"] for entry in bundle["entry"]}
    assert {
        "Observation",
        "DocumentReference",
        "Claim",
        "Procedure",
        "MedicationStatement",
    }.issubset(types)


def test_reports_auth_errors(client, monkeypatch, requests_mock):
    token = client.post("/login", json={"username": "admin", "password": "pw"}).json()[
        "access_token"
    ]

    monkeypatch.setattr(ehr_integration, "FHIR_SERVER_URL", "http://fhir.test")
    requests_mock.post("http://fhir.test/Bundle", status_code=401, text="auth")

    resp = client.post("/export", json={"note": "hi"}, headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()["status"] == "auth_error"


def test_reports_fhir_errors(client, monkeypatch, requests_mock):
    token = client.post("/login", json={"username": "admin", "password": "pw"}).json()[
        "access_token"
    ]

    monkeypatch.setattr(ehr_integration, "FHIR_SERVER_URL", "http://fhir.test")
    requests_mock.post("http://fhir.test/Bundle", status_code=500, text="boom")

    resp = client.post("/export", json={"note": "hi"}, headers=auth_header(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "error"
    assert "boom" in body["detail"]


def test_network_errors(client, monkeypatch, requests_mock):
    token = client.post("/login", json={"username": "admin", "password": "pw"}).json()[
        "access_token"
    ]
    monkeypatch.setattr(ehr_integration, "FHIR_SERVER_URL", "http://fhir.test")
    requests_mock.post(
        "http://fhir.test/Bundle", exc=requests.exceptions.ConnectTimeout
    )

    resp = client.post("/export", json={"note": "hi"}, headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()["status"] == "error"


def test_basic_auth(client, monkeypatch, requests_mock):
    token = client.post("/login", json={"username": "admin", "password": "pw"}).json()[
        "access_token"
    ]

    monkeypatch.setattr(ehr_integration, "FHIR_SERVER_URL", "http://fhir.test")
    monkeypatch.setattr(ehr_integration, "TOKEN_URL", None)
    monkeypatch.setattr(ehr_integration, "CLIENT_ID", None)
    monkeypatch.setattr(ehr_integration, "CLIENT_SECRET", None)
    monkeypatch.setattr(ehr_integration, "STATIC_BEARER_TOKEN", None)
    monkeypatch.setattr(ehr_integration, "BASIC_AUTH_USER", "user")
    monkeypatch.setattr(ehr_integration, "BASIC_AUTH_PASSWORD", "pw")
    requests_mock.post("http://fhir.test/Bundle", json={"id": "b"})

    resp = client.post("/export", json={"note": "hi"}, headers=auth_header(token))
    assert resp.status_code == 200
    assert requests_mock.last_request.headers["Authorization"].startswith("Basic ")

