import sqlite3
from collections import defaultdict, deque
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from backend import main, migrations


@pytest.fixture
def auth_client(monkeypatch):
    main.db_conn = sqlite3.connect(":memory:", check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    main._init_core_tables(main.db_conn)
    migrations.ensure_settings_table(main.db_conn)
    pwd = main.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("u", pwd, "user"),
    )
    main.db_conn.commit()
    monkeypatch.setattr(main, "db_conn", main.db_conn)
    monkeypatch.setattr(main, "events", [])
    monkeypatch.setattr(
        main,
        "transcript_history",
        defaultdict(lambda: deque(maxlen=main.TRANSCRIPT_HISTORY_LIMIT)),
    )
    client = TestClient(main.app)
    token = client.post("/login", json={"username": "u", "password": "pw"}).json()[
        "access_token"
    ]
    return client, token


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_dashboard_endpoints(auth_client):
    client, token = auth_client
    main._DASHBOARD_CACHE.clear()
    now = datetime.utcnow()
    client.post("/event", json={"eventType": "note_started"}, headers=auth_header(token))
    client.post("/event", json={"eventType": "note_started"}, headers=auth_header(token))
    client.post("/event", json={"eventType": "note_started"}, headers=auth_header(token))
    client.post(
        "/event",
        json={"eventType": "note_closed", "revenue": 100.0},
        headers=auth_header(token),
    )
    client.post(
        "/event",
        json={"eventType": "note_closed", "compliance": ["gap"]},
        headers=auth_header(token),
    )
    start = (now + timedelta(hours=1)).isoformat()
    end = (now + timedelta(hours=2)).isoformat()
    client.post(
        "/schedule",
        json={"patient": "p1", "reason": "check", "start": start, "end": end},
        headers=auth_header(token),
    )

    resp = client.get("/api/dashboard/daily-overview", headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data == {
        "todaysNotes": 3,
        "completedVisits": 2,
        "pendingReviews": 1,
        "complianceScore": 50.0,
        "revenueToday": 100.0,
    }

    resp = client.get("/api/dashboard/quick-actions", headers=auth_header(token))
    assert resp.status_code == 200
    qdata = resp.json()
    assert qdata["draftCount"] == 1
    assert qdata["upcomingAppointments"] == 1
    assert qdata["urgentReviews"] == 1
    assert isinstance(qdata["systemAlerts"], list)

    resp = client.get("/api/dashboard/activity", headers=auth_header(token))
    assert resp.status_code == 200
    assert len(resp.json()) >= 5

    resp = client.get("/api/system/status")
    assert resp.status_code == 200
    status = resp.json()
    assert "aiServicesStatus" in status
    assert "ehrConnectionStatus" in status


def test_dashboard_cache(monkeypatch, auth_client):
    client, token = auth_client
    monkeypatch.setattr(main, "DASHBOARD_CACHE_TTL", 1000)
    main._DASHBOARD_CACHE.clear()
    client.post("/event", json={"eventType": "note_started"}, headers=auth_header(token))
    resp1 = client.get("/api/dashboard/daily-overview", headers=auth_header(token))
    assert resp1.status_code == 200
    assert resp1.json()["todaysNotes"] == 1
    client.post("/event", json={"eventType": "note_started"}, headers=auth_header(token))
    resp2 = client.get("/api/dashboard/daily-overview", headers=auth_header(token))
    assert resp2.json()["todaysNotes"] == 1
