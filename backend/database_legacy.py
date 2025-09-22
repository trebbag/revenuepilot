
"""Database configuration helpers for the FastAPI backend.

This module centralises creation of the SQLAlchemy engine used by the
application and exposes a ``SessionLocal`` factory together with a FastAPI
dependency that yields sessions with proper cleanup.  Legacy components of the
codebase still rely on a long-lived SQLite connection; a thin compatibility
layer is provided so those helpers can continue to operate while newer code can
inject SQLAlchemy sessions per-request.

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

try:  # prefer appdirs when available
    from appdirs import user_data_dir  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    try:
        from platformdirs import user_data_dir  # type: ignore
    except Exception:  # pragma: no cover - final fallback

        def user_data_dir(appname: str, appauthor: str | None = None) -> str:  # type: ignore
            return os.path.join(os.path.expanduser("~"), f".{appname}")

from backend.key_manager import APP_NAME
from backend.migrations import (
    ensure_audit_log_table,
    ensure_billing_audits_table,
    ensure_clinics_table,
    ensure_compliance_issue_history_table,
    ensure_compliance_issues_table,
    ensure_compliance_rule_catalog_table,
    ensure_compliance_rules_table,
    ensure_confidence_scores_table,
    ensure_cpt_codes_table,
    ensure_cpt_reference_table,
    ensure_encounters_table,
    ensure_error_log_table,
    ensure_event_aggregates_table,
    ensure_events_table,
    ensure_exports_table,
    ensure_hcpcs_codes_table,
    ensure_icd10_codes_table,
    ensure_mfa_challenges_table,
    ensure_note_auto_saves_table,
    ensure_note_versions_table,
    ensure_notification_counters_table,
    ensure_notification_events_table,
    ensure_notifications_table,
    ensure_notes_table,
    ensure_patients_table,
    ensure_payer_schedule_table,
    ensure_password_reset_tokens_table,
    ensure_refresh_table,
    ensure_session_state_table,
    ensure_session_table,
    ensure_settings_table,
    ensure_shared_workflow_sessions_table,
    ensure_templates_table,
    ensure_user_profile_table,
    ensure_users_table,
    ensure_visit_sessions_table,
    seed_cpt_codes,
    seed_cpt_reference,
    seed_hcpcs_codes,
    seed_icd10_codes,
    seed_compliance_rules,
    seed_payer_schedules,
)
from backend import code_tables
from backend import patients
from backend import visits
from backend import scheduling
from backend.codes_data import load_code_metadata

logger = logging.getLogger(__name__)

_engine: Engine | None = None
SessionLocal: sessionmaker | None = None
_GLOBAL_CONN: sqlite3.Connection | None = None


def _data_dir() -> Path:
    path = Path(user_data_dir(APP_NAME, APP_NAME))
    path.mkdir(parents=True, exist_ok=True)
    return path


def _database_path() -> Path:
    override = os.getenv("ANALYTICS_DB_PATH")
    if override:
        path = Path(override).expanduser().resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        return path
    return (_data_dir() / "analytics.db").resolve()


DATABASE_PATH = _database_path()


def _initialise_engine() -> None:
    """Create the SQLAlchemy engine and session factory if needed."""

    global _engine, SessionLocal

    if _engine is not None:
        return

    old_db_path = Path(__file__).resolve().parent / "analytics.db"
    if old_db_path.exists() and not DATABASE_PATH.exists():
        try:  # pragma: no cover - defensive best-effort migration
            shutil.move(str(old_db_path), str(DATABASE_PATH))
        except Exception:
            logger.warning("db_migration_failed", old_path=str(old_db_path), new_path=str(DATABASE_PATH))

    _engine = create_engine(
        f"sqlite:///{DATABASE_PATH}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False, future=True)

    @event.listens_for(_engine, "connect")
    def _set_sqlite_row_factory(dbapi_connection, connection_record) -> None:  # pragma: no cover - simple hook
        dbapi_connection.row_factory = sqlite3.Row


def get_engine() -> Engine:
    """Return the configured SQLAlchemy engine."""

    _initialise_engine()
    assert _engine is not None
    return _engine


def _seed_reference_data(conn: sqlite3.Connection) -> None:
    try:
        existing_rules = conn.execute("SELECT COUNT(*) FROM compliance_rule_catalog").fetchone()[0]
    except sqlite3.Error as exc:  # pragma: no cover - defensive
        logger.warning("compliance_rules_table_inspect_failed", error=str(exc))
        return

    try:
        if existing_rules == 0:
            from backend import compliance as compliance_engine

            seed_compliance_rules(conn, compliance_engine.get_rules())

        metadata = load_code_metadata()
        cpt_metadata = {
            code: info
            for code, info in metadata.items()
            if (info.get("type") or "").upper() == "CPT"
        }

        existing_cpt_codes = conn.execute("SELECT COUNT(*) FROM cpt_codes").fetchone()[0]
        if existing_cpt_codes == 0:
            seed_cpt_codes(conn, code_tables.DEFAULT_CPT_CODES.items())

        existing_icd_codes = conn.execute("SELECT COUNT(*) FROM icd10_codes").fetchone()[0]
        if existing_icd_codes == 0:
            seed_icd10_codes(conn, code_tables.DEFAULT_ICD10_CODES.items())

        existing_hcpcs_codes = conn.execute("SELECT COUNT(*) FROM hcpcs_codes").fetchone()[0]
        if existing_hcpcs_codes == 0:
            seed_hcpcs_codes(conn, code_tables.DEFAULT_HCPCS_CODES.items())

        existing_cpt = conn.execute("SELECT COUNT(*) FROM cpt_reference").fetchone()[0]
        if existing_cpt == 0:
            seed_cpt_reference(conn, cpt_metadata.items())

        existing_schedules = conn.execute("SELECT COUNT(*) FROM payer_schedules").fetchone()[0]
        if existing_schedules == 0:
            schedules = []
            for code, info in cpt_metadata.items():
                reimbursement = info.get("reimbursement")
                if reimbursement in (None, ""):
                    continue
                rvu_value = info.get("rvu")
                base_amount = float(reimbursement)
                schedules.append(
                    {
                        "payer_type": "commercial",
                        "location": "",
                        "code": code,
                        "reimbursement": base_amount,
                        "rvu": rvu_value,
                    }
                )
                schedules.append(
                    {
                        "payer_type": "medicare",
                        "location": "",
                        "code": code,
                        "reimbursement": round(base_amount * 0.8, 2),
                        "rvu": rvu_value,
                    }
                )
            seed_payer_schedules(conn, schedules)

        conn.commit()
    except Exception as exc:  # pragma: no cover - best effort
        logger.warning("reference_data_seed_failed", error=str(exc))


def _initialise_schema(conn: sqlite3.Connection) -> None:
    ensure_users_table(conn)
    ensure_clinics_table(conn)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL NOT NULL, "
        "username TEXT, action TEXT NOT NULL, details TEXT)"
    )

    ensure_audit_log_table(conn)
    ensure_settings_table(conn)
    ensure_templates_table(conn)
    ensure_user_profile_table(conn)
    ensure_events_table(conn)
    ensure_refresh_table(conn)
    ensure_session_table(conn)
    ensure_password_reset_tokens_table(conn)
    ensure_mfa_challenges_table(conn)
    ensure_notes_table(conn)
    ensure_error_log_table(conn)
    ensure_exports_table(conn)
    ensure_patients_table(conn)
    ensure_encounters_table(conn)
    ensure_visit_sessions_table(conn)
    ensure_note_auto_saves_table(conn)
    ensure_note_versions_table(conn)
    ensure_session_state_table(conn)
    ensure_shared_workflow_sessions_table(conn)
    ensure_notifications_table(conn)
    ensure_event_aggregates_table(conn)
    ensure_compliance_issues_table(conn)
    ensure_compliance_issue_history_table(conn)
    ensure_compliance_rules_table(conn)
    ensure_confidence_scores_table(conn)
    ensure_notification_counters_table(conn)
    ensure_notification_events_table(conn)
    ensure_compliance_rule_catalog_table(conn)
    ensure_cpt_codes_table(conn)
    ensure_icd10_codes_table(conn)
    ensure_hcpcs_codes_table(conn)
    ensure_cpt_reference_table(conn)
    ensure_payer_schedule_table(conn)
    ensure_billing_audits_table(conn)

    patients.configure_database(conn)
    scheduling.configure_database(conn)
    from backend.compliance import configure_engine as configure_compliance_engine

    configure_compliance_engine(conn)
    _seed_reference_data(conn)
    conn.commit()


def use_connection(conn: sqlite3.Connection) -> None:
    """Bind the engine and session factory to an existing connection."""

    global _GLOBAL_CONN, _engine, SessionLocal

    _GLOBAL_CONN = conn
    _engine = create_engine(
        "sqlite://",
        creator=lambda: conn,
        poolclass=StaticPool,
        future=True,
    )
    SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False, future=True)


def initialise_schema(conn: sqlite3.Connection) -> None:
    """Expose schema initialisation for callers outside this module."""

    _initialise_schema(conn)


def reset_global_connection() -> None:
    """Close and clear the stored global connection (used in tests)."""

    global _GLOBAL_CONN
    if _GLOBAL_CONN is not None:
        try:
            _GLOBAL_CONN.close()
        except Exception:
            pass
    _GLOBAL_CONN = None


def get_connection() -> sqlite3.Connection:
    """Return a long-lived SQLite connection for compatibility helpers."""

    global _GLOBAL_CONN
    if _GLOBAL_CONN is not None:
        return _GLOBAL_CONN

    engine = get_engine()
    raw_conn = engine.raw_connection()
    raw_conn.row_factory = sqlite3.Row
    _initialise_schema(raw_conn)
    _GLOBAL_CONN = raw_conn
    return _GLOBAL_CONN


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a SQLAlchemy session tied to the engine."""

    if SessionLocal is None:
        _initialise_engine()
    assert SessionLocal is not None
    session: Session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def resolve_session_connection(session: Session) -> sqlite3.Connection:
    """Return the underlying SQLite connection for *session*."""

    connection = session.connection()
    dbapi_conn = connection.connection
    if hasattr(dbapi_conn, "connection"):
        dbapi_conn = dbapi_conn.connection
    assert isinstance(dbapi_conn, sqlite3.Connection)
    dbapi_conn.row_factory = sqlite3.Row
    return dbapi_conn


def initialise_for_tests() -> sqlite3.Connection:
    """Ensure the database schema exists and return a connection for tests."""

    reset_global_connection()
    return get_connection()


__all__ = [
    "DATABASE_PATH",
    "SessionLocal",
    "get_engine",
    "get_connection",
    "initialise_schema",
    "get_session",
    "initialise_for_tests",
    "resolve_session_connection",
    "reset_global_connection",
]


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

