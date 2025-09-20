import sqlite3
from fastapi.testclient import TestClient

from backend import main, migrations


def _setup_db(monkeypatch):
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)"
    )
    migrations.ensure_settings_table(db)
    migrations.ensure_user_profile_table(db)
    pwd = main.hash_password("pw")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?,?,?)",
        ("alice", pwd, "user"),
    )
    db.commit()
    migrations.ensure_notification_counters_table(db)
    migrations.ensure_notification_events_table(db)
    monkeypatch.setattr(main, "db_conn", db)
    main.notification_counts = main.NotificationStore()
    return db


def test_profile_and_notifications(monkeypatch):
    _setup_db(monkeypatch)
    client = TestClient(main.app)
    token = main.create_token("alice", "user")

    # initial profile fetch
    resp = client.get("/api/user/profile", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    profile_payload = resp.json()
    if isinstance(profile_payload, dict) and "data" in profile_payload:
        nested = profile_payload["data"]
        if isinstance(nested, dict):
            profile_payload = nested
    assert isinstance(profile_payload, dict)
    assert "preferences" in profile_payload

    payload = {
        "currentView": "dashboard",
        "clinic": "Clinic A",
        "preferences": {"p": 1},
        "uiPreferences": {"theme": "dark"},
    }
    resp = client.put(
        "/api/user/profile",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    resp = client.get("/api/user/current-view", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["currentView"] == "dashboard"

    resp = client.get("/api/user/ui-preferences", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["uiPreferences"]["theme"] == "dark"

    resp = client.put(
        "/api/user/ui-preferences",
        json={"uiPreferences": {"theme": "light"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    resp = client.get("/api/user/ui-preferences", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["uiPreferences"]["theme"] == "light"

    resp = client.get("/api/notifications/count", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["count"] == 0

    # Persist a few unread notification records which should update counters.
    for idx in range(5):
        payload = {
            "notificationId": f"test-{idx}",
            "title": "Heads up",
            "message": "Check this out",
            "severity": "info",
        }
        stored, count = main._persist_notification_event("alice", payload, mark_unread=True)
        assert stored["id"] == payload["notificationId"]
        assert count == idx + 1

    resp = client.get("/api/notifications/count", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["count"] == 5

    with client.websocket_connect(
        "/ws/notifications", headers={"Authorization": f"Bearer {token}"}
    ) as ws:
        data = ws.receive_json()
        assert data["count"] == 5
