import json

from backend import offline_model as om


def test_local_beautify(monkeypatch):
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    monkeypatch.setenv("LOCAL_BEAUTIFY_MODEL", "dummy")

    class Pipe:
        def __call__(self, text):
            return [{"generated_text": "beautified"}]

    monkeypatch.setattr(om, "_get_pipeline", lambda task, model: Pipe())
    assert om.beautify("note") == "beautified"


def test_local_beautify_fallback(monkeypatch):
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    monkeypatch.setenv("LOCAL_BEAUTIFY_MODEL", "dummy")

    def raiser(task, model):
        raise RuntimeError("no model")

    monkeypatch.setattr(om, "_get_pipeline", raiser)
    assert om.beautify("note").startswith("Beautified (offline):")


def test_local_summarize(monkeypatch):
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    monkeypatch.setenv("LOCAL_SUMMARIZE_MODEL", "dummy")

    class Pipe:
        def __call__(self, text):
            return [{"summary_text": "short"}]

    monkeypatch.setattr(om, "_get_pipeline", lambda task, model: Pipe())
    assert om.summarize("long note") == {
        "summary": "short",
        "recommendations": [],
        "warnings": [],
    }


def test_local_summarize_fallback(monkeypatch):
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    monkeypatch.setenv("LOCAL_SUMMARIZE_MODEL", "dummy")

    def raiser(task, model):
        raise RuntimeError("no model")

    monkeypatch.setattr(om, "_get_pipeline", raiser)
    out = om.summarize("note")
    assert out["summary"].startswith("Summary (offline):")
    assert out["recommendations"] == []
    assert out["warnings"] == []


def test_local_suggest(monkeypatch):
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    monkeypatch.setenv("LOCAL_SUGGEST_MODEL", "dummy")

    sample = {
        "codes": [{"code": "12345"}],
        "compliance": ["ok"],
        "publicHealth": [{"recommendation": "do"}],
        "differentials": [{"diagnosis": "dx", "score": 0.1}],
    }

    class Pipe:
        def __call__(self, text, max_new_tokens=256):
            return [{"generated_text": json.dumps(sample)}]

    monkeypatch.setattr(om, "_get_pipeline", lambda task, model: Pipe())
    assert om.suggest("note") == sample


def test_local_suggest_fallback(monkeypatch):
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    monkeypatch.setenv("LOCAL_SUGGEST_MODEL", "dummy")

    class Pipe:
        def __call__(self, text, max_new_tokens=256):
            return [{"generated_text": "not json"}]

    monkeypatch.setattr(om, "_get_pipeline", lambda task, model: Pipe())
    out = om.suggest("note")
    assert out["codes"][0]["code"] == "00000"

