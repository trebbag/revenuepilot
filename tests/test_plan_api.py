import json
from datetime import datetime

import pytest

import backend.db.models as db_models
from backend import main


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def create_user(db_session):
    def _create(username: str = "alice", role: str = "user") -> db_models.User:
        user = db_models.User(
            username=username,
            password_hash=main.hash_password("pw"),
            role=role,
        )
        db_session.add(user)
        db_session.commit()
        return user

    return _create


def test_plan_endpoint_parses_model_response(api_client, create_user, monkeypatch):
    create_user("alice")
    token = main.create_token("alice", "user")

    def fake_call(messages):
        return json.dumps(
            {
                "overallRisk": "moderate",
                "summary": "Key risks identified.",
                "generatedAt": datetime.utcnow().isoformat(),
                "risks": [
                    {
                        "name": "Uncontrolled hypertension",
                        "rationale": "Elevated blood pressure readings throughout the visit.",
                        "confidence": 0.86,
                        "evidence": ["BP 152/96 documented in note."],
                    }
                ],
                "interventions": [
                    {
                        "name": "Medication adherence reinforcement",
                        "steps": ["Review medication schedule", "Assess barriers"],
                        "monitoring": ["Check BP log at next visit"],
                        "confidence": 0.78,
                        "evidence": ["Patient reports missed doses"],
                    }
                ],
                "tasks": [
                    {
                        "title": "Schedule nurse follow-up",
                        "assignee": "care_coordinator",
                        "due": "in 7 days",
                        "confidence": 0.65,
                    }
                ],
            }
        )

    monkeypatch.setattr(main, "call_openai", fake_call)

    body = {
        "text": "Patient with persistent hypertension.",
        "encounterType": "Chronic care visit",
        "selectedCodes": [
            {"code": "99213", "description": "Established patient office visit"},
        ],
    }
    resp = api_client.post("/ai/plan", json=body, headers=auth_header(token))
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["overallRisk"] == "moderate"
    assert payload["risks"][0]["name"] == "Uncontrolled hypertension"
    assert payload["interventions"][0]["steps"] == ["Review medication schedule", "Assess barriers"]
    assert payload["tasks"][0]["assignee"] == "care_coordinator"
    assert 0 <= payload["risks"][0]["confidence"] <= 1
    assert "generatedAt" in payload and payload["generatedAt"]


def test_plan_prompt_includes_context(api_client, create_user, monkeypatch):
    create_user("alice")
    token = main.create_token("alice", "user")
    captured = {}

    def fake_call(messages):
        captured["messages"] = messages
        return json.dumps({"risks": [], "interventions": [], "tasks": []})

    monkeypatch.setattr(main, "call_openai", fake_call)

    body = {
        "text": "Encounter with cough and chest tightness.",
        "encounterType": "Acute visit",
        "selectedCodes": [
            {"code": "J20.9", "description": "Acute bronchitis"},
            "99214",
        ],
        "patientMetadata": {"age": 54},
    }
    resp = api_client.post("/ai/plan", json=body, headers=auth_header(token))
    assert resp.status_code == 200
    assert "messages" in captured
    prompt = "\n".join(m["content"] for m in captured["messages"] if "content" in m)
    assert "Acute visit" in prompt
    assert "J20.9" in prompt
    assert "99214" in prompt


def test_plan_endpoint_fallback_on_error(api_client, create_user, monkeypatch):
    create_user("alice")
    token = main.create_token("alice", "user")

    def boom(messages):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(main, "call_openai", boom)

    body = {
        "text": "Follow-up for diabetes management.",
        "encounterType": "Follow-up",
        "selectedCodes": [
            {"code": "E11.9", "description": "Type 2 diabetes mellitus"},
        ],
    }
    resp = api_client.post("/ai/plan", json=body, headers=auth_header(token))
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["fallbackReason"]
    assert payload["risks"], "Fallback should include heuristic risk"
    assert payload["tasks"], "Fallback should include tasks"
    for risk in payload["risks"]:
        assert 0 <= risk["confidence"] <= 1
    for task in payload["tasks"]:
        assert 0 <= task["confidence"] <= 1

