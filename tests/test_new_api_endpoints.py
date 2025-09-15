import sqlite3
from collections import defaultdict, deque

import pytest
from fastapi.testclient import TestClient

from backend import main, migrations
from backend.main import _init_core_tables


@pytest.fixture
def client(monkeypatch):
    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    _init_core_tables(main.db_conn)
    migrations.ensure_settings_table(main.db_conn)
    pwd = main.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("user", pwd, "user"),
    )
    main.db_conn.commit()
    monkeypatch.setattr(main, "db_conn", main.db_conn)
    monkeypatch.setattr(main, "events", [])
    monkeypatch.setattr(
        main,
        "transcript_history",
        defaultdict(lambda: deque(maxlen=main.TRANSCRIPT_HISTORY_LIMIT)),
    )
    return TestClient(main.app)


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def login(client):
    resp = client.post("/login", json={"username": "user", "password": "pw"})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def test_get_patient(client):
    token = login(client)
    resp = client.get("/api/patients/1", headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["patientId"] == "1"
    assert data["name"]


def test_schedule_appointments(client):
    token = login(client)
    resp = client.post(
        "/schedule",
        json={"patient": "1", "reason": "check", "start": "2024-01-01T09:00:00"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    resp = client.get("/api/schedule/appointments", headers=auth_header(token))
    assert resp.status_code == 200
    assert len(resp.json()["appointments"]) >= 1


def test_visits_manage(client):
    token = login(client)
    resp = client.post(
        "/api/visits/manage",
        json={"encounterId": "enc1", "action": "start"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["visitStatus"] == "active"


def test_charts_upload(client):
    token = login(client)
    resp = client.post(
        "/api/charts/upload",
        headers=auth_header(token),
        files={"file": ("chart.txt", b"data")},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "processing"
