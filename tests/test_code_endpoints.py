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
    base_params = {
        'age': 45,
        'gender': 'female',
        'encounterType': 'outpatient',
        'providerSpecialty': 'family medicine',
    }
    resp = client.get(
        '/api/codes/validate/cpt/99213',
        params=base_params,
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['valid'] is True
    assert data['issues'] == []
    assert data['description']

    # Age mismatch should surface as contextual issue
    younger = dict(base_params)
    younger['age'] = 10
    resp = client.get(
        '/api/codes/validate/cpt/99213',
        params=younger,
        headers=auth_header(token),
    )
    ctx_data = resp.json()
    assert ctx_data['valid'] is False
    assert ctx_data['reason'] == 'context'
    assert any('age' in issue.lower() for issue in ctx_data['issues'])

    # Gender mismatch for obstetric code
    resp = client.get(
        '/api/codes/validate/cpt/59400',
        params={
            'age': 30,
            'gender': 'male',
            'encounterType': 'outpatient',
            'providerSpecialty': 'obgyn',
        },
        headers=auth_header(token),
    )
    gender_data = resp.json()
    assert gender_data['valid'] is False
    assert any('gender' in issue.lower() for issue in gender_data['issues'])

    resp = client.get(
        '/api/codes/validate/cpt/ABC', headers=auth_header(token)
    )
    assert resp.json()['valid'] is False


def test_validate_icd10(client, token):
    base_params = {
        'age': 52,
        'gender': 'female',
        'encounterType': 'office',
        'providerSpecialty': 'primary care',
    }
    resp = client.get(
        '/api/codes/validate/icd10/E11.9',
        params=base_params,
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()['valid'] is True

    # Male gender should fail for pregnancy code
    resp = client.get(
        '/api/codes/validate/icd10/O09.90',
        params={**base_params, 'gender': 'male'},
        headers=auth_header(token),
    )
    gender_issue = resp.json()
    assert gender_issue['valid'] is False
    assert any('gender' in issue.lower() for issue in gender_issue['issues'])

    # Age mismatch for diabetes code
    resp = client.get(
        '/api/codes/validate/icd10/E11.9',
        params={**base_params, 'age': 5},
        headers=auth_header(token),
    )
    age_issue = resp.json()
    assert age_issue['valid'] is False
    assert any('age' in issue.lower() for issue in age_issue['issues'])


def test_validate_hcpcs(client, token):
    base_params = {
        'age': 67,
        'gender': 'female',
        'encounterType': 'outpatient',
        'providerSpecialty': 'primary care',
    }
    resp = client.get(
        '/api/codes/validate/hcpcs/J3490',
        params=base_params,
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['valid'] is True
    assert data['issues'] == []
    assert data['coverage']['status']
    assert data['documentation']['required']

    resp = client.get(
        '/api/codes/validate/hcpcs/G0008',
        params={**base_params, 'age': 2},
        headers=auth_header(token),
    )
    underage = resp.json()
    assert underage['valid'] is False
    assert underage['reason'] == 'context'
    assert any('age' in issue.lower() for issue in underage['issues'])

    resp = client.get(
        '/api/codes/validate/hcpcs/12345', headers=auth_header(token)
    )
    pattern_error = resp.json()
    assert pattern_error['valid'] is False
    assert pattern_error['reason'] == 'pattern'


def test_validate_combination(client, token):
    payload = {
        'cpt': ['99213'],
        'icd10': ['E11.9'],
        'age': 45,
        'gender': 'female',
        'encounterType': 'outpatient',
        'providerSpecialty': 'family medicine',
    }
    resp = client.post(
        '/api/codes/validate/combination',
        json=payload,
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    combo = resp.json()
    assert combo['validCombinations'] is True
    assert combo['contextIssues'] == []

    bad = {
        'cpt': ['99213'],
        'icd10': ['Z00.00'],
        'age': 45,
        'gender': 'female',
        'encounterType': 'outpatient',
        'providerSpecialty': 'family medicine',
    }
    resp = client.post(
        '/api/codes/validate/combination',
        json=bad,
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()['validCombinations'] is False

    age_conflict = dict(payload)
    age_conflict['age'] = 12
    resp = client.post(
        '/api/codes/validate/combination',
        json=age_conflict,
        headers=auth_header(token),
    )
    context_resp = resp.json()
    assert context_resp['validCombinations'] is False
    assert context_resp['contextIssues']


def test_billing_calculate(client, token):
    payload = {'cpt': ['99213', '99214'], 'payerType': 'medicare'}
    resp = client.post('/api/billing/calculate', json=payload, headers=auth_header(token))
    assert resp.status_code == 200
    payload = resp.json()
    data = payload.get('data', payload)
    assert data['totalEstimated'] > 0
    assert data['totalEstimatedFormatted'].startswith('$')
    assert data['currency'] == 'USD'
    assert data['issues'] == []
    assert data['totalRvu'] > 0
    assert data['payerSpecific']['payerType'].lower() == 'medicare'
    assert '99213' in data['breakdown']
    assert data['breakdown']['99213']['amount'] > 0
    assert data['breakdown']['99213']['amountFormatted'].startswith('$')
    assert data['breakdown']['99213']['rvu'] > 0


def test_documentation(client, token):
    resp = client.get('/api/codes/documentation/99213', headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert 'required' in data


def test_categorization_rules(client, token):
    resp = client.get(
        '/api/codes/categorization/rules', headers=auth_header(token)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert 'autoCategories' in data
    assert 'userOverrides' in data
    assert 'rules' in data
    assert isinstance(data['autoCategories'], dict)
    assert isinstance(data['userOverrides'], dict)
    assert isinstance(data['rules'], list)
    assert data['rules'], 'expected at least one categorization rule'
