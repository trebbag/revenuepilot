import sqlite3
from fastapi.testclient import TestClient
from backend import main, migrations


def setup_db(monkeypatch):
    db = sqlite3.connect(':memory:', check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)')
    db.execute('CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL, username TEXT, action TEXT, details TEXT)')
    migrations.ensure_settings_table(db)
    pwd = main.hash_password('pw')
    db.execute('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)', ('alice', pwd, 'user'))
    db.commit()
    monkeypatch.setattr(main, 'db_conn', db)
    return db


def auth(token):
    return {'Authorization': f'Bearer {token}'}


def test_settings_persist_across_login_cycle(monkeypatch):
    setup_db(monkeypatch)
    client = TestClient(main.app)
    # first login to get tokens
    resp = client.post('/login', json={'username': 'alice', 'password': 'pw'})
    assert resp.status_code == 200
    tokens = resp.json()
    token = tokens['access_token']

    # Save custom settings
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
    resp = client.post('/settings', json=custom, headers=auth(token))
    assert resp.status_code == 200, resp.text

    # simulate logout by discarding token and re-login
    resp2 = client.post('/login', json={'username': 'alice', 'password': 'pw'})
    assert resp2.status_code == 200
    token2 = resp2.json()['access_token']

    # Fetch settings after re-login
    resp3 = client.get('/settings', headers=auth(token2))
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

    # unknown key should be ignored silently
    bad = dict(custom)
    bad['unknownKey'] = 'value'
    resp4 = client.post('/settings', json=bad, headers=auth(token2))
    assert resp4.status_code == 200
    assert 'unknownKey' not in resp4.json()
