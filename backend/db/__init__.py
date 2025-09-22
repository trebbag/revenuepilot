"""Database helpers for RevenuePilot."""

from backend.database_legacy import (
    DATA_DIR,
    DATABASE_PATH,
    DATABASE_URL,
    SQLITE_FILENAME,
    SQLITE_PATH,
    SessionLocal,
    connection_scope,
    engine,
    get_connection,
    get_db,
    get_session,
    get_sync_connection,
    initialise_for_tests,
    initialise_schema,
    reset_global_connection,
    resolve_session_connection,
    set_sync_connection,
    use_connection,
)

from .config import DatabaseSettings, get_database_settings
from .models import Base

__all__ = [
    "Base",
    "DATA_DIR",
    "DATABASE_PATH",
    "DATABASE_URL",
    "DatabaseSettings",
    "SessionLocal",
    "SQLITE_FILENAME",
    "SQLITE_PATH",
    "connection_scope",
    "engine",
    "get_connection",
    "get_database_settings",
    "get_db",
    "get_session",
    "get_sync_connection",
    "initialise_for_tests",
    "initialise_schema",
    "reset_global_connection",
    "resolve_session_connection",
    "set_sync_connection",
    "use_connection",
]
