"""Integration tests covering patient and encounter endpoints."""

import json
from collections import defaultdict, deque

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
        json={'session_id': session_id, 'action': 'complete'},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()['status'] == 'complete'

    resp = client.post(
        '/api/charts/upload',
        files={'file': ('chart.txt', b'123')},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    info = resp.json()
    assert info['filename'] == 'chart.txt'
    assert info['size'] == 3
    assert (main.UPLOAD_DIR / 'chart.txt').exists()


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
