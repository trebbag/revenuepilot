import pytest

from backend import main
from backend.db.models import User


@pytest.fixture
def user_token(db_session):
    user = User(username="alice", password_hash=main.hash_password("pw"), role="user")
    db_session.add(user)
    db_session.commit()
    return main.create_token("alice", "user")


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_settings_roundtrip(api_client, db_session, user_token):
    token = user_token
    # defaults
    resp = api_client.get('/settings', headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data['theme'] == 'modern'
    assert data['categories']['codes'] is True
    assert data['rules'] == []

    assert data['lang'] == 'en'
    assert data['summaryLang'] == 'en'
    assert data['specialty'] is None
    assert data['payer'] is None
    assert data['agencies'] == ['CDC', 'WHO']
    assert data.get('template') is None
    assert data['region'] == ''
    assert data['useLocalModels'] is False
    assert data.get('useOfflineMode') is False
    assert data.get('deidEngine') == 'regex'

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
        'summaryLang': 'fr',
        'specialty': 'cardiology',
        'payer': 'medicare',
        'region': 'US',
        'agencies': ['CDC'],
        'template': -1,
        'useLocalModels': True,
    }
    resp = api_client.post('/settings', json=new_settings, headers=auth_header(token))
    assert resp.status_code == 200

    resp = api_client.get('/settings', headers=auth_header(token))
    data = resp.json()
    assert data['theme'] == 'dark'
    assert data['categories']['codes'] is False
    assert data['categories']['publicHealth'] is False
    assert data['rules'] == ['r1', 'r2']
    assert data['lang'] == 'es'
    assert data['summaryLang'] == 'fr'
    assert data['specialty'] == 'cardiology'
    assert data['payer'] == 'medicare'
    assert data['region'] == 'US'
    assert data['agencies'] == ['CDC']
    assert data['template'] == -1
    assert data['useLocalModels'] is True
    assert data.get('useOfflineMode') is False
    assert data.get('deidEngine') == 'regex'


def test_invalid_settings_rejected(api_client, user_token):
    token = user_token
    bad_theme = {
        'theme': 'neon',
        'categories': {'codes': True, 'compliance': True, 'publicHealth': True, 'differentials': True},
        'rules': [],
    }
    resp = api_client.post('/settings', json=bad_theme, headers=auth_header(token))
    assert resp.status_code == 422

    bad_categories = {
        'theme': 'modern',
        'categories': {'codes': 'yes'},
        'rules': [],
    }
    resp = api_client.post('/settings', json=bad_categories, headers=auth_header(token))
    assert resp.status_code == 422

    bad_rules = {
        'theme': 'modern',
        'categories': {'codes': True, 'compliance': True, 'publicHealth': True, 'differentials': True},
        'rules': ['ok', 5],
    }
    resp = api_client.post('/settings', json=bad_rules, headers=auth_header(token))
    assert resp.status_code == 422
