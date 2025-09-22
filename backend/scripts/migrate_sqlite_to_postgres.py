#!/usr/bin/env python3
"""Bulk migrate the legacy SQLite database into PostgreSQL.

Usage::

    python backend/scripts/migrate_sqlite_to_postgres.py \
        --sqlite sqlite:////path/to/legacy.db \
        --postgres postgresql://user:pass@host:5432/revenuepilot \
        [--chunk-size 5000] \
        [--resume users:1200] \
        [--report-prefix migration_report]

The script streams tables in dependency order (``clinics`` → ``users`` → ...),
converts Unix epoch timestamps to timezone-aware UTC datetimes, and performs
idempotent inserts using ``ON CONFLICT DO NOTHING`` so it can be resumed safely.
It emits human-readable progress logs to stdout and writes CSV/JSON summary
reports suitable for compliance evidence.

Safety checklist:

* Freeze application writes before running the migration.
* Take verified backups of both the source SQLite database and the destination
  PostgreSQL cluster.
* After the migration finishes, spot-check row counts and sampled records in
  both systems before allowing writes again.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence

import sqlalchemy as sa
from sqlalchemy import MetaData, Table, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.sql import ColumnElement


LOGGER = logging.getLogger("sqlite_to_postgres")


@dataclass
class TableReport:
    """Summary statistics for a single table copy."""

    table: str
    attempted: int = 0
    inserted: int = 0
    skipped: int = 0
    errors: int = 0
    start_pk: Optional[str] = None
    end_pk: Optional[str] = None
    error_messages: List[str] = field(default_factory=list)

    def as_csv_row(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["error_messages"] = " | ".join(self.error_messages)
        return payload


def configure_logging(verbose: bool = False) -> None:
    """Initialise the root logger so messages flow to stdout."""

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOGGER.addHandler(handler)
    LOGGER.setLevel(logging.DEBUG if verbose else logging.INFO)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    """Parse CLI arguments."""

    parser = argparse.ArgumentParser(description="Migrate SQLite data into PostgreSQL")
    parser.add_argument("--sqlite", required=True, help="SQLAlchemy URL for the legacy SQLite database")
    parser.add_argument("--postgres", required=True, help="SQLAlchemy URL for the target PostgreSQL database")
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=5000,
        help="Number of rows per batch (default: 5000)",
    )
    parser.add_argument(
        "--resume",
        action="append",
        default=[],
        metavar="TABLE:PK",
        help="Resume table processing strictly after the provided primary key value",
    )
    parser.add_argument(
        "--report-prefix",
        default="migration_report",
        help="Base filename for the CSV/JSON compliance reports",
    )
    parser.add_argument("--verbose", action="store_true", help="Enable verbose debug logging")
    return parser.parse_args(argv)


def build_resume_map(entries: Iterable[str]) -> Dict[str, str]:
    """Translate ``TABLE:PK`` tokens into a lookup dictionary."""

    resume: Dict[str, str] = {}
    for entry in entries:
        if not entry:
            continue
        token = entry.replace("=", ":", 1)
        if ":" not in token:
            raise ValueError(f"Invalid resume entry '{entry}'; expected TABLE:VALUE")
        table, value = token.split(":", 1)
        table = table.strip()
        value = value.strip()
        if not table or not value:
            raise ValueError(f"Invalid resume entry '{entry}'; expected TABLE:VALUE")
        resume[table] = value
    return resume


def create_engine(url: str) -> Engine:
    """Create a SQLAlchemy engine for the given URL."""

    options: Dict[str, Any] = {"future": True}
    if url.startswith("sqlite"):  # allow reuse across threads
        options.setdefault("connect_args", {"check_same_thread": False})
    engine = sa.create_engine(url, **options)
    return engine


def reflect_sqlite_metadata(engine: Engine) -> MetaData:
    """Reflect tables from the source SQLite database."""

    metadata = MetaData()
    metadata.reflect(bind=engine)
    return metadata


def determine_table_order(sqlite_metadata: MetaData) -> List[Table]:
    """Return tables sorted by foreign key dependencies.

    The function prefers the order encoded in ``backend.models`` metadata when
    available so that legacy dependency hints are respected.
    """

    order: List[Table] = []
    seen: set[str] = set()

    try:
        from backend import models as legacy_models  # type: ignore
    except Exception:  # pragma: no cover - metadata import is best-effort
        legacy_models = None

    if legacy_models is not None:
        for table in legacy_models.metadata.sorted_tables:
            if table.name in sqlite_metadata.tables and table.name not in seen:
                order.append(sqlite_metadata.tables[table.name])
                seen.add(table.name)

    for table in sqlite_metadata.sorted_tables:
        if table.name not in seen:
            order.append(table)
            seen.add(table.name)

    return order


def coerce_resume_value(column: sa.Column, value: str) -> Any:
    """Best-effort conversion of resume tokens to column-native types."""

    try:
        python_type = column.type.python_type  # type: ignore[attr-defined]
    except Exception:
        python_type = str
    try:
        if python_type is int:
            return int(value)
        if python_type is float:
            return float(value)
        if python_type is bool:
            return bool(int(value)) if value.isdigit() else value.lower() in {"true", "t", "1"}
        return python_type(value)
    except Exception:
        return value


def parse_epoch(value: Any) -> Optional[datetime]:
    """Coerce SQLite epoch timestamps into timezone-aware datetimes."""

    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        if value <= 0:
            return datetime.fromtimestamp(value, tz=timezone.utc)
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            numeric = float(stripped)
        except ValueError:
            try:
                parsed = datetime.fromisoformat(stripped)
            except ValueError:
                return None
            return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
        return datetime.fromtimestamp(numeric, tz=timezone.utc)
    return None


def normalise_value(column: sa.Column, value: Any) -> Any:
    """Convert SQLite payloads to PostgreSQL-friendly values."""

    if value is None:
        return None

    col_type = column.type
    if isinstance(col_type, sa.types.DateTime):
        converted = parse_epoch(value)
        if converted is not None:
            return converted
        if isinstance(value, datetime):
            return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(col_type, sa.types.JSON) and isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    if isinstance(col_type, sa.types.Boolean) and isinstance(value, (int, float, str)):
        if isinstance(value, str):
            return value.lower() in {"1", "true", "t", "yes"}
        return bool(value)
    return value


def iter_source_rows(
    conn: Connection,
    table: Table,
    chunk_size: int,
    resume_value: Optional[Any] = None,
) -> Iterator[List[Mapping[str, Any]]]:
    """Yield table rows in primary-key order."""

    pk_columns = list(table.primary_key.columns)
    order_by: List[ColumnElement[Any]] = [table.c[col.name] for col in pk_columns]

    if pk_columns and len(pk_columns) == 1:
        pk_col = pk_columns[0]
        last_pk = resume_value
        while True:
            query = select(table).order_by(*order_by).limit(chunk_size)
            if last_pk is not None:
                query = query.where(table.c[pk_col.name] > last_pk)
            result = conn.execute(query)
            rows = result.mappings().all()
            if not rows:
                break
            last_pk = rows[-1][pk_col.name]
            yield rows
    else:
        if resume_value is not None:
            LOGGER.warning(
                "Resume requested for table '%s' but primary key is composite or missing; ignoring token",
                table.name,
            )
        offset = 0
        while True:
            query = select(table)
            if order_by:
                query = query.order_by(*order_by)
            query = query.offset(offset).limit(chunk_size)
            result = conn.execute(query)
            rows = result.mappings().all()
            if not rows:
                break
            offset += len(rows)
            yield rows


def prepare_row(row: Mapping[str, Any], target_table: Table) -> Dict[str, Any]:
    """Normalise a row for insertion into the PostgreSQL table."""

    payload: Dict[str, Any] = {}
    for column in target_table.columns:
        if column.name not in row:
            continue
        payload[column.name] = normalise_value(column, row[column.name])
    return payload


def migrate_table(
    sqlite_conn: Connection,
    postgres_conn: Connection,
    source_table: Table,
    target_table: Table,
    chunk_size: int,
    resume_token: Optional[str],
) -> TableReport:
    """Copy a single table in batches."""

    report = TableReport(table=source_table.name, start_pk=resume_token)
    pk_columns = list(source_table.primary_key.columns)
    resume_value: Optional[Any] = None
    if resume_token and pk_columns:
        try:
            resume_value = coerce_resume_value(pk_columns[0], resume_token)
        except Exception:
            resume_value = resume_token

    for rows in iter_source_rows(sqlite_conn, source_table, chunk_size, resume_value):
        prepared_rows = [prepare_row(row, target_table) for row in rows]
        report.attempted += len(prepared_rows)
        if not prepared_rows:
            continue
        try:
            insert_stmt = pg_insert(target_table).values(prepared_rows)
            pk_target = list(target_table.primary_key.columns)
            if pk_target:
                insert_stmt = insert_stmt.on_conflict_do_nothing(
                    index_elements=[column.name for column in pk_target]
                )
            result = postgres_conn.execute(insert_stmt)
            inserted = result.rowcount if result.rowcount is not None else len(prepared_rows)
            report.inserted += inserted
            report.skipped += len(prepared_rows) - inserted
        except SQLAlchemyError as exc:  # pragma: no cover - requires live DB
            postgres_conn.rollback()
            message = f"{source_table.name}: {exc}"
            LOGGER.error(message)
            report.errors += len(prepared_rows)
            report.error_messages.append(str(exc))
            break
        except Exception as exc:  # pragma: no cover - defensive
            postgres_conn.rollback()
            message = f"{source_table.name}: unexpected error {exc}"
            LOGGER.error(message)
            report.errors += len(prepared_rows)
            report.error_messages.append(str(exc))
            break
        else:
            postgres_conn.commit()
            if pk_columns and len(pk_columns) == 1:
                report.end_pk = str(rows[-1][pk_columns[0].name])
    return report


def write_reports(reports: Sequence[TableReport], prefix: str) -> None:
    """Persist compliance reports to CSV and JSON files."""

    prefix_path = Path(prefix)
    if prefix_path.suffix:
        csv_path = prefix_path.with_suffix(".csv")
        json_path = prefix_path.with_suffix(".json")
    else:
        csv_path = prefix_path.parent / f"{prefix_path.name}.csv"
        json_path = prefix_path.parent / f"{prefix_path.name}.json"

    fieldnames = [
        "table",
        "attempted",
        "inserted",
        "skipped",
        "errors",
        "start_pk",
        "end_pk",
        "error_messages",
    ]

    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for report in reports:
            writer.writerow(report.as_csv_row())

    with json_path.open("w", encoding="utf-8") as handle:
        json.dump([asdict(report) for report in reports], handle, indent=2, default=str)

    LOGGER.info("Wrote reports to %s and %s", csv_path, json_path)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    configure_logging(args.verbose)

    try:
        resume_map = build_resume_map(args.resume)
    except ValueError as exc:
        LOGGER.error(str(exc))
        return 2

    sqlite_engine = create_engine(args.sqlite)
    postgres_engine = create_engine(args.postgres)

    sqlite_metadata = reflect_sqlite_metadata(sqlite_engine)
    ordered_tables = determine_table_order(sqlite_metadata)

    reports: List[TableReport] = []
    had_critical_error = False

    with sqlite_engine.connect() as sqlite_conn:
        for source_table in ordered_tables:
            LOGGER.info("Migrating table '%s'", source_table.name)
            resume_token = resume_map.get(source_table.name)
            target_metadata = MetaData()
            try:
                target_table = Table(
                    source_table.name,
                    target_metadata,
                    autoload_with=postgres_engine,
                )
            except SQLAlchemyError as exc:
                LOGGER.error("Table '%s' missing in PostgreSQL: %s", source_table.name, exc)
                reports.append(
                    TableReport(
                        table=source_table.name,
                        errors=1,
                        error_messages=[f"Missing in target database: {exc}"],
                        start_pk=resume_token,
                    )
                )
                had_critical_error = True
                continue

            with postgres_engine.connect() as postgres_conn:
                report = migrate_table(
                    sqlite_conn,
                    postgres_conn,
                    source_table,
                    target_table,
                    args.chunk_size,
                    resume_token,
                )
            LOGGER.info(
                "Completed '%s': attempted=%d inserted=%d skipped=%d errors=%d",
                report.table,
                report.attempted,
                report.inserted,
                report.skipped,
                report.errors,
            )
            if report.errors:
                had_critical_error = True
            reports.append(report)

    write_reports(reports, args.report_prefix)
    return 1 if had_critical_error else 0


if __name__ == "__main__":
    sys.exit(main())
