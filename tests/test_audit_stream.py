import sqlite3
from types import SimpleNamespace

import backend.main as bm


def _setup_memory_db() -> None:
    bm.db_conn = sqlite3.connect(":memory:", check_same_thread=False)
    bm.db_conn.row_factory = sqlite3.Row
    bm._init_core_tables(bm.db_conn)


def test_audit_log_streams_to_siem(monkeypatch):
    _setup_memory_db()
    bm.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("auditor", "hash", "admin"),
    )
    bm.db_conn.commit()

    url = "https://siem.example.com/hook"
    monkeypatch.setenv("SIEM_WEBHOOK_URL", url)
    monkeypatch.setenv("SIEM_WEBHOOK_TIMEOUT", "2")
    monkeypatch.setattr(bm, "SIEM_WEBHOOK_URL", url)
    monkeypatch.setattr(bm, "SIEM_WEBHOOK_TIMEOUT", 2.0)

    captured: dict[str, object] = {}

    def fake_secure_post(target, json=None, timeout=None, **kwargs):  # noqa: ANN001
        captured["url"] = target
        captured["json"] = json
        captured["timeout"] = timeout
        return SimpleNamespace(status_code=200)

    monkeypatch.setattr(bm, "secure_post", fake_secure_post)

    bm._insert_audit_log(
        "auditor",
        "login_success",
        {"ip": "10.0.0.1"},
        success=True,
        ip_address="10.0.0.1",
        user_agent="pytest",
        clinic_id="clinic-42",
    )

    event = captured["json"]
    assert captured["url"] == url
    assert event["username"] == "auditor"
    assert event["action"] == "login_success"
    assert event["clinic_id"] == "clinic-42"
    assert event["ip_address"] == "10.0.0.1"
    assert event["success"] is True
    assert "10.0.0.1" in (event["details"] or "")
    assert event["timestamp"]
    assert event["user_id"]
