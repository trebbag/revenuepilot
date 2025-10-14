"""Server-side AI gating logic for clinical note model calls.

The :class:`AIGatingService` centralises all heuristics that determine when a
clinical note should be sent to an AI model.  The service keeps the
authoritative state in the database so decisions never rely on client supplied
deltas.  The implementation favours clear, easily testable helpers so the
rules can evolve without touching the API surface.
"""

from __future__ import annotations

import dataclasses
import difflib
import hashlib
import json
import math
import os
import statistics
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from collections.abc import Mapping as MappingABC
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set, Tuple

import structlog

from backend.openai_client import get_embedding_client
from backend.db.models import (
    AIClinicianAggregate,
    AIClinicianDailyStat,
    AIJsonSnapshot,
    AINoteState,
)
from backend.encryption import decrypt_ai_payload, encrypt_ai_payload
from backend.migrations import session_scope


logger = structlog.get_logger(__name__)


SentenceBoundary = (".", "?", "!")

EMBED_SENTINEL_OLD = "<<OLD_NOTE_SPAN>>"
EMBED_SENTINEL_NEW = "<<NEW_NOTE_SPAN>>"

ZERO_WIDTH_REPLACEMENTS = str.maketrans({
    "\u200b": "",
    "\u200c": "",
    "\u200d": "",
    "\ufeff": "",
})


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


AI_COLD_START_CHARS = _env_int("AI_COLD_START_CHARS", 500)
AI_AUTO_THRESHOLD_CHARS = _env_int("AI_AUTO_THRESHOLD_CHARS", 100)
AI_AUTO_THRESHOLD_PCT = _env_float("AI_AUTO_THRESHOLD_PCT", 0.10)
AI_MANUAL_THRESHOLD_CHARS = _env_int("AI_MANUAL_THRESHOLD_CHARS", 60)
AI_MANUAL_THRESHOLD_PCT = _env_float("AI_MANUAL_THRESHOLD_PCT", 0.05)
AI_SEMANTIC_DISTANCE_AUTO_MIN = _env_float("AI_SEMANTIC_DISTANCE_AUTO_MIN", 0.08)
AI_SEMANTIC_DISTANCE_MANUAL_MIN = _env_float("AI_SEMANTIC_DISTANCE_MANUAL_MIN", 0.15)
AI_EMBEDDING_MODEL = os.getenv("AI_EMBEDDING_MODEL", os.getenv("AI_EMBED_MODEL", "text-embedding-3-small"))


SECTION_PATTERNS: Dict[str, Tuple[str, ...]] = {
    "HPI": (
        "history of present illness",
        "hpi",
        "subjective",
    ),
    "ROS": (
        "review of systems",
        "ros",
    ),
    "PE": (
        "physical exam",
        "physical examination",
        "objective",
    ),
    "A/P": (
        "assessment and plan",
        "assessment & plan",
        "assessment/plan",
        "plan",
        "a/p",
    ),
}


@dataclass(frozen=True)
class DiffSpan:
    """Represents an individual changed span between two note revisions."""

    old_text: str
    new_text: str
    old_range: Tuple[int, int]
    new_range: Tuple[int, int]

    @property
    def delta_chars(self) -> int:
        return max(len(self.old_text), len(self.new_text))


@dataclass
class GateDetail:
    """Captures metadata that is returned to the API layer."""

    L: int
    delta_chars: int
    mini_threshold: int
    full_threshold: int
    cooldown_remaining_ms: int = 0
    reason: Optional[str] = None
    cold_start_completed: bool = False
    notes_started_today: int = 0
    cap_auto4o: int = 1
    cap_daily_manual4o: int = 6
    auto4o_count: int = 0
    manual4o_count_day: int = 0
    dice: float = 0.0
    cosine: float = 0.0

    def asdict(self) -> Dict[str, Any]:
        return dataclasses.asdict(self)


@dataclass
class AIGateInput:
    note_id: str
    clinician_id: int
    text: str
    request_type: str
    force: bool = False
    transcript_cursor: Optional[str] = None
    accepted_json: Optional[Mapping[str, Any]] = None
    input_timestamp: Optional[datetime] = None


@dataclass
class AIGateDecision:
    allowed: bool
    model: Optional[str]
    route: str
    status_code: int
    detail: GateDetail
    reason: Optional[str] = None
    job_id: Optional[str] = None


def normalize_note_text(text: str) -> str:
    """Apply a deterministic normalisation to a note."""

    if not text:
        return ""
    cleaned = text.translate(ZERO_WIDTH_REPLACEMENTS)
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = cleaned.replace("•", "- ")
    cleaned = cleaned.replace("\u2022", "- ")
    cleaned = cleaned.replace("\u25CF", "- ")
    cleaned = "\n".join(line.strip() for line in cleaned.split("\n"))
    cleaned = cleaned.strip()
    # Collapse runs of spaces but keep intentional newline separation.
    cleaned = "\n".join(" ".join(filter(None, line.split())) for line in cleaned.split("\n"))
    cleaned = cleaned.replace(" ,", ",").replace(" .", ".").replace(" ;", ";")
    cleaned = cleaned.replace(" :", ":").replace(" !", "!").replace(" ?", "?")
    cleaned = cleaned.replace("- -", "- ")
    return cleaned.strip()


def parse_sections(text: str) -> Dict[str, List[int]]:
    """Return a mapping of canonical sections to ``[start, end]`` indexes."""

    lowered = text.lower()
    markers: List[Tuple[int, str]] = []
    for section, patterns in SECTION_PATTERNS.items():
        for pattern in patterns:
            idx = 0
            needle = pattern.lower()
            while True:
                found = lowered.find(needle, idx)
                if found == -1:
                    break
                if found == 0 or lowered[found - 1] in {"\n", " "}:
                    markers.append((found, section))
                idx = found + len(needle)

    if not markers:
        return {}

    markers.sort()
    ranges: Dict[str, List[int]] = {}
    for pos, section in markers:
        if section in ranges:
            continue
        ranges[section] = [pos, len(text)]

    ordered = sorted(((start, section) for section, (start, _) in ranges.items()))
    for idx, (start, section) in enumerate(ordered):
        end = len(text)
        if idx + 1 < len(ordered):
            end = ordered[idx + 1][0]
        ranges[section][1] = max(start, end)
    return ranges


def _trigram_set(value: str) -> Set[str]:
    stripped = value.lower()
    if len(stripped) < 3:
        return set()
    return {stripped[i : i + 3] for i in range(len(stripped) - 2)}


def trigram_dice(a: str, b: str) -> float:
    """Return the Sørensen–Dice coefficient on character trigrams."""

    set_a = _trigram_set(a)
    set_b = _trigram_set(b)
    if not set_a and not set_b:
        return 1.0
    intersection = len(set_a.intersection(set_b))
    return (2 * intersection) / max(len(set_a) + len(set_b), 1)


def embedding_distance(embedder: Any, a: str, b: str) -> Optional[float]:
    """Cosine distance between embeddings of ``a`` and ``b``."""

    try:
        if hasattr(embedder, "embed_many"):
            vectors = embedder.embed_many([a, b])
            if not isinstance(vectors, Sequence) or len(vectors) != 2:
                return None
            vec_a, vec_b = vectors
        else:
            vec_a = embedder.embed(a)
            vec_b = embedder.embed(b)
    except Exception:
        return None
    if not vec_a or not vec_b:
        return None
    norm_a = math.sqrt(sum(x * x for x in vec_a))
    norm_b = math.sqrt(sum(x * x for x in vec_b))
    if not norm_a or not norm_b:
        return None
    dot = sum(x * y for x, y in zip(vec_a, vec_b)) / (norm_a * norm_b)
    dot = max(min(dot, 1.0), -1.0)
    return 1.0 - dot


def compute_hash(value: str, salt: str) -> str:
    digest = hashlib.sha256(f"{salt}:{value}".encode("utf-8")).hexdigest()
    return digest


def compute_json_hash(payload: Mapping[str, Any], salt: str) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return compute_hash(canonical, salt)


def compute_json_divergence(previous: Mapping[str, Any], current: Mapping[str, Any]) -> float:
    """Approximate divergence by comparing keys and primitive values."""

    prev_keys = set(previous.keys())
    curr_keys = set(current.keys())
    union = prev_keys | curr_keys
    if not union:
        return 0.0
    delta = len(prev_keys ^ curr_keys)
    shared = prev_keys & curr_keys
    for key in shared:
        if previous.get(key) != current.get(key):
            delta += 1
    return delta / len(union)


def _normalize_json_payload(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Return a JSON-serialisable deep copy of *payload*."""

    return json.loads(json.dumps(payload))


def _merge_preferred(preferred: Mapping[str, Any], current: Mapping[str, Any]) -> Dict[str, Any]:
    """Deep merge *preferred* values into *current* while preserving mappings."""

    result: Dict[str, Any] = json.loads(json.dumps(current))
    for key, value in preferred.items():
        if isinstance(value, MappingABC) and isinstance(result.get(key), MappingABC):
            result[key] = _merge_preferred(value, result[key])
        else:
            result[key] = json.loads(json.dumps(value)) if isinstance(value, (dict, list)) else value
    return result


def _diff_spans(old: str, new: str) -> List[DiffSpan]:
    matcher = difflib.SequenceMatcher(a=old, b=new)
    spans: List[DiffSpan] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        spans.append(DiffSpan(old[i1:i2], new[j1:j2], (i1, i2), (j1, j2)))
    return spans


def _touches_sections(span: DiffSpan, sections: Mapping[str, Sequence[int]]) -> Set[str]:
    touched: Set[str] = set()
    start, end = span.new_range
    for name, (sec_start, sec_end) in sections.items():
        if start < sec_end and end > sec_start:
            touched.add(name)
    return touched


def _has_boundary(text: str) -> bool:
    stripped = text.rstrip()
    if not stripped:
        return False
    return stripped.endswith("\n") or stripped[-1] in SentenceBoundary


def _ensure_aware(ts: Optional[datetime]) -> Optional[datetime]:
    if ts is None:
        return None
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts


class AIGatingService:
    """Encapsulates all server-side gating heuristics."""

    JSON_STICKY_DIVERGENCE_THRESHOLD = 0.30

    def __init__(
        self,
        connection,
        *,
        model_high: str,
        model_mini: str,
        hash_salt: str,
        min_secs: float,
        cooldown_full: float,
        cooldown_mini: float,
        embed_model: Optional[str] = None,
        embedding_client: Any = None,
    ) -> None:
        self._connection = connection
        self._model_high = model_high
        self._model_mini = model_mini
        self._hash_salt = hash_salt
        self._min_secs = max(0.0, float(min_secs))
        self._cooldown_full = max(0.0, float(cooldown_full))
        self._cooldown_mini = max(0.0, float(cooldown_mini))
        if embedding_client is not None:
            self._embedder = embedding_client
        else:
            model_name = embed_model or AI_EMBEDDING_MODEL
            self._embedder = get_embedding_client(model_name)
        self._cost_high_cents = 0.2  # heuristic per thousand tokens
        self._cost_mini_cents = 0.05

    def reconcile_structured_json(
        self,
        note_id: str,
        clinician_id: int,
        model_json: Mapping[str, Any],
        *,
        divergence_threshold: float = JSON_STICKY_DIVERGENCE_THRESHOLD,
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """Merge previously accepted structured JSON into ``model_json`` when similar."""

        if not isinstance(model_json, MappingABC):
            raise TypeError("model_json must be a mapping")

        metadata: Dict[str, Any] = {
            "noteId": note_id,
            "divergence": None,
            "mergedFromAccepted": False,
            "previousHash": None,
            "currentHash": None,
            "threshold": float(divergence_threshold),
        }

        try:
            normalized_current = _normalize_json_payload(model_json)
        except (TypeError, ValueError):
            logger.info(
                "ai_gate_json_normalize_failed",
                note_id=note_id,
                clinician_id=clinician_id,
                exc_info=True,
            )
            normalized_current = dict(model_json)

        with session_scope(self._connection) as session:
            state = session.get(AINoteState, note_id)
            if state is None:
                state = AINoteState(
                    note_id=note_id,
                    clinician_id=clinician_id,
                    last_note_snapshot="",
                )
                session.add(state)
                session.flush()
            else:
                state.clinician_id = clinician_id

            previous_payload: Optional[Dict[str, Any]] = None
            if state.last_accepted_json_hash:
                metadata["previousHash"] = state.last_accepted_json_hash
                previous_payload = self._load_json_snapshot(session, state.last_accepted_json_hash)

            divergence: Optional[float] = None
            if previous_payload is not None:
                try:
                    divergence = compute_json_divergence(previous_payload, normalized_current)
                except Exception:
                    logger.info(
                        "ai_gate_json_divergence_failed",
                        note_id=note_id,
                        clinician_id=clinician_id,
                        exc_info=True,
                    )
                    divergence = None
            metadata["divergence"] = divergence

            should_merge = (
                previous_payload is not None
                and divergence is not None
                and divergence <= max(divergence_threshold, 0.0)
            )
            merged_payload = normalized_current
            if should_merge:
                try:
                    merged_payload = _merge_preferred(previous_payload, normalized_current)
                    metadata["mergedFromAccepted"] = True
                except (TypeError, ValueError):
                    logger.info(
                        "ai_gate_json_merge_failed",
                        note_id=note_id,
                        clinician_id=clinician_id,
                        exc_info=True,
                    )
                    merged_payload = normalized_current

            new_hash = self._store_json_payload(session, merged_payload, note_id=note_id)
            if new_hash:
                metadata["currentHash"] = new_hash
                state.last_accepted_json_hash = new_hash

            session.add(state)

            logger.info(
                "ai_gate_json_divergence",
                note_id=note_id,
                clinician_id=clinician_id,
                divergence=float(divergence) if divergence is not None else None,
                merged=metadata["mergedFromAccepted"],
                threshold=float(divergence_threshold),
                previous_hash=metadata["previousHash"],
                current_hash=metadata["currentHash"],
            )

            return merged_payload, metadata

    # Public API -----------------------------------------------------

    def evaluate(self, payload: AIGateInput) -> AIGateDecision:
        """Return a gating decision for ``payload``."""

        now = datetime.now(timezone.utc)
        normalized = normalize_note_text(payload.text)
        L = len(normalized)
        mini_threshold = max(
            AI_MANUAL_THRESHOLD_CHARS,
            math.ceil(AI_MANUAL_THRESHOLD_PCT * L),
        )
        full_threshold = max(
            AI_AUTO_THRESHOLD_CHARS,
            math.ceil(AI_AUTO_THRESHOLD_PCT * L),
        )

        detail = GateDetail(
            L=L,
            delta_chars=0,
            mini_threshold=mini_threshold,
            full_threshold=full_threshold,
        )

        with session_scope(self._connection) as session:
            state = session.get(AINoteState, payload.note_id)
            if state is None:
                state = AINoteState(
                    note_id=payload.note_id,
                    clinician_id=payload.clinician_id,
                    last_note_snapshot="",
                )
                session.add(state)
                session.flush()

            detail.cold_start_completed = bool(state.cold_start_completed)

            previous_snapshot = state.last_note_snapshot or ""
            spans = _diff_spans(previous_snapshot, normalized)
            span_metrics: List[Tuple[DiffSpan, float, Optional[float]]] = []
            max_dice = 0.0
            max_distance = 0.0
            delta_chars = 0
            for span in spans:
                delta_chars += span.delta_chars
                dice_val = trigram_dice(span.old_text, span.new_text)
                distance_val = embedding_distance(
                    self._embedder,
                    f"{EMBED_SENTINEL_OLD}\n{span.old_text}",
                    f"{EMBED_SENTINEL_NEW}\n{span.new_text}",
                )
                if dice_val > max_dice:
                    max_dice = dice_val
                if distance_val is not None and distance_val > max_distance:
                    max_distance = distance_val
                span_metrics.append((span, dice_val, distance_val))
            sections = parse_sections(normalized)
            detail.delta_chars = delta_chars
            detail.dice = round(max_dice, 6)
            detail.cosine = round(max_distance, 6)

            today = now.date()
            daily = (
                session.query(AIClinicianDailyStat)
                .filter(
                    AIClinicianDailyStat.clinician_id == payload.clinician_id,
                    AIClinicianDailyStat.day == today,
                )
                .one_or_none()
            )
            if daily is None:
                daily = AIClinicianDailyStat(
                    clinician_id=payload.clinician_id,
                    day=today,
                )
                session.add(daily)
                session.flush()

            aggregate = session.get(AIClinicianAggregate, payload.clinician_id)
            if aggregate is None:
                aggregate = AIClinicianAggregate(
                    clinician_id=payload.clinician_id,
                    length_samples=[],
                    median_final_note_length=None,
                )
                session.add(aggregate)
                session.flush()

            if not state.daily_note_counted:
                daily.notes_started += 1
                state.daily_note_counted = True

            detail.notes_started_today = daily.notes_started
            L_med = aggregate.median_final_note_length or max(L, 800)
            L_pred = min(L * 1.3, 2.5 * L_med)
            cap_auto = max(1, min(4, round(2 * (L_pred / max(L_med, 1)))))
            detail.cap_auto4o = cap_auto
            cap_manual = max(6, min(20, 2 * daily.notes_started + 4))
            detail.cap_daily_manual4o = cap_manual
            detail.auto4o_count = state.auto4o_count
            detail.manual4o_count_day = daily.manual4o_count

            input_time = payload.input_timestamp or now
            if input_time.tzinfo is None:
                input_time = input_time.replace(tzinfo=timezone.utc)
            last_input = _ensure_aware(state.last_input_ts)
            if last_input is not None:
                elapsed_since_input = (input_time - last_input).total_seconds()
            else:
                elapsed_since_input = None
            state.last_input_ts = input_time

            # Cold start gate -------------------------------------------------
            cold_ready = L >= AI_COLD_START_CHARS and _has_boundary(payload.text)
            if not state.cold_start_completed and payload.request_type != "finalization":
                if not cold_ready and not payload.force:
                    detail.reason = "BELOW_THRESHOLD"
                    return AIGateDecision(
                        allowed=False,
                        model=None,
                        route=payload.request_type,
                        status_code=409,
                        detail=detail,
                        reason="BELOW_THRESHOLD",
                    )
                if cold_ready:
                    decision = self._allow(
                        session,
                        state,
                        daily,
                        aggregate,
                        payload,
                        now,
                        normalized,
                        sections,
                        delta_chars,
                        detail,
                        high_accuracy=True,
                    )
                    decision.detail.reason = None
                    return decision

            # Finalization bypasses the rest of the gates.
            if payload.request_type == "finalization":
                decision = self._allow(
                    session,
                    state,
                    daily,
                    aggregate,
                    payload,
                    now,
                    normalized,
                    sections,
                    delta_chars,
                    detail,
                    high_accuracy=True,
                )
                return decision

            if elapsed_since_input is not None and elapsed_since_input < self._min_secs:
                detail.reason = "minSecs"
                detail.cooldown_remaining_ms = int((self._min_secs - elapsed_since_input) * 1000)
                return AIGateDecision(
                    allowed=False,
                    model=None,
                    route=payload.request_type,
                    status_code=409,
                    detail=detail,
                    reason="minSecs",
                )
            if not _has_boundary(payload.text):
                detail.reason = "NOT_MEANINGFUL"
                return AIGateDecision(
                    allowed=False,
                    model=None,
                    route=payload.request_type,
                    status_code=409,
                    detail=detail,
                    reason="NOT_MEANINGFUL",
                )

            meaningful = True
            if not payload.force:
                meaningful = self._is_meaningful(
                    span_metrics,
                    sections,
                    request_type=payload.request_type,
                )
                if not meaningful:
                    detail.reason = "NOT_MEANINGFUL"
                    return AIGateDecision(
                        allowed=False,
                        model=None,
                        route=payload.request_type,
                        status_code=409,
                        detail=detail,
                        reason="NOT_MEANINGFUL",
                    )

            if payload.request_type in {"auto", "manual_full"}:
                if not payload.force and delta_chars < full_threshold:
                    detail.reason = "minChars"
                    return AIGateDecision(
                        allowed=False,
                        model=None,
                        route=payload.request_type,
                        status_code=409,
                        detail=detail,
                        reason="minChars",
                    )

                if payload.request_type == "auto" and state.auto4o_count >= cap_auto:
                    detail.reason = "CAP_REACHED"
                    return AIGateDecision(
                        allowed=False,
                        model=None,
                        route=payload.request_type,
                        status_code=409,
                        detail=detail,
                        reason="CAP_REACHED",
                    )

                if payload.request_type == "manual_full" and daily.manual4o_count >= cap_manual:
                    detail.reason = "CAP_REACHED"
                    return AIGateDecision(
                        allowed=False,
                        model=None,
                        route=payload.request_type,
                        status_code=409,
                        detail=detail,
                        reason="CAP_REACHED",
                    )

                last_model_call = _ensure_aware(state.last_model_call_ts)
                if last_model_call is not None:
                    cooldown = self._cooldown_full
                    since_last = (now - last_model_call).total_seconds()
                    if since_last < cooldown:
                        detail.reason = "COOLDOWN"
                        detail.cooldown_remaining_ms = int((cooldown - since_last) * 1000)
                        return AIGateDecision(
                            allowed=False,
                            model=None,
                            route=payload.request_type,
                            status_code=409,
                            detail=detail,
                            reason="COOLDOWN",
                        )

                decision = self._allow(
                    session,
                    state,
                    daily,
                    aggregate,
                    payload,
                    now,
                    normalized,
                    sections,
                    delta_chars,
                    detail,
                    high_accuracy=True,
                )
                return decision

            if payload.request_type == "manual_mini":
                if not payload.force and delta_chars < mini_threshold:
                    detail.reason = "minChars"
                    return AIGateDecision(
                        allowed=False,
                        model=None,
                        route=payload.request_type,
                        status_code=409,
                        detail=detail,
                        reason="minChars",
                    )
                last_mini = _ensure_aware(state.last_mini_call_ts)
                if last_mini is not None:
                    since_last = (now - last_mini).total_seconds()
                    if since_last < self._cooldown_mini:
                        detail.reason = "COOLDOWN"
                        detail.cooldown_remaining_ms = int((self._cooldown_mini - since_last) * 1000)
                        return AIGateDecision(
                            allowed=False,
                            model=None,
                            route=payload.request_type,
                            status_code=409,
                            detail=detail,
                            reason="COOLDOWN",
                        )

                decision = self._allow(
                    session,
                    state,
                    daily,
                    aggregate,
                    payload,
                    now,
                    normalized,
                    sections,
                    delta_chars,
                    detail,
                    high_accuracy=False,
                )
                return decision

        detail.reason = "NOT_MEANINGFUL"
        return AIGateDecision(
            allowed=False,
            model=None,
            route=payload.request_type,
            status_code=409,
            detail=detail,
            reason="NOT_MEANINGFUL",
        )

    # Internal helpers ------------------------------------------------

    def _is_meaningful(
        self,
        span_metrics: Sequence[Tuple[DiffSpan, float, Optional[float]]],
        sections: Mapping[str, Sequence[int]],
        *,
        request_type: str,
    ) -> bool:
        if not span_metrics:
            return False
        distance_threshold = (
            AI_SEMANTIC_DISTANCE_MANUAL_MIN
            if request_type in {"manual", "manual_full", "manual_mini"}
            else AI_SEMANTIC_DISTANCE_AUTO_MIN
        )
        for span, dice, distance in span_metrics:
            touched = _touches_sections(span, sections)
            if {"PE", "A/P"} & touched:
                return True
            if span.delta_chars < 40:
                continue
            if dice > 0.90:
                continue
            if distance is None:
                return True
            if distance >= distance_threshold:
                return True
        return False

    def _allow(
        self,
        session,
        state: AINoteState,
        daily: AIClinicianDailyStat,
        aggregate: AIClinicianAggregate,
        payload: AIGateInput,
        now: datetime,
        normalized: str,
        sections: Mapping[str, Sequence[int]],
        delta_chars: int,
        detail: GateDetail,
        *,
        high_accuracy: bool,
    ) -> AIGateDecision:
        model = self._model_high if high_accuracy else self._model_mini
        if high_accuracy:
            state.auto4o_count = state.auto4o_count + 1 if payload.request_type == "auto" else state.auto4o_count
            state.manual4o_count = state.manual4o_count + 1 if payload.request_type == "manual_full" else state.manual4o_count
            state.last_model_call_ts = now
            if payload.request_type == "manual_full":
                daily.manual4o_count += 1
        else:
            state.last_mini_call_ts = now

        prev_allowed = state.allowed_count
        state.allowed_count += 1
        last_allowed = _ensure_aware(state.last_allowed_ts)
        elapsed_ms: float | None = None
        if last_allowed and prev_allowed > 0:
            elapsed_ms = (now - last_allowed).total_seconds() * 1000.0
            state.mean_time_between_allowed_ms = (
                (state.mean_time_between_allowed_ms * prev_allowed) + elapsed_ms
            ) / (prev_allowed + 1)
        state.last_allowed_ts = now
        state.total_delta_chars += max(delta_chars, 0)
        state.last_note_snapshot = normalized
        state.last_note_hash = compute_hash(normalized, self._hash_salt)
        state.last_section_map = dict(sections)
        if payload.transcript_cursor is not None:
            state.last_transcript_cursor = payload.transcript_cursor
        if payload.accepted_json:
            stored_hash = self._store_json_payload(
                session,
                payload.accepted_json,
                note_id=payload.note_id,
            )
            if stored_hash:
                state.last_accepted_json_hash = stored_hash

        if not state.cold_start_completed and high_accuracy:
            state.cold_start_completed = True

        if payload.request_type == "finalization":
            state.finalization_count += 1
            self._record_note_length(aggregate, len(normalized))
        if payload.request_type in {"auto", "manual_full"} and high_accuracy:
            self._record_note_length(aggregate, len(normalized))

        estimated_tokens = max(16, math.ceil(len(normalized) / 4))
        cost_cents = (
            estimated_tokens / 1000.0 * (self._cost_high_cents if high_accuracy else self._cost_mini_cents)
        )
        daily.tokens_estimated += estimated_tokens
        daily.cost_cents_estimated += cost_cents

        session.add(state)
        session.add(daily)
        session.add(aggregate)

        job_id = uuid.uuid4().hex
        detail.reason = None

        from backend import main as backend_main

        labels = {
            "route": payload.request_type,
            "clinician_id": str(payload.clinician_id),
            "note_id": str(payload.note_id),
        }
        statsd_tags = [
            f"route:{payload.request_type}",
            f"clinician_id:{payload.clinician_id}",
            f"note_id:{payload.note_id}",
        ]

        if high_accuracy and payload.request_type == "auto":
            backend_main.AI_GATE_AUTO4O_COUNT.labels(**labels).set(float(state.auto4o_count))
            backend_main.statsd_gauge(
                "ai_gate.auto4o_count", float(state.auto4o_count), tags=statsd_tags
            )
        if high_accuracy and payload.request_type == "manual_full":
            backend_main.AI_GATE_MANUAL4O_COUNT.labels(**labels).set(float(state.manual4o_count))
            backend_main.statsd_gauge(
                "ai_gate.manual4o_count", float(state.manual4o_count), tags=statsd_tags
            )
        if payload.request_type == "finalization":
            backend_main.AI_GATE_FINALIZATION_COUNT.labels(**labels).set(float(state.finalization_count))
            backend_main.statsd_gauge(
                "ai_gate.finalization_count",
                float(state.finalization_count),
                tags=statsd_tags,
            )

        backend_main.AI_GATE_MEAN_TIME_BETWEEN_ALLOWED.labels(**labels).set(
            float(state.mean_time_between_allowed_ms)
        )
        backend_main.statsd_gauge(
            "ai_gate.mean_time_between_allowed_ms",
            float(state.mean_time_between_allowed_ms),
            tags=statsd_tags,
        )
        if elapsed_ms is not None:
            backend_main.statsd_histogram(
                "ai_gate.time_between_allowed_ms", float(elapsed_ms), tags=statsd_tags
            )

        edits_per_allowed = state.total_delta_chars / max(state.allowed_count, 1)
        backend_main.AI_GATE_EDITS_PER_ALLOWED_RUN.labels(**labels).set(float(edits_per_allowed))
        backend_main.statsd_gauge(
            "ai_gate.edits_per_allowed_run", float(edits_per_allowed), tags=statsd_tags
        )

        logger.info(
            "ai_gate_allowed",
            note_id=payload.note_id,
            route=payload.request_type,
            model=model,
            delta_chars=delta_chars,
            force=payload.force,
        )

        return AIGateDecision(
            allowed=True,
            model=model,
            route=payload.request_type,
            status_code=202,
            detail=detail,
            job_id=job_id,
        )

    def _record_note_length(self, aggregate: AIClinicianAggregate, length: int) -> None:
        samples = list(aggregate.length_samples or [])
        samples.append(length)
        if len(samples) > 60:
            samples = samples[-60:]
        aggregate.length_samples = samples
        try:
            aggregate.median_final_note_length = int(statistics.median(samples)) if samples else None
        except statistics.StatisticsError:
            aggregate.median_final_note_length = length

    def _store_json_payload(
        self,
        session,
        payload: Mapping[str, Any],
        *,
        note_id: str,
    ) -> Optional[str]:
        if not isinstance(payload, MappingABC):
            return None
        try:
            normalized = _normalize_json_payload(payload)
        except (TypeError, ValueError):
            logger.info(
                "ai_gate_json_normalize_failed",
                note_id=note_id,
                exc_info=True,
            )
            return None
        try:
            json_hash = compute_json_hash(normalized, self._hash_salt)
        except Exception:
            logger.info(
                "ai_gate_json_hash_failed",
                note_id=note_id,
                exc_info=True,
            )
            return None

        snapshot = session.get(AIJsonSnapshot, json_hash)
        encrypted_payload = encrypt_ai_payload(normalized)
        if snapshot is None:
            snapshot = AIJsonSnapshot(hash=json_hash, payload=encrypted_payload)
            session.add(snapshot)
        else:
            snapshot.payload = encrypted_payload
            session.add(snapshot)
        return json_hash

    def _load_json_snapshot(
        self,
        session,
        json_hash: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        if not json_hash:
            return None
        snapshot = session.get(AIJsonSnapshot, json_hash)
        if snapshot is None:
            return None
        payload = snapshot.payload
        if isinstance(payload, MappingABC):
            if "ciphertext" in payload:
                try:
                    decrypted = decrypt_ai_payload(payload)
                    return _normalize_json_payload(decrypted)
                except (ValueError, TypeError):
                    logger.info(
                        "ai_gate_json_decrypt_failed",
                        hash=json_hash,
                        exc_info=True,
                    )
                    return None
            try:
                normalized = _normalize_json_payload(payload)
            except (TypeError, ValueError):
                logger.info(
                    "ai_gate_json_normalize_failed",
                    hash=json_hash,
                    exc_info=True,
                )
                return None
            snapshot.payload = encrypt_ai_payload(normalized)
            session.add(snapshot)
            return normalized
        return None


__all__ = [
    "AIGatingService",
    "AIGateInput",
    "AIGateDecision",
    "GateDetail",
    "normalize_note_text",
    "parse_sections",
    "compute_hash",
    "compute_json_hash",
    "compute_json_divergence",
    "EMBED_SENTINEL_NEW",
    "EMBED_SENTINEL_OLD",
]
