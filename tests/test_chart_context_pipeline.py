import time

import pytest

import backend.db.models as db_models
from backend import main
import sqlalchemy as sa


@pytest.fixture
def authed_client(api_client, db_session, monkeypatch, tmp_path):
    password_hash = main.hash_password("pw")
    db_session.execute(
        db_models.users.insert().values(
            username="user",
            password_hash=password_hash,
            role="user",
        )
    )
    db_session.commit()

    monkeypatch.setattr(main, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(main, "context_pipeline", main.context_pipeline)

    resp = api_client.post("/login", json={"username": "user", "password": "pw"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return api_client, token


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _wait_for_stage(client, token, patient_id: str, stage: str = "indexed", timeout: float = 5.0) -> dict:
    deadline = time.time() + timeout
    last_payload = None
    while time.time() < deadline:
        resp = client.get(
            f"/api/patients/{patient_id}/context/status",
            headers=_auth_header(token),
        )
        if resp.status_code == 200:
            payload = resp.json()
            last_payload = payload
            state = payload.get("stages", {}).get(stage, {}).get("state")
            if state == "completed":
                return payload
        time.sleep(0.05)
    raise AssertionError(f"context stage {stage} did not complete: {last_payload}")


def test_chart_context_pipeline_progress(authed_client):
    client, token = authed_client

    doc1 = (
        "Type 2 diabetes noted. Medication: Metformin 500 mg BID. "
        "Allergy: Penicillin. BP 132/84 on 2025-09-05. Hemoglobin 12.9 g/dL on 2025-09-01."
    ).encode()
    resp = client.post(
        "/api/charts/upload",
        headers=_auth_header(token),
        params={"patient_id": "pt-456"},
        files={"file": ("discharge_summary.txt", doc1, "text/plain")},
    )
    assert resp.status_code == 200
    correlation_id = resp.json()["correlation_id"]
    assert correlation_id.startswith("ctx_")

    status = _wait_for_stage(client, token, "pt-456")
    assert status["stages"]["superficial"]["state"] == "completed"
    assert status["stages"]["indexed"]["state"] == "completed"
    assert status["stages"]["superficial"]["doc_count"] == 1

    snapshot = client.get(
        "/api/patients/pt-456/context",
        headers=_auth_header(token),
        params={"stage": "final"},
    )
    assert snapshot.status_code == 200
    payload = snapshot.json()
    assert payload["stage"] in {"indexed", "deep"}
    problems = payload["pmh"]
    diabetes = next(entry for entry in problems if entry.get("code") == "E11.9")
    assert diabetes.get("value") == "active"
    assert diabetes.get("date") is not None
    assert diabetes.get("evidence")
    anchor = diabetes["evidence"][0]
    assert anchor["sourceDocId"]
    assert anchor["offset"] is not None

    meds = payload["meds"]
    metformin = next(entry for entry in meds if entry.get("label") == "Metformin")
    assert metformin.get("rxnorm") == "860975"
    assert metformin.get("unit") == "mg"
    assert metformin.get("value") == pytest.approx(500.0)
    assert metformin.get("date")
    assert metformin.get("evidence")

    labs = payload["labs"]
    hemoglobin = next(entry for entry in labs if entry.get("label") == "Hemoglobin")
    assert hemoglobin.get("loinc") == "718-7"
    assert hemoglobin.get("unit") == "g/dL"
    assert hemoglobin.get("value") == pytest.approx(12.9)
    assert hemoglobin.get("date") == "2025-09-01"
    assert hemoglobin.get("evidence")

    doc2 = (
        "Follow up visit. BP 130/82 recorded. Hemoglobin 13.1 g/dL on 2025-09-10."
    ).encode()
    resp2 = client.post(
        "/api/charts/upload",
        headers=_auth_header(token),
        params={"patient_id": "pt-456"},
        files={"file": ("labs.txt", doc2, "text/plain")},
    )
    assert resp2.status_code == 200

    status2 = _wait_for_stage(client, token, "pt-456")
    assert status2["stages"]["superficial"]["doc_count"] == 2
    assert status2["stages"]["indexed"]["state"] == "completed"

    search_resp = client.get(
        "/api/patients/pt-456/context/search",
        headers=_auth_header(token),
        params={"q": "metformin"},
    )
    assert search_resp.status_code == 200
    results = search_resp.json()["results"]
    assert any(result["category"] == "meds" for result in results)
    med_result = next(result for result in results if result["category"] == "meds")
    assert med_result["fact"]["label"] == "Metformin"
    assert med_result["fact"]["evidence"]


def test_chart_context_idempotent_upload(authed_client, db_session, tmp_path):
    client, token = authed_client

    doc = b"Type 2 diabetes. Metformin 500 mg BID."
    resp = client.post(
        "/api/charts/upload",
        headers=_auth_header(token),
        params={"patient_id": "pt-789"},
        files={"file": ("note.txt", doc, "text/plain")},
    )
    assert resp.status_code == 200
    status = _wait_for_stage(client, token, "pt-789")
    assert status["stages"]["indexed"]["state"] == "completed"

    resp2 = client.post(
        "/api/charts/upload",
        headers=_auth_header(token),
        params={"patient_id": "pt-789"},
        files={"file": ("note.txt", doc, "text/plain")},
    )
    assert resp2.status_code == 200
    data = resp2.json()
    assert data["files"][0]["reused"] is True
    status2 = _wait_for_stage(client, token, "pt-789")
    assert status2["stages"]["indexed"]["state"] == "completed"

    count = db_session.execute(
        sa.select(sa.func.count(db_models.ChartDocument.doc_id)).where(
            db_models.ChartDocument.patient_id == "pt-789"
        )
    ).scalar_one()
    assert count == 1
