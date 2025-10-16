"""Normalization helpers for decision support features.

This module owns the server-side validation and normalization of the
feature-centric payload returned by the differential generator. The goal is to
produce a compact, predictable structure that downstream DCSB (decision support
side bar) consumers can rely on without performing their own sanitisation.
"""

from __future__ import annotations

from collections import OrderedDict
from functools import lru_cache
import os
import re
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence, Tuple

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

_FEATURE_CACHE_CAPACITY = 256
_FEATURE_CACHE: "OrderedDict[Tuple[str, str], Features]" = OrderedDict()


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


def _coerce_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    text = str(value).strip()
    return text or None


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


def _ensure_iterable(value: Any) -> Iterable[Any]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set, frozenset)):
        return value
    return [value]


def _normalise_feature_payload(payload: Mapping[str, Any]) -> Features:
    return Features(
        pathognomonic=_normalise_string_list(_ensure_iterable(payload.get("pathognomonic"))),
        major=_normalise_string_list(_ensure_iterable(payload.get("major"))),
        minor=_normalise_string_list(_ensure_iterable(payload.get("minor"))),
        vitals=_normalise_quantified_list(_ensure_iterable(payload.get("vitals"))),
        labs=_normalise_quantified_list(_ensure_iterable(payload.get("labs"))),
        orders=_normalise_string_list(_ensure_iterable(payload.get("orders"))),
    )


def _cache_features(key: Optional[str], kb_version: Optional[str], features: Features) -> Features:
    if not key:
        return features
    cache_key = (key.strip().lower(), (kb_version or _DEFAULT_KB_VERSION).strip().lower())
    cached = _FEATURE_CACHE.get(cache_key)
    if cached is not None:
        _FEATURE_CACHE.move_to_end(cache_key)
        return cached
    snapshot = features.model_copy(deep=True)
    _FEATURE_CACHE[cache_key] = snapshot
    if len(_FEATURE_CACHE) > _FEATURE_CACHE_CAPACITY:
        _FEATURE_CACHE.popitem(last=False)
    return snapshot


def _iter_feature_entries(
    features_by_dx: Mapping[Any, Any] | Sequence[Any],
) -> Iterator[Tuple[Features, Dict[str, Any]]]:
    if isinstance(features_by_dx, Mapping):
        iterator = features_by_dx.items()
    elif isinstance(features_by_dx, Sequence):
        iterator = enumerate(features_by_dx)
    else:
        return

    for key, raw in iterator:
        dx_id: Optional[str] = None
        kb_version: Optional[str] = None
        plan_flag = False
        repetition_count = 0
        speaker_multiplier: Optional[float] = None
        expected_speaker: Optional[str] = None

        features: Optional[Features] = None

        if isinstance(raw, Features):
            features = raw
        elif isinstance(raw, DxWithFeatures):
            features = raw.features
            dx_id = raw.dx.id or raw.dx.name
        elif isinstance(raw, Mapping):
            dx_payload = raw.get("dx")
            if isinstance(dx_payload, DifferentialDx):
                dx_id = dx_payload.id or dx_payload.name
            elif isinstance(dx_payload, Mapping):
                dx_id = (
                    _coerce_string(dx_payload.get("id"))
                    or _coerce_string(dx_payload.get("dxId"))
                    or _coerce_string(dx_payload.get("name"))
                )
                kb_version = _coerce_string(dx_payload.get("kbVersion")) or kb_version
            elif isinstance(key, str):
                dx_id = _coerce_string(key)
            else:
                dx_id = _coerce_string(raw.get("id") or raw.get("dxId"))

            kb_version = (
                _coerce_string(raw.get("kbVersion"))
                or _coerce_string(raw.get("kb_version"))
                or kb_version
            )

            feature_payload = raw.get("features")
            if isinstance(feature_payload, Features):
                features = feature_payload
            elif isinstance(feature_payload, Mapping):
                features = _normalise_feature_payload(feature_payload)
            else:
                features = _normalise_feature_payload(raw)

            plan_flag = bool(
                raw.get("plan")
                or raw.get("isPlan")
                or raw.get("planSection")
            )
            section = raw.get("section") or raw.get("sectionName")
            if isinstance(section, str) and section.strip().lower() in {"plan", "assessment/plan", "assessment and plan", "a/p"}:
                plan_flag = True

            repetition_value = raw.get("repetitions") or raw.get("repetition") or raw.get("repeat")
            if isinstance(repetition_value, bool):
                repetition_count = 1 if repetition_value else 0
            elif isinstance(repetition_value, (int, float)):
                repetition_count = max(0, int(repetition_value))
            elif isinstance(repetition_value, str):
                try:
                    repetition_count = max(0, int(float(repetition_value.strip())))
                except ValueError:
                    repetition_count = 1

            expected_speaker_value = raw.get("speaker") or raw.get("speakerRole") or raw.get("speaker_role")
            if isinstance(expected_speaker_value, str):
                expected_speaker = expected_speaker_value.strip().lower()

            speaker_multiplier_value = raw.get("speakerMultiplier") or raw.get("speaker_multiplier")
            if isinstance(speaker_multiplier_value, (int, float)):
                speaker_multiplier = float(speaker_multiplier_value)
            elif isinstance(speaker_multiplier_value, str):
                try:
                    speaker_multiplier = float(speaker_multiplier_value.strip())
                except ValueError:
                    speaker_multiplier = None
        else:
            continue

        if features is None:
            continue

        kb_version = kb_version or _DEFAULT_KB_VERSION
        cached = _cache_features(dx_id, kb_version, features)
        metadata = {
            "plan": bool(plan_flag),
            "repetitions": max(0, repetition_count),
        }
        if expected_speaker:
            metadata["expected_speaker"] = expected_speaker
        if speaker_multiplier is not None:
            metadata["speaker_multiplier"] = speaker_multiplier
        yield cached, metadata


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


def _match_terms(text: str, terms: Sequence[str]) -> set[str]:
    matches: set[str] = set()
    for term in terms:
        candidate = term.strip()
        if not candidate:
            continue
        lowered = candidate.lower()
        if lowered and lowered in text:
            matches.add(lowered)
    return matches


def compute_dcb(
    segment_text: str,
    speaker: Optional[str],
    features_by_dx: Mapping[Any, Any] | Sequence[Any],
) -> float:
    """Return the disease concordance boost for ``segment_text``.

    ``features_by_dx`` may be a mapping keyed by diagnosis identifiers or a
    sequence of feature payloads.  Each payload can be either a ``Features``
    instance, :class:`DxWithFeatures` or a plain mapping with a ``features``
    key matching the schema produced by :func:`normalise_features`.
    """

    if not segment_text or not features_by_dx:
        return 0.0

    normalized_text = _normalize_text(segment_text)
    if not normalized_text:
        return 0.0

    speaker_normalized = str(speaker or "").strip().lower()
    best_score = 0.0

    for features, metadata in _iter_feature_entries(features_by_dx):
        # Copy the lists defensively; cached entries should not be mutated.
        path_terms = list(features.pathognomonic)
        major_terms = list(features.major)
        minor_terms = list(features.minor)

        matches: set[str] = set()
        path_hits = _match_terms(normalized_text, path_terms)
        major_hits = _match_terms(normalized_text, major_terms)
        minor_hits = _match_terms(normalized_text, minor_terms)
        matches.update(path_hits)
        matches.update(major_hits)
        matches.update(minor_hits)

        base = (
            len(path_hits) * 1.0
            + len(major_hits) * 0.6
            + len(minor_hits) * 0.3
        )

        plan_bonus = 0.3 if metadata.get("plan") else 0.0
        repetition_bonus = 0.4 if metadata.get("repetitions") else 0.0

        if base <= 0.0 and not (plan_bonus or repetition_bonus):
            continue

        match_count = len(matches)
        synergy = 1.0
        if match_count:
            synergy = min(1.6, 1.0 + 0.2 * (match_count - 1))

        score = base * synergy

        expected_speaker = metadata.get("expected_speaker")
        multiplier_override = metadata.get("speaker_multiplier")

        speaker_multiplier = 1.0
        if speaker_normalized:
            if expected_speaker and speaker_normalized != expected_speaker:
                speaker_multiplier = 1.0
            elif speaker_normalized == "clinician":
                speaker_multiplier = multiplier_override or 1.3
            else:
                speaker_multiplier = multiplier_override or 1.0
        score *= speaker_multiplier

        score += plan_bonus
        if repetition_bonus:
            score += repetition_bonus

        best_score = max(best_score, score)

    return float(round(best_score, 6))

