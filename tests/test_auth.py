import hashlib
import sqlite3
import hashlib

from fastapi.testclient import TestClient

import backend.main as main


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
    # Seed an initial admin user
    admin_hash = hashlib.sha256(b'secret').hexdigest()
    main.db_conn.execute(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
        ('admin', admin_hash, 'admin'),
    )
    main.db_conn.commit()


def test_register_and_login():
    client = TestClient(main.app)
    # Login as admin
    resp = client.post('/login', json={'username': 'admin', 'password': 'secret'})
    assert resp.status_code == 200
    admin_token = resp.json()['access_token']

    # Register a new regular user
    resp = client.post(
        '/register',
        json={'username': 'alice', 'password': 'pw', 'role': 'user'},
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert resp.status_code == 200

    # New user can log in and receives token with correct role
    resp = client.post('/login', json={'username': 'alice', 'password': 'pw'})
    assert resp.status_code == 200
    token = resp.json()['access_token']
    payload = main.jwt.decode(token, main.JWT_SECRET, algorithms=[main.JWT_ALGORITHM])
    assert payload['role'] == 'user'


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
