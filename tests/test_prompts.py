from backend import prompts
from pathlib import Path
import textwrap

from typing import Iterator
import pytest


@pytest.fixture(autouse=True)
def reset_templates() -> Iterator[None]:
    """Ensure no prompt template overrides leak between tests."""
    tpl_path = Path(prompts.__file__).with_name("prompt_templates.yaml")
    if tpl_path.exists():
        tpl_path.unlink()
    prompts._load_custom_templates.cache_clear()
    yield
    if tpl_path.exists():
        tpl_path.unlink()
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


def test_specialty_and_payer_overrides(tmp_path):
    tpl_path = Path(prompts.__file__).with_name("prompt_templates.yaml")
    tpl_path.write_text(
        textwrap.dedent(
            """
            default:
              beautify:
                en: "Base addendum"
            specialty:
              cardiology:
                beautify:
                  en: "Cardio extra"
            payer:
              medicare:
                beautify:
                  en: "Medicare extra"
                suggest:
                  en: "Follow Medicare coding rules"
            """
        )
    )
    prompts._load_custom_templates.cache_clear()
    beauty = prompts.build_beautify_prompt("note", lang="en", specialty="cardiology", payer="medicare")
    content = beauty[0]["content"]
    assert "clinical documentation specialist" in content
    assert "Base addendum" in content
    assert "Cardio extra" in content
    assert "Medicare extra" in content
    sugg = prompts.build_suggest_prompt("note", lang="en", payer="medicare")
    assert "Follow Medicare coding rules" in sugg[0]["content"]

