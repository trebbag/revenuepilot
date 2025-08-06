import sqlite3
from fastapi.testclient import TestClient

from backend import main, auth


def test_register_endpoint(monkeypatch):
    """Self-registration should create a user and allow login."""

    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
    )
    db.execute(
        "CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL, username TEXT, action TEXT, details TEXT)"
    )
    main.ensure_settings_table(db)
    db.commit()
    monkeypatch.setattr(main, "db_conn", db)

    client = TestClient(main.app)

    resp = client.post("/register", json={"username": "bob", "password": "pw"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["access_token"]
    payload = main.jwt.decode(data["access_token"], main.JWT_SECRET, algorithms=[main.JWT_ALGORITHM])
    assert payload["role"] == "user"

    # Password stored hashed
    row = db.execute(
        "SELECT password_hash FROM users WHERE username=?", ("bob",)
    ).fetchone()
    assert row and auth.verify_password("pw", row["password_hash"])
