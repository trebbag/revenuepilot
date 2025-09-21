"""Database configuration helpers."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict

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
        if self.is_sqlite:
            connect_args["check_same_thread"] = False
        elif self.is_postgres:
            # Ensure UTC for migrations/connections. ``options`` is recognised by
            # libpq and avoids relying on per-session commands when available.
            connect_args.setdefault("options", "-c timezone=UTC")
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
