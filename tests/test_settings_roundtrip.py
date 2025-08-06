import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend import main, migrations


@pytest.fixture
def client(monkeypatch):
    db = sqlite3.connect(':memory:', check_same_thread=False)
    db.row_factory = sqlite3.Row
    migrations.ensure_settings_table(db)
    db.execute(
        'CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)'
    )
    pwd = main.hash_password('pw')
    db.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ('alice', pwd, 'user'))
    db.commit()
    monkeypatch.setattr(main, 'db_conn', db)
    return TestClient(main.app)


def auth_header(token):
    return {'Authorization': f'Bearer {token}'}


def test_settings_roundtrip(client):
    token = main.create_token('alice', 'user')
    # defaults
    resp = client.get('/settings', headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data['theme'] == 'modern'
    assert data['categories']['codes'] is True
    assert data['rules'] == []

    assert data['lang'] == 'en'
    assert data['specialty'] is None
    assert data['payer'] is None
    assert data['agencies'] == ['CDC', 'WHO']

    new_settings = {
        'theme': 'dark',
        'categories': {
            'codes': False,
            'compliance': True,
            'publicHealth': False,
            'differentials': True,
        },
        'rules': ['r1', 'r2'],
        'lang': 'es',
        'specialty': 'cardiology',
        'payer': 'medicare',
        'region': '',
        'agencies': ['CDC'],
    }
    resp = client.post('/settings', json=new_settings, headers=auth_header(token))
    assert resp.status_code == 200

    resp = client.get('/settings', headers=auth_header(token))
    data = resp.json()
    assert data['theme'] == 'dark'
    assert data['categories']['codes'] is False
    assert data['categories']['publicHealth'] is False
    assert data['rules'] == ['r1', 'r2']
    assert data['lang'] == 'es'
    assert data['specialty'] == 'cardiology'
    assert data['payer'] == 'medicare'
    assert data['agencies'] == ['CDC']


def test_invalid_settings_rejected(client):
    token = main.create_token('alice', 'user')
    bad_theme = {
        'theme': 'neon',
        'categories': {'codes': True, 'compliance': True, 'publicHealth': True, 'differentials': True},
        'rules': [],
    }
    resp = client.post('/settings', json=bad_theme, headers=auth_header(token))
    assert resp.status_code == 422

    bad_categories = {
        'theme': 'modern',
        'categories': {'codes': 'yes'},
        'rules': [],
    }
    resp = client.post('/settings', json=bad_categories, headers=auth_header(token))
    assert resp.status_code == 422

    bad_rules = {
        'theme': 'modern',
        'categories': {'codes': True, 'compliance': True, 'publicHealth': True, 'differentials': True},
        'rules': ['ok', 5],
    }
    resp = client.post('/settings', json=bad_rules, headers=auth_header(token))
    assert resp.status_code == 422
