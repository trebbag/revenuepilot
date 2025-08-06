import backend.scheduling as scheduling
import sqlite3
import pytest
from fastapi.testclient import TestClient
from backend import main

def test_recommend_follow_up_llm(monkeypatch):
    def fake_call_openai(messages):
        return "Patient should return in 3 months for follow-up."
    monkeypatch.setattr(scheduling, "call_openai", fake_call_openai)
    note = "Routine visit"
    codes = ["Z00.00"]
    assert scheduling.recommend_follow_up(note, codes) == "3 months"

def test_recommend_follow_up_fallback(monkeypatch):
    def boom(messages):
        raise RuntimeError("boom")
    monkeypatch.setattr(scheduling, "call_openai", boom)
    note = "Patient with chronic diabetes under control"
    codes = ["E11.9"]
    assert scheduling.recommend_follow_up(note, codes) == "3 months"


def test_code_specific_intervals():
    note = "Upper respiratory infection"
    codes = ["J06.9"]
    assert scheduling.recommend_follow_up(note, codes, use_llm=False) == "2 weeks"

def test_export_ics():
    ics = scheduling.export_ics("2 weeks")
    assert "BEGIN:VCALENDAR" in ics
    assert "DTSTART" in ics


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


def test_schedule_endpoint(client, monkeypatch):
    def fake_call_openai(messages):
        return "Return in 2 weeks"

    monkeypatch.setattr(scheduling, "call_openai", fake_call_openai)
    token = main.create_token("u", "user")
    resp = client.post(
        "/schedule",
        json={"text": "note", "codes": ["E11.9"]},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["interval"] == "2 weeks"
    assert "BEGIN:VCALENDAR" in data["ics"]
