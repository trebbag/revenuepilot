import pytest

import backend.main as main
from backend.db import models as db_models


@pytest.fixture
def create_user(db_session):
    def _create(username: str, role: str = "user", clinic: str | None = None) -> db_models.User:
        user = db_models.User(
            username=username,
            password_hash=main.hash_password("pw"),
            role=role,
            clinic_id=clinic,
        )
        db_session.add(user)
        db_session.commit()
        return user

    return _create


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_builtin_templates_available(api_client, create_user):
    create_user("alice")
    token = main.create_token("alice", "user", clinic="clinic1")
    resp = api_client.get("/templates", headers=auth_header(token))
    specs = {t["specialty"] for t in resp.json()}
    assert {"pediatrics", "geriatrics", "psychiatry"} <= specs


@pytest.mark.parametrize("spec", ["pediatrics", "geriatrics", "psychiatry"])
def test_builtin_template_filter(api_client, create_user, spec):
    create_user("alice")
    token = main.create_token("alice", "user", clinic="clinic1")
    resp = api_client.get(
        f"/templates?specialty={spec}",
        headers=auth_header(token),
    )
    data = resp.json()
    assert data and all(t["specialty"] == spec for t in data)


@pytest.mark.parametrize("spec", ["pediatrics", "geriatrics", "psychiatry"])
def test_insert_and_retrieve_per_specialty(api_client, create_user, spec):
    create_user("alice")
    token = main.create_token("alice", "user", clinic="clinic1")
    resp = api_client.post(
        "/templates",
        json={"name": "Custom", "content": "Note", "specialty": spec},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    tpl_id = resp.json()["id"]
    resp = api_client.get(
        f"/templates?specialty={spec}",
        headers=auth_header(token),
    )
    data = resp.json()
    assert any(t["id"] == tpl_id for t in data)
    assert all(t["specialty"] == spec for t in data)


def test_builtin_template_payer_filter(api_client, create_user):
    create_user("alice")
    token = main.create_token("alice", "user", clinic="clinic1")
    resp = api_client.get(
        "/templates?payer=medicare",
        headers=auth_header(token),
    )
    data = resp.json()
    assert data and all(t.get("payer") == "medicare" for t in data)


def test_create_update_and_list_templates(api_client, create_user):
    create_user("alice")
    token = main.create_token("alice", "user", clinic="clinic1")
    resp = api_client.post(
        "/templates",
        json={"name": "Custom", "content": "Note", "specialty": "cardiology"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    tpl_id = resp.json()["id"]
    resp = api_client.put(
        f"/templates/{tpl_id}",
        json={"name": "Updated", "content": "New", "specialty": "cardiology"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"
    resp = api_client.get("/templates", headers=auth_header(token))
    data = resp.json()
    assert any(t["name"] == "Updated" for t in data)


def test_delete_template(api_client, create_user):
    create_user("alice")
    token = main.create_token("alice", "user", clinic="clinic1")
    resp = api_client.post(
        "/templates",
        json={"name": "Temp", "content": "X", "specialty": "cardiology"},
        headers=auth_header(token),
    )
    tpl_id = resp.json()["id"]
    resp = api_client.delete(f"/templates/{tpl_id}", headers=auth_header(token))
    assert resp.status_code == 200
    resp = api_client.get("/templates", headers=auth_header(token))
    assert all(t["id"] != tpl_id for t in resp.json())


def test_template_scoped_by_clinic(api_client, create_user):
    create_user("alice")
    create_user("admin", role="admin")
    create_user("bob")
    admin_token = main.create_token("admin", "admin", clinic="clinicA")
    resp = api_client.post(
        "/templates",
        json={"name": "Scoped", "content": "S", "specialty": "cardiology"},
        headers=auth_header(admin_token),
    )
    tpl_id = resp.json()["id"]

    token_a = main.create_token("alice", "user", clinic="clinicA")
    resp = api_client.get(
        "/templates?specialty=cardiology",
        headers=auth_header(token_a),
    )
    assert any(t["id"] == tpl_id for t in resp.json())

    token_b = main.create_token("bob", "user", clinic="clinicB")
    resp = api_client.get(
        "/templates?specialty=cardiology",
        headers=auth_header(token_b),
    )
    assert all(t["id"] != tpl_id for t in resp.json())


def test_templates_require_auth(api_client):
    resp = api_client.get("/templates")
    assert resp.status_code in {401, 403}


def test_templates_allow_user_role(api_client, create_user):
    create_user("alice")
    token = main.create_token("alice", "user", clinic="clinic1")
    resp = api_client.get("/templates", headers=auth_header(token))
    assert resp.status_code == 200


def test_templates_reject_invalid_token(api_client):
    resp = api_client.get("/templates", headers={"Authorization": "Bearer badtoken"})
    assert resp.status_code == 401
