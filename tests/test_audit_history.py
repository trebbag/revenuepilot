import sqlite3
from collections import defaultdict, deque
from datetime import datetime
from typing import Any, Dict

import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.main import _init_core_tables


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    main.db_conn = sqlite3.connect(":memory:", check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    _init_core_tables(main.db_conn)
    password = main.hash_password("pw")
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("user", password, "user"),
    )
    main.db_conn.commit()
    monkeypatch.setattr(main, "db_conn", main.db_conn)
    monkeypatch.setattr(main, "events", [])
    monkeypatch.setattr(
        main,
        "transcript_history",
        defaultdict(lambda: deque(maxlen=main.TRANSCRIPT_HISTORY_LIMIT)),
    )
    async def _noop_notify(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(main, "_notify_compliance_issue", _noop_notify)
    return TestClient(main.app)


def auth_header(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login(client: TestClient) -> str:
    response = client.post(
        "/login", json={"username": "user", "password": "pw"}
    )
    assert response.status_code == 200
    payload = response.json()
    return payload["access_token"]


def test_compliance_issue_history_records(client: TestClient) -> None:
    token = login(client)
    payload: Dict[str, Any] = {
        "title": "Missing documentation",
        "severity": "medium",
        "ruleId": "documentation-check",
        "status": "open",
        "metadata": {"payer": "Medicare", "details": {"missing": ["HPI"]}},
        "createdBy": "auditor-1",
    }

    resp = client.post(
        "/api/compliance/issue-tracking",
        json=payload,
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    issue_record = resp.json()
    issue_id = issue_record["issueId"]

    history_resp = client.get(
        "/api/compliance/issues/history",
        headers=auth_header(token),
    )
    assert history_resp.status_code == 200
    history_payload = history_resp.json()
    assert history_payload["count"] >= 1
    records = history_payload["records"]
    assert any(entry["issueId"] == issue_id for entry in records)
    entry = next(item for item in records if item["issueId"] == issue_id)
    assert entry["code"] == "documentation-check"
    assert entry["payer"].lower() == "medicare"
    assert entry["userId"] == "auditor-1"
    assert entry["findings"]["status"] == "open"

    filtered = client.get(
        "/api/compliance/issues/history",
        params={"issueId": issue_id, "payer": "medicare"},
        headers=auth_header(token),
    )
    assert filtered.status_code == 200
    filtered_payload = filtered.json()
    assert filtered_payload["count"] == 1
    filtered_entry = filtered_payload["records"][0]
    assert filtered_entry["issueId"] == issue_id
    assert filtered_entry["code"] == "documentation-check"


def test_billing_audit_history_records(client: TestClient) -> None:
    token = login(client)
    billing_payload = {
        "codes": ["99213", "J3490"],
        "payerType": "medicare",
        "location": "virtual",
    }

    calc_resp = client.post(
        "/api/billing/calculate",
        json=billing_payload,
        headers=auth_header(token),
    )
    assert calc_resp.status_code == 200
    calculation = calc_resp.json()
    assert calculation["totalEstimated"] > 0

    audits_resp = client.get(
        "/api/billing/audits",
        headers=auth_header(token),
    )
    assert audits_resp.status_code == 200
    audits_payload = audits_resp.json()
    assert audits_payload["count"] >= 1
    audit_records = audits_payload["records"]
    audit_ids = {entry["auditId"] for entry in audit_records}
    assert len(audit_ids) == 1
    assert any(entry["code"] == "99213" for entry in audit_records)
    for entry in audit_records:
        assert entry["payer"].lower() == "medicare"
        assert entry["findings"]["totalEstimated"] == pytest.approx(
            calculation["totalEstimated"], rel=1e-6
        )
        datetime.fromisoformat(entry["timestamp"])  # validates ISO format

    code_filtered = client.get(
        "/api/billing/audits",
        params={"code": "99213"},
        headers=auth_header(token),
    )
    assert code_filtered.status_code == 200
    code_payload = code_filtered.json()
    assert code_payload["count"] == 1
    assert code_payload["records"][0]["code"] == "99213"

    first_timestamp = datetime.fromisoformat(audit_records[0]["timestamp"]).timestamp()
    time_filtered = client.get(
        "/api/billing/audits",
        params={"start": first_timestamp - 1, "userId": "user"},
        headers=auth_header(token),
    )
    assert time_filtered.status_code == 200
    time_payload = time_filtered.json()
    assert time_payload["count"] >= len(audit_records)
