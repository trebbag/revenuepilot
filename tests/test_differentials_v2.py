import json
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from backend import main
from tests.test_suggestion_panel_contracts import (  # noqa: F401
    auth_header,
    suggestion_client,
)


@pytest.mark.parametrize("vitals_input, labs_input", [
    (
        {"label": "Blood Pressure", "value": "124/78", "unit": "mmHg", "date": "2024-02-01"},
        {"cbc": {"label": "Hemoglobin", "value": 12.9, "unit": "g/dL", "loinc": "718-7"}},
    ),
])
def test_differentials_v2_happy_path(
    suggestion_client: TestClient,
    auth_header: Dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    vitals_input: Dict[str, Any],
    labs_input: Dict[str, Any],
) -> None:
    captured: Dict[str, Any] = {}

    def fake_call(messages: List[Dict[str, Any]]) -> str:
        captured["messages"] = messages
        return json.dumps(
            {
                "differentials": [
                    {
                        "dx": " Influenza ",
                        "whatItIs": "Seasonal influenza",
                        "supportingFactors": ["Fever 101F", "Fever 101F"],
                        "contradictingFactors": ["Clear lungs"],
                        "testsToConfirm": ["87502", "87502"],
                        "testsToExclude": ["Chest X-ray"],
                        "evidence": [" Fever 101F noted."],
                    }
                ],
                "potentialConcerns": ["LLM caution"],
            }
        )

    monkeypatch.setattr(main, "call_openai", fake_call)
    monkeypatch.setattr(main, "_enforce_suggestion_gate", lambda *a, **k: True)

    response = suggestion_client.post(
        "/api/ai/differentials/generate",
        json={
            "content": "Patient with fever and cough.",
            "vitalsLatest": vitals_input,
            "labsRecent": labs_input,
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["differentials"]) == 1
    diff = body["differentials"][0]
    assert diff["dx"] == "Influenza"
    assert diff["whatItIs"] == "Seasonal influenza"
    assert diff["supportingFactors"] and diff["supportingFactors"][0] == "Fever 101F"
    assert diff["contradictingFactors"] == ["Clear lungs"]
    assert diff["testsToConfirm"] and diff["testsToConfirm"][0] == "87502"
    assert diff["testsToExclude"] == ["Chest X-ray"]
    assert diff["evidence"] == ["Fever 101F noted."]
    assert body["potentialConcerns"] == ["LLM caution"]

    messages = captured["messages"]
    assert messages[0]["role"] == "system"
    context_payload = json.loads(messages[1]["content"])
    vitals = context_payload["vitalsLatest"]
    labs = context_payload["labsRecent"]
    assert vitals and vitals[0]["label"] == "Blood Pressure"
    assert vitals[0]["value"] == "124/78"
    assert labs and labs[0]["code"] == "718-7"


def test_differentials_skip_invalid_entries(
    suggestion_client: TestClient,
    auth_header: Dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_call(_messages: List[Dict[str, Any]]) -> str:
        return json.dumps(
            {
                "differentials": [
                    {
                        "dx": "Mystery condition",
                        "whatItIs": "",
                        "supportingFactors": [],
                        "contradictingFactors": [],
                        "testsToConfirm": [],
                        "testsToExclude": ["Rule-out test"],
                        "evidence": [],
                    }
                ]
            }
        )

    monkeypatch.setattr(main, "call_openai", fake_call)
    monkeypatch.setattr(main, "_enforce_suggestion_gate", lambda *a, **k: True)

    response = suggestion_client.post(
        "/api/ai/differentials/generate",
        json={
            "content": "Note",
            "vitalsLatest": [{"label": "Pulse", "value": "70"}],
            "labsRecent": [{"label": "A1c", "value": 6.9, "loinc": "4548-4"}],
        },
        headers=auth_header,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["differentials"] == []
    assert any("skipped" in concern for concern in payload["potentialConcerns"])


def test_differentials_missing_supporting_data_warns(
    suggestion_client: TestClient,
    auth_header: Dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_call(_messages: List[Dict[str, Any]]) -> str:
        return json.dumps(
            {
                "differentials": [
                    {
                        "dx": "Sinusitis",
                        "whatItIs": "Paranasal sinus inflammation",
                        "supportingFactors": ["Facial pressure"],
                        "contradictingFactors": [],
                        "testsToConfirm": ["Clinical exam"],
                        "testsToExclude": [],
                        "evidence": ["Reports maxillary tenderness."],
                    }
                ]
            }
        )

    monkeypatch.setattr(main, "call_openai", fake_call)
    monkeypatch.setattr(main, "_enforce_suggestion_gate", lambda *a, **k: True)

    response = suggestion_client.post(
        "/api/ai/differentials/generate",
        json={"content": "Patient with congestion."},
        headers=auth_header,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["differentials"][0]["dx"] == "Sinusitis"
    assert any("No recent vitals" in concern for concern in payload["potentialConcerns"])
    assert any("No recent labs" in concern for concern in payload["potentialConcerns"])
