"""Database helpers for RevenuePilot."""

from __future__ import annotations

import importlib.util
from pathlib import Path

from .config import DatabaseSettings, get_database_settings
from .models import Base

_backend_dir = Path(__file__).resolve().parent.parent
_db_file = _backend_dir / "db.py"
_spec = importlib.util.spec_from_file_location("backend._db_module", _db_file)
assert _spec is not None and _spec.loader is not None
_db_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_db_module)

DATABASE_PATH = _db_module.DATABASE_PATH
SessionLocal = _db_module.SessionLocal
get_connection = _db_module.get_connection
initialise_schema = _db_module.initialise_schema
get_session = _db_module.get_session
resolve_session_connection = _db_module.resolve_session_connection
reset_global_connection = getattr(_db_module, "reset_global_connection", None)
DATA_DIR = getattr(_db_module, "DATA_DIR", None)
SQLITE_PATH = getattr(_db_module, "SQLITE_PATH", None)
get_sync_connection = getattr(_db_module, "get_sync_connection", None)
engine = getattr(_db_module, "engine", None)
set_sync_connection = getattr(_db_module, "set_sync_connection", None)

__all__ = [
    "Base",
    "DatabaseSettings",
    "get_database_settings",
    "DATABASE_PATH",
    "SessionLocal",
    "get_connection",
    "initialise_schema",
    "get_session",
    "resolve_session_connection",
    "reset_global_connection",
    "DATA_DIR",
    "SQLITE_PATH",
    "get_sync_connection",
    "engine",
    "set_sync_connection",
]
