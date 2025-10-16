"""Normalization helpers for decision support features.

This module owns the server-side validation and normalization of the
feature-centric payload returned by the differential generator. The goal is to
produce a compact, predictable structure that downstream DCSB (decision support
side bar) consumers can rely on without performing their own sanitisation.
"""

from __future__ import annotations

from functools import lru_cache
import os
import re
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from pydantic import BaseModel, Field, field_validator

from backend.security import DEID_POLICY
from backend.sanitizer import sanitize_text


_DEFAULT_KB_VERSION = os.getenv("DCSB_KB_VERSION", "2024.1")

_TEXT_SYNONYMS: Dict[str, Sequence[str]] = {
    "shortness of breath": ("sob", "dyspnea", "shortness of breath"),
    "tachycardia": ("fast heart rate", "tachycardia"),
    "tachypnea": ("fast breathing", "tachypnea"),
    "hypotension": ("low blood pressure", "hypotension"),
    "pulmonary embolism": ("pe", "pulmonary embolism"),
    "acute coronary syndrome": ("acs", "acute coronary syndrome"),
    "ischemic stroke": ("cva", "stroke", "ischemic stroke"),
    "sepsis": ("septic", "sepsis"),
}


_DX_OVERRIDES: Dict[str, Dict[str, Sequence[Any]]] = {
    "acute coronary syndrome": {
        "major": (
            "chest pain",
            "troponin elevation",
            "ischemic ecg changes",
        ),
        "labs": (
            {"name": "troponin", "operator": ">", "value": "99th percentile"},
        ),
    },
    "pulmonary embolism": {
        "major": (
            "sudden dyspnea",
            "pleuritic chest pain",
        ),
        "labs": (
            {"name": "d-dimer", "operator": ">", "value": "500", "unit": "ng/mL"},
        ),
        "orders": ("ct pulmonary angiography",),
    },
    "ischemic stroke": {
        "pathognomonic": ("focal neurologic deficit",),
        "orders": ("non-contrast head ct",),
    },
    "sepsis": {
        "major": (
            "suspected infection",
            "organ dysfunction",
        ),
        "vitals": (
            {"name": "temperature", "operator": ">", "value": "38", "unit": "c"},
            {"name": "temperature", "operator": "<", "value": "36", "unit": "c"},
        ),
        "labs": (
            {"name": "lactate", "operator": ">=", "value": "2", "unit": "mmol/L"},
        ),
    },
}

_ALLOWED_OPERATORS = {"<", "<=", ">", ">=", "=", "≈"}
_UNIT_PATTERN = re.compile(r"^[A-Za-z0-9/%°\[\]\s\-\.]+$")


def _normalize_text(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    sanitized = sanitize_text(text)
    return sanitized.lower()


def _canonicalise(value: str) -> str:
    lower = value.lower()
    for canonical, variants in _TEXT_SYNONYMS.items():
        if lower == canonical:
            return canonical
        if lower in variants:
            return canonical
    return lower


def _dedupe_preserve_order(values: Iterable[str]) -> List[str]:
    seen: set[str] = set()
    result: List[str] = []
    for value in values:
        if not value:
            continue
        canonical = _canonicalise(value)
        if canonical in seen:
            continue
        seen.add(canonical)
        result.append(canonical)
    return result


def _normalise_operator(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text in _ALLOWED_OPERATORS:
        return text
    return None


def _normalise_unit(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if not _UNIT_PATTERN.match(text):
        return None
    return text.lower()


class QuantifiedFeature(BaseModel):
    name: str
    operator: Optional[str] = None
    value: Optional[str] = None
    unit: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str) -> str:  # noqa: D401,N805
        normalised = _normalize_text(value)
        if not normalised:
            raise ValueError("feature name is required")
        return _canonicalise(normalised)

    @field_validator("operator")
    @classmethod
    def _clean_operator(cls, value: Optional[str]) -> Optional[str]:  # noqa: D401,N805
        return _normalise_operator(value)

    @field_validator("value")
    @classmethod
    def _clean_value(cls, value: Optional[Any]) -> Optional[str]:  # noqa: D401,N805
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        return _normalize_text(text)

    @field_validator("unit")
    @classmethod
    def _clean_unit(cls, value: Optional[Any]) -> Optional[str]:  # noqa: D401,N805
        return _normalise_unit(value)

    def as_tuple(self) -> Tuple[str, Optional[str], Optional[str], Optional[str]]:
        return self.name, self.operator, self.value, self.unit


class Features(BaseModel):
    pathognomonic: List[str] = Field(default_factory=list)
    major: List[str] = Field(default_factory=list)
    minor: List[str] = Field(default_factory=list)
    vitals: List[QuantifiedFeature] = Field(default_factory=list)
    labs: List[QuantifiedFeature] = Field(default_factory=list)
    orders: List[str] = Field(default_factory=list)

    model_config = {
        "arbitrary_types_allowed": True,
    }

    def merge(self, other: "Features") -> "Features":
        return Features(
            pathognomonic=_dedupe_preserve_order(self.pathognomonic + other.pathognomonic),
            major=_dedupe_preserve_order(self.major + other.major),
            minor=_dedupe_preserve_order(self.minor + other.minor),
            vitals=_dedupe_quantified(self.vitals + other.vitals),
            labs=_dedupe_quantified(self.labs + other.labs),
            orders=_dedupe_preserve_order(self.orders + other.orders),
        )

    def clamp_tokens(self, limit: int = 600) -> "Features":
        buckets: List[Tuple[str, Any]] = []
        for label, payload in (
            ("pathognomonic", self.pathognomonic),
            ("major", self.major),
            ("minor", self.minor),
            ("vitals", self.vitals),
            ("labs", self.labs),
            ("orders", self.orders),
        ):
            buckets.append((label, list(payload)))

        remaining = limit
        trimmed: Dict[str, List[Any]] = {
            "pathognomonic": [],
            "major": [],
            "minor": [],
            "vitals": [],
            "labs": [],
            "orders": [],
        }

        for label, items in buckets:
            for item in items:
                tokens = _estimate_tokens(item)
                if tokens > remaining and trimmed[label]:
                    continue
                if tokens > remaining:
                    break
                remaining -= tokens
                trimmed[label].append(item)

        return Features(**trimmed)


def _dedupe_quantified(values: Iterable[QuantifiedFeature]) -> List[QuantifiedFeature]:
    seen: set[Tuple[str, Optional[str], Optional[str], Optional[str]]] = set()
    result: List[QuantifiedFeature] = []
    for item in values:
        fingerprint = item.as_tuple()
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        result.append(item)
    return result


def _estimate_tokens(value: Any) -> int:
    if isinstance(value, QuantifiedFeature):
        pieces = [value.name]
        if value.operator:
            pieces.append(value.operator)
        if value.value:
            pieces.append(value.value)
        if value.unit:
            pieces.append(value.unit)
        return max(1, sum(len(piece.split()) or 1 for piece in pieces))
    if isinstance(value, str):
        return max(1, len(value.split()) or 1)
    return 1


class DifferentialDx(BaseModel):
    id: Optional[str] = None
    icdCode: Optional[str] = Field(None, alias="icdCode")
    name: str
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str) -> str:  # noqa: D401,N805
        text = str(value or "").strip()
        if not text:
            raise ValueError("diagnosis name is required")
        cleaned = sanitize_text(text)
        return cleaned


class DxWithFeatures(BaseModel):
    dx: DifferentialDx
    features: Features = Field(default_factory=Features)


def _coerce_quantified(raw: Any) -> Optional[QuantifiedFeature]:
    if isinstance(raw, QuantifiedFeature):
        return raw
    if isinstance(raw, str):
        normalised = _normalize_text(raw)
        if not normalised:
            return None
        return QuantifiedFeature(name=normalised)
    if isinstance(raw, Mapping):
        candidate = {
            "name": raw.get("name") or raw.get("label") or raw.get("test"),
            "operator": raw.get("operator"),
            "value": raw.get("value"),
            "unit": raw.get("unit"),
        }
        if candidate["name"] is None:
            return None
        return QuantifiedFeature(**candidate)
    return None


def _normalise_quantified_list(values: Iterable[Any]) -> List[QuantifiedFeature]:
    cleaned: List[QuantifiedFeature] = []
    for raw in values:
        try:
            item = _coerce_quantified(raw)
        except ValueError:
            continue
        if item is None:
            continue
        cleaned.append(item)
    return _dedupe_quantified(cleaned)


def _normalise_string_list(values: Iterable[Any]) -> List[str]:
    cleaned = [_normalize_text(value) for value in values]
    return _dedupe_preserve_order(cleaned)


@lru_cache(maxsize=256)
def _cached_overrides(dx_key: str, kb_version: str) -> Features:
    overrides = _DX_OVERRIDES.get(dx_key) or {}
    return _apply_override_payload(overrides)


def _apply_override_payload(payload: Mapping[str, Sequence[Any]]) -> Features:
    def _pluck(key: str) -> Sequence[Any]:
        return payload.get(key, ())

    return Features(
        pathognomonic=_normalise_string_list(_pluck("pathognomonic")),
        major=_normalise_string_list(_pluck("major")),
        minor=_normalise_string_list(_pluck("minor")),
        vitals=_normalise_quantified_list(_pluck("vitals")),
        labs=_normalise_quantified_list(_pluck("labs")),
        orders=_normalise_string_list(_pluck("orders")),
    )


def normalise_features(
    dx: DifferentialDx,
    raw_features: Mapping[str, Any] | None,
    kb_version: Optional[str] = None,
) -> Features:
    """Validate, normalise and clamp the feature payload for a diagnosis."""

    kb = kb_version or _DEFAULT_KB_VERSION
    base = Features()
    for candidate in (
        dx.id,
        dx.icdCode,
        dx.name,
    ):
        if not candidate:
            continue
        base = base.merge(_cached_overrides(candidate.strip().lower(), kb))

    if not raw_features:
        return base.clamp_tokens()

    def _coerce(key: str) -> Iterable[Any]:
        value = raw_features.get(key)
        if value is None:
            return []
        if isinstance(value, str):
            return [value]
        if isinstance(value, Iterable):
            return value
        return []

    merged = base.merge(
        Features(
            pathognomonic=_normalise_string_list(_coerce("pathognomonic")),
            major=_normalise_string_list(_coerce("major")),
            minor=_normalise_string_list(_coerce("minor")),
            vitals=_normalise_quantified_list(_coerce("vitals")),
            labs=_normalise_quantified_list(_coerce("labs")),
            orders=_normalise_string_list(_coerce("orders")),
        )
    )
    return merged.clamp_tokens()

