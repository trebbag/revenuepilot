"""Integration tests covering patient and encounter endpoints."""

import json
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import pytest

from backend import auth, main


def auth_header(token: str):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture()
def client(api_client, tmp_path, admin_user):
    db = main.db_conn
    for table in ('visit_sessions', 'encounters', 'patients'):
        db.execute(f'DELETE FROM {table}')
    db.commit()

    with main.auth_session_scope() as session:
        auth.register_user(session, 'user', 'pw')

    main.events = []
    main.transcript_history = defaultdict(lambda: deque(maxlen=main.TRANSCRIPT_HISTORY_LIMIT))
    upload_dir = tmp_path / 'uploads'
    upload_dir.mkdir(parents=True, exist_ok=True)
    main.UPLOAD_DIR = upload_dir

    return api_client


def test_patient_encounter_flow(client):
    db = main.db_conn
    db.execute(
        "INSERT INTO patients (first_name, last_name, dob, mrn, gender, insurance, last_visit, allergies, medications) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            'John',
            'Doe',
            '1980-01-01',
            'MRN123',
            'M',
            'Blue',
            '2024-01-01',
            json.dumps(['peanuts']),
            json.dumps(['aspirin']),
        ),
    )
    john_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    db.execute(
        "INSERT INTO patients (first_name, last_name, dob, mrn, gender, insurance, last_visit, allergies, medications) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            'Jane',
            'Smith',
            '1990-02-02',
            'MRN456',
            'F',
            'Aetna',
            '2024-02-02',
            '[]',
            '[]',
        ),
    )
    jane_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    db.execute(
        "INSERT INTO encounters (patient_id, date, type, provider) VALUES (?, ?, ?, ?)",
        (john_id, '2024-03-01', 'checkup', 'Dr. House'),
    )
    encounter_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    db.commit()

    token = client.post('/login', json={'username': 'user', 'password': 'pw'}).json()['access_token']

    resp = client.get(
        '/api/patients/search',
        params={'q': 'Jane', 'limit': 2},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    results = resp.json()
    assert results['pagination']['returned'] == 1
    assert any(str(jane_id) == r['patientId'] for r in results['patients'])
    assert results['patients'][0]['mrn'] == 'MRN456'

    resp = client.get(
        '/api/patients/search',
        params={'q': 'MRN', 'limit': 1, 'offset': 1},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    page = resp.json()
    assert page['pagination']['offset'] == 1
    assert page['pagination']['returned'] == 1
    assert any(result['mrn'] == 'MRN456' for result in page['patients'])

    resp = client.get(f'/api/patients/{john_id}', headers=auth_header(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data['demographics']['name'] == 'John Doe'
    assert data['demographics']['mrn'] == 'MRN123'
    assert data['allergies'] == ['peanuts']

    resp = client.get(f'/api/encounters/validate/{encounter_id}', headers=auth_header(token))
    assert resp.status_code == 200
    encounter_payload = resp.json()
    assert encounter_payload['valid'] is True
    assert encounter_payload['encounter']['encounterId'] == encounter_id
    assert encounter_payload['encounter']['patient']['patientId'] == str(john_id)
    resp = client.get('/api/encounters/validate/999', headers=auth_header(token))
    assert resp.status_code == 200
    invalid = resp.json()
    assert invalid['valid'] is False
    assert 'Encounter not found' in invalid['errors'][0]

    resp = client.post('/api/visits/session', json={'encounter_id': encounter_id}, headers=auth_header(token))
    assert resp.status_code == 200
    session_id = resp.json()['sessionId']
    resp = client.put(
        '/api/visits/session',
        json={'session_id': session_id, 'action': 'stop'},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()['status'] == 'completed'

    resp = client.post(
        '/api/charts/upload',
        params={'patient_id': 'pt-test'},
        files={'file': ('chart.txt', b'123')},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    info = resp.json()
    assert info['patient_id'] == 'pt-test'
    assert info['files'][0]['name'] == 'chart.txt'
    assert (main.UPLOAD_DIR / 'chart.txt').exists()


def test_visit_session_server_authoritative(client, monkeypatch):
    db = main.db_conn
    db.execute(
        "INSERT INTO patients (first_name, last_name, dob, mrn, gender, insurance) VALUES (?, ?, ?, ?, ?, ?)",
        (
            'Alice',
            'Wonder',
            '1985-05-05',
            'MRN999',
            'F',
            'PayerX',
        ),
    )
    patient_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    db.execute(
        "INSERT INTO encounters (patient_id, date, type, provider, description) VALUES (?, ?, ?, ?, ?)",
        (patient_id, '2024-04-01', 'consult', 'Dr. Watson', 'Initial consult'),
    )
    encounter_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    db.commit()

    token = client.post('/login', json={'username': 'user', 'password': 'pw'}).json()['access_token']

    base_time = datetime(2024, 4, 1, 12, 0, tzinfo=timezone.utc)
    timeline = [
        base_time,
        base_time,
        base_time,
        base_time,
        base_time + timedelta(minutes=5),
        base_time + timedelta(minutes=5),
        base_time + timedelta(minutes=7),
        base_time + timedelta(minutes=7),
        base_time + timedelta(minutes=12),
        base_time + timedelta(minutes=12),
        base_time + timedelta(minutes=12),
    ]
    iterator = iter(timeline)

    def fake_now():
        try:
            return next(iterator)
        except StopIteration:
            return timeline[-1]

    monkeypatch.setattr(main, 'utc_now', fake_now)

    resp = client.post(
        '/api/visits/session',
        json={'encounter_id': encounter_id, 'patient_id': str(patient_id)},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    session = resp.json()
    assert session['status'] == 'active'
    assert session['durationSeconds'] == 0
    assert session['patientId'] == str(patient_id)
    session_id = session['sessionId']

    resp = client.post(
        '/api/visits/session',
        json={'encounter_id': encounter_id},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()['sessionId'] == session_id

    pause = client.patch(
        '/api/visits/session',
        json={'sessionId': session_id, 'action': 'pause'},
        headers=auth_header(token),
    )
    assert pause.status_code == 200
    payload = pause.json()
    assert payload['status'] == 'paused'
    assert payload['durationSeconds'] == 300
    assert payload['lastResumedAt'] is None

    resume = client.patch(
        '/api/visits/session',
        json={'sessionId': session_id, 'action': 'resume'},
        headers=auth_header(token),
    )
    assert resume.status_code == 200
    resumed_payload = resume.json()
    assert resumed_payload['status'] == 'active'
    assert resumed_payload['durationSeconds'] == 300

    stop = client.patch(
        '/api/visits/session',
        json={'sessionId': session_id, 'action': 'stop'},
        headers=auth_header(token),
    )
    assert stop.status_code == 200
    stopped = stop.json()
    assert stopped['status'] == 'completed'
    assert stopped['durationSeconds'] == 600
    assert stopped['endTime'] is not None

    row = db.execute(
        'SELECT status, duration_seconds, last_resumed_at, end_time FROM visit_sessions WHERE id=?',
        (session_id,),
    ).fetchone()
    assert row['status'] == 'completed'
    assert row['duration_seconds'] == 600
    assert row['last_resumed_at'] is None
    assert row['end_time']

    audit_rows = db.execute(
        "SELECT action, details FROM audit_log ORDER BY id"
    ).fetchall()
    events = [
        (entry['action'], json.loads(entry['details'] or '{}'))
        for entry in audit_rows
        if entry['action'] in {'visit_session_start', 'visit_session_pause', 'visit_session_complete'}
    ]
    actions = [action for action, _ in events]
    assert 'visit_session_start' in actions
    assert 'visit_session_pause' in actions
    assert 'visit_session_complete' in actions
    assert any(evt.get('durationSeconds') == 600 for _, evt in events if _.endswith('complete'))


def test_validate_encounter_missing_patient(client):
    db = main.db_conn
    db.execute(
        "INSERT INTO patients (first_name, last_name, dob, mrn, gender, insurance) VALUES (?, ?, ?, ?, ?, ?)",
        ('Ghost', 'Patient', '1970-01-01', 'MRNX', 'X', 'None'),
    )
    patient_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    db.execute(
        "INSERT INTO encounters (patient_id, date, type, provider) VALUES (?, ?, ?, ?)",
        (patient_id, '2024-05-05', 'followup', 'Dr. Strange'),
    )
    encounter_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    db.execute('DELETE FROM patients WHERE id=?', (patient_id,))
    db.commit()

    token = client.post('/login', json={'username': 'user', 'password': 'pw'}).json()['access_token']
    resp = client.get(f'/api/encounters/validate/{encounter_id}', headers=auth_header(token))
    assert resp.status_code == 200
    payload = resp.json()
    assert payload['valid'] is False
    assert 'associated patient' in payload['errors'][0]
    assert payload['encounter']['encounterId'] == encounter_id
    assert 'patient' not in payload['encounter']
