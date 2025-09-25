import sqlite3
from fastapi.testclient import TestClient

import sqlite3
from collections import defaultdict, deque
from fastapi.testclient import TestClient

import backend.main as main


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def setup_module(module):
    # ensure in-memory db; transcribe endpoint doesn't touch DB but required for app
    main.db_conn = sqlite3.connect(":memory:", check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    main.transcript_history = defaultdict(lambda: deque(maxlen=main.TRANSCRIPT_HISTORY_LIMIT))


def test_get_last_transcript_empty():
    client = TestClient(main.app)
    token = main.create_token("alice", "user")
    resp = client.get("/transcribe", headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json() == {"history": []}


def test_transcribe_updates_last_transcript(monkeypatch):
    client = TestClient(main.app)
    token = main.create_token("alice", "user")
    monkeypatch.setattr(main, "simple_transcribe", lambda b, language=None: "hi")
    resp = client.post(
        "/transcribe",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["provider"] == "hi"

    resp2 = client.get("/transcribe", headers=auth_header(token))
    assert resp2.json() == {
        "history": [
            {
                "provider": "hi",
                "patient": "",
                "segments": [
                    {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "hi"}
                ],
            }
        ]
    }


def test_transcribe_stream_interim_and_final():
    client = TestClient(main.app)
    token = main.create_token("alice", "user")

    with client.websocket_connect(
        "/api/transcribe/stream", headers=auth_header(token)
    ) as ws:
        handshake = ws.receive_json()
        assert handshake["event"] == "connected"
        assert handshake["sessionId"].startswith("ws-")

        ws.send_json({"event": "start"})
        ws.send_bytes(b"hello world")

        interim = ws.receive_json()
        assert interim["isInterim"] is True
        assert interim["speakerLabel"] == "unknown"
        assert "hello world" in interim["transcript"]
        assert interim["eventId"].startswith(handshake["sessionId"])

        ws.send_json({"event": "stop"})
        final = ws.receive_json()
        assert final["isInterim"] is False
        assert final["speakerLabel"] == "unknown"
        assert final["transcript"] == interim["transcript"]
        assert final["eventId"] != interim["eventId"]
