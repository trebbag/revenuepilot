
import json
import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, Iterable, Iterator, Mapping, Optional, Sequence, Tuple

from backend import models as db_models
from backend.db.models import (
    Base,
    CPTCode,
    CPTReference,
    ComplianceRuleCatalogEntry,
    HCPCSCode,
    ICD10Code,
    PayerSchedule,
)

import sqlalchemy as sa
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool



def ensure_clinics_table(conn: sqlite3.Connection) -> None:
    """Ensure the clinics table exists for multi-tenant deployments."""

    db_models.create_tables(conn, db_models.clinics)


def ensure_users_table(conn: sqlite3.Connection) -> None:
    """Ensure the users table matches the authentication specification."""

    ensure_clinics_table(conn)
    db_models.create_tables(conn, db_models.users)

    columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}

    if "email" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)"
        )
        conn.execute("UPDATE users SET email = username WHERE email IS NULL")

    if "name" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN name TEXT")
        conn.execute(
            "UPDATE users SET name = username WHERE name IS NULL"
        )

    if "clinic_id" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN clinic_id TEXT")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_users_clinic ON users(clinic_id)"
        )

    if "mfa_enabled" not in columns:
        conn.execute(
            "ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0"
        )

    if "mfa_secret" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN mfa_secret TEXT")

    if "account_locked_until" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN account_locked_until REAL")

    if "failed_login_attempts" not in columns:
        conn.execute(
            "ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0"
        )

    if "last_login" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN last_login REAL")

    if "created_at" not in columns:
        conn.execute(
            "ALTER TABLE users ADD COLUMN created_at REAL NOT NULL DEFAULT 0"
        )
        conn.execute(
            "UPDATE users SET created_at = strftime('%s','now') WHERE created_at = 0"
        )

    if "updated_at" not in columns:
        conn.execute(
            "ALTER TABLE users ADD COLUMN updated_at REAL NOT NULL DEFAULT 0"
        )
        conn.execute(
            "UPDATE users SET updated_at = strftime('%s','now') WHERE updated_at = 0"
        )

    conn.commit()


def ensure_settings_table(conn: sqlite3.Connection) -> None:
    """Ensure the settings table exists with all required columns.

    This helper may be invoked during application startup or as a
    standalone migration.  It creates the ``settings`` table when missing
    and adds any new columns required by the application.
    """

    db_models.create_tables(conn, db_models.settings)

    columns = {row[1] for row in conn.execute("PRAGMA table_info(settings)")}

    if "categories" not in columns:
        conn.execute(
            "ALTER TABLE settings ADD COLUMN categories TEXT NOT NULL DEFAULT '{}'"
        )
    if "rules" not in columns:
        conn.execute(
            "ALTER TABLE settings ADD COLUMN rules TEXT NOT NULL DEFAULT '[]'"
        )
    if "lang" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN lang TEXT NOT NULL DEFAULT 'en'")
    if "summary_lang" not in columns:
        conn.execute(
            "ALTER TABLE settings ADD COLUMN summary_lang TEXT NOT NULL DEFAULT 'en'"
        )
    if "specialty" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN specialty TEXT")
    if "payer" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN payer TEXT")
    if "region" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN region TEXT")
    if "use_local_models" not in columns:
        conn.execute(
            "ALTER TABLE settings ADD COLUMN use_local_models INTEGER NOT NULL DEFAULT 0"
        )

    if "agencies" not in columns:
        conn.execute(
            "ALTER TABLE settings ADD COLUMN agencies TEXT NOT NULL DEFAULT '[]'"
        )

    if "template" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN template INTEGER")

    if "beautify_model" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN beautify_model TEXT")
    if "suggest_model" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN suggest_model TEXT")
    if "summarize_model" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN summarize_model TEXT")
    if "deid_engine" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN deid_engine TEXT")
    if "use_offline_mode" not in columns:
        conn.execute(
            "ALTER TABLE settings ADD COLUMN use_offline_mode INTEGER NOT NULL DEFAULT 0"
        )
    if "layout_prefs" not in columns:
        conn.execute(
            "ALTER TABLE settings ADD COLUMN layout_prefs TEXT NOT NULL DEFAULT '{}'"
        )


    conn.commit()


def ensure_user_profile_table(conn: sqlite3.Connection) -> None:
    """Ensure the user_profile table exists for storing profile data."""

    db_models.create_tables(conn, db_models.user_profile)

    columns = {row[1] for row in conn.execute("PRAGMA table_info(user_profile)")}
    if "current_view" not in columns:
        conn.execute("ALTER TABLE user_profile ADD COLUMN current_view TEXT")
    if "clinic" not in columns:
        conn.execute("ALTER TABLE user_profile ADD COLUMN clinic TEXT")
    if "preferences" not in columns:
        conn.execute("ALTER TABLE user_profile ADD COLUMN preferences TEXT")
    if "ui_preferences" not in columns:
        conn.execute("ALTER TABLE user_profile ADD COLUMN ui_preferences TEXT")

    conn.commit()

def ensure_templates_table(conn: sqlite3.Connection) -> None:
    """Ensure the templates table exists for storing note templates."""
    db_models.create_tables(conn, db_models.templates)
    # Add missing columns for backwards compatibility
    columns = {row[1] for row in conn.execute("PRAGMA table_info(templates)")}
    if "specialty" not in columns:
        conn.execute("ALTER TABLE templates ADD COLUMN specialty TEXT")
    if "payer" not in columns:
        conn.execute("ALTER TABLE templates ADD COLUMN payer TEXT")
    conn.commit()


def ensure_events_table(conn: sqlite3.Connection) -> None:
    """Ensure the analytics events table exists with numeric columns.

    The application has evolved to store ``revenue`` and ``time_to_close`` as
    real numbers rather than JSON strings embedded in ``details``.  This helper
    creates the ``events`` table when missing and adds these columns for
    existing installations."""

    conn.execute(
        "CREATE TABLE IF NOT EXISTS events ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "eventType TEXT NOT NULL,"
        "timestamp REAL NOT NULL,"
        "details TEXT,"
        "revenue REAL,"
        "time_to_close REAL,"
        "codes TEXT,"
        "compliance_flags TEXT,"
        "public_health INTEGER,"
        "satisfaction INTEGER"
        ")"
    )

    columns = {row[1] for row in conn.execute("PRAGMA table_info(events)")}
    if "revenue" not in columns:
        conn.execute("ALTER TABLE events ADD COLUMN revenue REAL")
    if "time_to_close" not in columns:
        conn.execute("ALTER TABLE events ADD COLUMN time_to_close REAL")
    if "codes" not in columns:
        conn.execute("ALTER TABLE events ADD COLUMN codes TEXT")
    if "compliance_flags" not in columns:
        conn.execute("ALTER TABLE events ADD COLUMN compliance_flags TEXT")
    if "public_health" not in columns:
        conn.execute("ALTER TABLE events ADD COLUMN public_health INTEGER")
    if "satisfaction" not in columns:
        conn.execute("ALTER TABLE events ADD COLUMN satisfaction INTEGER")

    conn.commit()



def ensure_event_aggregates_table(conn: sqlite3.Connection) -> None:
    """Ensure the daily event aggregates table exists."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS event_aggregates (
            day TEXT PRIMARY KEY,
            start_ts REAL NOT NULL,
            end_ts REAL NOT NULL,
            total_events INTEGER NOT NULL,
            metrics TEXT NOT NULL,
            computed_at REAL NOT NULL
        )
        """
    )

    # Backwards compatibility if the schema existed without computed_at
    columns = {row[1] for row in conn.execute("PRAGMA table_info(event_aggregates)")}
    if "computed_at" not in columns:
        conn.execute(
            "ALTER TABLE event_aggregates ADD COLUMN computed_at REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )

    conn.commit()


def ensure_confidence_scores_table(conn: sqlite3.Connection) -> None:
    """Ensure the confidence_scores table exists for tracking suggestion accuracy."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS confidence_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            note_id TEXT,
            code TEXT NOT NULL,
            confidence REAL,
            accepted INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL DEFAULT (strftime('%s','now')),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )

    columns = {row[1] for row in conn.execute("PRAGMA table_info(confidence_scores)")}
    if "accepted" not in columns:
        conn.execute(
            "ALTER TABLE confidence_scores ADD COLUMN accepted INTEGER NOT NULL DEFAULT 0"
        )
    if "created_at" not in columns:
        conn.execute(
            "ALTER TABLE confidence_scores ADD COLUMN created_at REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )
    if "note_id" not in columns:
        conn.execute("ALTER TABLE confidence_scores ADD COLUMN note_id TEXT")
    if "confidence" not in columns:
        conn.execute("ALTER TABLE confidence_scores ADD COLUMN confidence REAL")

    conn.commit()


def ensure_compliance_rules_table(conn: sqlite3.Connection) -> None:
    """Ensure the compliance_rules table exists for storing rule metadata."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS compliance_rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT,
            severity TEXT,
            type TEXT NOT NULL,
            metadata TEXT,
            "references" TEXT,
            created_at REAL NOT NULL DEFAULT (strftime('%s','now')),
            updated_at REAL NOT NULL DEFAULT (strftime('%s','now'))
        )
        """
    )

    columns = {row[1] for row in conn.execute("PRAGMA table_info(compliance_rules)")}
    if "metadata" not in columns:
        conn.execute("ALTER TABLE compliance_rules ADD COLUMN metadata TEXT")
    if "references" not in columns:
        conn.execute('ALTER TABLE compliance_rules ADD COLUMN "references" TEXT')
    if "created_at" not in columns:
        conn.execute(
            "ALTER TABLE compliance_rules ADD COLUMN created_at REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )
    if "updated_at" not in columns:
        conn.execute(
            "ALTER TABLE compliance_rules ADD COLUMN updated_at REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )
    if "category" not in columns:
        conn.execute("ALTER TABLE compliance_rules ADD COLUMN category TEXT")
    if "severity" not in columns:
        conn.execute("ALTER TABLE compliance_rules ADD COLUMN severity TEXT")
    if "type" not in columns:
        conn.execute("ALTER TABLE compliance_rules ADD COLUMN type TEXT NOT NULL DEFAULT 'absence'")

    conn.commit()


def ensure_compliance_issues_table(conn: sqlite3.Connection) -> None:
    """Ensure the compliance_issues table exists for manual tracking."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS compliance_issues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_id TEXT UNIQUE NOT NULL,
            rule_id TEXT,
            title TEXT NOT NULL,
            severity TEXT NOT NULL,
            category TEXT,
            status TEXT NOT NULL,
            note_excerpt TEXT,
            metadata TEXT,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            created_by TEXT,
            assignee TEXT
        )
        """
    )

    columns = {row[1] for row in conn.execute("PRAGMA table_info(compliance_issues)")}
    if "assignee" not in columns:
        conn.execute("ALTER TABLE compliance_issues ADD COLUMN assignee TEXT")
    if "created_by" not in columns:
        conn.execute("ALTER TABLE compliance_issues ADD COLUMN created_by TEXT")
    if "note_excerpt" not in columns:
        conn.execute("ALTER TABLE compliance_issues ADD COLUMN note_excerpt TEXT")
    if "metadata" not in columns:
        conn.execute("ALTER TABLE compliance_issues ADD COLUMN metadata TEXT")
    if "status" not in columns:
        conn.execute("ALTER TABLE compliance_issues ADD COLUMN status TEXT NOT NULL DEFAULT 'open'")

    conn.commit()



def ensure_compliance_issue_history_table(conn: sqlite3.Connection) -> None:
    """Ensure the compliance_issue_history table exists for auditing."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS compliance_issue_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_id TEXT NOT NULL,
            code TEXT,
            payer TEXT,
            findings TEXT,
            created_at REAL NOT NULL,
            user_id TEXT
        )
        """
    )

    columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(compliance_issue_history)")
    }

    if "code" not in columns:
        conn.execute(
            "ALTER TABLE compliance_issue_history ADD COLUMN code TEXT"
        )
    if "payer" not in columns:
        conn.execute(
            "ALTER TABLE compliance_issue_history ADD COLUMN payer TEXT"
        )
    if "findings" not in columns:
        conn.execute(
            "ALTER TABLE compliance_issue_history ADD COLUMN findings TEXT"
        )
    if "created_at" not in columns:
        conn.execute(
            "ALTER TABLE compliance_issue_history ADD COLUMN created_at REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )
    if "user_id" not in columns:
        conn.execute(
            "ALTER TABLE compliance_issue_history ADD COLUMN user_id TEXT"
        )

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_compliance_history_issue ON compliance_issue_history(issue_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_compliance_history_code ON compliance_issue_history(code)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_compliance_history_created_at ON compliance_issue_history(created_at)"
    )

    conn.commit()


def ensure_billing_audits_table(conn: sqlite3.Connection) -> None:
    """Ensure the billing_audits table exists for reimbursement logging."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS billing_audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_id TEXT NOT NULL,
            code TEXT,
            payer TEXT,
            findings TEXT,
            created_at REAL NOT NULL,
            user_id TEXT
        )
        """
    )

    columns = {row[1] for row in conn.execute("PRAGMA table_info(billing_audits)")}

    if "code" not in columns:
        conn.execute("ALTER TABLE billing_audits ADD COLUMN code TEXT")
    if "payer" not in columns:
        conn.execute("ALTER TABLE billing_audits ADD COLUMN payer TEXT")
    if "findings" not in columns:
        conn.execute("ALTER TABLE billing_audits ADD COLUMN findings TEXT")
    if "created_at" not in columns:
        conn.execute(
            "ALTER TABLE billing_audits ADD COLUMN created_at REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )
    if "user_id" not in columns:
        conn.execute("ALTER TABLE billing_audits ADD COLUMN user_id TEXT")
    if "audit_id" not in columns:
        conn.execute(
            "ALTER TABLE billing_audits ADD COLUMN audit_id TEXT NOT NULL DEFAULT ''"
        )

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_audits_audit ON billing_audits(audit_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_audits_code ON billing_audits(code)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_billing_audits_created_at ON billing_audits(created_at)"
    )

    conn.commit()


def ensure_patients_table(conn: sqlite3.Connection) -> None:
    """Ensure the patients table exists for storing patient demographics."""

    db_models.create_tables(conn, db_models.patients)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_last_first ON patients(last_name, first_name)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(mrn)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_dob ON patients(dob)"
    )
    conn.commit()


def ensure_refresh_table(conn: sqlite3.Connection) -> None:  # pragma: no cover - thin wrapper
    """Ensure the refresh_tokens table exists for storing hashed tokens."""

    db_models.create_tables(conn, db_models.refresh_tokens)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id)"
    )
    conn.commit()

def ensure_notes_table(conn: sqlite3.Connection) -> None:
    """Ensure the notes table exists for storing draft and finalized notes.

    Notes are stored with a ``status`` column so that drafts can be
    distinguished from finalized notes. The table also tracks creation and
    update timestamps to support future analytics.
    """

    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "content TEXT,"
        "encounter_id INTEGER,"
        "status TEXT NOT NULL,"
        "created_at REAL,"
        "updated_at REAL"
        ")"
    )

    columns = {row[1] for row in conn.execute("PRAGMA table_info(notes)")}
    if "status" not in columns:
        conn.execute(
            "ALTER TABLE notes ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'"
        )
    if "encounter_id" not in columns:
        conn.execute("ALTER TABLE notes ADD COLUMN encounter_id INTEGER")
    if "created_at" not in columns:
        conn.execute("ALTER TABLE notes ADD COLUMN created_at REAL")
    if "updated_at" not in columns:
        conn.execute("ALTER TABLE notes ADD COLUMN updated_at REAL")
    if "finalized_at" not in columns:
        conn.execute("ALTER TABLE notes ADD COLUMN finalized_at REAL")
    if "finalized_note_id" not in columns:
        conn.execute("ALTER TABLE notes ADD COLUMN finalized_note_id TEXT")
    if "finalized_content" not in columns:
        conn.execute("ALTER TABLE notes ADD COLUMN finalized_content TEXT")
    if "finalized_summary" not in columns:
        conn.execute("ALTER TABLE notes ADD COLUMN finalized_summary TEXT")
    if "finalized_by" not in columns:
        conn.execute("ALTER TABLE notes ADD COLUMN finalized_by TEXT")
    if "finalized_clinic_id" not in columns:
        conn.execute("ALTER TABLE notes ADD COLUMN finalized_clinic_id TEXT")
    if "finalized_patient_hash" not in columns:
        conn.execute("ALTER TABLE notes ADD COLUMN finalized_patient_hash TEXT")


def ensure_error_log_table(conn: sqlite3.Connection) -> None:
    """Ensure the error_log table exists for centralized error capture."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS error_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp REAL NOT NULL,
            username TEXT,
            message TEXT NOT NULL,
            stack TEXT
        )
        """
    )
    conn.commit()


def ensure_exports_table(conn: sqlite3.Connection) -> None:
    """Ensure the exports table exists for tracking EHR exports."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS exports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp REAL NOT NULL,
            ehr TEXT,
            note TEXT,
            status TEXT,
            detail TEXT
        )
        """
    )
    conn.commit()

def ensure_encounters_table(conn: sqlite3.Connection) -> None:
    """Ensure the encounters table exists for tracking patient encounters."""

    db_models.create_tables(conn, db_models.encounters)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_encounters_date ON encounters(date)"
    )
    conn.commit()



def ensure_visit_sessions_table(conn: sqlite3.Connection) -> None:
    """Ensure the visit_sessions table exists for visit timing data."""

    db_models.create_tables(conn, db_models.visit_sessions)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(visit_sessions)")}

    if "patient_id" not in columns:
        conn.execute("ALTER TABLE visit_sessions ADD COLUMN patient_id TEXT")
    if "last_resumed_at" not in columns:
        conn.execute("ALTER TABLE visit_sessions ADD COLUMN last_resumed_at TEXT")
    if "duration_seconds" not in columns:
        conn.execute(
            "ALTER TABLE visit_sessions ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0"
        )
    if "meta" not in columns:
        conn.execute("ALTER TABLE visit_sessions ADD COLUMN meta TEXT")

    # Best-effort migration of legacy payloads stored in the data column.
    if "data" in columns:
        rows = list(
            conn.execute(
                "SELECT id, data FROM visit_sessions WHERE data IS NOT NULL AND TRIM(data) != ''"
            )
        )
        for session_id, raw in rows:
            try:
                payload = json.loads(raw)
            except (TypeError, json.JSONDecodeError):
                continue

            updates: Dict[str, Any] = {}
            duration = payload.get("durationSeconds")
            if "duration_seconds" in columns and duration is not None:
                try:
                    updates["duration_seconds"] = int(duration)
                except (TypeError, ValueError):
                    pass

            last_resumed = payload.get("lastResumedAt")
            if "last_resumed_at" in columns and last_resumed:
                updates["last_resumed_at"] = str(last_resumed).strip()

            if "meta" in columns and payload:
                updates["meta"] = json.dumps(payload)

            if updates:
                assignments = ", ".join(f"{column} = ?" for column in updates)
                conn.execute(
                    f"UPDATE visit_sessions SET {assignments} WHERE id = ?",
                    (*updates.values(), session_id),
                )

    conn.commit()

def ensure_session_table(conn: sqlite3.Connection) -> None:  # pragma: no cover - thin wrapper
    """Ensure the sessions table stores rich session metadata."""


    ensure_users_table(conn)
    db_models.create_tables(conn, db_models.sessions)

    columns = {row[1] for row in conn.execute("PRAGMA table_info(sessions)")}
    if "token_hash" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN token_hash TEXT")
    if "refresh_token_hash" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN refresh_token_hash TEXT")
    if "expires_at" not in columns:
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN expires_at REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )
    if "created_at" not in columns:
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN created_at REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )
    if "last_accessed" not in columns:
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN last_accessed REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )
    if "ip_address" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN ip_address TEXT")
    if "user_agent" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN user_agent TEXT")
    if "offline_session" not in columns:
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN offline_session INTEGER NOT NULL DEFAULT 0"
        )
    if "metadata" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN metadata TEXT")
    if "user_id" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN user_id INTEGER")

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)"
    )
    conn.commit()


def ensure_password_reset_tokens_table(conn: sqlite3.Connection) -> None:
    """Ensure the password reset token table exists."""

    db_models.create_tables(conn, db_models.password_reset_tokens)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id)"
    )
    conn.commit()


def ensure_mfa_challenges_table(conn: sqlite3.Connection) -> None:
    """Ensure the temporary MFA challenge table exists."""

    db_models.create_tables(conn, db_models.mfa_challenges)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(mfa_challenges)")}
    if "remember_me" not in columns:
        conn.execute(
            "ALTER TABLE mfa_challenges ADD COLUMN remember_me INTEGER NOT NULL DEFAULT 0"
        )
    conn.commit()

    columns = {row[1] for row in conn.execute("PRAGMA table_info(sessions)")}
    if "token_hash" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN token_hash TEXT")
    if "refresh_token_hash" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN refresh_token_hash TEXT")
    if "expires_at" not in columns:
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN expires_at REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )
    if "created_at" not in columns:
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN created_at REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )
    if "last_accessed" not in columns:
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN last_accessed REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )
    if "ip_address" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN ip_address TEXT")
    if "user_agent" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN user_agent TEXT")
    if "offline_session" not in columns:
        conn.execute(
            "ALTER TABLE sessions ADD COLUMN offline_session INTEGER NOT NULL DEFAULT 0"
        )

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)"
    )
    conn.commit()


def ensure_audit_log_table(conn: sqlite3.Connection) -> None:
    """Ensure the audit_log table supports extended compliance data."""

    ensure_users_table(conn)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp REAL NOT NULL,
            username TEXT,
            user_id INTEGER,
            clinic_id TEXT,
            action TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            user_agent TEXT,
            success INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(clinic_id) REFERENCES clinics(id)
        )
        """
    )

    columns = {row[1] for row in conn.execute("PRAGMA table_info(audit_log)")}
    if "user_id" not in columns:
        conn.execute("ALTER TABLE audit_log ADD COLUMN user_id INTEGER")
    if "clinic_id" not in columns:
        conn.execute("ALTER TABLE audit_log ADD COLUMN clinic_id TEXT")
    if "ip_address" not in columns:
        conn.execute("ALTER TABLE audit_log ADD COLUMN ip_address TEXT")
    if "user_agent" not in columns:
        conn.execute("ALTER TABLE audit_log ADD COLUMN user_agent TEXT")
    if "success" not in columns:
        conn.execute("ALTER TABLE audit_log ADD COLUMN success INTEGER")

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, timestamp DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)"
    )
    conn.commit()

def ensure_note_auto_saves_table(conn: sqlite3.Connection) -> None:  # pragma: no cover
    """Ensure the note_auto_saves table exists."""

    conn.execute(
        "CREATE TABLE IF NOT EXISTS note_auto_saves ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "user_id INTEGER,"
        "note_id INTEGER,"
        "content TEXT,"
        "updated_at REAL"

        ")"
    )

    conn.commit()



def ensure_notification_counters_table(conn: sqlite3.Connection) -> None:
    """Ensure the notification_counters table exists for unread counts."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notification_counters (
            user_id INTEGER PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0,
            updated_at REAL NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )

    columns = {row[1] for row in conn.execute("PRAGMA table_info(notification_counters)")}
    if "count" not in columns:
        conn.execute(
            "ALTER TABLE notification_counters ADD COLUMN count INTEGER NOT NULL DEFAULT 0"
        )
    if "updated_at" not in columns:
        conn.execute(
            "ALTER TABLE notification_counters ADD COLUMN updated_at REAL NOT NULL DEFAULT (strftime('%s','now'))"
        )

    conn.commit()


def ensure_notification_events_table(conn: sqlite3.Connection) -> None:
    """Ensure the notification_events table persists individual notifications."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notification_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            severity TEXT NOT NULL,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            is_read INTEGER NOT NULL DEFAULT 0,
            read_at REAL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notification_events_user ON notification_events(user_id, created_at DESC)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notification_events_unread ON notification_events(user_id, is_read)"
    )

    conn.commit()


def ensure_compliance_rule_catalog_table(conn: sqlite3.Connection) -> None:
    """Ensure the compliance rule catalogue table exists."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS compliance_rule_catalog (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT,
            priority TEXT,
            citations TEXT,
            keywords TEXT
        )
        """
    )


def ensure_cpt_codes_table(conn: sqlite3.Connection) -> None:
    """Create or migrate the CPT metadata table."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cpt_codes (
            code TEXT PRIMARY KEY,
            description TEXT,
            rvu REAL,
            reimbursement REAL,
            documentation TEXT,
            icd10_prefixes TEXT,
            demographics TEXT,
            encounter_types TEXT,
            specialties TEXT,
            last_updated TEXT
        )
        """
    )

    columns = {row[1] for row in conn.execute("PRAGMA table_info(cpt_codes)")}
    if "documentation" not in columns:
        conn.execute("ALTER TABLE cpt_codes ADD COLUMN documentation TEXT")
    if "icd10_prefixes" not in columns:
        conn.execute("ALTER TABLE cpt_codes ADD COLUMN icd10_prefixes TEXT")
    if "demographics" not in columns:
        conn.execute("ALTER TABLE cpt_codes ADD COLUMN demographics TEXT")
    if "encounter_types" not in columns:
        conn.execute("ALTER TABLE cpt_codes ADD COLUMN encounter_types TEXT")
    if "specialties" not in columns:
        conn.execute("ALTER TABLE cpt_codes ADD COLUMN specialties TEXT")
    if "last_updated" not in columns:
        conn.execute("ALTER TABLE cpt_codes ADD COLUMN last_updated TEXT")


def ensure_icd10_codes_table(conn: sqlite3.Connection) -> None:
    """Create or migrate the ICD-10 metadata table."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS icd10_codes (
            code TEXT PRIMARY KEY,
            description TEXT,
            clinical_context TEXT,
            contraindications TEXT,
            documentation TEXT,
            demographics TEXT,
            encounter_types TEXT,
            specialties TEXT,
            last_updated TEXT
        )
        """
    )

    columns = {row[1] for row in conn.execute("PRAGMA table_info(icd10_codes)")}
    if "clinical_context" not in columns:
        conn.execute("ALTER TABLE icd10_codes ADD COLUMN clinical_context TEXT")
    if "contraindications" not in columns:
        conn.execute("ALTER TABLE icd10_codes ADD COLUMN contraindications TEXT")
    if "documentation" not in columns:
        conn.execute("ALTER TABLE icd10_codes ADD COLUMN documentation TEXT")
    if "demographics" not in columns:
        conn.execute("ALTER TABLE icd10_codes ADD COLUMN demographics TEXT")
    if "encounter_types" not in columns:
        conn.execute("ALTER TABLE icd10_codes ADD COLUMN encounter_types TEXT")
    if "specialties" not in columns:
        conn.execute("ALTER TABLE icd10_codes ADD COLUMN specialties TEXT")
    if "last_updated" not in columns:
        conn.execute("ALTER TABLE icd10_codes ADD COLUMN last_updated TEXT")


def ensure_hcpcs_codes_table(conn: sqlite3.Connection) -> None:
    """Create or migrate the HCPCS metadata table."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS hcpcs_codes (
            code TEXT PRIMARY KEY,
            description TEXT,
            rvu REAL,
            reimbursement REAL,
            coverage TEXT,
            documentation TEXT,
            demographics TEXT,
            encounter_types TEXT,
            specialties TEXT,
            last_updated TEXT
        )
        """
    )

    columns = {row[1] for row in conn.execute("PRAGMA table_info(hcpcs_codes)")}
    if "coverage" not in columns:
        conn.execute("ALTER TABLE hcpcs_codes ADD COLUMN coverage TEXT")
    if "documentation" not in columns:
        conn.execute("ALTER TABLE hcpcs_codes ADD COLUMN documentation TEXT")
    if "demographics" not in columns:
        conn.execute("ALTER TABLE hcpcs_codes ADD COLUMN demographics TEXT")
    if "encounter_types" not in columns:
        conn.execute("ALTER TABLE hcpcs_codes ADD COLUMN encounter_types TEXT")
    if "specialties" not in columns:
        conn.execute("ALTER TABLE hcpcs_codes ADD COLUMN specialties TEXT")
    if "last_updated" not in columns:
        conn.execute("ALTER TABLE hcpcs_codes ADD COLUMN last_updated TEXT")


def _serialize_json(value: Any, default: Any | None = None) -> Optional[str]:
    if value is None:
        if default is None:
            return None
        value = default
    if isinstance(value, str):
        return value
    return json.dumps(value)


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


# Re-export legacy ensure_* helpers via the SQLAlchemy metadata-driven implementation.
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
