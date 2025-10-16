"""Utilities for constructing cached prompt blocks for suggestion requests."""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass, field
import hashlib
import json
import re
import threading
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from backend.prompts import get_guidelines
from backend.security import DEID_POLICY, PromptPrivacyGuard


_SUGGEST_SYSTEM_RUBRIC = (
    "You are an expert medical coder, compliance officer and clinical decision support assistant. "
    "Review the supplied, de-identified clinical material and return only valid JSON for the clinician. "
    "Do not invent or hallucinate content. Respect any clinician-provided rules and focus on documentation that "
    "affects coding, compliance risk and public health follow-up."
)

SUGGEST_SCHEMA_VERSION = "2024-06-01"

_SUGGEST_RESPONSE_SCHEMA: Dict[str, Any] = {
    "title": "RevenuePilot Suggestion Response",
    "type": "object",
    "required": ["codes", "compliance", "public_health", "differentials"],
    "properties": {
        "codes": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["code"],
                "properties": {
                    "code": {"type": "string"},
                    "rationale": {"type": "string"},
                    "upgrade_to": {"type": "string"},
                    "upgrade_path": {"type": "string"},
                    "confidence": {"type": ["number", "null"]},
                    "accepted": {"type": ["boolean", "null"]},
                    "accepted_by_user": {"type": ["boolean", "null"]},
                    "supporting_spans": {"type": "array"},
                    "demotions": {"type": ["array", "object", "null"]},
                },
                "additionalProperties": True,
            },
        },
        "compliance": {
            "type": "array",
            "items": {"type": "string"},
        },
        "public_health": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["recommendation"],
                "properties": {
                    "recommendation": {"type": "string"},
                    "reason": {"type": ["string", "null"]},
                    "source": {"type": ["string", "null"]},
                    "evidenceLevel": {"type": ["string", "number", "null"]},
                },
                "additionalProperties": True,
            },
        },
        "differentials": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["diagnosis"],
                "properties": {
                    "diagnosis": {"type": "string"},
                    "score": {"type": ["number", "null"]},
                },
                "additionalProperties": True,
            },
        },
        "questions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "confidence": {"type": ["number", "null"]},
    },
    "additionalProperties": True,
}

_POLICY_TEMPLATE = (
    "Policy safeguards ({policy_version}):\n"
    "- Never include PHI or other direct identifiers.\n"
    "- Obey clinician supplied rules and highlight compliance risks.\n"
    "- Return valid JSON only; omit commentary or markdown."
)

_PRIVACY_GUARD = PromptPrivacyGuard()

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def _sanitize_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    if not text:
        return ""
    cleaned = DEID_POLICY.apply(text)
    return re.sub(r"\s+", " ", cleaned).strip()


def _short_hash(value: str) -> str:
    if not value:
        return ""
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return digest[:12]


def _hash_json(payload: Mapping[str, Any]) -> str:
    try:
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    except (TypeError, ValueError):
        return ""
    return _short_hash(canonical)


def _split_sentences(text: str) -> List[Tuple[int, int, str]]:
    if not text:
        return []
    sentences: List[Tuple[int, int, str]] = []
    parts = _SENTENCE_SPLIT_RE.split(text)
    offset = 0
    for part in parts:
        if not part:
            continue
        start = text.find(part, offset)
        if start == -1:
            start = offset
        end = start + len(part)
        sentence = part.strip()
        if sentence:
            sentences.append((start, end, sentence))
        offset = end
    if not sentences:
        sentences.append((0, len(text), text.strip()))
    return sentences


def _collect_diff_sentences(
    current_text: str,
    spans: Sequence[Mapping[str, Any]],
    *,
    window: int = 1,
    max_sentences: int = 8,
) -> List[str]:
    sentences = _split_sentences(current_text)
    if not sentences:
        return []
    indexes: List[int] = []
    for span in spans:
        new_text = _sanitize_text(span.get("new")) if isinstance(span, Mapping) else ""
        if not new_text:
            continue
        lowered = new_text.lower()
        match_index: Optional[int] = None
        for idx, (_, _, sentence) in enumerate(sentences):
            if lowered in sentence.lower():
                match_index = idx
                break
        if match_index is None:
            continue
        start = max(0, match_index - window)
        end = min(len(sentences), match_index + window + 1)
        indexes.extend(range(start, end))
    if not indexes:
        indexes = list(range(min(len(sentences), max_sentences)))
    seen: set[int] = set()
    ordered: List[int] = []
    for idx in indexes:
        if idx not in seen:
            seen.add(idx)
            ordered.append(idx)
        if len(ordered) >= max_sentences:
            break
    return [sentences[idx][2].strip() for idx in ordered if sentences[idx][2].strip()]


def _extract_items(payload: Mapping[str, Any], keys: Iterable[str]) -> List[Any]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, list):
            return list(value)
    return []


def _format_disposition_items(items: Sequence[Any], *, limit: int = 4) -> List[str]:
    lines: List[str] = []
    for item in items:
        label = None
        if isinstance(item, Mapping):
            code = _sanitize_text(
                item.get("code")
                or item.get("Code")
                or item.get("identifier")
                or item.get("id")
            )
            description = _sanitize_text(
                item.get("description")
                or item.get("text")
                or item.get("name")
                or item.get("title")
            )
            rationale = _sanitize_text(
                item.get("rationale")
                or item.get("reason")
                or item.get("why")
                or item.get("note")
                or item.get("summary")
            )
            if code and description:
                label = f"{code} — {description}"
            else:
                label = code or description
            if rationale:
                label = f"{label} ({rationale})" if label else rationale
        elif isinstance(item, (str, int, float)):
            label = _sanitize_text(item)
        if label:
            lines.append(label)
        if len(lines) >= limit:
            break
    return lines


def _format_pmh_entries(entries: Sequence[Any], *, limit: int = 3) -> str:
    lines: List[str] = []
    for entry in entries:
        label = None
        if isinstance(entry, Mapping):
            for key in ("label", "name", "problem", "condition", "summary", "title"):
                value = entry.get(key)
                if value:
                    label = _sanitize_text(value)
                    break
            if not label:
                for key in ("code", "icd10", "snomed"):
                    value = entry.get(key)
                    if value:
                        label = _sanitize_text(value)
                        break
        elif isinstance(entry, (str, int, float)):
            label = _sanitize_text(entry)
        if label:
            lines.append(f"- {label}")
        if len(lines) >= limit:
            break
    return "\n".join(lines)


def _format_guidelines(
    age: Optional[int],
    sex: Optional[str],
    region: Optional[str],
) -> str:
    if age is None or not sex or not region:
        return ""
    try:
        data = get_guidelines(age, sex, region)
    except Exception:
        return ""
    tips: List[str] = []
    if isinstance(data, Mapping):
        for key in ("vaccinations", "screenings", "recommendations"):
            value = data.get(key)
            if isinstance(value, list):
                for item in value:
                    tip = _sanitize_text(item)
                    if tip:
                        tips.append(tip)
    if not tips:
        return ""
    deduped: List[str] = []
    for tip in tips:
        if tip not in deduped:
            deduped.append(tip)
        if len(deduped) >= 5:
            break
    return ", ".join(deduped)


def _summarise_disposition(payload: Mapping[str, Any]) -> str:
    accepted = _format_disposition_items(
        _extract_items(payload, ("accepted", "acceptedItems", "acceptedCodes"))
    )
    denied = _format_disposition_items(
        _extract_items(payload, ("denied", "rejected", "dismissed", "declined"))
    )
    parts: List[str] = []
    if accepted:
        parts.append("Accepted: " + "; ".join(accepted))
    if denied:
        parts.append("Denied: " + "; ".join(denied))
    return "; ".join(parts)


def _summarise_attachments(attachments: Mapping[str, Optional[str]]) -> str:
    if not attachments:
        return ""
    parts: List[str] = []
    for key in ("chart", "audio", "files"):
        if key not in attachments:
            continue
        raw = attachments.get(key)
        if not raw:
            parts.append(f"{key}=absent")
            continue
        cleaned = _guard_scrub_text(raw)
        if cleaned:
            parts.append(f"{key}=present ({len(cleaned)} chars)")
        else:
            parts.append(f"{key}=present")
    return ", ".join(parts)


def _estimate_prompt_tokens(messages: Iterable[Mapping[str, Any]]) -> int:
    total_chars = 0
    for message in messages:
        content = message.get("content")
        if isinstance(content, str):
            total_chars += len(content)
        elif isinstance(content, list):
            for item in content:
                if isinstance(item, Mapping):
                    text = item.get("text")
                    if isinstance(text, str):
                        total_chars += len(text)
    return max(0, int(total_chars / 4))


def _clone_messages(messages: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    return [dict(message) for message in messages]


class _StableBlockCache:
    """Small LRU cache for stable prompt segments."""

    def __init__(self, maxsize: int = 16) -> None:
        self._maxsize = maxsize
        self._items: "OrderedDict[Tuple[Any, ...], Tuple[List[Dict[str, Any]], int]]" = OrderedDict()
        self._lock = threading.Lock()

    def get(
        self,
        key: Tuple[Any, ...],
        builder: Callable[[], List[Dict[str, str]]],
    ) -> Tuple[List[Dict[str, str]], str, int]:
        with self._lock:
            cached = self._items.get(key)
            if cached is not None:
                self._items.move_to_end(key)
                messages, token_estimate = cached
                return _clone_messages(messages), "hit", token_estimate
        messages = builder()
        cloned = _clone_messages(messages)
        token_estimate = _estimate_prompt_tokens(cloned)
        with self._lock:
            self._items[key] = (cloned, token_estimate)
            while len(self._items) > self._maxsize:
                self._items.popitem(last=False)
        return _clone_messages(cloned), "miss", token_estimate


_STABLE_CACHE = _StableBlockCache(maxsize=32)


@dataclass
class DynamicPromptContext:
    """Context payload for building the dynamic suggestion prompt block."""

    sanitized_note: str
    sanitized_previous: str = ""
    diff_spans: Sequence[Mapping[str, Any]] = field(default_factory=list)
    accepted_json: Optional[Mapping[str, Any]] = None
    transcript: Optional[str] = None
    pmh_entries: Sequence[Any] = field(default_factory=list)
    rules: Optional[Sequence[str]] = None
    age: Optional[int] = None
    sex: Optional[str] = None
    region: Optional[str] = None
    note_id: Optional[str] = None
    encounter_id: Optional[str] = None
    session_id: Optional[str] = None
    transcript_cursor: Optional[str] = None
    attachments: Mapping[str, Optional[str]] = field(default_factory=dict)


def _guard_scrub_text(value: Optional[str]) -> str:
    if not value:
        return ""

    class _GuardProbe:
        def __init__(self, text: str) -> None:
            self.text = text
            self.chart = None
            self.audio = None
            self.rules = None
            self.age = None
            self.sex = None
            self.region = None

    probe = _GuardProbe(str(value))
    context = _PRIVACY_GUARD.prepare("suggest", probe)
    return context.text or ""


def build_stable_block(
    *,
    model: Optional[str],
    schema_version: str = SUGGEST_SCHEMA_VERSION,
    policy_version: Optional[str] = None,
) -> Tuple[List[Dict[str, str]], str, int]:
    """Return the stable prompt block containing rubric, schema and policy text."""

    key = ((model or "default").strip().lower(), schema_version.strip())
    policy_text = _POLICY_TEMPLATE.format(policy_version=policy_version or "unspecified")

    def _builder() -> List[Dict[str, str]]:
        schema_json = json.dumps(
            _SUGGEST_RESPONSE_SCHEMA,
            indent=2,
            sort_keys=True,
            ensure_ascii=False,
        )
        return [
            {"role": "system", "content": _SUGGEST_SYSTEM_RUBRIC},
            {
                "role": "system",
                "content": f"Respond with JSON matching schema version {schema_version}:\n{schema_json}",
            },
            {"role": "system", "content": policy_text},
        ]

    return _STABLE_CACHE.get(key, _builder)


def build_dynamic_block(ctx: DynamicPromptContext) -> Dict[str, str]:
    """Construct the dynamic user block for the suggestion prompt."""

    sections: List[str] = []

    diff_sentences = _collect_diff_sentences(ctx.sanitized_note, ctx.diff_spans, window=1)
    if diff_sentences:
        diff_payload = "\n".join(f"- {line}" for line in diff_sentences)
        sections.append(f"Changed note snippets (±1 sentence):\n{diff_payload}")
    elif ctx.sanitized_note:
        fallback_sentences = _collect_diff_sentences(
            ctx.sanitized_note,
            [],
            window=0,
            max_sentences=5,
        )
        if fallback_sentences:
            fallback = "\n".join(f"- {line}" for line in fallback_sentences)
            sections.append(f"Key note sentences:\n{fallback}")

    state_parts: List[str] = []
    for label, value in (
        ("noteId", _sanitize_text(ctx.note_id)),
        ("encounterId", _sanitize_text(ctx.encounter_id)),
        ("sessionId", _sanitize_text(ctx.session_id)),
    ):
        if value:
            state_parts.append(f"{label}={value}")

    note_hash = _short_hash(ctx.sanitized_note)
    if note_hash:
        state_parts.append(f"noteHash={note_hash}")
    previous_hash = _short_hash(ctx.sanitized_previous)
    if previous_hash:
        state_parts.append(f"previousHash={previous_hash}")
    if ctx.transcript_cursor:
        cursor = _sanitize_text(ctx.transcript_cursor)
        if cursor:
            state_parts.append(f"cursor={cursor}")
    if isinstance(ctx.accepted_json, Mapping):
        accepted_hash = _hash_json(ctx.accepted_json)
        if accepted_hash:
            state_parts.append(f"acceptedHash={accepted_hash}")
    attachments_summary = _summarise_attachments(ctx.attachments)

    if state_parts:
        sections.append("State summary: " + ", ".join(state_parts))

    if attachments_summary:
        sections.append("Attachments: " + attachments_summary)

    if ctx.rules:
        rule_lines = [
            f"- {_sanitize_text(rule)}"
            for rule in ctx.rules
            if _sanitize_text(rule)
        ]
        if rule_lines:
            sections.append("User rules:\n" + "\n".join(rule_lines))

    if ctx.accepted_json:
        disposition = _summarise_disposition(ctx.accepted_json)
        if disposition:
            sections.append("Suggestion disposition: " + disposition)

    transcript_snippet = _sanitize_text(ctx.transcript)
    if transcript_snippet:
        if len(transcript_snippet) > 240:
            transcript_snippet = transcript_snippet[:240].rstrip() + "…"
        sections.append(f"Transcript snippet: {transcript_snippet}")

    pmh_text = _format_pmh_entries(ctx.pmh_entries)
    if pmh_text:
        sections.append("PMH highlights:\n" + pmh_text)

    guideline_text = _format_guidelines(ctx.age, ctx.sex, ctx.region)
    if guideline_text:
        sections.append("Care guidelines to consider: " + guideline_text)

    if not sections and ctx.sanitized_previous:
        sections.append(
            "Previous note reference: " + ctx.sanitized_previous[:200].rstrip()
        )

    if not sections:
        sections.append("No recent changes supplied; use clinician instructions and defaults.")

    content = "\n\n".join(part for part in sections if part).strip()
    return {"role": "user", "content": content}


__all__ = [
    "DynamicPromptContext",
    "SUGGEST_SCHEMA_VERSION",
    "build_dynamic_block",
    "build_stable_block",
]
