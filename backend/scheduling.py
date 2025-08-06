"""Tools for recommending follow-up intervals and calendar exports.

This module exposes lightweight heuristics plus an LLM-backed helper for
deriving a follow-up interval from the clinical note and associated billing
codes.  It also includes an ``export_ics`` utility which creates a minimal
ICS string for the recommended interval so the result can be added to a
calendar client.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Iterable, Optional

from .openai_client import call_openai

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


def _heuristic_follow_up(note: str, codes: Iterable[str]) -> Optional[str]:
    """Return a follow-up interval using simple keyword rules."""
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


def recommend_follow_up(
    note: str, codes: Iterable[str], use_llm: bool = True
) -> Optional[str]:
    """Return a human-readable follow-up interval.

    The function first attempts to use the OpenAI API to derive a follow-up
    recommendation.  If the call fails or no interval can be parsed from the
    LLM response, a small heuristic rule set is used as a fallback.
    """
    if use_llm:
        try:
            messages = [
                {
                    "role": "user",
                    "content": (
                        "Given the following clinical note and codes, provide a "
                        "concise follow-up interval such as '2 weeks' or '3 months'.\n"
                        f"Note: {note}\nCodes: {', '.join(codes)}"
                    ),
                }
            ]
            reply = call_openai(messages)
            match = re.search(r"(\d+\s*(?:day|week|month|year)s?)", reply, re.I)
            if match:
                return match.group(1).lower()
        except Exception:
            pass

    return _heuristic_follow_up(note, codes)


def export_ics(interval: str, summary: str = "Follow-up appointment") -> Optional[str]:
    """Return an ICS string for the provided interval.

    Parameters
    ----------
    interval:
        Textual interval such as ``"2 weeks"``.
    summary:
        Event summary to place in the ICS file.
    """
    match = re.match(r"(\d+)\s*(day|week|month|year)s?", interval or "", re.I)
    if not match:
        return None

    value = int(match.group(1))
    unit = match.group(2).lower()
    now = datetime.utcnow()
    if unit.startswith("day"):
        dt = now + timedelta(days=value)
    elif unit.startswith("week"):
        dt = now + timedelta(weeks=value)
    elif unit.startswith("month"):
        # naive month handling
        month = now.month - 1 + value
        year = now.year + month // 12
        month = month % 12 + 1
        day = min(now.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
        dt = now.replace(year=year, month=month, day=day)
    else:  # year
        try:
            dt = now.replace(year=now.year + value)
        except ValueError:
            dt = now + timedelta(days=365 * value)

    fmt = dt.strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        f"SUMMARY:{summary}",
        f"DTSTART:{fmt}",
        f"DTEND:{fmt}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\n".join(lines)
