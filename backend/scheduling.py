"""Simple heuristics for recommending follow-up intervals.

This module defines a small rules engine that inspects the clinical note
content and associated billing codes to recommend a follow-up interval.
The function is intentionally lightweight so it can run even when the LLM
suggestion pipeline fails.
"""
from __future__ import annotations

from typing import Iterable, Optional

CHRONIC_KEYWORDS = {
    "chronic",
    "diabetes",
    "hypertension",
    "asthma",
}
CHRONIC_CODE_PREFIXES = {"E11", "I10", "J45"}

ACUTE_KEYWORDS = {"sprain", "acute", "infection", "injury"}
ACUTE_CODE_PREFIXES = {"S93", "J06"}


def _has_prefix(codes: Iterable[str], prefixes: Iterable[str]) -> bool:
    prefixes = tuple(prefixes)
    return any(str(code).upper().startswith(prefixes) for code in codes)


def recommend_follow_up(note: str, codes: Iterable[str]) -> Optional[str]:
    """Return a human-readable follow-up interval if heuristics match.

    Parameters
    ----------
    note:
        Raw clinical note text.
    codes:
        Iterable of code strings extracted from the note.

    Returns
    -------
    Optional[str]
        A string describing the recommended follow-up interval (e.g.,
        ``"3 months"``) or ``None`` if no rule applies.
    """
    lower = note.lower() if note else ""
    codes = [c.upper() for c in codes if c]

    if _has_prefix(codes, CHRONIC_CODE_PREFIXES) or any(
        kw in lower for kw in CHRONIC_KEYWORDS
    ):
        return "3 months"

    if _has_prefix(codes, ACUTE_CODE_PREFIXES) or any(
        kw in lower for kw in ACUTE_KEYWORDS
    ):
        return "2 weeks"

    return None
