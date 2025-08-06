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
from typing import List, Optional

import requests

# Base URLs for the external services.  These are intentionally configurable so
# tests can monkeypatch them and real deployments can point to trusted sources.
VACCINATION_API_URL = os.getenv(
    "VACCINATION_API_URL", "https://public-health.example.com/vaccinations"
)
SCREENING_API_URL = os.getenv(
    "SCREENING_API_URL", "https://public-health.example.com/screenings"
)


def _extract_items(data: object, key: str) -> List[str]:
    """Return list of strings from ``data`` using a best‑effort strategy."""

    items: List[str] = []
    if isinstance(data, dict):
        raw = (
            data.get(key)
            or data.get("recommendations")
            or data.get("suggestions")
            or data.get("results")
            or data.get("data")
        )
        if isinstance(raw, list):
            items = raw
    elif isinstance(data, list):
        items = data
    return [str(x) for x in items]


def fetch_vaccination_recommendations(
    age: Optional[int], sex: Optional[str], region: Optional[str]
) -> List[str]:
    """Return vaccination recommendations for the supplied demographics."""

    if age is None or not sex or not region:
        return []
    params = {"age": age, "sex": sex, "region": region}
    try:
        resp = requests.get(VACCINATION_API_URL, params=params, timeout=10)
        resp.raise_for_status()
        return _extract_items(resp.json(), "vaccinations")
    except Exception as exc:  # pragma: no cover - best effort logging
        print(f"Vaccination API error: {exc}")
        return []


def fetch_screening_recommendations(
    age: Optional[int], sex: Optional[str], region: Optional[str]
) -> List[str]:
    """Return screening recommendations for the supplied demographics."""

    if age is None or not sex or not region:
        return []
    params = {"age": age, "sex": sex, "region": region}
    try:
        resp = requests.get(SCREENING_API_URL, params=params, timeout=10)
        resp.raise_for_status()
        return _extract_items(resp.json(), "screenings")
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


__all__ = [
    "fetch_vaccination_recommendations",
    "fetch_screening_recommendations",
    "get_public_health_suggestions",
]

