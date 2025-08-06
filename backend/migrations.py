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
        "specialty TEXT,"
        "payer TEXT,"
        "region TEXT,"
        "FOREIGN KEY(user_id) REFERENCES users(id)"
        ")"
    )

    columns = {row[1] for row in conn.execute("PRAGMA table_info(settings)")}
    required = {
        "categories": "TEXT NOT NULL DEFAULT '{}'",
        "rules": "TEXT NOT NULL DEFAULT '[]'",
        "lang": "TEXT NOT NULL DEFAULT 'en'",
        "specialty": "TEXT",
        "payer": "TEXT",
        "region": "TEXT",
    }
    for col, ddl in required.items():
        if col not in columns:
            conn.execute(f"ALTER TABLE settings ADD COLUMN {col} {ddl}")
    conn.commit()

def ensure_templates_table(conn: sqlite3.Connection) -> None:
    """Ensure the templates table exists for storing note templates."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS templates ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "user TEXT,"
        "clinic TEXT,"
        "specialty TEXT,"
        "name TEXT,"
        "content TEXT"
        ")"
    )
    # Add missing columns for backwards compatibility
    columns = {row[1] for row in conn.execute("PRAGMA table_info(templates)")}
    if "specialty" not in columns:
        conn.execute("ALTER TABLE templates ADD COLUMN specialty TEXT")
    conn.commit()
