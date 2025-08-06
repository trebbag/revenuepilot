import backend.main as main
from fastapi.testclient import TestClient


def test_prompt_template_validation():
    client = TestClient(main.app)
    token = main.create_token('alice', 'admin')
    resp = client.post(
        '/prompt-templates',
        json={'default': []},
        headers={'Authorization': f'Bearer {token}'},
    )
    assert resp.status_code == 400
