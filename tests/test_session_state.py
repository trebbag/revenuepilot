from __future__ import annotations

from uuid import uuid4

import sqlalchemy as sa

from backend import main
from backend.db import models


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_user(api_client, username: str) -> dict:
    response = api_client.post("/register", json={"username": username, "password": "pw"})
    assert response.status_code == 200, response.text
    return response.json()


def _get_user_id(db_session, username: str) -> int:
    user_id = db_session.execute(
        sa.select(models.User.id).where(models.User.username == username)
    ).scalar_one_or_none()
    assert user_id is not None
    return user_id


def test_session_state_persistence(api_client):
    username = f"sess_{uuid4().hex}"
    data = _register_user(api_client, username)
    token = data["access_token"]
    session_payload = data.get("session")
    assert session_payload is not None
    assert session_payload["panelStates"]["suggestionPanel"] is False
    assert session_payload["isSuggestionPanelOpen"] is False
    assert session_payload["selectedCodesList"] == []
    assert session_payload["addedCodes"] == []

    new_session = {
        "selectedCodes": {
            "codes": 1,
            "prevention": 0,
            "diagnoses": 2,
            "differentials": 3,
        },
        "selectedCodesList": [
            {
                "code": "99213",
                "type": "CPT",
                "category": "codes",
                "description": "Office visit",
            },
            {
                "code": "J45.909",
                "type": "ICD-10",
                "category": "diagnoses",
                "description": "Asthma, unspecified",
            },
        ],
        "addedCodes": ["99213", "J45.909"],
        "isSuggestionPanelOpen": True,
    }
    response = api_client.put(
        "/api/user/session",
        headers=_auth_header(token),
        json=new_session,
    )
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["panelStates"]["suggestionPanel"] is True
    assert updated["isSuggestionPanelOpen"] is True
    assert updated["addedCodes"] == ["99213", "J45.909"]
    assert updated["selectedCodesList"][0]["code"] == "99213"

    fetched = api_client.get(
        "/api/user/session", headers=_auth_header(token)
    ).json()
    assert fetched["selectedCodes"]["codes"] == 1
    assert fetched["panelStates"]["suggestionPanel"] is True
    assert fetched["isSuggestionPanelOpen"] is True
    assert fetched["addedCodes"] == ["99213", "J45.909"]
    assert [item["code"] for item in fetched["selectedCodesList"]] == [
        "99213",
        "J45.909",
    ]

    login_response = api_client.post(
        "/login", json={"username": username, "password": "pw"}
    )
    assert login_response.status_code == 200
    login_session = login_response.json()["session"]
    assert login_session["panelStates"]["suggestionPanel"] is True
    assert login_session["isSuggestionPanelOpen"] is True
    assert login_session["addedCodes"] == ["99213", "J45.909"]
    assert [item["code"] for item in login_session["selectedCodesList"]] == [
        "99213",
        "J45.909",
    ]


def test_session_state_legacy_row_hydration(api_client, db_session):
    username = f"legacy_{uuid4().hex}"
    token = _register_user(api_client, username)["access_token"]
    user_id = _get_user_id(db_session, username)

    legacy_payload = {
        "selectedCodes": {"codes": "4"},
        "panelStates": {"suggestionPanel": 1},
    }
    state = db_session.get(models.SessionState, user_id)
    if state is None:
        state = models.SessionState(user_id=user_id, data={})
        db_session.add(state)
        db_session.flush()
    state.data = legacy_payload
    db_session.commit()

    fetched = api_client.get(
        "/api/user/session", headers=_auth_header(token)
    )
    assert fetched.status_code == 200
    data = fetched.json()
    assert data["isSuggestionPanelOpen"] is True
    assert data["panelStates"]["suggestionPanel"] is True
    assert data["selectedCodes"]["codes"] == 4
    assert data["selectedCodes"]["diagnoses"] == 0
    assert data["selectedCodesList"] == []
    assert data["addedCodes"] == []

    db_session.expire_all()
    stored = db_session.get(models.SessionState, user_id)
    assert stored is not None
    stored_data = stored.data or {}
    assert stored_data["isSuggestionPanelOpen"] is True
    assert stored_data["panelStates"]["suggestionPanel"] is True
    assert stored_data.get("selectedCodesList", []) == []
    assert stored_data.get("addedCodes", []) == []


def test_session_state_partial_update_preserves_existing_fields(api_client, db_session):
    username = f"partial_{uuid4().hex}"
    token = _register_user(api_client, username)["access_token"]
    user_id = _get_user_id(db_session, username)

    initial_state = main._normalize_session_state(
        {
            "selectedCodes": {"codes": 2, "diagnoses": 1},
            "selectedCodesList": [
                {
                    "code": "11111",
                    "type": "CPT",
                    "category": "codes",
                    "description": "Example code",
                }
            ],
            "addedCodes": ["11111"],
            "currentNote": {"id": 42},
            "panelStates": {"suggestionPanel": False},
        }
    )
    state = db_session.get(models.SessionState, user_id)
    if state is None:
        state = models.SessionState(user_id=user_id, data={})
        db_session.add(state)
    state.data = initial_state
    db_session.commit()

    payload = {"isSuggestionPanelOpen": True}
    response = api_client.put(
        "/api/user/session",
        headers=_auth_header(token),
        json=payload,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["currentNote"] == {"id": 42}
    assert data["panelStates"]["suggestionPanel"] is True
    assert data["isSuggestionPanelOpen"] is True
    assert data["addedCodes"] == ["11111"]
    assert [item["code"] for item in data["selectedCodesList"]] == ["11111"]

    fetched = api_client.get(
        "/api/user/session", headers=_auth_header(token)
    ).json()
    assert fetched["currentNote"] == {"id": 42}
    assert fetched["panelStates"]["suggestionPanel"] is True
    assert fetched["addedCodes"] == ["11111"]


def test_session_state_finalization_sessions_roundtrip(api_client, db_session):
    username = f"final_{uuid4().hex}"
    token = _register_user(api_client, username)["access_token"]
    user_id = _get_user_id(db_session, username)

    session_id = f"session-{uuid4().hex}"
    selected_codes = [
        {
            "code": "99213",
            "type": "CPT",
            "category": "codes",
            "description": "Office visit, established patient",
            "docSupport": ["exam"],
        },
        {
            "code": "J45.909",
            "type": "ICD-10",
            "category": "diagnoses",
            "description": "Unspecified asthma, uncomplicated",
            "aiReasoning": "Matches documented diagnosis",
        },
    ]
    final_session = {
        "sessionId": session_id,
        "encounterId": "enc-123",
        "patientId": "patient-999",
        "noteId": "note-42",
        "noteContent": "Finalized clinical note",
        "selectedCodes": selected_codes,
        "complianceIssues": [
            {
                "id": "issue-1",
                "title": "Missing attestation",
                "description": "Attestation section incomplete",
                "severity": "high",
                "category": "documentation",
            }
        ],
        "stepStates": [
            {
                "step": 1,
                "status": "completed",
                "progress": 100,
                "startedAt": "2024-01-01T10:00:00Z",
                "completedAt": "2024-01-01T10:05:00Z",
                "updatedAt": "2024-01-01T10:05:00Z",
                "notes": "Intake complete",
                "blockingIssues": ["verify-docs"],
            }
        ],
        "reimbursementSummary": {"total": 125.0},
        "patientMetadata": {"patientId": "patient-999", "name": "Jane Doe"},
        "patientQuestions": [
            {"id": 7, "question": "Any medication changes?", "status": "open"}
        ],
        "transcriptEntries": [{"id": 1, "text": "Patient is feeling better."}],
        "lastValidation": {"status": "ok"},
    }
    payload = {
        "selectedCodes": {
            "codes": 1,
            "diagnoses": 1,
            "prevention": 0,
            "differentials": 0,
        },
        "selectedCodesList": selected_codes,
        "addedCodes": ["99213", "J45.909"],
        "isSuggestionPanelOpen": True,
        "finalizationSessions": {session_id: final_session},
    }

    response = api_client.put(
        "/api/user/session",
        headers=_auth_header(token),
        json=payload,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert session_id in body["finalizationSessions"]
    stored_session = body["finalizationSessions"][session_id]
    assert stored_session["sessionId"] == session_id
    assert stored_session["selectedCodes"][0]["code"] == "99213"
    assert stored_session["selectedCodes"][1]["category"] == "diagnoses"
    assert stored_session["stepStates"]["1"]["status"] == "completed"
    assert stored_session["patientMetadata"]["patientId"] == "patient-999"
    assert stored_session["patientQuestions"][0]["question"] == "Any medication changes?"
    assert stored_session["transcriptEntries"][0]["text"] == "Patient is feeling better."
    assert body["selectedCodesList"][0]["docSupport"] == ["exam"]

    fetched = api_client.get(
        "/api/user/session", headers=_auth_header(token)
    ).json()
    assert session_id in fetched["finalizationSessions"]
    fetched_session = fetched["finalizationSessions"][session_id]
    assert fetched_session["stepStates"]["1"]["status"] == "completed"
    assert fetched_session["selectedCodes"][0]["code"] == "99213"
    assert (
        fetched["selectedCodesList"][1]["aiReasoning"]
        == "Matches documented diagnosis"
    )

    db_session.expire_all()
    stored_row = db_session.get(models.SessionState, user_id)
    assert stored_row is not None
    persisted = stored_row.data or {}
    assert session_id in persisted.get("finalizationSessions", {})
    persisted_session = persisted["finalizationSessions"][session_id]
    assert persisted_session["stepStates"]["1"]["status"] == "completed"
    assert persisted_session["selectedCodes"][0]["code"] == "99213"
