import json

from backend import offline_model as om


def test_local_beautify(monkeypatch, tmp_path):
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    model_path = tmp_path / "model.gguf"
    model_path.write_text("fake")
    monkeypatch.setenv("LOCAL_BEAUTIFY_MODEL", str(model_path))

    class Model:
        def __call__(self, prompt, max_tokens=256, temperature=0.0, top_p=1.0):
            return {"choices": [{"text": "beautified"}]}

    monkeypatch.setattr(om, "_get_llama", lambda path: Model())
    assert om.beautify("note") == "beautified"


def test_local_beautify_fallback(monkeypatch, tmp_path):
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    model_path = tmp_path / "model.gguf"
    model_path.write_text("fake")
    monkeypatch.setenv("LOCAL_BEAUTIFY_MODEL", str(model_path))

    def raiser(path):
        raise RuntimeError("no model")

    monkeypatch.setattr(om, "_get_llama", raiser)
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


def test_local_suggest(monkeypatch, tmp_path):
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    model_path = tmp_path / "model.gguf"
    model_path.write_text("fake")
    monkeypatch.setenv("LOCAL_SUGGEST_MODEL", str(model_path))

    sample = {
        "codes": [{"code": "12345"}],
        "compliance": ["ok"],
        "publicHealth": [
            {
                "recommendation": "do",
                "source": "CDC",
                "evidenceLevel": "A",
            }
        ],
        "differentials": [{"diagnosis": "dx", "score": 0.1}],
    }

    class Model:
        def __call__(self, prompt, max_tokens=512, temperature=0.0, top_p=1.0):
            return {"choices": [{"text": json.dumps(sample)}]}

    monkeypatch.setattr(om, "_get_llama", lambda path: Model())
    assert om.suggest("note") == sample


def test_local_suggest_fallback(monkeypatch, tmp_path):
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    model_path = tmp_path / "model.gguf"
    model_path.write_text("fake")
    monkeypatch.setenv("LOCAL_SUGGEST_MODEL", str(model_path))

    class Model:
        def __call__(self, prompt, max_tokens=512, temperature=0.0, top_p=1.0):
            return {"choices": [{"text": "not json"}]}

    monkeypatch.setattr(om, "_get_llama", lambda path: Model())
    out = om.suggest("note")
    assert out["codes"][0]["code"] == "00000"

