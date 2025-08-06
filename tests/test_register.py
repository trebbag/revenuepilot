import sqlite3
import pytest
from httpx import AsyncClient, ASGITransport

from backend import main


@pytest.mark.asyncio
async def test_register_endpoint(monkeypatch):
    # Set up in-memory database with users table
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
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

    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        token = main.create_token("admin", "admin")
        resp = await ac.post(
            "/register",
            json={"username": "bob", "password": "pw", "role": "user"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

        # New user can log in
        resp = await ac.post("/login", json={"username": "bob", "password": "pw"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

        # Non-admin should be rejected
        user_token = main.create_token("bob", "user")
        resp = await ac.post(
            "/register",
            json={"username": "eve", "password": "pw", "role": "user"},
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert resp.status_code == 403
