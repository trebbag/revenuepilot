import json
import sqlite3
from typing import Iterable, Tuple


def ensure_settings_table(conn: sqlite3.Connection) -> None:
    """Ensure the settings table exists with all required columns.

    This helper may be invoked during application startup or as a
    standalone migration.  It creates the ``settings`` table when missing
    and adds any new columns required by the application.
    """

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings ("
        "user_id INTEGER PRIMARY KEY,"
        "theme TEXT NOT NULL,"
        "categories TEXT NOT NULL DEFAULT '{}',"
        "rules TEXT NOT NULL DEFAULT '[]',"
        "lang TEXT NOT NULL DEFAULT 'en',"
        "summary_lang TEXT NOT NULL DEFAULT 'en',"
        "specialty TEXT,"
        "payer TEXT,"
        "region TEXT,"
        "template INTEGER,"
        "use_local_models INTEGER NOT NULL DEFAULT 0,"
        "agencies TEXT NOT NULL DEFAULT '[]',"
        "use_offline_mode INTEGER NOT NULL DEFAULT 0,"
        "layout_prefs TEXT NOT NULL DEFAULT '{}',"
        "FOREIGN KEY(user_id) REFERENCES users(id)"
        ")"
    )

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

    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_profile ("
        "user_id INTEGER PRIMARY KEY,"
        "current_view TEXT,"
        "clinic TEXT,"
        "preferences TEXT,"
        "ui_preferences TEXT,"
        "FOREIGN KEY(user_id) REFERENCES users(id)"
        ")"
    )

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
    conn.execute(
        "CREATE TABLE IF NOT EXISTS templates ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "user TEXT,"
        "clinic TEXT,"
        "specialty TEXT,"
        "payer TEXT,"
        "name TEXT,"
        "content TEXT"
        ")"
    )
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



def ensure_patients_table(conn: sqlite3.Connection) -> None:
    """Ensure the patients table exists for storing patient demographics."""


def ensure_refresh_table(conn: sqlite3.Connection) -> None:  # pragma: no cover - thin wrapper
    """Ensure the refresh_tokens table exists for storing hashed tokens."""

    conn.execute(
        "CREATE TABLE IF NOT EXISTS refresh_tokens ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT," \
        "user_id INTEGER NOT NULL," \
        "token_hash TEXT NOT NULL," \
        "expires_at REAL NOT NULL," \
        "FOREIGN KEY(user_id) REFERENCES users(id)"
        ")"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id)"
    )


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
    if "created_at" not in columns:
        conn.execute("ALTER TABLE notes ADD COLUMN created_at REAL")
    if "updated_at" not in columns:
        conn.execute("ALTER TABLE notes ADD COLUMN updated_at REAL")


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

def ensure_patients_table(conn: sqlite3.Connection) -> None:  # pragma: no cover
    """Ensure the patients table exists."""


    conn.execute(
        "CREATE TABLE IF NOT EXISTS patients ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "first_name TEXT,"
        "last_name TEXT,"
        "dob TEXT,"
        "mrn TEXT,"
        "gender TEXT,"
        "insurance TEXT,"
        "last_visit TEXT,"
        "allergies TEXT,"
        "medications TEXT"
        ")"
    )
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



def ensure_encounters_table(conn: sqlite3.Connection) -> None:
    """Ensure the encounters table exists for tracking patient encounters."""


    conn.execute(
        "CREATE TABLE IF NOT EXISTS encounters ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "patient_id INTEGER NOT NULL,"
        "date TEXT,"
        "type TEXT,"
        "provider TEXT,"
        "description TEXT,"
        "FOREIGN KEY(patient_id) REFERENCES patients(id)"
        ")"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_encounters_date ON encounters(date)"
    )
    conn.commit()



def ensure_visit_sessions_table(conn: sqlite3.Connection) -> None:
    """Ensure the visit_sessions table exists for visit timing data."""


    conn.execute(
        "CREATE TABLE IF NOT EXISTS visit_sessions ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "encounter_id INTEGER NOT NULL,"
        "status TEXT NOT NULL,"
        "start_time TEXT,"
        "end_time TEXT,"
        "data TEXT,"
        "updated_at REAL,"
        "FOREIGN KEY(encounter_id) REFERENCES encounters(id)"
        ")"
    )
    conn.commit()

def ensure_session_table(conn: sqlite3.Connection) -> None:  # pragma: no cover - thin wrapper
    """Ensure the sessions table exists for persisting user session state."""

    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions ("
        "user_id INTEGER PRIMARY KEY," \
        "data TEXT NOT NULL," \
        "updated_at REAL NOT NULL," \
        "FOREIGN KEY(user_id) REFERENCES users(id)"
        ")"
    )

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


def ensure_cpt_reference_table(conn: sqlite3.Connection) -> None:
    """Ensure reference CPT pricing data table exists."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cpt_reference (
            code TEXT PRIMARY KEY,
            description TEXT,
            base_rvu REAL,
            base_reimbursement REAL
        )
        """
    )


def ensure_payer_schedule_table(conn: sqlite3.Connection) -> None:
    """Ensure payer-specific reimbursement schedules exist."""

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS payer_schedules (
            payer_type TEXT NOT NULL,
            location TEXT NOT NULL DEFAULT '',
            code TEXT NOT NULL,
            reimbursement REAL,
            rvu REAL,
            PRIMARY KEY (payer_type, location, code)
        )
        """
    )


def seed_compliance_rules(
    conn: sqlite3.Connection,
    rules: Iterable[dict],
    *,
    overwrite: bool = False,
) -> None:
    """Insert compliance rules into the persistent catalogue."""

    if overwrite:
        conn.execute("DELETE FROM compliance_rule_catalog")

    for rule in rules:
        rule_id = rule.get("id")
        if not rule_id:
            continue
        citations = json.dumps(rule.get("references", []))
        keywords = json.dumps(rule.get("keywords", []))
        conn.execute(
            "INSERT OR IGNORE INTO compliance_rule_catalog (id, name, category, priority, citations, keywords) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                rule_id,
                rule.get("name") or rule_id,
                rule.get("category"),
                rule.get("severity"),
                citations,
                keywords,
            ),
        )


def seed_cpt_reference(
    conn: sqlite3.Connection,
    data: Iterable[Tuple[str, dict]],
    *,
    overwrite: bool = False,
) -> None:
    """Populate CPT reference data for reimbursement calculations."""

    if overwrite:
        conn.execute("DELETE FROM cpt_reference")

    for code, info in data:
        conn.execute(
            "INSERT OR IGNORE INTO cpt_reference (code, description, base_rvu, base_reimbursement) "
            "VALUES (?, ?, ?, ?)",
            (
                code,
                info.get("description"),
                info.get("rvu"),
                info.get("reimbursement"),
            ),
        )


def seed_payer_schedules(
    conn: sqlite3.Connection,
    schedules: Iterable[dict],
    *,
    overwrite: bool = False,
) -> None:
    """Insert payer-specific reimbursement schedule rows."""

    if overwrite:
        conn.execute("DELETE FROM payer_schedules")

    for entry in schedules:
        payer_type = entry.get("payer_type")
        code = entry.get("code")
        if not payer_type or not code:
            continue
        location = entry.get("location") or ""
        conn.execute(
            "INSERT OR REPLACE INTO payer_schedules (payer_type, location, code, reimbursement, rvu) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                payer_type.lower(),
                location,
                entry.get("code"),
                entry.get("reimbursement"),
                entry.get("rvu"),
            ),
        )


def ensure_note_versions_table(conn: sqlite3.Connection) -> None:  # pragma: no cover
    """Ensure the note_versions table exists for tracking version history."""

    conn.execute(
        "CREATE TABLE IF NOT EXISTS note_versions ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "note_id TEXT NOT NULL,"
        "user_id INTEGER,"
        "content TEXT,"
        "created_at REAL"
        ")"
    )

    conn.commit()


def ensure_notifications_table(conn: sqlite3.Connection) -> None:  # pragma: no cover
    """Ensure the notifications table exists for per-user counts."""

    conn.execute(
        "CREATE TABLE IF NOT EXISTS notifications ("
        "username TEXT PRIMARY KEY,"
        "count INTEGER NOT NULL DEFAULT 0,"
        "updated_at REAL"
        ")"
    )

    conn.commit()


def ensure_session_state_table(conn: sqlite3.Connection) -> None:
    """Ensure the session_state table exists."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS session_state ("
        "user_id INTEGER PRIMARY KEY,"
        "data TEXT,"
        "updated_at REAL,"
        "FOREIGN KEY(user_id) REFERENCES users(id)"
        ")"
    )
    conn.commit()

