"""Retrieve public health guidelines from external agencies.

This module provides a small abstraction over various public health
guideline APIs (e.g. CDC and WHO).  Results are cached in memory with a
time‑to‑live so repeated requests do not hit the network on every call.
Each guideline item contains the original ``source`` agency and an
``evidenceLevel`` when available.

The functions are intentionally lightweight.  In tests the network layer
is monkey‑patched so the module behaves deterministically without making
real HTTP calls.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Dict, List, Optional, Tuple

from backend.egress import secure_get

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Public API endpoints.  These can be overridden via environment variables to
# facilitate mocking in tests or pointing to mirrors.
CDC_URL = os.getenv(
    "CDC_GUIDELINES_URL",
    "https://www.cdc.gov/vaccines/schedules/schedule.json",
)
WHO_URL = os.getenv(
    "WHO_GUIDELINES_URL",
    "https://www.who.int/data/gho/info/athena-api",
)

# Cache time‑to‑live in seconds (default: 1 day)
CACHE_TTL = int(os.getenv("GUIDELINE_CACHE_TTL", 24 * 60 * 60))

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_cache: Dict[Tuple[int, str, str, Tuple[str, ...]], Tuple[float, List[Dict]]] = {}


def _now() -> float:
    """Return the current time.  Wrapped for easy monkeypatching in tests."""

    return time.time()


def _download_json(url: str) -> Dict:
    """Best‑effort JSON downloader returning an empty dict on error."""

    resp = secure_get(url)
    try:
        return resp.json()
    except Exception:
        # Some WHO endpoints return text rather than JSON.  Attempt to parse
        # line‑delimited JSON if possible.
        try:
            return json.loads(resp.text)
        except Exception:
            return {}


def _resolve_region_url(base: str, region: str) -> str:
    """Return a region-specific endpoint from ``base`` if encoded.

    ``base`` may be a plain URL or a mapping of region codes to URLs.  The
    mapping format accepts either JSON (e.g. ``{"US": "https://..."}``) or a
    semicolon-delimited list of ``region:url`` pairs (e.g.
    ``"US:https://...;EU:https://..."``).  If ``region`` is not found the
    original ``base`` value is returned.
    """

    region_key = region.upper()
    # Try JSON format first
    try:
        data = json.loads(base)
        if isinstance(data, dict):
            url = data.get(region_key)
            if isinstance(url, str):
                return url
    except Exception:
        pass

    # Fallback to simple ``REGION:url`` pairs separated by semicolons
    mapping = {}
    for part in base.split(";"):
        part = part.strip()
        if ":" not in part:
            continue
        reg, url = part.split(":", 1)
        mapping[reg.strip().upper()] = url.strip()

    return mapping.get(region_key, base)


def _fetch_cdc(age: int, sex: str, region: str) -> List[Dict[str, str]]:
    """Fetch recommendations from the CDC."""
    url = _resolve_region_url(CDC_URL, region)
    data = _download_json(url)
    items: List[Dict[str, str]] = []
    # The CDC schedule endpoint returns a nested JSON document.  The exact
    # structure is subject to change; we extract any ``text`` fields as
    # recommendations for demonstration purposes.
    recs = data.get("recommendations") or data.get("schedule", [])
    if isinstance(recs, list):
        for entry in recs:
            if isinstance(entry, dict):
                text = (
                    entry.get("recommendation")
                    or entry.get("text")
                    or entry.get("name")
                )
                if isinstance(text, str):
                    items.append(
                        {
                            "recommendation": text,
                            "source": "CDC",
                            "evidenceLevel": entry.get("grade")
                            or entry.get("evidenceLevel"),
                        }
                    )
    return items


def _fetch_who(age: int, sex: str, region: str) -> List[Dict[str, str]]:
    """Fetch recommendations from the WHO."""
    url = _resolve_region_url(WHO_URL, region)
    data = _download_json(url)
    items: List[Dict[str, str]] = []
    recs = data.get("recommendations") or data.get("value") or []
    if isinstance(recs, list):
        for entry in recs:
            if isinstance(entry, dict):
                text = (
                    entry.get("recommendation")
                    or entry.get("text")
                    or entry.get("title")
                )
                if isinstance(text, str):
                    items.append(
                        {
                            "recommendation": text,
                            "source": "WHO",
                            "evidenceLevel": entry.get("grade")
                            or entry.get("evidenceLevel"),
                        }
                    )
    return items


_AGENCY_FETCHERS = {
    "cdc": _fetch_cdc,
    "who": _fetch_who,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_public_health_suggestions(
    age: Optional[int],
    sex: Optional[str],
    region: Optional[str],
    agencies: Optional[List[str]] = None,
) -> List[Dict[str, str]]:
    """Return public health guidelines for the given demographics.

    Parameters
    ----------
    age, sex, region:
        Patient demographics used to query guideline APIs.  If any are
        missing, an empty list is returned.
    agencies:
        Optional list of agencies to consult (e.g. ``["cdc", "who"]``).

    Returns
    -------
    List[Dict[str, str]]
        Guideline entries with ``recommendation``, ``source`` and optional
        ``evidenceLevel`` keys.
    """

    if age is None or not sex or not region:
        return []

    if not agencies:
        agencies = list(_AGENCY_FETCHERS.keys())

    key = (age, sex, region, tuple(sorted(a.lower() for a in agencies)))
    now = _now()
    cached = _cache.get(key)
    if cached and now - cached[0] < CACHE_TTL:
        return cached[1]

    results: List[Dict[str, str]] = []
    for agency in agencies:
        fetcher = _AGENCY_FETCHERS.get(agency.lower())
        if not fetcher:
            continue
        try:
            results.extend(fetcher(age, sex, region))
        except Exception as exc:  # pragma: no cover - network errors
            logging.warning("Guideline fetch failed for %s: %s", agency, exc)

    _cache[key] = (now, results)
    return results


def clear_cache() -> None:
    """Clear cached guideline responses."""

    _cache.clear()


__all__ = ["get_public_health_suggestions", "clear_cache", "CACHE_TTL"]

