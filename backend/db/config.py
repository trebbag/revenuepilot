"""Database configuration helpers."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional

from platformdirs import user_data_dir

from backend.key_manager import APP_NAME


@dataclass(frozen=True)
class DatabaseSettings:
    """Resolved database configuration for the application."""

    url: str
    echo: bool = False

    def engine_options(self) -> Dict[str, object]:
        """Return keyword arguments for :func:`sqlalchemy.create_engine`."""

        options: Dict[str, object] = {"echo": self.echo}
        connect_args: Dict[str, object] = {}
        pool_size = _get_int_env("DB_POOL_SIZE")
        if pool_size is not None:
            options["pool_size"] = pool_size
        max_overflow = _get_int_env("DB_MAX_OVERFLOW")
        if max_overflow is not None:
            options["max_overflow"] = max_overflow
        pool_timeout = _get_int_env("DB_POOL_TIMEOUT")
        if pool_timeout is not None:
            options["pool_timeout"] = pool_timeout
        if self.is_sqlite:
            connect_args["check_same_thread"] = False
        elif self.is_postgres:
            connect_timeout = _get_int_env("PGCONNECT_TIMEOUT")
            if connect_timeout is not None:
                connect_args["connect_timeout"] = connect_timeout
            statements = ["timezone=UTC"]
            statement_timeout = _get_int_env("STATEMENT_TIMEOUT_MS")
            if statement_timeout is not None:
                statements.append(f"statement_timeout={statement_timeout}")
            existing = connect_args.get("options")
            compiled = " ".join(f"-c {value}" for value in statements)
            connect_args["options"] = f"{existing} {compiled}".strip() if existing else compiled
        if connect_args:
            options["connect_args"] = connect_args
        return options

    @property
    def is_sqlite(self) -> bool:
        return self.url.startswith("sqlite")

    @property
    def is_postgres(self) -> bool:
        return self.url.startswith("postgresql") or self.url.startswith("postgres")


def _default_sqlite_path() -> Path:
    data_dir = Path(user_data_dir(APP_NAME, APP_NAME))
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "analytics.db"


def _normalise_sqlite_path(path: str | os.PathLike[str]) -> Path:
    resolved = Path(path).expanduser()
    if resolved.is_dir():
        resolved = resolved / "analytics.db"
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def _get_int_env(name: str) -> Optional[int]:
    raw = os.getenv(name)
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except ValueError as exc:  # pragma: no cover - clearly surface misconfiguration
        raise ValueError(f"Environment variable {name} must be an integer; got {raw!r}") from exc


@lru_cache(maxsize=1)
def get_database_settings() -> DatabaseSettings:
    """Return the active database settings derived from the environment."""

    url = os.getenv("REVENUEPILOT_DATABASE_URL") or os.getenv("DATABASE_URL")
    if url:
        return DatabaseSettings(url=url)

    path_override = os.getenv("REVENUEPILOT_DB_PATH")
    if path_override:
        db_path = _normalise_sqlite_path(path_override)
    else:
        db_path = _default_sqlite_path()

    return DatabaseSettings(url=f"sqlite:///{db_path}")
