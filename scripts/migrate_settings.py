#!/usr/bin/env python3
"""Migrate legacy JSON settings into the database settings table."""

import json
import os
import sqlite3
from pathlib import Path

from platformdirs import user_data_dir

from backend.key_manager import APP_NAME
from backend.migrations import ensure_settings_table


def migrate_settings_file(conn: sqlite3.Connection, settings_file: Path) -> None:
    """Load settings from ``settings.json`` and persist them per user."""
    with settings_file.open() as f:
        data = json.load(f)

    if isinstance(data, dict) and any(isinstance(v, dict) for v in data.values()):
        items = data.items()
    else:
        items = [("default", data)]

    for username, prefs in items:
        row = conn.execute(
            "SELECT id FROM users WHERE username=?",
            (username,),
        ).fetchone()
        if not row:
            continue
        conn.execute(
            "INSERT OR REPLACE INTO settings (user_id, theme, categories, rules, lang, summary_lang, specialty, payer, region, template, use_local_models, agencies, beautify_model, suggest_model, summarize_model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                row["id"],
                prefs.get("theme", "modern"),
                json.dumps(prefs.get("categories", {})),
                json.dumps(prefs.get("rules", [])),
                prefs.get("lang", "en"),
                prefs.get("summaryLang", prefs.get("lang", "en")),
                prefs.get("specialty"),
                prefs.get("payer"),
                prefs.get("region", ""),
                prefs.get("template"),
                int(prefs.get("useLocalModels", False)),
                json.dumps(prefs.get("agencies", [])),
                prefs.get("beautifyModel"),
                prefs.get("suggestModel"),
                prefs.get("summarizeModel"),
            ),
        )
    conn.commit()


def main() -> None:
    data_dir = Path(user_data_dir(APP_NAME, APP_NAME))
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "analytics.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        ensure_settings_table(conn)
        settings_file = data_dir / "settings.json"
        if settings_file.exists():
            migrate_settings_file(conn, settings_file)
            settings_file.rename(settings_file.with_suffix(".bak"))
            print("Migrated settings.json")
    finally:
        conn.close()
    print("Migration complete")


if __name__ == "__main__":
    main()
