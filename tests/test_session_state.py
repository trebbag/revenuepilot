import json
from uuid import uuid4
from fastapi.testclient import TestClient

import backend.main as main
from backend.main import app, _init_core_tables

client = TestClient(app)
_init_core_tables(main.db_conn)


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_session_state_persistence():
    username = f"sess_{uuid4().hex}"
    r = client.post('/register', json={'username': username, 'password': 'pw'})
    assert r.status_code == 200, r.text
    data = r.json()
    token = data['access_token']
    session = data.get('session')
    assert session is not None
    assert session['panelStates']['suggestionPanel'] is False
    assert session['isSuggestionPanelOpen'] is False
    assert session['selectedCodesList'] == []
    assert session['addedCodes'] == []

    new_session = {
        'selectedCodes': {'codes': 1, 'prevention': 0, 'diagnoses': 2, 'differentials': 3},
        'selectedCodesList': [
            {
                'code': '99213',
                'type': 'CPT',
                'category': 'codes',
                'description': 'Office visit'
            },
            {
                'code': 'J45.909',
                'type': 'ICD-10',
                'category': 'diagnoses',
                'description': 'Asthma, unspecified'
            }
        ],
        'addedCodes': ['99213', 'J45.909'],
        'isSuggestionPanelOpen': True
    }
    r2 = client.put('/api/user/session', headers=auth_header(token), json=new_session)
    assert r2.status_code == 200, r2.text
    updated = r2.json()
    assert updated['panelStates']['suggestionPanel'] is True
    assert updated['isSuggestionPanelOpen'] is True
    assert updated['addedCodes'] == ['99213', 'J45.909']
    assert updated['selectedCodesList'][0]['code'] == '99213'

    r3 = client.get('/api/user/session', headers=auth_header(token))
    assert r3.status_code == 200
    fetched = r3.json()
    assert fetched['selectedCodes']['codes'] == 1
    assert fetched['panelStates']['suggestionPanel'] is True
    assert fetched['isSuggestionPanelOpen'] is True
    assert fetched['addedCodes'] == ['99213', 'J45.909']
    assert [item['code'] for item in fetched['selectedCodesList']] == ['99213', 'J45.909']

    r4 = client.post('/login', json={'username': username, 'password': 'pw'})
    assert r4.status_code == 200
    after = r4.json()
    assert after['session']['panelStates']['suggestionPanel'] is True
    assert after['session']['isSuggestionPanelOpen'] is True
    assert after['session']['addedCodes'] == ['99213', 'J45.909']
    assert [item['code'] for item in after['session']['selectedCodesList']] == ['99213', 'J45.909']


def test_session_state_legacy_row_hydration():
    username = f"legacy_{uuid4().hex}"
    r = client.post('/register', json={'username': username, 'password': 'pw'})
    assert r.status_code == 200, r.text
    token = r.json()['access_token']
    user_row = main.db_conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
    assert user_row is not None
    legacy_payload = {
        'selectedCodes': {'codes': '4'},
        'panelStates': {'suggestionPanel': 1}
    }
    main.db_conn.execute(
        "UPDATE session_state SET data=? WHERE user_id=?",
        (json.dumps(legacy_payload), user_row['id'])
    )
    main.db_conn.commit()

    resp = client.get('/api/user/session', headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data['isSuggestionPanelOpen'] is True
    assert data['panelStates']['suggestionPanel'] is True
    assert data['selectedCodes']['codes'] == 4
    assert data['selectedCodes']['diagnoses'] == 0
    assert data['selectedCodesList'] == []
    assert data['addedCodes'] == []

    stored = main.db_conn.execute(
        "SELECT data FROM session_state WHERE user_id=?", (user_row['id'],)
    ).fetchone()
    assert stored is not None
    stored_data = json.loads(stored['data'])
    assert stored_data['isSuggestionPanelOpen'] is True
    assert stored_data['panelStates']['suggestionPanel'] is True
    assert 'selectedCodesList' in stored_data and stored_data['selectedCodesList'] == []
    assert stored_data['addedCodes'] == []


def test_session_state_partial_update_preserves_existing_fields():
    username = f"partial_{uuid4().hex}"
    r = client.post('/register', json={'username': username, 'password': 'pw'})
    assert r.status_code == 200, r.text
    token = r.json()['access_token']
    user_row = main.db_conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
    assert user_row is not None

    initial_state = main._normalize_session_state({
        'selectedCodes': {'codes': 2, 'diagnoses': 1},
        'selectedCodesList': [
            {
                'code': '11111',
                'type': 'CPT',
                'category': 'codes',
                'description': 'Example code'
            }
        ],
        'addedCodes': ['11111'],
        'currentNote': {'id': 42},
        'panelStates': {'suggestionPanel': False}
    })
    main.db_conn.execute(
        "UPDATE session_state SET data=? WHERE user_id=?",
        (json.dumps(initial_state), user_row['id'])
    )
    main.db_conn.commit()

    payload = {'isSuggestionPanelOpen': True}
    r2 = client.put('/api/user/session', headers=auth_header(token), json=payload)
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data['currentNote'] == {'id': 42}
    assert data['panelStates']['suggestionPanel'] is True
    assert data['isSuggestionPanelOpen'] is True
    assert data['addedCodes'] == ['11111']
    assert [item['code'] for item in data['selectedCodesList']] == ['11111']

    r3 = client.get('/api/user/session', headers=auth_header(token))
    assert r3.status_code == 200
    fetched = r3.json()
    assert fetched['currentNote'] == {'id': 42}
    assert fetched['panelStates']['suggestionPanel'] is True
    assert fetched['addedCodes'] == ['11111']
