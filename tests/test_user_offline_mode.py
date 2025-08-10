import importlib
import sqlite3

from fastapi.testclient import TestClient

from backend import main as main_module


def setup_user(db):
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
    )
    db.execute(
        "CREATE TABLE settings (user_id INTEGER PRIMARY KEY, theme TEXT, categories TEXT, rules TEXT, lang TEXT, summary_lang TEXT, specialty TEXT, payer TEXT, region TEXT, template INTEGER, use_local_models INTEGER, agencies TEXT, beautify_model TEXT, suggest_model TEXT, summarize_model TEXT, deid_engine TEXT, use_offline_mode INTEGER)"
    )
    pwd = main_module.hash_password("pw")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("u", pwd, "user"),
    )
    db.commit()


def test_per_user_offline_mode(monkeypatch):
    monkeypatch.delenv("USE_OFFLINE_MODEL", raising=False)
    importlib.reload(main_module)
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    setup_user(db)
    monkeypatch.setattr(main_module, "db_conn", db)
    monkeypatch.setattr(main_module, "events", [])
    client = TestClient(main_module.app)
    token = main_module.create_token("u", "user")

    # Initially no settings row so offline not active
    r1 = client.post("/beautify", json={"text": "x"}, headers={"Authorization": f"Bearer {token}"})
    assert r1.status_code == 200
    assert not r1.json()["beautified"].startswith("Beautified (offline):")  # live path fallback (capitalisation) likely

    # Save settings enabling offline mode
    payload = {
        "theme": "modern",
        "categories": {"codes": True, "compliance": True, "publicHealth": True, "differentials": True},
        "rules": [],
        "lang": "en",
        "summaryLang": "en",
        "specialty": None,
        "payer": None,
        "region": "",
        "template": None,
        "useLocalModels": False,
        "useOfflineMode": True,
        "agencies": ["CDC", "WHO"],
        "beautifyModel": None,
        "suggestModel": None,
        "summarizeModel": None,
        "deid_engine": "regex"
    }
    r_set = client.post("/settings", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert r_set.status_code == 200

    r2 = client.post("/beautify", json={"text": "hello"}, headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["beautified"].startswith("Beautified (offline):")


def test_request_override(monkeypatch):
    monkeypatch.delenv("USE_OFFLINE_MODEL", raising=False)
    importlib.reload(main_module)
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    setup_user(db)
    monkeypatch.setattr(main_module, "db_conn", db)
    monkeypatch.setattr(main_module, "events", [])
    client = TestClient(main_module.app)
    token = main_module.create_token("u", "user")

    # Request explicit offline override without saved setting
    r = client.post("/summarize", json={"text": "abc", "useOfflineMode": True}, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["summary"].startswith("Summary (offline):")
