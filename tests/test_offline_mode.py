import json
import sqlite3
import importlib
import sqlite3

import pytest
from fastapi.testclient import TestClient

import backend.main as main
from backend.main import _init_core_tables


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def offline_client(monkeypatch):
    """Return a TestClient with offline model mode enabled."""
    monkeypatch.setenv("USE_OFFLINE_MODEL", "true")
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    from backend import main as main_module
    importlib.reload(main_module)

    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    _init_core_tables(main.db_conn)

    pwd = main_module.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("u", pwd, "user"),
    )
    main.db_conn.commit()
    monkeypatch.setattr(main_module, "db_conn", main.db_conn)
    monkeypatch.setattr(main_module, "events", [])
    client = TestClient(main_module.app)
    yield client, main_module
    monkeypatch.delenv("USE_OFFLINE_MODEL", raising=False)
    monkeypatch.delenv("USE_LOCAL_MODELS", raising=False)
    importlib.reload(main_module)


def test_offline_beautify(offline_client):
    client, main_module = offline_client
    token = main_module.create_token("u", "user")
    payload = {"text": "hello"}
    resp1 = client.post("/beautify", json=payload, headers=auth_header(token))
    resp2 = client.post("/beautify", json=payload, headers=auth_header(token))
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp1.json()["beautified"] == "Beautified (offline): hello"
    assert resp1.json()["beautified"] == resp2.json()["beautified"]


def test_offline_suggest(offline_client):
    client, main_module = offline_client
    token = main_module.create_token("u", "user")
    payload = {"text": "note"}
    r1 = client.post("/suggest", json=payload, headers=auth_header(token)).json()
    r2 = client.post("/suggest", json=payload, headers=auth_header(token)).json()
    assert r1 == r2
    assert r1["codes"]
    assert r1["compliance"]
    assert r1["publicHealth"]
    assert r1["differentials"]
    assert "questions" in r1


def test_offline_summarize(offline_client):
    client, main_module = offline_client
    token = main_module.create_token("u", "user")
    payload = {"text": "hello"}
    r1 = client.post("/summarize", json=payload, headers=auth_header(token))
    r2 = client.post("/summarize", json=payload, headers=auth_header(token))
    assert r1.status_code == 200
    assert r2.status_code == 200
    d1 = r1.json()
    d2 = r2.json()
    assert d1 == d2
    assert d1["summary"]
    assert d1["recommendations"] == []
    assert d1["warnings"] == []


def test_local_models_used_when_available(offline_client, monkeypatch):
    client, main_module = offline_client
    token = main_module.create_token("u", "user")

    sample = {
        "codes": [{"code": "123"}],
        "compliance": ["ok"],
        "publicHealth": [
            {
                "recommendation": "do",
                "reason": "because",
                "source": "CDC",
                "evidenceLevel": "A",
            }
        ],
        "differentials": [{"diagnosis": "dx", "score": 0.1}],
        "questions": [
            {
                "prompt": "Confirm medication changes",
                "why": "Ensures accurate plan documentation",
                "confidence": 0.6,
                "evidence": [],
            }
        ],
    }

    from backend import offline_model as om

    monkeypatch.setattr(om, "beautify", lambda *a, **k: "beautified")
    monkeypatch.setattr(
        om,
        "summarize",
        lambda *a, **k: {"summary": "short", "recommendations": [], "warnings": []},
    )
    monkeypatch.setattr(om, "suggest", lambda *a, **k: sample)

    r1 = client.post("/beautify", json={"text": "x"}, headers=auth_header(token))
    assert r1.json()["beautified"] == "beautified"

    r2 = client.post("/summarize", json={"text": "x"}, headers=auth_header(token))
    assert r2.json()["summary"] == "short"

    r3 = client.post("/suggest", json={"text": "x"}, headers=auth_header(token))
    assert r3.json() == sample

