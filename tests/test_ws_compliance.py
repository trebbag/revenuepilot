import time

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import backend.main as main
from backend.ws_compliance import ComplianceDeltaStream
from backend.ws_codes import CodesDeltaStream


@pytest.fixture(autouse=True)
def reset_streams(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "compliance_stream", ComplianceDeltaStream())
    monkeypatch.setattr(main, "codes_stream", CodesDeltaStream())


def _auth_headers() -> dict[str, str]:
    token = main.create_token("alice", "user")
    return {"Authorization": f"Bearer {token}"}


def test_ws_compliance_requires_authentication() -> None:
    with TestClient(main.app) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/compliance?encounterId=E-1"):
                pass


def test_compliance_stream_delivers_deltas() -> None:
    with TestClient(main.app) as client:
        headers = _auth_headers()
        with client.websocket_connect("/ws/compliance?encounterId=E-42", headers=headers) as ws:
            handshake = ws.receive_json()
            assert handshake == {
                "event": "connected",
                "channel": "compliance",
                "encounterId": "E-42",
            }

            client.portal.call(
                main.compliance_stream.publish,
                "E-42",
                {
                    "type": "issues",
                    "blocking": [{"id": "C001", "title": "Chief complaint missing"}],
                    "nonBlocking": [{"id": "C101", "title": "Vitals not current"}],
                },
            )

            payload = ws.receive_json()
            assert payload["type"] == "issues"
            assert payload["channel"] == "compliance"
            assert payload["encounterId"] == "E-42"
            assert payload["eventId"] == 1
            assert payload["blocking"][0]["id"] == "C001"

            start = time.perf_counter()
            client.portal.call(
                main.compliance_stream.publish,
                "E-42",
                {"type": "status", "updatedAt": "2025-09-25T02:12:00Z"},
            )
            status_payload = ws.receive_json()
            duration = time.perf_counter() - start
            assert duration >= 0.49
            assert status_payload["type"] == "status"
            assert status_payload["eventId"] == 2

        # reconnect should replay the latest snapshot
        with client.websocket_connect("/ws/compliance?encounterId=E-42", headers=headers) as ws:
            ws.receive_json()  # connected handshake
            snapshot = ws.receive_json()
            assert snapshot["type"] == "status"
            assert snapshot["eventId"] == 2
            assert snapshot["updatedAt"] == "2025-09-25T02:12:00Z"
