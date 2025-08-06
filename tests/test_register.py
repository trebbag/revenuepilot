import sqlite3
from fastapi.testclient import TestClient

from backend import main


def test_register_endpoint(monkeypatch):
    """Registering users and enforcing roles should work synchronously."""

    # Set up in-memory database with users table
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
    )
    db.execute(
        "CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL, username TEXT, action TEXT, details TEXT)"
    )
    db.commit()
    monkeypatch.setattr(main, "db_conn", db)

    # Pre-create an admin user
    admin_hash = main.hash_password("pw")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("admin", admin_hash, "admin"),
    )
    db.commit()

    client = TestClient(main.app)

    token = main.create_token("admin", "admin")
    resp = client.post(
        "/register",
        json={"username": "bob", "password": "pw", "role": "user"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    # New user can log in and receives a token with the correct role
    resp = client.post("/login", json={"username": "bob", "password": "pw"})
    assert resp.status_code == 200
    token_resp = resp.json()["access_token"]
    assert token_resp
    payload = main.jwt.decode(token_resp, main.JWT_SECRET, algorithms=[main.JWT_ALGORITHM])
    assert payload["role"] == "user"

    # Non-admin should be rejected
    user_token = main.create_token("bob", "user")
    resp = client.post(
        "/register",
        json={"username": "eve", "password": "pw", "role": "user"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 403
