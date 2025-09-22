import pytest

from backend import main


def test_profile_and_notifications(api_client, db_session):
    main.notification_counts.clear()

    resp = api_client.post("/register", json={"username": "alice", "password": "pw"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = api_client.get("/api/user/profile", headers=headers)
    assert resp.status_code == 200
    profile_payload = resp.json()
    if isinstance(profile_payload, dict) and "data" in profile_payload:
        nested = profile_payload["data"]
        if isinstance(nested, dict):
            profile_payload = nested
    assert isinstance(profile_payload, dict)
    assert "preferences" in profile_payload
    assert profile_payload.get("role") in {None, "user"}
    assert profile_payload.get("username") == "alice"

    payload = {
        "currentView": "dashboard",
        "clinic": "Clinic A",
        "preferences": {"p": 1},
        "uiPreferences": {"theme": "dark"},
    }
    resp = api_client.put("/api/user/profile", json=payload, headers=headers)
    assert resp.status_code == 200

    resp = api_client.get("/api/user/current-view", headers=headers)
    assert resp.json()["currentView"] == "dashboard"

    resp = api_client.get("/api/user/ui-preferences", headers=headers)
    prefs_payload = resp.json()["uiPreferences"]
    assert prefs_payload["theme"] == "dark"
    assert prefs_payload["navigation"]["collapsed"] is False

    resp = api_client.put(
        "/api/user/ui-preferences",
        json={"uiPreferences": {"theme": "light"}},
        headers=headers,
    )
    assert resp.status_code == 200
    resp = api_client.get("/api/user/ui-preferences", headers=headers)
    updated_prefs = resp.json()["uiPreferences"]
    assert updated_prefs["theme"] == "light"

    resp = api_client.get("/api/notifications/count", headers=headers)
    assert resp.json()["notifications"] == 0

    for idx in range(5):
        payload = {
            "notificationId": f"test-{idx}",
            "title": "Heads up",
            "message": "Check this out",
            "severity": "info",
        }
        stored, count = main._persist_notification_event(
            "alice", payload, mark_unread=True, session=db_session
        )
        assert stored["id"] == payload["notificationId"]
        assert count == idx + 1

    db_session.commit()

    resp = api_client.get("/api/notifications/count", headers=headers)
    assert resp.json()["notifications"] == 5

    with api_client.websocket_connect("/ws/notifications", headers=headers) as ws:
        data = ws.receive_json()
        assert data["notifications"] == 5
        assert "drafts" in data
