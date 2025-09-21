"""Authentication helpers for the RevenuePilot backend."""

from __future__ import annotations

import time
import uuid
from typing import Optional, Tuple

from passlib.context import CryptContext
from sqlalchemy import Column, Float, Integer, MetaData, String, Table, Text, insert, select, update
from sqlalchemy.orm import Session

from backend.migrations import (  # type: ignore
    ensure_users_table,
    ensure_settings_table,
    ensure_clinics_table,
)

# Password hashing context using bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION_SECONDS = 15 * 60


_metadata = MetaData()

clinics_table = Table(
    "clinics",
    _metadata,
    Column("id", String, primary_key=True),
    Column("code", String),
    Column("name", String),
    Column("settings", Text),
    Column("active", Integer),
    Column("created_at", Float),
    extend_existing=True,
)

users_table = Table(
    "users",
    _metadata,
    Column("id", Integer, primary_key=True),
    Column("username", String),
    Column("email", String),
    Column("password_hash", String),
    Column("name", String),
    Column("role", String),
    Column("clinic_id", String),
    Column("mfa_enabled", Integer),
    Column("mfa_secret", String),
    Column("account_locked_until", Float),
    Column("failed_login_attempts", Integer),
    Column("last_login", Float),
    Column("created_at", Float),
    Column("updated_at", Float),
    extend_existing=True,
)

settings_table = Table(
    "settings",
    _metadata,
    Column("user_id", Integer, primary_key=True),
    Column("theme", String),
    Column("categories", Text),
    Column("rules", Text),
    Column("lang", String),
    Column("specialty", String),
    Column("payer", String),
    Column("region", String),
    Column("use_local_models", Integer),
    extend_existing=True,
)


def hash_password(password: str) -> str:
    """Hash a plaintext password using a secure algorithm."""

    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """Verify a plaintext password against a stored hash."""

    try:
        return pwd_context.verify(password, hashed)
    except Exception:
        return False


def _ensure_core_tables(session: Session) -> None:
    """Ensure dependent tables exist using the session's connection."""

    connection = session.connection()
    raw_connection = connection.connection
    ensure_clinics_table(raw_connection)
    ensure_users_table(raw_connection)
    ensure_settings_table(raw_connection)


def register_user(
    session: Session,
    username: str,
    password: str,
    role: str = "user",
    *,
    email: Optional[str] = None,
    name: Optional[str] = None,
    clinic_code: Optional[str] = None,
    mfa_enabled: bool = False,
    mfa_secret: Optional[str] = None,
) -> int:
    """Register a new user and create default settings.

    Returns the new user's ID.
    """

    _ensure_core_tables(session)

    pwd_hash = hash_password(password)

    now = time.time()
    resolved_email = email or f"{username}@example.test"
    resolved_name = name or username

    clinic_id: Optional[str] = None
    if clinic_code:
        code = clinic_code.strip().upper()
        if code:
            clinic_row = session.execute(
                select(clinics_table.c.id).where(clinics_table.c.code == code)
            ).mappings().first()
            if clinic_row:
                clinic_id = clinic_row["id"]
            else:
                clinic_id = str(uuid.uuid4())
                session.execute(
                    insert(clinics_table).values(
                        id=clinic_id,
                        code=code,
                        name=code,
                        settings="{}",
                        active=1,
                        created_at=now,
                    )
                )

    result = session.execute(
        insert(users_table).values(
            username=username,
            email=resolved_email,
            password_hash=pwd_hash,
            name=resolved_name,
            role=role,
            clinic_id=clinic_id,
            mfa_enabled=1 if mfa_enabled else 0,
            mfa_secret=mfa_secret,
            failed_login_attempts=0,
            created_at=now,
            updated_at=now,
        )
    )
    user_id = int(result.inserted_primary_key[0])

    session.execute(
        insert(settings_table)
        .prefix_with("OR IGNORE")
        .values(
            user_id=user_id,
            theme="modern",
            categories="{}",
            rules="[]",
            lang="en",
            specialty=None,
            payer=None,
            region="",
            use_local_models=0,
        )
    )
    session.execute(
        update(users_table)
        .where(users_table.c.id == user_id)
        .values(updated_at=now)
    )
    session.flush()
    return user_id


def authenticate_user(
    session: Session, username: str, password: str
) -> Optional[Tuple[int, str]]:
    """Validate user credentials.

    Returns a tuple of ``(user_id, role)`` when credentials are valid, otherwise
    ``None``.
    """

    _ensure_core_tables(session)
    row = (
        session.execute(
            select(
                users_table.c.id,
                users_table.c.password_hash,
                users_table.c.role,
                users_table.c.failed_login_attempts,
                users_table.c.account_locked_until,
            ).where(users_table.c.username == username)
        )
        .mappings()
        .first()
    )
    if not row:
        return None

    user_id = row["id"]
    locked_until = row["account_locked_until"]
    if locked_until and float(locked_until) > time.time():
        return None

    if verify_password(password, row["password_hash"]):
        now = time.time()
        session.execute(
            update(users_table)
            .where(users_table.c.id == user_id)
            .values(
                failed_login_attempts=0,
                account_locked_until=None,
                last_login=now,
                updated_at=now,
            )
        )
        session.flush()
        return int(user_id), row["role"]

    attempts = (row["failed_login_attempts"] or 0) + 1
    lock_until: Optional[float] = None
    if attempts >= LOCKOUT_THRESHOLD:
        lock_until = time.time() + LOCKOUT_DURATION_SECONDS
    session.execute(
        update(users_table)
        .where(users_table.c.id == user_id)
        .values(
            failed_login_attempts=attempts,
            account_locked_until=lock_until,
            updated_at=time.time(),
        )
    )
    session.flush()
    return None
