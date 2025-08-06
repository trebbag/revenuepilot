import sqlite3

from fastapi.testclient import TestClient

from backend import main, migrations


def _setup_db(monkeypatch):
    """Create an in-memory database with users and settings tables."""
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)"
    )
    migrations.ensure_settings_table(db)
    pwd = main.hash_password("pw")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?,?,?)",
        ("alice", pwd, "user"),
    )
    db.commit()
    monkeypatch.setattr(main, "db_conn", db)
    return db


def test_settings_roundtrip(monkeypatch):
    """Saving settings should persist and be returned on subsequent fetches."""
    _setup_db(monkeypatch)
    client = TestClient(main.app)
    token = main.create_token("alice", "user")

    prefs = {
        "theme": "dark",
        "categories": {
            "codes": True,
            "compliance": False,
            "publicHealth": True,
            "differentials": True,
        },
        "rules": ["r1"],
        "lang": "es",
        "specialty": "cardiology",
        "payer": "medicare",
        "region": "us",
        "agencies": ["CDC"],
        "template": -1,

    }

    resp = client.post(
        "/settings", json=prefs, headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200

    resp = client.get("/settings", headers={"Authorization": f"Bearer {token}"})
    data = resp.json()
    assert data["theme"] == "dark"
    assert data["categories"]["compliance"] is False
    assert data["lang"] == "es"
    assert data["specialty"] == "cardiology"
    assert data["payer"] == "medicare"
    assert data["region"] == "us"
    assert data["agencies"] == ["CDC"]
    assert data["template"] == -1


