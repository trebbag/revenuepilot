"""Alembic environment for RevenuePilot."""

from __future__ import annotations

import sys
from pathlib import Path

from alembic import context
import sqlalchemy as sa
from sqlalchemy import pool

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.db.config import get_database_settings  # noqa: E402
from backend.db.models import Base  # noqa: E402

config = context.config
settings = get_database_settings()
config.set_main_option("sqlalchemy.url", settings.url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""

    context.configure(
        url=settings.url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    engine_options = settings.engine_options()
    connect_args = engine_options.pop("connect_args", {})
    engine = sa.create_engine(
        settings.url,
        connect_args=connect_args,
        poolclass=pool.NullPool,
        **engine_options,
    )

    with engine.begin() as connection:
        if settings.is_postgres:
            connection.execute(sa.text("SET TIME ZONE 'UTC'"))
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            transaction_per_migration=True,
        )
        context.run_migrations()


def run_migrations() -> None:
    if context.is_offline_mode():
        run_migrations_offline()
    else:
        run_migrations_online()


run_migrations()
