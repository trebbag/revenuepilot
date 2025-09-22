import asyncio
import asyncio

import pytest
from starlette.datastructures import Headers, QueryParams, URL

from backend import main


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


def test_ws_require_role_accepts_query_token(api_client) -> None:
    main.notification_counts.clear()
    resp = api_client.post("/register", json={"username": "alice", "password": "pw"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    ws = FakeWebSocket(query_token=token)

    data = asyncio.run(main.ws_require_role(ws, "user"))
    assert data["sub"] == "alice"
    assert ws.closed_code is None


def test_ws_require_role_accepts_subprotocol(api_client) -> None:
    main.notification_counts.clear()
    resp = api_client.post("/register", json={"username": "alice", "password": "pw"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    ws = FakeWebSocket(protocols=["authorization", f"Bearer {token}"])

    data = asyncio.run(main.ws_require_role(ws, "user"))
    assert data["sub"] == "alice"
    assert ws.closed_code is None
