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


def test_suggest_endpoint_broadcasts_streams() -> None:
    with TestClient(main.app) as client:
        headers = _auth_headers()
        with client.websocket_connect("/ws/codes?encounterId=E-77", headers=headers) as codes_ws, \
            client.websocket_connect("/ws/compliance?encounterId=E-77", headers=headers) as compliance_ws:
            codes_handshake = codes_ws.receive_json()
            assert codes_handshake["channel"] == "codes"
            compliance_handshake = compliance_ws.receive_json()
            assert compliance_handshake["channel"] == "compliance"

            payload = {
                "text": "Patient with diabetes and hypertension.",
                "useOfflineMode": True,
                "encounterId": "E-77",
                "sessionId": "sess-99",
                "noteId": "note-abc",
            }
            response = client.post("/suggest", json=payload, headers=headers)
            assert response.status_code == 200
            body = response.json()

            codes_event = codes_ws.receive_json()
            assert codes_event["channel"] == "codes"
            assert codes_event["type"] == "suggestions"
            assert codes_event["encounterId"] == "E-77"
            assert codes_event.get("sessionId") == "sess-99"
            assert codes_event["codes"][0]["code"] == body["codes"][0]["code"]

            compliance_event = compliance_ws.receive_json()
            assert compliance_event["channel"] == "compliance"
            assert compliance_event["type"] == "suggestions"
            assert compliance_event["encounterId"] == "E-77"
            assert compliance_event.get("sessionId") == "sess-99"
            assert compliance_event["messages"]
            assert compliance_event["messages"][0] in body["compliance"]
