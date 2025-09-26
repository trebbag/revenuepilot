import asyncio
import sqlite3
from typing import Tuple

import pytest
from fastapi.testclient import TestClient

from backend import main, migrations
from backend.notifications_service import NotificationEvent


class DummyNotificationsManager:
    def __init__(self) -> None:
        self.events: list[Tuple[str, NotificationEvent]] = []
        self.unread: list[Tuple[str, int]] = []
        self.items: list[Tuple[str, list[dict]]] = []

    async def handle(self, websocket, username: str) -> None:  # pragma: no cover - not used in tests
        raise AssertionError("Websocket handling not expected in this test")

    async def broadcast_event(self, username: str, event: main.NotificationEvent) -> None:
        self.events.append((username, event))
        await self.broadcast_unread(username, event.unread_count)
        await self.broadcast_items(username, [event.item])

    async def broadcast_unread(self, username: str, count: int) -> None:
        self.unread.append((username, count))

    async def broadcast_items(self, username: str, items: list[dict]) -> None:
        self.items.append((username, list(items)))


@pytest.fixture
def notification_client(monkeypatch):
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
    manager = DummyNotificationsManager()
    monkeypatch.setattr(main, "notifications_ws_manager", manager)
    client = TestClient(main.app)
    token = main.create_token("alice", "user")
    yield client, token, manager
    client.close()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_notifications_lifecycle(notification_client):
    client, token, manager = notification_client

    resp = client.get("/api/notifications", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["unreadCount"] == 0

    asyncio.run(
        main._push_notification_event(
            "alice",
            {"title": "Compliance alert", "message": "Review required", "severity": "high"},
            increment=True,
        )
    )
    assert manager.events
    username, event_payload = manager.events[-1]
    assert username == "alice"
    assert event_payload.unread_count == 1
    assert event_payload.item["title"] == "Compliance alert"
    assert event_payload.item["id"]
    assert manager.unread[-1] == ("alice", 1)

    resp = client.get("/api/notifications", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["unreadCount"] == 1
    assert len(data["items"]) == 1
    first = data["items"][0]
    assert first["title"] == "Compliance alert"
    assert first["message"] == "Review required"
    assert not first["isRead"]

    resp = client.get("/api/notifications/count", headers=_auth_headers(token))
    payload = resp.json()
    assert payload["notifications"] == 1
    assert "drafts" in payload

    resp = client.post(
        f"/api/notifications/{first['id']}/read",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["unreadCount"] == 0

    resp = client.get("/api/notifications", headers=_auth_headers(token))
    data = resp.json()
    assert data["unreadCount"] == 0
    assert data["items"][0]["isRead"] is True

    asyncio.run(
        main._push_notification_event(
            "alice",
            {"title": "Reminder", "message": "Second item", "severity": "info"},
            increment=True,
        )
    )
    asyncio.run(
        main._push_notification_event(
            "alice",
            {"title": "Follow up", "message": "Third item", "severity": "warning"},
            increment=True,
        )
    )

    resp = client.get("/api/notifications", headers=_auth_headers(token))
    data = resp.json()
    assert data["unreadCount"] == 2
    assert sum(1 for item in data["items"] if not item["isRead"]) == 2

    resp = client.post("/api/notifications/read-all", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["unreadCount"] == 0

    resp = client.get("/api/notifications", headers=_auth_headers(token))
    data = resp.json()
    assert data["unreadCount"] == 0
    assert all(item["isRead"] for item in data["items"])

    resp = client.get("/api/notifications/count", headers=_auth_headers(token))
    assert resp.json()["notifications"] == 0
