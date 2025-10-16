import json
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.dcsb_features import _cached_overrides
from tests.test_suggestion_panel_contracts import (  # noqa: F401
    auth_header,
    suggestion_client,
)


def _build_payload() -> Dict[str, Any]:
    return {
        "differentials": [
            {
                "dx": {
                    "id": "DX-ACS",
                    "name": "Acute Coronary Syndrome",
                    "confidence": 0.62,
                    "icdCode": "I24.9",
                },
                "whatItIs": "Acute plaque rupture with myocardial ischemia",
                "supportingFactors": ["Chest pain", " chest pain "],
                "contradictingFactors": ["Normal ECG"],
                "testsToConfirm": ["Troponin assay"],
                "testsToExclude": ["D-dimer"],
                "evidence": [
                    "Chest pain radiating to left arm.",
                    "Chest pain radiating to left arm.",
                ],
                "features": {
                    "major": ["Chest Pain", "chest pain"],
                    "minor": ["Dyspnea"],
                    "vitals": [
                        {"name": "Heart Rate", "operator": ">", "value": "100", "unit": "BPM"},
                        {"name": "Heart Rate", "operator": ">", "value": "100", "unit": "BPM"},
                    ],
                    "labs": [
                        {"name": "Troponin I", "operator": ">", "value": "0.4", "unit": "NG/ML"}
                    ],
                    "orders": ["CT Angio"],
                },
            }
        ],
        "potentialConcerns": [],
    }


@pytest.mark.parametrize("_unused", [None])
def test_differentials_features_are_normalized(
    suggestion_client: TestClient, auth_header: Dict[str, str], monkeypatch: pytest.MonkeyPatch, _unused: Any
) -> None:
    _cached_overrides.cache_clear()
    calls: List[List[Dict[str, Any]]] = []

    def fake_call(messages: List[Dict[str, Any]]) -> str:
        calls.append(messages)
        return json.dumps(_build_payload())

    monkeypatch.setattr(main, "call_openai", fake_call)
    monkeypatch.setattr(main, "_enforce_suggestion_gate", lambda *a, **k: True)
    monkeypatch.setattr(main, "USE_OFFLINE_MODEL", False)

    response = suggestion_client.post(
        "/api/ai/differentials/generate",
        json={"content": "Pain radiating to arm."},
        headers=auth_header,
    )
    assert response.status_code == 200
    body = response.json()
    assert calls, "Model was not invoked"

    diff = body["differentials"][0]
    features = diff["features"]
    assert sorted(features.keys()) == ["labs", "major", "minor", "orders", "pathognomonic", "vitals"]
    assert features["pathognomonic"] == []
    assert diff["dx"] == {
        "id": "DX-ACS",
        "icdCode": "I24.9",
        "name": "Acute Coronary Syndrome",
        "confidence": 0.62,
    }
    assert diff["diagnosis"] == "Acute Coronary Syndrome"
    assert diff["confidence"] == 0.62
    assert diff["supportingFactors"] == ["Chest pain"]
    assert diff["evidence"] == ["Chest pain radiating to left arm."]

    assert features["major"] == [
        "chest pain",
        "troponin elevation",
        "ischemic ecg changes",
    ]
    assert features["minor"] == ["shortness of breath"]
    assert features["orders"] == ["ct angio"]

    vitals = features["vitals"]
    assert len(vitals) == 1
    assert vitals[0] == {"name": "heart rate", "operator": ">", "value": "100", "unit": "bpm"}

    labs = features["labs"]
    assert any(entry["name"].startswith("troponin") for entry in labs)
    assert all(set(entry.keys()) == {"name", "operator", "unit", "value"} for entry in labs)

    second = suggestion_client.post(
        "/api/ai/differentials/generate",
        json={"content": "Pain radiating to arm."},
        headers=auth_header,
    )
    assert second.status_code == 200
    cache_info = _cached_overrides.cache_info()
    assert cache_info.hits >= 1
