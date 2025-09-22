"""Utilities for working with timestamps in UTC."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Union

Number = Union[int, float]
Scalar = Union[Number, str]


def utc_now() -> datetime:
    """Return the current time as a timezone-aware ``datetime`` in UTC."""

    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime) -> datetime:
    """Normalise ``dt`` to a timezone-aware UTC ``datetime``."""

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def from_epoch_seconds(value: Optional[Scalar]) -> Optional[datetime]:
    """Convert ``value`` representing epoch seconds to a UTC ``datetime``."""

    if value in (None, "", b""):
        return None
    try:
        seconds = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(seconds, tz=timezone.utc)


def to_epoch_seconds(dt: Optional[datetime]) -> Optional[float]:
    """Return the epoch seconds for ``dt`` normalised to UTC."""

    if dt is None:
        return None
    dt_utc = ensure_utc(dt)
    return dt_utc.timestamp()


__all__ = ["utc_now", "ensure_utc", "from_epoch_seconds", "to_epoch_seconds"]
