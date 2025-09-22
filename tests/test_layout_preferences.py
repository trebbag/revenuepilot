import sqlite3

from fastapi.testclient import TestClient

import backend.main as main
from backend import auth


def setup_module(module):
    # Set up in-memory database and required tables
    main.db_conn = sqlite3.connect(":memory:", check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    main.db_conn.execute(
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT, timestamp REAL, details TEXT, revenue REAL, time_to_close REAL, codes TEXT, compliance_flags TEXT, public_health INTEGER, satisfaction INTEGER)"
    )
    main.db_conn.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)"
    )
    main.db_conn.execute(
        "CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL, username TEXT, action TEXT, details TEXT)"
    )
    main.ensure_settings_table(main.db_conn)
    main.ensure_error_log_table(main.db_conn)
    main.ensure_refresh_table(main.db_conn)
    main.ensure_session_state_table(main.db_conn)
    main.configure_auth_session_factory(main.db_conn)
    with main.auth_session_scope() as session:
        auth.register_user(session, "alice", "pw")


def _token():
    client = TestClient(main.app)
    return client.post("/login", json={"username": "alice", "password": "pw"}).json()["access_token"]


def test_layout_preferences_roundtrip():
    client = TestClient(main.app)
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    # Initially empty
    resp = client.get("/api/user/layout-preferences", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == {}
    payload = {"noteEditor": 65, "suggestionPanel": 35, "sidebarCollapsed": True}
    resp = client.put("/api/user/layout-preferences", json=payload, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == payload
    assert body["noteEditor"] == 65
    assert body["suggestionPanel"] == 35
    resp = client.get("/api/user/layout-preferences", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == payload
    assert body["noteEditor"] == 65
    assert body["suggestionPanel"] == 35
