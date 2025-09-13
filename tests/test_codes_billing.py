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
    data = resp.json()
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
    data = resp.json()
    assert data["totalEstimated"] == pytest.approx(85.32, rel=1e-2)
    assert data["totalRvu"] == pytest.approx(1.29, rel=1e-2)
    assert len(data["breakdown"]) == 2


def test_validate_combination(client):
    token = get_token(client)
    resp = client.post(
        "/api/codes/validate/combination",
        json={"codes": ["99213", "99214"]},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["conflicts"]
    assert not data["validCombinations"]

