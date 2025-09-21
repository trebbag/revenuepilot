import sqlite3
from datetime import datetime, timezone

import pytest
import backend.main as main
from fastapi.testclient import TestClient
from backend import migrations


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
    migrations.ensure_confidence_scores_table(main.db_conn)
    client = TestClient(main.app)
    token = main.create_token('logger', 'user')
    def ts(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> float:
        return datetime(year, month, day, hour, minute, tzinfo=timezone.utc).timestamp()

    events = [
        {
            "eventType": "note_closed",
            "timestamp": ts(2024, 1, 10, 10),
            "clinician": "alice",
            "codes": ["99213"],
            "revenue": 100.0,
            "denial": False,
            "deficiency": False,
            "details": {"clinic": "north-clinic", "payer": "acme-health"},
        },
        {
            "eventType": "note_closed",
            "timestamp": ts(2024, 2, 15, 16),
            "clinician": "bob",
            "codes": ["99214"],
            "revenue": 150.0,
            "denial": True,
            "deficiency": True,
            "details": {"clinic": "uptown-clinic", "payer": "northcare"},
        },
        {
            "eventType": "beautify",
            "timestamp": ts(2024, 1, 11, 11),
            "clinician": "alice",
            "details": {"clinic": "north-clinic", "payer": "acme-health"},
        },
        {
            "eventType": "suggest",
            "timestamp": ts(2024, 1, 20, 9),
            "clinician": "alice",
            "compliance": ["Missing ROS"],
            "details": {"clinic": "north-clinic", "payer": "acme-health"},
        },
        {
            "eventType": "suggest",
            "timestamp": ts(2024, 3, 5, 8, 30),
            "clinician": "bob",
            "compliance": ["Incomplete history"],
            "details": {"clinic": "uptown-clinic", "payer": "northcare"},
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
    assert data['dailyUsage'] == [
        {'date': '2024-01-10', 'count': 1},
        {'date': '2024-02-15', 'count': 1},
    ]
    assert data['weeklyTrend'] == [
        {'week': '2024-02', 'count': 1},
        {'week': '2024-07', 'count': 1},
    ]
    alice_token = main.create_token('alice', 'user')
    resp = client.get('/api/analytics/usage', headers={'Authorization': f'Bearer {alice_token}'})
    data = resp.json()
    assert data['total_notes'] == 1
    assert data['suggest'] == 1
    assert data['dailyUsage'] == [{'date': '2024-01-10', 'count': 1}]
    assert data['weeklyTrend'] == [{'week': '2024-02', 'count': 1}]


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
    assert data['projectedRevenue'] == pytest.approx(3750.0)
    assert data['monthlyTrend'] == [
        {'month': '2024-01', 'revenue': 100.0},
        {'month': '2024-02', 'revenue': 150.0},
    ]
    assert data['code_distribution'] == {
        '99213': {'count': 1, 'revenue': 100.0},
        '99214': {'count': 1, 'revenue': 150.0},
    }
    resp = client.get('/api/analytics/compliance', headers={'Authorization': f'Bearer {admin_token}'})
    data = resp.json()
    assert data['compliance_counts'] == {'Missing ROS': 1, 'Incomplete history': 1}
    assert data['total_flags'] == 2


def test_filtered_analytics_queries():
    client = TestClient(main.app)
    admin_token = main.create_token('admin', 'admin')

    resp = client.get(
        '/api/analytics/usage',
        headers={'Authorization': f'Bearer {admin_token}'},
        params={'start': '2024-02-01', 'clinic': 'uptown-clinic', 'payer': 'northcare'},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['total_notes'] == 1
    assert data['dailyUsage'] == [{'date': '2024-02-15', 'count': 1}]
    assert data['weeklyTrend'] == [{'week': '2024-07', 'count': 1}]

    resp = client.get(
        '/api/analytics/coding-accuracy',
        headers={'Authorization': f'Bearer {admin_token}'},
        params={'payer': 'acme-health'},
    )
    assert resp.status_code == 200
    coding_data = resp.json()
    assert coding_data['total_notes'] == 1
    assert coding_data['denials'] == 0
    assert coding_data['deficiencies'] == 0
    assert coding_data['accuracy'] == 1

    resp = client.get(
        '/api/analytics/revenue',
        headers={'Authorization': f'Bearer {admin_token}'},
        params={'clinician': 'alice', 'end': '2024-01-31'},
    )
    assert resp.status_code == 200
    revenue_data = resp.json()
    assert revenue_data['total_revenue'] == 100.0
    assert revenue_data['revenue_by_code'] == {'99213': 100.0}

    resp = client.get(
        '/api/analytics/compliance',
        headers={'Authorization': f'Bearer {admin_token}'},
        params={'clinic': 'uptown-clinic'},
    )
    assert resp.status_code == 200
    compliance_data = resp.json()
    assert compliance_data['compliance_counts'] == {'Incomplete history': 1}
    assert compliance_data['total_flags'] == 1

    resp = client.get(
        '/api/analytics/revenue',
        headers={'Authorization': f'Bearer {admin_token}'},
        params={'start': '2024-03-01'},
    )
    assert resp.status_code == 200
    assert resp.json()['total_revenue'] == 0.0


def test_user_filter_scope_is_enforced():
    client = TestClient(main.app)
    alice_token = main.create_token('alice', 'user')

    resp = client.get(
        '/api/analytics/usage',
        headers={'Authorization': f'Bearer {alice_token}'},
        params={'clinician': 'bob', 'clinic': 'uptown-clinic'},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['total_notes'] == 0
    assert data['dailyUsage'] == []
    assert data['weeklyTrend'] == []

    resp = client.get(
        '/api/analytics/revenue',
        headers={'Authorization': f'Bearer {alice_token}'},
        params={'clinician': 'bob'},
    )
    assert resp.status_code == 200
    assert resp.json()['total_revenue'] == 0.0


def test_confidence_analytics_endpoint():
    client = TestClient(main.app)
    admin_token = main.create_token('admin', 'admin')
    pwd = main.hash_password('pw')
    main.db_conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ('coder', pwd, 'user'),
    )
    user_id = main.db_conn.execute(
        "SELECT id FROM users WHERE username=?",
        ('coder',),
    ).fetchone()[0]
    base = 1_700_000_000
    main.db_conn.executemany(
        "INSERT INTO confidence_scores (user_id, note_id, code, confidence, accepted, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
            (user_id, 'note-1', 'A1', 0.9, 1, base),
            (user_id, 'note-2', 'B2', 0.6, 0, base),
            (user_id, 'note-3', 'C3', 0.5, 1, base + 86400),
        ],
    )
    main.db_conn.commit()
    resp = client.get(
        '/api/analytics/confidence',
        headers={'Authorization': f'Bearer {admin_token}'},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['overall']['total'] == 3
    assert data['overall']['accepted'] == 2
    assert data['overall']['accuracy'] == pytest.approx(2 / 3)
    assert data['overall']['avg_confidence'] == pytest.approx((0.9 + 0.6 + 0.5) / 3)
    assert data['overall']['calibration_gap'] == pytest.approx(0.0, abs=1e-6)
    assert len(data['timeseries']) == 2
    day_one = data['timeseries'][0]
    assert day_one['total'] == 2
    assert day_one['accepted'] == 1
    assert day_one['accuracy'] == pytest.approx(0.5)
    assert day_one['avg_confidence'] == pytest.approx((0.9 + 0.6) / 2)


def test_user_permissions_endpoint():
    client = TestClient(main.app)
    token = main.create_token('alice', 'user')
    resp = client.get('/api/user/permissions', headers={'Authorization': f'Bearer {token}'})
    data = resp.json()
    assert data['role'] == 'user'
