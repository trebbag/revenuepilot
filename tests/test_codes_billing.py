import json
import sqlite3
import pytest
from fastapi.testclient import TestClient

from backend import main, migrations
from backend.main import _init_core_tables


@pytest.fixture
def client(monkeypatch):
    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    _init_core_tables(main.db_conn)
    migrations.ensure_settings_table(main.db_conn)
    pwd = main.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("user", pwd, "user"),
    )
    main.db_conn.commit()
    monkeypatch.setattr(main, "db_conn", main.db_conn)
    return TestClient(main.app)


def auth_header(token: str):
    return {"Authorization": f"Bearer {token}"}


def get_token(client: TestClient) -> str:
    resp = client.post("/login", json={"username": "user", "password": "pw"})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def test_code_details_batch(client):
    token = get_token(client)
    resp = client.post(
        "/api/codes/details/batch",
        json={"codes": ["99213", "E11.9", "UNKNOWN"]},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    payload = resp.json()
    data = payload.get("data", payload)
    assert len(data) == 3
    assert any(d["code"] == "99213" and d["rvu"] > 0 for d in data)
    assert any(d["code"] == "E11.9" and d["type"] == "ICD-10" for d in data)


def test_billing_calculate(client):
    token = get_token(client)
    resp = client.post(
        "/api/billing/calculate",
        json={"codes": ["99213", "J3490"]},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    payload = resp.json()
    data = payload.get("data", payload)
    assert data["totalEstimated"] == pytest.approx(85.32, rel=1e-2)
    assert data["totalRvu"] == pytest.approx(1.29, rel=1e-2)
    assert len(data["breakdown"]) == 2
    assert data["payerSpecific"]["payerType"].lower() == "commercial"
    assert data["breakdown"]["99213"]["rvu"] == pytest.approx(1.29, rel=1e-2)


def test_validate_combination(client):
    token = get_token(client)
    resp = client.post(
        "/api/codes/validate/combination",
        json={"codes": ["99213", "99214"]},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    payload = resp.json()
    data = payload.get("data", payload)
    assert data["conflicts"]
    assert not data["validCombinations"]


def test_compliance_rule_references(client, monkeypatch):
    token = get_token(client)

    def fake_call_openai(messages):
        return json.dumps(
            {
                "alerts": [
                    {
                        "text": "Chief complaint documentation is missing.",
                        "category": "documentation",
                        "priority": "high",
                    }
                ]
            }
        )

    monkeypatch.setattr(main, "call_openai", fake_call_openai)

    resp = client.post(
        "/api/ai/compliance/check",
        json={"content": "Note missing chief complaint", "codes": []},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    payload = resp.json()
    data = payload.get("data", payload)
    assert data["ruleReferences"], "expected aggregated rule references"
    assert any(
        ref["ruleId"] == "documentation-chief-complaint" for ref in data["ruleReferences"]
    )
    alert = data["alerts"][0]
    assert alert["ruleReferences"], "expected rule references on alert"
    assert alert["ruleReferences"][0]["ruleId"] == "documentation-chief-complaint"
    assert alert["ruleReferences"][0]["citations"], "expected citations for rule"

