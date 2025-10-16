"""Meaningful-change policy for server side AI calls.

The gate keeps lightweight, in-memory state per (clinician, note) pair to
determine whether a request should be routed to an AI model.  The goal is to
avoid expensive model calls when the underlying note has not changed in a
meaningful way while still allowing clinically important edits (vitals,
medication orders, etc.) to flow through immediately.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import math
import re
from dataclasses import dataclass
from typing import Dict, List, Mapping, Optional, Tuple

from backend.embeddings import cosine_distance, get_embedding_client
from backend.ai_gating import (
    AI_AUTO_THRESHOLD_CHARS,
    AI_AUTO_THRESHOLD_PCT,
    AI_COLD_START_CHARS,
    AI_EMBEDDING_MODEL,
    AI_MANUAL_THRESHOLD_CHARS,
    AI_MANUAL_THRESHOLD_PCT,
    AI_SEMANTIC_DISTANCE_AUTO_MIN,
    AI_SEMANTIC_DISTANCE_MANUAL_MIN,
)


ZERO_WIDTH_REPLACEMENTS = str.maketrans({
    "\u200b": "",
    "\u200c": "",
    "\u200d": "",
    "\ufeff": "",
})

WHITESPACE_RE = re.compile(r"\s+")

VITALS_RE = re.compile(r"(bp\s*\d{2,3}/\d{2,3}|hr\s*\d{2,3}|spo2\s*\d{2,3}%)", re.I)
LABS_RE = re.compile(
    r"\b(na|k|cr|hba1c|hgb|wbc)\b\s*(\d+(?:\.\d+)?(?:\s*(?:mmol/l|mg/dl|g/dl|%))?)",
    re.I,
)
MEDS_RE = re.compile(
    r"[A-Za-z]+(?:\s+[A-Za-z]+)?\s+\d+\s*(?:mg|mcg|u)\s+(?:bid|tid|qhs|qam|prn)",
    re.I,
)
PROCEDURE_RE = re.compile(r"\b(ekg|cxr|mri|colonoscopy|ct)\b", re.I)
DIAGNOSTIC_RE = re.compile(r"(pneumonia|nstemi|r/o\s+pe)", re.I)
NEGATION_RE = re.compile(r"\bdenies\b", re.I)
POSITIVE_PHRASES_RE = re.compile(r"\b(reports|endorses|admits|has|experiencing)\b", re.I)

INTENT_MODELS: Dict[str, str] = {
    "auto": "gpt-4o",
    "finalize": "gpt-4o",
    "beautify": "gpt-4o",
    "patient_summary": "gpt-4o",
    "plan_assist": "gpt-4o",
    "manual": "gpt-4o-mini",
}


@dataclass
class GateState:
    """Mutable state kept per clinician/note pair."""

    last_note_hash: Optional[str] = None
    last_call_note_hash: Optional[str] = None
    last_transcript_cursor: Optional[str] = None
    last_accepted_json_hash: Optional[str] = None
    last_sent_text: str = ""
    cold_start_completed: bool = False


@dataclass
class GateDetail:
    delta: int = 0
    dice: float = 0.0
    cosine: float = 0.0
    length: int = 0
    auto_threshold: int = 0
    manual_threshold: int = 0
    salient: bool = False

    def asdict(self) -> Dict[str, object]:
        return {
            "delta": self.delta,
            "dice": self.dice,
            "cosine": self.cosine,
            "length": self.length,
            "autoThreshold": self.auto_threshold,
            "manualThreshold": self.manual_threshold,
            "salient": self.salient,
        }


@dataclass
class GateDecision:
    allowed: bool
    reason: Optional[str]
    model: Optional[str]
    detail: GateDetail
    status_code: int


def normalize(text: str) -> str:
    """Lowercase *text*, collapse whitespace and strip zero-width characters."""

    if not text:
        return ""
    text = text.translate(ZERO_WIDTH_REPLACEMENTS)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lowered = text.lower()
    lines = [WHITESPACE_RE.sub(" ", line).strip() for line in lowered.split("\n")]
    return "\n".join(line for line in lines if line)


def extract_changed_spans(old_text: str, new_text: str) -> Tuple[str, str, List[Tuple[int, int]]]:
    """Return concatenated changed spans between *old_text* and *new_text*."""

    if old_text == new_text:
        return "", "", []

    import difflib

    matcher = difflib.SequenceMatcher(a=old_text, b=new_text)
    old_parts: List[str] = []
    new_parts: List[str] = []
    added: List[Tuple[int, int]] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag in {"replace", "delete"}:
            old_parts.append(old_text[i1:i2])
        if tag in {"replace", "insert"}:
            new_parts.append(new_text[j1:j2])
        if tag == "insert":
            added.append((j1, j2))
    return "\n".join(part.strip() for part in old_parts if part.strip()), "\n".join(
        part.strip() for part in new_parts if part.strip()
    ), added


def _trigram_multiset(text: str) -> List[str]:
    cleaned = text.strip()
    if len(cleaned) < 3:
        return []
    return [cleaned[i : i + 3] for i in range(len(cleaned) - 2)]


def trigram_dice(old_text: str, new_text: str) -> float:
    """Compute the Sørensen–Dice coefficient for character trigrams."""

    trigrams_old = _trigram_multiset(old_text)
    trigrams_new = _trigram_multiset(new_text)
    if not trigrams_old and not trigrams_new:
        return 1.0
    if not trigrams_old or not trigrams_new:
        return 0.0
    from collections import Counter

    old_counter = Counter(trigrams_old)
    new_counter = Counter(trigrams_new)
    intersection = sum((old_counter & new_counter).values())
    total = sum(old_counter.values()) + sum(new_counter.values())
    if total == 0:
        return 0.0
    return 2.0 * intersection / total


def _has_boundary(text: str) -> bool:
    if not text:
        return False
    if text.endswith("\n"):
        return True
    stripped = text.rstrip()
    if not stripped:
        return False
    return stripped.endswith(('.', '?', '!'))


def _has_salience(old_span: str, new_span: str) -> bool:
    combined = f"{old_span} {new_span}" if old_span or new_span else new_span
    if not combined:
        return False
    if VITALS_RE.search(combined):
        return True
    if LABS_RE.search(combined):
        return True
    if MEDS_RE.search(combined):
        return True
    if PROCEDURE_RE.search(combined):
        return True
    if DIAGNOSTIC_RE.search(combined):
        return True

    old_has_negation = bool(NEGATION_RE.search(old_span))
    new_has_negation = bool(NEGATION_RE.search(new_span))
    new_has_positive = bool(POSITIVE_PHRASES_RE.search(new_span))
    if old_has_negation and not new_has_negation:
        return True
    if new_has_positive and not new_has_negation and not old_has_negation:
        return True
    return False


class AIGate:
    """Meaningful-change policy implementation."""

    def __init__(self) -> None:
        self._states: Dict[str, GateState] = {}
        self._embed_client = None

    def reset(self) -> None:
        self._states.clear()
        self._embed_client = None

    def _state_for(self, note_key: str) -> GateState:
        return self._states.setdefault(note_key, GateState())

    def _embedding_distance(self, old_span: str, new_span: str) -> float:
        if not old_span.strip() or not new_span.strip():
            return 1.0
        if self._embed_client is None:
            self._embed_client = get_embedding_client(AI_EMBEDDING_MODEL)
        vectors = self._embed_client.embed_many([old_span, new_span])
        if len(vectors) != 2:
            raise RuntimeError("Embedding client returned unexpected response")
        return cosine_distance(vectors[0], vectors[1])

    def evaluate(
        self,
        *,
        note_id: Optional[str],
        clinician_id: Optional[int],
        text: str,
        intent: Optional[str],
        transcript_cursor: Optional[str] = None,
        accepted_json: Optional[Mapping[str, object]] = None,
    ) -> GateDecision:
        note_key = note_id or f"note:{clinician_id}" if clinician_id is not None else "note:unknown"
        state = self._state_for(note_key)
        normalized = normalize(text)
        note_hash = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        L = len(normalized)
        auto_threshold = max(
            AI_AUTO_THRESHOLD_CHARS,
            math.ceil(AI_AUTO_THRESHOLD_PCT * L),
        )
        manual_threshold = max(
            AI_MANUAL_THRESHOLD_CHARS,
            math.ceil(AI_MANUAL_THRESHOLD_PCT * L),
        )
        detail = GateDetail(length=L, auto_threshold=auto_threshold, manual_threshold=manual_threshold)

        if not _has_boundary(text):
            self._update_state(state, normalized, note_hash, transcript_cursor, accepted_json)
            return GateDecision(
                allowed=False,
                reason="NO_SENTENCE_BOUNDARY",
                model=None,
                detail=detail,
                status_code=409,
            )

        if state.last_call_note_hash == note_hash:
            self._update_state(state, normalized, note_hash, transcript_cursor, accepted_json)
            return GateDecision(
                allowed=False,
                reason="DUPLICATE_STATE",
                model=None,
                detail=detail,
                status_code=409,
            )

        old_span, new_span, _ = extract_changed_spans(state.last_sent_text, normalized)
        delta = max(len(old_span), len(new_span))
        dice = trigram_dice(old_span, new_span)
        distance = self._embedding_distance(old_span, new_span)
        detail.delta = delta
        detail.dice = dice
        detail.cosine = distance
        salient = _has_salience(old_span, new_span)
        detail.salient = salient

        intent_normalized = (intent or "auto").strip().lower()

        if not state.cold_start_completed:
            if L < AI_COLD_START_CHARS:
                self._update_state(state, normalized, note_hash, transcript_cursor, accepted_json)
                return GateDecision(
                    allowed=False,
                    reason="BELOW_THRESHOLD",
                    model=None,
                    detail=detail,
                    status_code=409,
                )
            state.cold_start_completed = True

        if not salient:
            lexical_trigger = delta < 40 or dice > 0.90
            distance_threshold = (
                AI_SEMANTIC_DISTANCE_MANUAL_MIN
                if intent_normalized == "manual"
                else AI_SEMANTIC_DISTANCE_AUTO_MIN
            )
            if distance < distance_threshold:
                if lexical_trigger or delta < L:
                    self._update_state(state, normalized, note_hash, transcript_cursor, accepted_json)
                    return GateDecision(
                        allowed=False,
                        reason="NOT_MEANINGFUL",
                        model=None,
                        detail=detail,
                        status_code=409,
                    )

            if intent_normalized == "manual":
                threshold = manual_threshold
            else:
                threshold = auto_threshold

            if delta < threshold:
                self._update_state(state, normalized, note_hash, transcript_cursor, accepted_json)
                return GateDecision(
                    allowed=False,
                    reason="BELOW_THRESHOLD",
                    model=None,
                    detail=detail,
                    status_code=409,
                )

        state.last_call_note_hash = note_hash
        self._update_state(state, normalized, note_hash, transcript_cursor, accepted_json)

        intent_normalized = (intent or "auto").strip().lower()
        model = INTENT_MODELS.get(intent_normalized, "gpt-4o")
        return GateDecision(
            allowed=True,
            reason=None,
            model=model,
            detail=detail,
            status_code=200,
        )

    def _update_state(
        self,
        state: GateState,
        normalized: str,
        note_hash: str,
        transcript_cursor: Optional[str],
        accepted_json: Optional[Mapping[str, object]],
    ) -> None:
        state.last_sent_text = normalized
        state.last_note_hash = note_hash
        if transcript_cursor is not None:
            state.last_transcript_cursor = transcript_cursor
        if accepted_json is not None:
            state.last_accepted_json_hash = _hash_mapping(accepted_json)


def _hash_mapping(data: Mapping[str, object]) -> str:
    try:
        payload = json.dumps(data, sort_keys=True, separators=(",", ":"))
    except TypeError:
        payload = json.dumps(str(data), sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


__all__ = [
    "AIGate",
    "GateDecision",
    "GateDetail",
    "normalize",
    "extract_changed_spans",
    "trigram_dice",
]

