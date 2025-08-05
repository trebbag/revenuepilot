import backend.audio_processing as ap


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
    assert result == {"provider": "provider text", "patient": "patient text"}


def test_diarize_fallback_when_unavailable(monkeypatch):
    monkeypatch.setattr(ap, "_DIARISATION_AVAILABLE", False)
    monkeypatch.setattr(ap, "simple_transcribe", lambda b: "full text")
    result = ap.diarize_and_transcribe(b"bytes")
    assert result == {"provider": "full text", "patient": ""}
