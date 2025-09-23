import uuid

import pytest

import backend.db.models as db_models

from backend import main


@pytest.fixture
def client(api_client, db_session):
    password_hash = main.hash_password("pw")
    db_session.execute(
        db_models.users.insert().values(
            username="user",
            password_hash=password_hash,
            role="user",
        )
    )
    db_session.commit()
    return api_client


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def login(client):
    resp = client.post("/login", json={"username": "user", "password": "pw"})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _create_patient(first_name: str = "Test", last_name: str = "Patient") -> int:
    mrn = f"MRN-{uuid.uuid4().hex[:6]}"
    db = main.db_conn
    db.execute(
        "INSERT INTO patients (first_name, last_name, mrn) VALUES (?, ?, ?)",
        (first_name, last_name, mrn),
    )
    patient_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.commit()
    return int(patient_id)


def test_get_patient(client):
    token = login(client)
    patient_id = _create_patient()
    resp = client.get(f"/api/patients/{patient_id}", headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["patientId"] == str(patient_id)
    assert data["name"]


def test_schedule_appointments(client):
    token = login(client)
    patient_id = _create_patient()
    resp = client.post(
        "/api/schedule/appointments",
        json={
            "patientId": str(patient_id),
            "providerId": "prov-1",
            "start": "2024-01-01T09:00:00Z",
            "end": "2024-01-01T09:30:00Z",
            "type": "follow-up",
            "locationId": "clinic-1",
            "notes": "check",
        },
        headers=auth_header(token),
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["status"] == "scheduled"
    assert payload["patientId"] == str(patient_id)
    resp = client.get("/api/schedule/appointments", headers=auth_header(token))
    assert resp.status_code == 200
    assert len(resp.json()["appointments"]) >= 1


def test_schedule_appointments_conflict_returns_alternatives(client):
    token = login(client)
    patient_id = _create_patient()
    other_patient = _create_patient(first_name="Another", last_name="Person")

    payload = {
        "patientId": str(patient_id),
        "providerId": "prov-1",
        "start": "2024-01-01T09:00:00Z",
        "end": "2024-01-01T09:30:00Z",
        "type": "follow-up",
        "locationId": "clinic-1",
        "notes": "initial",
    }

    create_resp = client.post(
        "/api/schedule/appointments",
        json=payload,
        headers=auth_header(token),
    )
    assert create_resp.status_code == 200, create_resp.text

    conflict_resp = client.post(
        "/api/schedule/appointments",
        json={**payload, "patientId": str(other_patient)},
        headers=auth_header(token),
    )
    assert conflict_resp.status_code == 409
    body = conflict_resp.json()
    error = body.get("detail") or body.get("error") or {}
    assert error.get("reason") == "provider"
    alternatives = error.get("alternatives") or []
    assert alternatives, body
    assert all("T" in alt for alt in alternatives)


def test_schedule_appointments_idempotent_on_duplicate_submit(client):
    token = login(client)
    patient_id = _create_patient()

    payload = {
        "patientId": str(patient_id),
        "providerId": "prov-77",
        "start": "2024-02-02T15:00:00Z",
        "end": "2024-02-02T15:30:00Z",
        "type": "consult",
        "locationId": "clinic-7",
        "notes": "duplicate",
    }

    first = client.post(
        "/api/schedule/appointments",
        json=payload,
        headers=auth_header(token),
    )
    assert first.status_code == 200, first.text
    first_id = first.json()["id"]

    second = client.post(
        "/api/schedule/appointments",
        json=payload,
        headers=auth_header(token),
    )
    assert second.status_code == 200, second.text
    assert second.json()["id"] == first_id

    resp = client.get("/api/schedule/appointments", headers=auth_header(token))
    assert resp.status_code == 200
    appointments = resp.json()["appointments"]
    ids = [item["id"] for item in appointments]
    assert ids.count(first_id) == 1


def test_schedule_bulk_operations(client):
    token = login(client)
    patient_id = _create_patient(first_name="Alice", last_name="Example")
    create_resp = client.post(
        "/api/schedule/appointments",
        json={
            "patientId": str(patient_id),
            "providerId": "dr-adams",
            "start": "2024-01-02T09:00:00Z",
            "end": "2024-01-02T09:30:00Z",
            "type": "consult",
            "locationId": "room-1",
            "notes": "consult",
        },
        headers=auth_header(token),
    )
    assert create_resp.status_code == 200, create_resp.text
    appt_id = create_resp.json()["id"]

    provider = "Dr. Adams"
    resp = client.post(
        "/api/schedule/bulk-operations",
        json={
            "provider": provider,
            "updates": [{"id": appt_id, "action": "check-in"}],
        },
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["succeeded"] == 1
    assert body["failed"] == 0

    resp = client.get("/api/schedule/appointments", headers=auth_header(token))
    assert resp.status_code == 200
    appointments = resp.json()["appointments"]
    match = next(item for item in appointments if item["id"] == appt_id)
    assert match["status"] == "in-progress"
    assert match["provider"] == provider

    new_start = "2024-01-02T10:00:00Z"
    resp = client.post(
        "/api/schedule/bulk-operations",
        json={
            "provider": provider,
            "updates": [
                {"id": appt_id, "action": "reschedule", "time": new_start},
            ],
        },
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["succeeded"] == 1
    assert body["failed"] == 0

    resp = client.get("/api/schedule/appointments", headers=auth_header(token))
    assert resp.status_code == 200
    appointments = resp.json()["appointments"]
    match = next(item for item in appointments if item["id"] == appt_id)
    assert match["start"].startswith(new_start)
    assert match["status"] == "scheduled"

    resp = client.post(
        "/api/schedule/bulk-operations",
        json={
            "provider": provider,
            "updates": [{"id": 99999, "action": "complete"}],
        },
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["succeeded"] == 0
    assert body["failed"] == 1


def test_visits_manage(client):
    token = login(client)
    resp = client.post(
        "/api/visits/manage",
        json={"encounterId": "enc1", "action": "start"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["visitStatus"] == "active"


def test_charts_upload(client):
    token = login(client)
    resp = client.post(
        "/api/charts/upload",
        headers=auth_header(token),
        params={"patient_id": "pt-42"},
        files={"file": ("chart.txt", b"data")},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["patient_id"] == "pt-42"
    assert payload["correlation_id"].startswith("ctx_")
