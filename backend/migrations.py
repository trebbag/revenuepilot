import sqlite3


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
        "CREATE TABLE IF NOT EXISTS error_log ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "timestamp REAL NOT NULL,"
        "username TEXT,"
        "message TEXT NOT NULL,"
        "stack TEXT"

def ensure_exports_table(conn: sqlite3.Connection) -> None:
    """Ensure the exports table exists for tracking EHR exports."""

    conn.execute(
        "CREATE TABLE IF NOT EXISTS exports ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "timestamp REAL NOT NULL,"
        "ehr TEXT,"
        "note TEXT,"
        "status TEXT,"
        "detail TEXT"

def ensure_patients_table(conn: sqlite3.Connection) -> None:  # pragma: no cover
    """Ensure the patients table exists."""

    conn.execute(
        "CREATE TABLE IF NOT EXISTS patients ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "name TEXT NOT NULL,"
        "dob TEXT"
        ")"
    )
    conn.commit()


def ensure_encounters_table(conn: sqlite3.Connection) -> None:  # pragma: no cover
    """Ensure the encounters table exists."""

    conn.execute(
        "CREATE TABLE IF NOT EXISTS encounters ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "patient_id INTEGER NOT NULL,"
        "description TEXT,"
        "FOREIGN KEY(patient_id) REFERENCES patients(id)"
        ")"
    )
    conn.commit()


def ensure_visit_sessions_table(conn: sqlite3.Connection) -> None:  # pragma: no cover
    """Ensure the visit_sessions table exists."""

    conn.execute(
        "CREATE TABLE IF NOT EXISTS visit_sessions ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "encounter_id INTEGER NOT NULL,"
        "data TEXT,"
        "updated_at REAL,"
        "FOREIGN KEY(encounter_id) REFERENCES encounters(id)"
        ")"
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
