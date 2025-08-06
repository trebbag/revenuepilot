import backend.scheduling as scheduling
import sqlite3
import pytest
from fastapi.testclient import TestClient
from backend import main


def test_chronic_code_interval():
    res = scheduling.recommend_follow_up(["E11.9"], [])
    assert res["interval"] == "3 months"
    assert "BEGIN:VCALENDAR" in res["ics"]


def test_acute_code_interval():
    res = scheduling.recommend_follow_up(["S93.401A"], [])
    assert res["interval"] == "2 weeks"


@pytest.fixture
def client(monkeypatch):
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT NOT NULL, timestamp REAL NOT NULL, details TEXT)"
    )
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
    )
    pwd = main.hash_password("pw")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("u", pwd, "user"),
    )
    db.commit()
    monkeypatch.setattr(main, "db_conn", db)
    monkeypatch.setattr(main, "events", [])
    return TestClient(main.app)


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_schedule_endpoint(client):
    token = main.create_token("u", "user")
    resp = client.post(
        "/schedule",
        json={"text": "note", "codes": ["E11.9"]},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["interval"] == "3 months"
    assert "BEGIN:VCALENDAR" in data["ics"]

