import backend.audio_processing as ap
import pytest


def test_simple_transcribe_uses_openai(monkeypatch):
    class DummyResp:
        text = "hello world"

    class DummyCreate:
        def create(self, model, file):  # noqa: ARG002
            return DummyResp()

    class DummyClient:
        audio = type("obj", (), {"transcriptions": DummyCreate()})()

    monkeypatch.setattr(ap, "OpenAI", lambda api_key=None: DummyClient())
    monkeypatch.setattr(ap, "get_api_key", lambda: "key")
    result = ap.simple_transcribe(b"data")
    assert result == "hello world"


def test_diarize_and_transcribe(monkeypatch):
    transcripts = ["provider text", "patient text"]

    def fake_simple(_):
        return transcripts.pop(0)

    class DummyDiarization:
        def itertracks(self, yield_label=True):  # noqa: ARG002
            yield ("turn1", None, "SPEAKER_00")
            yield ("turn2", None, "SPEAKER_01")

    class DummyPipeline:
        @classmethod
        def from_pretrained(cls, name):  # noqa: ARG002
            return cls()

        def __call__(self, path):  # noqa: ARG002
            return DummyDiarization()

    class DummyAudio:
        def crop(self, path, turn):  # noqa: ARG002
            return b"wave", 16000

    class DummyTorchaudio:
        @staticmethod
        def save(buf, waveform, sr, format):  # noqa: ARG002
            buf.write(b"audio")

    monkeypatch.setattr(ap, "Pipeline", DummyPipeline)
    monkeypatch.setattr(ap, "Audio", DummyAudio)
    monkeypatch.setattr(ap, "torchaudio", DummyTorchaudio)
    monkeypatch.setattr(ap, "simple_transcribe", fake_simple)
    monkeypatch.setattr(ap, "_DIARISATION_AVAILABLE", True)
    result = ap.diarize_and_transcribe(b"bytes")
    assert result["provider"] == "provider text"
    assert result["patient"] == "patient text"
    assert result["segments"] == [
        {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "provider text"},
        {"speaker": "patient", "start": 0.0, "end": 0.0, "text": "patient text"},
    ]


def test_diarize_fallback_when_unavailable(monkeypatch):
    monkeypatch.setattr(ap, "_DIARISATION_AVAILABLE", False)
    monkeypatch.setattr(ap, "simple_transcribe", lambda b: "full text")
    result = ap.diarize_and_transcribe(b"bytes")
    assert result == {
        "provider": "full text",
        "patient": "",
        "segments": [
            {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "full text"}
        ],
        "error": "diarisation unavailable",
    }


def test_diarize_reports_error_on_failure(monkeypatch):
    class FailPipeline:
        @classmethod
        def from_pretrained(cls, name):  # noqa: ARG002
            raise RuntimeError("bad model")

    monkeypatch.setattr(ap, "Pipeline", FailPipeline)
    monkeypatch.setattr(ap, "_DIARISATION_AVAILABLE", True)
    monkeypatch.setattr(ap, "simple_transcribe", lambda b: "fallback")
    result = ap.diarize_and_transcribe(b"bytes")
    assert result["provider"] == "fallback"
    assert result["segments"] == [
        {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "fallback"}
    ]
    assert "error" in result and "bad model" in result["error"]


def test_transcribe_placeholder_on_failure(monkeypatch):
    class DummyCreate:
        def create(self, model, file):  # noqa: ARG002
            raise RuntimeError("boom")

    class DummyClient:
        audio = type("obj", (), {"transcriptions": DummyCreate()})()

    monkeypatch.setattr(ap, "OpenAI", lambda api_key=None: DummyClient())
    monkeypatch.setattr(ap, "get_api_key", lambda: "key")
    result = ap.simple_transcribe(b"\xff\xfe")
    assert result == "[transcribed 2 bytes]"


def test_offline_transcribe_uses_local_model(monkeypatch):
    class DummyModel:
        def transcribe(self, path):  # noqa: ARG002
            return {"text": "offline text"}

    monkeypatch.setattr(ap, "_load_local_model", lambda: DummyModel())
    monkeypatch.setenv("OFFLINE_TRANSCRIBE", "true")
    monkeypatch.setattr(ap, "get_api_key", lambda: None)
    result = ap.simple_transcribe(b"data")
    assert result == "offline text"
