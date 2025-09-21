"""Schema management helpers built on SQLAlchemy metadata."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, Iterable, Iterator, Mapping, Optional, Sequence, Tuple

import sqlalchemy as sa
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.db.models import (
    Base,
    CPTCode,
    CPTReference,
    ComplianceRuleCatalogEntry,
    HCPCSCode,
    ICD10Code,
    PayerSchedule,
)


_ENGINE_CACHE: Dict[int, Engine] = {}
_SESSION_FACTORY_CACHE: Dict[int, sessionmaker[Session]] = {}


def _engine_from_connection(conn: sqlite3.Connection) -> Engine:
    """Return (and cache) an SQLAlchemy engine bound to *conn*."""

    key = id(conn)
    engine = _ENGINE_CACHE.get(key)
    if engine is None:
        engine = sa.create_engine(
            "sqlite://",
            creator=lambda: conn,
            poolclass=StaticPool,
            future=True,
        )
        _ENGINE_CACHE[key] = engine
    return engine


def _session_factory(conn: sqlite3.Connection) -> sessionmaker[Session]:
    key = id(conn)
    factory = _SESSION_FACTORY_CACHE.get(key)
    if factory is None:
        factory = sessionmaker(
            bind=_engine_from_connection(conn),
            autoflush=False,
            expire_on_commit=False,
            future=True,
        )
        _SESSION_FACTORY_CACHE[key] = factory
    return factory


def create_all_tables(conn: sqlite3.Connection) -> None:
    """Create all database tables defined by the declarative models."""

    engine = _engine_from_connection(conn)
    Base.metadata.create_all(engine)


@contextmanager
def session_scope(conn: sqlite3.Connection) -> Iterator[Session]:
    """Context manager yielding a SQLAlchemy session bound to *conn*."""

    session = _session_factory(conn)()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _ensure_all(conn: sqlite3.Connection) -> None:
    create_all_tables(conn)


# Generate compatibility wrappers for legacy ensure_* helpers.
for _func_name in [
    "ensure_clinics_table",
    "ensure_users_table",
    "ensure_settings_table",
    "ensure_user_profile_table",
    "ensure_templates_table",
    "ensure_events_table",
    "ensure_event_aggregates_table",
    "ensure_confidence_scores_table",
    "ensure_compliance_rules_table",
    "ensure_compliance_issues_table",
    "ensure_compliance_issue_history_table",
    "ensure_billing_audits_table",
    "ensure_refresh_table",
    "ensure_notes_table",
    "ensure_error_log_table",
    "ensure_exports_table",
    "ensure_patients_table",
    "ensure_encounters_table",
    "ensure_visit_sessions_table",
    "ensure_session_table",
    "ensure_password_reset_tokens_table",
    "ensure_mfa_challenges_table",
    "ensure_audit_log_table",
    "ensure_note_auto_saves_table",
    "ensure_notification_counters_table",
    "ensure_notification_events_table",
    "ensure_compliance_rule_catalog_table",
    "ensure_cpt_codes_table",
    "ensure_icd10_codes_table",
    "ensure_hcpcs_codes_table",
    "ensure_cpt_reference_table",
    "ensure_payer_schedule_table",
    "ensure_note_versions_table",
    "ensure_notifications_table",
    "ensure_session_state_table",
    "ensure_shared_workflow_sessions_table",
]:
    def _factory(name: str) -> None:
        def _ensure(conn: sqlite3.Connection) -> None:
            _ensure_all(conn)

        _ensure.__name__ = name
        _ensure.__qualname__ = name
        _ensure.__doc__ = f"Ensure tables required by `{name}` exist."
        globals()[name] = _ensure

    _factory(_func_name)

del _func_name, _factory


def _as_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_list(value: Any) -> Optional[list[Any]]:
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray, dict)):
        return [item for item in value]
    if isinstance(value, Mapping):
        return [dict(value)]
    return None


def _as_dict(value: Any) -> Optional[dict[str, Any]]:
    if isinstance(value, Mapping):
        return dict(value)
    return None


def _get(mapping: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in mapping:
            return mapping[key]
    return None


def seed_compliance_rules(
    session: Session,
    rules: Iterable[Mapping[str, Any]],
    *,
    overwrite: bool = False,
) -> None:
    """Populate the compliance rule catalogue table."""

    if overwrite:
        session.execute(sa.delete(ComplianceRuleCatalogEntry))

    existing: set[str] = set()
    if not overwrite:
        existing = {
            row[0]
            for row in session.execute(sa.select(ComplianceRuleCatalogEntry.id))
        }

    for rule in rules:
        rule_id_raw = rule.get("id")
        rule_id = str(rule_id_raw or "").strip()
        if not rule_id:
            continue
        if not overwrite and rule_id in existing:
            continue
        citations = rule.get("references")
        keywords = rule.get("keywords")
        entry = ComplianceRuleCatalogEntry(
            id=rule_id,
            name=str(rule.get("name") or rule_id),
            category=rule.get("category"),
            priority=rule.get("severity"),
            citations=_as_list(citations) if citations is not None else None,
            keywords=_as_list(keywords) if keywords is not None else None,
        )
        session.merge(entry)


def seed_cpt_codes(
    session: Session,
    data: Iterable[Tuple[str, Mapping[str, Any]]],
    *,
    overwrite: bool = False,
) -> None:
    """Upsert CPT metadata rows."""

    if overwrite:
        session.execute(sa.delete(CPTCode))

    for code, info in data:
        if not code:
            continue
        entry = CPTCode(
            code=str(code),
            description=_get(info, "description"),
            rvu=_as_float(_get(info, "rvu")),
            reimbursement=_as_float(_get(info, "reimbursement")),
            documentation=_as_dict(_get(info, "documentation"))
            or _as_dict(_get(info, "documentationDetails")),
            icd10_prefixes=_as_list(_get(info, "icd10_prefixes", "icd10Prefixes")) or [],
            demographics=_as_dict(_get(info, "demographics")),
            encounter_types=_as_list(_get(info, "encounter_types", "encounterTypes")) or [],
            specialties=_as_list(_get(info, "specialties")) or [],
            last_updated=_get(info, "lastUpdated", "updated"),
        )
        session.merge(entry)


def seed_icd10_codes(
    session: Session,
    data: Iterable[Tuple[str, Mapping[str, Any]]],
    *,
    overwrite: bool = False,
) -> None:
    """Upsert ICD-10 metadata rows."""

    if overwrite:
        session.execute(sa.delete(ICD10Code))

    for code, info in data:
        if not code:
            continue
        entry = ICD10Code(
            code=str(code),
            description=_get(info, "description"),
            clinical_context=_get(info, "clinicalContext", "clinical_context"),
            contraindications=_as_list(_get(info, "contraindications")) or [],
            documentation=_as_dict(_get(info, "documentation")),
            demographics=_as_dict(_get(info, "demographics")),
            encounter_types=_as_list(_get(info, "encounterTypes", "encounter_types")) or [],
            specialties=_as_list(_get(info, "specialties")) or [],
            last_updated=_get(info, "lastUpdated", "updated"),
        )
        session.merge(entry)


def seed_hcpcs_codes(
    session: Session,
    data: Iterable[Tuple[str, Mapping[str, Any]]],
    *,
    overwrite: bool = False,
) -> None:
    """Upsert HCPCS metadata rows."""

    if overwrite:
        session.execute(sa.delete(HCPCSCode))

    for code, info in data:
        if not code:
            continue
        entry = HCPCSCode(
            code=str(code),
            description=_get(info, "description"),
            rvu=_as_float(_get(info, "rvu")),
            reimbursement=_as_float(_get(info, "reimbursement")),
            coverage=_as_dict(_get(info, "coverage")),
            documentation=_as_dict(_get(info, "documentation")),
            demographics=_as_dict(_get(info, "demographics")),
            encounter_types=_as_list(_get(info, "encounterTypes", "encounter_types")) or [],
            specialties=_as_list(_get(info, "specialties")) or [],
            last_updated=_get(info, "lastUpdated", "updated"),
        )
        session.merge(entry)


def seed_cpt_reference(
    session: Session,
    data: Iterable[Tuple[str, Mapping[str, Any]]],
    *,
    overwrite: bool = False,
) -> None:
    """Populate CPT reference reimbursement data."""

    if overwrite:
        session.execute(sa.delete(CPTReference))

    for code, info in data:
        if not code:
            continue
        entry = CPTReference(
            code=str(code),
            description=_get(info, "description"),
            base_rvu=_as_float(_get(info, "rvu", "base_rvu")),
            base_reimbursement=_as_float(_get(info, "reimbursement", "base_reimbursement")),
        )
        session.merge(entry)


def seed_payer_schedules(
    session: Session,
    schedules: Iterable[Mapping[str, Any]],
    *,
    overwrite: bool = False,
) -> None:
    """Insert payer-specific reimbursement schedules."""

    if overwrite:
        session.execute(sa.delete(PayerSchedule))

    for entry in schedules:
        payer_type = entry.get("payer_type") or entry.get("payerType")
        code = entry.get("code")
        if not payer_type or not code:
            continue
        location = entry.get("location") or ""
        schedule = PayerSchedule(
            payer_type=str(payer_type).lower(),
            location=str(location),
            code=str(code),
            reimbursement=_as_float(entry.get("reimbursement")),
            rvu=_as_float(entry.get("rvu")),
        )
        session.merge(schedule)


__all__ = [
    "create_all_tables",
    "session_scope",
    "seed_compliance_rules",
    "seed_cpt_codes",
    "seed_icd10_codes",
    "seed_hcpcs_codes",
    "seed_cpt_reference",
    "seed_payer_schedules",
] + [name for name in globals() if name.startswith("ensure_")]
