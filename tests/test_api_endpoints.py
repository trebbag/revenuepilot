import json
import sqlite3
import hashlib
import logging
import time
from collections import defaultdict, deque



import pytest
from fastapi.testclient import TestClient

from backend import main, prompts, migrations, ehr_integration
from backend.main import _init_core_tables


@pytest.fixture
def client(monkeypatch, tmp_path):
    # Isolate database and events
    main.reset_export_workers_for_tests()
    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    _init_core_tables(main.db_conn)
    migrations.ensure_settings_table(main.db_conn)
    pwd = main.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("admin", pwd, "admin"),
    )
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("user", pwd, "user"),
    )
    main.db_conn.commit()
    monkeypatch.setattr(main, "db_conn", main.db_conn)
    monkeypatch.setattr(main, "events", [])
    monkeypatch.setattr(
        main,
        "transcript_history",
        defaultdict(lambda: deque(maxlen=main.TRANSCRIPT_HISTORY_LIMIT)),
    )
    main.reset_export_workers_for_tests()
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
    assert client.post('/export', json={'note': 'hi'}).status_code in {401, 403}
    assert (
        client.post('/api/notes/pre-finalize-check', json={'content': 'hi'}).status_code
        in {401, 403}
    )
    assert (
        client.post('/api/notes/finalize', json={'content': 'hi'}).status_code
        in {401, 403}
    )


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
    assert data["theme"] == main.DEFAULT_THEME_ID
    assert data["lang"] == "en"
    assert data["specialty"] is None
    assert data["payer"] is None
    assert data["region"] == ""
    assert data["agencies"] == ["CDC", "WHO"]

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
        "agencies": ["CDC"],
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
    assert data["agencies"] == ["CDC"]

    # second user should still see default settings
    token_user = client.post(
        "/login", json={"username": "user", "password": "pw"}
    ).json()["access_token"]
    resp = client.get("/settings", headers=auth_header(token_user))
    other = resp.json()
    assert other["theme"] == main.DEFAULT_THEME_ID
    assert other["lang"] == "en"
    assert other["region"] == ""

    # unauthenticated request should fail
    resp = client.get("/settings")
    assert resp.status_code in {401, 403}


def test_available_themes_endpoint(client):
    resp = client.get("/api/themes/available")
    assert resp.status_code == 200
    payload = resp.json()
    if isinstance(payload, dict) and "data" in payload:
        payload = payload["data"]

    theme_ids = {item["id"] for item in payload["themes"]}
    assert payload["default"] == main.DEFAULT_THEME_ID
    assert main.DEFAULT_THEME_ID in theme_ids
    assert {"modern", "dark", "warm"}.issubset(theme_ids)
    for entry in payload["themes"]:
        assert "name" in entry and entry["name"]
        assert "description" in entry and entry["description"]


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
    events_payload = resp.json()
    if isinstance(events_payload, dict) and "data" in events_payload:
        events_payload = events_payload["data"]
    assert len(events_payload) == 1

    resp = client.get("/metrics", headers=auth_header(token_admin))
    assert resp.status_code == 200
    assert resp.json()["current"]["total_notes"] >= 1


def test_export_requires_auth(client, monkeypatch):
    # invalid token should return 401
    resp = client.post(
        "/export",
        json={"note": "hi"},
        headers=auth_header("badtoken"),
    )
    assert resp.status_code == 401

    # user token succeeds
    token_user = client.post(
        "/login", json={"username": "user", "password": "pw"}
    ).json()["access_token"]

    def fake_post(
        note,
        codes,
        patient_id=None,
        encounter_id=None,
        procedures=None,
        medications=None,
    ):
        assert note == "hi"
        assert codes == []
        assert patient_id is None
        assert encounter_id is None
        assert procedures == [] or procedures is None
        assert medications == [] or medications is None
        return {"status": "exported"}

    monkeypatch.setattr(ehr_integration, "post_note_and_codes", fake_post)

    resp = client.post(
        "/export",
        json={"note": "hi"},
        headers=auth_header(token_user),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "exported"


def test_ai_beautify_alias(client):
    token = client.post(
        "/login", json={"username": "user", "password": "pw"}
    ).json()["access_token"]
    resp = client.post(
        "/api/ai/beautify",
        json={"text": "hello", "useOfflineMode": True},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert "beautified" in resp.json()


def test_formatting_rules_endpoint(client):
    token = client.post(
        "/login", json={"username": "user", "password": "pw"}
    ).json()["access_token"]
    uid = main.db_conn.execute(
        "SELECT id FROM users WHERE username=?", ("user",)
    ).fetchone()[0]
    main.db_conn.execute(
        "INSERT OR REPLACE INTO settings (user_id, theme, categories, rules, lang, summary_lang, specialty, payer, region, template, use_local_models, agencies, beautify_model, suggest_model, summarize_model, deid_engine, use_offline_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            uid,
            "light",
            json.dumps({}),
            json.dumps(["uppercase headings"]),
            "en",
            "en",
            None,
            None,
            "",
            None,
            0,
            json.dumps(["CDC", "WHO"]),
            None,
            None,
            None,
            "regex",
            0,
        ),
    )
    main.db_conn.commit()
    resp = client.get("/api/formatting/rules", headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()["rules"] == ["uppercase headings"]


def test_export_ehr_tracking(client, monkeypatch):
    token = client.post(
        "/login", json={"username": "user", "password": "pw"}
    ).json()["access_token"]

    def fake_post(note, codes, patient_id=None, encounter_id=None, procedures=None, medications=None):
        return {"status": "exported"}

    monkeypatch.setattr(ehr_integration, "post_note_and_codes", fake_post)
    resp = client.post(
        "/api/export/ehr",
        json={"note": "n"},
        headers=auth_header(token),
    )
    data = resp.json()
    assert data["status"] == "queued"
    assert data["progress"] == 0.0
    export_id = data["exportId"]
    assert export_id is not None

    poll_data = None
    for _ in range(10):
        resp = client.get(
            f"/api/export/ehr/{export_id}", headers=auth_header(token)
        )
        assert resp.status_code == 200
        poll_data = resp.json()
        if poll_data["status"] in {"exported", "bundle"}:
            break
        time.sleep(0.05)

    assert poll_data is not None
    assert poll_data["status"] == "exported"
    assert poll_data.get("progress") == 1.0



def test_summarize_and_fallback(client, monkeypatch, caplog):

    monkeypatch.setattr(
        main,
        "call_openai",
        lambda msgs: json.dumps(
            {"summary": "great summary", "recommendations": ["do"], "warnings": []}
        ),
    )
    token = main.create_token("u", "user")
    resp = client.post(
        "/summarize", json={"text": "hello"}, headers=auth_header(token)
    )
    data = resp.json()
    assert data["summary"] == "great summary"
    assert data["recommendations"] == ["do"]
    assert data["warnings"] == []
    assert data["patient_friendly"] == data["summary"]

    def boom(_):
        raise RuntimeError("no key")

    monkeypatch.setattr(main, "call_openai", boom)
    long_text = "a" * 300
    with caplog.at_level(logging.ERROR):
        resp = client.post(
            "/summarize", json={"text": long_text}, headers=auth_header(token)
        )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["summary"]) <= 203  # truncated fallback
    assert data["recommendations"] == []
    assert data["warnings"] == []
    assert data["patient_friendly"] == data["summary"]
    assert "Error during summary LLM call" in caplog.text


def test_summarize_spanish_language(client, monkeypatch):
    def fake_call_openai(msgs):
        # Ensure the system prompt is in Spanish and includes age guidance
        assert "comunicador clínico" in msgs[0]["content"]
        assert "10-year-old" in msgs[0]["content"]
        return json.dumps(
            {"summary": "resumen", "recommendations": [], "warnings": []}
        )

    monkeypatch.setattr(main, "call_openai", fake_call_openai)
    token = main.create_token("u", "user")
    resp = client.post(
        "/summarize",
        json={"text": "hola", "lang": "es", "patientAge": 10},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["summary"] == "resumen"
    assert resp.json()["patient_friendly"] == "resumen"


def test_transcribe_endpoint(client, monkeypatch):
    monkeypatch.setattr(main, "simple_transcribe", lambda b, language=None: "hello")
    monkeypatch.setattr(
        main,
        "diarize_and_transcribe",
        lambda b, language=None: {
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
    data = resp.json()
    if isinstance(data, dict) and "data" in data:
        data = data["data"]
    assert data["provider"] == "hello"

    resp = client.post(
        "/transcribe?diarise=true",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    diarised = resp.json()
    if isinstance(diarised, dict) and "data" in diarised:
        diarised = diarised["data"]
    assert diarised == {
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
    monkeypatch.setattr(ap, "_transcribe_bytes", lambda b, language=None: ("fallback", ""))
    token = main.create_token("u", "user")
    resp = client.post(
        "/transcribe?diarise=true",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    data = resp.json()
    if isinstance(data, dict) and "data" in data:
        data = data["data"]
    assert data["provider"] == "fallback"
    assert data["segments"] == [
        {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "fallback"}
    ]
    assert "error" in data


def test_transcribe_language_param(client, monkeypatch):
    captured = {}
    monkeypatch.setattr(
        main, "simple_transcribe", lambda b, language=None: captured.setdefault("lang", language) or "text"
    )
    token = main.create_token("u", "user")
    client.post(
        "/transcribe?lang=es",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    assert captured["lang"] == "es"


def test_transcribe_endpoint_offline(client, monkeypatch):
    import backend.audio_processing as ap

    class DummyModel:
        def transcribe(self, path, language=None):  # noqa: ARG002
            return {"text": "offline text"}

    monkeypatch.setattr(ap, "_load_local_model", lambda lang: DummyModel())
    monkeypatch.setenv("OFFLINE_TRANSCRIBE", "true")
    monkeypatch.setattr(ap, "get_api_key", lambda: None)
    token = main.create_token("u", "user")
    resp = client.post(
        "/transcribe",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    data = resp.json()
    if isinstance(data, dict) and "data" in data:
        data = data["data"]
    assert data["provider"] == "offline text"
    assert data["segments"] == [
        {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "offline text"}
    ]


def test_get_last_transcript(client, monkeypatch):
    monkeypatch.setattr(main, "simple_transcribe", lambda b, language=None: "hello")
    monkeypatch.setattr(
        main,
        "diarize_and_transcribe",
        lambda b, language=None: {
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
    history = resp.json()
    if isinstance(history, dict) and "data" in history:
        history = history["data"]
    assert history == {
        "history": [
            {
                "provider": "hello",
                "patient": "",
                "segments": [
                    {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "hello"}
                ],
            }
        ]
    }

    # Now call with diarisation and ensure both parts returned
    client.post(
        "/transcribe?diarise=true",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    resp = client.get("/transcribe", headers=auth_header(token))
    history = resp.json()
    if isinstance(history, dict) and "data" in history:
        history = history["data"]
    assert history == {
        "history": [
            {
                "provider": "hello",
                "patient": "",
                "segments": [
                    {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "hello"}
                ],
            },
            {
                "provider": "p",
                "patient": "q",
                "segments": [
                    {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "p"},
                    {"speaker": "patient", "start": 0.0, "end": 0.0, "text": "q"},
                ],
            },
        ]
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
                "publicHealth": [
                    {
                        "recommendation": "p",
                        "reason": "r",
                        "source": "CDC",
                        "evidenceLevel": "A",
                    }
                ],
                "differentials": [{"diagnosis": "d", "score": 0.1}],
            }
        ),
    )
    token = main.create_token("u", "user")
    resp = client.post("/suggest", json={"text": "note"}, headers=auth_header(token))
    data = resp.json()
    assert data["codes"][0]["code"] == "A1"
    assert data["publicHealth"][0]["recommendation"] == "p"
    assert data["publicHealth"][0]["source"] == "CDC"
    assert data["differentials"][0]["diagnosis"] == "d"
    assert "questions" in data


def test_suggest_logs_confidence_scores(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "call_openai",
        lambda msgs: json.dumps(
            {
                "codes": [{"code": "X1", "confidence": 0.8}],
                "compliance": [],
                "publicHealth": [],
                "differentials": [],
            }
        ),
    )
    token = main.create_token("user", "user")
    resp = client.post(
        "/suggest",
        json={"text": "note", "noteId": "note-123"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    rows = main.db_conn.execute(
        "SELECT user_id, note_id, code, confidence, accepted FROM confidence_scores"
    ).fetchall()
    assert len(rows) == 1
    stored = rows[0]
    user_row = main.db_conn.execute(
        "SELECT id FROM users WHERE username=?",
        ("user",),
    ).fetchone()
    assert stored["user_id"] == user_row["id"]
    assert stored["note_id"] == "note-123"
    assert stored["code"] == "X1"
    assert stored["accepted"] == 0
    assert stored["confidence"] == pytest.approx(0.8)


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
    assert data["followUp"]["interval"] == "3 months"
    assert "BEGIN:VCALENDAR" in data["followUp"]["ics"]
    

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
    monkeypatch.setattr(
        main.public_health_api, "get_public_health_suggestions", lambda *args, **kwargs: []
    )

    def fake_ph(age, sex, region, agencies=None):
        assert age == 50
        assert sex == "male"
        assert region == "US"
        return [
            {
                "recommendation": "Shingles vaccine",
                "source": "CDC",
                "evidenceLevel": "A",
            },
            {
                "recommendation": "Colon cancer screening",
                "source": "WHO",
                "evidenceLevel": "B",
            },
        ]

    monkeypatch.setattr(
        main.public_health_api, "get_public_health_suggestions", fake_ph
    )
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


def test_pre_finalize_and_finalize(client):
    token = main.create_token("u", "user")
    payload = {
        "content": "Patient is stable with follow up plan.",
        "codes": ["99213"],
        "prevention": ["flu shot"],
        "diagnoses": ["J10.1"],
        "differentials": ["J00"],
        "compliance": ["HIPAA"],
    }
    resp = client.post(
        "/api/notes/pre-finalize-check",
        json=payload,
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["canFinalize"] is True
    assert data["estimatedReimbursement"] == 75.0
    assert data["requiredFields"] == []
    assert data["missingDocumentation"] == []
    assert data["stepValidation"]["contentReview"]["passed"] is True
    assert data["stepValidation"]["codeVerification"]["passed"] is True
    assert data["complianceIssues"]
    assert data["reimbursementSummary"]["codes"] == [{"code": "99213", "amount": 75.0}]

    resp2 = client.post(
        "/api/notes/finalize",
        json=payload,
        headers=auth_header(token),
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["exportReady"] is True
    assert data2["reimbursementSummary"]["total"] == 75.0
    assert data2["exportStatus"] == "complete"
    assert data2["requiredFields"] == []
    assert data2["missingDocumentation"] == []
    assert data2["stepValidation"]["contentReview"]["passed"] is True
    assert data2["complianceCertification"]["status"] == "pass"
    assert data2["complianceCertification"]["issuesReviewed"]
    assert isinstance(data2["finalizedNoteId"], str)


def test_pre_finalize_detects_issues(client):
    token = main.create_token("u", "user")
    payload = {
        "content": "",
        "codes": ["99999"],
        "prevention": [],
        "diagnoses": [],
        "differentials": [],
        "compliance": [],
    }
    resp = client.post(
        "/api/notes/pre-finalize-check",
        json=payload,
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["canFinalize"] is False
    assert data["issues"]["content"]
    assert data["issues"]["codes"]
    assert "content" in data["requiredFields"]
    assert data["missingDocumentation"]
    assert data["stepValidation"]["contentReview"]["passed"] is False
    assert data["stepValidation"]["codeVerification"]["passed"] is False
    assert data["complianceIssues"]

    resp2 = client.post(
        "/api/notes/finalize",
        json=payload,
        headers=auth_header(token),
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["exportReady"] is False
    assert data2["exportStatus"] == "pending"
    assert data2["complianceCertification"]["status"] == "fail"
    assert data2["missingDocumentation"]
    assert data2["stepValidation"]["contentReview"]["passed"] is False
    assert data2["issues"]["codes"]


def test_codes_suggest_gating_blocks_redundant_requests(client, monkeypatch):
    monkeypatch.setattr(main, "USE_OFFLINE_MODEL", True)
    monkeypatch.setattr(main, "_MIN_SECONDS_BETWEEN_REQUESTS", 0.0)
    main._SUGGESTION_GATE_STATES.clear()
    token = main.create_token("gate", "user")
    payload = {
        "content": "HPI: Patient stable with chronic issues documented thoroughly for testing.",
        "useOfflineMode": True,
    }
    resp1 = client.post("/api/ai/codes/suggest", json=payload, headers=auth_header(token))
    assert resp1.status_code == 200
    assert "questions" in resp1.json()
    resp2 = client.post("/api/ai/codes/suggest", json=payload, headers=auth_header(token))
    assert resp2.status_code == 409
    assert resp2.json()["message"] == main._NO_MEANINGFUL_CHANGES_MESSAGE
    slight = {**payload, "content": payload["content"] + "!"}
    resp3 = client.post("/api/ai/codes/suggest", json=slight, headers=auth_header(token))
    assert resp3.status_code == 409


def test_codes_suggest_gating_allows_new_section(client, monkeypatch):
    monkeypatch.setattr(main, "USE_OFFLINE_MODEL", True)
    monkeypatch.setattr(main, "_MIN_SECONDS_BETWEEN_REQUESTS", 0.0)
    main._SUGGESTION_GATE_STATES.clear()
    token = main.create_token("gate2", "user")
    base_content = "HPI: Patient with cough responding to therapy. Assessment: Continue management per plan."
    first = client.post(
        "/api/ai/codes/suggest",
        json={"content": base_content, "useOfflineMode": True},
        headers=auth_header(token),
    )
    assert first.status_code == 200
    follow_up = client.post(
        "/api/ai/codes/suggest",
        json={"content": base_content + "\nPLAN:\nReassess in clinic.", "useOfflineMode": True},
        headers=auth_header(token),
    )
    assert follow_up.status_code == 200
