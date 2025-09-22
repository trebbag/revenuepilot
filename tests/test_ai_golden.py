import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import main


GOLDEN_DIR = Path(__file__).parent / "golden"


def _load_json(name: str) -> dict:
    with open(GOLDEN_DIR / name, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _load_real_scheduling(monkeypatch):
    scheduling_path = Path(__file__).resolve().parents[1] / "backend" / "scheduling.py"
    spec = importlib.util.spec_from_file_location("backend.scheduling", scheduling_path)
    if not spec or not spec.loader:
        raise RuntimeError("Unable to load backend.scheduling module")
    scheduling = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(scheduling)
    sys.modules["backend.scheduling"] = scheduling
    monkeypatch.setattr(main, "recommend_follow_up", scheduling.recommend_follow_up)
    monkeypatch.setattr(main, "export_ics", scheduling.export_ics)
    return scheduling


@pytest.fixture()
def golden_client(in_memory_db):
    """Provide a FastAPI client with a seeded user for golden AI tests."""

    conn = main.db_conn
    pwd = main.hash_password("pw")
    conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("golden-user", pwd, "user"),
    )
    conn.commit()

    with TestClient(main.app) as client:
        token = main.create_token("golden-user", "user")
        yield client, token, conn


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_summary_ai_surface_matches_golden(golden_client, monkeypatch):
    client, token, _ = golden_client

    llm_payload = _load_json("summary_llm.json")
    expected = _load_json("summary_normalized.json")

    def fake_call(messages):
        # Ensure the system prompt is still present
        assert messages and messages[0]["role"] == "system"
        return json.dumps(llm_payload)

    monkeypatch.setattr(main, "call_openai", fake_call)

    note_text = "Patient reports headaches improving with medication."
    response = client.post(
        "/summarize",
        json={"text": note_text, "lang": "en"},
        headers=_auth_header(token),
    )

    assert response.status_code == 200
    assert response.json() == expected


def test_codes_ai_surface_matches_golden(golden_client, monkeypatch):
    client, token, conn = golden_client

    llm_payload = _load_json("codes_llm.json")
    expected = _load_json("codes_normalized.json")

    monkeypatch.setattr(main, "call_openai", lambda messages: json.dumps(llm_payload))
    monkeypatch.setattr(
        main.public_health_api,
        "get_public_health_suggestions",
        lambda *args, **kwargs: [],
    )

    scheduling = _load_real_scheduling(monkeypatch)

    monkeypatch.setattr(
        scheduling,
        "utc_now",
        lambda: datetime(2024, 1, 1, tzinfo=timezone.utc),
    )

    response = client.post(
        "/suggest",
        json={
            "text": "Established patient with persistent cough and poorly controlled diabetes.",
            "lang": "en",
            "specialty": "cardiology",
            "payer": "medicare",
            "noteId": "enc-123",
        },
        headers=_auth_header(token),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == expected

    stored_scores = list(
        conn.execute(
            "SELECT code, confidence FROM confidence_scores ORDER BY code"
        )
    )
    assert len(stored_scores) == 2
    assert stored_scores[0][0] == "99213"
    assert stored_scores[1][0] == "E11.9"
    confidences = [row[1] for row in stored_scores if row[1] is not None]
    assert confidences and min(confidences) >= 0.6
    assert all(0.0 <= value <= 1.0 for value in confidences)


def test_compliance_ai_surface_matches_golden(golden_client, monkeypatch):
    client, token, conn = golden_client

    conn.execute(
        "INSERT INTO compliance_rule_catalog (id, name, category, priority, citations, keywords) VALUES (?, ?, ?, ?, ?, ?)",
        (
            "rule-1",
            "Document visit duration",
            "documentation",
            "medium",
            json.dumps([
                {
                    "title": "CMS 2024 E/M",
                    "url": "https://example.com/cms-e-m",
                    "citation": "Section 2",
                }
            ]),
            json.dumps(["time", "duration"]),
        ),
    )
    conn.execute(
        "INSERT INTO compliance_rule_catalog (id, name, category, priority, citations, keywords) VALUES (?, ?, ?, ?, ?, ?)",
        (
            "rule-2",
            "Follow-up planning",
            "planning",
            "high",
            json.dumps([
                {
                    "title": "Joint Commission",
                    "url": "https://example.com/jc",
                    "citation": "Standard FP-01",
                }
            ]),
            json.dumps(["follow-up", "plan"]),
        ),
    )
    conn.commit()

    llm_payload = _load_json("compliance_llm.json")
    expected = _load_json("compliance_normalized.json")

    monkeypatch.setattr(main, "call_openai", lambda messages: json.dumps(llm_payload))

    response = client.post(
        "/api/ai/compliance/check",
        json={
            "content": "Visit lasted 25 minutes without a documented follow-up plan.",
            "codes": ["99213"],
        },
        headers=_auth_header(token),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == expected

    confidences = [
        alert["confidence"]
        for alert in payload["alerts"]
        if alert.get("confidence") is not None
    ]
    assert confidences and min(confidences) >= 0.6
    assert all(0.0 <= value <= 1.0 for value in confidences)
