import pytest

from backend import main
from backend.db.models import User


@pytest.fixture
def user_token(db_session):
    user = User(username="alice", password_hash=main.hash_password("pw"), role="user")
    db_session.add(user)
    db_session.commit()
    return main.create_token("alice", "user")


def test_settings_roundtrip(api_client, user_token):
    """Saving settings should persist and be returned on subsequent fetches."""
    token = user_token

    prefs = {
        "theme": "dark",
        "categories": {
            "codes": True,
            "compliance": False,
            "publicHealth": True,
            "differentials": True,
        },
        "rules": ["r1"],
        "lang": "es",
        "specialty": "cardiology",
        "payer": "medicare",
        "region": "us",
        "agencies": ["CDC"],
        "template": -1,

    }

    resp = api_client.post(
        "/settings", json=prefs, headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200

    resp = api_client.get("/settings", headers={"Authorization": f"Bearer {token}"})
    data = resp.json()
    assert data["theme"] == "dark"
    assert data["categories"]["compliance"] is False
    assert data["lang"] == "es"
    assert data["specialty"] == "cardiology"
    assert data["payer"] == "medicare"
    assert data["region"] == "us"
    assert data["agencies"] == ["CDC"]
    assert data["template"] == -1
    assert data.get('useOfflineMode') in (False, None)
    assert data.get('deidEngine') == 'regex'


