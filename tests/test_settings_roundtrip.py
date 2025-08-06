import hashlib
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
    pwd = hashlib.sha256(b'pw').hexdigest()
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
    assert data['lang'] == 'en'
    assert data['specialty'] is None
    assert data['payer'] is None

    new_settings = {
        'theme': 'modern',
        'categories': {'codes': True, 'compliance': True, 'publicHealth': True, 'differentials': True},
        'rules': [],
        'lang': 'es',
        'specialty': 'cardiology',
        'payer': 'medicare',
        'region': '',
    }
    resp = client.post('/settings', json=new_settings, headers=auth_header(token))
    assert resp.status_code == 200

    resp = client.get('/settings', headers=auth_header(token))
    data = resp.json()
    assert data['lang'] == 'es'
    assert data['specialty'] == 'cardiology'
    assert data['payer'] == 'medicare'
