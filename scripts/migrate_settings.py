#!/usr/bin/env python3
"""Simple migration utility for ensuring the settings table exists.

Running this script will create the ``settings`` table in the analytics
SQLite database and add any missing columns (currently ``lang``).
"""
import os
import sqlite3
from platformdirs import user_data_dir

from backend.key_manager import APP_NAME
from backend.migrations import ensure_settings_table


def main() -> None:
    data_dir = user_data_dir(APP_NAME, APP_NAME)
    os.makedirs(data_dir, exist_ok=True)
    db_path = os.path.join(data_dir, "analytics.db")
    conn = sqlite3.connect(db_path)
    try:
        ensure_settings_table(conn)
    finally:
        conn.close()
    print("Migration complete")


if __name__ == "__main__":
    main()
