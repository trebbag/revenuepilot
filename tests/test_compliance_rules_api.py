import sqlite3
from collections import defaultdict, deque
from typing import Dict, Any

import pytest
from fastapi.testclient import TestClient

from backend import main, compliance as compliance_engine
from backend.main import _init_core_tables


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    main.db_conn = sqlite3.connect(":memory:", check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    _init_core_tables(main.db_conn)
    password = main.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("admin", password, "admin"),
    )
    main.db_conn.commit()
    monkeypatch.setattr(main, "db_conn", main.db_conn)
    monkeypatch.setattr(main, "events", [])
    monkeypatch.setattr(
        main,
        "transcript_history",
        defaultdict(lambda: deque(maxlen=main.TRANSCRIPT_HISTORY_LIMIT)),
    )
    compliance_engine.replace_rules([])
    return TestClient(main.app)


def auth_header(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login(client: TestClient) -> str:
    resp = client.post("/login", json={"username": "admin", "password": "pw"})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def test_compliance_rule_crud_flow(client: TestClient) -> None:
    token = login(client)

    initial_rules = compliance_engine.get_rules()
    initial_count = len(initial_rules)

    rule_payload: Dict[str, Any] = {
        "id": "documentation-check",
        "name": "Documentation completeness",
        "description": "Ensure critical phrases are present.",
        "category": "documentation",
        "severity": "low",
        "type": "presence",
        "keywords": ["assessment"],
        "metadata": {"threshold": 1},
        "references": [{"title": "CMS", "url": "https://example.com"}],
        "recommendedAction": "Add an assessment section.",
    }

    create_resp = client.post(
        "/api/compliance/rules",
        json=rule_payload,
        headers=auth_header(token),
    )
    assert create_resp.status_code == 200
    created_rule = create_resp.json()["rule"]
    assert created_rule["id"] == "documentation-check"
    assert created_rule["keywords"] == ["assessment"]
    assert created_rule["metadata"]["threshold"] == 1
    assert created_rule["references"][0]["title"] == "CMS"

    list_resp = client.get("/api/compliance/rules", headers=auth_header(token))
    assert list_resp.status_code == 200
    listed = list_resp.json()
    assert listed["count"] == initial_count + 1
    assert any(rule["id"] == "documentation-check" for rule in listed["rules"])

    update_payload = {
        "name": "Updated completeness",
        "metadata": {"threshold": None, "severityOverride": "moderate"},
        "references": [{"title": "Updated", "url": "https://example.org"}],
        "recommendedAction": "Document updated findings.",
    }
    update_resp = client.put(
        "/api/compliance/rules/documentation-check",
        json=update_payload,
        headers=auth_header(token),
    )
    assert update_resp.status_code == 200
    updated_rule = update_resp.json()["rule"]
    assert updated_rule["name"] == "Updated completeness"
    assert "threshold" not in updated_rule["metadata"]
    assert updated_rule["metadata"]["severityOverride"] == "moderate"
    assert updated_rule["references"][0]["title"] == "Updated"
    assert updated_rule["recommendedAction"] == "Document updated findings."

    delete_resp = client.delete(
        "/api/compliance/rules/documentation-check",
        headers=auth_header(token),
    )
    assert delete_resp.status_code == 200
    assert delete_resp.json()["status"] == "deleted"

    final_resp = client.get("/api/compliance/rules", headers=auth_header(token))
    assert final_resp.status_code == 200
    final_rules = final_resp.json()
    assert final_rules["count"] == initial_count

    missing_delete = client.delete(
        "/api/compliance/rules/documentation-check",
        headers=auth_header(token),
    )
    assert missing_delete.status_code == 404

