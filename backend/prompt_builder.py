"""Utilities for constructing cached prompt blocks for suggestion requests."""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
import hashlib
import json
import re
import threading
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from backend.prompts import build_suggest_prompt, get_guidelines
from backend.security import DEID_POLICY


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
    """Return sentence spans and text for ``text``."""

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


def _extract_items(payload: Mapping[str, Any], keys: Iterable[str]) -> List[Any]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, list):
            return list(value)
    return []


def _format_disposition_items(items: Sequence[Any], *, limit: int = 6) -> List[str]:
    lines: List[str] = []
    for item in items:
        label = None
        rationale = None
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
            if not label and item.get("code") is None:
                label = _sanitize_text(item.get("label"))
        elif isinstance(item, (str, int, float)):
            label = _sanitize_text(item)
        if not label:
            continue
        if rationale:
            lines.append(f"- {label} ({rationale})")
        else:
            lines.append(f"- {label}")
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
        new_text = _sanitize_text(span.get("new"))
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


class _StableBlockCache:
    """Small LRU cache for stable prompt segments."""

    def __init__(self, maxsize: int = 64) -> None:
        self._maxsize = maxsize
        self._items: "OrderedDict[Tuple[Any, ...], List[Dict[str, str]]]" = OrderedDict()
        self._lock = threading.Lock()

    def get(
        self,
        key: Tuple[Any, ...],
        builder: Callable[[], List[Dict[str, str]]],
    ) -> Tuple[List[Dict[str, str]], str]:
        with self._lock:
            if key in self._items:
                value = self._items.pop(key)
                self._items[key] = value
                return [dict(msg) for msg in value], "hit"
        value = builder()
        with self._lock:
            self._items[key] = [dict(msg) for msg in value]
            while len(self._items) > self._maxsize:
                self._items.popitem(last=False)
            return [dict(msg) for msg in value], "miss"


@dataclass
class PromptBlocks:
    stable: List[Dict[str, str]]
    dynamic: List[Dict[str, str]]
    cache_state: str


class SuggestPromptBuilder:
    """Construct suggestion prompt blocks with caching for stable messages."""

    def __init__(self, *, cache_size: int = 64) -> None:
        self._cache = _StableBlockCache(maxsize=cache_size)

    def build(
        self,
        *,
        lang: str,
        specialty: Optional[str],
        payer: Optional[str],
        sanitized_note: str,
        sanitized_previous: str,
        diff_spans: Sequence[Mapping[str, Any]],
        accepted_json: Optional[Mapping[str, Any]],
        transcript: Optional[str],
        pmh_entries: Sequence[Any],
        rules: Optional[Sequence[str]] = None,
        age: Optional[int] = None,
        sex: Optional[str] = None,
        region: Optional[str] = None,
        note_id: Optional[str] = None,
        encounter_id: Optional[str] = None,
        session_id: Optional[str] = None,
        transcript_cursor: Optional[str] = None,
        policy_version: Optional[str] = None,
    ) -> PromptBlocks:
        policy_key = policy_version or "default"
        key = (policy_key, lang or "en", specialty or "", payer or "")

        def _build_stable() -> List[Dict[str, str]]:
            placeholder = "__PROMPT_STATIC__"
            messages = build_suggest_prompt(
                placeholder,
                lang,
                specialty,
                payer,
                None,
                None,
                None,
            )
            return [dict(msg) for msg in messages[:-1]]

        stable_messages, cache_state = self._cache.get(key, _build_stable)
        dynamic_message = self._build_dynamic_message(
            sanitized_note=sanitized_note,
            sanitized_previous=sanitized_previous,
            diff_spans=diff_spans,
            accepted_json=accepted_json,
            transcript=transcript,
            pmh_entries=pmh_entries,
            rules=rules,
            age=age,
            sex=sex,
            region=region,
            note_id=note_id,
            encounter_id=encounter_id,
            session_id=session_id,
            transcript_cursor=transcript_cursor,
        )
        return PromptBlocks(
            stable=stable_messages,
            dynamic=[dynamic_message],
            cache_state=cache_state,
        )

    def _build_dynamic_message(
        self,
        *,
        sanitized_note: str,
        sanitized_previous: str,
        diff_spans: Sequence[Mapping[str, Any]],
        accepted_json: Optional[Mapping[str, Any]],
        transcript: Optional[str],
        pmh_entries: Sequence[Any],
        rules: Optional[Sequence[str]],
        age: Optional[int],
        sex: Optional[str],
        region: Optional[str],
        note_id: Optional[str],
        encounter_id: Optional[str],
        session_id: Optional[str],
        transcript_cursor: Optional[str],
    ) -> Dict[str, str]:
        sections: List[str] = []

        diff_sentences = _collect_diff_sentences(sanitized_note, diff_spans)
        if diff_sentences:
            diff_payload = "\n".join(f"- {line}" for line in diff_sentences)
            sections.append(f"Changed note snippets:\n{diff_payload}")
        elif sanitized_note:
            fallback_sentences = _collect_diff_sentences(
                sanitized_note,
                [],
                window=0,
                max_sentences=5,
            )
            if fallback_sentences:
                fallback = "\n".join(f"- {line}" for line in fallback_sentences)
                sections.append(f"Key note sentences:\n{fallback}")

        state_parts: List[str] = []
        for label, value in (
            ("noteId", _sanitize_text(note_id)),
            ("encounterId", _sanitize_text(encounter_id)),
            ("sessionId", _sanitize_text(session_id)),
        ):
            if value:
                state_parts.append(f"{label}={value}")

        note_hash = _short_hash(sanitized_note)
        if note_hash:
            state_parts.append(f"noteHash={note_hash}")
        previous_hash = _short_hash(sanitized_previous)
        if previous_hash:
            state_parts.append(f"previousHash={previous_hash}")
        if transcript_cursor:
            cursor = _sanitize_text(transcript_cursor)
            if cursor:
                state_parts.append(f"cursor={cursor}")
        if isinstance(accepted_json, Mapping):
            accepted_hash = _hash_json(accepted_json)
            if accepted_hash:
                state_parts.append(f"acceptedHash={accepted_hash}")

        if state_parts:
            sections.append("State summary: " + ", ".join(state_parts))

        if rules:
            rule_lines = [f"- {_sanitize_text(rule)}" for rule in rules if _sanitize_text(rule)]
            if rule_lines:
                sections.append("User rules:\n" + "\n".join(rule_lines))

        if accepted_json:
            accepted = _extract_items(
                accepted_json,
                ("accepted", "acceptedItems", "acceptedCodes"),
            )
            denied = _extract_items(
                accepted_json,
                ("denied", "rejected", "dismissed", "declined"),
            )
            disposition_lines: List[str] = []
            accepted_lines = _format_disposition_items(accepted)
            denied_lines = _format_disposition_items(denied)
            if accepted_lines:
                disposition_lines.append("Accepted:")
                disposition_lines.extend(accepted_lines)
            if denied_lines:
                if disposition_lines:
                    disposition_lines.append("Denied:")
                else:
                    disposition_lines.append("Denied:")
                disposition_lines.extend(denied_lines)
            if disposition_lines:
                sections.append("Suggestion disposition:\n" + "\n".join(disposition_lines))

        transcript_snippet = _sanitize_text(transcript)
        if transcript_snippet:
            if len(transcript_snippet) > 240:
                transcript_snippet = transcript_snippet[:240].rstrip() + "…"
            sections.append(f"Transcript snippet: {transcript_snippet}")

        pmh_text = _format_pmh_entries(pmh_entries)
        if pmh_text:
            sections.append("PMH highlights:\n" + pmh_text)

        guideline_text = self._format_guidelines(age, sex, region)
        if guideline_text:
            sections.append("Care guidelines to consider: " + guideline_text)

        if not sections and sanitized_previous:
            sections.append("Previous note reference: " + sanitized_previous[:200].rstrip())

        if not sections:
            sections.append("No recent changes supplied; use clinician instructions and defaults.")

        content = "\n\n".join(part for part in sections if part).strip()
        return {"role": "user", "content": content}

    def _format_guidelines(
        self,
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


