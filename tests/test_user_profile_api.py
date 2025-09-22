import pytest
import pytest

from backend import main
from backend.db.models import User


@pytest.fixture
def user_token(db_session):
    user = User(username="alice", password_hash=main.hash_password("pw"), role="user")
    db_session.add(user)
    db_session.commit()
    return main.create_token("alice", "user")


def test_profile_and_notifications(api_client, user_token):
    token = user_token

    resp = api_client.get("/api/user/profile", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    profile_payload = resp.json()
    if isinstance(profile_payload, dict) and "data" in profile_payload:
        nested = profile_payload["data"]
        if isinstance(nested, dict):
            profile_payload = nested
    assert isinstance(profile_payload, dict)
    assert "preferences" in profile_payload
    assert profile_payload.get("userId") is None or isinstance(profile_payload.get("userId"), str)
    assert profile_payload.get("role") in {None, "user"}
    assert profile_payload.get("username") == "alice"
    ui_defaults = profile_payload.get("uiPreferences", {})
    assert "navigation" in ui_defaults
    assert ui_defaults["navigation"]["animationPreferences"]["speed"] == "normal"

    payload = {
        "currentView": "dashboard",
        "clinic": "Clinic A",
        "preferences": {"p": 1},
        "uiPreferences": {"theme": "dark"},
    }
    resp = api_client.put(
        "/api/user/profile",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    resp = api_client.get("/api/user/current-view", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["currentView"] == "dashboard"

    resp = api_client.get("/api/user/ui-preferences", headers={"Authorization": f"Bearer {token}"})
    prefs_payload = resp.json()["uiPreferences"]
    assert prefs_payload["theme"] == "dark"
    assert prefs_payload["navigation"]["collapsed"] is False

    resp = api_client.put(
        "/api/user/ui-preferences",
        json={"uiPreferences": {"theme": "light"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    resp = api_client.get("/api/user/ui-preferences", headers={"Authorization": f"Bearer {token}"})
    updated_prefs = resp.json()["uiPreferences"]
    assert updated_prefs["theme"] == "light"
    assert "navigation" in updated_prefs

    resp = api_client.get("/api/notifications/count", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["notifications"] == 0

    for idx in range(5):
        payload = {
            "notificationId": f"test-{idx}",
            "title": "Heads up",
            "message": "Check this out",
            "severity": "info",
        }
        stored, count = main._persist_notification_event("alice", payload, mark_unread=True)
        assert stored["id"] == payload["notificationId"]
        assert count == idx + 1

    resp = api_client.get("/api/notifications/count", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["notifications"] == 5

    with api_client.websocket_connect(
        "/ws/notifications", headers={"Authorization": f"Bearer {token}"}
    ) as ws:
        data = ws.receive_json()
        assert data["notifications"] == 5
        assert "drafts" in data
