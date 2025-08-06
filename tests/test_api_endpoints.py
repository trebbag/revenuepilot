import json
import sqlite3
import hashlib

import pytest
from fastapi.testclient import TestClient

from backend import main, prompts, migrations


@pytest.fixture
def client(monkeypatch, tmp_path):
    # Isolate database and events
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT NOT NULL, timestamp REAL NOT NULL, details TEXT)"
    )
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
    )
    migrations.ensure_settings_table(db)
    pwd = hashlib.sha256(b"pw").hexdigest()
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("admin", pwd, "admin"),
    )
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("user", pwd, "user"),
    )
    db.commit()
    monkeypatch.setattr(main, "db_conn", db)
    monkeypatch.setattr(main, "events", [])
    return TestClient(main.app)


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_endpoints_require_auth(client):
    assert client.get('/metrics').status_code in {401, 403}
    assert client.get('/events').status_code in {401, 403}
    assert client.post('/beautify', json={'text': 'hi'}).status_code in {401, 403}
    assert client.post('/suggest', json={'text': 'hi'}).status_code in {401, 403}
    assert client.post('/summarize', json={'text': 'hi'}).status_code in {401, 403}
    assert (
        client.post('/transcribe', files={'file': ('a.wav', b'bytes')}).status_code
        in {401, 403}
    )
    assert client.post('/event', json={'eventType': 'x'}).status_code in {401, 403}
    assert client.post('/export_to_ehr', json={'note': 'hi'}).status_code in {401, 403}


def test_login_and_settings(client):
    pwd = main.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("alice", pwd, "admin"),
    )
    main.db_conn.commit()
    resp = client.post(
        "/login", json={"username": "alice", "password": "pw"}
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    assert token


    resp = client.get("/settings", headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["theme"] == "modern"
    assert data["lang"] == "en"
    assert data["specialty"] is None
    assert data["payer"] is None
    assert data["region"] == ""

    new_settings = {
        "theme": "dark",
        "categories": {
            "codes": False,
            "compliance": True,
            "publicHealth": True,
            "differentials": True,
        },
        "rules": ["x"],
        "lang": "es",
        "specialty": "cardiology",
        "payer": "medicare",
        "region": "us",
    }
    resp = client.post(
        "/settings", json=new_settings, headers=auth_header(token)
    )
    assert resp.status_code == 200

    resp = client.get("/settings", headers=auth_header(token))
    data = resp.json()
    assert data["theme"] == "dark"
    assert data["categories"]["codes"] is False
    assert data["rules"] == ["x"]
    assert data["lang"] == "es"
    assert data["specialty"] == "cardiology"
    assert data["payer"] == "medicare"
    assert data["region"] == "us"

    # second user should still see default settings
    token_user = client.post(
        "/login", json={"username": "user", "password": "pw"}
    ).json()["access_token"]
    resp = client.get("/settings", headers=auth_header(token_user))
    other = resp.json()
    assert other["theme"] == "modern"
    assert other["lang"] == "en"
    assert other["region"] == ""

    # unauthenticated request should fail
    resp = client.get("/settings")
    assert resp.status_code in {401, 403}


def test_events_metrics_with_auth(client):
    # no auth
    resp = client.get("/events")
    assert resp.status_code in {401, 403}

    # user without admin role
    pwd = main.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("u", pwd, "user"),
    )
    main.db_conn.commit()
    token_user = client.post(
        "/login", json={"username": "u", "password": "pw"}

    ).json()["access_token"]
    resp = client.get("/events", headers=auth_header(token_user))
    assert resp.status_code == 403

    # log event and fetch with admin

    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("a", pwd, "admin"),
    )
    main.db_conn.commit()
    token_admin = client.post(
        "/login", json={"username": "a", "password": "pw"}
    ).json()["access_token"]
    client.post(
        "/event",
        json={"eventType": "note_started"},
        headers=auth_header(token_admin),
    )
    resp = client.get("/events", headers=auth_header(token_admin))
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    resp = client.get("/metrics", headers=auth_header(token_admin))
    assert resp.status_code == 200
    assert resp.json()["total_notes"] >= 1


def test_export_to_ehr_requires_admin(client):
    # user token should be forbidden
    token_user = client.post(
        "/login", json={"username": "user", "password": "pw"}
    ).json()["access_token"]
    resp = client.post(
        "/export_to_ehr",
        json={"note": "hi"},
        headers=auth_header(token_user),
    )
    assert resp.status_code == 403

    # invalid token should return 401
    resp = client.post(
        "/export_to_ehr",
        json={"note": "hi"},
        headers=auth_header("badtoken"),
    )
    assert resp.status_code == 401

    # admin token succeeds
    token_admin = client.post(
        "/login", json={"username": "admin", "password": "pw"}
    ).json()["access_token"]
    resp = client.post(
        "/export_to_ehr",
        json={"note": "hi"},
        headers=auth_header(token_admin),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "exported"


def test_summarize_and_fallback(client, monkeypatch):
    monkeypatch.setattr(main, "call_openai", lambda msgs: "great summary")
    token = main.create_token("u", "user")
    resp = client.post(
        "/summarize", json={"text": "hello"}, headers=auth_header(token)
    )
    assert resp.json()["summary"] == "great summary"

    def boom(_):
        raise RuntimeError("no key")

    monkeypatch.setattr(main, "call_openai", boom)
    long_text = "a" * 300
    resp = client.post(
        "/summarize", json={"text": long_text}, headers=auth_header(token)
    )
    assert resp.status_code == 200
    assert len(resp.json()["summary"]) <= 203  # truncated fallback


def test_summarize_spanish_language(client, monkeypatch):
    def fake_call_openai(msgs):
        # Ensure the system prompt is in Spanish
        assert "comunicador clínico" in msgs[0]["content"]
        return "resumen"

    monkeypatch.setattr(main, "call_openai", fake_call_openai)
    token = main.create_token("u", "user")
    resp = client.post(
        "/summarize", json={"text": "hola", "lang": "es"}, headers=auth_header(token)
    )
    assert resp.status_code == 200
    assert resp.json()["summary"] == "resumen"


def test_transcribe_endpoint(client, monkeypatch):
    monkeypatch.setattr(main, "simple_transcribe", lambda b: "hello")
    monkeypatch.setattr(
        main, "diarize_and_transcribe", lambda b: {"provider": "p", "patient": "q"}
    )
    token = main.create_token("u", "user")
    resp = client.post(
        "/transcribe", files={"file": ("a.wav", b"bytes")}, headers=auth_header(token)
    )
    assert resp.json()["provider"] == "hello"

    resp = client.post(
        "/transcribe?diarise=true",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    assert resp.json() == {"provider": "p", "patient": "q"}

    resp = client.post("/transcribe", headers=auth_header(token))
    assert resp.status_code == 422


def test_get_last_transcript(client, monkeypatch):
    monkeypatch.setattr(main, "simple_transcribe", lambda b: "hello")
    monkeypatch.setattr(
        main, "diarize_and_transcribe", lambda b: {"provider": "p", "patient": "q"}
    )
    token = main.create_token("u", "user")
    # First call without diarisation
    client.post(
        "/transcribe",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    resp = client.get("/transcribe", headers=auth_header(token))
    assert resp.json() == {"provider": "hello", "patient": ""}

    # Now call with diarisation and ensure both parts returned
    client.post(
        "/transcribe?diarise=true",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    resp = client.get("/transcribe", headers=auth_header(token))
    assert resp.json() == {"provider": "p", "patient": "q"}


def test_apikey_validation(client, monkeypatch):
    monkeypatch.setattr(main, "save_api_key", lambda key: None)
    token = main.create_token("admin", "admin")
    valid = "sk-" + "a" * 22
    resp = client.post(
        "/apikey", json={"key": valid}, headers=auth_header(token)
    )
    assert resp.json()["status"] == "saved"

    resp = client.post("/apikey", json={"key": ""}, headers=auth_header(token))
    assert resp.status_code == 400

    resp = client.post("/apikey", json={"key": "abc"}, headers=auth_header(token))
    assert resp.status_code == 400


def test_beautify_and_fallback(client, monkeypatch):
    monkeypatch.setattr(main, "call_openai", lambda msgs: "nice note")
    token = main.create_token("u", "user")
    resp = client.post(
        "/beautify", json={"text": "hello"}, headers=auth_header(token)
    )
    assert resp.json()["beautified"] == "nice note"

    def fail(_):
        raise ValueError("bad")

    monkeypatch.setattr(main, "call_openai", fail)
    resp = client.post(
        "/beautify", json={"text": "hi"}, headers=auth_header(token)
    )
    assert resp.json()["beautified"] == "HI"


def test_suggest_and_fallback(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "call_openai",
        lambda msgs: json.dumps(
            {
                "codes": [{"code": "A1"}],
                "compliance": ["c"],
                "publicHealth": ["p"],
                "differentials": ["d"],
            }
        ),
    )
    token = main.create_token("u", "user")
    resp = client.post("/suggest", json={"text": "note"}, headers=auth_header(token))
    data = resp.json()
    assert data["codes"][0]["code"] == "A1"
    

def test_beautify_spanish(client, monkeypatch):
    def fake_call(msgs):
        # ensure the system prompt is in Spanish
        assert "en español" in msgs[0]["content"]
        return "nota en español"

    monkeypatch.setattr(main, "call_openai", fake_call)
    token_b = main.create_token("u", "user")
    resp = client.post(
        "/beautify", json={"text": "hola", "lang": "es"}, headers=auth_header(token_b)
    )
    assert resp.json()["beautified"] == "nota en español"


def test_suggest_with_demographics(client, monkeypatch):
    def fake_call_openai(msgs):
        user = msgs[1]["content"]
        assert "HPV vaccine" in user
        assert "Pap smear" in user
        return json.dumps(
            {"codes": [], "compliance": [], "publicHealth": [], "differentials": []}
        )

    monkeypatch.setattr(main, "call_openai", fake_call_openai)

    def fake_get(age, sex, region):
        assert age == 30
        assert sex == "female"
        assert region == "US"
        return {"vaccinations": ["HPV vaccine"], "screenings": ["Pap smear"]}

    monkeypatch.setattr(prompts, "get_guidelines", fake_get)

    token_c = main.create_token("u", "user")
    resp = client.post(
        "/suggest",
        json={"text": "note", "age": 30, "sex": "female", "region": "US"},
        headers=auth_header(token_c),
    )
    assert resp.status_code == 200


def test_suggest_includes_public_health_from_api(client, monkeypatch):
    def fake_call_openai(msgs):
        return json.dumps({"codes": [], "compliance": [], "publicHealth": [], "differentials": []})

    monkeypatch.setattr(main, "call_openai", fake_call_openai)
    monkeypatch.setattr(prompts, "get_guidelines", lambda *args, **kwargs: {})

    class DummyResp:
        def __init__(self, data):
            self._data = data

        def raise_for_status(self):
            pass

        def json(self):
            return self._data

    def fake_get(url, params=None, timeout=10):
        assert params == {"age": 50, "sex": "male", "region": "US"}
        if "vaccinations" in url:
            return DummyResp({"vaccinations": ["Shingles vaccine"]})
        return DummyResp({"screenings": ["Colon cancer screening"]})

    monkeypatch.setattr(main.public_health_api.requests, "get", fake_get)
    main.public_health_api.clear_cache()

    token_d = main.create_token("u", "user")
    resp = client.post(
        "/suggest",
        json={"text": "note", "age": 50, "sex": "male", "region": "US"},
        headers=auth_header(token_d),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "Shingles vaccine" in data["publicHealth"]
    assert "Colon cancer screening" in data["publicHealth"]
