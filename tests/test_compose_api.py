import asyncio
import json
import time
from typing import Any, Dict

import pytest

import backend.main as main
import backend.db.models as db_models


def _auth_header(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _unwrap(data: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(data, dict) and isinstance(data.get("data"), dict):
        return data["data"]
    return data


@pytest.fixture
def compose_user(db_session):
    user = db_models.User(
        username="alice",
        password_hash=main.hash_password("pw"),
        role="user",
    )
    db_session.add(user)
    db_session.commit()
    return user


def _create_session(client, token: str) -> Dict[str, Any]:
    headers = _auth_header(token)
    payload = {
        "encounterId": "enc-compose",
        "patientId": "patient-compose",
        "noteId": "note-compose",
        "noteContent": "Patient reports intermittent chest pain with exertion. Detailed exam recorded.",
        "patientMetadata": {
            "name": "Rivka Doe",
            "age": 68,
            "sex": "F",
            "encounterDate": "2024-03-01",
            "preventionItems": ["Colorectal screening documented"],
            "diagnoses": ["Hypertension"],
            "differentials": ["Rule out myocardial infarction"],
            "complianceChecks": ["HIPAA compliance reviewed"],
        },
        "selectedCodes": [
            {
                "id": "code-1",
                "code": "99213",
                "category": "procedure",
                "description": "Established patient office visit",
            }
        ],
        "transcriptEntries": [
            {"id": 1, "text": "Patient denies shortness of breath", "speaker": "clinician"},
            {"id": 2, "text": "Encourage lifestyle modifications", "speaker": "clinician"},
        ],
    }
    resp = client.post("/api/v1/workflow/sessions", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    session = _unwrap(resp.json())
    assert session["sessionId"]
    return session


def _start_compose(client, token: str, session: Dict[str, Any], **overrides: Any) -> Dict[str, Any]:
    headers = _auth_header(token)
    compose_payload: Dict[str, Any] = {
        "sessionId": session["sessionId"],
        "noteContent": session.get("noteContent"),
        "patientMetadata": session.get("patientMetadata", {}),
        "selectedCodes": session.get("selectedCodes", []),
        "transcript": session.get("transcriptEntries", []),
    }
    compose_payload.update(overrides)
    resp = client.post("/api/compose/start", json=compose_payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _poll_until_complete(client, token: str, compose_id: int, *, timeout: float = 5.0) -> Dict[str, Any]:
    headers = _auth_header(token)
    deadline = time.time() + timeout
    last_payload: Dict[str, Any] | None = None
    while time.time() < deadline:
        resp = client.get(f"/api/compose/{compose_id}", headers=headers)
        assert resp.status_code == 200, resp.text
        payload = resp.json()
        last_payload = payload
        status = payload.get("status")
        if status not in {"queued", "in_progress"}:
            return payload
        try:
            loop = asyncio.get_event_loop()
            loop.run_until_complete(asyncio.sleep(0.05))
        except RuntimeError:
            time.sleep(0.05)
    assert last_payload is not None
    raise AssertionError(f"compose job {compose_id} did not complete: {json.dumps(last_payload)}")


def _compose_events() -> list[Dict[str, Any]]:
    rows = list(
        main.db_conn.execute(
            "SELECT eventType, details FROM events WHERE eventType LIKE 'compose_%' ORDER BY id"
        )
    )
    events: list[Dict[str, Any]] = []
    for row in rows:
        detail = row["details"]
        parsed = json.loads(detail) if isinstance(detail, str) else detail
        events.append({"eventType": row["eventType"], "details": parsed})
    return events


def test_compose_job_completes_successfully(api_client, compose_user):
    client = api_client
    token = main.create_token(compose_user.username, compose_user.role)

    session = _create_session(client, token)
    start_payload = _start_compose(client, token, session)
    compose_id = start_payload["composeId"]
    assert compose_id
    assert start_payload["status"] == "queued"

    result = _poll_until_complete(client, token, compose_id)
    assert result["status"] == "completed"
    assert result.get("validation", {}).get("ok") is True
    assert "beautifiedNote" in result.get("result", {})
    assert result.get("result", {}).get("patientSummary")

    events = _compose_events()
    event_types = [event["eventType"] for event in events]
    assert "compose_started" in event_types
    assert "compose_completed" in event_types


def test_compose_job_uses_offline_fallback(api_client, compose_user, monkeypatch):
    client = api_client
    token = main.create_token(compose_user.username, compose_user.role)

    session = _create_session(client, token)

    from backend import compose_job as compose_module

    offline_called = {"count": 0}

    def fake_offline_beautify(note: str, *_args, **_kwargs) -> str:
        offline_called["count"] += 1
        return f"OFFLINE::{note.strip()}"

    def raise_openai(*_args, **_kwargs):
        raise RuntimeError("openai unavailable")

    monkeypatch.setattr("backend.offline_model.beautify", fake_offline_beautify)
    monkeypatch.setattr(compose_module, "call_openai", raise_openai)

    start_payload = _start_compose(client, token, session, useOfflineMode=True)
    compose_id = start_payload["composeId"]

    result = _poll_until_complete(client, token, compose_id)

    assert result["status"] == "completed"
    assert result.get("result", {}).get("mode") == "offline"
    assert result.get("result", {}).get("beautifiedNote", "").startswith("OFFLINE::")
    assert offline_called["count"] >= 1


def test_compose_job_validation_failure(api_client, compose_user):
    client = api_client
    token = main.create_token(compose_user.username, compose_user.role)

    session = _create_session(client, token)

    session["noteContent"] = "Too short"
    session["selectedCodes"] = [{"code": "BAD", "category": "procedure"}]
    start_payload = _start_compose(client, token, session)
    compose_id = start_payload["composeId"]

    result = _poll_until_complete(client, token, compose_id)
    assert result["status"] in {"blocked", "failed"}
    validation = result.get("validation") or {}
    assert validation.get("ok") is False
    issues = validation.get("issues") or {}
    assert issues.get("content")
    assert issues.get("codes")

    events = _compose_events()
    event_types = [event["eventType"] for event in events]
    assert "compose_failed" in event_types


def test_compose_job_can_be_cancelled(api_client, compose_user, monkeypatch):
    client = api_client
    token = main.create_token(compose_user.username, compose_user.role)

    session = _create_session(client, token)

    from backend import compose_job as compose_module

    async def slow_beautify(self, note: str, job):  # type: ignore[override]
        await asyncio.sleep(0.2)
        return note, "remote"

    monkeypatch.setattr(compose_module.ComposePipeline, "_beautify", slow_beautify)

    start_payload = _start_compose(client, token, session)
    compose_id = start_payload["composeId"]

    headers = _auth_header(token)

    time.sleep(0.05)
    resp = client.post(f"/api/compose/{compose_id}/cancel", headers=headers)
    assert resp.status_code == 200, resp.text
    cancel_payload = resp.json()
    assert cancel_payload["status"] == "cancelled"

    result = _poll_until_complete(client, token, compose_id)
    assert result["status"] == "cancelled"

    events = _compose_events()
    assert any(event["eventType"] == "compose_cancelled" for event in events)
