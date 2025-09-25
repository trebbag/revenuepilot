import time
from typing import Any, Dict

import pytest

import backend.main as main
import backend.db.models as db_models


@pytest.fixture
def client(api_client, db_session):
    password = main.hash_password("pw")
    db_session.execute(
        db_models.users.insert().values(username="alice", password_hash=password, role="user")
    )
    db_session.commit()
    return api_client


@pytest.fixture
def create_user(db_session):
    def _create(username: str, role: str = "user") -> db_models.User:
        user = db_models.User(
            username=username,
            password_hash=main.hash_password("pw"),
            role=role,
        )
        db_session.add(user)
        db_session.commit()
        return user

    return _create



def auth_header(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def unwrap(response_json: Dict[str, Any]) -> Dict[str, Any]:
    data = response_json
    nested = data.get("data") if isinstance(data, dict) else None
    if isinstance(nested, dict):
        return nested
    return data


def test_workflow_session_lifecycle(api_client, create_user):
    create_user("alice")
    client = api_client
    token = main.create_token("alice", "user")
    headers = auth_header(token)

    resp = client.get("/api/v1/codes/selected/encounter-1", headers=headers)
    assert resp.status_code == 200
    payload = unwrap(resp.json())
    assert payload == {
        "encounterId": "encounter-1",
        "sessionId": None,
        "codes": [],
        "reimbursementSummary": {"total": 0.0, "codes": []},
        "complianceIssues": [],
    }

    resp = client.get("/api/v1/questions/encounter-1", headers=headers)
    assert resp.status_code == 200
    questions_initial = unwrap(resp.json())
    assert questions_initial["questions"] == []
    assert questions_initial["sessionId"] is None

    initial_payload = {
        "encounterId": "encounter-1",
        "patientId": "patient-7",
        "noteId": "note-1",
        "noteContent": "Patient seen for cough and diabetes management plan with follow-up.",
        "patientMetadata": {
            "name": "Rivka Doe",
            "age": 68,
            "sex": "F",
            "encounterDate": "2024-03-01",
        },
        "selectedCodes": [
            {
                "id": "proc-1",
                "code": "99213",
                "category": "procedure",
                "description": "Established patient office visit",
                "gaps": ["Document follow up plan"],
            },
            {
                "id": "diag-1",
                "code": "E11.9",
                "category": "diagnosis",
                "description": "Type 2 diabetes mellitus without complications",
            },
        ],
        "complianceIssues": [
            {
                "id": "comp-1",
                "title": "ROS missing",
                "severity": "high",
                "description": "Document a full review of systems",
            }
        ],
    }

    resp = client.post("/api/v1/workflow/sessions", json=initial_payload, headers=headers)
    assert resp.status_code == 200
    session_data = unwrap(resp.json())
    session_id = session_data["sessionId"]
    assert session_id
    assert session_data["encounterId"] == "encounter-1"
    assert session_data["patientMetadata"]["name"] == "Rivka Doe"
    assert session_data["createdBy"] == "alice"
    assert session_data["lastUpdatedBy"] == "alice"
    assert any(collab["userId"] == "alice" for collab in session_data["collaborators"])
    assert session_data["auditTrail"] and session_data["auditTrail"][0]["actor"] == "alice"
    assert session_data["reimbursementSummary"]["total"] == pytest.approx(75.0)
    assert session_data["patientQuestions"], "Expected auto-generated patient questions"
    question_id = session_data["patientQuestions"][0]["id"]

    resp = client.get(f"/api/v1/workflow/sessions/{session_id}", headers=headers)
    assert resp.status_code == 200
    fetched = unwrap(resp.json())
    assert fetched["sessionId"] == session_id
    assert fetched["stepStates"][0]["status"] == "in_progress"

    resp = client.put(
        f"/api/v1/workflow/sessions/{session_id}/step",
        json={
            "step": 2,
            "status": "completed",
            "progress": 100,
            "notes": "History reviewed",
            "blockingIssues": ["Awaiting lab results"],
        },
        headers=headers,
    )
    assert resp.status_code == 200
    updated_session = unwrap(resp.json())
    assert updated_session["stepStates"][1]["status"] == "completed"
    assert "Awaiting lab results" in updated_session["blockingIssues"]

    resp = client.post(
        "/api/v1/codes/selected",
        json={
            "sessionId": session_id,
            "encounterId": "encounter-1",
            "code": "99215",
            "description": "Extended visit",
            "category": "procedure",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    after_add = unwrap(resp.json())
    assert any(code["code"] == "99215" for code in after_add["selectedCodes"])

    new_code_id = next(code["id"] for code in after_add["selectedCodes"] if code["code"] == "99215")
    resp = client.put(
        f"/api/v1/codes/selected/{new_code_id}",
        json={
            "sessionId": session_id,
            "code": "99215",
            "status": "confirmed",
            "confidence": 0.9,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    after_update = unwrap(resp.json())
    updated_entry = next(code for code in after_update["selectedCodes"] if code["code"] == "99215")
    assert updated_entry["status"] == "confirmed"
    assert updated_entry["confidence"] == 0.9

    resp = client.delete(
        f"/api/v1/codes/selected/{new_code_id}",
        params={"sessionId": session_id},
        headers=headers,
    )
    assert resp.status_code == 200
    after_delete = unwrap(resp.json())
    assert all(code["code"] != "99215" for code in after_delete["selectedCodes"])

    resp = client.put(
        f"/api/v1/notes/encounter-1/content",
        json={
            "sessionId": session_id,
            "encounterId": "encounter-1",
            "noteId": "note-1",
            "content": "Short note",
            "codes": ["99213", "123"],
            "prevention": [],
            "diagnoses": [],
            "differentials": [],
            "compliance": [],
        },
        headers=headers,
    )
    assert resp.status_code == 200
    note_response = unwrap(resp.json())
    assert note_response["sessionId"] == session_id
    validation = note_response["validation"]
    assert "Content too short" in validation["issues"]["content"]
    assert "Invalid code 123" in validation["issues"]["codes"]
    assert note_response["session"]["blockingIssues"]
    assert note_response["session"]["lastUpdatedBy"] == "alice"

    resp = client.post(
        f"/api/v1/questions/{question_id}/answer",
        json={"sessionId": session_id, "answer": "Provided follow-up details."},
        headers=headers,
    )
    assert resp.status_code == 200
    answered = unwrap(resp.json())["question"]
    assert answered["status"] == "resolved"
    assert answered["answer"] == "Provided follow-up details."

    resp = client.put(
        f"/api/v1/questions/{question_id}/status",
        json={"sessionId": session_id, "status": "dismissed"},
        headers=headers,
    )
    assert resp.status_code == 200
    dismissed = unwrap(resp.json())["question"]
    assert dismissed["status"] == "dismissed"

    resp = client.post(
        f"/api/v1/workflow/{session_id}/step5/attest",
        json={
            "attestedBy": "alice",
            "statement": "I attest.",
            "ip": "198.51.100.7",
            "payerChecklist": [
                {"id": "code-1", "label": "99213", "status": "ready"},
                {"id": "warning-1", "label": "Follow-up plan", "status": "warning"},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 200
    attestation_response = unwrap(resp.json())
    assert attestation_response["canFinalize"] is False
    recap = attestation_response["recap"]
    assert recap["attestedBy"] == "alice"
    assert recap["statement"] == "I attest."
    assert isinstance(recap.get("payerChecklist"), list)
    assert recap["payerChecklist"][0]["status"] == "ready"
    attest_payload = attestation_response["session"]
    assert attest_payload["stepStates"][4]["status"] == "completed"

    resp = client.post(
        f"/api/v1/workflow/{session_id}/step6/dispatch",
        json={"destination": "ehr", "deliveryMethod": "api"},
        headers=headers,
    )
    assert resp.status_code == 200
    dispatch_payload = unwrap(resp.json())
    assert dispatch_payload["destination"] == "ehr"
    assert dispatch_payload["status"] == "completed"
    assert dispatch_payload["result"]["exportReady"] is False
    assert "prevention" in dispatch_payload["result"]["issues"]


def test_workflow_session_context_roundtrip(api_client, create_user):
    create_user("alice")
    client = api_client
    token = main.create_token("alice", "user")
    headers = auth_header(token)

    collaborator_payload = [
        {"userId": "alice", "displayName": "Dr. Alice", "status": "active"},
        {"username": "mentor", "role": "analyst", "lastActiveAt": time.time() - 30},
    ]
    editor_payload = [
        {"userId": "mentor", "cursor": {"line": 1, "column": 5}},
        {"userId": "observer", "cursor": {"line": 0, "column": 0}},
    ]
    context_payload = {
        "transcript": {"summary": "Patient reported improved symptoms."},
        "draftPreview": "Lorem ipsum",
    }

    resp = client.post(
        "/api/v1/workflow/sessions",
        json={
            "encounterId": "enc-ctx",
            "patientId": "patient-ctx",
            "noteId": "note-ctx",
            "noteContent": "Initial note",
            "context": context_payload,
            "collaborators": collaborator_payload,
            "activeEditors": editor_payload,
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.json()
    created = unwrap(resp.json())
    session_id = created["sessionId"]
    assert created["context"]["transcript"]["summary"].startswith("Patient")
    assert any(entry["userId"] == "mentor" for entry in created["collaborators"])
    assert any(entry["userId"] == "observer" for entry in created["activeEditors"])

    resp = client.post(
        "/api/v1/workflow/sessions",
        json={
            "sessionId": session_id,
            "encounterId": "enc-ctx",
            "context": {"recentDecisions": ["Follow-up in 2 weeks"]},
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.json()
    updated = unwrap(resp.json())
    assert updated["context"]["transcript"]["summary"].startswith("Patient")
    assert updated["context"]["recentDecisions"] == ["Follow-up in 2 weeks"]

    resp = client.get(f"/api/v1/workflow/sessions/{session_id}", headers=headers)
    assert resp.status_code == 200, resp.json()
    fetched = unwrap(resp.json())
    assert fetched["context"]["transcript"]["summary"].startswith("Patient")
    assert fetched["context"]["recentDecisions"] == ["Follow-up in 2 weeks"]


def test_workflow_session_tracks_collaboration_and_audit(api_client, create_user):
    create_user("alice")
    client = api_client
    token = main.create_token("alice", "user")
    headers = auth_header(token)
    create_payload = {
        "encounterId": "collab-encounter",
        "patientId": "patient-123",
        "noteId": "note-collab",
        "noteContent": "Comprehensive documentation for collaboration testing.",
        "context": {"source": "wizard", "transcriptId": "tx-1"},
        "selectedCodes": [
            {"code": "99213", "category": "procedure", "description": "Established patient visit"}
        ],
        "complianceIssues": [
            {
                "id": "ci-collab",
                "title": "Document shared decision making",
                "severity": "warning",
                "details": "Include shared decision making note",
            }
        ],
    }

    resp = client.post("/api/v1/workflow/sessions", json=create_payload, headers=headers)
    assert resp.status_code == 200
    session_payload = unwrap(resp.json())
    session_id = session_payload["sessionId"]
    assert session_payload["createdBy"] == "alice"
    assert session_payload["lastUpdatedBy"] == "alice"
    assert session_payload["context"]["source"] == "wizard"
    assert any(entry["userId"] == "alice" for entry in session_payload["collaborators"])
    assert session_payload["auditTrail"] and session_payload["auditTrail"][0]["actor"] == "alice"
    assert session_payload["patientQuestions"], "Expected compliance-driven question generation"
    question_id = session_payload["patientQuestions"][0]["id"]

    resp = client.put(
        f"/api/v1/questions/{question_id}/status",
        json={"sessionId": session_id, "status": "dismissed"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert unwrap(resp.json())["question"]["status"] == "dismissed"

    create_user("bob")
    token_bob = main.create_token("bob", "user")
    headers_bob = auth_header(token_bob)

    resp = client.put(
        f"/api/v1/workflow/sessions/{session_id}/step",
        json={"step": 2, "status": "in_progress", "progress": 25},
        headers=headers_bob,
    )
    assert resp.status_code == 200
    updated_session = unwrap(resp.json())
    assert updated_session["lastUpdatedBy"] == "bob"
    assert any(entry["userId"] == "bob" for entry in updated_session["collaborators"])
    assert any(editor["userId"] == "bob" for editor in updated_session["activeEditors"])
    assert updated_session["auditTrail"] and updated_session["auditTrail"][-1]["actor"] == "bob"

    resp = client.get("/api/v1/questions/collab-encounter", headers=headers)
    assert resp.status_code == 200
    questions_payload = unwrap(resp.json())
    assert questions_payload["sessionId"] == session_id
    assert any(q["status"] == "dismissed" for q in questions_payload["questions"])

    resp = client.get("/api/v1/questions/collab-encounter", headers=headers_bob)
    assert resp.status_code == 200
    collaborator_questions = unwrap(resp.json())
    assert collaborator_questions["sessionId"] == session_id
    assert any(q["status"] == "dismissed" for q in collaborator_questions["questions"])

    resp = client.delete(f"/api/v1/workflow/sessions/{session_id}", headers=headers)
    assert resp.status_code == 200
    assert unwrap(resp.json()) == {"status": "ended", "sessionId": session_id}

    resp = client.get("/api/v1/codes/selected/encounter-1", headers=headers)
    assert resp.status_code == 200
    fallback_payload = unwrap(resp.json())
    assert fallback_payload["sessionId"] is None
    assert isinstance(fallback_payload["reimbursementSummary"], dict)
    assert fallback_payload["reimbursementSummary"]["total"] >= 0.0

    resp = client.get(f"/api/v1/workflow/sessions/{session_id}", headers=headers)
    assert resp.status_code == 404
