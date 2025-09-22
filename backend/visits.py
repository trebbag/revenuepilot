from __future__ import annotations

"""Lightweight visit state management utilities.

The functions in this module maintain an in-memory map of encounter
states.  They are intentionally minimal and deterministic so tests can
rely on predictable behaviour.  ``update_visit_state`` is safe to run in
FastAPI ``BackgroundTasks``.
"""

from datetime import datetime
from threading import Lock
from typing import Dict, Optional

from backend.time_utils import ensure_utc, utc_now

_DEFAULT_STATE = {
    "visitStatus": "pending",
    "startTime": None,
    "duration": 0,
    "documentationComplete": False,
}

_VISITS: Dict[str, Dict[str, object]] = {}
_LOCK = Lock()


def _isoformat_utc(dt: datetime) -> str:
    dt_utc = ensure_utc(dt).replace(microsecond=0)
    text = dt_utc.isoformat()
    if text.endswith("+00:00"):
        return text[:-6] + "Z"
    return text


def _apply(state: Dict[str, object], action: str) -> Dict[str, object]:
    state = dict(state)
    now = _isoformat_utc(utc_now())
    if action == "start":
        state.update(
            {
                "visitStatus": "active",
                "startTime": now,
                "documentationComplete": False,
            }
        )
    elif action == "complete":
        start = state.get("startTime")
        duration = 0
        if isinstance(start, str):
            try:
                normalised = start[:-1] + "+00:00" if start.endswith("Z") else start
                start_dt = ensure_utc(datetime.fromisoformat(normalised))
                duration = int((utc_now() - start_dt).total_seconds())
            except Exception:
                duration = 0
        state.update(
            {
                "visitStatus": "completed",
                "duration": duration,
                "documentationComplete": True,
            }
        )
    return state


def peek_state(encounter_id: str, action: str) -> Dict[str, object]:
    """Return the expected state after applying ``action`` without persisting."""

    base = _VISITS.get(encounter_id, {**_DEFAULT_STATE, "encounterId": encounter_id})
    return _apply(base, action)


def update_visit_state(encounter_id: str, action: str) -> Dict[str, object]:
    """Apply ``action`` to ``encounter_id`` and persist the result."""

    with _LOCK:
        base = _VISITS.get(encounter_id, {**_DEFAULT_STATE, "encounterId": encounter_id})
        new_state = _apply(base, action)
        _VISITS[encounter_id] = new_state
    return new_state


def get_visit(encounter_id: str) -> Optional[Dict[str, object]]:
    with _LOCK:
        state = _VISITS.get(encounter_id)
        return dict(state) if state else None
