"""Database configuration helpers for the backend services.

This module centralises creation of the SQLAlchemy engine that backs the
application.  It supports both the default SQLite deployment used in
local development and optional PostgreSQL connections controlled via
environment variables.
"""

from __future__ import annotations

import logging
import os
import shutil
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Generator, Optional

from sqlalchemy import event, create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

try:  # Prefer appdirs when available; fall back for limited environments.
    from appdirs import user_data_dir  # type: ignore
except Exception:  # pragma: no cover - fallback for environments without appdirs
    from platformdirs import user_data_dir  # type: ignore

from backend.key_manager import APP_NAME

LOGGER = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths and defaults
# ---------------------------------------------------------------------------

DATA_DIR = Path(os.environ.get("REVENUEPILOT_DATA_DIR") or user_data_dir(APP_NAME, APP_NAME))
DATA_DIR.mkdir(parents=True, exist_ok=True)

SQLITE_FILENAME = os.environ.get("REVENUEPILOT_SQLITE_NAME", "analytics.db")
SQLITE_PATH = DATA_DIR / SQLITE_FILENAME

_OLD_SQLITE_PATH = Path(__file__).resolve().parent / "analytics.db"
if _OLD_SQLITE_PATH.exists() and not SQLITE_PATH.exists():
    try:  # best effort migration of legacy database location
        shutil.move(str(_OLD_SQLITE_PATH), str(SQLITE_PATH))
    except Exception:  # pragma: no cover - non critical
        LOGGER.warning("sqlite_migration_failed", exc_info=True)

# ---------------------------------------------------------------------------
# Engine configuration
# ---------------------------------------------------------------------------


def _normalise_postgres_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://") and not url.startswith("postgresql+psycopg://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def _database_url() -> str:
    env_url = os.environ.get("DATABASE_URL") or os.environ.get("DB_URL")
    if env_url:
        return _normalise_postgres_url(env_url)
    return f"sqlite:///{SQLITE_PATH}"


DATABASE_URL = _database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")


def _parse_int(value: Optional[str], default: Optional[int] = None) -> Optional[int]:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _create_engine() -> Engine:
    connect_args: Dict[str, Any] = {}
    engine_kwargs: Dict[str, Any] = {"future": True}

    if IS_SQLITE:
        connect_args["check_same_thread"] = False
        engine_kwargs["connect_args"] = connect_args
    else:
        sslmode = os.environ.get("DB_SSLMODE")
        if sslmode:
            connect_args["sslmode"] = sslmode
        sslrootcert = os.environ.get("DB_SSLROOTCERT")
        if sslrootcert:
            connect_args["sslrootcert"] = sslrootcert
        timeout = os.environ.get("DB_CONNECT_TIMEOUT")
        if timeout:
            parsed = _parse_int(timeout)
            if parsed is not None:
                connect_args["connect_timeout"] = parsed
        engine_kwargs["connect_args"] = connect_args
        engine_kwargs["pool_pre_ping"] = True
        pool_size = _parse_int(os.environ.get("DB_POOL_SIZE"))
        if pool_size is not None:
            engine_kwargs["pool_size"] = pool_size
        max_overflow = _parse_int(os.environ.get("DB_MAX_OVERFLOW"))
        if max_overflow is not None:
            engine_kwargs["max_overflow"] = max_overflow
        pool_timeout = _parse_int(os.environ.get("DB_POOL_TIMEOUT"))
        if pool_timeout is not None:
            engine_kwargs["pool_timeout"] = pool_timeout

    engine = create_engine(DATABASE_URL, **engine_kwargs)

    if not IS_SQLITE:
        statement_timeout = _parse_int(os.environ.get("DB_STATEMENT_TIMEOUT_MS"))

        @event.listens_for(engine, "connect")
        def _configure_postgres(dbapi_connection, connection_record):  # type: ignore[override]
            cursor = None
            try:
                cursor = dbapi_connection.cursor()
                cursor.execute("SET TIME ZONE 'UTC'")
                if statement_timeout:
                    cursor.execute("SET statement_timeout TO %s", (statement_timeout,))
            except Exception:  # pragma: no cover - depends on driver
                LOGGER.warning("postgres_session_setup_failed", exc_info=True)
            finally:
                if cursor is not None:
                    cursor.close()

    return engine


engine = _create_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

_primary_connection: Optional[tuple[Any | None, Any]] = None
_override_engine: Optional[Engine] = None
_override_sessionmaker: Optional[sessionmaker] = None


def _session_factory() -> sessionmaker:
    return _override_sessionmaker or SessionLocal


def _unwrap_connection(raw: Any) -> tuple[Any, Any]:
    """Return a pair of (outer, dbapi) connections."""

    if hasattr(raw, "connection"):
        return raw, raw.connection
    return raw, raw


def _configure_sqlite_connection(conn: Any) -> Any:
    if IS_SQLITE and isinstance(conn, sqlite3.Connection):
        conn.row_factory = sqlite3.Row
    return conn


def get_sync_connection() -> Any:
    """Return a process-wide connection reused by helper modules."""

    global _primary_connection
    if _primary_connection is None:
        raw = engine.raw_connection()
        outer, dbapi_conn = _unwrap_connection(raw)
        _primary_connection = (outer, _configure_sqlite_connection(dbapi_conn))
    return _primary_connection[1]


def set_sync_connection(conn: Any) -> None:
    """Force the primary connection to *conn* (used in tests)."""

    global _primary_connection
    global _override_engine
    global _override_sessionmaker

    _primary_connection = (None, _configure_sqlite_connection(conn))

    try:
        creator = lambda: conn  # noqa: E731
        override_engine = create_engine(
            "sqlite://",
            creator=creator,
            poolclass=StaticPool,
            future=True,
            connect_args={"check_same_thread": False},
        )
        _override_engine = override_engine
        _override_sessionmaker = sessionmaker(
            bind=override_engine, autoflush=False, autocommit=False, future=True
        )
    except Exception:
        _override_engine = None
        _override_sessionmaker = None


@contextmanager
def connection_scope() -> Generator[Any, None, None]:
    """Yield a short-lived database connection."""

    raw = engine.raw_connection()
    outer, dbapi_conn = _unwrap_connection(raw)
    conn = _configure_sqlite_connection(dbapi_conn)
    try:
        yield conn
    finally:
        try:
            outer.close()
        except Exception:  # pragma: no cover - defensive
            LOGGER.warning("connection_close_failed", exc_info=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a SQLAlchemy session."""

    session: Session = _session_factory()()
    try:
        yield session
    finally:
        session.close()


def get_session() -> Generator[Session, None, None]:
    """Yield a SQLAlchemy session for callers that prefer ORM access."""

    yield from get_db()


def session_connection(session: Session) -> Any:
    """Return the underlying DB-API connection for a session."""

    connection = session.connection()
    raw: Any
    try:
        raw = connection.connection  # type: ignore[attr-defined]
    except AttributeError:  # pragma: no cover - driver differences
        raw = connection.get_raw_connection()
    _, dbapi_conn = _unwrap_connection(raw)
    return _configure_sqlite_connection(dbapi_conn)
