import sqlite3
from fastapi.testclient import TestClient

import backend.main as main


def setup_module(module):
    """Set up in-memory DB with templates table."""
    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    main.db_conn.execute(
        'CREATE TABLE templates (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, clinic TEXT, name TEXT, content TEXT)'
    )
    main.db_conn.commit()


def test_create_and_list_templates():
    client = TestClient(main.app)
    token = main.create_token('alice', 'user')
    resp = client.post(
        '/templates',
        json={'name': 'Custom', 'content': 'Note'},
        headers={'Authorization': f'Bearer {token}'},
    )
    assert resp.status_code == 200
    tpl_id = resp.json()['id']
    assert tpl_id
    resp = client.get('/templates', headers={'Authorization': f'Bearer {token}'})
    data = resp.json()
    assert any(t['name'] == 'Custom' for t in data)


def test_delete_template():
    client = TestClient(main.app)
    token = main.create_token('alice', 'user')
    resp = client.post(
        '/templates',
        json={'name': 'Temp', 'content': 'X'},
        headers={'Authorization': f'Bearer {token}'},
    )
    tpl_id = resp.json()['id']
    resp = client.delete(f'/templates/{tpl_id}', headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 200
    resp = client.get('/templates', headers={'Authorization': f'Bearer {token}'})
    assert all(t['id'] != tpl_id for t in resp.json())


def test_templates_require_auth():
    client = TestClient(main.app)
    resp = client.get('/templates')
    assert resp.status_code in {401, 403}
