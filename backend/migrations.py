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
