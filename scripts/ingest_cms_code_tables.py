#!/usr/bin/env python3
"""Synchronise CPT, ICD-10 and HCPCS tables with official CMS datasets.

The script downloads datasets from the CMS Provider Data API and upserts the
records into the SQLite database used by the RevenuePilot backend.  Dataset IDs
are supplied via command line arguments or environment variables so the script
can target different releases without code changes.

Example usage::

    # Physician Fee Schedule (HCPCS), ICD-10 and HCPCS Level II datasets
    scripts/ingest_cms_code_tables.py \
        --cpt-dataset "$CMS_PFS_DATASET_ID" \
        --icd-dataset "$CMS_ICD10_DATASET_ID" \
        --hcpcs-dataset "$CMS_HCPCS_DATASET_ID"

Pass ``--interval 1440`` to re-run ingestion once per day.
"""

from __future__ import annotations

import argparse
import logging
import os
import sqlite3
import time
from typing import Any, Callable, Dict, Iterable, Iterator, Optional, Tuple

import requests

from backend import migrations
from sqlalchemy.orm import Session

DATA_API_BASE = "https://data.cms.gov/provider-data/api/1/datastore/query"
DEFAULT_PAGE_SIZE = 5000
LOGGER = logging.getLogger("cms_ingest")


def _to_float(value: Any) -> Optional[float]:
    if value in (None, "", "NA", "N/A"):
        return None
    try:
        if isinstance(value, str):
            value = value.replace(",", "").strip()
        return float(value)
    except (TypeError, ValueError):
        return None


def _pick_field(record: Dict[str, Any], *candidates: str) -> Any:
    lower_map = {key.lower(): key for key in record.keys()}
    for candidate in candidates:
        if candidate in record:
            return record[candidate]
        lower = candidate.lower()
        if lower in lower_map:
            return record[lower_map[lower]]
    for candidate in candidates:
        lower = candidate.lower()
        for key in record.keys():
            if lower in key.lower():
                return record[key]
    return None


def _transform_cpt(record: Dict[str, Any]) -> Optional[Tuple[str, Dict[str, Any]]]:
    raw_code = _pick_field(record, "hcpcs_code", "hcpcs_cd", "code")
    if not raw_code:
        return None
    code = str(raw_code).strip().upper()
    if not code:
        return None
    description = _pick_field(record, "hcpcs_description", "long_description", "short_description", "description")
    rvu = _pick_field(
        record,
        "non_facility_total_rvu",
        "total_rvu",
        "md_total_rvu",
        "rvu",
    )
    reimbursement = _pick_field(
        record,
        "non_facility_price",
        "non_facility_payment_amount",
        "payment_rate",
        "non_facility_rate",
    )
    info = {
        "description": description,
        "rvu": _to_float(rvu),
        "reimbursement": _to_float(reimbursement),
        "documentation": None,
        "icd10_prefixes": [],
        "demographics": None,
        "encounterTypes": [],
        "specialties": [],
    }
    return code, info


def _transform_icd(record: Dict[str, Any]) -> Optional[Tuple[str, Dict[str, Any]]]:
    raw_code = _pick_field(record, "icd10_code", "diagnosis_code", "code", "icd_code")
    if not raw_code:
        return None
    code = str(raw_code).strip().upper()
    if not code:
        return None
    description = _pick_field(record, "long_description", "full_code_title", "description")
    clinical_context = _pick_field(record, "clinical_context", "clinical_category", "clinical_classification")
    info = {
        "description": description,
        "clinicalContext": clinical_context,
        "contraindications": [],
        "documentation": None,
        "demographics": None,
        "encounterTypes": [],
        "specialties": [],
    }
    return code, info


def _transform_hcpcs(record: Dict[str, Any]) -> Optional[Tuple[str, Dict[str, Any]]]:
    raw_code = _pick_field(record, "hcpcs_code", "code")
    if not raw_code:
        return None
    code = str(raw_code).strip().upper()
    if not code:
        return None
    description = _pick_field(record, "long_description", "hcpcs_long_description", "description")
    rvu = _pick_field(record, "rvu", "total_rvu")
    reimbursement = _pick_field(record, "payment_rate", "non_facility_price", "nonfacility_price")
    coverage_status = _pick_field(record, "coverage_status", "status")
    coverage_notes = _pick_field(record, "coverage_notes", "note", "coverage_note")
    coverage: Dict[str, Any] = {}
    if coverage_status:
        coverage["status"] = coverage_status
    if coverage_notes:
        coverage["notes"] = coverage_notes
    info = {
        "description": description,
        "rvu": _to_float(rvu),
        "reimbursement": _to_float(reimbursement),
        "coverage": coverage or None,
        "documentation": None,
        "demographics": None,
        "encounterTypes": [],
        "specialties": [],
    }
    return code, info


def fetch_cms_dataset(
    dataset_id: str,
    *,
    session: requests.Session,
    app_token: Optional[str] = None,
    page_size: int = DEFAULT_PAGE_SIZE,
    limit: Optional[int] = None,
) -> Iterator[Dict[str, Any]]:
    """Yield records from the CMS provider data API for a dataset."""

    headers = {"Accept": "application/json"}
    if app_token:
        headers["X-App-Token"] = app_token
    offset = 0
    fetched = 0
    while True:
        if limit is not None and fetched >= limit:
            break
        current_size = page_size
        if limit is not None:
            remaining = limit - fetched
            if remaining <= 0:
                break
            current_size = min(page_size, remaining)
        params = {"offset": offset, "limit": current_size}
        url = f"{DATA_API_BASE}/{dataset_id}/0"
        resp = session.get(url, params=params, headers=headers, timeout=60)
        resp.raise_for_status()
        payload = resp.json()
        records = payload.get("results") if isinstance(payload, dict) else payload
        if not records:
            break
        for record in records:
            fetched += 1
            yield record
        if len(records) < current_size:
            break
        offset += current_size


Transformer = Callable[[Dict[str, Any]], Optional[Tuple[str, Dict[str, Any]]]]
Seeder = Callable[[Session, Iterable[Tuple[str, Dict[str, Any]]], bool], None]


def ingest_dataset(
    conn: sqlite3.Connection,
    *,
    dataset_id: Optional[str],
    transformer: Transformer,
    seeder: Seeder,
    label: str,
    app_token: Optional[str],
    limit: Optional[int],
    page_size: int,
    overwrite: bool,
) -> int:
    if not dataset_id:
        LOGGER.info("Skipping %s ingestion – no dataset ID provided", label)
        return 0

    session = requests.Session()
    try:
        rows: list[Tuple[str, Dict[str, Any]]] = []
        for raw in fetch_cms_dataset(
            dataset_id,
            session=session,
            app_token=app_token,
            page_size=page_size,
            limit=limit,
        ):
            transformed = transformer(raw)
            if transformed is None:
                continue
            code, info = transformed
            if not code:
                continue
            rows.append((code, info))
        if not rows:
            LOGGER.warning("No %s records were ingested from dataset %s", label, dataset_id)
            return 0
        with migrations.session_scope(conn) as orm_session:
            seeder(orm_session, rows, overwrite)
        LOGGER.info("Upserted %d %s rows", len(rows), label)
        return len(rows)
    except Exception as exc:  # pragma: no cover - network failure
        LOGGER.exception("Failed to ingest %s dataset %s: %s", label, dataset_id, exc)
        return 0
    finally:
        session.close()


def run_ingestion(conn: sqlite3.Connection, args: argparse.Namespace) -> Dict[str, int]:
    totals: Dict[str, int] = {}
    overwrite = not args.append
    totals["cpt"] = ingest_dataset(
        conn,
        dataset_id=args.cpt_dataset,
        transformer=_transform_cpt,
        seeder=lambda s, data, flag: migrations.seed_cpt_codes(s, data, overwrite=flag),
        label="CPT/HCPCS",
        app_token=args.app_token,
        limit=args.limit,
        page_size=args.page_size,
        overwrite=overwrite,
    )
    conn.commit()

    totals["icd10"] = ingest_dataset(
        conn,
        dataset_id=args.icd_dataset,
        transformer=_transform_icd,
        seeder=lambda s, data, flag: migrations.seed_icd10_codes(s, data, overwrite=flag),
        label="ICD-10",
        app_token=args.app_token,
        limit=args.limit,
        page_size=args.page_size,
        overwrite=overwrite,
    )
    conn.commit()

    totals["hcpcs"] = ingest_dataset(
        conn,
        dataset_id=args.hcpcs_dataset,
        transformer=_transform_hcpcs,
        seeder=lambda s, data, flag: migrations.seed_hcpcs_codes(s, data, overwrite=flag),
        label="HCPCS",
        app_token=args.app_token,
        limit=args.limit,
        page_size=args.page_size,
        overwrite=overwrite,
    )
    conn.commit()

    return totals


def ensure_tables(conn: sqlite3.Connection) -> None:
    migrations.create_all_tables(conn)
    conn.commit()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="CMS code table ingestion utility")
    parser.add_argument(
        "--database",
        default=os.environ.get("REVENUEPILOT_DB"),
        help="Path to the SQLite database (defaults to backend.main.DB_PATH).",
    )
    parser.add_argument("--cpt-dataset", default=os.environ.get("CMS_PFS_DATASET_ID"), help="CMS dataset ID for CPT/HCPCS pricing data.")
    parser.add_argument("--icd-dataset", default=os.environ.get("CMS_ICD10_DATASET_ID"), help="CMS dataset ID for ICD-10 codes.")
    parser.add_argument("--hcpcs-dataset", default=os.environ.get("CMS_HCPCS_DATASET_ID"), help="CMS dataset ID for HCPCS metadata.")
    parser.add_argument("--app-token", default=os.environ.get("CMS_APP_TOKEN"), help="CMS API app token (optional but recommended).")
    parser.add_argument("--limit", type=int, default=None, help="Limit the number of rows ingested from each dataset (for testing).")
    parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE, help="Number of records to request per API call.")
    parser.add_argument("--interval", type=int, default=0, help="Repeat ingestion every N minutes (0 to run once).")
    parser.add_argument("--append", action="store_true", help="Append to existing tables instead of overwriting them.")
    parser.add_argument("--log-level", default="INFO", help="Logging level (default: INFO).")
    return parser


def resolve_database_path(path: Optional[str]) -> str:
    if path:
        return path
    try:
        from backend import main as backend_main  # type: ignore

        return getattr(backend_main, "DB_PATH")
    except Exception:  # pragma: no cover - fallback when backend.main unavailable
        return os.path.join(os.getcwd(), "revenuepilot.db")


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO), format="%(asctime)s %(levelname)s %(message)s")

    db_path = resolve_database_path(args.database)
    LOGGER.info("Using database %s", db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    ensure_tables(conn)

    try:
        while True:
            totals = run_ingestion(conn, args)
            summary = ", ".join(f"{key}={value}" for key, value in totals.items())
            LOGGER.info("Ingestion complete: %s", summary)
            if args.interval <= 0:
                break
            LOGGER.info("Sleeping for %d minutes", args.interval)
            time.sleep(args.interval * 60)
    except KeyboardInterrupt:  # pragma: no cover - graceful shutdown
        LOGGER.info("Ingestion interrupted by user")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
