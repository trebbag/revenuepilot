import time

from fastapi.testclient import TestClient

import backend.ehr_integration as ehr_integration
import backend.main as main


def test_prometheus_metrics_available():
    main.reset_export_workers_for_tests()
    client = TestClient(main.app)
    token = main.create_token('metrics-admin', 'admin')

    resp_json = client.get('/metrics', headers={'Authorization': f'Bearer {token}'})
    assert resp_json.status_code == 200

    resp_prom = client.get(
        '/metrics?format=prometheus', headers={'Authorization': f'Bearer {token}'}
    )
    assert resp_prom.status_code == 200
    body = resp_prom.text
    assert 'revenuepilot_request_latency_seconds' in body
    assert 'revenuepilot_requests_total' in body


def test_status_alerts_reflect_events(monkeypatch):
    main.reset_export_workers_for_tests()
    client = TestClient(main.app)
    main.reset_alert_summary_for_tests()

    token_user = main.create_token('alert-user', 'user')
    token_admin = main.create_token('alert-admin', 'admin')

    def failing_call_openai(*_args, **_kwargs):
        raise RuntimeError('simulated failure')

    monkeypatch.setattr(main, 'call_openai', failing_call_openai)

    resp = client.post(
        '/api/ai/beautify',
        json={'text': 'Example note for monitoring checks'},
        headers={'Authorization': f'Bearer {token_user}'},
    )
    assert resp.status_code == 200

    monkeypatch.setattr(
        ehr_integration,
        'post_note_and_codes',
        lambda *args, **kwargs: {'status': 'error', 'detail': 'timeout'},
    )

    export_payload = {
        'note': 'Example note for export',
        'codes': [],
        'procedures': [],
        'medications': [],
        'patientID': None,
        'encounterID': None,
        'ehrSystem': 'TestEHR',
    }
    resp = client.post(
        '/api/export/ehr',
        json=export_payload,
        headers={'Authorization': f'Bearer {token_user}'},
    )
    assert resp.status_code == 200
    export_id = resp.json().get('exportId')
    assert export_id is not None

    poll_data = None
    for _ in range(10):
        poll_resp = client.get(
            f'/api/export/ehr/{export_id}',
            headers={'Authorization': f'Bearer {token_user}'},
        )
        assert poll_resp.status_code == 200
        poll_data = poll_resp.json()
        if poll_data['status'] not in {'queued', 'retrying', 'in_progress'}:
            break
        time.sleep(0.05)

    assert poll_data is not None
    assert poll_data['status'] == 'error'

    main._record_workflow_completion('ehr', {'sessionId': 'demo-session'}, 'trace-test')

    resp = client.get(
        '/status/alerts', headers={'Authorization': f'Bearer {token_admin}'}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['ai']['errors'] >= 1
    assert data['exports']['failures'] >= 1
    assert data['workflow']['total'] >= 1
