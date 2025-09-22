import pytest

from backend import main
from backend.db.models import User


@pytest.fixture
def user_credentials(db_session):
    username = "alice"
    password = "pw"
    user = User(username=username, password_hash=main.hash_password(password), role="user")
    db_session.add(user)
    db_session.commit()
    return username, password


@pytest.fixture
def auth_token(api_client, user_credentials):
    username, password = user_credentials
    response = api_client.post("/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_layout_preferences_roundtrip(api_client, auth_token):
    headers = {"Authorization": f"Bearer {auth_token}"}
    resp = api_client.get("/api/user/layout-preferences", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == {}

    payload = {"noteEditor": 65, "suggestionPanel": 35, "sidebarCollapsed": True}
    resp = api_client.put("/api/user/layout-preferences", json=payload, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == payload
    assert body["noteEditor"] == 65
    assert body["suggestionPanel"] == 35

    resp = api_client.get("/api/user/layout-preferences", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == payload
    assert body["noteEditor"] == 65
    assert body["suggestionPanel"] == 35
