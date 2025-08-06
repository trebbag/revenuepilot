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
    for heading in ["Subjective", "Objective", "Assessment", "Plan"]:
        assert heading in en[0]["content"]
    for heading in ["Subjetivo", "Objetivo", "Evaluación", "Plan"]:
        assert heading in es[0]["content"]


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
    assert "cardiac-specific terminology" in content
    assert "Medicare reimbursement guidelines" in content
    # Default and specialty examples should be included
    texts = [m["content"] for m in beauty]
    assert any("chief complaint: cough for 3 days" in t for t in texts)
    assert "Cardio raw note" in texts

    sugg = prompts.build_suggest_prompt(
        "note", lang="en", specialty="cardiology", payer="medicare"
    )
    scontent = sugg[0]["content"]
    assert "Cardiology specific suggestion instruction." in scontent
    assert "cholesterol screening" in scontent
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


def test_specialty_payer_modifiers_spanish():
    msgs = prompts.build_beautify_prompt(
        "nota", lang="es", specialty="cardiology", payer="medicare"
    )
    content = msgs[0]["content"]
    assert "terminología cardiaca" in content
    assert "Medicare reimbursement guidelines" in content
    assert "control del colesterol" in content


def test_guideline_tips_added(monkeypatch):
    """Public health guideline tips should be appended to the user content."""
    monkeypatch.setattr(
        prompts, "get_guidelines", lambda age, sex, region: {"vaccinations": ["Flu"], "screenings": ["BP"]}
    )
    msgs = prompts.build_suggest_prompt("note", age=30, sex="male", region="US")
    user_msg = msgs[-1]["content"]
    assert "Flu" in user_msg and "BP" in user_msg



def test_additional_specialties_and_payers():
    beauty = prompts.build_beautify_prompt(
        "note", lang="en", specialty="paediatrics", payer="medicaid"
    )
    content = beauty[0]["content"]
    assert "Paediatrics specific beautify instruction." in content
    assert "Ensure documentation meets Medicaid requirements." in content

    sugg = prompts.build_suggest_prompt(
        "note", lang="en", specialty="geriatrics", payer="aetna"
    )
    scontent = sugg[0]["content"]
    assert "Geriatrics specific suggestion instruction." in scontent
    assert "Follow Aetna coding rules." in scontent

    ped = prompts.build_suggest_prompt(
        "note", lang="en", specialty="pediatrics", payer=None
    )
    ped_content = ped[0]["content"]
    assert "immunisation schedules" in ped_content


def test_fallback_to_default_when_override_missing():
    beauty = prompts.build_beautify_prompt(
        "note", lang="en", specialty="unknown", payer="unknown"
    )
    content = beauty[0]["content"]
    assert "Base instruction applied to all notes." in content
    assert "Cardiology specific beautify instruction." not in content
    assert "Ensure documentation meets Medicare standards." not in content

def test_new_categories_spanish():
    tpl = prompts.build_template_prompt("contenido", lang="es")
    exp = prompts.build_export_prompt("nota", lang="es")
    assert "en español" in tpl[0]["content"]
    assert "en español" in exp[0]["content"]


