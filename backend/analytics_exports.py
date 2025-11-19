"""Lightweight persistence for scheduled analytics exports.

The module stores schedules in a small JSON sidecar next to the analytics
database so deployments without a full scheduler can still queue PDF/email
runs and replay them after restarts.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

SCHEDULE_PATH = os.path.join(os.path.dirname(__file__), "analytics_exports.json")


class ExportSchedule(BaseModel):
    """Represents a single scheduled export request."""

    id: str
    cadence: str = Field(..., pattern=r"^(daily|weekly|monthly|once)$")
    format: str = Field("pdf", pattern=r"^(pdf|email)$")
    recipients: List[str] = Field(default_factory=list)
    filters: Dict[str, Any] = Field(default_factory=dict)
    next_run_at: Optional[str] = None

    @field_validator("recipients")
    @classmethod
    def _drop_blank(cls, value: List[str]) -> List[str]:  # noqa: D401,N805
        return [v.strip() for v in value if isinstance(v, str) and v.strip()]


class ExportStore:
    """Small helper that loads and persists export schedules."""

    def __init__(self, path: str = SCHEDULE_PATH) -> None:
        self.path = path
        self._cache: List[ExportSchedule] = []
        self._loaded = False

    def _load(self) -> None:
        if self._loaded:
            return
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as fh:
                    payload = json.load(fh)
                self._cache = [ExportSchedule(**item) for item in payload or []]
            except Exception:
                self._cache = []
        self._loaded = True

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as fh:
            json.dump([item.model_dump() for item in self._cache], fh, indent=2)

    def list(self) -> List[ExportSchedule]:
        self._load()
        return list(self._cache)

    def upsert(self, schedule: ExportSchedule) -> ExportSchedule:
        self._load()
        existing = [s for s in self._cache if s.id == schedule.id]
        if existing:
            self._cache = [schedule if s.id == schedule.id else s for s in self._cache]
        else:
            self._cache.append(schedule)
        self._save()
        return schedule

    def delete(self, schedule_id: str) -> None:
        self._load()
        self._cache = [s for s in self._cache if s.id != schedule_id]
        self._save()


store = ExportStore()


def register_schedule(
    cadence: str,
    format: str,
    recipients: List[str],
    filters: Dict[str, Any],
    *,
    schedule_id: Optional[str] = None,
) -> ExportSchedule:
    """Persist a schedule and compute the next run timestamp."""

    next_run_at = datetime.now(timezone.utc).isoformat()
    schedule = ExportSchedule(
        id=schedule_id or f"export-{int(datetime.now().timestamp())}",
        cadence=cadence,
        format=format,
        recipients=recipients,
        filters=filters,
        next_run_at=next_run_at,
    )
    return store.upsert(schedule)


def list_schedules() -> List[ExportSchedule]:
    return store.list()


def delete_schedule(schedule_id: str) -> None:
    store.delete(schedule_id)
