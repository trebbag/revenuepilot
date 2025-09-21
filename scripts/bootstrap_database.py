#!/usr/bin/env python3
"""Bootstrap the RevenuePilot SQLite database with required reference data."""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from platformdirs import user_data_dir

from backend import auth, code_tables, compliance
from backend.codes_data import load_code_metadata
from backend.key_manager import APP_NAME
from backend import migrations


DEFAULT_ADMIN = {
    "username": "admin@exampleclinic.com",
    "password": "Admin123!",
    "role": "admin",
    "name": "System Administrator",
    "email": "admin@exampleclinic.com",
}

DEFAULT_ANALYST = {
    "username": "analyst@exampleclinic.com",
    "password": "Analyst123!",
    "role": "analyst",
    "name": "Operations Analyst",
    "email": "analyst@exampleclinic.com",
}

DEFAULT_CLINICIAN = {
    "username": "clinician@exampleclinic.com",
    "password": "Clinician123!",
    "role": "user",
    "name": "Attending Clinician",
    "email": "clinician@exampleclinic.com",
}

USER_ENV_VARS = {
    "admin": ("REVENUEPILOT_ADMIN_USERNAME", "REVENUEPILOT_ADMIN_PASSWORD"),
    "analyst": ("REVENUEPILOT_ANALYST_USERNAME", "REVENUEPILOT_ANALYST_PASSWORD"),
    "clinician": ("REVENUEPILOT_CLINICIAN_USERNAME", "REVENUEPILOT_CLINICIAN_PASSWORD"),
}


SCHEMA_FUNCTIONS: Iterable = (
    migrations.ensure_clinics_table,
    migrations.ensure_users_table,
    migrations.ensure_settings_table,
    migrations.ensure_templates_table,
    migrations.ensure_events_table,
    migrations.ensure_refresh_table,
    migrations.ensure_session_table,
    migrations.ensure_password_reset_tokens_table,
    migrations.ensure_mfa_challenges_table,
    migrations.ensure_session_state_table,
    migrations.ensure_shared_workflow_sessions_table,
    migrations.ensure_user_profile_table,
    migrations.ensure_error_log_table,
    migrations.ensure_exports_table,
    migrations.ensure_patients_table,
    migrations.ensure_encounters_table,
    migrations.ensure_visit_sessions_table,
    migrations.ensure_note_auto_saves_table,
    migrations.ensure_note_versions_table,
    migrations.ensure_notifications_table,
    migrations.ensure_notification_events_table,
    migrations.ensure_notification_counters_table,
    migrations.ensure_compliance_issues_table,
    migrations.ensure_compliance_issue_history_table,
    migrations.ensure_compliance_rules_table,
    migrations.ensure_compliance_rule_catalog_table,
    migrations.ensure_confidence_scores_table,
    migrations.ensure_cpt_codes_table,
    migrations.ensure_icd10_codes_table,
    migrations.ensure_hcpcs_codes_table,
    migrations.ensure_cpt_reference_table,
    migrations.ensure_payer_schedule_table,
    migrations.ensure_billing_audits_table,
    migrations.ensure_audit_log_table,
    migrations.ensure_notes_table,
)


def ensure_schema(conn: sqlite3.Connection) -> None:
    for func in SCHEMA_FUNCTIONS:
        func(conn)
    conn.commit()


def seed_reference_data(conn: sqlite3.Connection, overwrite: bool) -> None:
    compliance_rules = compliance.get_rules()
    migrations.seed_compliance_rules(conn, compliance_rules, overwrite=overwrite)

    migrations.seed_cpt_codes(conn, code_tables.DEFAULT_CPT_CODES.items(), overwrite=overwrite)
    migrations.seed_icd10_codes(conn, code_tables.DEFAULT_ICD10_CODES.items(), overwrite=overwrite)
    migrations.seed_hcpcs_codes(conn, code_tables.DEFAULT_HCPCS_CODES.items(), overwrite=overwrite)

    metadata = load_code_metadata()
    cpt_metadata: Dict[str, Dict[str, object]] = {}
    for code, info in metadata.items():
        code_type = str(info.get("type") or "").upper()
        if code_type == "CPT":
            cpt_metadata[code] = info

    migrations.seed_cpt_reference(conn, cpt_metadata.items(), overwrite=overwrite)

    schedules: List[Dict[str, object]] = []
    for code, info in cpt_metadata.items():
        reimbursement = info.get("reimbursement")
        if reimbursement in (None, ""):
            continue
        try:
            base_amount = float(reimbursement)
        except (TypeError, ValueError):
            continue
        schedules.append(
            {
                "payer_type": "commercial",
                "location": "",
                "code": code,
                "reimbursement": round(base_amount, 2),
                "rvu": info.get("rvu"),
            }
        )
        schedules.append(
            {
                "payer_type": "medicare",
                "location": "",
                "code": code,
                "reimbursement": round(base_amount * 0.8, 2),
                "rvu": info.get("rvu"),
            }
        )

    if schedules:
        migrations.seed_payer_schedules(conn, schedules, overwrite=overwrite)

    conn.commit()


def _resolve_user_spec(role: str, args: argparse.Namespace) -> Dict[str, str]:
    if role == "admin":
        base = dict(DEFAULT_ADMIN)
        override_user = args.admin_username or os.getenv(USER_ENV_VARS[role][0])
        override_pass = args.admin_password or os.getenv(USER_ENV_VARS[role][1])
    elif role == "analyst":
        base = dict(DEFAULT_ANALYST)
        override_user = args.analyst_username or os.getenv(USER_ENV_VARS[role][0])
        override_pass = args.analyst_password or os.getenv(USER_ENV_VARS[role][1])
    else:
        base = dict(DEFAULT_CLINICIAN)
        override_user = args.clinician_username or os.getenv(USER_ENV_VARS[role][0])
        override_pass = args.clinician_password or os.getenv(USER_ENV_VARS[role][1])

    if override_user:
        base["username"] = override_user
        base["email"] = override_user if "@" in override_user else f"{override_user}@exampleclinic.com"
    if override_pass:
        base["password"] = override_pass
    return base


def seed_default_users(conn: sqlite3.Connection, args: argparse.Namespace) -> List[Tuple[str, str, str]]:
    created: List[Tuple[str, str, str]] = []
    for role in ("admin", "analyst", "clinician"):
        spec = _resolve_user_spec(role, args)
        username = spec["username"]
        password = spec["password"]
        row = conn.execute(
            "SELECT id, role FROM users WHERE username=?",
            (username,),
        ).fetchone()
        if row:
            existing_role = row["role"] if "role" in row.keys() else row[1]
            if existing_role != spec["role"]:
                conn.execute(
                    "UPDATE users SET role=?, updated_at=strftime('%s','now') WHERE username=?",
                    (spec["role"], username),
                )
            continue
        auth.register_user(
            conn,
            username,
            password,
            role=spec["role"],
            email=spec["email"],
            name=spec["name"],
        )
        created.append((username, password, spec["role"]))
    conn.commit()
    return created


def parse_args() -> argparse.Namespace:
    default_path = os.getenv("REVENUEPILOT_DB_PATH")
    if not default_path:
        data_dir = user_data_dir(APP_NAME, APP_NAME)
        default_path = os.path.join(data_dir, "analytics.db")

    parser = argparse.ArgumentParser(
        description="Seed the RevenuePilot database with reference data and default accounts.",
    )
    parser.add_argument(
        "--database",
        "-d",
        default=default_path,
        help="Path to the SQLite database file (default: %(default)s)",
    )
    parser.add_argument(
        "--overwrite-reference-data",
        action="store_true",
        help="Replace existing code catalogue tables instead of preserving rows.",
    )
    parser.add_argument(
        "--skip-user-seed",
        action="store_true",
        help="Do not create default admin/analyst/clinician accounts.",
    )
    parser.add_argument("--admin-username", help="Override admin username for the seeded account")
    parser.add_argument("--admin-password", help="Override admin password for the seeded account")
    parser.add_argument("--analyst-username", help="Override analyst username for the seeded account")
    parser.add_argument("--analyst-password", help="Override analyst password for the seeded account")
    parser.add_argument("--clinician-username", help="Override clinician username for the seeded account")
    parser.add_argument("--clinician-password", help="Override clinician password for the seeded account")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    db_path = Path(args.database).expanduser()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    try:
        ensure_schema(conn)
        seed_reference_data(conn, overwrite=args.overwrite_reference_data)
        created_users: List[Tuple[str, str, str]] = []
        if not args.skip_user_seed:
            created_users = seed_default_users(conn, args)
    finally:
        conn.close()

    print(f"Database initialised at {db_path}")
    print("Reference catalogues ensured (compliance rules, code metadata, payer schedules).")

    if args.skip_user_seed:
        print("User seeding skipped.")
    elif created_users:
        print("Created the following default accounts (update credentials before production use):")
        for username, password, role in created_users:
            print(f"  - {username} ({role}) → {password}")
    else:
        print("Default users already existed; no credentials were changed.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
