import sqlite3
import time
from fastapi.testclient import TestClient
import jwt
import backend.main as main
from backend import auth


def setup_module(module):
    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    main.db_conn.execute('CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT, timestamp REAL, details TEXT, revenue REAL, codes TEXT, compliance_flags TEXT, public_health INTEGER, satisfaction INTEGER)')
    main.db_conn.execute('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)')
    main.db_conn.execute('CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL, username TEXT, action TEXT, details TEXT)')
    main.db_conn.commit()
    auth.register_user(main.db_conn, 'admin', 'secret', 'admin')


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


def test_duplicate_register_returns_400():
    client = TestClient(main.app)
    resp1 = client.post('/register', json={'username': 'dup', 'password': 'pw'})
    assert resp1.status_code == 200
    resp2 = client.post('/register', json={'username': 'dup', 'password': 'pw'})
    assert resp2.status_code == 400


def test_update_delete_user_and_missing():
    client = TestClient(main.app)
    admin_token = main.create_token('admin', 'admin')
    # create user
    client.post('/register', json={'username': 'temp', 'password': 'pw'})
    # update role
    resp = client.put('/users/temp', json={'role': 'user'}, headers=_auth(admin_token))
    assert resp.status_code == 200
    # change password
    resp = client.put('/users/temp', json={'password': 'newpw'}, headers=_auth(admin_token))
    assert resp.status_code == 200
    # delete
    resp = client.delete('/users/temp', headers=_auth(admin_token))
    assert resp.status_code == 200
    # delete again -> still 200 but no such user (idempotent expectation)
    resp = client.delete('/users/temp', headers=_auth(admin_token))
    assert resp.status_code == 200


def test_reset_password_wrong_current():
    client = TestClient(main.app)
    client.post('/register', json={'username': 'alice', 'password': 'pw'})
    resp = client.post('/reset-password', json={'username': 'alice', 'password': 'bad', 'new_password': 'x'})
    assert resp.status_code == 401


def test_refresh_invalid_token_type():
    client = TestClient(main.app)
    access = main.create_access_token('admin', 'admin')
    resp = client.post('/refresh', json={'refresh_token': access})
    assert resp.status_code == 401


def test_expired_refresh_token(monkeypatch):
    client = TestClient(main.app)
    # craft expired refresh token
    payload = {'sub': 'admin', 'role': 'admin', 'type': 'refresh', 'exp': time.time() - 10}
    expired = jwt.encode(payload, main.JWT_SECRET, algorithm=main.JWT_ALGORITHM)
    resp = client.post('/refresh', json={'refresh_token': expired})
    assert resp.status_code == 401


def test_admin_required_endpoints_reject_user():
    client = TestClient(main.app)
    client.post('/register', json={'username': 'bob', 'password': 'pw'})
    user_token = client.post('/login', json={'username': 'bob', 'password': 'pw'}).json()['access_token']
    resp = client.get('/users', headers=_auth(user_token))
    assert resp.status_code == 403
    resp = client.post('/prompt-templates', json={'default': {}}, headers=_auth(user_token))
    assert resp.status_code == 403


def test_missing_auth_header():
    client = TestClient(main.app)
    resp = client.get('/settings')
    assert resp.status_code in {401, 403}
