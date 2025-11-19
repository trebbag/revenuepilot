import backend.audio_processing as ap
import pytest
import builtins
import sys

from fastapi.testclient import TestClient
import sqlite3
from backend import main


def test_simple_transcribe_uses_openai(monkeypatch):
    class DummyResp:
        text = "hello world"

    captured = {}

    class DummyCreate:
        def create(self, model, file, language=None, timeout=None):  # noqa: ARG002
            captured["language"] = language
            return DummyResp()

    class DummyClient:
        audio = type("obj", (), {"transcriptions": DummyCreate()})()

    monkeypatch.setattr(ap, "_create_openai_client", lambda api_key: DummyClient())
    monkeypatch.setattr(ap, "get_api_key", lambda: "key")
    result = ap.simple_transcribe(b"data", language="es")
    assert result == "hello world"
    assert captured["language"] == "es"


def test_diarize_and_transcribe(monkeypatch):
    transcripts = ["provider text", "patient text"]

    def fake_simple(_, language=None):  # noqa: ARG002
        assert language == "es"
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
    monkeypatch.setattr(ap, "_DIARISATION_PIPELINE", None)
    result = ap.diarize_and_transcribe(b"bytes", language="es")
    assert result["provider"] == "provider text"
    assert result["patient"] == "patient text"
    assert result["segments"] == [
        {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "provider text"},
        {"speaker": "patient", "start": 0.0, "end": 0.0, "text": "patient text"},
    ]


def test_diarize_maps_extra_speakers(monkeypatch):
    transcripts = ["p0 text", "p1 text", "p0 two", "p2 text"]

    def fake_simple(_, language=None):  # noqa: ARG002
        assert language == "es"
        return transcripts.pop(0)

    class DummyDiarization:
        def itertracks(self, yield_label=True):  # noqa: ARG002
            yield ("turn1", None, "SPEAKER_00")
            yield ("turn2", None, "SPEAKER_01")
            yield ("turn3", None, "SPEAKER_00")
            yield ("turn4", None, "SPEAKER_02")

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
    monkeypatch.setattr(ap, "_DIARISATION_PIPELINE", None)

    result = ap.diarize_and_transcribe(b"bytes", language="es")
    assert result["provider"] == "p0 text p0 two"
    assert result["patient"] == "p1 text"
    assert result["segments"] == [
        {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "p0 text"},
        {"speaker": "patient", "start": 0.0, "end": 0.0, "text": "p1 text"},
        {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "p0 two"},
        {"speaker": "SPEAKER_02", "start": 0.0, "end": 0.0, "text": "p2 text"},
    ]


def test_diarize_fallback_when_unavailable(monkeypatch):
    monkeypatch.setattr(ap, "_DIARISATION_AVAILABLE", False)
    monkeypatch.setattr(ap, "_transcribe_bytes", lambda b, language=None: ("full text", ""))
    result = ap.diarize_and_transcribe(b"bytes", language="es")
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
    monkeypatch.setattr(ap, "_DIARISATION_PIPELINE", None)
    monkeypatch.setattr(ap, "_transcribe_bytes", lambda b, language=None: ("fallback", ""))
    result = ap.diarize_and_transcribe(b"bytes", language="en")
    assert result["provider"] == "fallback"
    assert result["segments"] == [
        {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "fallback"}
    ]
    assert "error" in result and "bad model" in result["error"]


def test_transcribe_placeholder_on_failure(monkeypatch):
    class DummyCreate:
        def create(self, model, file, language=None, timeout=None):  # noqa: ARG002
            raise RuntimeError("boom")

    class DummyClient:
        audio = type("obj", (), {"transcriptions": DummyCreate()})()

    monkeypatch.setattr(ap, "_create_openai_client", lambda api_key: DummyClient())
    monkeypatch.setattr(ap, "get_api_key", lambda: "key")
    result = ap.simple_transcribe(b"\xff\xfe", language="en")
    assert result == "[transcribed 2 bytes]"


def test_diarize_and_transcribe_without_openai_sdk(monkeypatch):
    """Ensure fallback placeholders when the OpenAI SDK cannot be imported."""

    monkeypatch.setattr(ap, "_DIARISATION_AVAILABLE", False)
    monkeypatch.setattr(ap, "get_api_key", lambda: "key")
    monkeypatch.setattr(ap, "_OPENAI_AVAILABLE", True)
    monkeypatch.delenv("OFFLINE_TRANSCRIBE", raising=False)

    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "openai":
            raise ModuleNotFoundError("No module named 'openai'")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.delitem(sys.modules, "openai", raising=False)
    monkeypatch.setattr(builtins, "__import__", fake_import)

    result = ap.diarize_and_transcribe(b"\xff\xfe", language="en")
    assert result["provider"] == "[transcribed 2 bytes]"
    assert result["segments"] == [
        {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "[transcribed 2 bytes]"}
    ]
    assert "error" in result
    assert "openai" in result["error"].lower()


def test_offline_transcribe_uses_local_model(monkeypatch):
    captured = {}

    class DummyModel:
        def transcribe(self, path, language=None):  # noqa: ARG002
            captured["language"] = language
            return {"text": "offline text"}

    monkeypatch.setattr(ap, "_load_local_model", lambda lang: DummyModel())
    monkeypatch.setenv("OFFLINE_TRANSCRIBE", "true")
    monkeypatch.setattr(ap, "get_api_key", lambda: None)
    result = ap.simple_transcribe(b"data", language="es")
    assert result == "offline text"
    assert captured["language"] == "es"


def test_select_model_by_language(monkeypatch):
    monkeypatch.delenv("WHISPER_MODEL", raising=False)
    assert ap._select_model("en") == "medium.en"
    assert ap._select_model("es") == "medium"


@pytest.fixture
def client(monkeypatch):
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
    )
    pwd = main.hash_password("pw")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("user", pwd, "user"),
    )
    db.commit()
    monkeypatch.setattr(main, "db_conn", db)
    yield TestClient(main.app)
    db.close()


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_transcribe_endpoint_diarised(client, monkeypatch):
    monkeypatch.setenv("OFFLINE_TRANSCRIBE", "true")

    transcripts = ["p", "q"]

    def fake_simple(_, language=None):  # noqa: ARG002
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
    monkeypatch.setattr(ap, "_DIARISATION_PIPELINE", None)

    token = main.create_token("user", "user")
    resp = client.post(
        "/transcribe?diarise=true",
        files={"file": ("a.wav", b"bytes")},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json() == {
        "provider": "p",
        "patient": "q",
        "segments": [
            {"speaker": "provider", "start": 0.0, "end": 0.0, "text": "p"},
            {"speaker": "patient", "start": 0.0, "end": 0.0, "text": "q"},
        ],
    }
