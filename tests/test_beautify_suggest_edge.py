import sqlite3
import json
from fastapi.testclient import TestClient
import backend.main as main


def setup_module(module):
    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    main.db_conn.execute('CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT, timestamp REAL, details TEXT, revenue REAL, codes TEXT, compliance_flags TEXT, public_health INTEGER, satisfaction INTEGER)')
    main.db_conn.execute('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)')
    pwd = main.hash_password('pw')
    main.db_conn.execute('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)', ('u', pwd, 'user'))
    main.db_conn.commit()


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


def test_beautify_offline_flag_precedence(monkeypatch):
    client = TestClient(main.app)
    token = main.create_token('u', 'user')
    monkeypatch.setattr(main, 'USE_OFFLINE_MODEL', False)
    # Force offline via request field
    resp = client.post('/beautify', json={'text': 'note', 'useOfflineMode': True}, headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()['beautified'].startswith('Beautified (offline):')


def test_suggest_llm_parse_failure(monkeypatch):
    client = TestClient(main.app)
    token = main.create_token('u', 'user')

    def bad_call(msgs):
        return 'not json'
    monkeypatch.setattr(main, 'call_openai', bad_call)
    resp = client.post('/suggest', json={'text': 'Patient with cough and diabetes.'}, headers=_auth(token))
    data = resp.json()
    # fallback should include codes for cough / diabetes
    codes = {c['code'] for c in data['codes']}
    assert {'99213', 'E11.9'} & codes
    assert data['compliance']
    assert data['publicHealth']
    assert data['differentials']


def test_suggest_rules_injection(monkeypatch):
    injected = {}
    def fake_call(msgs):
        # last user message passed to LLM should contain rule text
        injected['content'] = msgs[-1]['content']
        return json.dumps({'codes': [{'code': '99212'}], 'compliance': [], 'publicHealth': [], 'differentials': []})
    monkeypatch.setattr(main, 'call_openai', fake_call)
    client = TestClient(main.app)
    token = main.create_token('u', 'user')
    resp = client.post('/suggest', json={'text': 'note', 'rules': ['Add vitals']}, headers=_auth(token))
    assert resp.status_code == 200
    assert 'Add vitals' in injected['content']


def test_beautify_error_capitalization(monkeypatch):
    client = TestClient(main.app)
    token = main.create_token('u', 'user')
    def boom(msgs):
        raise RuntimeError('fail')
    monkeypatch.setattr(main, 'call_openai', boom)
    resp = client.post('/beautify', json={'text': 'first sentence. second.'}, headers=_auth(token))
    assert resp.json()['beautified'].startswith('First sentence.')
