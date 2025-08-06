import sqlite3
from fastapi.testclient import TestClient

from backend import main


def setup_module(module):
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    main.db_conn = db
    # Required tables
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)"
    )
    db.execute(
        "CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL, username TEXT, action TEXT, details TEXT)"
    )
    db.execute(
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT, timestamp REAL, details TEXT, revenue REAL, codes TEXT, compliance_flags TEXT, public_health INTEGER, satisfaction INTEGER)"
    )
    main.ensure_settings_table(db)
    # Seed admin user
    admin_hash = main.hash_password("secret")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("admin", admin_hash, "admin"),
    )
    db.commit()


def test_registration_login_refresh_and_roles():
    client = TestClient(main.app)
    # Admin login
    resp = client.post("/login", json={"username": "admin", "password": "secret"})
    assert resp.status_code == 200
    admin_tokens = resp.json()
    admin_token = admin_tokens["access_token"]

    # Register regular user
    resp = client.post(
        "/register",
        json={"username": "alice", "password": "pw", "role": "user"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    # User login
    resp = client.post("/login", json={"username": "alice", "password": "pw"})
    assert resp.status_code == 200
    tokens = resp.json()
    access = tokens["access_token"]
    refresh = tokens["refresh_token"]

    # Access admin endpoint should fail for regular user
    resp = client.get("/metrics", headers={"Authorization": f"Bearer {access}"})
    assert resp.status_code == 403

    # Refresh token to obtain new access token
    resp = client.post("/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    new_access = resp.json()["access_token"]

    # New token works on user endpoint
    resp = client.post(
        "/event",
        json={"eventType": "test", "details": {}},
        headers={"Authorization": f"Bearer {new_access}"},
    )
    assert resp.status_code == 200

    # Admin token can access admin endpoint
    resp = client.get("/metrics", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200

    # Regular user cannot view audit log
    resp = client.get("/audit", headers={"Authorization": f"Bearer {new_access}"})
    assert resp.status_code == 403

    # Admin can view audit log and see metrics entry
    resp = client.get("/audit", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    logs = resp.json()
    assert any(log["details"] == "/metrics" for log in logs)
