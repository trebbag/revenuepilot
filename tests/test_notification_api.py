import asyncio
from datetime import datetime, timezone
from typing import Tuple

import pytest

from backend import main
from backend.db import models


class DummyNotificationsManager:
    def __init__(self) -> None:
        self.sent: list[Tuple[str, dict]] = []

    def latest_session(self, username: str) -> None:
        return None

    async def push(self, session_id: str, payload: dict) -> None:
        self.sent.append(("push", payload))

    async def push_user(self, username: str, payload: dict) -> None:
        self.sent.append(("push_user", payload))


@pytest.fixture
def notification_env(api_client, db_session, monkeypatch):
    manager = DummyNotificationsManager()
    monkeypatch.setattr(main, "notifications_manager", manager)
    response = api_client.post("/register", json={"username": "alice", "password": "pw"})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    yield api_client, token, manager, db_session


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_notifications_lifecycle(notification_env):
    client, token, manager, db_session = notification_env

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
            session=db_session,
        )
    )
    db_session.commit()
    assert manager.sent
    event_payload = manager.sent[-1][1]
    assert event_payload["unreadCount"] == 1
    assert event_payload["notifications"] == 1
    assert event_payload["id"]

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
            session=db_session,
        )
    )
    db_session.commit()
    asyncio.run(
        main._push_notification_event(
            "alice",
            {"title": "Follow up", "message": "Third item", "severity": "warning"},
            increment=True,
            session=db_session,
        )
    )
    db_session.commit()

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


def test_navigation_badges_sqlite(db_session):
    main.notification_counts.clear()

    user = models.User(
        username="badge-user",
        password_hash=main.hash_password("pw"),
        role="user",
    )
    db_session.add(user)
    db_session.flush()

    db_session.add(models.Note(status="draft"))
    event = models.NotificationEvent(
        event_id="evt-1",
        user_id=user.id,
        title="Test",
        message="Body",
        severity="info",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        is_read=False,
    )
    db_session.add(event)
    db_session.flush()

    count = main._sync_unread_notification_count("badge-user", session=db_session)
    badges = main._navigation_badges("badge-user", session=db_session)
    assert badges["notifications"] == count == 1
    assert badges["drafts"] >= 1
    assert badges["count"] == badges["notifications"]


@pytest.mark.postgres
def test_navigation_badges_postgres(orm_session):
    main.notification_counts.clear()

    user = models.User(
        username="pg-badge",
        password_hash=main.hash_password("pw"),
        role="user",
    )
    orm_session.add(user)
    orm_session.flush()

    orm_session.add(models.Note(status="draft"))
    event = models.NotificationEvent(
        event_id="pg-evt-1",
        user_id=user.id,
        title="Postgres",
        message="Badge",
        severity="info",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        is_read=False,
    )
    orm_session.add(event)
    orm_session.flush()

    count = main._sync_unread_notification_count("pg-badge", session=orm_session)
    badges = main._navigation_badges("pg-badge", session=orm_session)
    assert badges["notifications"] == count == 1
    assert badges["drafts"] >= 1
