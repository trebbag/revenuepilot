import pytest

from backend import main
from backend.db.models import User


@pytest.fixture
def user_token(db_session):
    user = User(username='alice', password_hash=main.hash_password('pw'), role='user')
    db_session.add(user)
    db_session.commit()
    return main.create_token('alice', 'user')


def _auth(token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {token}'}


def test_get_defaults_reflect_env(api_client, user_token, monkeypatch):
    monkeypatch.setenv('DEID_ENGINE', 'regex')
    resp = api_client.get('/settings', headers=_auth(user_token))
    assert resp.status_code == 200
    assert resp.json()['deidEngine'] == 'regex'


def test_save_invalid_deid_engine(api_client, user_token):
    bad = {
        'theme': 'modern',
        'categories': {'codes': True, 'compliance': True, 'publicHealth': True, 'differentials': True},
        'rules': [],
        'deidEngine': 'invalid'
    }
    resp = api_client.post('/settings', json=bad, headers=_auth(user_token))
    assert resp.status_code == 422


def test_rules_cleaning_and_flags_persist(api_client, user_token):
    prefs = {
        'theme': 'modern',
        'categories': {'codes': True, 'compliance': True, 'publicHealth': True, 'differentials': True},
        'rules': ['  first  ', '', 'second'],
        'useLocalModels': True,
        'useOfflineMode': True,
        'deidEngine': 'regex'
    }
    resp = api_client.post('/settings', json=prefs, headers=_auth(user_token))
    assert resp.status_code == 200
    data = resp.json()
    assert data['rules'] == ['first', 'second']
    assert data['useLocalModels'] is True
    assert data['useOfflineMode'] is True
    resp = api_client.get('/settings', headers=_auth(user_token))
    roundtrip = resp.json()
    assert roundtrip['rules'] == ['first', 'second']
    assert roundtrip['useOfflineMode'] is True
