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
    monkeypatch.setattr(main, "db_conn", db)
    return db


def test_profile_and_notifications(monkeypatch):
    _setup_db(monkeypatch)
    client = TestClient(main.app)
    token = main.create_token("alice", "user")

    # initial profile fetch
    resp = client.get("/api/user/profile", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {
        "currentView": None,
        "clinic": None,
        "preferences": {},
        "uiPreferences": {},
    }

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
    main.notification_counts["alice"] = 5
    resp = client.get("/api/notifications/count", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["count"] == 5

    with client.websocket_connect(f"/ws/notifications?token={token}") as ws:
        data = ws.receive_json()
        assert data["count"] == 5
