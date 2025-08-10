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
import json
import os


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

# Specialty and payer specific mappings.  These can be loaded from a JSON
# configuration file pointed to by the ``CODE_INTERVALS_FILE`` environment
# variable.  The structure is ``{"specialty": {"CODE": {"default": interval,
# "payer_overrides": {"payer": interval}}}}``.  A small built-in mapping is
# provided as a fallback to demonstrate functionality.
_DEFAULT_SPECIALTY_MAP = {
    "cardiology": {"E11": {"default": "1 month", "payer_overrides": {"medicare": "6 weeks"}}}
}

_CONFIG_PATH = os.environ.get("CODE_INTERVALS_FILE")
try:
    if _CONFIG_PATH:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as fh:
            CODE_INTERVALS_BY_SPECIALTY = json.load(fh)
    else:
        CODE_INTERVALS_BY_SPECIALTY = _DEFAULT_SPECIALTY_MAP
except Exception:
    CODE_INTERVALS_BY_SPECIALTY = _DEFAULT_SPECIALTY_MAP

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
    """Return a follow-up interval, rationale and ICS string.

    The function applies several layers of heuristics.  Custom mappings can be
    supplied via ``CODE_INTERVALS_FILE`` or directly via ``code_intervals``.  A
    rationale string describing which rule fired is returned so that the UI can
    display why a recommendation was made.
    """

    diag_text = " ".join(diagnoses or [])
    diag_text_lower = diag_text.lower()
    codes = [c.upper() for c in codes if c]

    reason: Optional[str] = None

    # Allow caller to provide custom code-to-interval mappings.  These override
    # the defaults defined in ``CODE_INTERVALS``.
    mapping = CODE_INTERVALS.copy()
    if code_intervals:
        mapping.update({k.upper(): v for k, v in code_intervals.items()})

    # Clinician-provided interval overrides any heuristics.
    override = CLINICIAN_OVERRIDE_RE.search(diag_text)
    if override:
        interval = override.group(1)
        reason = "clinician override"
    else:
        interval = None

        # Specialty/payer specific overrides from configuration file.
        spec_key = (specialty or "").lower()
        payer_key = (payer or "").lower()
        spec_map = CODE_INTERVALS_BY_SPECIALTY.get(spec_key, {})
        for code in codes:
            for prefix, entry in spec_map.items():
                if not code.startswith(prefix):
                    continue
                if isinstance(entry, dict):
                    # Payer-specific override takes precedence.
                    if payer_key and entry.get("payer_overrides", {}).get(payer_key):
                        interval = entry["payer_overrides"][payer_key]
                        reason = f"specialty {spec_key} payer {payer_key} override"
                        break
                    if entry.get("default"):
                        interval = entry["default"]
                        reason = f"specialty {spec_key} override"
                        break
                else:
                    interval = entry
                    reason = f"specialty {spec_key} override"
                    break
            if interval:
                break

        # Explicit code mappings if no specialty rule matched.
        if not interval:
            for code in codes:
                for prefix, value in mapping.items():
                    if code.startswith(prefix):
                        interval = value
                        reason = f"code mapping {prefix}"
                        break
                if interval:
                    break

        # Fall back to heuristic prefixes/keywords.
        if not interval:
            if _has_prefix(codes, CHRONIC_CODE_PREFIXES) or any(
                kw in diag_text_lower for kw in CHRONIC_KEYWORDS
            ):
                interval = DEFAULT_CHRONIC_INTERVAL
                reason = "chronic heuristic"
            elif _has_prefix(codes, ACUTE_CODE_PREFIXES) or any(
                kw in diag_text_lower for kw in ACUTE_KEYWORDS
            ):
                interval = DEFAULT_ACUTE_INTERVAL
                reason = "acute heuristic"
            else:
                interval = DEFAULT_GENERIC_INTERVAL
                reason = "generic heuristic"

    return {"interval": interval, "ics": export_ics(interval), "reason": reason}


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

# ---------------- Appointment storage & helpers -----------------
# In-memory appointment registry. Persistent storage is out of scope for the
# lightweight scheduling demo and test coverage. The main API imports the
# following helper functions; previously they were missing causing ImportError
# during test collection.
from threading import Lock

_APPOINTMENTS: list[dict] = []
_APPT_LOCK = Lock()
_NEXT_ID = 1


def create_appointment(patient: str, reason: str, start: datetime, end: Optional[datetime] = None) -> dict:
    """Create an appointment record and return it.

    A minimal in-memory implementation. ``end`` defaults to 30 minutes after
    ``start`` to keep logic deterministic for tests. Datetimes are stored as ISO
    strings for JSON serialisation.
    """
    global _NEXT_ID
    if end is None:
        end = start + timedelta(minutes=30)
    if end < start:
        # Normalise invalid ranges by swapping; keeps function total.
        start, end = end, start
    rec = {
        "id": _NEXT_ID,
        "patient": patient,
        "reason": reason,
        "start": start.replace(microsecond=0).isoformat(),
        "end": end.replace(microsecond=0).isoformat(),
    }
    with _APPT_LOCK:
        _APPOINTMENTS.append(rec)
        _NEXT_ID += 1
    return rec


def list_appointments() -> list[dict]:
    """Return all appointments sorted by start time."""
    with _APPT_LOCK:
        return sorted(_APPOINTMENTS, key=lambda r: r["start"])  # shallow copies fine


def get_appointment(appt_id: int) -> Optional[dict]:
    with _APPT_LOCK:
        for rec in _APPOINTMENTS:
            if rec["id"] == appt_id:
                return rec
    return None


def export_appointment_ics(appt: Mapping[str, Any]) -> Optional[str]:  # type: ignore[name-defined]
    """Produce an ICS string for a stored appointment.

    Falls back to ``export_ics`` using a generic interval if parsing fails.
    """
    try:
        start = datetime.fromisoformat(appt["start"])
        end = datetime.fromisoformat(appt["end"])
    except Exception:
        # Use generic follow-up export for robustness.
        return export_ics(DEFAULT_GENERIC_INTERVAL)

    def _fmt(dt: datetime) -> str:
        # Treat naive datetimes as UTC for simplicity.
        return dt.strftime("%Y%m%dT%H%M%SZ")

    summary = f"{DEFAULT_EVENT_SUMMARY}: {appt.get('reason','')}".strip()
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        f"SUMMARY:{summary}",
        f"DTSTART:{_fmt(start)}",
        f"DTEND:{_fmt(end)}",
        f"DESCRIPTION:Patient {appt.get('patient','')}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\n".join(lines)

# Re-export public API surface for explicit imports elsewhere.
__all__ = [
    "recommend_follow_up",
    "export_ics",
    "create_appointment",
    "list_appointments",
    "get_appointment",
    "export_appointment_ics",
    "DEFAULT_EVENT_SUMMARY",
    "DEFAULT_CHRONIC_INTERVAL",
    "DEFAULT_ACUTE_INTERVAL",
    "DEFAULT_GENERIC_INTERVAL",
]
