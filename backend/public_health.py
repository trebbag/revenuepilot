"""Public health recommendation helpers.

This module provides thin wrappers around external public health APIs to
retrieve preventative care recommendations.  Two separate endpoints are
consulted – one for vaccinations and another for screenings.  Each helper
returns a list of recommendation strings and gracefully falls back to an
empty list if anything goes wrong.  Environment variables allow the API
endpoints to be overridden during deployment or tests.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from .guidelines import get_guidelines


# ---------------------------------------------------------------------------
# Environment configuration
# ---------------------------------------------------------------------------
# Load variables from a local `.env` file if present so deployments can override
# the default API endpoints without exporting variables globally.  This keeps
# configuration simple for clinicians running the app locally.
_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
if _ENV_PATH.exists():  # pragma: no cover - simple environment loading
    for line in _ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip())


def _to_strings(items: object, region: str) -> List[str]:
    """Normalise guideline entries into plain strings filtered by region."""

    results: List[str] = []
    if not isinstance(items, list):
        return results

    for item in items:
        if isinstance(item, dict):
            # Some APIs provide `region` or `regions` fields.  If present, only
            # include the recommendation when the user's region matches.
            regions = item.get("regions") or item.get("region")
            if regions:
                if isinstance(regions, str):
                    regions = [regions]
                if region not in regions:
                    continue
            text = (
                item.get("recommendation")
                or item.get("text")
                or item.get("name")
                or item.get("title")
            )
            if isinstance(text, str):
                results.append(text)
        else:
            results.append(str(item))
    return results


@lru_cache(maxsize=128)
def fetch_vaccination_recommendations(
    age: Optional[int], sex: Optional[str], region: Optional[str]
) -> List[str]:
    """Return vaccination recommendations for the supplied demographics."""

    if age is None or not sex or not region:
        return []
    try:
        data = get_guidelines(age, sex, region)
        return _to_strings(data.get("vaccinations"), region)
    except Exception as exc:  # pragma: no cover - best effort logging
        print(f"Vaccination API error: {exc}")
        return []


@lru_cache(maxsize=128)
def fetch_screening_recommendations(
    age: Optional[int], sex: Optional[str], region: Optional[str]
) -> List[str]:
    """Return screening recommendations for the supplied demographics."""

    if age is None or not sex or not region:
        return []
    try:
        data = get_guidelines(age, sex, region)
        return _to_strings(data.get("screenings"), region)
    except Exception as exc:  # pragma: no cover - best effort logging
        print(f"Screening API error: {exc}")
        return []


def get_public_health_suggestions(
    age: Optional[int], sex: Optional[str], region: Optional[str]
) -> List[str]:
    """Return combined vaccination and screening recommendations."""

    vaccs = fetch_vaccination_recommendations(age, sex, region)
    screens = fetch_screening_recommendations(age, sex, region)
    # Use ``dict.fromkeys`` to remove duplicates while preserving order.
    return list(dict.fromkeys(vaccs + screens))


def clear_cache() -> None:
    """Clear cached API responses (useful for tests)."""

    fetch_vaccination_recommendations.cache_clear()
    fetch_screening_recommendations.cache_clear()


__all__ = [
    "fetch_vaccination_recommendations",
    "fetch_screening_recommendations",
    "get_public_health_suggestions",
    "clear_cache",
]

