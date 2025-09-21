"""SQLAlchemy table metadata for the RevenuePilot backend."""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.orm import declarative_base


Base = declarative_base()

clinics = sa.Table(
    "clinics",
    Base.metadata,
    sa.Column("id", sa.Text, primary_key=True),
    sa.Column("code", sa.Text, nullable=False, unique=True),
    sa.Column("name", sa.Text),
    sa.Column("settings", sa.Text),
    sa.Column("active", sa.Integer, nullable=False, server_default=sa.text("1")),
    sa.Column("created_at", sa.Float, nullable=False),
)

users = sa.Table(
    "users",
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), primary_key=True),
    sa.Column("current_view", sa.Text),
    sa.Column("clinic", sa.Text),
    sa.Column("preferences", sa.Text),
    sa.Column("ui_preferences", sa.Text),
)

templates = sa.Table(
    "templates",
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
    sa.Column("day", sa.Text, primary_key=True),
    sa.Column("start_ts", sa.Float, nullable=False),
    sa.Column("end_ts", sa.Float, nullable=False),
    sa.Column("total_events", sa.Integer, nullable=False),
    sa.Column("metrics", sa.Text, nullable=False),
    sa.Column("computed_at", sa.Float, nullable=False),
)

confidence_scores = sa.Table(
    "confidence_scores",
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
    sa.Column("token_hash", sa.Text, nullable=False),
    sa.Column("expires_at", sa.Float, nullable=False),
    sqlite_autoincrement=True,
)
sa.Index("idx_refresh_user", refresh_tokens.c.user_id)

sessions = sa.Table(
    "sessions",
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
    sa.Column("note_id", sa.Integer),
    sa.Column("content", sa.Text),
    sa.Column("updated_at", sa.Float),
    sqlite_autoincrement=True,
)

note_versions = sa.Table(
    "note_versions",
    Base.metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("note_id", sa.Text, nullable=False),
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
    sa.Column("content", sa.Text),
    sa.Column("created_at", sa.Float),
    sqlite_autoincrement=True,
)

notes = sa.Table(
    "notes",
    Base.metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("content", sa.Text),
    sa.Column("status", sa.Text, nullable=False, server_default=sa.text("'draft'")),
    sa.Column("created_at", sa.Float),
    sa.Column("updated_at", sa.Float),
    sqlite_autoincrement=True,
)

error_log = sa.Table(
    "error_log",
    Base.metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("timestamp", sa.Float, nullable=False),
    sa.Column("username", sa.Text),
    sa.Column("message", sa.Text, nullable=False),
    sa.Column("stack", sa.Text),
    sqlite_autoincrement=True,
)

exports = sa.Table(
    "exports",
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("encounter_id", sa.Integer, sa.ForeignKey("encounters.id"), nullable=False),
    sa.Column("status", sa.Text, nullable=False),
    sa.Column("start_time", sa.Text),
    sa.Column("end_time", sa.Text),
    sa.Column("data", sa.Text),
    sa.Column("updated_at", sa.Float),
    sqlite_autoincrement=True,
)

notification_counters = sa.Table(
    "notification_counters",
    Base.metadata,
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), primary_key=True),
    sa.Column("count", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("updated_at", sa.Float, nullable=False),
)

notification_events = sa.Table(
    "notification_events",
    Base.metadata,
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
    Base.metadata,
    sa.Column("username", sa.Text, primary_key=True),
    sa.Column("count", sa.Integer, nullable=False, server_default=sa.text("0")),
    sa.Column("updated_at", sa.Float),
)

session_state = sa.Table(
    "session_state",
    Base.metadata,
    sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), primary_key=True),
    sa.Column("data", sa.Text),
    sa.Column("updated_at", sa.Float),
)

shared_workflow_sessions = sa.Table(
    "shared_workflow_sessions",
    Base.metadata,
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
    Base.metadata,
    sa.Column("id", sa.Text, primary_key=True),
    sa.Column("name", sa.Text, nullable=False),
    sa.Column("category", sa.Text),
    sa.Column("priority", sa.Text),
    sa.Column("citations", sa.Text),
    sa.Column("keywords", sa.Text),
)

cpt_codes = sa.Table(
    "cpt_codes",
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
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
    Base.metadata,
    sa.Column("code", sa.Text, primary_key=True),
    sa.Column("description", sa.Text),
    sa.Column("base_rvu", sa.Float),
    sa.Column("base_reimbursement", sa.Float),
)

payer_schedules = sa.Table(
    "payer_schedules",
    Base.metadata,
    sa.Column("payer_type", sa.Text, primary_key=True),
    sa.Column("location", sa.Text, primary_key=True, server_default=sa.text("''")),
    sa.Column("code", sa.Text, primary_key=True),
    sa.Column("reimbursement", sa.Float),
    sa.Column("rvu", sa.Float),
)
