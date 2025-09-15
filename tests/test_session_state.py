import json
from fastapi.testclient import TestClient

import backend.main as main
from backend.main import app, _init_core_tables

client = TestClient(app)
_init_core_tables(main.db_conn)


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_session_state_persistence():
    r = client.post('/register', json={'username': 'sess', 'password': 'pw'})
    assert r.status_code == 200, r.text
    data = r.json()
    token = data['access_token']
    session = data.get('session')
    assert session is not None
    assert session['panelStates']['suggestionPanel'] is False

    new_session = {
        'selectedCodes': {'codes': 1, 'prevention': 0, 'diagnoses': 2, 'differentials': 3},
        'panelStates': {'suggestionPanel': True},
        'currentNote': {'id': 5}
    }
    r2 = client.put('/api/user/session', headers=auth_header(token), json=new_session)
    assert r2.status_code == 200, r2.text
    assert r2.json()['panelStates']['suggestionPanel'] is True

    r3 = client.get('/api/user/session', headers=auth_header(token))
    assert r3.status_code == 200
    fetched = r3.json()
    assert fetched['selectedCodes']['codes'] == 1

    r4 = client.post('/login', json={'username': 'sess', 'password': 'pw'})
    assert r4.status_code == 200
    after = r4.json()
    assert after['session']['panelStates']['suggestionPanel'] is True
