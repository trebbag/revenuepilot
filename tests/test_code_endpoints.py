import sqlite3
from collections import defaultdict, deque

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
    pwd = main.hash_password('pw')
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ('user', pwd, 'user'),
    )
    main.db_conn.commit()
    monkeypatch.setattr(main, 'db_conn', main.db_conn)
    monkeypatch.setattr(main, 'events', [])
    monkeypatch.setattr(
        main,
        'transcript_history',
        defaultdict(lambda: deque(maxlen=main.TRANSCRIPT_HISTORY_LIMIT)),
    )
    return TestClient(main.app)


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def token(client):
    resp = client.post('/login', json={'username': 'user', 'password': 'pw'})
    assert resp.status_code == 200
    return resp.json()['access_token']


def test_validate_cpt(client, token):
    resp = client.get('/api/codes/validate/cpt/99213', headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data['valid'] is True
    assert data['description']

    resp = client.get('/api/codes/validate/cpt/ABC', headers=auth_header(token))
    assert resp.json()['valid'] is False


def test_validate_icd10(client, token):
    resp = client.get('/api/codes/validate/icd10/E11.9', headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()['valid'] is True


def test_validate_combination(client, token):
    payload = {'cpt': ['99213'], 'icd10': ['E11.9']}
    resp = client.post('/api/codes/validate/combination', json=payload, headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()['validCombinations'] is True

    bad = {'cpt': ['99213'], 'icd10': ['Z00.00']}
    resp = client.post('/api/codes/validate/combination', json=bad, headers=auth_header(token))
    assert resp.status_code == 200
    assert resp.json()['validCombinations'] is False


def test_billing_calculate(client, token):
    payload = {'cpt': ['99213', '99214'], 'payerType': 'medicare'}
    resp = client.post('/api/billing/calculate', json=payload, headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data['totalEstimated'] > 0
    assert '99213' in data['breakdown']


def test_documentation(client, token):
    resp = client.get('/api/codes/documentation/99213', headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert 'required' in data
