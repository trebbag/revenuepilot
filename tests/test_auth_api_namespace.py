import sqlite3
from typing import Dict

import pytest
from fastapi.testclient import TestClient

import backend.main as main
from backend import auth
from backend.main import _init_core_tables


@pytest.fixture()
def client(monkeypatch):
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    _init_core_tables(conn)
    auth.register_user(
        conn,
        "bootstrap-admin",
        "admin-pass",
        role="admin",
        email="bootstrap-admin@example.test",
        name="Bootstrap Admin",
    )
    conn.commit()
    main.db_conn = conn
    monkeypatch.setattr(main, "db_conn", conn)
    return TestClient(main.app)


def auth_header(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_namespaced_register_allows_idempotent_calls(client):
    payload = {"username": "clinician", "password": "pw123"}

    response = client.post("/auth/register", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["access_token"], "Expected access token in register response"
    assert data["refresh_token"], "Expected refresh token in register response"
    assert data["settings"]["theme"] == "modern"
    assert data["session"]["selectedCodes"]["codes"] == 0

    repeat = client.post("/auth/register", json=payload)
    assert repeat.status_code == 200, repeat.json()
    repeat_data = repeat.json()
    assert repeat_data["access_token"], "Idempotent register should still issue token"
    assert repeat_data["session"]["selectedCodes"]["codes"] == 0


def test_namespaced_login_returns_session_payload(client):
    auth.register_user(
        main.db_conn,
        "workflow-user",
        "complex-pass",
        role="analyst",
        email="workflow@example.test",
        name="Workflow Analyst",
    )
    main.db_conn.commit()

    response = client.post(
        "/api/auth/login",
        json={"username": "workflow-user", "password": "complex-pass"},
    )
    assert response.status_code == 200, response.json()
    data = response.json()
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["settings"]["specialty"] is None
    session = data["session"]
    assert isinstance(session["selectedCodes"], dict)
    assert session["selectedCodes"]["codes"] == 0
    assert isinstance(session["finalizationSessions"], dict)


def test_logout_revokes_status(client):
    auth.register_user(main.db_conn, "temp-user", "pw")
    main.db_conn.commit()
    login = client.post(
        "/api/auth/login",
        json={"username": "temp-user", "password": "pw"},
    )
    token = login.json()["access_token"]
    refresh = login.json()["refresh_token"]
    status_before = client.get("/api/auth/status", headers=auth_header(token))
    assert status_before.json()["authenticated"] is True

    logout = client.post(
        "/api/auth/logout",
        json={"token": refresh},
        headers=auth_header(token),
    )
    assert logout.status_code == 200
    assert logout.json()["success"] is True

    refresh_attempt = client.post(
        "/refresh",
        json={"refresh_token": refresh},
        headers=auth_header(token),
    )
    assert refresh_attempt.status_code == 401
