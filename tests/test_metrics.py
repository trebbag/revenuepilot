import json
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
    for ev in events:
        assert client.post('/event', json=ev).status_code == 200
    # Unfiltered metrics
    token = main.create_token('tester', 'admin')
    resp = client.get('/metrics', headers={'Authorization': f'Bearer {token}'})
    data = resp.json()
    assert data['revenue_per_visit'] == pytest.approx(150.0)
    assert data['coding_distribution']['99213'] == 1
    assert data['coding_distribution']['99214'] == 1
    assert data['denial_rate'] == pytest.approx(0.5)
    assert data['deficiency_rate'] == pytest.approx(0.5)
    assert data['avg_close_time'] == pytest.approx(90.0)
    # Filter by clinician
    resp = client.get('/metrics', params={'clinician': 'alice'}, headers={'Authorization': f'Bearer {token}'})
    data = resp.json()
    assert data['revenue_per_visit'] == pytest.approx(100.0)
    assert data['coding_distribution'] == {'99213': 1}
    assert data['denial_rate'] == 0
