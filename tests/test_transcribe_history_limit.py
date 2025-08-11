import sqlite3
from fastapi.testclient import TestClient
from collections import defaultdict, deque
import backend.main as main


def setup_module(module):
    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    main.db_conn.execute('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)')
    pwd = main.hash_password('pw')
    main.db_conn.execute('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)', ('alice', pwd, 'user'))
    main.db_conn.commit()
    main.transcript_history = defaultdict(lambda: deque(maxlen=3))  # shrink for test


def _auth(t):
    return {'Authorization': f'Bearer {t}'}


def test_history_limit(monkeypatch):
    client = TestClient(main.app)
    token = main.create_token('alice', 'user')
    monkeypatch.setattr(main, 'simple_transcribe', lambda b, language=None: 'x')
    for i in range(5):
        resp = client.post('/transcribe', files={'file': (f'f{i}.wav', b'd')}, headers=_auth(token))
        assert resp.status_code == 200
    resp = client.get('/transcribe', headers=_auth(token))
    hist = resp.json()['history']
    assert len(hist) == 3  # capped
