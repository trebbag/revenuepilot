import sqlite3
from fastapi.testclient import TestClient

import backend.main as main


def setup_module(module):
    """Set up in-memory DB with templates table."""
    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    main.db_conn.execute(
        'CREATE TABLE templates (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, clinic TEXT, specialty TEXT, name TEXT, content TEXT)'
    )
    main.db_conn.commit()


def test_create_update_and_list_templates():
    client = TestClient(main.app)
    token = main.create_token('alice', 'user', clinic='clinic1')
    resp = client.post(
        '/templates',
        json={'name': 'Custom', 'content': 'Note', 'specialty': 'cardiology'},
        headers={'Authorization': f'Bearer {token}'},
    )
    assert resp.status_code == 200
    tpl_id = resp.json()['id']
    assert tpl_id
    resp = client.put(
        f'/templates/{tpl_id}',
        json={'name': 'Updated', 'content': 'New', 'specialty': 'cardiology'},
        headers={'Authorization': f'Bearer {token}'},
    )
    assert resp.status_code == 200
    assert resp.json()['name'] == 'Updated'
    resp = client.get('/templates', headers={'Authorization': f'Bearer {token}'})
    data = resp.json()
    assert any(t['name'] == 'Updated' for t in data)


def test_delete_template():
    client = TestClient(main.app)
    token = main.create_token('alice', 'user', clinic='clinic1')
    resp = client.post(
        '/templates',
        json={'name': 'Temp', 'content': 'X', 'specialty': 'cardiology'},
        headers={'Authorization': f'Bearer {token}'},
    )
    tpl_id = resp.json()['id']
    resp = client.delete(f'/templates/{tpl_id}', headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 200
    resp = client.get('/templates', headers={'Authorization': f'Bearer {token}'})
    assert all(t['id'] != tpl_id for t in resp.json())


def test_template_scoped_by_clinic():
    client = TestClient(main.app)
    token_a = main.create_token('alice', 'user', clinic='clinicA')
    # Admin creates clinic-wide template
    admin_token = main.create_token('admin', 'admin', clinic='clinicA')
    resp = client.post(
        '/templates',
        json={'name': 'Scoped', 'content': 'S', 'specialty': 'cardiology'},
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    tpl_id = resp.json()['id']
    # User in same clinic sees the template
    token_a = main.create_token('alice', 'user', clinic='clinicA')
    resp = client.get('/templates?specialty=cardiology', headers={'Authorization': f'Bearer {token_a}'})
    assert any(t['id'] == tpl_id for t in resp.json())
    # User in different clinic does not
    token_b = main.create_token('bob', 'user', clinic='clinicB')
    resp = client.get('/templates?specialty=cardiology', headers={'Authorization': f'Bearer {token_b}'})
    assert all(t['id'] != tpl_id for t in resp.json())


def test_templates_require_auth():
    client = TestClient(main.app)
    resp = client.get('/templates')
    assert resp.status_code in {401, 403}


def test_templates_allow_user_role():
    client = TestClient(main.app)
    token = main.create_token('alice', 'user', clinic='clinic1')
    resp = client.get('/templates', headers={'Authorization': f'Bearer {token}'})
    assert resp.status_code == 200


def test_templates_reject_invalid_token():
    client = TestClient(main.app)
    resp = client.get('/templates', headers={'Authorization': 'Bearer badtoken'})
    assert resp.status_code == 401
