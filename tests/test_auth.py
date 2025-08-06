import sqlite3
import importlib

import pytest
from fastapi.testclient import TestClient

import backend.main as main
from backend import auth


def setup_module(module):
    """Use an in-memory database for isolation during authentication tests."""
    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    main.db_conn.execute(
        'CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT, timestamp REAL, details TEXT, revenue REAL, codes TEXT, compliance_flags TEXT, public_health INTEGER, satisfaction INTEGER)'
    )
    main.db_conn.execute(
        'CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)'
    )
    main.db_conn.execute(
        'CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL, username TEXT, action TEXT, details TEXT)'
    )
    main.ensure_settings_table(main.db_conn)
    auth.register_user(main.db_conn, 'admin', 'secret', 'admin')


def test_register_and_login():
    client = TestClient(main.app)
    # Register a new regular user
    resp = client.post('/register', json={'username': 'alice', 'password': 'pw'})
    assert resp.status_code == 200
    # New user can log in and receives token with correct role
    resp = client.post('/login', json={'username': 'alice', 'password': 'pw'})
    assert resp.status_code == 200
    token = resp.json()['access_token']
    payload = main.jwt.decode(token, main.JWT_SECRET, algorithms=[main.JWT_ALGORITHM])
    assert payload['role'] == 'user'

    # Password stored in DB should be a bcrypt hash and verify correctly
    row = main.db_conn.execute(
        'SELECT password_hash FROM users WHERE username=?',
        ('alice',),
    ).fetchone()
    assert row is not None
    assert row['password_hash'].startswith('$2b$')
    assert auth.verify_password('pw', row['password_hash'])


def test_role_enforcement():
    client = TestClient(main.app)
    # Login as non-admin user
    resp = client.post('/login', json={'username': 'alice', 'password': 'pw'})
    token = resp.json()['access_token']
    # Non-admin should be forbidden from accessing metrics
    resp = client.get('/metrics', headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 403


def test_login_failure():
    client = TestClient(main.app)
    resp = client.post('/login', json={'username': 'alice', 'password': 'wrong'})
    assert resp.status_code == 401


def test_invalid_token_rejected():
    client = TestClient(main.app)
    # An obviously invalid token should return 401 rather than 403
    resp = client.get('/settings', headers={'Authorization': 'Bearer badtoken'})
    assert resp.status_code == 401


def test_login_lockout():
    client = TestClient(main.app)
    client.post('/register', json={'username': 'charlie', 'password': 'pw'})
    for _ in range(5):
        resp = client.post('/login', json={'username': 'charlie', 'password': 'bad'})
        assert resp.status_code == 401
    resp = client.post('/login', json={'username': 'charlie', 'password': 'pw'})
    assert resp.status_code == 423


def test_audit_endpoint():
    client = TestClient(main.app)
    client.post('/login', json={'username': 'nosuch', 'password': 'bad'})
    admin_token = client.post('/login', json={'username': 'admin', 'password': 'secret'}).json()['access_token']
    resp = client.get('/audit', headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    data = resp.json()
    assert any(entry['action'] == 'failed_login' for entry in data)
    client.post('/register', json={'username': 'bob', 'password': 'pw'})
    user_token = client.post('/login', json={'username': 'bob', 'password': 'pw'}).json()['access_token']
    assert client.get('/audit', headers={'Authorization': f'Bearer {user_token}'}).status_code == 403


def test_refresh_token_flow():
    client = TestClient(main.app)
    resp = client.post('/login', json={'username': 'admin', 'password': 'secret'})
    refresh_token = resp.json()['refresh_token']
    resp2 = client.post('/refresh', json={'refresh_token': refresh_token})
    assert resp2.status_code == 200
    new_token = resp2.json()['access_token']
    assert client.get('/metrics', headers={'Authorization': f'Bearer {new_token}'}).status_code == 200
    bad = client.post('/refresh', json={'refresh_token': 'bad'})
    assert bad.status_code == 401


def test_requires_jwt_secret(monkeypatch):
    monkeypatch.delenv('JWT_SECRET', raising=False)
    monkeypatch.setenv('ENVIRONMENT', 'production')
    with pytest.raises(RuntimeError):
        importlib.reload(main)
    monkeypatch.setenv('ENVIRONMENT', 'development')
    importlib.reload(main)
