"""Fetch public health guidelines based on demographics.

This module retrieves public health recommendations from an external API
according to patient age, sex and region.  The API base URL can be
configured via the ``PUBLIC_HEALTH_API_URL`` environment variable.  The
function returns a list of plain string suggestions.  Network failures or
unexpected responses result in an empty list so callers can fail gracefully.
"""
from __future__ import annotations

import os
from typing import List, Optional

import requests

BASE_URL = os.getenv("PUBLIC_HEALTH_API_URL", "https://public-health.example.com/guidelines")


def get_public_health_suggestions(age: Optional[int], sex: Optional[str], region: Optional[str]) -> List[str]:
    """Return public health suggestions for the given demographics.

    Args:
        age: Patient age in years.
        sex: Patient sex or gender.
        region: Geographic region or country code.
    Returns:
        A list of recommendation strings.  Returns an empty list on error or
        when insufficient demographics are provided.
    """
    if age is None or not sex or not region:
        return []
    params = {"age": age, "sex": sex, "region": region}
    try:
        resp = requests.get(BASE_URL, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        # The API is expected to return a JSON object with a ``suggestions``
        # field containing a list of strings.  If the structure differs,
        # fallback to an empty list.
        items = []
        if isinstance(data, dict):
            raw = data.get("suggestions") or data.get("data") or data.get("results")
            if isinstance(raw, list):
                items = raw
        elif isinstance(data, list):
            items = data
        return [str(x) for x in items]
    except Exception as exc:  # pragma: no cover - best effort logging
        # Print error so it surfaces in logs but don't crash the caller.
        print(f"Public health API error: {exc}")
        return []
