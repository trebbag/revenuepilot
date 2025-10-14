import pytest

from backend.prompt_builder import SuggestPromptBuilder


@pytest.fixture()
def prompt_builder(monkeypatch):
    builder = SuggestPromptBuilder(cache_size=4)

    def fake_guidelines(age, sex, region):
        return {"vaccinations": ["Influenza vaccine"], "screenings": ["Blood pressure"]}

    monkeypatch.setattr("backend.prompt_builder.get_guidelines", fake_guidelines)
    return builder


def test_suggest_prompt_builder_caches(prompt_builder):
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
        "denied": [{"code": "J06.9"}],
    }
    pmh_entries = [{"label": "Hypertension"}]

    blocks_first = prompt_builder.build(
        lang="en",
        specialty="family",
        payer="medicare",
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
    )

    assert blocks_first.cache_state == "miss"
    assert blocks_first.stable
    assert blocks_first.dynamic
    dynamic_text = blocks_first.dynamic[0]["content"]
    assert "Changed note snippets" in dynamic_text
    assert "State summary" in dynamic_text
    assert "PMH highlights" in dynamic_text
    assert "Care guidelines to consider" in dynamic_text
    assert "Suggestion disposition" in dynamic_text

    blocks_second = prompt_builder.build(
        lang="en",
        specialty="family",
        payer="medicare",
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
    )

    assert blocks_second.cache_state == "hit"
    assert blocks_second.stable == blocks_first.stable
