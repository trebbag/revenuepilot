import pytest

import pytest

from backend import main
from backend.db.models import User


@pytest.fixture
def user_credentials(db_session):
    username = 'alice'
    password = 'pw'
    user = User(username=username, password_hash=main.hash_password(password), role='user')
    db_session.add(user)
    db_session.commit()
    return username, password


def auth(token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {token}'}


def test_settings_persist_across_login_cycle(api_client, user_credentials):
    username, password = user_credentials

    resp = api_client.post('/login', json={'username': username, 'password': password})
    assert resp.status_code == 200
    tokens = resp.json()
    token = tokens['access_token']

    custom = {
        'theme': 'dark',
        'categories': {'codes': False, 'compliance': True, 'publicHealth': True, 'differentials': True},
        'rules': ['a', 'b'],
        'lang': 'es',
        'summaryLang': 'fr',
        'specialty': 'cardiology',
        'payer': 'medicare',
        'region': 'US',
        'agencies': ['WHO'],
        'template': 42,
        'useLocalModels': True,
        'useOfflineMode': True,
        'beautifyModel': 'gpt-x',
        'suggestModel': 'gpt-y',
        'summarizeModel': 'gpt-z',
        'deidEngine': 'regex',
    }
    resp = api_client.post('/settings', json=custom, headers=auth(token))
    assert resp.status_code == 200, resp.text

    resp2 = api_client.post('/login', json={'username': username, 'password': password})
    assert resp2.status_code == 200
    token2 = resp2.json()['access_token']

    resp3 = api_client.get('/settings', headers=auth(token2))
    assert resp3.status_code == 200
    data = resp3.json()
    for k, v in [
        ('theme', 'dark'),
        ('lang', 'es'),
        ('summaryLang', 'fr'),
        ('specialty', 'cardiology'),
        ('payer', 'medicare'),
        ('region', 'US'),
    ]:
        assert data[k] == v
    assert data['categories']['codes'] is False
    assert data['agencies'] == ['WHO']
    assert data['useLocalModels'] is True
    assert data.get('useOfflineMode') is True
    assert data['template'] == 42
    assert data['beautifyModel'] == 'gpt-x'
    assert data['suggestModel'] == 'gpt-y'
    assert data['summarizeModel'] == 'gpt-z'
    assert data['deidEngine'] == 'regex'

    bad = dict(custom)
    bad['unknownKey'] = 'value'
    resp4 = api_client.post('/settings', json=bad, headers=auth(token2))
    assert resp4.status_code == 200
    assert 'unknownKey' not in resp4.json()
