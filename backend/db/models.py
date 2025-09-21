"""SQLAlchemy models mirroring the legacy SQLite schema."""

from __future__ import annotations

import enum
import json
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import declarative_base


Base = declarative_base()


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
    status = sa.Column(String, nullable=False, server_default=sa.text("'draft'"))
    created_at = sa.Column(DateTime(timezone=True), nullable=True, default=_utcnow)
    updated_at = sa.Column(DateTime(timezone=True), nullable=True, default=_utcnow, onupdate=_utcnow)


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
    status = sa.Column(String, nullable=False)
    start_time = sa.Column(DateTime(timezone=True), nullable=True)
    end_time = sa.Column(DateTime(timezone=True), nullable=True)
    data = sa.Column(sa.JSON, nullable=True)
    updated_at = sa.Column(DateTime(timezone=True), nullable=True, default=_utcnow, onupdate=_utcnow)


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
    updated_at = sa.Column(DateTime(timezone=True), nullable=False, server_default=sa.func.now(), default=_utcnow, onupdate=_utcnow)


__all__ = [name for name, obj in globals().items() if isinstance(obj, type) and issubclass(obj, Base)] + [
    "Base",
    "ComplianceSeverity",
    "ComplianceStatus",
]
