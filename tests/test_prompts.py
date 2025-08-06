from backend import prompts
from typing import Iterator
import pytest


@pytest.fixture(autouse=True)
def reset_templates() -> Iterator[None]:
    """Clear template cache between tests."""
    prompts._load_custom_templates.cache_clear()
    yield
    prompts._load_custom_templates.cache_clear()


def test_beautify_prompt_language():
    en = prompts.build_beautify_prompt("note", lang="en")
    es = prompts.build_beautify_prompt("nota", lang="es")
    assert "clinical documentation specialist" in en[0]["content"]
    assert "documentación clínica" in es[0]["content"]
    assert "en español" in es[0]["content"]


def test_suggest_prompt_language():
    en = prompts.build_suggest_prompt("note", lang="en")
    es = prompts.build_suggest_prompt("nota", lang="es")
    assert "medical coder" in en[0]["content"]
    assert "codificador médico" in es[0]["content"]
    assert "en español" in es[0]["content"]


def test_summary_prompt_language():
    en = prompts.build_summary_prompt("note", lang="en")
    es = prompts.build_summary_prompt("nota", lang="es")
    assert "clinical communicator" in en[0]["content"]
    assert "comunicador clínico" in es[0]["content"]
    assert "en español" in es[0]["content"]


def test_specialty_and_payer_overrides():
    beauty = prompts.build_beautify_prompt(
        "note", lang="en", specialty="cardiology", payer="medicare"
    )
    content = beauty[0]["content"]
    assert "clinical documentation specialist" in content
    assert "Base instruction applied to all notes." in content
    assert "Cardiology specific beautify instruction." in content
    assert "Ensure documentation meets Medicare standards." in content
    # Default and specialty examples should be included
    texts = [m["content"] for m in beauty]
    assert "Example raw note" in texts
    assert "Cardio raw note" in texts

    sugg = prompts.build_suggest_prompt(
        "note", lang="en", specialty="cardiology", payer="medicare"
    )
    scontent = sugg[0]["content"]
    assert "Cardiology specific suggestion instruction." in scontent
    assert "Follow Medicare coding rules." in scontent
    texts = [m["content"] for m in sugg]
    assert "Example suggest note" in texts
    assert "Medicare suggest note" in texts

    summary = prompts.build_summary_prompt(
        "note", lang="en", specialty="cardiology", payer="medicare"
    )
    sc = summary[0]["content"]
    assert "Cardiology specific summary instruction." in sc
    assert "Follow Medicare summary requirements." in sc
    texts = [m["content"] for m in summary]
    assert "Example summary note" in texts

