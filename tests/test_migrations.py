import sqlite3

from backend.migrations import ensure_settings_table


def test_ensure_settings_table_adds_lang():
    # Start with an old schema lacking the lang column
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (user_id INTEGER PRIMARY KEY, theme TEXT NOT NULL, categories TEXT NOT NULL, rules TEXT NOT NULL)"
    )
    ensure_settings_table(conn)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(settings)")}
    assert {"user_id", "theme", "categories", "rules", "lang"} <= cols
    conn.close()
