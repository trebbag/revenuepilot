"""Helper functions for public health guidelines.

This module fetches vaccination and screening guidelines from the CDC and
USPSTF. Results are cached in memory so repeated calls for the same inputs
do not trigger additional network requests.
"""
from functools import lru_cache
from typing import Dict, List, Tuple

from backend.egress import secure_get

CDC_VACCINES_URL = "https://www.cdc.gov/vaccines/schedules/schedule.json"
USPSTF_SCREENINGS_URL = "https://api.uspreventiveservicestaskforce.org/v1/recommendations"


@lru_cache(maxsize=2)
def _download(url: str) -> List[dict]:
    """Download JSON data from ``url`` and cache the result."""
    resp = secure_get(url)
    data = resp.json()
    if isinstance(data, dict) and "recommendations" in data:
        return data["recommendations"]  # type: ignore[return-value]
    if isinstance(data, list):
        return data
    return []


_guideline_cache: Dict[Tuple[int, str, str], Dict[str, List[str]]] = {}


def get_guidelines(age: int, sex: str, region: str) -> Dict[str, List[str]]:
    """Return vaccination and screening guidelines for the demographics.

    Args:
        age: Patient age in years.
        sex: Patient sex or gender.
        region: Geographic region or country code.
    Returns:
        A dictionary with ``vaccinations`` and ``screenings`` lists. Items are
        plain strings extracted from the source data.
    """
    key = (age, sex or "", region or "")
    if key in _guideline_cache:
        return _guideline_cache[key]

    vaccines_raw = _download(CDC_VACCINES_URL)
    screenings_raw = _download(USPSTF_SCREENINGS_URL)

    def _extract(items: List) -> List[str]:  # type: ignore[type-arg]
        results: List[str] = []
        for item in items:
            if isinstance(item, dict):
                text = item.get("text") or item.get("recommendation")
                if isinstance(text, str):
                    results.append(text)
            elif isinstance(item, str):
                results.append(item)
        return results

    data = {
        "vaccinations": _extract(vaccines_raw),
        "screenings": _extract(screenings_raw),
    }
    _guideline_cache[key] = data
    return data
