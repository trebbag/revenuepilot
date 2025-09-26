import asyncio
import sqlite3

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend import main, migrations
from backend.ws_notifications import NotificationWebSocketManager


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def ws_notification_client(monkeypatch: pytest.MonkeyPatch):
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)"
    )
    migrations.ensure_notification_counters_table(db)
    migrations.ensure_notification_events_table(db)
    pwd = main.hash_password("pw")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?,?,?)",
        ("alice", pwd, "user"),
    )
    db.commit()
    monkeypatch.setattr(main, "db_conn", db)
    main.notification_service.update_connection(db)
    main.notifications_ws_manager = NotificationWebSocketManager(main.notification_service)
    client = TestClient(main.app)
    token = main.create_token("alice", "user")
    yield client, token
    client.close()


def test_ws_notifications_requires_authentication():
    with TestClient(main.app) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/notifications"):
                pass


def test_ws_notifications_broadcasts_events(ws_notification_client):
    client, token = ws_notification_client

    headers = _auth_headers(token)
    with client.websocket_connect("/ws/notifications", headers=headers) as ws:
        assert ws.receive_json() == {"event": "connected"}
        initial = ws.receive_json()
        assert initial["type"] == "unread"
        assert initial["count"] == 0

        asyncio.run(
            main._push_notification_event(
                "alice",
                {"title": "Chart uploaded", "message": "Review available", "severity": "info"},
                increment=True,
            )
        )

        unread = ws.receive_json()
        assert unread == {"type": "unread", "count": 1}
        items = ws.receive_json()
        assert items["type"] == "items"
        assert items["items"][0]["title"] == "Chart uploaded"
        assert items["items"][0]["id"]

        resp = client.get("/api/notifications", headers=headers)
        data = resp.json()
        assert data["unreadCount"] == 1
        assert data["items"][0]["title"] == "Chart uploaded"

        resp = client.post("/api/notifications/read-all", headers=headers)
        assert resp.json()["unreadCount"] == 0

        update = ws.receive_json()
        assert update == {"type": "unread", "count": 0}
