import time

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import backend.main as main
from backend.ws_codes import CodesDeltaStream
from backend.ws_compliance import ComplianceDeltaStream


@pytest.fixture(autouse=True)
def reset_streams(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "codes_stream", CodesDeltaStream())
    monkeypatch.setattr(main, "compliance_stream", ComplianceDeltaStream())


def _auth_headers() -> dict[str, str]:
    token = main.create_token("alice", "user")
    return {"Authorization": f"Bearer {token}"}


def test_ws_codes_requires_authentication() -> None:
    with TestClient(main.app) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/codes?encounterId=E-1"):
                pass


def test_codes_stream_delivers_deltas() -> None:
    with TestClient(main.app) as client:
        headers = _auth_headers()
        with client.websocket_connect("/ws/codes?encounterId=E-42", headers=headers) as ws:
            handshake = ws.receive_json()
            assert handshake == {
                "event": "connected",
                "channel": "codes",
                "encounterId": "E-42",
            }

            client.portal.call(
                main.codes_stream.publish,
                "E-42",
                {
                    "type": "suggested",
                    "codes": [
                        {
                            "code": "E11.9",
                            "title": "Type 2 diabetes mellitus",
                            "confidence": 0.91,
                        }
                    ],
                },
            )

            suggestion = ws.receive_json()
            assert suggestion["eventId"] == 1
            assert suggestion["type"] == "suggested"
            assert suggestion["codes"][0]["code"] == "E11.9"

            start = time.perf_counter()
            client.portal.call(
                main.codes_stream.publish,
                "E-42",
                {
                    "type": "selected",
                    "codes": [
                        {
                            "code": "Z79.899",
                            "title": "Other long term drug therapy",
                            "reason": "Found in med list",
                        }
                    ],
                },
            )
            selection = ws.receive_json()
            duration = time.perf_counter() - start
            assert duration >= 0.49
            assert selection["eventId"] == 2
            assert selection["type"] == "selected"

        with client.websocket_connect("/ws/codes?encounterId=E-42", headers=headers) as ws:
            ws.receive_json()
            snapshot = ws.receive_json()
            assert snapshot["type"] == "selected"
            assert snapshot["eventId"] == 2
            assert snapshot["codes"][0]["code"] == "Z79.899"
