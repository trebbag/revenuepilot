
"""SQLAlchemy models mirroring the legacy SQLite schema."""

from __future__ import annotations

import enum
import json
from datetime import date as date_cls, datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import declarative_base


Base = declarative_base()
legacy_metadata = sa.MetaData()

clinics = sa.Table(
    "clinics",
    legacy_metadata,
    sa.Column("id", sa.Text, primary_key=True),
    sa.Column("code", sa.Text, nullable=False, unique=True),
    sa.Column("name", sa.Text),
    sa.Column("settings", sa.Text),
    sa.Column("active", sa.Integer, nullable=False, server_default=sa.text("1")),
    sa.Column("created_at", sa.Float, nullable=False),
)

users = sa.Table(
    "users",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("username", sa.Text, unique=True),
    sa.Column("email", sa.Text, unique=True),
    sa.Column("password_hash", sa.Text, nullable=False),
    sa.Column("name", sa.Text),
    sa.Column("role", sa.Text, nullable=False),
    sa.Column("clinic_id", sa.Text, sa.ForeignKey("clinics.id")),
    sa.Column("mfa_enabled", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("mfa_secret", sa.Text),
    sa.Column("account_locked_until", sa.Float),
    sa.Column("failed_login_attempts", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("last_login", sa.Float),
    sa.Column("created_at", sa.Float, nullable=False),
    sa.Column("updated_at", sa.Float, nullable=False),
    sqlite_autoincrement=True,
)
sa.Index("idx_users_clinic", users.c.clinic_id)

settings = sa.Table(
    "settings",
    legacy_metadata,
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), primary_key=True),
    sa.Column("theme", sa.Text, nullable=False),
    sa.Column("categories", sa.Text, nullable=False, server_default=sa.text("'{}'")),
    sa.Column("rules", sa.Text, nullable=False, server_default=sa.text("'[]'")),
    sa.Column("lang", sa.Text, nullable=False, server_default=sa.text("'en'")),
    sa.Column("summary_lang", sa.Text, nullable=False, server_default=sa.text("'en'")),
    sa.Column("specialty", sa.Text),
    sa.Column("payer", sa.Text),
    sa.Column("region", sa.Text),
    sa.Column("template", sa.Integer),
    sa.Column("use_local_models", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("agencies", sa.Text, nullable=False, server_default=sa.text("'[]'")),
    sa.Column("use_offline_mode", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("layout_prefs", sa.Text, nullable=False, server_default=sa.text("'{}'")),
)

user_profile = sa.Table(
    "user_profile",
    legacy_metadata,
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), primary_key=True),
    sa.Column("current_view", sa.Text),
    sa.Column("clinic", sa.Text),
    sa.Column("preferences", sa.Text),
    sa.Column("ui_preferences", sa.Text),
)

templates = sa.Table(
    "templates",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("user", sa.Text),
    sa.Column("clinic", sa.Text),
    sa.Column("specialty", sa.Text),
    sa.Column("payer", sa.Text),
    sa.Column("name", sa.Text),
    sa.Column("content", sa.Text),
    sqlite_autoincrement=True,
)

events = sa.Table(
    "events",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("eventType", sa.Text, nullable=False),
    sa.Column("timestamp", sa.Float, nullable=False),
    sa.Column("details", sa.Text),
    sa.Column("revenue", sa.Float),
    sa.Column("time_to_close", sa.Float),
    sa.Column("codes", sa.Text),
    sa.Column("compliance_flags", sa.Text),
    sa.Column("public_health", sa.Integer),
    sa.Column("satisfaction", sa.Integer),
    sqlite_autoincrement=True,
)
sa.Index("idx_events_timestamp", events.c.timestamp)
sa.Index("idx_events_type", events.c.eventType)

event_aggregates = sa.Table(
    "event_aggregates",
    legacy_metadata,
    sa.Column("day", sa.Text, primary_key=True),
    sa.Column("start_ts", sa.Float, nullable=False),
    sa.Column("end_ts", sa.Float, nullable=False),
    sa.Column("total_events", sa.Integer, nullable=False),
    sa.Column("metrics", sa.Text, nullable=False),
    sa.Column("computed_at", sa.Float, nullable=False),
)

confidence_scores = sa.Table(
    "confidence_scores",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
    sa.Column("note_id", sa.Text),
    sa.Column("code", sa.Text, nullable=False),
    sa.Column("confidence", sa.Float),
    sa.Column("accepted", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("created_at", sa.Float, nullable=False),
    sqlite_autoincrement=True,
)

compliance_rules = sa.Table(
    "compliance_rules",
    legacy_metadata,
    sa.Column("id", sa.Text, primary_key=True),
    sa.Column("name", sa.Text, nullable=False),
    sa.Column("description", sa.Text, nullable=False),
    sa.Column("category", sa.Text),
    sa.Column("severity", sa.Text),
    sa.Column("type", sa.Text, nullable=False),
    sa.Column("metadata", sa.Text),
    sa.Column("references", sa.Text),
    sa.Column("created_at", sa.Float, nullable=False),
    sa.Column("updated_at", sa.Float, nullable=False),
)

compliance_issues = sa.Table(
    "compliance_issues",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("issue_id", sa.Text, nullable=False, unique=True),
    sa.Column("rule_id", sa.Text),
    sa.Column("title", sa.Text, nullable=False),
    sa.Column("severity", sa.Text, nullable=False),
    sa.Column("category", sa.Text),
    sa.Column("status", sa.Text, nullable=False),
    sa.Column("note_excerpt", sa.Text),
    sa.Column("metadata", sa.Text),
    sa.Column("created_at", sa.Float, nullable=False),
    sa.Column("updated_at", sa.Float, nullable=False),
    sa.Column("created_by", sa.Text),
    sa.Column("assignee", sa.Text),
    sqlite_autoincrement=True,
)

compliance_issue_history = sa.Table(
    "compliance_issue_history",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("issue_id", sa.Text, nullable=False),
    sa.Column("code", sa.Text),
    sa.Column("payer", sa.Text),
    sa.Column("findings", sa.Text),
    sa.Column("created_at", sa.Float, nullable=False),
    sa.Column("user_id", sa.Text),
    sqlite_autoincrement=True,
)
sa.Index("idx_compliance_history_issue", compliance_issue_history.c.issue_id)
sa.Index("idx_compliance_history_code", compliance_issue_history.c.code)
sa.Index("idx_compliance_history_created_at", compliance_issue_history.c.created_at)

billing_audits = sa.Table(
    "billing_audits",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("audit_id", sa.Text, nullable=False, server_default=sa.text("''")),
    sa.Column("code", sa.Text),
    sa.Column("payer", sa.Text),
    sa.Column("findings", sa.Text),
    sa.Column("created_at", sa.Float, nullable=False),
    sa.Column("user_id", sa.Text),
    sqlite_autoincrement=True,
)
sa.Index("idx_billing_audits_audit", billing_audits.c.audit_id)
sa.Index("idx_billing_audits_code", billing_audits.c.code)
sa.Index("idx_billing_audits_created_at", billing_audits.c.created_at)

refresh_tokens = sa.Table(
    "refresh_tokens",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
    sa.Column("token_hash", sa.Text, nullable=False),
    sa.Column("expires_at", sa.Float, nullable=False),
    sqlite_autoincrement=True,
)
sa.Index("idx_refresh_user", refresh_tokens.c.user_id)

sessions = sa.Table(
    "sessions",
    legacy_metadata,
    sa.Column("id", sa.Text, primary_key=True),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
    sa.Column("token_hash", sa.Text),
    sa.Column("refresh_token_hash", sa.Text),
    sa.Column("expires_at", sa.Float, nullable=False),
    sa.Column("created_at", sa.Float, nullable=False),
    sa.Column("last_accessed", sa.Float, nullable=False),
    sa.Column("ip_address", sa.Text),
    sa.Column("user_agent", sa.Text),
    sa.Column("offline_session", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("metadata", sa.Text),
)
sa.Index("idx_sessions_user", sessions.c.user_id)

password_reset_tokens = sa.Table(
    "password_reset_tokens",
    legacy_metadata,
    sa.Column("id", sa.Text, primary_key=True),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
    sa.Column("token_hash", sa.Text, nullable=False),
    sa.Column("expires_at", sa.Float, nullable=False),
    sa.Column("used", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("created_at", sa.Float, nullable=False),
)
sa.Index("idx_password_reset_user", password_reset_tokens.c.user_id)
sa.Index("idx_password_reset_expiry", password_reset_tokens.c.expires_at)

mfa_challenges = sa.Table(
    "mfa_challenges",
    legacy_metadata,
    sa.Column("session_token", sa.Text, primary_key=True),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
    sa.Column("code_hash", sa.Text, nullable=False),
    sa.Column("method", sa.Text, nullable=False),
    sa.Column("expires_at", sa.Float, nullable=False),
    sa.Column("attempts", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("last_sent", sa.Float, nullable=False),
    sa.Column("remember_me", sa.Integer, nullable=False, server_default=sa.text("0")),
)

audit_log = sa.Table(
    "audit_log",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("timestamp", sa.Float, nullable=False),
    sa.Column("username", sa.Text),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
    sa.Column("clinic_id", sa.Text, sa.ForeignKey("clinics.id")),
    sa.Column("action", sa.Text, nullable=False),
    sa.Column("details", sa.Text),
    sa.Column("ip_address", sa.Text),
    sa.Column("user_agent", sa.Text),
    sa.Column("success", sa.Integer),
    sqlite_autoincrement=True,
)
sa.Index("idx_audit_log_user", audit_log.c.user_id, audit_log.c.timestamp)
sa.Index("idx_audit_log_action", audit_log.c.action)

note_auto_saves = sa.Table(
    "note_auto_saves",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
    sa.Column("note_id", sa.Integer),
    sa.Column("content", sa.Text),
    sa.Column("updated_at", sa.Float),
    sqlite_autoincrement=True,
)

note_versions = sa.Table(
    "note_versions",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("note_id", sa.Text, nullable=False),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
    sa.Column("content", sa.Text),
    sa.Column("created_at", sa.Float),
    sqlite_autoincrement=True,
)

notes = sa.Table(
    "notes",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("content", sa.Text),
    sa.Column("status", sa.Text, nullable=False, server_default=sa.text("'draft'")),
    sa.Column("created_at", sa.Float),
    sa.Column("updated_at", sa.Float),
    sqlite_autoincrement=True,
)

error_log = sa.Table(
    "error_log",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("timestamp", sa.Float, nullable=False),
    sa.Column("username", sa.Text),
    sa.Column("message", sa.Text, nullable=False),
    sa.Column("stack", sa.Text),
    sqlite_autoincrement=True,
)

exports = sa.Table(
    "exports",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("timestamp", sa.Float, nullable=False),
    sa.Column("ehr", sa.Text),
    sa.Column("note", sa.Text),
    sa.Column("status", sa.Text),
    sa.Column("detail", sa.Text),
    sqlite_autoincrement=True,
)

patients = sa.Table(
    "patients",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("first_name", sa.Text),
    sa.Column("last_name", sa.Text),
    sa.Column("dob", sa.Text),
    sa.Column("mrn", sa.Text),
    sa.Column("gender", sa.Text),
    sa.Column("insurance", sa.Text),
    sa.Column("last_visit", sa.Text),
    sa.Column("allergies", sa.Text),
    sa.Column("medications", sa.Text),
    sqlite_autoincrement=True,
)
sa.Index("idx_patients_last_first", patients.c.last_name, patients.c.first_name)
sa.Index("idx_patients_mrn", patients.c.mrn)
sa.Index("idx_patients_dob", patients.c.dob)

encounters = sa.Table(
    "encounters",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("patient_id", sa.Integer, sa.ForeignKey("patients.id"), nullable=False),
    sa.Column("date", sa.Text),
    sa.Column("type", sa.Text),
    sa.Column("provider", sa.Text),
    sa.Column("description", sa.Text),
    sqlite_autoincrement=True,
)
sa.Index("idx_encounters_patient", encounters.c.patient_id)
sa.Index("idx_encounters_date", encounters.c.date)

visit_sessions = sa.Table(
    "visit_sessions",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("encounter_id", sa.Integer, sa.ForeignKey("encounters.id"), nullable=False),
    sa.Column("patient_id", sa.Text),
    sa.Column("status", sa.Text, nullable=False),
    sa.Column("start_time", sa.Text),
    sa.Column("last_resumed_at", sa.Text),
    sa.Column("end_time", sa.Text),
    sa.Column("duration_seconds", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("meta", sa.JSON),
    sqlite_autoincrement=True,
)

notification_counters = sa.Table(
    "notification_counters",
    legacy_metadata,
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), primary_key=True),
    sa.Column("count", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("updated_at", sa.Float, nullable=False),
)

notification_events = sa.Table(
    "notification_events",
    legacy_metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("event_id", sa.Text, nullable=False, unique=True),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
    sa.Column("title", sa.Text, nullable=False),
    sa.Column("message", sa.Text, nullable=False),
    sa.Column("severity", sa.Text, nullable=False),
    sa.Column("created_at", sa.Float, nullable=False),
    sa.Column("updated_at", sa.Float, nullable=False),
    sa.Column("is_read", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("read_at", sa.Float),
    sqlite_autoincrement=True,
)
sa.Index("idx_notification_events_user", notification_events.c.user_id, notification_events.c.created_at)
sa.Index("idx_notification_events_unread", notification_events.c.user_id, notification_events.c.is_read)

notifications = sa.Table(
    "notifications",
    legacy_metadata,
    sa.Column("username", sa.Text, primary_key=True),
    sa.Column("count", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("updated_at", sa.Float),
)

session_state = sa.Table(
    "session_state",
    legacy_metadata,
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), primary_key=True),
    sa.Column("data", sa.Text),
    sa.Column("updated_at", sa.Float),
)

shared_workflow_sessions = sa.Table(
    "shared_workflow_sessions",
    legacy_metadata,
    sa.Column("session_id", sa.Text, primary_key=True),
    sa.Column("owner_username", sa.Text),
    sa.Column("data", sa.Text, nullable=False),
    sa.Column("updated_at", sa.Float, nullable=False),
)
sa.Index(
    "idx_shared_workflow_sessions_owner",
    shared_workflow_sessions.c.owner_username,
)

compliance_rule_catalog = sa.Table(
    "compliance_rule_catalog",
    legacy_metadata,
    sa.Column("id", sa.Text, primary_key=True),
    sa.Column("name", sa.Text, nullable=False),
    sa.Column("category", sa.Text),
    sa.Column("priority", sa.Text),
    sa.Column("citations", sa.Text),
    sa.Column("keywords", sa.Text),
)

cpt_codes = sa.Table(
    "cpt_codes",
    legacy_metadata,
    sa.Column("code", sa.Text, primary_key=True),
    sa.Column("description", sa.Text),
    sa.Column("rvu", sa.Float),
    sa.Column("reimbursement", sa.Float),
    sa.Column("documentation", sa.Text),
    sa.Column("icd10_prefixes", sa.Text),
    sa.Column("demographics", sa.Text),
    sa.Column("encounter_types", sa.Text),
    sa.Column("specialties", sa.Text),
    sa.Column("last_updated", sa.Text),
)

icd10_codes = sa.Table(
    "icd10_codes",
    legacy_metadata,
    sa.Column("code", sa.Text, primary_key=True),
    sa.Column("description", sa.Text),
    sa.Column("clinical_context", sa.Text),
    sa.Column("contraindications", sa.Text),
    sa.Column("documentation", sa.Text),
    sa.Column("demographics", sa.Text),
    sa.Column("encounter_types", sa.Text),
    sa.Column("specialties", sa.Text),
    sa.Column("last_updated", sa.Text),
)

hcpcs_codes = sa.Table(
    "hcpcs_codes",
    legacy_metadata,
    sa.Column("code", sa.Text, primary_key=True),
    sa.Column("description", sa.Text),
    sa.Column("rvu", sa.Float),
    sa.Column("reimbursement", sa.Float),
    sa.Column("coverage", sa.Text),
    sa.Column("documentation", sa.Text),
    sa.Column("demographics", sa.Text),
    sa.Column("encounter_types", sa.Text),
    sa.Column("specialties", sa.Text),
    sa.Column("last_updated", sa.Text),
)

cpt_reference = sa.Table(
    "cpt_reference",
    legacy_metadata,
    sa.Column("code", sa.Text, primary_key=True),
    sa.Column("description", sa.Text),
    sa.Column("base_rvu", sa.Float),
    sa.Column("base_reimbursement", sa.Float),
)

payer_schedules = sa.Table(
    "payer_schedules",
    legacy_metadata,
    sa.Column("payer_type", sa.Text, primary_key=True),
    sa.Column("location", sa.Text, primary_key=True, server_default=sa.text("''")),
    sa.Column("code", sa.Text, primary_key=True),
    sa.Column("reimbursement", sa.Float),
    sa.Column("rvu", sa.Float),
)


def _utcnow() -> datetime:
    """Return a timezone aware UTC timestamp."""

    return datetime.now(timezone.utc)


class ComplianceSeverity(str, enum.Enum):
    """Severity levels for compliance issues."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ComplianceStatus(str, enum.Enum):
    """Status values for compliance issues."""

    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class Clinic(Base):
    __tablename__ = "clinics"

    id = sa.Column(String, primary_key=True)
    code = sa.Column(String, nullable=False, unique=True, index=True)
    name = sa.Column(String, nullable=True)
    settings = sa.Column(sa.JSON, nullable=True)
    active = sa.Column(Boolean, nullable=False, server_default=sa.true())
    created_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
    )


class User(Base):
    __tablename__ = "users"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    username = sa.Column(String, nullable=False, unique=True, index=True)
    email = sa.Column(String, nullable=True, unique=True, index=True)
    password_hash = sa.Column(String, nullable=False)
    name = sa.Column(String, nullable=True)
    role = sa.Column(String, nullable=False)
    clinic_id = sa.Column(String, ForeignKey("clinics.id"), nullable=True)
    mfa_enabled = sa.Column(Boolean, nullable=False, server_default=sa.false())
    mfa_secret = sa.Column(String, nullable=True)
    account_locked_until = sa.Column(DateTime(timezone=True), nullable=True)
    failed_login_attempts = sa.Column(Integer, nullable=False, server_default=sa.text("0"))
    last_login = sa.Column(DateTime(timezone=True), nullable=True)
    created_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
    )
    updated_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
        onupdate=_utcnow,
    )

    __table_args__ = (
        sa.Index("idx_users_clinic", "clinic_id"),
    )


class Setting(Base):
    __tablename__ = "settings"

    user_id = sa.Column(Integer, ForeignKey("users.id"), primary_key=True)
    theme = sa.Column(String, nullable=False, server_default=sa.text("'modern'"))
    categories = sa.Column(sa.JSON, nullable=False, default=dict)
    rules = sa.Column(sa.JSON, nullable=False, default=list)
    lang = sa.Column(String, nullable=False, server_default=sa.text("'en'"))
    summary_lang = sa.Column(String, nullable=False, server_default=sa.text("'en'"))
    specialty = sa.Column(String, nullable=True)
    payer = sa.Column(String, nullable=True)
    region = sa.Column(String, nullable=True)
    template = sa.Column(Integer, nullable=True)
    use_local_models = sa.Column(Boolean, nullable=False, server_default=sa.false())
    agencies = sa.Column(sa.JSON, nullable=False, default=list)
    use_offline_mode = sa.Column(Boolean, nullable=False, server_default=sa.false())
    layout_prefs = sa.Column(sa.JSON, nullable=False, default=dict)
    beautify_model = sa.Column(String, nullable=True)
    suggest_model = sa.Column(String, nullable=True)
    summarize_model = sa.Column(String, nullable=True)
    deid_engine = sa.Column(String, nullable=True)


class UserProfile(Base):
    __tablename__ = "user_profile"

    user_id = sa.Column(Integer, ForeignKey("users.id"), primary_key=True)
    current_view = sa.Column(String, nullable=True)
    clinic = sa.Column(String, nullable=True)
    preferences = sa.Column(sa.JSON, nullable=True)
    ui_preferences = sa.Column(sa.JSON, nullable=True)


class Template(Base):
    __tablename__ = "templates"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    user = sa.Column(String, nullable=True)
    clinic = sa.Column(String, nullable=True)
    specialty = sa.Column(String, nullable=True)
    payer = sa.Column(String, nullable=True)
    name = sa.Column(String, nullable=True)
    content = sa.Column(Text, nullable=True)


class Event(Base):
    __tablename__ = "events"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    event_type = sa.Column("eventType", String, nullable=False)
    timestamp = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
    )
    details = sa.Column(sa.JSON, nullable=True)
    revenue = sa.Column(Float, nullable=True)
    time_to_close = sa.Column(Float, nullable=True)
    codes = sa.Column(sa.JSON, nullable=True)
    compliance_flags = sa.Column(sa.JSON, nullable=True)
    public_health = sa.Column(Boolean, nullable=True)
    satisfaction = sa.Column(Integer, nullable=True)


class EventAggregate(Base):
    __tablename__ = "event_aggregates"

    day = sa.Column(String, primary_key=True)
    start_ts = sa.Column(DateTime(timezone=True), nullable=False)
    end_ts = sa.Column(DateTime(timezone=True), nullable=False)
    total_events = sa.Column(Integer, nullable=False)
    metrics = sa.Column(sa.JSON, nullable=False)
    computed_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
    )


class ConfidenceScore(Base):
    __tablename__ = "confidence_scores"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    user_id = sa.Column(Integer, ForeignKey("users.id"), nullable=False)
    note_id = sa.Column(String, nullable=True)
    code = sa.Column(String, nullable=False)
    confidence = sa.Column(Float, nullable=True)
    accepted = sa.Column(Boolean, nullable=False, server_default=sa.false())
    created_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
    )


class ComplianceRule(Base):
    __tablename__ = "compliance_rules"

    id = sa.Column(String, primary_key=True)
    name = sa.Column(String, nullable=False)
    description = sa.Column(Text, nullable=False)
    category = sa.Column(String, nullable=True)
    severity = sa.Column(String, nullable=True)
    rule_type = sa.Column("type", String, nullable=False, server_default=sa.text("'absence'"))
    metadata_json = sa.Column("metadata", sa.JSON, nullable=True)
    references_json = sa.Column("references", sa.JSON, nullable=True)
    created_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
    )
    updated_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
        onupdate=_utcnow,
    )

    def metadata_dict(self) -> Dict[str, Any]:
        if not self.metadata_json:
            return {}
        if isinstance(self.metadata_json, Mapping):
            return dict(self.metadata_json)
        if isinstance(self.metadata_json, str):
            try:
                decoded = json.loads(self.metadata_json)
            except json.JSONDecodeError:
                return {}
            return decoded if isinstance(decoded, Mapping) else {}
        return {}

    def references_list(self) -> List[Dict[str, Any]]:
        if not self.references_json:
            return []
        if isinstance(self.references_json, list):
            return [dict(item) for item in self.references_json if isinstance(item, Mapping)]
        if isinstance(self.references_json, str):
            try:
                decoded = json.loads(self.references_json)
            except json.JSONDecodeError:
                return []
            if isinstance(decoded, list):
                return [dict(item) for item in decoded if isinstance(item, Mapping)]
        return []

    def to_dict(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "severity": self.severity,
            "type": self.rule_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        metadata = self.metadata_dict()
        if metadata:
            data["metadata"] = metadata
            for key, value in metadata.items():
                data.setdefault(key, value)
        references = self.references_list()
        if references:
            data["references"] = references
        return data

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "ComplianceRule":
        metadata_payload: Dict[str, Any] = {}
        incoming_metadata = data.get("metadata")
        if isinstance(incoming_metadata, Mapping):
            metadata_payload.update(dict(incoming_metadata))
        core_fields = {
            "id",
            "name",
            "description",
            "category",
            "severity",
            "type",
            "metadata",
            "references",
            "created_at",
            "updated_at",
            "createdAt",
            "updatedAt",
        }
        for key, value in data.items():
            if key in core_fields:
                continue
            metadata_payload[key] = value
        references_value = data.get("references")
        references_serialized: Optional[List[Dict[str, Any]]] = None
        if isinstance(references_value, Iterable) and not isinstance(references_value, (str, bytes)):
            references_serialized = [dict(item) for item in references_value if isinstance(item, Mapping)]
        metadata_serialized: Optional[Dict[str, Any]] = None
        if metadata_payload:
            metadata_serialized = dict(metadata_payload)
        return cls(
            id=str(data.get("id", "")),
            name=str(data.get("name", "")),
            description=str(data.get("description", "")),
            category=data.get("category"),
            severity=data.get("severity"),
            rule_type=str(data.get("type", "absence") or "absence"),
            metadata_json=metadata_serialized,
            references_json=references_serialized,
        )


class ComplianceIssue(Base):
    __tablename__ = "compliance_issues"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    issue_id = sa.Column(String, nullable=False, unique=True)
    rule_id = sa.Column(String, nullable=True)
    title = sa.Column(String, nullable=False)
    severity = sa.Column(sa.Enum(ComplianceSeverity, name="compliance_severity"), nullable=False)
    category = sa.Column(String, nullable=True)
    status = sa.Column(sa.Enum(ComplianceStatus, name="compliance_status"), nullable=False)
    note_excerpt = sa.Column(Text, nullable=True)
    metadata_payload = sa.Column("metadata", sa.JSON, nullable=True)
    created_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
    )
    updated_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
        onupdate=_utcnow,
    )
    created_by = sa.Column(String, nullable=True)
    assignee = sa.Column(String, nullable=True)


class ComplianceIssueHistory(Base):
    __tablename__ = "compliance_issue_history"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    issue_id = sa.Column(String, nullable=False, index=True)
    code = sa.Column(String, nullable=True, index=True)
    payer = sa.Column(String, nullable=True)
    findings = sa.Column(sa.JSON, nullable=True)
    created_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
        index=True,
    )
    user_id = sa.Column(String, nullable=True)


class BillingAudit(Base):
    __tablename__ = "billing_audits"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    audit_id = sa.Column(String, nullable=False)
    code = sa.Column(String, nullable=True)
    payer = sa.Column(String, nullable=True)
    findings = sa.Column(sa.JSON, nullable=True)
    created_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
    )
    user_id = sa.Column(String, nullable=True)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    user_id = sa.Column(Integer, ForeignKey("users.id"), nullable=False)
    token_hash = sa.Column(String, nullable=False)
    expires_at = sa.Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (sa.Index("idx_refresh_user", "user_id"),)


class Note(Base):
    __tablename__ = "notes"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    content = sa.Column(Text, nullable=True)
    encounter_id = sa.Column(Integer, nullable=True)
    status = sa.Column(String, nullable=False, server_default=sa.text("'draft'"))
    created_at = sa.Column(DateTime(timezone=True), nullable=True, default=_utcnow)
    updated_at = sa.Column(DateTime(timezone=True), nullable=True, default=_utcnow, onupdate=_utcnow)
    finalized_at = sa.Column(DateTime(timezone=True), nullable=True)
    finalized_note_id = sa.Column(String, nullable=True, unique=True)
    finalized_content = sa.Column(Text, nullable=True)
    finalized_summary = sa.Column(sa.JSON, nullable=True)
    finalized_by = sa.Column(String, nullable=True)
    finalized_clinic_id = sa.Column(String, nullable=True)
    finalized_patient_hash = sa.Column(String, nullable=True)


class ErrorLog(Base):
    __tablename__ = "error_log"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    timestamp = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
    )
    username = sa.Column(String, nullable=True)
    message = sa.Column(Text, nullable=False)
    stack = sa.Column(Text, nullable=True)


class Export(Base):
    __tablename__ = "exports"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    timestamp = sa.Column(DateTime(timezone=True), nullable=False, server_default=sa.func.now(), default=_utcnow)
    ehr = sa.Column(String, nullable=True)
    note = sa.Column(Text, nullable=True)
    status = sa.Column(String, nullable=True)
    detail = sa.Column(Text, nullable=True)


class Patient(Base):
    __tablename__ = "patients"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    first_name = sa.Column(String, nullable=True)
    last_name = sa.Column(String, nullable=True, index=True)
    dob = sa.Column(String, nullable=True, index=True)
    mrn = sa.Column(String, nullable=True, index=True)
    gender = sa.Column(String, nullable=True)
    insurance = sa.Column(String, nullable=True)
    last_visit = sa.Column(String, nullable=True)
    allergies = sa.Column(sa.JSON, nullable=True)
    medications = sa.Column(sa.JSON, nullable=True)

    __table_args__ = (
        sa.Index("idx_patients_last_first", "last_name", "first_name"),
    )


class Encounter(Base):
    __tablename__ = "encounters"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    patient_id = sa.Column(Integer, ForeignKey("patients.id"), nullable=False)
    date = sa.Column(String, nullable=True, index=True)
    type = sa.Column(String, nullable=True)
    provider = sa.Column(String, nullable=True)
    description = sa.Column(Text, nullable=True)

    __table_args__ = (
        sa.Index("idx_encounters_patient", "patient_id"),
    )


class VisitSession(Base):
    __tablename__ = "visit_sessions"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    encounter_id = sa.Column(Integer, ForeignKey("encounters.id"), nullable=False)
    patient_id = sa.Column(String, nullable=True)
    status = sa.Column(String, nullable=False)
    start_time = sa.Column(DateTime(timezone=True), nullable=True)
    last_resumed_at = sa.Column(DateTime(timezone=True), nullable=True)
    end_time = sa.Column(DateTime(timezone=True), nullable=True)
    duration_seconds = sa.Column(Integer, nullable=False, default=0, server_default=sa.text("0"))
    meta = sa.Column(sa.JSON, nullable=True)


class UserSession(Base):
    __tablename__ = "sessions"

    id = sa.Column(String, primary_key=True)
    user_id = sa.Column(Integer, ForeignKey("users.id"), nullable=False)
    token_hash = sa.Column(String, nullable=True)
    refresh_token_hash = sa.Column(String, nullable=True)
    expires_at = sa.Column(DateTime(timezone=True), nullable=False)
    created_at = sa.Column(DateTime(timezone=True), nullable=False, server_default=sa.func.now(), default=_utcnow)
    last_accessed = sa.Column(DateTime(timezone=True), nullable=False, server_default=sa.func.now(), default=_utcnow, onupdate=_utcnow)
    ip_address = sa.Column(String, nullable=True)
    user_agent = sa.Column(String, nullable=True)
    offline_session = sa.Column(Boolean, nullable=False, server_default=sa.false())
    metadata_payload = sa.Column("metadata", sa.JSON, nullable=True)

    __table_args__ = (sa.Index("idx_sessions_user", "user_id"),)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = sa.Column(String, primary_key=True)
    user_id = sa.Column(Integer, ForeignKey("users.id"), nullable=False)
    token_hash = sa.Column(String, nullable=False)
    expires_at = sa.Column(DateTime(timezone=True), nullable=False)
    used = sa.Column(Boolean, nullable=False, server_default=sa.false())
    created_at = sa.Column(DateTime(timezone=True), nullable=False, server_default=sa.func.now(), default=_utcnow)

    __table_args__ = (
        sa.Index("idx_password_reset_user", "user_id"),
        sa.Index("idx_password_reset_expiry", "expires_at"),
    )


class MFAChallenge(Base):
    __tablename__ = "mfa_challenges"

    session_token = sa.Column(String, primary_key=True)
    user_id = sa.Column(Integer, ForeignKey("users.id"), nullable=False)
    code_hash = sa.Column(String, nullable=False)
    method = sa.Column(String, nullable=False)
    expires_at = sa.Column(DateTime(timezone=True), nullable=False)
    attempts = sa.Column(Integer, nullable=False, server_default=sa.text("0"))
    last_sent = sa.Column(DateTime(timezone=True), nullable=False, server_default=sa.func.now(), default=_utcnow)
    remember_me = sa.Column(Boolean, nullable=False, server_default=sa.false())


class AuditLogEntry(Base):
    __tablename__ = "audit_log"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    timestamp = sa.Column(DateTime(timezone=True), nullable=False, server_default=sa.func.now(), default=_utcnow)
    username = sa.Column(String, nullable=True)
    user_id = sa.Column(Integer, ForeignKey("users.id"), nullable=True)
    clinic_id = sa.Column(String, ForeignKey("clinics.id"), nullable=True)
    action = sa.Column(String, nullable=False)
    details = sa.Column(sa.JSON, nullable=True)
    ip_address = sa.Column(String, nullable=True)
    user_agent = sa.Column(String, nullable=True)
    success = sa.Column(Boolean, nullable=True)

    __table_args__ = (
        sa.Index("idx_audit_log_user", "user_id", "timestamp"),
        sa.Index("idx_audit_log_action", "action"),
    )


class NoteAutoSave(Base):
    __tablename__ = "note_auto_saves"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    user_id = sa.Column(Integer, ForeignKey("users.id"), nullable=True)
    note_id = sa.Column(Integer, nullable=True)
    content = sa.Column(Text, nullable=True)
    updated_at = sa.Column(DateTime(timezone=True), nullable=True, default=_utcnow, onupdate=_utcnow)


class NotificationCounter(Base):
    __tablename__ = "notification_counters"

    user_id = sa.Column(Integer, ForeignKey("users.id"), primary_key=True)
    count = sa.Column(Integer, nullable=False, server_default=sa.text("0"))
    updated_at = sa.Column(DateTime(timezone=True), nullable=False, server_default=sa.func.now(), default=_utcnow)


class NotificationEvent(Base):
    __tablename__ = "notification_events"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    event_id = sa.Column(String, nullable=False, unique=True)
    user_id = sa.Column(Integer, ForeignKey("users.id"), nullable=False)
    title = sa.Column(String, nullable=False)
    message = sa.Column(Text, nullable=False)
    severity = sa.Column(String, nullable=False)
    created_at = sa.Column(DateTime(timezone=True), nullable=False, server_default=sa.func.now(), default=_utcnow)
    updated_at = sa.Column(DateTime(timezone=True), nullable=False, server_default=sa.func.now(), default=_utcnow, onupdate=_utcnow)
    is_read = sa.Column(Boolean, nullable=False, server_default=sa.false())
    read_at = sa.Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        sa.Index("idx_notification_events_user", "user_id", "created_at"),
        sa.Index("idx_notification_events_unread", "user_id", "is_read"),
    )


class ComplianceRuleCatalogEntry(Base):
    __tablename__ = "compliance_rule_catalog"

    id = sa.Column(String, primary_key=True)
    name = sa.Column(String, nullable=False)
    category = sa.Column(String, nullable=True)
    priority = sa.Column(String, nullable=True)
    citations = sa.Column(sa.JSON, nullable=True)
    keywords = sa.Column(sa.JSON, nullable=True)


class CPTCode(Base):
    __tablename__ = "cpt_codes"

    code = sa.Column(String, primary_key=True)
    description = sa.Column(Text, nullable=True)
    rvu = sa.Column(Float, nullable=True)
    reimbursement = sa.Column(Float, nullable=True)
    documentation = sa.Column(sa.JSON, nullable=True)
    icd10_prefixes = sa.Column(sa.JSON, nullable=True)
    demographics = sa.Column(sa.JSON, nullable=True)
    encounter_types = sa.Column(sa.JSON, nullable=True)
    specialties = sa.Column(sa.JSON, nullable=True)
    last_updated = sa.Column(String, nullable=True)


class ICD10Code(Base):
    __tablename__ = "icd10_codes"

    code = sa.Column(String, primary_key=True)
    description = sa.Column(Text, nullable=True)
    clinical_context = sa.Column(String, nullable=True)
    contraindications = sa.Column(sa.JSON, nullable=True)
    documentation = sa.Column(sa.JSON, nullable=True)
    demographics = sa.Column(sa.JSON, nullable=True)
    encounter_types = sa.Column(sa.JSON, nullable=True)
    specialties = sa.Column(sa.JSON, nullable=True)
    last_updated = sa.Column(String, nullable=True)


class HCPCSCode(Base):
    __tablename__ = "hcpcs_codes"

    code = sa.Column(String, primary_key=True)
    description = sa.Column(Text, nullable=True)
    rvu = sa.Column(Float, nullable=True)
    reimbursement = sa.Column(Float, nullable=True)
    coverage = sa.Column(sa.JSON, nullable=True)
    documentation = sa.Column(sa.JSON, nullable=True)
    demographics = sa.Column(sa.JSON, nullable=True)
    encounter_types = sa.Column(sa.JSON, nullable=True)
    specialties = sa.Column(sa.JSON, nullable=True)
    last_updated = sa.Column(String, nullable=True)


class CPTReference(Base):
    __tablename__ = "cpt_reference"

    code = sa.Column(String, primary_key=True)
    description = sa.Column(Text, nullable=True)
    base_rvu = sa.Column(Float, nullable=True)
    base_reimbursement = sa.Column(Float, nullable=True)


class PayerSchedule(Base):
    __tablename__ = "payer_schedules"

    payer_type = sa.Column(String, primary_key=True)
    location = sa.Column(String, primary_key=True, default="")
    code = sa.Column(String, primary_key=True)
    reimbursement = sa.Column(Float, nullable=True)
    rvu = sa.Column(Float, nullable=True)


class NoteVersion(Base):
    __tablename__ = "note_versions"

    id = sa.Column(Integer, primary_key=True, autoincrement=True)
    note_id = sa.Column(String, nullable=False)
    user_id = sa.Column(Integer, ForeignKey("users.id"), nullable=True)
    content = sa.Column(Text, nullable=True)
    created_at = sa.Column(DateTime(timezone=True), nullable=True, server_default=sa.func.now(), default=_utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    username = sa.Column(String, primary_key=True)
    count = sa.Column(Integer, nullable=False, server_default=sa.text("0"))
    updated_at = sa.Column(DateTime(timezone=True), nullable=True, default=_utcnow, onupdate=_utcnow)


class SessionState(Base):
    __tablename__ = "session_state"

    user_id = sa.Column(Integer, ForeignKey("users.id"), primary_key=True)
    data = sa.Column(sa.JSON, nullable=True)
    updated_at = sa.Column(DateTime(timezone=True), nullable=True, default=_utcnow, onupdate=_utcnow)


class SharedWorkflowSession(Base):
    __tablename__ = "shared_workflow_sessions"

    session_id = sa.Column(String, primary_key=True)
    owner_username = sa.Column(String, nullable=True, index=True)
    data = sa.Column(sa.JSON, nullable=False)
    updated_at = sa.Column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )


class ChartDocument(Base):
    __tablename__ = "chart_documents"

    doc_id = sa.Column(String, primary_key=True)
    patient_id = sa.Column(String, nullable=False, index=True)
    correlation_id = sa.Column(String, nullable=True, index=True)
    name = sa.Column(String, nullable=False)
    mime = sa.Column(String, nullable=True)
    bytes_sha256 = sa.Column(String, nullable=False, index=True)
    pages = sa.Column(Integer, nullable=True)
    uploaded_at = sa.Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    __table_args__ = (
        sa.UniqueConstraint("patient_id", "bytes_sha256", name="uq_chart_documents_patient_hash"),
    )


class AINoteState(Base):
    __tablename__ = "ai_note_state"

    note_id = sa.Column(String, primary_key=True)
    clinician_id = sa.Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    last_note_hash = sa.Column(String, nullable=True)
    last_call_note_hash = sa.Column(String, nullable=True)
    last_note_snapshot = sa.Column(Text, nullable=True)
    last_transcript_cursor = sa.Column(String, nullable=True)
    last_section_map = sa.Column(sa.JSON, nullable=True)
    last_model_call_ts = sa.Column(DateTime(timezone=True), nullable=True)
    last_mini_call_ts = sa.Column(DateTime(timezone=True), nullable=True)
    last_allowed_ts = sa.Column(DateTime(timezone=True), nullable=True)
    last_input_ts = sa.Column(DateTime(timezone=True), nullable=True)
    auto4o_count = sa.Column(Integer, nullable=False, server_default=sa.text("0"), default=0)
    finalization_count = sa.Column(Integer, nullable=False, server_default=sa.text("0"), default=0)
    manual4o_count = sa.Column(Integer, nullable=False, server_default=sa.text("0"), default=0)
    last_accepted_json_hash = sa.Column(String, nullable=True)
    cold_start_completed = sa.Column(Boolean, nullable=False, server_default=sa.text("0"), default=False)
    daily_note_counted = sa.Column(Boolean, nullable=False, server_default=sa.text("0"), default=False)
    allowed_count = sa.Column(Integer, nullable=False, server_default=sa.text("0"), default=0)
    total_delta_chars = sa.Column(Integer, nullable=False, server_default=sa.text("0"), default=0)
    mean_time_between_allowed_ms = sa.Column(Float, nullable=False, server_default=sa.text("0"), default=0.0)
    created_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
    )
    updated_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
        onupdate=_utcnow,
    )


class AIJsonSnapshot(Base):
    __tablename__ = "ai_json_snapshots"

    hash = sa.Column(String, primary_key=True)
    payload = sa.Column(sa.JSON, nullable=False)
    created_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
    )


class AIClinicianDailyStat(Base):
    __tablename__ = "ai_clinician_daily_stats"

    clinician_id = sa.Column(Integer, ForeignKey("users.id"), primary_key=True)
    day = sa.Column(sa.Date, primary_key=True, default=date_cls.today)
    manual4o_count = sa.Column(Integer, nullable=False, server_default=sa.text("0"), default=0)
    notes_started = sa.Column(Integer, nullable=False, server_default=sa.text("0"), default=0)
    tokens_estimated = sa.Column(Float, nullable=False, server_default=sa.text("0"), default=0.0)
    cost_cents_estimated = sa.Column(Float, nullable=False, server_default=sa.text("0"), default=0.0)
    updated_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
        onupdate=_utcnow,
    )

    __table_args__ = (
        sa.Index("idx_ai_clinician_daily_stats_day", "day"),
    )


class AIClinicianAggregate(Base):
    __tablename__ = "ai_clinician_aggregate"

    clinician_id = sa.Column(Integer, ForeignKey("users.id"), primary_key=True)
    length_samples = sa.Column(sa.JSON, nullable=False, default=list)
    median_final_note_length = sa.Column(Integer, nullable=True)
    updated_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
        default=_utcnow,
        onupdate=_utcnow,
    )


class AIGateDecisionRecord(Base):
    __tablename__ = "ai_gate_decisions"

    decision_id = sa.Column(String, primary_key=True)
    route = sa.Column(String, nullable=False, index=True)
    allowed = sa.Column(Boolean, nullable=False, default=False)
    reason = sa.Column(String, nullable=True)
    model = sa.Column(String, nullable=True)
    note_hash = sa.Column(String, nullable=True, index=True)
    clinician_hash = sa.Column(String, nullable=True, index=True)
    delta_chars = sa.Column(Integer, nullable=True)
    created_at = sa.Column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        server_default=sa.func.now(),
        index=True,
    )
    metadata_payload = sa.Column("metadata", sa.JSON, nullable=True)


class AIRouteInvocation(Base):
    __tablename__ = "ai_route_invocations"

    invocation_id = sa.Column(String, primary_key=True)
    route = sa.Column(String, nullable=False, index=True)
    status = sa.Column(String, nullable=False)
    cache_state = sa.Column(String, nullable=False, default="cold")
    model = sa.Column(String, nullable=True)
    prompt_tokens = sa.Column(Integer, nullable=True)
    completion_tokens = sa.Column(Integer, nullable=True)
    total_tokens = sa.Column(Integer, nullable=True)
    duration_ms = sa.Column(Float, nullable=False)
    price_usd = sa.Column(Float, nullable=True)
    note_hash = sa.Column(String, nullable=True, index=True)
    trace_id = sa.Column(String, nullable=True, index=True)
    error_detail = sa.Column(Text, nullable=True)
    metadata_payload = sa.Column("metadata", sa.JSON, nullable=True)
    started_at = sa.Column(DateTime(timezone=True), nullable=False, default=_utcnow, index=True)
    finished_at = sa.Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        sa.Index("idx_ai_route_invocations_route_time", "route", "started_at"),
    )


class ChartParseJob(Base):
    __tablename__ = "chart_parse_jobs"

    job_id = sa.Column(String, primary_key=True)
    correlation_id = sa.Column(String, nullable=False, index=True)
    patient_id = sa.Column(String, nullable=False, index=True)
    stage = sa.Column(String, nullable=False)
    state = sa.Column(String, nullable=False)
    percent = sa.Column(Integer, nullable=False, default=0)
    started_at = sa.Column(DateTime(timezone=True), nullable=True)
    finished_at = sa.Column(DateTime(timezone=True), nullable=True)
    eta_sec = sa.Column(Integer, nullable=True)
    profile = sa.Column(String, nullable=False, default="balanced")
    doc_count = sa.Column(Integer, nullable=True)
    created_at = sa.Column(DateTime(timezone=True), nullable=False, default=_utcnow)


class ChartParseJobEvent(Base):
    __tablename__ = "chart_parse_job_events"

    event_id = sa.Column(String, primary_key=True)
    job_id = sa.Column(String, sa.ForeignKey("chart_parse_jobs.job_id", ondelete="CASCADE"), nullable=False)
    ts = sa.Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    type = sa.Column(String, nullable=False)
    payload = sa.Column(sa.JSON, nullable=True)

    job = sa.orm.relationship(ChartParseJob, backref="events")


class PatientContextSuperficial(Base):
    __tablename__ = "patient_context_superficial"

    patient_id = sa.Column(String, primary_key=True)
    correlation_id = sa.Column(String, nullable=False, index=True)
    kv = sa.Column(sa.JSON, nullable=False, default=dict)
    provenance = sa.Column(sa.JSON, nullable=False, default=dict)
    generated_at = sa.Column(DateTime(timezone=True), nullable=False, default=_utcnow)


class PatientContextNormalized(Base):
    __tablename__ = "patient_context_normalized"

    patient_id = sa.Column(String, primary_key=True)
    correlation_id = sa.Column(String, nullable=False, index=True)
    problems = sa.Column(sa.JSON, nullable=False, default=list)
    meds = sa.Column(sa.JSON, nullable=False, default=list)
    allergies = sa.Column(sa.JSON, nullable=False, default=list)
    labs = sa.Column(sa.JSON, nullable=False, default=list)
    vitals = sa.Column(sa.JSON, nullable=False, default=list)
    provenance = sa.Column(sa.JSON, nullable=False, default=dict)
    generated_at = sa.Column(DateTime(timezone=True), nullable=False, default=_utcnow)


class PatientIndexChunk(Base):
    __tablename__ = "patient_index_chunks"

    chunk_id = sa.Column(String, primary_key=True)
    patient_id = sa.Column(String, nullable=False, index=True)
    doc_id = sa.Column(String, sa.ForeignKey("chart_documents.doc_id", ondelete="CASCADE"), nullable=False)
    stage = sa.Column(String, nullable=False)
    section = sa.Column(String, nullable=True)
    text = sa.Column(Text, nullable=False)
    token_count = sa.Column(Integer, nullable=True)
    char_start = sa.Column(Integer, nullable=True)
    char_end = sa.Column(Integer, nullable=True)
    metadata_payload = sa.Column("metadata", sa.JSON, nullable=True)


class PatientIndexEmbedding(Base):
    __tablename__ = "patient_index_embeddings"

    chunk_id = sa.Column(String, sa.ForeignKey("patient_index_chunks.chunk_id", ondelete="CASCADE"), primary_key=True)
    embedding = sa.Column(sa.JSON, nullable=False)
    model = sa.Column(String, nullable=False)
    created_at = sa.Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    chunk = sa.orm.relationship(PatientIndexChunk, backref="embedding")
    updated_at = sa.Column(DateTime(timezone=True), nullable=False, server_default=sa.func.now(), default=_utcnow, onupdate=_utcnow)


__all__ = [name for name, obj in globals().items() if isinstance(obj, type) and issubclass(obj, Base)] + [
    "Base",
    "ComplianceSeverity",
    "ComplianceStatus",
]
