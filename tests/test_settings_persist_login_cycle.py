import json
import sqlite3
from fastapi.testclient import TestClient

import backend.main as main
from backend.main import app, _init_core_tables

client = TestClient(app)

# Ensure core tables exist for this test DB (file-based default already initialised, but keep for safety)
_init_core_tables(main.db_conn)


def test_settings_persist_across_login_cycle():
    # Register a new user
    r = client.post('/register', json={'username': 'persistuser', 'password': 'pw123'})
    assert r.status_code == 200
    data = r.json()
    token = data['access_token']

    # Update settings with non-default values
    new_settings = {
        'theme': 'dark',
        'categories': {'codes': False, 'compliance': True, 'publicHealth': False, 'differentials': True},
        'rules': [' A ', 'B', ''],  # expect trimming and empty removal
        'lang': 'en',
        'summaryLang': 'en',
        'specialty': 'cardiology',
        'payer': 'medicare',
        'region': 'US',
        'template': None,
        'useLocalModels': True,
        'useOfflineMode': False,
        'agencies': ['CDC'],
        'beautifyModel': 'local-beautify',
        'suggestModel': 'local-suggest',
        'summarizeModel': 'local-summarize',
        'deidEngine': 'regex'
    }
    r2 = client.post('/settings', headers={'Authorization': f'Bearer {token}'}, json=new_settings)
    assert r2.status_code == 200, r2.text
    saved = r2.json()
    assert saved['theme'] == 'dark'
    assert saved['categories']['codes'] is False
    assert saved['rules'] == ['A', 'B']  # trimmed & filtered

    # Fetch settings via GET to confirm persistence
    r3 = client.get('/settings', headers={'Authorization': f'Bearer {token}'})
    assert r3.status_code == 200
    fetched = r3.json()
    assert fetched['theme'] == 'dark'
    assert fetched['categories']['publicHealth'] is False
    assert fetched['beautifyModel'] == 'local-beautify'

    # Simulate logout/login: perform login again and ensure settings returned
    r4 = client.post('/login', json={'username': 'persistuser', 'password': 'pw123'})
    assert r4.status_code == 200
    after_login = r4.json()
    assert 'settings' in after_login
    login_settings = after_login['settings']
    assert login_settings['theme'] == 'dark'
    assert login_settings['categories']['codes'] is False
    assert login_settings['rules'] == ['A', 'B']
    assert login_settings['beautifyModel'] == 'local-beautify'
