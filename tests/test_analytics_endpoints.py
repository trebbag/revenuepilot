import sqlite3
import backend.main as main
from fastapi.testclient import TestClient


def setup_module(module):
    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    main.db_conn.execute(
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT, timestamp REAL, details TEXT, revenue REAL, time_to_close REAL, codes TEXT, compliance_flags TEXT, public_health INTEGER, satisfaction INTEGER)"
    )
    main.db_conn.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT)"
    )
    main.db_conn.execute(
        "CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL, username TEXT, action TEXT, details TEXT)"
    )
    main.db_conn.commit()
    client = TestClient(main.app)
    token = main.create_token('logger', 'user')
    events = [
        {
            "eventType": "note_closed",
            "timestamp": 1000,
            "clinician": "alice",
            "codes": ["99213"],
            "revenue": 100.0,
            "denial": False,
            "deficiency": False,
        },
        {
            "eventType": "note_closed",
            "timestamp": 2000,
            "clinician": "bob",
            "codes": ["99214"],
            "revenue": 150.0,
            "denial": True,
            "deficiency": True,
        },
        {"eventType": "beautify", "timestamp": 1100, "clinician": "alice"},
        {
            "eventType": "suggest",
            "timestamp": 1200,
            "clinician": "alice",
            "compliance": ["Missing ROS"],
        },
        {
            "eventType": "suggest",
            "timestamp": 2100,
            "clinician": "bob",
            "compliance": ["Incomplete history"],
        },
    ]
    for ev in events:
        assert (
            client.post('/event', json=ev, headers={'Authorization': f'Bearer {token}'}).status_code == 200
        )


def test_usage_and_permissions():
    client = TestClient(main.app)
    admin_token = main.create_token('admin', 'admin')
    resp = client.get('/api/analytics/usage', headers={'Authorization': f'Bearer {admin_token}'})
    data = resp.json()
    assert data['total_notes'] == 2
    assert data['beautify'] == 1
    assert data['suggest'] == 2
    alice_token = main.create_token('alice', 'user')
    resp = client.get('/api/analytics/usage', headers={'Authorization': f'Bearer {alice_token}'})
    data = resp.json()
    assert data['total_notes'] == 1
    assert data['suggest'] == 1


def test_coding_revenue_compliance():
    client = TestClient(main.app)
    admin_token = main.create_token('admin', 'admin')
    resp = client.get('/api/analytics/coding-accuracy', headers={'Authorization': f'Bearer {admin_token}'})
    data = resp.json()
    assert data['total_notes'] == 2
    assert data['denials'] == 1
    assert data['deficiencies'] == 1
    assert data['accuracy'] == 0
    alice_token = main.create_token('alice', 'user')
    resp = client.get('/api/analytics/coding-accuracy', headers={'Authorization': f'Bearer {alice_token}'})
    assert resp.json()['accuracy'] == 1
    resp = client.get('/api/analytics/revenue', headers={'Authorization': f'Bearer {admin_token}'})
    data = resp.json()
    assert data['total_revenue'] == 250.0
    assert data['revenue_by_code'] == {'99213': 100.0, '99214': 150.0}
    resp = client.get('/api/analytics/compliance', headers={'Authorization': f'Bearer {admin_token}'})
    data = resp.json()
    assert data['compliance_counts'] == {'Missing ROS': 1, 'Incomplete history': 1}
    assert data['total_flags'] == 2


def test_user_permissions_endpoint():
    client = TestClient(main.app)
    token = main.create_token('alice', 'user')
    resp = client.get('/api/user/permissions', headers={'Authorization': f'Bearer {token}'})
    assert resp.json() == {'role': 'user'}
