"""Authentication endpoint regression tests."""

import importlib

import pytest

import backend.main as main
from backend import auth


@pytest.fixture()
def client(api_client):
    """Return a FastAPI test client bound to the isolated database."""

    return api_client


def test_register_and_login(client, admin_user):
    """Users can register, log in and receive JWT tokens with their role."""

    resp = client.post('/register', json={'username': 'alice', 'password': 'pw'})
    assert resp.status_code == 200

    resp = client.post('/login', json={'username': 'alice', 'password': 'pw'})
    assert resp.status_code == 200
    token = resp.json()['access_token']
    payload = main.jwt.decode(token, main.JWT_SECRET, algorithms=[main.JWT_ALGORITHM])
    assert payload['role'] == 'user'

    row = main.db_conn.execute(
        'SELECT password_hash FROM users WHERE username=?',
        ('alice',),
    ).fetchone()
    assert row is not None
    assert row['password_hash'].startswith('$2b$')
    assert auth.verify_password('pw', row['password_hash'])


def test_role_enforcement(client, admin_user):
    """Regular users cannot access administrator endpoints."""

    client.post('/register', json={'username': 'alice', 'password': 'pw'})
    resp = client.post('/login', json={'username': 'alice', 'password': 'pw'})
    token = resp.json()['access_token']

    resp = client.get('/metrics', headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 403


def test_login_failure(client, admin_user):
    """Invalid credentials should not authenticate a user."""

    client.post('/register', json={'username': 'alice', 'password': 'pw'})
    resp = client.post('/login', json={'username': 'alice', 'password': 'wrong'})
    assert resp.status_code == 401


def test_invalid_token_rejected(client, admin_user):
    """Malformed JWT tokens are rejected with a 401."""

    resp = client.get('/settings', headers={'Authorization': 'Bearer badtoken'})
    assert resp.status_code == 401


def test_login_lockout(client, admin_user):
    """Accounts lock after repeated failed logins."""

    client.post('/register', json={'username': 'charlie', 'password': 'pw'})
    for _ in range(5):
        resp = client.post('/login', json={'username': 'charlie', 'password': 'bad'})
        assert resp.status_code == 401

    resp = client.post('/login', json={'username': 'charlie', 'password': 'pw'})
    assert resp.status_code == 423


def test_audit_endpoint(client, admin_user):
    """Audit log requires admin access and records failed logins."""

    client.post('/login', json={'username': 'nosuch', 'password': 'bad'})
    admin_token = client.post('/login', json={'username': 'admin', 'password': 'secret'}).json()['access_token']
    resp = client.get('/audit', headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    data = resp.json()
    assert any(entry['action'] == 'failed_login' for entry in data)

    client.post('/register', json={'username': 'bob', 'password': 'pw'})
    user_token = client.post('/login', json={'username': 'bob', 'password': 'pw'}).json()['access_token']
    forbidden = client.get('/audit', headers={'Authorization': f'Bearer {user_token}'})
    assert forbidden.status_code == 403


def test_refresh_token_flow(client, admin_user):
    """Refresh tokens issue new access tokens and invalid ones fail."""

    resp = client.post('/login', json={'username': 'admin', 'password': 'secret'})
    refresh_token = resp.json()['refresh_token']

    resp2 = client.post('/refresh', json={'refresh_token': refresh_token})
    assert resp2.status_code == 200
    new_token = resp2.json()['access_token']
    metrics = client.get('/metrics', headers={'Authorization': f'Bearer {new_token}'})
    assert metrics.status_code == 200

    bad = client.post('/refresh', json={'refresh_token': 'bad'})
    assert bad.status_code == 401


def test_requires_jwt_secret(monkeypatch, db_session):
    """Production deployments require a configured JWT secret."""

    monkeypatch.delenv('JWT_SECRET', raising=False)
    monkeypatch.setenv('ENVIRONMENT', 'production')
    with pytest.raises(RuntimeError):
        importlib.reload(main)

    monkeypatch.setenv('ENVIRONMENT', 'development')
    importlib.reload(main)
