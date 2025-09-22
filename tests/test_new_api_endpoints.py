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


def test_get_patient(client):
    token = login(client)
    resp = client.get("/api/patients/1", headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["patientId"] == "1"
    assert data["name"]


def test_schedule_appointments(client):
    token = login(client)
    resp = client.post(
        "/schedule",
        json={"patient": "1", "reason": "check", "start": "2024-01-01T09:00:00"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    resp = client.get("/api/schedule/appointments", headers=auth_header(token))
    assert resp.status_code == 200
    assert len(resp.json()["appointments"]) >= 1


def test_schedule_bulk_operations(client):
    token = login(client)
    create_resp = client.post(
        "/schedule",
        json={"patient": "2", "reason": "consult", "start": "2024-01-02T09:00:00"},
        headers=auth_header(token),
    )
    assert create_resp.status_code == 200
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

    new_start = "2024-01-02T10:00:00"
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
        files={"file": ("chart.txt", b"data")},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "processing"
