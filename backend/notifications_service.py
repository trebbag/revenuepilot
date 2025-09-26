from __future__ import annotations

import sqlite3
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Deque, Dict, List, Mapping, Optional

import structlog

from backend.migrations import (
    ensure_notification_counters_table,
    ensure_notification_events_table,
    ensure_notifications_table,
)


logger = structlog.get_logger(__name__)


@dataclass
class NotificationEvent:
    """Outcome of recording a notification."""

    item: Dict[str, Any]
    unread_count: int


class NotificationNotFoundError(Exception):
    """Raised when attempting to update a notification that does not exist."""


class NotificationService:
    """Persist notifications and track unread counts for websocket delivery."""

    def __init__(
        self,
        db_conn: sqlite3.Connection,
        *,
        history_limit: int = 20,
        push_limit: int = 5,
    ) -> None:
        self._db = db_conn
        self._history_limit = max(1, history_limit)
        self.push_limit = max(1, push_limit)
        self._recent: Dict[str, Deque[Dict[str, Any]]] = defaultdict(
            lambda: deque(maxlen=self._history_limit)
        )
        self._count_cache: Dict[str, int] = {}
        self._lock = Lock()
        self._ensure_tables()

    # ------------------------------------------------------------------
    # Connection / setup helpers
    # ------------------------------------------------------------------
    def update_connection(self, db_conn: sqlite3.Connection) -> None:
        """Point the service at a new database connection."""

        with self._lock:
            self._db = db_conn
            self._ensure_tables()
            self._count_cache.clear()
            self._recent.clear()

    def _ensure_tables(self) -> None:
        try:
            ensure_notifications_table(self._db)
            ensure_notification_counters_table(self._db)
            ensure_notification_events_table(self._db)
        except sqlite3.Error:
            logger.exception("notification_tables_init_failed")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def current_unread(self, username: str) -> int:
        """Return the cached unread count for *username*, refreshing if needed."""

        with self._lock:
            if username in self._count_cache:
                return self._count_cache[username]
        count = self._load_unread_from_db(username)
        with self._lock:
            self._count_cache[username] = count
        return count

    def record_event(
        self,
        username: str,
        payload: Mapping[str, Any],
        *,
        mark_unread: bool,
    ) -> NotificationEvent:
        """Persist *payload* for *username* and return delivery metadata."""

        record = self._normalise_payload(payload)
        user_id = self._get_user_id(username)
        if user_id is None:
            item = self._build_item(record, is_read=not mark_unread, read_at=None)
            self._store_recent(username, item)
            return NotificationEvent(item=item, unread_count=self.current_unread(username))

        now = time.time()
        existing = self._db.execute(
            """
            SELECT created_at, is_read, read_at
              FROM notification_events
             WHERE event_id=? AND user_id=?
            """,
            (record["id"], user_id),
        ).fetchone()

        if existing:
            is_read = int(existing["is_read"]) if existing["is_read"] is not None else 0
            read_at = existing["read_at"]
            if mark_unread:
                is_read = 0
                read_at = None
            self._db.execute(
                """
                UPDATE notification_events
                   SET title=?,
                       message=?,
                       severity=?,
                       updated_at=?,
                       is_read=?,
                       read_at=?
                 WHERE event_id=? AND user_id=?
                """,
                (
                    record["title"],
                    record["message"],
                    record["severity"],
                    now,
                    is_read,
                    read_at,
                    record["id"],
                    user_id,
                ),
            )
            created_at = (
                existing["created_at"]
                if existing["created_at"] is not None
                else record["created_at"]
            )
        else:
            is_read = 0 if mark_unread else 1
            read_at = None if mark_unread else now
            created_at = record["created_at"]
            self._db.execute(
                """
                INSERT INTO notification_events (
                    event_id,
                    user_id,
                    title,
                    message,
                    severity,
                    created_at,
                    updated_at,
                    is_read,
                    read_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    user_id,
                    record["title"],
                    record["message"],
                    record["severity"],
                    created_at,
                    now,
                    is_read,
                    read_at,
                ),
            )

        self._db.commit()
        unread = self._sync_unread(username, user_id=user_id)

        row = self._db.execute(
            """
            SELECT created_at, is_read, read_at, severity, title, message
              FROM notification_events
             WHERE event_id=? AND user_id=?
            """,
            (record["id"], user_id),
        ).fetchone()

        created_at = row["created_at"] if row and row["created_at"] is not None else created_at
        is_read = bool(row["is_read"]) if row else bool(not mark_unread)
        read_at = row["read_at"] if row else (None if mark_unread else now)
        severity = row["severity"] if row and row["severity"] else record["severity"]
        title = row["title"] if row and row["title"] else record["title"]
        message = row["message"] if row and row["message"] else record["message"]

        item = self._build_item(
            {
                "id": record["id"],
                "title": title,
                "message": message,
                "severity": severity,
                "created_at": created_at,
            },
            is_read=is_read,
            read_at=read_at,
        )
        self._store_recent(username, item)
        return NotificationEvent(item=item, unread_count=unread)

    def list_notifications(
        self,
        username: str,
        *,
        limit: int,
        offset: int,
    ) -> Dict[str, Any]:
        """Return paginated notifications for *username*."""

        ensure_notification_events_table(self._db)
        user_id = self._get_user_id(username)
        if user_id is None:
            unread = self.set_unread(username, 0)
            return {
                "items": [],
                "total": 0,
                "limit": limit,
                "offset": offset,
                "nextOffset": None,
                "unreadCount": unread,
            }

        rows = self._db.execute(
            """
            SELECT event_id, title, message, severity, created_at, is_read, read_at
              FROM notification_events
             WHERE user_id=?
             ORDER BY created_at DESC, id DESC
             LIMIT ? OFFSET ?
            """,
            (user_id, limit, offset),
        ).fetchall()
        total_row = self._db.execute(
            "SELECT COUNT(*) AS total FROM notification_events WHERE user_id=?",
            (user_id,),
        ).fetchone()
        total = int(total_row["total"]) if total_row and total_row["total"] is not None else 0
        unread = self._sync_unread(username, user_id=user_id)
        items = [self._row_to_item(row) for row in rows or []]
        next_offset = offset + limit if offset + limit < total else None
        return {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
            "nextOffset": next_offset,
            "unreadCount": unread,
        }

    def mark_read(self, username: str, event_id: str) -> int:
        """Mark a single notification as read and return the unread count."""

        user_id = self._get_user_id(username)
        if user_id is None:
            raise NotificationNotFoundError
        row = self._db.execute(
            "SELECT is_read FROM notification_events WHERE event_id=? AND user_id=?",
            (event_id, user_id),
        ).fetchone()
        if not row:
            raise NotificationNotFoundError
        if not row["is_read"]:
            now = time.time()
            self._db.execute(
                """
                UPDATE notification_events
                   SET is_read=1,
                       read_at=?,
                       updated_at=?
                 WHERE event_id=? AND user_id=?
                """,
                (now, now, event_id, user_id),
            )
            self._db.commit()
        return self._sync_unread(username, user_id=user_id)

    def mark_all_read(self, username: str) -> int:
        """Mark every notification for *username* as read."""

        user_id = self._get_user_id(username)
        if user_id is None:
            return self.set_unread(username, 0)
        now = time.time()
        self._db.execute(
            """
            UPDATE notification_events
               SET is_read=1,
                   read_at=COALESCE(read_at, ?),
                   updated_at=?
             WHERE user_id=? AND is_read=0
            """,
            (now, now, user_id),
        )
        self._db.commit()
        return self._sync_unread(username, user_id=user_id)

    def recent_items(self, username: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Return the most recent notifications cached for *username*."""

        max_items = limit or self.push_limit
        with self._lock:
            items = list(self._recent.get(username, []))
        return items[-max_items:]

    def set_unread(self, username: str, count: int) -> int:
        """Persist unread *count* for *username* and return it."""

        safe = max(0, int(count))
        with self._lock:
            self._count_cache[username] = safe
        self._persist_unread(username, safe)
        return safe

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _store_recent(self, username: str, item: Dict[str, Any]) -> None:
        with self._lock:
            self._recent[username].append(item)

    def _load_unread_from_db(self, username: str) -> int:
        row = self._db.execute(
            """
            SELECT nc.count
              FROM notification_counters nc
              JOIN users u ON u.id = nc.user_id
             WHERE u.username = ?
            """,
            (username,),
        ).fetchone()
        if row and row["count"] is not None:
            return int(row["count"])
        row = self._db.execute(
            "SELECT count FROM notifications WHERE username=?",
            (username,),
        ).fetchone()
        if row and row["count"] is not None:
            return int(row["count"])
        return self._sync_unread(username)

    def _sync_unread(self, username: str, *, user_id: Optional[int] = None) -> int:
        ensure_notification_events_table(self._db)
        if user_id is None:
            user_id = self._get_user_id(username)
        if user_id is None:
            return self.set_unread(username, 0)
        row = self._db.execute(
            "SELECT COUNT(*) AS unread FROM notification_events WHERE user_id=? AND is_read=0",
            (user_id,),
        ).fetchone()
        unread = int(row["unread"]) if row and row["unread"] is not None else 0
        return self.set_unread(username, unread)

    def _persist_unread(self, username: str, count: int) -> None:
        try:
            ensure_notification_counters_table(self._db)
            row = self._db.execute(
                "SELECT id FROM users WHERE username=?",
                (username,),
            ).fetchone()
            if row:
                user_id = row["id"]
                now = time.time()
                self._db.execute(
                    """
                    INSERT INTO notification_counters (user_id, count, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        count=excluded.count,
                        updated_at=excluded.updated_at
                    """,
                    (user_id, count, now),
                )
                self._db.commit()
        except sqlite3.Error:
            logger.debug("notification_counter_persist_failed", username=username)
        try:
            ensure_notifications_table(self._db)
            now = time.time()
            self._db.execute(
                """
                INSERT INTO notifications (username, count, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    count=excluded.count,
                    updated_at=excluded.updated_at
                """,
                (username, count, now),
            )
            self._db.commit()
        except sqlite3.Error:
            logger.debug("legacy_notification_store_failed", username=username)

    def _normalise_payload(self, payload: Mapping[str, Any]) -> Dict[str, Any]:
        raw_id = (
            payload.get("notificationId")
            or payload.get("eventId")
            or payload.get("id")
            or uuid.uuid4()
        )
        event_id = str(raw_id)

        title = payload.get("title")
        if not isinstance(title, str) or not title.strip():
            title = payload.get("type")
        title_str = str(title).strip() if title else "Notification"

        message_source = payload.get("message")
        if not isinstance(message_source, str) or not message_source.strip():
            for candidate in ("description", "detail", "text"):
                value = payload.get(candidate)
                if isinstance(value, str) and value.strip():
                    message_source = value
                    break
        message_str = (
            str(message_source).strip()
            if isinstance(message_source, str) and message_source.strip()
            else "You have a new notification."
        )

        severity_value = payload.get("severity") or payload.get("type") or "info"
        severity_str = str(severity_value).strip().lower() or "info"

        timestamp = (
            payload.get("timestamp")
            or payload.get("created_at")
            or payload.get("createdAt")
        )
        created_at = self._parse_timestamp(timestamp)

        return {
            "id": event_id,
            "title": title_str,
            "message": message_str,
            "severity": severity_str,
            "created_at": created_at,
        }

    def _row_to_item(self, row: sqlite3.Row) -> Dict[str, Any]:
        return self._build_item(
            {
                "id": row["event_id"],
                "title": row["title"],
                "message": row["message"],
                "severity": row["severity"],
                "created_at": row["created_at"],
            },
            is_read=bool(row["is_read"]),
            read_at=row["read_at"],
        )

    def _build_item(
        self,
        record: Mapping[str, Any],
        *,
        is_read: bool,
        read_at: Optional[float],
    ) -> Dict[str, Any]:
        timestamp_iso = self._iso_timestamp(record.get("created_at"))
        payload: Dict[str, Any] = {
            "id": record.get("id"),
            "title": record.get("title"),
            "message": record.get("message"),
            "severity": record.get("severity"),
            "timestamp": timestamp_iso,
            "ts": timestamp_iso,
            "isRead": bool(is_read),
        }
        if read_at:
            payload["readAt"] = self._iso_timestamp(read_at)
        return payload

    def _iso_timestamp(self, value: Any | None) -> str:
        if value is None:
            return datetime.now(timezone.utc).isoformat()
        try:
            if isinstance(value, datetime):
                if value.tzinfo is None:
                    value = value.replace(tzinfo=timezone.utc)
                return value.astimezone(timezone.utc).isoformat()
            return datetime.fromtimestamp(float(value), tz=timezone.utc).isoformat()
        except Exception:
            return datetime.now(timezone.utc).isoformat()

    def _timestamp_to_float(self, value: Any, default: float | None = None) -> float:
        fallback = time.time() if default is None else default
        if value is None:
            return fallback
        if isinstance(value, datetime):
            base = value
            if base.tzinfo is None:
                base = base.replace(tzinfo=timezone.utc)
            return base.timestamp()
        if isinstance(value, (int, float)):
            try:
                return float(value)
            except (TypeError, ValueError):
                return fallback
        if isinstance(value, str):
            try:
                return float(value)
            except (TypeError, ValueError):
                try:
                    text = value.strip()
                    if text.endswith("Z"):
                        text = text[:-1] + "+00:00"
                    return datetime.fromisoformat(text).timestamp()
                except Exception:
                    return fallback
        return fallback

    def _parse_timestamp(self, value: Any) -> float:
        return self._timestamp_to_float(value, default=time.time())

    def _get_user_id(self, username: str) -> Optional[int]:
        try:
            row = self._db.execute(
                "SELECT id FROM users WHERE username=?",
                (username,),
            ).fetchone()
        except sqlite3.Error:
            return None
        if not row:
            return None
        try:
            return int(row["id"])
        except (KeyError, TypeError, ValueError):
            try:
                return int(row[0])
            except (TypeError, ValueError, IndexError):
                return None


__all__ = [
    "NotificationEvent",
    "NotificationNotFoundError",
    "NotificationService",
]
