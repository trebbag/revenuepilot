import json
import sqlite3
import hashlib
import logging


import pytest
from fastapi.testclient import TestClient

from backend import main, prompts, migrations, ehr_integration


@pytest.fixture
def client(monkeypatch, tmp_path):
    # Isolate database and events
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT NOT NULL, timestamp REAL NOT NULL, details TEXT, revenue REAL, codes TEXT, compliance_flags TEXT, public_health INTEGER, satisfaction INTEGER)"
    )
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
    )
    db.execute(
        "CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL, username TEXT, action TEXT, details TEXT)"
    )
    migrations.ensure_settings_table(db)
    pwd = main.hash_password("pw")
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
    assert client.post('/survey', json={'rating': 5}).status_code in {401, 403}
    assert client.post('/export_to_ehr', json={'note': 'hi'}).status_code in {401, 403}


def test_get_transcribe_requires_auth(client):
    resp = client.get('/transcribe')
    assert resp.status_code in {401, 403}


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
    assert resp.json()["current"]["total_notes"] >= 1


def test_export_to_ehr_requires_admin(client, monkeypatch):
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

    # Avoid real HTTP calls by stubbing the FHIR helper
    def fake_post(note, codes):
        assert note == "hi"
        assert codes == []
        return {"result": "ok"}

    monkeypatch.setattr(ehr_integration, "post_note_and_codes", fake_post)

    resp = client.post(
        "/export_to_ehr",
        json={"note": "hi"},
        headers=auth_header(token_admin),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "exported"



def test_summarize_and_fallback(client, monkeypatch, caplog):

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
    with caplog.at_level(logging.ERROR):
        resp = client.post(
            "/summarize", json={"text": long_text}, headers=auth_header(token)
        )
    assert resp.status_code == 200
    assert len(resp.json()["summary"]) <= 203  # truncated fallback
    assert "Error during summary LLM call" in caplog.text


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
        main,
        "diarize_and_transcribe",
        lambda b: {
            "provider": "p",
            "patient": "q",
            "segments": [
                {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "p"},
                {"speaker": "patient", "start": 0.0, "end": 0.0, "text": "q"},
            ],
        },
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
    assert resp.json() == {
        "provider": "p",
        "patient": "q",
        "segments": [
            {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "p"},
            {"speaker": "patient", "start": 0.0, "end": 0.0, "text": "q"},
        ],
    }

    resp = client.post("/transcribe", headers=auth_header(token))
    assert resp.status_code == 422


def test_transcribe_endpoint_diarise_failure(client, monkeypatch):
    import backend.audio_processing as ap

    class FailPipeline:
        @classmethod
        def from_pretrained(cls, name):  # noqa: ARG002
            raise RuntimeError("boom")

    monkeypatch.setattr(ap, "Pipeline", FailPipeline)
    monkeypatch.setattr(ap, "_DIARISATION_AVAILABLE", True)
    monkeypatch.setattr(ap, "simple_transcribe", lambda b: "fallback")
    token = main.create_token("u", "user")
    resp = client.post(
        "/transcribe?diarise=true",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    data = resp.json()
    assert data["provider"] == "fallback"
    assert data["segments"] == [
        {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "fallback"}
    ]
    assert "error" in data


def test_transcribe_endpoint_offline(client, monkeypatch):
    import backend.audio_processing as ap

    class DummyModel:
        def transcribe(self, path):  # noqa: ARG002
            return {"text": "offline text"}

    monkeypatch.setattr(ap, "_load_local_model", lambda: DummyModel())
    monkeypatch.setenv("OFFLINE_TRANSCRIBE", "true")
    monkeypatch.setattr(ap, "get_api_key", lambda: None)
    token = main.create_token("u", "user")
    resp = client.post(
        "/transcribe",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    data = resp.json()
    assert data["provider"] == "offline text"
    assert data["segments"] == [
        {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "offline text"}
    ]


def test_get_last_transcript(client, monkeypatch):
    monkeypatch.setattr(main, "simple_transcribe", lambda b: "hello")
    monkeypatch.setattr(
        main,
        "diarize_and_transcribe",
        lambda b: {
            "provider": "p",
            "patient": "q",
            "segments": [
                {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "p"},
                {"speaker": "patient", "start": 0.0, "end": 0.0, "text": "q"},
            ],
        },
    )
    token = main.create_token("u", "user")
    # First call without diarisation
    client.post(
        "/transcribe",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    resp = client.get("/transcribe", headers=auth_header(token))
    assert resp.json() == {
        "provider": "hello",
        "patient": "",
        "segments": [
            {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "hello"}
        ],
    }

    # Now call with diarisation and ensure both parts returned
    client.post(
        "/transcribe?diarise=true",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    resp = client.get("/transcribe", headers=auth_header(token))
    assert resp.json() == {
        "provider": "p",
        "patient": "q",
        "segments": [
            {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "p"},
            {"speaker": "patient", "start": 0.0, "end": 0.0, "text": "q"},
        ],
    }


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


def test_beautify_and_fallback(client, monkeypatch, caplog):
    monkeypatch.setattr(main, "call_openai", lambda msgs: "nice note")
    token = main.create_token("u", "user")
    resp = client.post(
        "/beautify", json={"text": "hello"}, headers=auth_header(token)
    )
    assert resp.json()["beautified"] == "nice note"

    def fail(_):
        raise ValueError("bad")

    monkeypatch.setattr(main, "call_openai", fail)
    with caplog.at_level(logging.ERROR):
        resp = client.post(
            "/beautify", json={"text": "hi"}, headers=auth_header(token)
        )
    data = resp.json()
    assert data["beautified"] == "Hi"
    assert data["error"]
    assert "Error during beautify LLM call" in caplog.text


def test_suggest_and_fallback(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "call_openai",
        lambda msgs: json.dumps(
            {
                "codes": [{"code": "A1"}],
                "compliance": ["c"],
                "publicHealth": [{"recommendation": "p", "reason": "r"}],
                "differentials": [{"diagnosis": "d", "score": 0.1}],
            }
        ),
    )
    token = main.create_token("u", "user")
    resp = client.post("/suggest", json={"text": "note"}, headers=auth_header(token))
    data = resp.json()
    assert data["codes"][0]["code"] == "A1"
    assert data["publicHealth"][0]["recommendation"] == "p"
    assert data["differentials"][0]["diagnosis"] == "d"


def test_suggest_returns_follow_up(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "call_openai",
        lambda msgs: json.dumps(
            {
                "codes": [{"code": "E11.9"}],
                "compliance": [],
                "publicHealth": [],
                "differentials": [],
            }
        ),
    )
    token = main.create_token("u", "user")
    resp = client.post("/suggest", json={"text": "diabetes"}, headers=auth_header(token))
    data = resp.json()
    assert data["followUp"] == "3 months"
    

def test_suggest_with_demographics(client, monkeypatch):
    def fake_call_openai(msgs):
        user = msgs[1]["content"]
        assert "HPV vaccine" in user
        assert "Pap smear" in user
        return json.dumps(
            {
                "codes": [],
                "compliance": [],
                "publicHealth": [],
                "differentials": [],
            }
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

    def fake_guidelines(age, sex, region):
        assert age == 50
        assert sex == "male"
        assert region == "US"
        return {
            "vaccinations": ["Shingles vaccine"],
            "screenings": ["Colon cancer screening"],
        }

    monkeypatch.setattr(main.public_health_api, "get_guidelines", fake_guidelines)
    main.public_health_api.clear_cache()

    token_d = main.create_token("u", "user")
    resp = client.post(
        "/suggest",
        json={"text": "note", "age": 50, "sex": "male", "region": "US"},
        headers=auth_header(token_d),
    )
    assert resp.status_code == 200
    data = resp.json()
    recs = [item["recommendation"] for item in data["publicHealth"]]
    assert "Shingles vaccine" in recs
    assert "Colon cancer screening" in recs


def test_suggest_parses_public_health_reason(client, monkeypatch):
    def fake_call_openai(msgs):
        return json.dumps({
            "codes": [],
            "compliance": [],
            "publicHealth": [
                {"recommendation": "Flu shot", "reason": "Prevents influenza"}
            ],
            "differentials": [],
        })

    monkeypatch.setattr(main, "call_openai", fake_call_openai)
    monkeypatch.setattr(prompts, "get_guidelines", lambda *args, **kwargs: {})

    token = main.create_token("u", "user")
    resp = client.post(
        "/suggest",
        json={"text": "note"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["publicHealth"][0]["reason"] == "Prevents influenza"
