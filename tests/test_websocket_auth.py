import asyncio
import sqlite3

import pytest
from starlette.datastructures import Headers, QueryParams, URL

from backend import main, migrations


class FakeWebSocket:
    def __init__(
        self,
        *,
        auth_header: str | None = None,
        query_token: str | None = None,
        protocols: list[str] | None = None,
    ) -> None:
        self.headers = Headers({})
        if auth_header:
            self.headers = Headers({"Authorization": auth_header})
        self.query_params = QueryParams({})
        if query_token is not None:
            self.query_params = QueryParams({"token": query_token})
        self.scope = {"subprotocols": protocols or []}
        self.client = type("Client", (), {"host": "testclient"})()
        self.url = URL("ws://testserver/ws/notifications")
        self.closed_code: int | None = None

    async def close(self, code: int = 1000) -> None:
        self.closed_code = code


def _setup_db(monkeypatch: pytest.MonkeyPatch) -> None:
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)"
    )
    migrations.ensure_notifications_table(db)
    migrations.ensure_notification_counters_table(db)
    pwd = main.hash_password("pw")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?,?,?)",
        ("alice", pwd, "user"),
    )
    db.commit()
    monkeypatch.setattr(main, "db_conn", db)
    main.notification_service.update_connection(db)


def test_ws_require_role_accepts_query_token(monkeypatch: pytest.MonkeyPatch) -> None:
    _setup_db(monkeypatch)
    token = main.create_token("alice", "user")
    ws = FakeWebSocket(query_token=token)

    data = asyncio.run(main.ws_require_role(ws, "user"))
    assert data["sub"] == "alice"
    assert ws.closed_code is None


def test_ws_require_role_accepts_subprotocol(monkeypatch: pytest.MonkeyPatch) -> None:
    _setup_db(monkeypatch)
    token = main.create_token("alice", "user")
    ws = FakeWebSocket(protocols=["authorization", f"Bearer {token}"])

    data = asyncio.run(main.ws_require_role(ws, "user"))
    assert data["sub"] == "alice"
    assert ws.closed_code is None
