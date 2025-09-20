import sqlite3
from typing import Optional, Tuple

from passlib.context import CryptContext

# Password hashing context using bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
    conn: sqlite3.Connection, username: str, password: str, role: str = "user"
) -> int:
    """Register a new user and create default settings.

    Returns the new user's ID.
    """
    pwd_hash = hash_password(password)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    email = username
    name = username
    if {"email", "name"}.issubset(columns):
        cur = conn.execute(
            "INSERT INTO users (username, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
            (username, email, name, pwd_hash, role),
        )
    else:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (username, pwd_hash, role),
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
    conn.commit()
    return user_id


def authenticate_user(
    conn: sqlite3.Connection, username: str, password: str
) -> Optional[Tuple[int, str]]:
    """Validate user credentials.

    Returns a tuple of ``(user_id, role)`` when credentials are valid, otherwise
    ``None``.
    """
    row = conn.execute(
        "SELECT id, password_hash, role FROM users WHERE username=?", (username,)
    ).fetchone()
    if row and verify_password(password, row["password_hash"]):
        return row["id"], row["role"]
    return None
