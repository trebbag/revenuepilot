import json
from datetime import datetime
from fastapi.testclient import TestClient
import pytest
import sqlite3

import backend.main as main

# Use an in-memory database for isolation
def setup_module(module):
    main.db_conn = sqlite3.connect(':memory:', check_same_thread=False)
    main.db_conn.row_factory = sqlite3.Row
    main.db_conn.execute(
        "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, eventType TEXT, timestamp REAL, details TEXT)"
    )

def test_metrics_aggregation():
    client = TestClient(main.app)
    events = [
        {
            "eventType": "note_closed",
            "timestamp": 1000,
            "clinician": "alice",
            "codes": ["99213"],
            "revenue": 100.0,
            "denial": False,
            "deficiency": False,
            "timeToClose": 60.0,
        },
        {
            "eventType": "note_closed",
            "timestamp": 2000,
            "clinician": "bob",
            "codes": ["99214"],
            "revenue": 200.0,
            "denial": True,
            "deficiency": True,
            "timeToClose": 120.0,
        },
    ]
    token = main.create_token('logger', 'user')
    for ev in events:
        assert (
            client.post('/event', json=ev, headers={"Authorization": f"Bearer {token}"}).status_code
            == 200
        )
    # Unfiltered metrics
    admin_token = main.create_token('tester', 'admin')
    resp = client.get('/metrics', headers={'Authorization': f'Bearer {admin_token}'})
    data = resp.json()
    assert data['revenue_per_visit'] == pytest.approx(150.0)
    assert data['coding_distribution']['99213'] == 1
    assert data['coding_distribution']['99214'] == 1
    assert data['denial_rate'] == pytest.approx(0.5)
    assert data['deficiency_rate'] == pytest.approx(0.5)
    assert data['avg_close_time'] == pytest.approx(90.0)
    # Filter by clinician
    resp = client.get(
        '/metrics', params={'clinician': 'alice'}, headers={'Authorization': f'Bearer {admin_token}'}
    )
    data = resp.json()
    assert data['revenue_per_visit'] == pytest.approx(100.0)
    assert data['coding_distribution'] == {'99213': 1}
    assert data['denial_rate'] == 0


def test_metrics_timeseries_and_range():
    client = TestClient(main.app)
    main.db_conn.execute('DELETE FROM events')
    ts1 = datetime(2024, 1, 1, 12, 0).timestamp()
    ts2 = datetime(2024, 1, 8, 12, 0).timestamp()
    events = [
        {"eventType": "note_started", "timestamp": ts1, "details": json.dumps({"patientID": "p1", "length": 100})},
        {"eventType": "beautify", "timestamp": ts1 + 60, "details": json.dumps({"patientID": "p1"})},
        {"eventType": "suggest", "timestamp": ts1 + 120, "details": json.dumps({})},
        {"eventType": "summary", "timestamp": ts1 + 180, "details": json.dumps({})},
        {"eventType": "chart_upload", "timestamp": ts1 + 240, "details": json.dumps({})},
        {"eventType": "audio_recorded", "timestamp": ts1 + 300, "details": json.dumps({})},
        {"eventType": "note_started", "timestamp": ts2, "details": json.dumps({"patientID": "p2", "length": 150})},
    ]
    for ev in events:
        main.db_conn.execute(
            "INSERT INTO events (eventType, timestamp, details) VALUES (?,?,?)",
            (ev["eventType"], ev["timestamp"], ev.get("details", "")),
        )
    main.db_conn.commit()
    token = main.create_token('tester', 'admin')
    start = datetime.utcfromtimestamp(ts1 - 10).isoformat()
    end = datetime.utcfromtimestamp(ts2 + 10).isoformat()
    resp = client.get('/metrics', params={'start': start, 'end': end}, headers={'Authorization': f'Bearer {token}'})
    data = resp.json()
    daily = {d['date']: d for d in data['timeseries']['daily']}
    assert daily['2024-01-01']['notes'] == 1
    assert daily['2024-01-01']['beautify'] == 1
    assert daily['2024-01-01']['suggest'] == 1
    assert daily['2024-01-08']['notes'] == 1
    # range filter
    resp = client.get('/metrics', params={'start': datetime.utcfromtimestamp(ts2).isoformat()}, headers={'Authorization': f'Bearer {token}'})
    data = resp.json()
    assert data['total_notes'] == 1
