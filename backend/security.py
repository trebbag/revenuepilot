"""Security helpers for prompt scrubbing, logging redaction and hashing."""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Any, Iterable, List, Mapping, Optional

from prometheus_client import Counter

from backend.deid import deidentify


PROMPT_REDACTIONS_TOTAL = Counter(
    "revenuepilot_prompt_redactions_total",
    "Number of prompts scrubbed before AI dispatch",
    ("profile", "mode"),
)

PROMPT_REDACTIONS_SKIPPED = Counter(
    "revenuepilot_prompt_redactions_skipped_total",
    "Prompts bypassing the scrubber due to configuration",
    ("profile",),
)


def hash_identifier(value: Optional[str]) -> Optional[str]:
    """Return a stable SHA256 hash prefix for identifiers."""

    if not value:
        return None
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return digest[:16]


def redact_value(value: Any) -> Any:
    """Redact string values using :func:`deidentify` recursively."""

    if isinstance(value, str):
        return deidentify(value)
    if isinstance(value, Mapping):
        return {key: redact_value(sub_value) for key, sub_value in value.items()}
    if isinstance(value, Iterable) and not isinstance(value, (bytes, bytearray)):
        return [redact_value(item) for item in value]
    return value


@dataclass(frozen=True)
class PromptProfile:
    include_chart: bool = True
    include_audio: bool = True
    include_rules: bool = False
    allow_demographics: bool = False


@dataclass(frozen=True)
class PromptContext:
    text: str
    rules: Optional[List[str]]
    age: Optional[int]
    sex: Optional[str]
    region: Optional[str]


class PromptPrivacyGuard:
    """Utility that enforces per-prompt scrubbing policies."""

    def __init__(self) -> None:
        mode = os.getenv("PROMPT_SCRUBBING", "minimum").strip().lower()
        self._mode = "minimum" if mode not in {"off", "disabled"} else "off"
        self._profiles = {
            "beautify": PromptProfile(include_chart=False, include_audio=False, include_rules=False, allow_demographics=False),
            "summary": PromptProfile(include_chart=True, include_audio=True, include_rules=False, allow_demographics=True),
            "suggest": PromptProfile(include_chart=True, include_audio=True, include_rules=True, allow_demographics=True),
        }

    @property
    def enabled(self) -> bool:
        return self._mode != "off"

    @property
    def mode(self) -> str:
        return self._mode

    def profile(self, name: str) -> PromptProfile:
        return self._profiles.get(name, PromptProfile())

    def prepare(self, name: str, request: Any) -> PromptContext:
        profile = self.profile(name)
        mode = self.mode
        if not self.enabled:
            PROMPT_REDACTIONS_SKIPPED.labels(profile=name).inc()
            return self._legacy_prepare(request)

        PROMPT_REDACTIONS_TOTAL.labels(profile=name, mode=mode).inc()
        parts: List[str] = []
        if getattr(request, "text", None):
            parts.append(str(request.text))
        if profile.include_chart and getattr(request, "chart", None):
            parts.append(str(request.chart))
        if profile.include_audio and getattr(request, "audio", None):
            parts.append(str(request.audio))
        sanitized = [deidentify(p) for p in parts if p]
        combined = "\n\n".join(sanitized)

        rules: Optional[List[str]] = None
        if profile.include_rules and getattr(request, "rules", None):
            rules = [deidentify(r) for r in request.rules if isinstance(r, str) and r]
            if not rules:
                rules = None

        age = request.age if profile.allow_demographics else None
        sex = request.sex if profile.allow_demographics else None
        region = request.region if profile.allow_demographics else None
        return PromptContext(text=combined, rules=rules, age=age, sex=sex, region=region)

    def _legacy_prepare(self, request: Any) -> PromptContext:
        parts: List[str] = []
        if getattr(request, "text", None):
            parts.append(str(request.text))
        if getattr(request, "chart", None):
            parts.append(str(request.chart))
        if getattr(request, "audio", None):
            parts.append(str(request.audio))
        combined = "\n\n".join(parts)
        cleaned = deidentify(combined)
        rules = [deidentify(r) for r in getattr(request, "rules", []) if isinstance(r, str) and r]
        if not rules:
            rules = None
        return PromptContext(
            text=cleaned,
            rules=rules,
            age=getattr(request, "age", None),
            sex=getattr(request, "sex", None),
            region=getattr(request, "region", None),
        )


__all__ = [
    "PromptContext",
    "PromptPrivacyGuard",
    "hash_identifier",
    "redact_value",
    "PROMPT_REDACTIONS_TOTAL",
    "PROMPT_REDACTIONS_SKIPPED",
]

