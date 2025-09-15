import asyncio
from copy import deepcopy
from typing import Any, Dict, List

import pytest

from backend import code_tables, codes_data, compliance, worker
import backend.main as main_module


class _DummyResponse:
    def __init__(self, payload: Any, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self) -> Any:
        return self._payload


@pytest.mark.asyncio
async def test_update_code_databases_refreshes_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    """Worker refresh should replace CPT/ICD-10/HCPCS datasets in-memory."""

    original_cpt = deepcopy(codes_data._CPT)
    original_icd10 = deepcopy(codes_data._ICD10)
    original_hcpcs = deepcopy(codes_data._HCPCS)
    original_cpt_tables = deepcopy(code_tables.CPT_CODES)
    original_icd_tables = deepcopy(code_tables.ICD10_CODES)
    original_revenue = dict(main_module.CPT_REVENUE)

    payload: Dict[str, List[Dict[str, Any]]] = {
        "cpt": [
            {
                "code": "12345",
                "description": "Telemedicine consult",
                "rvu": 2.5,
                "reimbursement": 200.0,
                "documentation": {
                    "required": ["consent"],
                    "recommended": ["video quality noted"],
                    "examples": ["Virtual follow-up"],
                },
                "icd10_prefixes": ["J06"],
                "demographics": {"minAge": 0},
                "encounterTypes": ["telehealth"],
                "specialties": ["family medicine"],
            }
        ],
        "icd10": [
            {
                "code": "J06.90",
                "description": "Acute upper respiratory infection",
                "clinicalContext": "URI",
                "documentation": {
                    "required": ["symptoms"],
                    "recommended": ["vital signs"],
                    "examples": ["cough and congestion"],
                },
                "demographics": {"minAge": 0},
                "encounterTypes": ["telehealth"],
                "specialties": ["primary care"],
            }
        ],
        "hcpcs": [
            {
                "code": "J1234",
                "description": "Unclassified injectable",
                "rvu": 0.0,
                "reimbursement": 12.5,
            }
        ],
    }

    calls: List[str] = []

    def fake_get(url: str, timeout: int = 0) -> _DummyResponse:  # pragma: no cover - patched in test
        calls.append(url)
        return _DummyResponse(payload)

    monkeypatch.setenv(worker.CODE_DATA_URL_ENV, "https://example.com/codes")
    monkeypatch.setattr(worker.requests, "get", fake_get)

    try:
        codes_data.load_code_metadata.cache_clear()
        await worker.update_code_databases()

        metadata = codes_data.load_code_metadata()
        assert "12345" in metadata
        assert metadata["12345"]["description"] == "Telemedicine consult"
        assert metadata["J06.90"]["type"] == "ICD-10"
        assert metadata["J1234"]["reimbursement"] == pytest.approx(12.5)

        assert code_tables.CPT_CODES["12345"]["documentation"]["required"] == ["consent"]
        assert code_tables.ICD10_CODES["J06.90"]["clinicalContext"] == "URI"
        assert main_module.CPT_REVENUE["12345"] == pytest.approx(200.0)

        assert calls == ["https://example.com/codes"]
    finally:
        codes_data._CPT.clear()
        codes_data._CPT.update(original_cpt)
        codes_data._ICD10.clear()
        codes_data._ICD10.update(original_icd10)
        codes_data._HCPCS.clear()
        codes_data._HCPCS.update(original_hcpcs)
        codes_data.load_code_metadata.cache_clear()
        code_tables.CPT_CODES.clear()
        code_tables.CPT_CODES.update(original_cpt_tables)
        code_tables.ICD10_CODES.clear()
        code_tables.ICD10_CODES.update(original_icd_tables)
        main_module.CPT_REVENUE = original_revenue


@pytest.mark.asyncio
async def test_check_compliance_rules_refreshes_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    original_rules = deepcopy(compliance._DEFAULT_RULES)
    original_resources = deepcopy(compliance._RESOURCE_LIBRARY)

    payload = {
        "rules": [
            {
                "id": "telehealth-consent",
                "name": "Record telehealth consent",
                "description": "Telehealth visits must document patient consent.",
                "category": "documentation",
                "severity": "high",
                "type": "absence",
                "keywords": ["telehealth consent"],
            }
        ],
        "resources": [
            {
                "title": "CMS Telehealth Guidance",
                "url": "https://cms.gov/telehealth",
                "category": "regulatory",
                "agency": "CMS",
                "regions": ["us"],
                "summary": "Documentation requirements for virtual visits.",
            }
        ],
    }

    monkeypatch.setenv(worker.COMPLIANCE_RULES_URL_ENV, "https://example.com/compliance")
    monkeypatch.setattr(worker.requests, "get", lambda url, timeout=0: _DummyResponse(payload))

    try:
        await worker.check_compliance_rules()

        rules = compliance.get_rules()
        assert any(rule["id"] == "telehealth-consent" for rule in rules)

        resources = compliance.get_resources()
        assert resources and resources[0]["title"] == "CMS Telehealth Guidance"
    finally:
        compliance._DEFAULT_RULES = original_rules
        compliance._RESOURCE_LIBRARY = original_resources


@pytest.mark.asyncio
async def test_scheduler_runs_configured_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    call_order: List[str] = []
    task_queue: asyncio.Queue = asyncio.Queue()

    monkeypatch.setattr(worker, "_task_queue", task_queue, raising=False)
    monkeypatch.setattr(worker, "_background_tasks", [], raising=False)

    codes_counter = {"count": 0}

    async def fake_codes() -> None:
        codes_counter["count"] += 1
        if codes_counter["count"] == 1:
            raise RuntimeError("transient failure")
        call_order.append("codes")

    async def fake_compliance() -> None:
        call_order.append("compliance")

    async def fake_aggregate() -> None:
        call_order.append("aggregate")

    async def fake_retrain_job() -> None:
        call_order.append("retrain_job")

    async def fake_audit_job() -> None:
        call_order.append("audit_job")

    async def fake_queue_model() -> None:
        call_order.append("queue_model")
        await worker._task_queue.put(fake_retrain_job)

    async def fake_queue_audit() -> None:
        call_order.append("queue_audit")
        await worker._task_queue.put(fake_audit_job)

    monkeypatch.setattr(worker, "update_code_databases", fake_codes)
    monkeypatch.setattr(worker, "check_compliance_rules", fake_compliance)
    monkeypatch.setattr(worker, "aggregate_analytics_and_backup", fake_aggregate)
    monkeypatch.setattr(worker, "queue_model_retraining", lambda: fake_queue_model())
    monkeypatch.setattr(worker, "queue_audit_trail_generation", lambda: fake_queue_audit())

    monkeypatch.setattr(worker, "CODE_REFRESH_INTERVAL", 0.05, raising=False)
    monkeypatch.setattr(worker, "COMPLIANCE_REFRESH_INTERVAL", 0.05, raising=False)
    monkeypatch.setattr(worker, "ANALYTICS_REFRESH_INTERVAL", 0.05, raising=False)
    monkeypatch.setattr(worker, "MODEL_REFRESH_INTERVAL", 0.05, raising=False)
    monkeypatch.setattr(worker, "AUDIT_REFRESH_INTERVAL", 0.05, raising=False)

    worker.start_scheduler()
    try:
        await asyncio.sleep(0.2)
    finally:
        await worker.stop_scheduler()

    assert codes_counter["count"] >= 2  # retried after initial failure
    assert "codes" in call_order
    assert "compliance" in call_order
    assert "queue_model" in call_order and "retrain_job" in call_order
    assert "queue_audit" in call_order and "audit_job" in call_order
    assert "aggregate" in call_order
