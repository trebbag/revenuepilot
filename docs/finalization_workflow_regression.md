# Finalization Workflow Regression Guide

This guide describes how to validate the six-step finalization workflow end-to-end after the request/response contract updates for sessions, attestation, and dispatch.

## ✅ Automated Regression

Run the focused workflow tests from the repository root:

```bash
pytest tests/test_workflow_api.py -k "workflow or finalization"
```

This suite exercises session creation, note validation, attestation, dispatch, and verifies the normalized session payload matches the specification (including billing validation, attestation details, dispatch metadata, and final results). The new `test_finalization_workflow_roundtrip_matches_spec` case drives the entire six-step workflow with spec-compliant request bodies to ensure the backend serializers stay in lockstep with the adapter. The coverage report confirms that both lifecycle and contract flows were executed.

## 🧪 Manual API QA Script

Use the following ordered script (also encoded in the accompanying Postman collection) against a test environment. Replace placeholder values in `<>` with your data.

1. **Create workflow session**  
   `POST /api/v1/workflow/sessions`
   ```json
   {
     "encounterId": "<encounter-id>",
     "patientId": "<patient-id>",
     "noteId": "<note-id>",
     "noteContent": "Clinical note text...",
     "patientMetadata": {
       "name": "Dr. Quinn",
       "providerName": "Dr. Quinn"
     },
     "selectedCodes": [
       { "code": "99213", "type": "CPT", "category": "procedure" },
       { "code": "E11.9", "type": "ICD-10", "category": "diagnosis" }
     ],
     "complianceIssues": [
       { "id": "comp-1", "title": "Confirm medication adherence", "severity": "warning" }
     ]
   }
   ```
   *Verify:* response includes `sessionId`, normalized `stepStates`, and seeded reimbursement summary.

2. **Update note content & capture validation**  
   `PUT /api/v1/notes/<encounter-id>/content`
   ```json
   {
     "sessionId": "<session-id>",
     "encounterId": "<encounter-id>",
     "noteId": "<note-id>",
     "content": "Updated clinical note with > 20 words and supporting documentation.",
     "codes": ["99213"],
     "prevention": ["Lifestyle counseling provided"],
     "diagnoses": ["E11.9"],
     "differentials": ["I10"],
     "compliance": ["Documentation complete"]
   }
   ```
   *Verify:* `validation.canFinalize` is `true` and `session.lastValidation` mirrors the response.

3. **Submit attestation**  
   `POST /api/v1/workflow/<session-id>/step5/attest`
   ```json
   {
     "encounterId": "<encounter-id>",
     "sessionId": "<session-id>",
     "billing_validation": {
       "codes_validated": true,
       "documentation_level_verified": true,
       "medical_necessity_confirmed": true,
       "billing_compliance_checked": true,
       "estimated_reimbursement": 75.0,
       "payer_specific_requirements": []
     },
     "attestation": {
       "physician_attestation": true,
       "attestation_text": "Reviewed and verified",
       "attestation_timestamp": "2024-04-01T12:00:00Z",
       "attestation_ip_address": "203.0.113.1",
       "digital_signature": "sig-123",
       "attestedBy": "Dr. Quinn"
     },
     "compliance_checks": [
       {
         "check_type": "documentation_standards",
         "status": "pass",
         "description": "All documentation present",
         "required_actions": []
       }
     ],
     "billing_summary": {
       "primary_diagnosis": "E11.9",
       "secondary_diagnoses": ["I10"],
       "procedures": ["99213"],
       "evaluation_management_level": "99213",
       "total_rvu": 2.0,
       "estimated_payment": 75.0,
       "modifier_codes": ["25"]
     }
   }
   ```
   *Verify:* the session response now contains `attestation.billingValidation`, `attestation.attestation`, and `stepStates[4].status === "completed"`.

4. **Dispatch finalized note**  
   `POST /api/v1/workflow/<session-id>/step6/dispatch`
   ```json
   {
     "encounterId": "<encounter-id>",
     "sessionId": "<session-id>",
     "destination": "ehr",
     "deliveryMethod": "wizard",
     "final_review": {
       "all_steps_completed": true,
       "physician_final_approval": true,
       "quality_review_passed": true,
       "compliance_verified": true,
       "ready_for_dispatch": true
     },
     "dispatch_options": {
       "send_to_emr": true,
       "generate_patient_summary": false,
       "schedule_followup": false,
       "send_to_billing": true,
       "notify_referrals": false
     },
     "dispatch_status": {
       "dispatch_initiated": true,
       "dispatch_completed": true,
       "dispatch_timestamp": "2024-04-01T12:05:00Z",
       "dispatch_confirmation_number": "CONF123",
       "dispatch_errors": []
     },
     "post_dispatch_actions": [
       {
         "action_type": "billing_submission",
         "status": "completed",
         "scheduled_time": "2024-04-01T12:06:00Z",
         "completion_time": "2024-04-01T12:07:00Z",
         "retry_count": 0
       }
     ]
   }
   ```
   *Verify:* `dispatch.dispatchStatus.dispatchCompleted` is `true`, `result.exportReady` is `true`, and reimbursement totals carry through.

5. **Optional checks**  
   - `GET /api/v1/workflow/sessions/<session-id>` to confirm persisted attestation/dispatch payloads.  
   - `DELETE /api/v1/workflow/sessions/<session-id>` to clean up test data.

## 📬 Postman Collection

Import [`finalization_workflow_collection.postman_collection.json`](./finalization_workflow_collection.postman_collection.json) into Postman. The collection defines the sequence above with shared variables:

- `{{baseUrl}}` – API base URL (e.g., `http://localhost:8000`).
- `{{sessionId}}`, `{{encounterId}}`, `{{noteId}}` – populated from previous responses using Postman tests.
- Authorization header stored as `{{authToken}}`.

Use the “Run” button in the Postman Collection Runner to execute the full workflow and visually inspect each response before release.
