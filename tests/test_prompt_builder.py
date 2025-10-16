import uuid

import pytest

from backend.prompt_builder import (
    DynamicPromptContext,
    build_dynamic_block,
    build_stable_block,
)


@pytest.fixture()
def fake_guidelines(monkeypatch):
    def _fake_guidelines(age, sex, region):
        return {"vaccinations": ["Influenza vaccine"], "screenings": ["Blood pressure"]}

    monkeypatch.setattr("backend.prompt_builder.get_guidelines", _fake_guidelines)


def test_stable_block_cache(fake_guidelines):
    model_id = f"unit-test-{uuid.uuid4()}"
    stable_first, state_first, tokens_first = build_stable_block(
        model=model_id,
        schema_version="test-v1",
        policy_version="policy-v1",
    )
    stable_second, state_second, tokens_second = build_stable_block(
        model=model_id,
        schema_version="test-v1",
        policy_version="policy-v1",
    )

    assert state_first == "miss"
    assert state_second == "hit"
    assert stable_first == stable_second
    assert tokens_first == tokens_second
    assert tokens_first > 0
    assert any("policy-v1" in message["content"] for message in stable_second)


def test_dynamic_block_contents(fake_guidelines):
    spans = [
        {
            "new": "Patient reports improved cough.",
            "old": "Patient reports cough.",
            "newRange": [0, 30],
            "oldRange": [0, 25],
        }
    ]
    accepted_payload = {
        "accepted": [{"code": "99213", "description": "Established patient"}],
        "denied": [{"code": "J06.9", "description": "URI"}],
    }
    pmh_entries = [{"label": "Hypertension"}]

    context = DynamicPromptContext(
        sanitized_note="Patient reports improved cough. Continue inhaler.",
        sanitized_previous="Patient reports cough. Continue inhaler.",
        diff_spans=spans,
        accepted_json=accepted_payload,
        transcript="Provider: Continue inhaler use twice daily.",
        pmh_entries=pmh_entries,
        rules=["Avoid duplicate antibiotic therapy."],
        age=54,
        sex="female",
        region="US",
        note_id="note-123",
        encounter_id="enc-1",
        session_id="sess-1",
        transcript_cursor="cursor-1",
        attachments={"chart": "Chart excerpt", "audio": "Audio transcript"},
    )

    dynamic_message = build_dynamic_block(context)
    assert dynamic_message["role"] == "user"

    content = dynamic_message["content"]
    assert "Changed note snippets" in content
    assert "State summary" in content
    assert "Suggestion disposition" in content
    assert "Transcript snippet" in content
    assert "PMH highlights" in content
    assert "Care guidelines to consider" in content
    assert "Attachments:" in content
