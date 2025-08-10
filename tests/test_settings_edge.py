import sqlite3
from fastapi.testclient import TestClient
import backend.main as main
from backend import migrations
from backend.main import _init_core_tables


def setup_module(module):
    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    _init_core_tables(main.db_conn)
    # ensure test user
    pwd = main.hash_password('pw')
    main.db_conn.execute('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)', ('alice', pwd, 'user'))
    main.db_conn.commit()


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


def test_get_defaults_reflect_env(monkeypatch):
    monkeypatch.setenv('DEID_ENGINE', 'regex')
    client = TestClient(main.app)
    token = main.create_token('alice', 'user')
    resp = client.get('/settings', headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()['deidEngine'] == 'regex'


def test_save_invalid_deid_engine():
    client = TestClient(main.app)
    token = main.create_token('alice', 'user')
    bad = {
        'theme': 'modern',
        'categories': {'codes': True, 'compliance': True, 'publicHealth': True, 'differentials': True},
        'rules': [],
        'deidEngine': 'invalid'
    }
    resp = client.post('/settings', json=bad, headers=_auth(token))
    assert resp.status_code == 422


def test_rules_cleaning_and_flags_persist():
    client = TestClient(main.app)
    token = main.create_token('alice', 'user')
    prefs = {
        'theme': 'modern',
        'categories': {'codes': True, 'compliance': True, 'publicHealth': True, 'differentials': True},
        'rules': ['  first  ', '', 'second'],
        'useLocalModels': True,
        'useOfflineMode': True,
        'deidEngine': 'regex'
    }
    resp = client.post('/settings', json=prefs, headers=_auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data['rules'] == ['first', 'second']
    assert data['useLocalModels'] is True
    assert data['useOfflineMode'] is True
    resp = client.get('/settings', headers=_auth(token))
    roundtrip = resp.json()
    assert roundtrip['rules'] == ['first', 'second']
    assert roundtrip['useOfflineMode'] is True
