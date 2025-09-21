import sqlite3
import time
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
    assert session_data["createdBy"] == "alice"
    assert session_data["lastUpdatedBy"] == "alice"
    assert any(collab["userId"] == "alice" for collab in session_data["collaborators"])
    assert session_data["auditTrail"] and session_data["auditTrail"][0]["actor"] == "alice"
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
    assert note_response["session"]["lastUpdatedBy"] == "alice"

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


def test_workflow_session_context_roundtrip(client):
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


def test_workflow_session_tracks_collaboration_and_audit(client):
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

    # Introduce a collaborator and update a workflow step
    password = main.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("bob", password, "user"),
    )
    main.db_conn.commit()
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

    # Fetch questions via encounter to ensure resolved status persists.
    resp = client.get("/api/v1/questions/collab-encounter", headers=headers)
    assert resp.status_code == 200
    questions_payload = unwrap(resp.json())
    assert questions_payload["sessionId"] == session_id
    assert any(q["status"] == "dismissed" for q in questions_payload["questions"])

    # Collaborators should also receive the resolved status and session linkage.
    resp = client.get("/api/v1/questions/collab-encounter", headers=headers_bob)
    assert resp.status_code == 200
    collaborator_questions = unwrap(resp.json())
    assert collaborator_questions["sessionId"] == session_id
    assert any(q["status"] == "dismissed" for q in collaborator_questions["questions"])

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


def test_finalization_contract_payloads(client):
    token = main.create_token("alice", "user")
    headers = auth_header(token)

    initial_payload = {
        "encounterId": "encounter-contract",
        "patientId": "patient-contract",
        "noteId": "note-contract",
        "noteContent": "Patient evaluated for chronic conditions with plan for medication adjustment and follow-up in two weeks.",
        "patientMetadata": {"name": "Rivka Doe", "providerName": "Dr. Alice"},
        "selectedCodes": [
            {
                "id": "code-1",
                "code": "99213",
                "type": "CPT",
                "category": "procedure",
                "description": "Established patient visit",
            },
            {
                "id": "diag-1",
                "code": "E11.9",
                "type": "ICD-10",
                "category": "diagnosis",
                "description": "Type 2 diabetes mellitus"
            },
        ],
        "complianceIssues": [
            {
                "id": "comp-1",
                "title": "Confirm medication adherence",
                "severity": "warning",
                "details": "Document adherence discussion",
            }
        ],
    }

    resp = client.post("/api/v1/workflow/sessions", json=initial_payload, headers=headers)
    assert resp.status_code == 200
    session_payload = unwrap(resp.json())
    session_id = session_payload["sessionId"]

    note_update = {
        "sessionId": session_id,
        "encounterId": "encounter-contract",
        "noteId": "note-contract",
        "content": "Patient evaluated for diabetes and hypertension. Medication adherence reinforced and follow-up arranged in clinic.",
        "codes": ["99213"],
        "prevention": ["Lifestyle counseling provided"],
        "diagnoses": ["E11.9"],
        "differentials": ["I10"],
        "compliance": ["Documentation complete"],
    }

    resp = client.put(
        "/api/v1/notes/encounter-contract/content",
        json=note_update,
        headers=headers,
    )
    assert resp.status_code == 200
    note_data = unwrap(resp.json())
    assert note_data["validation"]["canFinalize"] is True

    attestation_payload = {
        "encounterId": "encounter-contract",
        "sessionId": session_id,
        "billing_validation": {
            "codes_validated": True,
            "documentation_level_verified": True,
            "medical_necessity_confirmed": True,
            "billing_compliance_checked": True,
            "estimated_reimbursement": 75.0,
            "payer_specific_requirements": [],
        },
        "attestation": {
            "physician_attestation": True,
            "attestation_text": "Reviewed and verified",
            "attestation_timestamp": "2024-04-01T12:00:00Z",
            "attestation_ip_address": "203.0.113.1",
            "digital_signature": "sig-123",
            "attestedBy": "Dr. Alice",
        },
        "compliance_checks": [
            {
                "check_type": "documentation_standards",
                "status": "pass",
                "description": "All documentation present",
                "required_actions": [],
            }
        ],
        "billing_summary": {
            "primary_diagnosis": "E11.9",
            "secondary_diagnoses": ["I10"],
            "procedures": ["99213"],
            "evaluation_management_level": "99213",
            "total_rvu": 2.0,
            "estimated_payment": 75.0,
            "modifier_codes": ["25"],
        },
    }

    resp = client.post(
        f"/api/v1/workflow/{session_id}/step5/attest",
        json=attestation_payload,
        headers=headers,
    )
    assert resp.status_code == 200
    attested_session = unwrap(resp.json())["session"]
    attestation_details = attested_session["attestation"]["attestation"]
    assert attestation_details["attestationText"] == "Reviewed and verified"
    assert attestation_details["attestedBy"] == "Dr. Alice"
    billing_validation = attested_session["attestation"]["billingValidation"]
    assert billing_validation["codesValidated"] is True
    assert billing_validation["estimatedReimbursement"] == pytest.approx(75.0)

    dispatch_payload = {
        "encounterId": "encounter-contract",
        "sessionId": session_id,
        "destination": "ehr",
        "deliveryMethod": "api",
        "final_review": {
            "all_steps_completed": True,
            "physician_final_approval": True,
            "quality_review_passed": True,
            "compliance_verified": True,
            "ready_for_dispatch": True,
        },
        "dispatch_options": {
            "send_to_emr": True,
            "generate_patient_summary": False,
            "schedule_followup": False,
            "send_to_billing": True,
            "notify_referrals": False,
        },
        "dispatch_status": {
            "dispatch_initiated": True,
            "dispatch_completed": True,
            "dispatch_timestamp": "2024-04-01T12:05:00Z",
            "dispatch_confirmation_number": "CONF123",
            "dispatch_errors": [],
        },
        "post_dispatch_actions": [
            {
                "action_type": "billing_submission",
                "status": "completed",
                "scheduled_time": "2024-04-01T12:06:00Z",
                "completion_time": "2024-04-01T12:07:00Z",
                "retry_count": 0,
            }
        ],
    }

    resp = client.post(
        f"/api/v1/workflow/{session_id}/step6/dispatch",
        json=dispatch_payload,
        headers=headers,
    )
    assert resp.status_code == 200
    dispatch_result = unwrap(resp.json())
    session_after_dispatch = dispatch_result["session"]
    dispatch_status = session_after_dispatch["dispatch"]["dispatchStatus"]
    assert dispatch_status["dispatchCompleted"] is True
    assert dispatch_status["dispatchInitiated"] is True
    assert (
        session_after_dispatch["dispatch"]["dispatchOptions"]["sendToBilling"] is True
    )
    assert dispatch_result["result"]["exportReady"] is True
    assert dispatch_result["result"]["reimbursementSummary"]["total"] == pytest.approx(75.0)


def test_finalization_workflow_roundtrip_matches_spec(client):
    token = main.create_token("alice", "user")
    headers = auth_header(token)

    session_create_payload = {
        "encounterId": "encounter-roundtrip",
        "patientId": "patient-roundtrip",
        "noteId": "note-roundtrip",
        "noteContent": "Initial detailed clinical note with enough content for validation.",
        "patientMetadata": {"name": "Jordan Smith", "providerName": "Dr. Alice"},
        "selectedCodes": [
            {
                "id": "code-a",
                "code": "99213",
                "type": "CPT",
                "category": "procedure",
                "description": "Established patient visit",
            },
            {
                "id": "diag-a",
                "code": "E11.9",
                "type": "ICD-10",
                "category": "diagnosis",
                "description": "Type 2 diabetes mellitus",
            },
        ],
        "complianceIssues": [
            {
                "id": "comp-a",
                "title": "Document medication adherence",
                "severity": "warning",
                "details": "Include adherence discussion in plan",
            }
        ],
    }

    resp = client.post("/api/v1/workflow/sessions", json=session_create_payload, headers=headers)
    assert resp.status_code == 200
    created_session = unwrap(resp.json())
    session_id = created_session["sessionId"]
    assert session_id
    assert created_session["stepStates"][0]["status"] == "in_progress"

    note_update_payload = {
        "sessionId": session_id,
        "encounterId": "encounter-roundtrip",
        "noteId": "note-roundtrip",
        "content": "Patient seen for diabetes and hypertension. Medication adherence reinforced and follow-up arranged.",
        "codes": ["99213"],
        "prevention": ["Lifestyle counseling provided"],
        "diagnoses": ["E11.9"],
        "differentials": ["I10"],
        "compliance": ["Documentation complete"],
    }

    resp = client.put(
        "/api/v1/notes/encounter-roundtrip/content",
        json=note_update_payload,
        headers=headers,
    )
    assert resp.status_code == 200
    note_update_data = unwrap(resp.json())
    assert note_update_data["validation"]["canFinalize"] is True
    assert note_update_data["session"]["lastValidation"]["reimbursementSummary"]["total"] >= 0.0

    attestation_payload = {
        "encounterId": "encounter-roundtrip",
        "sessionId": session_id,
        "billing_validation": {
            "codes_validated": True,
            "documentation_level_verified": True,
            "medical_necessity_confirmed": True,
            "billing_compliance_checked": True,
            "estimated_reimbursement": 80.0,
            "payer_specific_requirements": [],
        },
        "attestation": {
            "physician_attestation": True,
            "attestation_text": "Final attestation recorded via contract test",
            "attestation_timestamp": "2024-05-01T10:00:00Z",
            "attestedBy": "Dr. Alice",
        },
        "compliance_checks": [
            {
                "check_type": "documentation_standards",
                "status": "pass",
                "description": "All documentation present",
                "required_actions": [],
            }
        ],
        "billing_summary": {
            "primary_diagnosis": "E11.9",
            "secondary_diagnoses": ["I10"],
            "procedures": ["99213"],
            "evaluation_management_level": "99213",
            "total_rvu": 2.0,
            "estimated_payment": 80.0,
            "modifier_codes": [],
        },
    }

    resp = client.post(
        f"/api/v1/workflow/{session_id}/step5/attest",
        json=attestation_payload,
        headers=headers,
    )
    assert resp.status_code == 200
    attested_session = unwrap(resp.json())["session"]
    assert attested_session["stepStates"][4]["status"] == "completed"
    attestation_details = attested_session["attestation"]["attestation"]
    assert attestation_details["attestationText"] == "Final attestation recorded via contract test"
    assert attestation_details["physicianAttestation"] is True
    compliance_checks = attested_session["attestation"]["complianceChecks"]
    assert compliance_checks[0]["requiredActions"] == []

    dispatch_payload = {
        "encounterId": "encounter-roundtrip",
        "sessionId": session_id,
        "destination": "ehr",
        "deliveryMethod": "wizard",
        "final_review": {
            "all_steps_completed": True,
            "physician_final_approval": True,
            "quality_review_passed": True,
            "compliance_verified": True,
            "ready_for_dispatch": True,
        },
        "dispatch_options": {
            "send_to_emr": True,
            "generate_patient_summary": False,
            "schedule_followup": False,
            "send_to_billing": True,
            "notify_referrals": False,
        },
        "dispatch_status": {
            "dispatch_initiated": True,
            "dispatch_completed": True,
            "dispatch_timestamp": "2024-05-01T10:05:00Z",
            "dispatch_confirmation_number": "ROUND123",
            "dispatch_errors": [],
        },
        "post_dispatch_actions": [
            {
                "action_type": "billing_submission",
                "status": "completed",
                "scheduled_time": "2024-05-01T10:06:00Z",
                "completion_time": "2024-05-01T10:07:00Z",
                "retry_count": 0,
            }
        ],
    }

    resp = client.post(
        f"/api/v1/workflow/{session_id}/step6/dispatch",
        json=dispatch_payload,
        headers=headers,
    )
    assert resp.status_code == 200
    dispatch_result = unwrap(resp.json())
    session_after_dispatch = dispatch_result["session"]
    assert session_after_dispatch["stepStates"][5]["status"] == "completed"
    dispatch_status = session_after_dispatch["dispatch"]["dispatchStatus"]
    assert dispatch_status["dispatchCompleted"] is True
    assert dispatch_status["dispatchErrors"] == []
    assert dispatch_result["result"]["exportReady"] is True
    assert dispatch_result["result"]["reimbursementSummary"]["total"] >= 0.0
