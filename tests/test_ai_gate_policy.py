import hashlib
import math

import pytest

from backend import ai_gate


class FakeEmbedder:
    def __init__(self) -> None:
        self._vectors: dict[str, list[float]] = {}

    def set_vector(self, text: str, vector: tuple[float, float, float]) -> None:
        norm = math.sqrt(sum(v * v for v in vector))
        if norm:
            self._vectors[text] = [v / norm for v in vector]
        else:
            self._vectors[text] = [0.0, 0.0, 0.0]

    def _default_vector(self, text: str) -> list[float]:
        if not text.strip():
            return [0.0, 0.0, 0.0]
        digest = hashlib.sha1(text.encode("utf-8")).digest()
        raw = [digest[0] / 255.0, digest[1] / 255.0, digest[2] / 255.0]
        norm = math.sqrt(sum(v * v for v in raw))
        return [v / norm for v in raw] if norm else [0.0, 0.0, 0.0]

    def embed_many(self, texts):
        return [list(self._vectors.get(text, self._default_vector(text))) for text in texts]


@pytest.fixture()
def gate(monkeypatch):
    embedder = FakeEmbedder()
    monkeypatch.setattr(ai_gate, "get_embedding_client", lambda model="text-embedding-3-small": embedder)
    gate = ai_gate.AIGate()
    return gate, embedder


def _long_note() -> str:
    parts = [f"sentence {i}." for i in range(80)]
    text = " ".join(parts)
    return text + "\n"


def test_cold_start_blocks_below_500(gate):
    gate_instance, _ = gate
    decision = gate_instance.evaluate(
        note_id="n1",
        clinician_id=1,
        text="short note without enough detail.",
        intent="auto",
    )
    assert decision.allowed is False
    assert decision.reason == "BELOW_THRESHOLD"


def test_long_note_allows_once_boundary_met(gate):
    gate_instance, embedder = gate
    long_text = _long_note()
    _, new_span, _ = ai_gate.extract_changed_spans("", ai_gate.normalize(long_text))
    embedder.set_vector(new_span, (1.0, 0.0, 0.0))
    decision = gate_instance.evaluate(
        note_id="n2",
        clinician_id=1,
        text=long_text,
        intent="auto",
    )
    assert decision.allowed is True
    assert decision.model == "gpt-4o"


def test_additional_content_above_threshold_is_allowed(gate):
    gate_instance, embedder = gate
    base = _long_note()
    gate_instance.evaluate(note_id="n3", clinician_id=1, text=base, intent="auto")
    addition = "additional clinical details " * 6 + "."
    new_text = base + addition
    _, new_span, _ = ai_gate.extract_changed_spans(ai_gate.normalize(base), ai_gate.normalize(new_text))
    embedder.set_vector(new_span, (0.0, 1.0, 0.0))
    decision = gate_instance.evaluate(
        note_id="n3",
        clinician_id=1,
        text=new_text,
        intent="auto",
    )
    assert decision.allowed is True


def test_salient_vitals_bypass_threshold(gate):
    gate_instance, _ = gate
    base = _long_note()
    gate_instance.evaluate(note_id="n4", clinician_id=1, text=base, intent="auto")
    vitals = base + "BP 170/110\n"
    decision = gate_instance.evaluate(
        note_id="n4",
        clinician_id=1,
        text=vitals,
        intent="manual",
    )
    assert decision.allowed is True
    assert decision.model == "gpt-4o-mini"


def test_duplicate_state_blocks(gate):
    gate_instance, _ = gate
    base = _long_note()
    gate_instance.evaluate(note_id="n5", clinician_id=1, text=base, intent="auto")
    duplicate = gate_instance.evaluate(note_id="n5", clinician_id=1, text=base, intent="auto")
    assert duplicate.allowed is False
    assert duplicate.reason == "DUPLICATE_STATE"


def test_not_meaningful_small_edit_blocks(gate):
    gate_instance, embedder = gate
    base = _long_note()
    gate_instance.evaluate(note_id="n6", clinician_id=1, text=base, intent="auto")
    edited = base.replace("sentence 10.", "sentence 10!")
    old_span, new_span, _ = ai_gate.extract_changed_spans(ai_gate.normalize(base), ai_gate.normalize(edited))
    embedder.set_vector(old_span, (1.0, 0.0, 0.0))
    embedder.set_vector(new_span, (1.0, 0.0, 0.0))
    decision = gate_instance.evaluate(
        note_id="n6",
        clinician_id=1,
        text=edited,
        intent="auto",
    )
    assert decision.allowed is False
    assert decision.reason == "NOT_MEANINGFUL"
    assert decision.detail.delta < decision.detail.auto_threshold
