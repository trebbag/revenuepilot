import json
import sqlite3
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from backend import main


@pytest.fixture()
def suggestion_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT, clinic_id TEXT)"
    )
    password_hash = main.hash_password("pw")
    db.execute(
        "INSERT INTO users (username, password_hash, role, clinic_id) VALUES (?, ?, ?, ?)",
        ("user", password_hash, "user", None),
    )
    db.commit()
    monkeypatch.setattr(main, "db_conn", db)
    client = TestClient(main.app)
    try:
        yield client
    finally:
        client.close()
        db.close()


@pytest.fixture()
def auth_header() -> Dict[str, str]:
    token = main.create_token("user", "user")
    return {"Authorization": f"Bearer {token}"}


def test_codes_suggest_normalizes_contract(
    suggestion_client: TestClient, auth_header: Dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: Dict[str, Any] = {}

    def fake_call(messages: List[Dict[str, Any]]) -> str:
        captured["messages"] = messages
        return json.dumps(
            {
                "suggestions": [
                    {
                        "code": "99213",
                        "type": "cpt",
                        "description": "Office visit",
                        "confidence": 0.42,
                        "rationale": "Moderate complexity established visit",
                        "whatItIs": "Office visit for established patient",
                        "usageRules": ["Document total time or MDM"],
                        "reasonsSuggested": ["Medication management discussed"],
                        "potentialConcerns": ["Ensure time statement present"],
                    }
                ]
            }
        )

    monkeypatch.setattr(main, "call_openai", fake_call)

    response = suggestion_client.post(
        "/api/ai/codes/suggest",
        json={
            "content": "Example clinical encounter",
            "codes": ["I10"],
            "correlation_id": "ctx-1",
            "context_stage": "deep",
            "context_generated_at": "2024-01-01T00:00:00Z",
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload.get("suggestions"), list)
    assert len(payload["suggestions"]) == 1

    item = payload["suggestions"][0]
    assert set(item.keys()) == {
        "code",
        "confidence",
        "description",
        "potentialConcerns",
        "rationale",
        "reasonsSuggested",
        "reasoning",
        "type",
        "usageRules",
        "whatItIs",
    }
    assert item["confidence"] == 42
    assert item["type"] == "CPT"
    assert item["usageRules"] == ["Document total time or MDM"]
    assert item["reasonsSuggested"] == ["Medication management discussed"]
    assert item["potentialConcerns"] == ["Ensure time statement present"]
    assert item["reasoning"]

    messages = captured.get("messages") or []
    assert any("Context stage: deep" in msg.get("content", "") for msg in messages if msg.get("role") == "user")
    assert any("ctx-1" in msg.get("content", "") for msg in messages if msg.get("role") == "user")


def test_codes_suggest_dedupes_existing_codes(
    suggestion_client: TestClient, auth_header: Dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_call(_messages: List[Dict[str, Any]]) -> str:
        return json.dumps(
            {
                "suggestions": [
                    {
                        "code": "12345",
                        "type": "CPT",
                        "description": "Duplicate code",
                        "confidence": 0.9,
                        "rationale": "",
                    }
                ]
            }
        )

    monkeypatch.setattr(main, "call_openai", fake_call)

    response = suggestion_client.post(
        "/api/ai/codes/suggest",
        json={"content": "note", "codes": ["12345"]},
        headers=auth_header,
    )
    assert response.status_code == 200
    assert response.json()["suggestions"] == []


def test_differentials_include_all_fields(
    suggestion_client: TestClient, auth_header: Dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_call(_messages: List[Dict[str, Any]]) -> str:
        return json.dumps(
            {
                "differentials": [
                    {
                        "diagnosis": "Heart failure",
                        "confidence": 0.55,
                        "supportingFactors": ["Dyspnea"],
                        "contradictingFactors": ["Normal BNP"],
                        "testsToConfirm": ["Echocardiogram"],
                        "testsToExclude": ["Stress test"],
                        "whatItIs": "Pump failure",
                        "details": "Evaluate fluid status",
                        "confidenceFactors": "Symptoms align but labs pending",
                        "learnMoreUrl": "https://example.org",
                    }
                ]
            }
        )

    monkeypatch.setattr(main, "call_openai", fake_call)

    response = suggestion_client.post(
        "/api/ai/differentials/generate",
        json={"content": "note", "context_stage": "indexed"},
        headers=auth_header,
    )
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body.get("differentials"), list)
    assert len(body["differentials"]) == 1
    diff = body["differentials"][0]
    assert set(diff.keys()) == {
        "againstFactors",
        "confidence",
        "confidenceFactors",
        "contradictingFactors",
        "details",
        "diagnosis",
        "icdCode",
        "icdDescription",
        "learnMoreUrl",
        "reasoning",
        "supportingFactors",
        "testsToConfirm",
        "testsToExclude",
        "whatItIs",
        "forFactors",
    }
    assert diff["confidence"] == 55
    assert diff["icdCode"] == "Heart failure"
    assert diff["forFactors"] == ["Dyspnea"]
    assert diff["againstFactors"] == ["Normal BNP"]


def test_prevention_items_are_normalized(
    suggestion_client: TestClient, auth_header: Dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_call(_messages: List[Dict[str, Any]]) -> str:
        return json.dumps(
            {
                "recommendations": [
                    {
                        "id": "rec-1",
                        "code": "3044F",
                        "recommendation": "Order A1c",
                        "confidence": 0.7,
                        "reasoning": "Diabetes without recent A1c",
                        "priority": "routine",
                        "source": "ADA",
                        "ageRelevant": True,
                        "description": "Annual A1c testing",
                        "rationale": "Guideline supported",
                    }
                ]
            }
        )

    monkeypatch.setattr(main, "call_openai", fake_call)

    response = suggestion_client.post(
        "/api/ai/prevention/suggest",
        json={"demographics": {"age": 55, "sex": "F"}},
        headers=auth_header,
    )
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body.get("recommendations"), list)
    assert len(body["recommendations"]) == 1
    rec = body["recommendations"][0]
    assert set(rec.keys()) == {
        "ageRelevant",
        "category",
        "code",
        "confidence",
        "description",
        "id",
        "priority",
        "rationale",
        "reasoning",
        "recommendation",
        "source",
        "type",
    }
    assert rec["type"] == "PREVENTION"
    assert rec["category"] == "prevention"
    assert rec["confidence"] == 70
    assert rec["ageRelevant"] is True
