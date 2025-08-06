from backend import prompts


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
