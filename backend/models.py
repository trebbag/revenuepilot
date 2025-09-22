"""SQLAlchemy table metadata for core application tables.

This module defines reusable SQLAlchemy ``Table`` objects for the SQLite
schema managed by :mod:`backend.migrations`.  The tables capture column
defaults, constraints and indexes that were previously encoded as raw SQL.
"""

from __future__ import annotations

import sqlite3
from typing import Iterable, Mapping, Sequence

from sqlalchemy import (
    Boolean,
    Column,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.pool import StaticPool
from sqlalchemy.sql import text

metadata = MetaData()

clinics = Table(
    "clinics",
    metadata,
    Column("id", String, primary_key=True),
    Column("code", String, nullable=False),
    Column("name", String, nullable=True),
    Column("settings", Text, nullable=True),
    Column("active", Boolean, nullable=False, server_default=text("1")),
    Column(
        "created_at",
        Float,
        nullable=False,
        server_default=text("(strftime('%s','now'))"),
    ),
    UniqueConstraint("code", name="uq_clinics_code"),
)

users = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("username", String, nullable=True, unique=True),
    Column("email", String, nullable=True, unique=True),
    Column("password_hash", Text, nullable=False),
    Column("name", String, nullable=True),
    Column("role", String, nullable=False),
    Column("clinic_id", String, ForeignKey("clinics.id"), nullable=True),
    Column("mfa_enabled", Boolean, nullable=False, server_default=text("0")),
    Column("mfa_secret", String, nullable=True),
    Column("account_locked_until", Float, nullable=True),
    Column(
        "failed_login_attempts",
        Integer,
        nullable=False,
        server_default=text("0"),
    ),
    Column("last_login", Float, nullable=True),
    Column(
        "created_at",
        Float,
        nullable=False,
        server_default=text("(strftime('%s','now'))"),
    ),
    Column(
        "updated_at",
        Float,
        nullable=False,
        server_default=text("(strftime('%s','now'))"),
    ),
    sqlite_autoincrement=True,
)
Index("idx_users_clinic", users.c.clinic_id)

settings = Table(
    "settings",
    metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("theme", String, nullable=False),
    Column("categories", Text, nullable=False, server_default=text("'{}'")),
    Column("rules", Text, nullable=False, server_default=text("'[]'")),
    Column("lang", String, nullable=False, server_default=text("'en'")),
    Column(
        "summary_lang",
        String,
        nullable=False,
        server_default=text("'en'"),
    ),
    Column("specialty", String, nullable=True),
    Column("payer", String, nullable=True),
    Column("region", String, nullable=True),
    Column("template", Integer, nullable=True),
    Column("use_local_models", Boolean, nullable=False, server_default=text("0")),
    Column("agencies", Text, nullable=False, server_default=text("'[]'")),
    Column("beautify_model", String, nullable=True),
    Column("suggest_model", String, nullable=True),
    Column("summarize_model", String, nullable=True),
    Column("deid_engine", String, nullable=True),
    Column("use_offline_mode", Boolean, nullable=False, server_default=text("0")),
    Column("layout_prefs", Text, nullable=False, server_default=text("'{}'")),
)

user_profile = Table(
    "user_profile",
    metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("current_view", String, nullable=True),
    Column("clinic", String, nullable=True),
    Column("preferences", Text, nullable=True),
    Column("ui_preferences", Text, nullable=True),
)

templates = Table(
    "templates",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user", String, nullable=True),
    Column("clinic", String, nullable=True),
    Column("specialty", String, nullable=True),
    Column("payer", String, nullable=True),
    Column("name", String, nullable=True),
    Column("content", Text, nullable=True),
    sqlite_autoincrement=True,
)

patients = Table(
    "patients",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("first_name", String, nullable=True),
    Column("last_name", String, nullable=True),
    Column("dob", String, nullable=True),
    Column("mrn", String, nullable=True),
    Column("gender", String, nullable=True),
    Column("insurance", String, nullable=True),
    Column("last_visit", String, nullable=True),
    Column("allergies", Text, nullable=True),
    Column("medications", Text, nullable=True),
    sqlite_autoincrement=True,
)
Index("idx_patients_last_first", patients.c.last_name, patients.c.first_name)
Index("idx_patients_mrn", patients.c.mrn)
Index("idx_patients_dob", patients.c.dob)

encounters = Table(
    "encounters",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("patient_id", Integer, ForeignKey("patients.id"), nullable=False),
    Column("date", String, nullable=True),
    Column("type", String, nullable=True),
    Column("provider", String, nullable=True),
    Column("description", Text, nullable=True),
    sqlite_autoincrement=True,
)
Index("idx_encounters_patient", encounters.c.patient_id)
Index("idx_encounters_date", encounters.c.date)

visit_sessions = Table(
    "visit_sessions",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("encounter_id", Integer, ForeignKey("encounters.id"), nullable=False),
    Column("status", String, nullable=False),
    Column("start_time", String, nullable=True),
    Column("end_time", String, nullable=True),
    Column("data", Text, nullable=True),
    Column("updated_at", Float, nullable=True),
    sqlite_autoincrement=True,
)

sessions = Table(
    "sessions",
    metadata,
    Column("id", String, primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("token_hash", String, nullable=True),
    Column("refresh_token_hash", String, nullable=True),
    Column("expires_at", Float, nullable=False),
    Column("created_at", Float, nullable=False),
    Column("last_accessed", Float, nullable=False),
    Column("ip_address", String, nullable=True),
    Column("user_agent", String, nullable=True),
    Column("offline_session", Boolean, nullable=False, server_default=text("0")),
    Column("metadata", Text, nullable=True),
)
Index("idx_sessions_user", sessions.c.user_id)

refresh_tokens = Table(
    "refresh_tokens",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("token_hash", String, nullable=False),
    Column("expires_at", Float, nullable=False),
    sqlite_autoincrement=True,
)
Index("idx_refresh_user", refresh_tokens.c.user_id)

password_reset_tokens = Table(
    "password_reset_tokens",
    metadata,
    Column("id", String, primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("token_hash", String, nullable=False),
    Column("expires_at", Float, nullable=False),
    Column("used", Boolean, nullable=False, server_default=text("0")),
    Column(
        "created_at",
        Float,
        nullable=False,
        server_default=text("(strftime('%s','now'))"),
    ),
)
Index("idx_reset_user", password_reset_tokens.c.user_id)

mfa_challenges = Table(
    "mfa_challenges",
    metadata,
    Column("session_token", String, primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("code_hash", String, nullable=False),
    Column("method", String, nullable=False),
    Column("expires_at", Float, nullable=False),
    Column("attempts", Integer, nullable=False, server_default=text("0")),
    Column("last_sent", Float, nullable=False),
    Column("remember_me", Boolean, nullable=False, server_default=text("0")),
)

TABLES_BY_NAME: Mapping[str, Table] = {
    table.name: table
    for table in (
        clinics,
        users,
        settings,
        user_profile,
        templates,
        patients,
        encounters,
        visit_sessions,
        sessions,
        refresh_tokens,
        password_reset_tokens,
        mfa_challenges,
    )
}

TARGET_MODULE_TABLES: Mapping[str, Sequence[str]] = {
    "auth": (
        "clinics",
        "users",
        "settings",
        "sessions",
        "refresh_tokens",
        "password_reset_tokens",
        "mfa_challenges",
    ),
    "templates": ("templates", "settings", "users"),
    "patients": ("patients", "encounters", "visit_sessions"),
    "visits": ("visit_sessions", "encounters", "patients"),
}


def create_tables(conn: sqlite3.Connection, *tables: Table) -> None:
    """Create ``tables`` using the shared SQLAlchemy metadata."""

    if not tables:
        return

    engine = create_engine(
        "sqlite://",
        creator=lambda: conn,
        poolclass=StaticPool,
        future=True,
    )
    with engine.begin() as engine_conn:
        metadata.create_all(engine_conn, tables=list(tables))
    conn.commit()


def require_tables(conn: sqlite3.Connection, table_names: Iterable[str]) -> None:
    """Ensure the tables named in ``table_names`` exist."""

    tables = [TABLES_BY_NAME[name] for name in table_names if name in TABLES_BY_NAME]
    create_tables(conn, *tables)


__all__ = [
    "metadata",
    "clinics",
    "users",
    "settings",
    "user_profile",
    "templates",
    "patients",
    "encounters",
    "visit_sessions",
    "sessions",
    "refresh_tokens",
    "password_reset_tokens",
    "mfa_challenges",
    "create_tables",
    "require_tables",
    "TABLES_BY_NAME",
    "TARGET_MODULE_TABLES",
]
