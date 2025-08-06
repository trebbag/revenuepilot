"""Tools for recommending follow-up intervals and calendar exports.

This module contains lightweight heuristics for deriving a follow-up interval
from clinical codes and diagnoses.  It also includes an ``export_ics`` utility
which creates a minimal ICS string for the recommended interval so the result
can be added to a calendar client.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Iterable, Optional, Sequence

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


def recommend_follow_up(
    codes: Sequence[str],
    diagnoses: Optional[Sequence[str]] = None,
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
) -> dict:
    """Return a follow-up interval and ICS string.

    The current implementation uses simple keyword and code-prefix heuristics
    to derive a recommended interval.  ``specialty`` and ``payer`` are accepted
    for future expansion but currently unused.
    """

    diag_text = " ".join(diagnoses or []).lower()
    codes = [c.upper() for c in codes if c]

    if _has_prefix(codes, CHRONIC_CODE_PREFIXES) or any(
        kw in diag_text for kw in CHRONIC_KEYWORDS
    ):
        interval = "3 months"
    elif _has_prefix(codes, ACUTE_CODE_PREFIXES) or any(
        kw in diag_text for kw in ACUTE_KEYWORDS
    ):
        interval = "2 weeks"
    else:
        interval = "4 weeks"

    return {"interval": interval, "ics": export_ics(interval)}


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
