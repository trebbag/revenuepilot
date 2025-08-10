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


def _auth(t):
    return {'Authorization': f'Bearer {t}'}


def test_summarize_offline_flag_precedence(monkeypatch):
    client = TestClient(main.app)
    token = main.create_token('u', 'user')
    monkeypatch.setattr(main, 'USE_OFFLINE_MODEL', False)
    resp = client.post('/summarize', json={'text': 't', 'useOfflineMode': True}, headers=_auth(token))
    assert resp.status_code == 200
    assert 'summary' in resp.json()


def test_summarize_llm_returns_patient_friendly(monkeypatch):
    def fake(msgs):
        return json.dumps({'summary': 'S', 'patient_friendly': 'PF', 'recommendations': [], 'warnings': []})
    monkeypatch.setattr(main, 'call_openai', fake)
    client = TestClient(main.app)
    token = main.create_token('u', 'user')
    resp = client.post('/summarize', json={'text': 'x'}, headers=_auth(token))
    assert resp.json()['patient_friendly'] == 'PF'


def test_summarize_llm_missing_patient_friendly(monkeypatch):
    def fake(msgs):
        return json.dumps({'summary': 'Only'})
    monkeypatch.setattr(main, 'call_openai', fake)
    client = TestClient(main.app)
    token = main.create_token('u', 'user')
    resp = client.post('/summarize', json={'text': 'x'}, headers=_auth(token))
    j = resp.json()
    assert j['patient_friendly'] == 'Only'
