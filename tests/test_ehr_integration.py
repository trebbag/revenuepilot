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


def test_manual_bundle_download_when_unconfigured(client, monkeypatch):
    token = client.post("/login", json={"username": "admin", "password": "pw"}).json()[
        "access_token"
    ]
    # Simulate unconfigured server
    monkeypatch.setattr(ehr_integration, "FHIR_SERVER_URL", "https://fhir.example.com")
    resp = client.post(
        "/export",
        json={"note": "Example note", "codes": ["99213", "M16.5", "1234-5", "MED123"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "bundle"
    bundle = body["bundle"]
    types = {e["resource"]["resourceType"] for e in bundle["entry"]}
    # Ensure new classifications appear
    assert {"Composition", "Procedure", "Condition", "Observation", "MedicationStatement"}.issubset(types)
    # Composition should reference sections
    composition = next(e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "Composition")
    assert composition["section"]
    # Each section should have at least one entry reference
    assert all(sec.get("entry") for sec in composition["section"])


def test_code_system_coding(client, monkeypatch, requests_mock):
    token = client.post("/login", json={"username": "admin", "password": "pw"}).json()[
        "access_token"
    ]
    monkeypatch.setattr(ehr_integration, "FHIR_SERVER_URL", "http://fhir.test")
    monkeypatch.setattr(ehr_integration, "get_ehr_token", lambda: "tok123")
    requests_mock.post("http://fhir.test/Bundle", json={"id": "bundle1"})

    codes = ["99213", "M16.5", "1234-5", "MED123", "BP001"]
    resp = client.post(
        "/export",
        json={"note": "Example note", "codes": codes},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    bundle = resp.json()["bundle"]
    # Find resources for each supplied code and validate system heuristics
    system_map = {}
    for entry in bundle["entry"]:
        r = entry["resource"]
        if r["resourceType"] in {"Condition", "Procedure", "Observation", "MedicationStatement"}:
            coding = None
            if r["resourceType"] == "MedicationStatement":
                coding = r["medicationCodeableConcept"].get("coding", [{}])[0]
            elif r["resourceType"] == "Procedure":
                coding = r["code"].get("coding", [{}])[0]
            elif r["resourceType"] == "Observation":
                if "coding" in r["code"]:
                    coding = r["code"]["coding"][0]
            elif r["resourceType"] == "Condition":
                coding = r["code"].get("coding", [{}])[0]
            if coding and coding.get("code"):
                system_map[coding["code"]] = coding.get("system", "")
    assert system_map["99213"].startswith("http://www.ama-assn.org")
    assert system_map["M16.5"].endswith("icd-10-cm")
    assert system_map["1234-5"].endswith("loinc.org")
    assert system_map["MED123"].endswith("umls/rxnorm")
    # BP vital sign Observation may not have system but should exist
    assert "BP001" in system_map

