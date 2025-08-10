import os
import importlib
import json

import pytest


def test_call_openai_offline(monkeypatch):
    monkeypatch.setenv("USE_OFFLINE_MODEL", "true")
    from backend import openai_client as oc
    importlib.reload(oc)
    out = oc.call_openai([{"role": "user", "content": "hello"}])
    assert out.startswith("Offline response (")


def test_call_openai_local(monkeypatch, tmp_path):
    monkeypatch.delenv("USE_OFFLINE_MODEL", raising=False)
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    fake_model = tmp_path / "model.gguf"
    fake_model.write_text("fake")
    monkeypatch.setenv("LOCAL_LLM_MODEL", str(fake_model))

    class FakeLlama:
        def __call__(self, prompt, max_tokens=256, temperature=0.0, top_p=1.0):
            return {"choices": [{"text": "local output"}]}

    def loader():
        return FakeLlama()

    from backend import openai_client as oc
    importlib.reload(oc)
    monkeypatch.setattr(oc, "_get_llama", loader)
    out = oc.call_openai([{"role": "user", "content": "hello"}])
    assert out == "local output"


def test_call_openai_local_failure(monkeypatch, tmp_path):
    monkeypatch.delenv("USE_OFFLINE_MODEL", raising=False)
    monkeypatch.setenv("USE_LOCAL_MODELS", "true")
    fake_model = tmp_path / "model.gguf"
    fake_model.write_text("fake")
    monkeypatch.setenv("LOCAL_LLM_MODEL", str(fake_model))

    from backend import openai_client as oc
    importlib.reload(oc)

    def broken():
        raise RuntimeError("fail")

    monkeypatch.setattr(oc, "_get_llama", broken)
    with pytest.raises(RuntimeError):
        oc.call_openai([{"role": "user", "content": "hello"}])
