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
    if "specialty" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN specialty TEXT")
    if "payer" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN payer TEXT")
    if "region" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN region TEXT")
    conn.commit()
