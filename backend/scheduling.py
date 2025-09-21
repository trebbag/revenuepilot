"""Tools for recommending follow-up intervals and calendar exports.

This module contains lightweight heuristics for deriving a follow-up interval
from clinical codes and diagnoses.  It also includes an ``export_ics`` utility
which creates a minimal ICS string for the recommended interval so the result
can be added to a calendar client.
"""
from __future__ import annotations

import re
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Iterator, Mapping, Optional, Sequence, Tuple
import json
import os
import sqlite3

import sqlalchemy as sa
from sqlalchemy import case, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


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
_NEXT_ID = 1000

_ENGINE: Optional[Engine] = None
_SESSION_FACTORY: Optional[sessionmaker[Session]] = None


_METADATA = sa.MetaData()

_PATIENTS_TABLE = sa.Table(
    "patients",
    _METADATA,
    sa.Column("id", sa.Integer),
    sa.Column("first_name", sa.String),
    sa.Column("last_name", sa.String),
    sa.Column("mrn", sa.String),
    sa.Column("last_visit", sa.String),
    sa.Column("insurance", sa.String),
)

_ENCOUNTERS_TABLE = sa.Table(
    "encounters",
    _METADATA,
    sa.Column("id", sa.Integer),
    sa.Column("patient_id", sa.Integer),
    sa.Column("date", sa.String),
    sa.Column("type", sa.String),
    sa.Column("provider", sa.String),
    sa.Column("description", sa.Text),
)

_VISIT_SESSIONS_TABLE = sa.Table(
    "visit_sessions",
    _METADATA,
    sa.Column("id", sa.Integer),
    sa.Column("encounter_id", sa.Integer),
    sa.Column("status", sa.String),
    sa.Column("start_time", sa.DateTime(timezone=True)),
    sa.Column("end_time", sa.DateTime(timezone=True)),
    sa.Column("data", sa.JSON),
    sa.Column("updated_at", sa.DateTime(timezone=True)),
)


def configure_database(
    conn: sqlite3.Connection | sessionmaker[Session] | Engine,
) -> None:
    """Configure the session factory used for scheduling helpers."""

    global _ENGINE, _SESSION_FACTORY

    if isinstance(conn, sessionmaker):
        _SESSION_FACTORY = conn
        _ENGINE = None
        return

    engine: Engine
    if isinstance(conn, Engine):
        engine = conn
    else:
        def _creator(connection: sqlite3.Connection = conn) -> sqlite3.Connection:
            return connection

        engine = sa.create_engine(
            "sqlite://",
            creator=_creator,
            poolclass=StaticPool,
            future=True,
        )

    if _ENGINE is not None and _ENGINE is not engine:
        _ENGINE.dispose()

    _ENGINE = engine
    _SESSION_FACTORY = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
        future=True,
    )


@contextmanager
def _optional_session(provided: Optional[Session] = None) -> Iterator[Optional[Session]]:
    """Yield *provided* or a configured session if available."""

    if provided is not None:
        yield provided
        return

    if _SESSION_FACTORY is None:
        yield None
        return

    session = _SESSION_FACTORY()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def schedule_session_scope(session: Optional[Session] = None) -> Iterator[Session]:
    """Context manager yielding a scheduling session."""

    if session is not None:
        yield session
        return

    if _SESSION_FACTORY is None:
        raise RuntimeError("Scheduling session factory is not configured")

    scoped = _SESSION_FACTORY()
    try:
        yield scoped
    finally:
        scoped.close()

_DEFAULT_APPOINTMENT_DURATION = timedelta(minutes=30)

_STATUS_ACTION_MAP = {
    "check-in": "in-progress",
    "checkin": "in-progress",
    "start": "in-progress",
    "begin": "in-progress",
    "complete": "completed",
    "completed": "completed",
    "cancel": "cancelled",
    "cancelled": "cancelled",
}

_ALLOWED_STATUSES = {"scheduled", "in-progress", "completed", "cancelled"}


def _parse_datetime(value: Any) -> Optional[datetime]:
    """Coerce *value* into a ``datetime`` when possible."""

    if value in (None, "", b""):
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value))
        except (TypeError, ValueError, OSError):
            return None
    if isinstance(value, (bytes, bytearray)):
        try:
            value = value.decode("utf-8")
        except Exception:
            value = value.decode("utf-8", errors="ignore")
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        normalised = text[:-1] + "+00:00" if text.endswith("Z") else text
        try:
            return datetime.fromisoformat(normalised)
        except ValueError:
            pass
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(text, fmt)
                if fmt == "%Y-%m-%d":
                    return dt.replace(hour=9, minute=0, second=0, microsecond=0)
                return dt
            except ValueError:
                continue
    return None


def _serialize_datetime(dt: Optional[datetime]) -> Optional[str]:
    if not isinstance(dt, datetime):
        return None
    return dt.replace(microsecond=0).isoformat()


_STATUS_REMAP = {
    "started": "in-progress",
    "start": "in-progress",
    "active": "in-progress",
    "in_progress": "in-progress",
    "checkin": "check-in",
    "checked-in": "check-in",
    "checked_in": "check-in",
    "check-in": "check-in",
    "complete": "completed",
    "finished": "completed",
    "cancel": "cancelled",
    "canceled": "cancelled",
    "no-show": "no show",
    "no_show": "no show",
}


def _normalise_status(value: Optional[str]) -> str:
    if not value:
        return "scheduled"
    normalised = value.strip().lower().replace(" ", "-")
    return _STATUS_REMAP.get(normalised, normalised or "scheduled")


def _visit_session_sort_key(value: Optional[datetime]) -> float:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.timestamp()
    return float("-inf")


def _load_visit_sessions(session: Session) -> Dict[int, Mapping[str, Any]]:
    """Return a mapping of encounter_id -> latest visit session row."""

    rows = session.execute(select(_VISIT_SESSIONS_TABLE)).mappings().all()
    latest: Dict[int, Mapping[str, Any]] = {}
    for row in rows:
        encounter_id = row.get("encounter_id")
        if encounter_id is None:
            continue
        existing = latest.get(encounter_id)
        candidate_ts = _visit_session_sort_key(row.get("updated_at"))
        if existing is None:
            latest[encounter_id] = dict(row)
            continue
        existing_ts = _visit_session_sort_key(existing.get("updated_at"))
        if candidate_ts > existing_ts:
            latest[encounter_id] = dict(row)
        elif candidate_ts == existing_ts and row.get("id", 0) > existing.get("id", 0):
            latest[encounter_id] = dict(row)
    return latest


def _build_visit_summary(
    encounter_id: int,
    patient_id: Optional[int],
    patient_name: str,
    provider: Optional[str],
    reason: str,
    start: Optional[datetime],
    end: Optional[datetime],
    status: str,
    *,
    last_visit: Optional[str] = None,
    encounter_type: Optional[str] = None,
    insurance: Optional[str] = None,
    session_row: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Assemble a structured visit summary payload."""

    duration_minutes: Optional[int] = None
    if start and end:
        delta = end - start
        duration_minutes = max(0, int(delta.total_seconds() // 60))

    summary: Dict[str, Any] = {
        "encounterId": str(encounter_id),
        "patientId": str(patient_id) if patient_id is not None else None,
        "patientName": patient_name,
        "provider": provider,
        "chiefComplaint": reason,
        "status": status,
        "startTime": _serialize_datetime(start),
        "endTime": _serialize_datetime(end),
        "durationMinutes": duration_minutes,
        "documentationComplete": status in {"completed", "cancelled"},
        "lastVisit": last_visit,
        "encounterType": encounter_type,
    }

    if insurance:
        summary["insurance"] = insurance

    if session_row is not None:
        session_data = session_row.get("data")
        if session_data:
            if isinstance(session_data, Mapping):
                summary["session"] = dict(session_data)
            else:
                try:
                    parsed = json.loads(session_data)
                    if isinstance(parsed, dict):
                        summary["session"] = parsed
                except json.JSONDecodeError:
                    summary["session"] = session_data
        updated_at = session_row.get("updated_at")
        if updated_at is not None:
            summary["sessionUpdatedAt"] = _serialize_datetime(
                _parse_datetime(updated_at)
            )

    return {key: value for key, value in summary.items() if value is not None}


def _load_db_appointments(session: Session) -> list[dict]:
    """Return appointments derived from persisted encounter data."""

    encounter_rows = session.execute(
        select(
            _ENCOUNTERS_TABLE.c.id.label("encounter_id"),
            _ENCOUNTERS_TABLE.c.patient_id,
            _ENCOUNTERS_TABLE.c.date,
            _ENCOUNTERS_TABLE.c.type,
            _ENCOUNTERS_TABLE.c.provider,
            _ENCOUNTERS_TABLE.c.description,
            _PATIENTS_TABLE.c.first_name,
            _PATIENTS_TABLE.c.last_name,
            _PATIENTS_TABLE.c.mrn,
            _PATIENTS_TABLE.c.last_visit,
            _PATIENTS_TABLE.c.insurance,
        )
        .select_from(_ENCOUNTERS_TABLE)
        .join(
            _PATIENTS_TABLE,
            _PATIENTS_TABLE.c.id == _ENCOUNTERS_TABLE.c.patient_id,
            isouter=True,
        )
        .order_by(
            case((_ENCOUNTERS_TABLE.c.date.is_(None), 1), else_=0),
            _ENCOUNTERS_TABLE.c.date.asc(),
            _ENCOUNTERS_TABLE.c.id.asc(),
        )
    ).mappings().all()

    sessions = _load_visit_sessions(session)
    appointments: list[dict] = []

    for row in encounter_rows:
        encounter_id = row["encounter_id"]
        patient_id = row["patient_id"]
        session_row = sessions.get(encounter_id)

        start_dt = _parse_datetime(
            session_row.get("start_time") if session_row else row["date"]
        )
        end_dt = _parse_datetime(session_row.get("end_time") if session_row else None)
        if start_dt is None:
            # Default to encounter date at 9am when only the date is provided.
            start_dt = _parse_datetime(row["date"])
        if start_dt is None:
            start_dt = datetime.utcnow().replace(microsecond=0)
        if end_dt is None:
            end_dt = start_dt + _DEFAULT_APPOINTMENT_DURATION

        patient_first = row.get("first_name") or ""
        patient_last = row.get("last_name") or ""
        name_parts = [part for part in (patient_first, patient_last) if part]
        patient_name = " ".join(name_parts) if name_parts else (
            row.get("mrn") or f"Patient {encounter_id}"
        )

        provider = (row.get("provider") or "").strip() or None
        reason = (row.get("description") or row.get("type") or "Follow-up").strip()
        status_raw = session_row.get("status") if session_row else None
        status = _normalise_status(status_raw)
        encounter_type = (row.get("type") or "").strip() or None

        location = "Virtual" if (
            encounter_type and encounter_type.lower().startswith("tele")
        ) else "Main Clinic"

        summary = _build_visit_summary(
            encounter_id,
            patient_id,
            patient_name,
            provider,
            reason,
            start_dt,
            end_dt,
            status,
            last_visit=row.get("last_visit"),
            encounter_type=encounter_type,
            insurance=row.get("insurance"),
            session_row=session_row,
        )

        appointments.append(
            {
                "id": int(encounter_id),
                "patient": patient_name,
                "patientId": str(patient_id) if patient_id is not None else None,
                "encounterId": str(encounter_id),
                "reason": reason,
                "start": _serialize_datetime(start_dt) or start_dt.isoformat(),
                "end": _serialize_datetime(end_dt) or end_dt.isoformat(),
                "provider": provider,
                "status": status,
                "location": location,
                "visitSummary": summary,
            }
        )

    return appointments


def create_appointment(
    patient: str,
    reason: str,
    start: datetime,
    end: Optional[datetime] = None,
    provider: Optional[str] = None,
    *,
    patient_id: Optional[str] = None,
    encounter_id: Optional[str] = None,
    location: Optional[str] = None,
    visit_summary: Optional[Mapping[str, Any]] = None,
) -> dict:
    """Create an appointment record and return it.

    A minimal in-memory implementation. ``end`` defaults to 30 minutes after
    ``start`` to keep logic deterministic for tests. Datetimes are stored as ISO
    strings for JSON serialisation.
    """
    global _NEXT_ID
    if end is None:
        end = start + _DEFAULT_APPOINTMENT_DURATION
    if end < start:
        # Normalise invalid ranges by swapping; keeps function total.
        start, end = end, start
    location_normalised = (location or "").strip() or "Main Clinic"
    rec = {
        "id": _NEXT_ID,
        "patient": patient,
        "reason": reason,
        "start": start.replace(microsecond=0).isoformat(),
        "end": end.replace(microsecond=0).isoformat(),
        "provider": provider,
        "status": "scheduled",
        "patientId": patient_id,
        "encounterId": encounter_id,
        "location": location_normalised,
        "visitSummary": None,
    }
    summary_payload: Optional[Mapping[str, Any]]
    if visit_summary is not None:
        summary_payload = visit_summary
    else:
        summary_payload = _build_visit_summary(
            _NEXT_ID,
            None,
            patient,
            provider,
            reason,
            start,
            end,
            "scheduled",
            encounter_type=None,
        )
    if summary_payload:
        rec["visitSummary"] = dict(summary_payload)
    with _APPT_LOCK:
        _APPOINTMENTS.append(rec)
        _NEXT_ID += 1
    return rec


def list_appointments(*, session: Optional[Session] = None) -> list[dict]:
    """Return all appointments sorted by start time."""

    records: list[dict] = []
    with _optional_session(session) as db_session:
        if db_session is not None:
            try:
                records.extend(_load_db_appointments(db_session))
            except Exception:
                # Fall back to in-memory records if the query fails.
                pass

    with _APPT_LOCK:
        for rec in _APPOINTMENTS:
            records.append(dict(rec))

    return sorted(records, key=lambda r: r.get("start") or "")


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


def _normalise_provider(provider: Optional[str]) -> Optional[str]:
    if not provider:
        return None
    provider = provider.strip()
    return provider or None


def _find_appointment_locked(appt_id: int) -> Optional[dict]:
    for rec in _APPOINTMENTS:
        if rec.get("id") == appt_id:
            return rec
    return None


def _reschedule_locked(rec: dict, new_start: datetime) -> bool:
    try:
        old_start = datetime.fromisoformat(rec["start"])
        old_end = datetime.fromisoformat(rec["end"])
        duration = old_end - old_start
    except Exception:
        duration = _DEFAULT_APPOINTMENT_DURATION

    if duration.total_seconds() <= 0:
        duration = _DEFAULT_APPOINTMENT_DURATION

    rec["start"] = new_start.replace(microsecond=0).isoformat()
    rec["end"] = (new_start + duration).replace(microsecond=0).isoformat()
    rec["status"] = "scheduled"
    return True


def _apply_in_memory_operation(
    rec: dict,
    action: str,
    provider: Optional[str],
    new_start: Optional[datetime],
) -> bool:
    existing_provider = _normalise_provider(rec.get("provider"))
    if provider:
        if existing_provider and existing_provider.casefold() != provider.casefold():
            return False
        if not existing_provider:
            rec["provider"] = provider

    if not rec.get("status"):
        rec["status"] = "scheduled"

    action_lower = action.lower()
    if action_lower == "reschedule":
        if new_start is None:
            return False
        return _reschedule_locked(rec, new_start)

    status = _STATUS_ACTION_MAP.get(action_lower)
    if status:
        rec["status"] = status
        return True

    if action_lower in _ALLOWED_STATUSES:
        rec["status"] = action_lower
        return True

    return False


def _apply_db_bulk_operation(
    session: Session,
    encounter_id: int,
    action: str,
    provider: Optional[str],
    new_start: Optional[datetime],
) -> bool:
    try:
        encounter = (
            session.execute(
                select(
                    _ENCOUNTERS_TABLE.c.id,
                    _ENCOUNTERS_TABLE.c.provider,
                ).where(_ENCOUNTERS_TABLE.c.id == encounter_id)
            )
            .mappings()
            .first()
        )
    except Exception:
        session.rollback()
        return False

    if encounter is None:
        return False

    existing_provider = _normalise_provider(encounter.get("provider"))
    if provider:
        if existing_provider and existing_provider.casefold() != provider.casefold():
            return False
        if not existing_provider:
            session.execute(
                _ENCOUNTERS_TABLE.update()
                .where(_ENCOUNTERS_TABLE.c.id == encounter_id)
                .values(provider=provider)
            )
            existing_provider = provider

    action_lower = action.lower()
    if action_lower == "reschedule":
        if new_start is None:
            session.commit()
            return False

        session_row = (
            session.execute(
                select(_VISIT_SESSIONS_TABLE)
                .where(_VISIT_SESSIONS_TABLE.c.encounter_id == encounter_id)
                .order_by(
                    _VISIT_SESSIONS_TABLE.c.updated_at.desc().nulls_last(),
                    _VISIT_SESSIONS_TABLE.c.id.desc(),
                )
                .limit(1)
            )
            .mappings()
            .first()
        )

        duration = _DEFAULT_APPOINTMENT_DURATION
        if session_row:
            start_dt = _parse_datetime(session_row.get("start_time"))
            end_dt = _parse_datetime(session_row.get("end_time"))
            if start_dt and end_dt and end_dt > start_dt:
                duration = end_dt - start_dt

        end_dt = new_start + duration
        now_dt = datetime.utcnow()
        if session_row:
            session.execute(
                _VISIT_SESSIONS_TABLE.update()
                .where(_VISIT_SESSIONS_TABLE.c.id == session_row["id"])
                .values(
                    start_time=new_start,
                    end_time=end_dt,
                    status="scheduled",
                    updated_at=now_dt,
                )
            )
        else:
            session.execute(
                _VISIT_SESSIONS_TABLE.insert().values(
                    encounter_id=encounter_id,
                    status="scheduled",
                    start_time=new_start,
                    end_time=end_dt,
                    updated_at=now_dt,
                )
            )

        encounter_date = (
            _serialize_datetime(new_start)
            or new_start.replace(microsecond=0).isoformat()
        )
        session.execute(
            _ENCOUNTERS_TABLE.update()
            .where(_ENCOUNTERS_TABLE.c.id == encounter_id)
            .values(date=encounter_date)
        )
        session.commit()
        return True

    status = _STATUS_ACTION_MAP.get(action_lower)
    if not status and action_lower in _ALLOWED_STATUSES:
        status = action_lower
    if not status:
        session.commit()
        return False

    now_dt = datetime.utcnow()
    session_row = (
        session.execute(
            select(_VISIT_SESSIONS_TABLE)
            .where(_VISIT_SESSIONS_TABLE.c.encounter_id == encounter_id)
            .order_by(
                _VISIT_SESSIONS_TABLE.c.updated_at.desc().nulls_last(),
                _VISIT_SESSIONS_TABLE.c.id.desc(),
            )
            .limit(1)
        )
        .mappings()
        .first()
    )
    if session_row:
        session.execute(
            _VISIT_SESSIONS_TABLE.update()
            .where(_VISIT_SESSIONS_TABLE.c.id == session_row["id"])
            .values(status=status, updated_at=now_dt)
        )
    else:
        session.execute(
            _VISIT_SESSIONS_TABLE.insert().values(
                encounter_id=encounter_id,
                status=status,
                start_time=None,
                end_time=None,
                updated_at=now_dt,
            )
        )
    session.commit()
    return True


def apply_bulk_operations(
    updates: Sequence[Mapping[str, Any]],
    provider: Optional[str] = None,
    *,
    session: Optional[Session] = None,
) -> Tuple[int, int]:
    """Apply a series of bulk schedule operations.

    Parameters
    ----------
    updates:
        Sequence of mappings containing ``id``, ``action`` and optional ``time``.
    provider:
        Provider identifier to scope updates to. When provided, appointments with
        an existing provider mismatch are ignored. Appointments without a
        provider will adopt the supplied value.

    Returns
    -------
    Tuple[int, int]
        ``(succeeded, failed)`` counts for reporting back to the API caller.
    """

    succeeded = 0
    failed = 0
    provider_normalised = _normalise_provider(provider)

    with _optional_session(session) as db_session:
        for update in updates:
            if not isinstance(update, Mapping):
                failed += 1
                continue

            try:
                appt_id = int(update["id"])
            except Exception:
                failed += 1
                continue

            action_raw = update.get("action")
            if not action_raw:
                failed += 1
                continue
            action = str(action_raw).strip()
            if not action:
                failed += 1
                continue

            time_value = update.get("time")
            new_start: Optional[datetime]
            if time_value is None:
                new_start = None
            elif isinstance(time_value, datetime):
                new_start = time_value
            elif isinstance(time_value, str):
                try:
                    new_start = datetime.fromisoformat(time_value)
                except ValueError:
                    failed += 1
                    continue
            else:
                failed += 1
                continue

            handled = False
            success = False
            with _APPT_LOCK:
                rec = _find_appointment_locked(appt_id)
                if rec is not None:
                    handled = True
                    success = _apply_in_memory_operation(
                        rec, action, provider_normalised, new_start
                    )

            if handled:
                if success:
                    succeeded += 1
                else:
                    failed += 1
                continue

            if db_session is not None:
                try:
                    if _apply_db_bulk_operation(
                        db_session, appt_id, action, provider_normalised, new_start
                    ):
                        succeeded += 1
                        continue
                except Exception:
                    db_session.rollback()
                failed += 1
                continue

            failed += 1

    return succeeded, failed

# Re-export public API surface for explicit imports elsewhere.
__all__ = [
    "configure_database",
    "recommend_follow_up",
    "export_ics",
    "create_appointment",
    "list_appointments",
    "get_appointment",
    "export_appointment_ics",
    "apply_bulk_operations",
    "schedule_session_scope",
    "DEFAULT_EVENT_SUMMARY",
    "DEFAULT_CHRONIC_INTERVAL",
    "DEFAULT_ACUTE_INTERVAL",
    "DEFAULT_GENERIC_INTERVAL",
]
