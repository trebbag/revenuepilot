"""Authentication helpers for the RevenuePilot backend."""

from __future__ import annotations

import sqlite3
import time
import uuid
from typing import Optional, Tuple

from passlib.context import CryptContext

from backend.migrations import (  # type: ignore
    ensure_users_table,
    ensure_settings_table,
    ensure_clinics_table,
)

# Password hashing context using bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION_SECONDS = 15 * 60


def hash_password(password: str) -> str:
    """Hash a plaintext password using a secure algorithm."""

    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """Verify a plaintext password against a stored hash."""

    try:
        return pwd_context.verify(password, hashed)
    except Exception:
        return False


def register_user(
    conn: sqlite3.Connection,
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

    ensure_clinics_table(conn)
    ensure_users_table(conn)
    ensure_settings_table(conn)

    pwd_hash = hash_password(password)

    now = time.time()
    resolved_email = email or f"{username}@example.test"
    resolved_name = name or username

    clinic_id: Optional[str] = None
    if clinic_code:
        code = clinic_code.strip().upper()
        if code:
            row = conn.execute(
                "SELECT id FROM clinics WHERE code=?",
                (code,),
            ).fetchone()
            if row:
                clinic_id = row["id"]
            else:
                clinic_id = str(uuid.uuid4())
                conn.execute(
                    """
                    INSERT INTO clinics (id, code, name, settings, active, created_at)
                    VALUES (?, ?, ?, ?, 1, ?)
                    """,
                    (clinic_id, code, code, "{}", now),
                )

    cur = conn.execute(
        """
        INSERT INTO users (
            username,
            email,
            password_hash,
            name,
            role,
            clinic_id,
            mfa_enabled,
            mfa_secret,
            failed_login_attempts,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        """,
        (
            username,
            resolved_email,
            pwd_hash,
            resolved_name,
            role,
            clinic_id,
            1 if mfa_enabled else 0,
            mfa_secret,
            now,
            now,
        ),
    )

    user_id = cur.lastrowid

    conn.execute(
        "INSERT OR IGNORE INTO settings (user_id, theme, categories, rules, lang, specialty, payer, region, use_local_models) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user_id,
            "modern",
            "{}",
            "[]",
            "en",
            None,
            None,
            "",
            0,
        ),
    )
    conn.execute(
        "UPDATE users SET updated_at=? WHERE id=?",
        (now, user_id),
    )
    conn.commit()
    return user_id


def authenticate_user(
    conn: sqlite3.Connection, username: str, password: str
) -> Optional[Tuple[int, str]]:
    """Validate user credentials.

    Returns a tuple of ``(user_id, role)`` when credentials are valid, otherwise
    ``None``.
    """

    ensure_users_table(conn)
    row = conn.execute(
        """
        SELECT id, password_hash, role, failed_login_attempts, account_locked_until
          FROM users
         WHERE username=?
        """,
        (username,),
    ).fetchone()
    if not row:
        return None

    user_id = row["id"]
    locked_until = row["account_locked_until"]
    if locked_until and float(locked_until) > time.time():
        return None

    if verify_password(password, row["password_hash"]):
        now = time.time()
        conn.execute(
            """
            UPDATE users
               SET failed_login_attempts=0,
                   account_locked_until=NULL,
                   last_login=?,
                   updated_at=?
             WHERE id=?
            """,
            (now, now, user_id),
        )
        conn.commit()
        return user_id, row["role"]

    attempts = (row["failed_login_attempts"] or 0) + 1
    lock_until: Optional[float] = None
    if attempts >= LOCKOUT_THRESHOLD:
        lock_until = time.time() + LOCKOUT_DURATION_SECONDS
    conn.execute(
        """
        UPDATE users
           SET failed_login_attempts=?,
               account_locked_until=?,
               updated_at=?
         WHERE id=?
        """,
        (attempts, lock_until, time.time(), user_id),
    )
    conn.commit()
    return None
