import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend import main


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


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


def test_beautify_spanish(client, monkeypatch):
    def fake_call(msgs):
        # ensure the system prompt instructs Spanish output
        assert "en español" in msgs[0]["content"]
        return "nota en español"

    monkeypatch.setattr(main, "call_openai", fake_call)
    token = main.create_token("u", "user")
    resp = client.post(
        "/beautify", json={"text": "hola", "lang": "es"}, headers=auth_header(token)
    )
    data = resp.json()
    assert data["beautified"] == "nota en español"


def test_beautify_soap_headings_and_content(client, monkeypatch):
    note = "patient reports cough and fever. lungs clear. viral uri suspected. advise rest."

    def fake_call(msgs):
        # ensure instructions mention SOAP headings
        assert "Subjective" in msgs[0]["content"]
        return (
            "Subjective: patient reports cough and fever.\n"
            "Objective: lungs clear.\n"
            "Assessment: viral uri suspected.\n"
            "Plan: advise rest."
        )

    monkeypatch.setattr(main, "call_openai", fake_call)
    token = main.create_token("u", "user")
    resp = client.post("/beautify", json={"text": note}, headers=auth_header(token))
    data = resp.json()
    cleaned = data["beautified"].lower()
    for heading in ["subjective:", "objective:", "assessment:", "plan:"]:
        assert heading in cleaned
    for piece in [
        "patient reports cough and fever",
        "lungs clear",
        "viral uri suspected",
        "advise rest",
    ]:
        assert piece in cleaned
