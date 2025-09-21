"""End-to-end authentication flow tests."""


def test_registration_login_refresh_and_roles(api_client, admin_user):
    client = api_client

    resp = client.post('/login', json={'username': 'admin', 'password': 'secret'})
    assert resp.status_code == 200
    admin_tokens = resp.json()
    admin_token = admin_tokens['access_token']

    resp = client.post('/register', json={'username': 'alice', 'password': 'pw'})
    assert resp.status_code == 200

    resp = client.post('/login', json={'username': 'alice', 'password': 'pw'})
    assert resp.status_code == 200
    tokens = resp.json()
    access = tokens['access_token']
    refresh = tokens['refresh_token']

    resp = client.get('/metrics', headers={'Authorization': f'Bearer {access}'})
    assert resp.status_code == 403

    resp = client.post('/refresh', json={'refresh_token': refresh})
    assert resp.status_code == 200
    new_access = resp.json()['access_token']

    resp = client.post(
        '/event',
        json={'eventType': 'test', 'details': {}},
        headers={'Authorization': f'Bearer {new_access}'},
    )
    assert resp.status_code == 200

    resp = client.get('/metrics', headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200

    resp = client.get('/audit', headers={'Authorization': f'Bearer {access}'})
    assert resp.status_code == 403

    resp = client.get('/audit', headers={'Authorization': f'Bearer {admin_token}'})
    assert resp.status_code == 200
    logs = resp.json()
    assert any(log['details'] == '/metrics' for log in logs)
