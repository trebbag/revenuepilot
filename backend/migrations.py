import sqlite3


def ensure_settings_table(conn: sqlite3.Connection) -> None:
    """Ensure the settings table exists with all required columns.

    This helper can be used during application startup or as a standalone
    migration step.  It creates the ``settings`` table if it does not exist
    and adds the ``lang`` column when missing.
    """
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings ("
        "user_id INTEGER PRIMARY KEY,"
        "theme TEXT NOT NULL,"
        "categories TEXT NOT NULL,"
        "rules TEXT NOT NULL,"
        "lang TEXT NOT NULL DEFAULT 'en',"
        "FOREIGN KEY(user_id) REFERENCES users(id)"
        ")"
    )
    # Check existing columns to handle upgrades from older schemas.
    columns = {row[1] for row in conn.execute("PRAGMA table_info(settings)")}
    if "lang" not in columns:
        conn.execute("ALTER TABLE settings ADD COLUMN lang TEXT NOT NULL DEFAULT 'en'")
    conn.commit()
