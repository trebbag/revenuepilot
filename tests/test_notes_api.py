import json
from datetime import datetime, timezone

import pytest

import backend.main as main
from backend.db import models as db_models


@pytest.fixture
def create_user(db_session):
    def _create(username: str, role: str = "user") -> db_models.User:
        user = db_models.User(
            username=username,
            password_hash=main.hash_password("pw"),
            role=role,
        )
        db_session.add(user)
        db_session.commit()
        return user

    return _create


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def insert_note(db_session, content: str, status: str = "draft") -> int:
    note = db_models.Note(content=content, status=status)
    db_session.add(note)
    db_session.commit()
    return int(note.id)


def insert_note_with_timestamps(
    db_session,
    content: str,
    created: float,
    updated: float,
    status: str = "draft",
) -> int:
    note = db_models.Note(
        content=content,
        status=status,
        created_at=datetime.fromtimestamp(created, tz=timezone.utc),
        updated_at=datetime.fromtimestamp(updated, tz=timezone.utc),
    )
    db_session.add(note)
    db_session.commit()
    return int(note.id)


def test_get_drafts(api_client, db_session, create_user):
    create_user("alice")
    token = main.create_token("alice", "user")
    insert_note(db_session, "first draft", "draft")
    insert_note(db_session, "final note", "final")
    resp = api_client.get("/api/notes/drafts", headers=auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["status"] == "draft"


def test_recent_finalized_note_visible_in_drafts(api_client, db_session, create_user):
    create_user("alice")
    token = main.create_token("alice", "user")
    payload = {
        "content": "Patient is stable with follow up plan.",
        "codes": ["99213"],
        "prevention": ["flu shot"],
        "diagnoses": ["J10.1"],
        "differentials": ["J00"],
        "compliance": ["HIPAA"],
    }
    finalize_resp = api_client.post(
        "/api/notes/finalize",
        json=payload,
        headers=auth(token),
    )
    assert finalize_resp.status_code == 200
    finalize_data = finalize_resp.json()

    resp = api_client.get("/api/notes/drafts", headers=auth(token))
    assert resp.status_code == 200
    data = resp.json()
    finalized_notes = [note for note in data if note.get("status") == "finalized"]
    assert finalized_notes, "Expected a finalized note to be present in drafts"
    recent = finalized_notes[0]
    assert "finalized_note_id" in recent
    assert recent["finalized_note_id"] == finalize_data["finalizedNoteId"]
    assert recent["content"] == payload["content"].strip()


def test_search_and_bulk_update(api_client, db_session, create_user):
    create_user("alice")
    token = main.create_token("alice", "user")
    id1 = insert_note(db_session, "alpha beta")
    id2 = insert_note(db_session, "beta gamma")
    resp = api_client.get("/api/notes/search?q=beta", headers=auth(token))
    assert {n["id"] for n in resp.json()} == {id1, id2}
    resp = api_client.post(
        "/api/notes/bulk-operations",
        json={"ids": [id1, id2], "status": "archived"},
        headers=auth(token),
    )
    assert resp.status_code == 200
    resp = api_client.get(
        "/api/notes/search?q=beta&status=archived",
        headers=auth(token),
    )
    assert {n["id"] for n in resp.json()} == {id1, id2}


def test_analytics_and_delete(api_client, db_session, create_user):
    create_user("alice")
    token = main.create_token("alice", "user")
    id1 = insert_note(db_session, "note one")
    id2 = insert_note(db_session, "note two")
    resp = api_client.get("/api/analytics/drafts", headers=auth(token))
    assert resp.json()["drafts"] == 2
    resp = api_client.post(
        "/api/notes/bulk-operations",
        json={"ids": [id1], "delete": True},
        headers=auth(token),
    )
    assert resp.json()["deleted"] == 1
    resp = api_client.get("/api/analytics/drafts", headers=auth(token))
    assert resp.json()["drafts"] == 1


def test_draft_analytics_exposes_recent_activity(
    api_client, db_session, create_user
):
    create_user("alice")
    token = main.create_token("alice", "user")
    now = datetime.now(timezone.utc).timestamp()

    created_one = now - 10 * 24 * 60 * 60
    updated_one = created_one + 120
    created_two = now - 2 * 24 * 60 * 60
    updated_two = created_two + 240

    insert_note_with_timestamps(
        db_session,
        json.dumps(
            {
                "metadata": {
                    "patient": {"name": "Jane Doe", "id": "J-1"},
                    "title": "Annual wellness visit",
                },
                "content": "Annual wellness visit summary",
            }
        ),
        created_one,
        updated_one,
    )

    insert_note_with_timestamps(
        db_session,
        json.dumps(
            {
                "metadata": {
                    "patient": {"name": "Michael Rivera", "id": "M-2"},
                    "title": "Follow-up planning",
                },
                "content": "Follow-up note",
            }
        ),
        created_two,
        updated_two,
    )

    resp = api_client.get("/api/analytics/drafts", headers=auth(token))
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["drafts"] == 2
    assert payload["staleDrafts"] == 1
    assert payload["abandonmentRate"] == pytest.approx(0.5)
    assert payload["averageCompletionTimeMinutes"] == pytest.approx(3.0, rel=1e-3)
    assert len(payload["recentActivity"]) == 2
    most_recent = payload["recentActivity"][0]
    assert most_recent["title"] == "Follow-up planning"
    assert most_recent["patientName"] == "Michael Rivera"
