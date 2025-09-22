import sqlite3
import sqlite3
from fastapi.testclient import TestClient

import backend.main as main
from backend import auth


def setup_module(module):
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
    main.configure_auth_session_factory(main.db_conn)
    with main.auth_session_scope() as session:
        auth.register_user(session, "alice", "pw")


def test_error_logging_with_user():
    client = TestClient(main.app)
    token = client.post("/login", json={"username": "alice", "password": "pw"}).json()["access_token"]
    resp = client.post(
        "/api/errors/log",
        json={"message": "boom", "stack": "trace"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    row = main.db_conn.execute("SELECT username, message FROM error_log").fetchone()
    assert row["username"] == "alice"
    assert row["message"] == "boom"
