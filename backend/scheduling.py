"""Tools for recommending follow-up intervals and calendar exports.

This module contains lightweight heuristics for deriving a follow-up interval
from clinical codes and diagnoses.  It also includes an ``export_ics`` utility
which creates a minimal ICS string for the recommended interval so the result
can be added to a calendar client.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Iterable, Mapping, Optional, Sequence


# Default intervals for broad condition categories.  These are defined as
# constants so they can be reused when configuring or overriding mappings.
DEFAULT_CHRONIC_INTERVAL = "3 months"
DEFAULT_ACUTE_INTERVAL = "2 weeks"
DEFAULT_GENERIC_INTERVAL = "4 weeks"


CODE_INTERVALS = {
    "E11": DEFAULT_CHRONIC_INTERVAL,
    "I10": DEFAULT_CHRONIC_INTERVAL,
    "J45": DEFAULT_CHRONIC_INTERVAL,
    "J06": DEFAULT_ACUTE_INTERVAL,
    "S93": DEFAULT_ACUTE_INTERVAL,
}

# Prefixes of ICD-10 codes considered indicative of chronic or acute
# conditions.  These are used as a lightweight heuristic for determining the
# recommended follow-up interval.
CHRONIC_CODE_PREFIXES = ["E11", "I10", "J45"]
ACUTE_CODE_PREFIXES = ["J06", "S93"]

CHRONIC_KEYWORDS = {"chronic", "diabetes", "hypertension", "asthma"}
ACUTE_KEYWORDS = {"sprain", "acute", "infection", "injury"}


# Clinicians sometimes specify an explicit follow-up interval in their note.
# This regex attempts to capture phrases like "follow up in 2 weeks" or
# "return in 10 days" and override any heuristic recommendations.
CLINICIAN_OVERRIDE_RE = re.compile(
    r"(?:follow(?:-|\s)?up|return(?:\s+visit)?)\s+(?:in|after)\s+(\d+\s*(?:day|week|month|year)s?)",
    re.I,
)


def _has_prefix(codes: Iterable[str], prefixes: Iterable[str]) -> bool:
    """Return ``True`` if any code starts with one of the given prefixes."""

    prefixes = tuple(prefixes)
    return any(code.startswith(prefixes) for code in codes)

def recommend_follow_up(
    codes: Sequence[str],
    diagnoses: Optional[Sequence[str]] = None,
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
    code_intervals: Optional[Mapping[str, str]] = None,
) -> dict:
    """Return a follow-up interval and ICS string.

    The current implementation uses simple keyword and code-prefix heuristics
    to derive a recommended interval.  ``specialty`` and ``payer`` are accepted
    for future expansion but currently unused.
    """

    diag_text = " ".join(diagnoses or [])
    diag_text_lower = diag_text.lower()
    codes = [c.upper() for c in codes if c]

    # Allow caller to provide custom code-to-interval mappings.  These override
    # the defaults defined in ``CODE_INTERVALS``.
    mapping = CODE_INTERVALS.copy()
    if code_intervals:
        mapping.update({k.upper(): v for k, v in code_intervals.items()})

    # Clinician-provided interval overrides any heuristics.
    override = CLINICIAN_OVERRIDE_RE.search(diag_text)
    if override:
        interval = override.group(1)
    else:
        # First check explicit mappings.
        interval = None
        for code in codes:
            for prefix, value in mapping.items():
                if code.startswith(prefix):
                    interval = value
                    break
            if interval:
                break

        # Fall back to heuristic prefixes/keywords.
        if not interval:
            if _has_prefix(codes, CHRONIC_CODE_PREFIXES) or any(
                kw in diag_text_lower for kw in CHRONIC_KEYWORDS
            ):
                interval = DEFAULT_CHRONIC_INTERVAL
            elif _has_prefix(codes, ACUTE_CODE_PREFIXES) or any(
                kw in diag_text_lower for kw in ACUTE_KEYWORDS
            ):
                interval = DEFAULT_ACUTE_INTERVAL
            else:
                interval = DEFAULT_GENERIC_INTERVAL

    return {"interval": interval, "ics": export_ics(interval)}


# Summary used for exported calendar events.
DEFAULT_EVENT_SUMMARY = "Follow-up appointment"


def export_ics(interval: str, summary: str = DEFAULT_EVENT_SUMMARY) -> Optional[str]:
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
