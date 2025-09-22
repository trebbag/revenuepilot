#!/usr/bin/env python3
"""Run preflight checks before migrating from SQLite to Postgres."""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional

from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError


@dataclass
class CheckOutcome:
    """Represents the result of a single validation step."""

    label: str
    ok: bool
    details: Optional[str] = None

    def render(self) -> str:
        status = "OK" if self.ok else "FAIL"
        if self.details:
            return f"[{status}] {self.label}: {self.details}"
        return f"[{status}] {self.label}"


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate database connectivity and migration readiness before cutover.",
    )
    parser.add_argument(
        "--sqlite-path",
        required=True,
        help="Path to the source SQLite database file (opened read-only).",
    )
    parser.add_argument(
        "--postgres-url",
        required=True,
        help=(
            "SQLAlchemy URL for the target Postgres database (e.g. "
            "postgresql+psycopg://user:password@host:5432/dbname)."
        ),
    )
    parser.add_argument(
        "--alembic-config",
        default=str(Path("backend/alembic/alembic.ini")),
        help="Path to the Alembic configuration file used for migrations.",
    )
    parser.add_argument(
        "--aws-rds-ca-path",
        help=(
            "Optional path to the AWS RDS combined CA bundle. When provided "
            "the file must exist and will be injected into the Postgres "
            "connection with sslmode=verify-full."
        ),
    )
    parser.add_argument(
        "--confirm-backups",
        action="store_true",
        help="Confirm that automated backups and on-demand snapshots are configured.",
    )
    parser.add_argument(
        "--confirm-maintenance-window",
        action="store_true",
        help="Confirm that a maintenance window is defined for the migration cutover.",
    )
    parser.add_argument(
        "--confirm-alerting",
        action="store_true",
        help="Confirm that alerting/on-call notifications are wired to the new Postgres stack.",
    )
    return parser.parse_args(argv)


def check_sqlite(sqlite_path: Path) -> CheckOutcome:
    if sqlite_path.is_dir():
        return CheckOutcome(
            "SQLite connectivity",
            False,
            f"{sqlite_path} is a directory; provide the path to the database file.",
        )
    if not sqlite_path.exists():
        return CheckOutcome(
            "SQLite connectivity",
            False,
            f"{sqlite_path} does not exist.",
        )
    try:
        conn = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    except sqlite3.Error as exc:
        return CheckOutcome("SQLite connectivity", False, f"unable to open database: {exc}")

    try:
        conn.execute("SELECT 1")
    except sqlite3.Error as exc:
        return CheckOutcome("SQLite connectivity", False, f"query failed: {exc}")
    finally:
        conn.close()
    return CheckOutcome("SQLite connectivity", True, "opened read-only and responded to SELECT 1")


def _postgres_engine(postgres_url: str, ca_path: Optional[Path]) -> Engine:
    connect_args: dict[str, object] = {}
    if ca_path is not None:
        connect_args["sslrootcert"] = str(ca_path)
        connect_args.setdefault("sslmode", "verify-full")
    # Match the backend default of enforcing UTC when possible by threading
    # the libpq options parameter through the engine creation path.
    options = os.getenv("PGOPTIONS")
    if options:
        connect_args.setdefault("options", options)
    else:
        connect_args.setdefault("options", "-c timezone=UTC")
    return create_engine(postgres_url, connect_args=connect_args, future=True)


def check_postgres(postgres_url: str, ca_path: Optional[Path]) -> CheckOutcome:
    try:
        engine = _postgres_engine(postgres_url, ca_path)
    except SQLAlchemyError as exc:
        return CheckOutcome("Postgres connectivity", False, f"failed to initialise engine: {exc}")

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        return CheckOutcome("Postgres connectivity", False, f"SELECT 1 failed: {exc}")
    finally:
        engine.dispose()
    if ca_path:
        details = "connection established using supplied CA bundle"
    else:
        details = "connection established"
    return CheckOutcome("Postgres connectivity", True, details)


def _script_directory(cfg_path: Path) -> ScriptDirectory:
    cfg = Config(str(cfg_path))
    cfg.set_main_option("script_location", str(cfg_path.parent.resolve()))
    return ScriptDirectory.from_config(cfg)


def check_pending_migrations(
    postgres_url: str, alembic_config: Path, ca_path: Optional[Path]
) -> CheckOutcome:
    cfg_path = alembic_config.resolve()
    if not cfg_path.exists():
        return CheckOutcome(
            "Alembic revisions",
            False,
            f"alembic config not found at {cfg_path}",
        )

    try:
        script = _script_directory(cfg_path)
    except Exception as exc:  # pragma: no cover - defensive guard
        return CheckOutcome("Alembic revisions", False, f"failed to load migrations: {exc}")

    head_revisions = script.get_heads()
    if len(head_revisions) > 1:
        return CheckOutcome(
            "Alembic revisions",
            False,
            "multiple heads detected; resolve branches before deployment",
        )

    engine = _postgres_engine(postgres_url, ca_path)
    try:
        with engine.connect() as connection:
            context = MigrationContext.configure(connection)
            current_revision = context.get_current_revision()
    except SQLAlchemyError as exc:
        return CheckOutcome("Alembic revisions", False, f"failed to inspect version table: {exc}")
    finally:
        engine.dispose()

    head_revision = head_revisions[0] if head_revisions else None
    if head_revision is None:
        return CheckOutcome("Alembic revisions", True, "no migrations defined")

    if current_revision == head_revision:
        return CheckOutcome("Alembic revisions", True, f"database is at head ({head_revision})")

    lower = current_revision or "base"
    pending = list(script.iterate_revisions(head_revision, lower))
    pending_ids = [rev.revision for rev in reversed(pending)]
    detail = "pending revisions: " + ", ".join(pending_ids)
    return CheckOutcome("Alembic revisions", False, detail)


def check_rds_ca(path: Optional[str]) -> Optional[CheckOutcome]:
    if not path:
        return None
    ca_path = Path(path).expanduser().resolve()
    if not ca_path.exists():
        return CheckOutcome("AWS RDS CA bundle", False, f"{ca_path} does not exist")
    if ca_path.is_dir():
        combined = ca_path / "rds-combined-ca-bundle.pem"
        if not combined.exists():
            return CheckOutcome(
                "AWS RDS CA bundle",
                False,
                f"directory {ca_path} does not contain rds-combined-ca-bundle.pem",
            )
        ca_path = combined
    if not ca_path.is_file():
        return CheckOutcome("AWS RDS CA bundle", False, f"{ca_path} is not a file")
    return CheckOutcome("AWS RDS CA bundle", True, f"found {ca_path}")


def confirm_boolean(flag: bool, label: str) -> CheckOutcome:
    if flag:
        return CheckOutcome(label, True)
    return CheckOutcome(label, False, "confirmation flag not supplied")


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    sqlite_path = Path(args.sqlite_path).expanduser().resolve()
    ca_outcome = check_rds_ca(args.aws_rds_ca_path)
    ca_path = None
    outcomes: List[CheckOutcome] = []
    if ca_outcome is not None:
        outcomes.append(ca_outcome)
        if ca_outcome.ok:
            ca_path = Path(args.aws_rds_ca_path).expanduser().resolve()

    outcomes.append(check_sqlite(sqlite_path))
    outcomes.append(check_postgres(args.postgres_url, ca_path))
    outcomes.append(check_pending_migrations(args.postgres_url, Path(args.alembic_config), ca_path))
    outcomes.append(confirm_boolean(args.confirm_backups, "Backups configured"))
    outcomes.append(
        confirm_boolean(
            args.confirm_maintenance_window,
            "Maintenance window scheduled",
        )
    )
    outcomes.append(confirm_boolean(args.confirm_alerting, "Alerting wired to on-call"))

    print("\n".join(item.render() for item in outcomes))

    if all(item.ok for item in outcomes):
        return 0

    failed = [item for item in outcomes if not item.ok]
    print(f"\n{len(failed)} check(s) failed. Resolve them before migrating.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
