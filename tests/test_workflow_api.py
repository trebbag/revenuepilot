import sqlite3
from typing import Dict, Any

import pytest
from fastapi.testclient import TestClient

import backend.main as main
from backend.main import _init_core_tables


@pytest.fixture
def client(monkeypatch):
    main.db_conn = sqlite3.connect(":memory:", check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    _init_core_tables(main.db_conn)
    password = main.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("alice", password, "user"),
    )
    main.db_conn.commit()
    monkeypatch.setattr(main, "db_conn", main.db_conn)
    return TestClient(main.app)


def auth_header(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def unwrap(response_json: Dict[str, Any]) -> Dict[str, Any]:
    data = response_json
    nested = data.get("data") if isinstance(data, dict) else None
    if isinstance(nested, dict):
        return nested
    return data


def test_workflow_session_lifecycle(client):
    token = main.create_token("alice", "user")
    headers = auth_header(token)

    # When no session exists, selected codes fall back to stored state.
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

    # Questions endpoint should also return empty when the encounter has no session.
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
    # The revenue summary should include the CPT code we provided.
    assert session_data["reimbursementSummary"]["total"] == pytest.approx(75.0)
    # A question should be generated from the documented gap/compliance issue.
    assert session_data["patientQuestions"], "Expected auto-generated patient questions"
    question_id = session_data["patientQuestions"][0]["id"]

    # Fetching the session should return the same normalized payload.
    resp = client.get(f"/api/v1/workflow/sessions/{session_id}", headers=headers)
    assert resp.status_code == 200
    fetched = unwrap(resp.json())
    assert fetched["sessionId"] == session_id
    assert fetched["stepStates"][0]["status"] == "in_progress"

    # Update step 2 to completed with a blocking issue note.
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

    # Add an additional code, then update and delete it to exercise code management endpoints.
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

    # Update the note content which triggers validation and session persistence.
    resp = client.put(
        f"/api/v1/notes/encounter-1/content",
        json={
            "sessionId": session_id,
            "encounterId": "encounter-1",
            "noteId": "note-1",
            "content": "Short note",  # forces validation issues
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
    assert not validation["canFinalize"]
    assert "Content too short" in validation["issues"]["content"]
    assert "Invalid code 123" in validation["issues"]["codes"]
    assert note_response["session"]["blockingIssues"]

    # Patient questions lifecycle: answer and then update status separately.
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

    # Attestation and dispatch complete the workflow while surfacing outstanding issues.
    resp = client.post(
        f"/api/v1/workflow/{session_id}/step5/attest",
        json={"attestedBy": "alice", "statement": "I attest."},
        headers=headers,
    )
    assert resp.status_code == 200
    attest_payload = unwrap(resp.json())["session"]
    assert attest_payload["stepStates"][4]["status"] == "completed"

    resp = client.post(
        f"/api/v1/workflow/{session_id}/step6/dispatch",
        json={"destination": "ehr", "deliveryMethod": "api"},
        headers=headers,
    )
    assert resp.status_code == 200
    dispatch_payload = unwrap(resp.json())
    assert dispatch_payload["result"]["exportReady"] is False
    assert "prevention" in dispatch_payload["result"]["issues"]

    # Fetch questions via encounter to ensure resolved status persists.
    resp = client.get("/api/v1/questions/encounter-1", headers=headers)
    assert resp.status_code == 200
    questions_payload = unwrap(resp.json())
    assert questions_payload["sessionId"] == session_id
    assert any(q["status"] == "dismissed" for q in questions_payload["questions"])

    # Deleting the session removes it from persistence but retains summary counts for analytics.
    resp = client.delete(f"/api/v1/workflow/sessions/{session_id}", headers=headers)
    assert resp.status_code == 200
    assert unwrap(resp.json()) == {"status": "ended", "sessionId": session_id}

    resp = client.get("/api/v1/codes/selected/encounter-1", headers=headers)
    assert resp.status_code == 200
    fallback_payload = unwrap(resp.json())
    assert fallback_payload["sessionId"] is None
    assert isinstance(fallback_payload["reimbursementSummary"], dict)
    assert fallback_payload["reimbursementSummary"]["total"] >= 0.0

    # Session retrieval should now return 404.
    resp = client.get(f"/api/v1/workflow/sessions/{session_id}", headers=headers)
    assert resp.status_code == 404
