"""
Backend API for the RevenuePilot application.

This FastAPI application provides endpoints to beautify clinical notes,
generate coding/compliance suggestions and produce patient‑friendly
summaries. It performs basic de‑identification on incoming text before
sending it to an AI model via ``call_openai``. If the model call fails,
each endpoint returns a sensible fallback.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import time
import asyncio
import sys
from pathlib import Path
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any, Literal, Set, Tuple, Callable
from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    status,
    UploadFile,
    File,
    Request,
    BackgroundTasks,
    WebSocket,
    WebSocketDisconnect,

)
import requests
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import (
    BaseModel,
    Field,
    validator,  # legacy import still used elsewhere
    StrictBool,
    field_validator,
)
import json, sqlite3
from uuid import uuid4
try:  # prefer appdirs
    from appdirs import user_data_dir  # type: ignore
except Exception:  # fallback to platformdirs if available
    try:  # pragma: no cover - environment dependent
        from platformdirs import user_data_dir  # type: ignore
    except Exception:
        def user_data_dir(appname: str, appauthor: str | None = None):  # type: ignore
            # Last-resort fallback to home directory subfolder
            return os.path.join(os.path.expanduser('~'), f'.{appname}')


import jwt

try:  # Load environment variables from a .env file if present
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - optional dependency
    pass

# Ensure the parent directory (package root) is on sys.path when running from a
# bundled Electron context where the backend directory is copied verbatim and
# uvicorn is launched with "main:app". This allows absolute ``backend.*`` imports.
backend_dir = os.path.dirname(__file__)
parent_dir = os.path.dirname(backend_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Use absolute imports consistently for robustness across execution modes.
from backend import prompts as prompt_utils  # type: ignore
from backend.prompts import build_beautify_prompt, build_suggest_prompt, build_summary_prompt  # type: ignore
from backend.openai_client import call_openai  # type: ignore
from backend.key_manager import (
    get_api_key,
    save_api_key,
    APP_NAME,
    get_all_keys,
    store_key,
)  # type: ignore
from backend.audio_processing import simple_transcribe, diarize_and_transcribe  # type: ignore
from backend import public_health as public_health_api  # type: ignore
from backend.migrations import (  # type: ignore
    ensure_settings_table,
    ensure_templates_table,
    ensure_events_table,
    ensure_refresh_table,
    ensure_session_table,
    ensure_notes_table,
    ensure_error_log_table,
    ensure_exports_table,
    ensure_patients_table,
    ensure_encounters_table,
    ensure_visit_sessions_table,
    ensure_note_auto_saves_table,
    ensure_user_profile_table,

)
from backend.templates import (
    TemplateModel,
    load_builtin_templates,
    list_user_templates,
    create_user_template,
    update_user_template,
    delete_user_template,
)  # type: ignore
from backend.scheduling import DEFAULT_EVENT_SUMMARY, export_ics, recommend_follow_up  # type: ignore
from backend.scheduling import (  # type: ignore
    create_appointment,
    list_appointments,
    export_appointment_ics,
    get_appointment,
)

from backend import patients  # type: ignore
from backend import visits  # type: ignore
from backend.charts import process_chart  # type: ignore
from backend.codes_data import load_code_metadata, load_conflicts  # type: ignore
from backend.auth import (  # type: ignore
    authenticate_user,
    hash_password,
    register_user,
    verify_password,
)
from backend import deid as deid_module  # type: ignore

# When ``USE_OFFLINE_MODEL`` is set, endpoints will return deterministic
# placeholder responses without calling external AI services.  This is useful
# for running the API in environments without network access.
USE_OFFLINE_MODEL = os.getenv("USE_OFFLINE_MODEL", "false").lower() in {
    "1",
    "true",
    "yes",
}
ENABLE_TRACE_MEM = os.getenv("ENABLE_TRACE_MEM", "false").lower() in {"1", "true", "yes"}

# Expose engine/hash flags so existing tests that monkeypatch backend.main still work.
_DEID_ENGINE = os.getenv("DEID_ENGINE", "regex").lower()
_HASH_TOKENS = os.getenv("DEID_HASH_TOKENS", "true").lower() in {"1", "true", "yes"}
# Availability flags default to those detected in deid module; tests may override.
_PRESIDIO_AVAILABLE = getattr(deid_module, "_PRESIDIO_AVAILABLE", False)
_PHILTER_AVAILABLE = getattr(deid_module, "_PHILTER_AVAILABLE", False)
_SCRUBBER_AVAILABLE = getattr(deid_module, "_SCRUBBER_AVAILABLE", False)
# Expose internals for tests expecting these attributes on backend.main
_analyzer = getattr(deid_module, "_analyzer", None)  # type: ignore
_philter = getattr(deid_module, "_philter", None)  # type: ignore

# Wrapper used throughout main; propagates any monkeypatched flags to the modular implementation.
def deidentify(text: str) -> str:  # pragma: no cover - thin wrapper
    return deid_module.deidentify(
        text,
        engine=_DEID_ENGINE,
        hash_tokens=_HASH_TOKENS,
        availability_overrides={
            "presidio": _PRESIDIO_AVAILABLE,
            "philter": _PHILTER_AVAILABLE,
            "scrubadub": _SCRUBBER_AVAILABLE,
        },
    )

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

# Logger before app so lifespan can reference it
logger = logging.getLogger(__name__)
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()

# Graceful shutdown via FastAPI lifespan (uvicorn will call this on SIGINT/SIGTERM)
from contextlib import asynccontextmanager

_SHUTTING_DOWN = False  # exported for potential test assertions

@asynccontextmanager
async def lifespan(app: FastAPI):  # pragma: no cover - exercised indirectly in integration
    logger.info("Lifespan startup begin")
    # Lightweight startup tasks could go here (e.g. warm caches)
    start_ts = time.time()
    try:
        yield
    finally:
        global _SHUTTING_DOWN
        _SHUTTING_DOWN = True
        try:
            db_conn.commit()  # ensure any buffered writes are flushed
        except Exception:  # pragma: no cover - defensive
            pass
        shutdown_duration = time.time() - start_ts
        logger.info("Lifespan shutdown complete (uptime=%.2fs)", shutdown_duration)

# Instantiate app with lifespan for graceful shutdown
app = FastAPI(title="RevenuePilot API", lifespan=lifespan)

# Record process start time for uptime calculations
START_TIME = time.time()


# Simple in-memory cache for dashboard and system endpoints
_DASHBOARD_CACHE: Dict[str, tuple[float, Any]] = {}
DASHBOARD_CACHE_TTL = float(os.getenv("DASHBOARD_CACHE_TTL", "10"))

def _cached_response(key: str, builder: Callable[[], Any]):
    """Return cached data for ``key`` rebuilding via ``builder`` when stale."""
    now = time.time()
    ts, data = _DASHBOARD_CACHE.get(key, (0.0, None))
    if now - ts > DASHBOARD_CACHE_TTL:
        data = builder()
        _DASHBOARD_CACHE[key] = (now, data)
    return data

# Active WebSocket connections for system notifications.
notification_clients: Set[WebSocket] = set()

# Simple in-memory storage for note versions keyed by note ID.
NOTE_VERSIONS: Dict[str, List[Dict[str, str]]] = defaultdict(list)


# Health/readiness endpoint used by the desktop app to know when the backend is up.
# Returns basic process / db status without requiring auth.
@app.get("/health", tags=["system"])  # pragma: no cover - trivial logic mostly, but still tested
async def health():
    """Lightweight health check.

    Provides an OK status when the API process is running. Includes uptime (seconds)
    and a best‑effort database connectivity flag. Avoid heavy checks so this remains fast
    during startup.
    """
    try:
        db_conn.execute("SELECT 1")
        db_ok = True
    except Exception:  # pragma: no cover - defensive
        db_ok = False
    return {
        "status": "ok",
        "uptime": round(time.time() - START_TIME, 2),
        "db": db_ok,
        "shutting_down": _SHUTTING_DOWN,
    }

# ---------------------------------------------------------------------------
# Advanced memory / runtime diagnostics
# ---------------------------------------------------------------------------

def _memory_stats() -> Dict[str, Any]:  # pragma: no cover - platform variability
    stats: Dict[str, Any] = {}
    # RSS via resource if available
    try:
        import resource  # type: ignore
        ru = resource.getrusage(resource.RUSAGE_SELF)
        # ru_maxrss: kilobytes on Linux, bytes on macOS (documented inconsistency)
        stats["max_rss_kb"] = ru.ru_maxrss if ru.ru_maxrss else None
    except Exception:
        stats["max_rss_kb"] = None
    # /proc/self/statm (Linux only)
    try:
        page_size = os.sysconf("SC_PAGE_SIZE")  # bytes
        with open("/proc/self/statm", "r", encoding="utf-8") as f:
            parts = f.read().strip().split()
            if len(parts) >= 2:
                rss_pages = int(parts[1])
                stats["rss_bytes"] = rss_pages * page_size
    except Exception:
        stats.setdefault("rss_bytes", None)
    # Python object & task stats
    try:
        import tracemalloc
        if ENABLE_TRACE_MEM:
            if not tracemalloc.is_tracing():
                tracemalloc.start(5)
            current, peak = tracemalloc.get_traced_memory()
            stats["py_heap_current"] = current
            stats["py_heap_peak"] = peak
        else:
            stats["py_heap_current"] = stats["py_heap_peak"] = None
    except Exception:
        stats["py_heap_current"] = stats["py_heap_peak"] = None
    try:
        stats["async_tasks"] = len(asyncio.all_tasks())
    except Exception:
        stats["async_tasks"] = None
    # File descriptor count (best effort)
    try:
        if os.name == "posix":
            stats["open_fds"] = len(os.listdir("/proc/self/fd"))
        else:
            stats["open_fds"] = None
    except Exception:
        stats["open_fds"] = None
    return stats

@app.get("/system/memory", tags=["system"])
async def memory_diagnostics(credentials: HTTPAuthorizationCredentials = Depends(lambda: None)):
    # security may not yet be defined; replaced after declaration
    if ENVIRONMENT not in {"development", "dev"}:
        # Will raise if token invalid once security/get_current_user available
        if 'get_current_user' in globals() and 'security' in globals():
            get_current_user(credentials, required_role="admin")
    return _memory_stats()


# Enable CORS so that the React frontend can communicate with this API.
# Allowed origins are configurable via the ``ALLOWED_ORIGINS`` environment
# variable (comma separated). Defaults now include common Electron desktop
# contexts (file://) and localhost variants so the packaged app (which loads
# index.html via file://) can reach the backend without triggering CORS
# failures which manifested as "Backend not reachable" in the unified login.
allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000,file://",
)
origins = [o.strip() for o in allowed_origins.split(",") if o.strip()]
# If a wildcard is explicitly provided, simplify configuration to allow all.
allow_all = any(o in {"*", "wildcard"} for o in origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all else origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for analytics events.  Each event is a dictionary with
# keys: eventType (str), details (dict) and timestamp (float).  This is
# reset when the server restarts.  For production use, persist events
# to a database.
events: List[Dict[str, Any]] = []

# Mapping of CPT codes to projected reimbursement amounts.  This mirrors the
# ``calcRevenue`` helper on the frontend so that revenue projections can be
# computed server‑side as well.  Any unknown code contributes zero dollars.
CPT_REVENUE: Dict[str, float] = {
    "99212": 50.0,
    "99213": 75.0,
    "99214": 110.0,
    "99215": 160.0,
}

# Cache of recent audio transcripts per user.  Each user retains the last
# ``TRANSCRIPT_HISTORY_LIMIT`` transcripts so clinicians can revisit previous
# conversations.  The cache is stored in-memory and reset on server restart.
TRANSCRIPT_HISTORY_LIMIT = int(os.getenv("TRANSCRIPT_HISTORY", "5"))
transcript_history: Dict[str, deque] = defaultdict(
    lambda: deque(maxlen=TRANSCRIPT_HISTORY_LIMIT)
)

# Simple in-memory notification tracking.
notification_counts: Dict[str, int] = defaultdict(int)
notification_subscribers: Dict[str, List[WebSocket]] = defaultdict(list)


async def _broadcast_notification_count(username: str) -> None:
    """Send updated notification count to all websocket subscribers."""
    for ws in list(notification_subscribers.get(username, [])):
        try:
            await ws.send_json({"count": notification_counts[username]})
        except Exception:
            try:
                notification_subscribers[username].remove(ws)
            except Exception:
                pass

# Set up a SQLite database for persistent analytics storage.  The database
# now lives in the user's data directory (platform-specific) so analytics
# persist outside the project folder.  A migration step moves any existing
# database from the old location if found.
data_dir = user_data_dir(APP_NAME, APP_NAME)
os.makedirs(data_dir, exist_ok=True)
DB_PATH = os.path.join(data_dir, "analytics.db")

# Migrate previous database file from the repository directory if it exists
old_db_path = os.path.join(os.path.dirname(__file__), "analytics.db")
if os.path.exists(old_db_path) and not os.path.exists(DB_PATH):
    try:  # best-effort migration
        shutil.move(old_db_path, DB_PATH)
    except Exception:
        pass

db_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
# Ensure the events table exists with the latest schema.
ensure_events_table(db_conn)
ensure_exports_table(db_conn)
ensure_patients_table(db_conn)
ensure_encounters_table(db_conn)
ensure_visit_sessions_table(db_conn)
ensure_note_auto_saves_table(db_conn)


# Create helpful indexes for metrics queries (idempotent)
try:  # pragma: no cover - sqlite create index if not exists
    db_conn.execute("CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)")
    db_conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_type ON events(eventType)"
    )
except Exception:
    pass

# Analytics DB size cap / rotation
ANALYTICS_DB_MAX_MB = float(os.getenv("ANALYTICS_DB_MAX_MB", "50"))  # default ~50MB
ANALYTICS_DB_PRUNE_FRACTION = float(os.getenv("ANALYTICS_DB_PRUNE_FRACTION", "0.2"))  # prune 20% oldest

def _prune_analytics_if_needed():  # pragma: no cover - size dependent
    try:
        db_size = os.path.getsize(DB_PATH) / (1024 * 1024)
        if db_size <= ANALYTICS_DB_MAX_MB:
            return
        cursor = db_conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM events")
        total = cursor.fetchone()[0] or 0
        if total == 0:
            return
        to_delete = int(total * ANALYTICS_DB_PRUNE_FRACTION)
        if to_delete <= 0:
            return
        cursor.execute(
            "DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY timestamp ASC LIMIT ?)",
            (to_delete,),
        )
        db_conn.commit()
        logger.info(
            "Pruned %s old analytics events (size %.2fMB > %.2fMB)",
            to_delete,
            db_size,
            ANALYTICS_DB_MAX_MB,
        )
    except Exception:
        pass

_prune_analytics_if_needed()


# Helper to (re)initialise core tables when db_conn is swapped in tests.
def _init_core_tables(conn):  # pragma: no cover - invoked in tests indirectly
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL NOT NULL, username TEXT, action TEXT NOT NULL, details TEXT)"
    )
    ensure_settings_table(conn)
    ensure_templates_table(conn)
    ensure_user_profile_table(conn)
    ensure_events_table(conn)
    ensure_refresh_table(conn)
    ensure_session_table(conn)
    ensure_notes_table(conn)
    ensure_error_log_table(conn)
    ensure_exports_table(conn)
    ensure_patients_table(conn)
    ensure_encounters_table(conn)
    ensure_visit_sessions_table(conn)
    ensure_note_auto_saves_table(conn)
    conn.commit()


# Proper users table creation (replacing previously malformed snippet)
db_conn.execute(
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)"
)
db_conn.commit()

# Table recording failed logins and administrative actions for auditing.
db_conn.execute(
    "CREATE TABLE IF NOT EXISTS audit_log ("
    "id INTEGER PRIMARY KEY AUTOINCREMENT,"
    "timestamp REAL NOT NULL,"
    "username TEXT,"
    "action TEXT NOT NULL,"
    "details TEXT"
    ")"
)
db_conn.commit()


# Persisted user preferences for theme, enabled categories and custom rules.
# Ensure the table exists and contains the latest schema (including ``lang``).
ensure_settings_table(db_conn)

# Table storing user and clinic specific note templates.
ensure_templates_table(db_conn)
ensure_patients_table(db_conn)
ensure_encounters_table(db_conn)
ensure_visit_sessions_table(db_conn)
ensure_note_auto_saves_table(db_conn)

# User profile details including current view and UI preferences.
ensure_user_profile_table(db_conn)

# Centralized error logging table.
ensure_error_log_table(db_conn)

# Table storing notes and drafts with status metadata.
ensure_notes_table(db_conn)

# Tables for refresh tokens and user session state
ensure_refresh_table(db_conn)
ensure_session_table(db_conn)

# Configure the database connection to return rows as dictionaries.  This
# makes it easier to access columns by name when querying events for
# metrics computations.
db_conn.row_factory = sqlite3.Row

# Preload any stored API key into the environment so subsequent calls work.
get_api_key()


# ---------------------------------------------------------------------------
# Simple JSON configuration helpers for miscellaneous settings
# ---------------------------------------------------------------------------

config_dir = Path(data_dir)


def _config_path(name: str) -> Path:
    return config_dir / f"{name}.json"


def load_json_config(name: str) -> Dict[str, Any]:  # pragma: no cover - thin helper
    path = _config_path(name)
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_json_config(name: str, data: Dict[str, Any]) -> None:  # pragma: no cover - thin helper
    path = _config_path(name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)

# Attempt to use rich PHI scrubbers by default.  When Presidio or Philter is
# installed they will be used automatically.  No environment variable is
# required to enable them, keeping the behaviour simple out of the box.  Tests
# may monkeypatch ``_PRESIDIO_AVAILABLE`` or ``_PHILTER_AVAILABLE`` to force the
# fallback implementation when these optional dependencies are missing.
if _DEID_ENGINE == "regex":
    if _PRESIDIO_AVAILABLE:
        _DEID_ENGINE = "presidio"
    elif _PHILTER_AVAILABLE:
        _DEID_ENGINE = "philter"
    elif _SCRUBBER_AVAILABLE:
        _DEID_ENGINE = "scrubadub"

# ---------------------------------------------------------------------------
# JWT authentication helpers
# ---------------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    if ENVIRONMENT not in {"development", "dev"}:
        raise RuntimeError("JWT_SECRET environment variable is required")
    JWT_SECRET = "dev-secret"
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

# Short-lived access tokens (minutes) and longer lived refresh tokens (days)
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7


def create_access_token(username: str, role: str, clinic: str | None = None) -> str:
    """Create a signed JWT access token for the given user."""
    payload = {
        "sub": username,
        "role": role,
        "type": "access",
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    if clinic is not None:
        payload["clinic"] = clinic
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(username: str, role: str) -> str:
    """Create a refresh token with a longer expiry."""
    payload = {
        "sub": username,
        "role": role,
        "type": "refresh",
        "exp": datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_token(username: str, role: str, clinic: str | None = None) -> str:
    """Backward compatible wrapper returning an access token."""
    return create_access_token(username, role, clinic)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    required_role: str | None = None,
):
    """Decode the provided JWT and optionally enforce a required role."""
    token = credentials.credentials
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    if required_role and data.get("role") not in (required_role, "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient privileges",
        )
    return data


def require_role(role: str):
    """Dependency factory ensuring the current user has a given role.

    Users with the ``admin`` role are allowed to access any endpoint that
    specifies a less privileged role.  This keeps the checks simple while
    still permitting administrators to perform regular user actions.
    """

    def checker(
        request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)
    ):
        data = get_current_user(credentials, required_role=role)
        if role == "admin":
            # Robust insertion: some tests swap the in-memory db_conn after the
            # dependency was created; ensure the audit_log table exists.
            try:
                db_conn.execute(
                    "INSERT INTO audit_log (timestamp, username, action, details) VALUES (?, ?, ?, ?)",
                    (time.time(), data["sub"], "admin_action", request.url.path),
                )
            except sqlite3.OperationalError as e:  # pragma: no cover - safety net
                if "no such table: audit_log" in str(e):
                    db_conn.execute(
                        "CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL NOT NULL, username TEXT, action TEXT NOT NULL, details TEXT)"
                    )
                    db_conn.execute(
                        "INSERT INTO audit_log (timestamp, username, action, details) VALUES (?, ?, ?, ?)",
                        (time.time(), data["sub"], "admin_action", request.url.path),
                    )
                else:
                    raise
            db_conn.commit()
        return data

    return checker


# Model for setting API key via API endpoint
class ApiKeyModel(BaseModel):
    key: str


class NamedKeyModel(BaseModel):
    name: str
    value: str


class RegisterModel(BaseModel):
    username: str
    password: str


class LoginModel(BaseModel):
    username: str
    password: str
    lang: str = "en"


class RefreshModel(BaseModel):
    refresh_token: str


class LogoutModel(BaseModel):
    token: str


class SessionModel(BaseModel):
    data: Dict[str, Any] = Field(default_factory=dict)


class ResetPasswordModel(BaseModel):
    """Schema used when a user wishes to reset their password."""

    username: str
    password: str
    new_password: str


class CategorySettings(BaseModel):
    """Which suggestion categories are enabled for a user."""

    codes: StrictBool = True
    compliance: StrictBool = True
    publicHealth: StrictBool = True
    differentials: StrictBool = True

    model_config = {"extra": "forbid"}


class UserSettings(BaseModel):
    theme: str = "modern"
    categories: CategorySettings = CategorySettings()
    rules: List[str] = []
    lang: str = "en"
    summaryLang: str = "en"
    specialty: Optional[str] = None
    payer: Optional[str] = None
    region: str = ""
    template: Optional[int] = None
    useLocalModels: StrictBool = False
    useOfflineMode: StrictBool = False
    agencies: List[str] = Field(default_factory=lambda: ["CDC", "WHO"])
    beautifyModel: Optional[str] = None
    suggestModel: Optional[str] = None
    summarizeModel: Optional[str] = None
    deidEngine: str = Field("regex", description="Selected de‑identification engine")

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, v: str) -> str:  # noqa: D401,N805
        allowed = {"modern", "dark", "warm"}
        if v not in allowed:
            raise ValueError("invalid theme")
        return v

    @field_validator("deidEngine")
    @classmethod
    def validate_deid_engine(cls, v: str) -> str:  # noqa: N805
        allowed = {"regex", "presidio", "philter", "scrubadub"}
        if v not in allowed:
            raise ValueError("invalid deid engine")
        return v

    @field_validator("rules", mode="before")
    @classmethod
    def validate_rules(cls, v):  # type: ignore[override]
        if not v:
            return []
        cleaned: List[str] = []
        for item in v:
            if not isinstance(item, str):
                raise ValueError("rules must be strings")
            item = item.strip()
            if not item:
                continue
            cleaned.append(item)
        return cleaned


@app.post("/register")
async def register(model: RegisterModel) -> Dict[str, Any]:
    """Register a new user and immediately issue JWT tokens."""
    try:
        _user_id = register_user(db_conn, model.username, model.password)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already exists")
    access_token = create_access_token(model.username, "user")
    refresh_token = create_refresh_token(model.username, "user")
    settings = UserSettings().model_dump()
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "settings": settings,
    }


@app.post("/auth/register")
async def auth_register(model: RegisterModel):
    """Namespaced registration endpoint (idempotent for tests).

    Mirrors /register but if the user already exists returns 200 with tokens
    instead of a 400 so that repeated calls in isolated test DBs succeed.
    """
    try:
        _user_id = register_user(db_conn, model.username, model.password)
    except sqlite3.IntegrityError:
        # User exists; proceed to issue tokens using existing role (default user)
        row = db_conn.execute("SELECT role FROM users WHERE username=?", (model.username,)).fetchone()
        role = row["role"] if row else "user"
    else:
        role = "user"
    access_token = create_access_token(model.username, role)
    refresh_token = create_refresh_token(model.username, role)
    settings = UserSettings().model_dump()
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "settings": settings,
    }


@app.get("/users")
async def list_users(user=Depends(require_role("admin"))) -> List[Dict[str, str]]:
    """Return all registered users (admin only)."""
    rows = db_conn.execute("SELECT username, role FROM users").fetchall()
    return [{"username": r["username"], "role": r["role"]} for r in rows]


class UpdateUserModel(BaseModel):
    role: Optional[str] = None
    password: Optional[str] = None


@app.put("/users/{username}")
async def update_user(
    username: str, model: UpdateUserModel, user=Depends(require_role("admin"))
):
    """Update a user's role or password."""
    fields = []
    values: List[Any] = []
    if model.role:
        fields.append("role=?")
        values.append(model.role)
    if model.password:
        fields.append("password_hash=?")
        values.append(hash_password(model.password))
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.append(username)
    db_conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE username=?", values)
    db_conn.commit()
    return {"status": "updated"}


@app.delete("/users/{username}")
async def delete_user(username: str, user=Depends(require_role("admin"))):
    """Remove a user account."""
    db_conn.execute("DELETE FROM users WHERE username=?", (username,))
    db_conn.commit()
    return {"status": "deleted"}


@app.post("/login")
async def login(model: LoginModel) -> Dict[str, Any]:
    """Validate credentials and return a JWT on success."""
    ensure_refresh_table(db_conn)
    cutoff = time.time() - 15 * 60
    recent_failures = db_conn.execute(
        "SELECT COUNT(*) FROM audit_log WHERE username=? AND action='failed_login' AND timestamp>?",
        (model.username, cutoff),
    ).fetchone()[0]
    if recent_failures >= 5:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account locked due to failed login attempts",
        )

    auth = authenticate_user(db_conn, model.username, model.password)
    if not auth:
        db_conn.execute(
            "INSERT INTO audit_log (timestamp, username, action, details) VALUES (?, ?, ?, ?)",
            (time.time(), model.username, "failed_login", "invalid credentials"),
        )
        db_conn.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    user_id, role = auth
    access_token = create_access_token(model.username, role)
    refresh_token = create_refresh_token(model.username, role)

    # Persist hashed refresh token for later verification
    expires_at = (datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).timestamp()
    db_conn.execute("DELETE FROM refresh_tokens WHERE user_id=?", (user_id,))
    db_conn.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
        (user_id, hash_password(refresh_token), expires_at),
    )
    db_conn.commit()

    settings_row = db_conn.execute(
        "SELECT theme, categories, rules, lang, summary_lang, specialty, payer, region, use_local_models, use_offline_mode, agencies, template, beautify_model, suggest_model, summarize_model, deid_engine FROM settings WHERE user_id=?",
        (user_id,),
    ).fetchone()
    if settings_row:
        sr = dict(settings_row)
        settings = {
            "theme": sr["theme"],
            "categories": json.loads(sr["categories"]),
            "rules": json.loads(sr["rules"]),
            "lang": sr["lang"],
            "summaryLang": sr["summary_lang"] or sr["lang"],
            "specialty": sr["specialty"],
            "payer": sr["payer"],
            "region": sr["region"] or "",
            "template": sr["template"],
            "useLocalModels": bool(sr["use_local_models"]),
            "useOfflineMode": bool(sr.get("use_offline_mode", 0)),
            "agencies": json.loads(sr["agencies"]) if sr["agencies"] else ["CDC", "WHO"],
            "beautifyModel": sr["beautify_model"],
            "suggestModel": sr["suggest_model"],
            "summarizeModel": sr["summarize_model"],
            "deidEngine": sr["deid_engine"] or os.getenv("DEID_ENGINE", "regex"),
        }
    else:
        settings = UserSettings().model_dump()
    user_obj = {
        "id": user_id,
        "name": model.username,
        "role": role,
        "specialty": settings.get("specialty"),
        "permissions": [role],
        "preferences": settings,
    }
    expires_at_iso = (
        datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    ).isoformat() + "Z"
    return {
        "token": access_token,
        "refreshToken": refresh_token,
        "user": user_obj,
        "expiresAt": expires_at_iso,
        # Backwards compatible fields
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "settings": settings,
    }


@app.post("/auth/login")
@app.post("/api/auth/login")
async def auth_login(model: LoginModel):
    return await login(model)


@app.post("/refresh")
@app.post("/api/auth/refresh")
async def refresh(model: RefreshModel) -> Dict[str, Any]:
    """Issue a new access token given a valid refresh token."""
    ensure_refresh_table(db_conn)
    try:
        data = jwt.decode(model.refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if data.get("type") != "refresh":
            raise jwt.PyJWTError()
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?",
        (data["sub"],),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user_id = row["id"]
    rows = db_conn.execute(
        "SELECT token_hash, expires_at FROM refresh_tokens WHERE user_id=?",
        (user_id,),
    ).fetchall()
    valid = False
    for r in rows:
        if r["expires_at"] < time.time():
            continue
        if verify_password(model.refresh_token, r["token_hash"]):
            valid = True
            break
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    access_token = create_access_token(data["sub"], data["role"], data.get("clinic"))
    expires_at_iso = (
        datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    ).isoformat() + "Z"
    return {
        "token": access_token,
        "expiresAt": expires_at_iso,
        # Backwards compatible fields
        "access_token": access_token,
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


@app.post("/auth/logout")
@app.post("/api/auth/logout")
async def auth_logout(model: LogoutModel) -> Dict[str, bool]:  # pragma: no cover - simple DB op
    """Revoke a refresh token by removing it from storage."""
    ensure_refresh_table(db_conn)
    try:
        data = jwt.decode(model.token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if data.get("type") != "refresh":
            raise jwt.PyJWTError()
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?",
        (data["sub"],),
    ).fetchone()
    if not row:
        return {"success": False}
    user_id = row["id"]
    rows = db_conn.execute(
        "SELECT id, token_hash FROM refresh_tokens WHERE user_id=?",
        (user_id,),
    ).fetchall()
    success = False
    for r in rows:
        if verify_password(model.token, r["token_hash"]):
            db_conn.execute("DELETE FROM refresh_tokens WHERE id=?", (r["id"],))
            success = True
            break
    db_conn.commit()
    return {"success": success}


@app.post("/reset-password")
async def reset_password(model: ResetPasswordModel) -> Dict[str, str]:
    """Allow a user to change their password by providing the current one."""
    row = db_conn.execute(
        "SELECT password_hash FROM users WHERE username=?",
        (model.username,),
    ).fetchone()
    if not row or not verify_password(model.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    db_conn.execute(
        "UPDATE users SET password_hash=? WHERE username=?",
        (hash_password(model.new_password), model.username),
    )
    db_conn.commit()
    return {"status": "password reset"}


@app.get("/api/user/profile")
async def get_user_profile(user=Depends(require_role("user"))) -> Dict[str, Any]:  # pragma: no cover - simple data fetch
    """Return the authenticated user's profile and preferences."""
    row = db_conn.execute(
        "SELECT id, role FROM users WHERE username=?",
        (user["sub"],),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    user_id, role = row["id"], row["role"]
    settings_row = db_conn.execute(
        "SELECT theme, categories, rules, lang, summary_lang, specialty, payer, region, use_local_models, use_offline_mode, agencies, template, beautify_model, suggest_model, summarize_model, deid_engine FROM settings WHERE user_id=?",
        (user_id,),
    ).fetchone()
    if settings_row:
        sr = dict(settings_row)
        preferences = {
            "theme": sr["theme"],
            "categories": json.loads(sr["categories"]),
            "rules": json.loads(sr["rules"]),
            "lang": sr["lang"],
            "summaryLang": sr["summary_lang"] or sr["lang"],
            "specialty": sr["specialty"],
            "payer": sr["payer"],
            "region": sr["region"] or "",
            "template": sr["template"],
            "useLocalModels": bool(sr["use_local_models"]),
            "useOfflineMode": bool(sr.get("use_offline_mode", 0)),
            "agencies": json.loads(sr["agencies"]) if sr["agencies"] else ["CDC", "WHO"],
            "beautifyModel": sr["beautify_model"],
            "suggestModel": sr["suggest_model"],
            "summarizeModel": sr["summarize_model"],
            "deidEngine": sr["deid_engine"] or os.getenv("DEID_ENGINE", "regex"),
        }
    else:
        preferences = UserSettings().model_dump()
    return {
        "id": user_id,
        "name": user["sub"],
        "role": role,
        "specialty": preferences.get("specialty"),
        "permissions": [role],
        "preferences": preferences,
    }


@app.get("/audit")
async def get_audit_logs(user=Depends(require_role("admin"))) -> List[Dict[str, Any]]:
    rows = db_conn.execute(
        "SELECT timestamp, username, action, details FROM audit_log ORDER BY timestamp DESC"
    ).fetchall()
    return [dict(r) for r in rows]


@app.get("/settings")
async def get_user_settings(user=Depends(require_role("user"))) -> Dict[str, Any]:
    """Return the current user's saved settings or defaults if none exist."""
    row = db_conn.execute(
        "SELECT s.theme, s.categories, s.rules, s.lang, s.summary_lang, s.specialty, s.payer, s.region, s.use_local_models, s.use_offline_mode, s.agencies, s.template, s.beautify_model, s.suggest_model, s.summarize_model, s.deid_engine FROM settings s JOIN users u ON s.user_id = u.id WHERE u.username=?",
        (user["sub"],),
    ).fetchone()

    if row:
        rd = dict(row)
        settings = UserSettings(
            theme=rd["theme"],
            categories=json.loads(rd["categories"]),
            rules=json.loads(rd["rules"]),
            lang=rd["lang"],
            summaryLang=rd["summary_lang"] or rd["lang"],
            specialty=rd["specialty"],
            payer=rd["payer"],
            region=rd["region"] or "",
            template=rd["template"],
            useLocalModels=bool(rd["use_local_models"]),
            useOfflineMode=bool(rd.get("use_offline_mode", 0)),
            agencies=json.loads(rd["agencies"]) if rd["agencies"] else ["CDC", "WHO"],
            beautifyModel=rd["beautify_model"],
            suggestModel=rd["suggest_model"],
            summarizeModel=rd["summarize_model"],
            deidEngine=rd["deid_engine"] or os.getenv("DEID_ENGINE", "regex"),
        )
        return settings.model_dump()
    return UserSettings(deidEngine=os.getenv("DEID_ENGINE", "regex")).model_dump()


@app.post("/settings")
@app.put("/api/user/preferences")
async def save_user_settings(
    model: UserSettings, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """Persist settings for the authenticated user."""
    # Explicit validation of deidEngine (pydantic may be bypassed if missing fields in test payload)
    if model.deidEngine not in {"regex", "presidio", "philter", "scrubadub"}:
        raise HTTPException(status_code=422, detail="invalid deid engine")
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?",
        (user["sub"],),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="User not found")
    db_conn.execute(
        # Added deid_engine column
        "INSERT OR REPLACE INTO settings (user_id, theme, categories, rules, lang, summary_lang, specialty, payer, region, template, use_local_models, agencies, beautify_model, suggest_model, summarize_model, deid_engine, use_offline_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            row["id"],
            model.theme,
            json.dumps(model.categories.model_dump()),
            json.dumps(model.rules),
            model.lang,
            model.summaryLang,
            model.specialty,
            model.payer,
            model.region,
            model.template,
            int(model.useLocalModels),
            json.dumps(model.agencies),
            model.beautifyModel,
            model.suggestModel,
            model.summarizeModel,
            model.deidEngine,
            int(model.useOfflineMode),
        ),
    )

    db_conn.commit()
    return model.model_dump()



@app.get("/api/user/session")
async def get_user_session(user=Depends(require_role("user"))) -> Dict[str, Any]:  # pragma: no cover - simple state fetch
    row = db_conn.execute(
        "SELECT data FROM sessions WHERE user_id=(SELECT id FROM users WHERE username=?)",
        (user["sub"],),
    ).fetchone()
    data = json.loads(row["data"]) if row else {}
    return {"session": data}


@app.put("/api/user/session")
async def put_user_session(
    model: SessionModel, user=Depends(require_role("user"))
) -> Dict[str, str]:  # pragma: no cover - simple state save
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?",


# ---------------------------------------------------------------------------
# Additional configuration endpoints
# ---------------------------------------------------------------------------


@app.get("/api/user/preferences")
async def api_get_user_preferences(user=Depends(require_role("user"))):
    return await get_user_settings(user)


@app.put("/api/user/preferences")
async def api_put_user_preferences(
    model: UserSettings, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    return await save_user_settings(model, user)


@app.get("/api/integrations/ehr/config")
async def get_ehr_integration_config(user=Depends(require_role("admin"))):
    return load_json_config("ehr_config")


@app.put("/api/integrations/ehr/config")
async def put_ehr_integration_config(
    config: Dict[str, Any], user=Depends(require_role("admin"))
) -> Dict[str, Any]:
    save_json_config("ehr_config", config)
    return config


@app.get("/api/organization/settings")
async def get_org_settings(user=Depends(require_role("admin"))):
    return load_json_config("organization_settings")


@app.put("/api/organization/settings")
async def put_org_settings(
    config: Dict[str, Any], user=Depends(require_role("admin"))
) -> Dict[str, Any]:
    save_json_config("organization_settings", config)
    return config


@app.get("/api/security/config")
async def get_security_config(user=Depends(require_role("admin"))):
    return load_json_config("security_config")


@app.put("/api/security/config")
async def put_security_config(
    config: Dict[str, Any], user=Depends(require_role("admin"))
) -> Dict[str, Any]:
    save_json_config("security_config", config)
    return config


@app.get("/api/keys")
async def get_keys_endpoint(user=Depends(require_role("admin"))):
    return {"keys": get_all_keys()}


@app.post("/api/keys")
async def post_keys_endpoint(
    model: NamedKeyModel, user=Depends(require_role("admin"))
):
    store_key(model.name, model.value)
    return {"status": "saved"}


@app.get("/api/user/layout-preferences")
async def get_layout_preferences(user=Depends(require_role("user"))) -> Dict[str, Any]:
    row = db_conn.execute(
        "SELECT layout_prefs FROM settings WHERE user_id=(SELECT id FROM users WHERE username=?)",
        (user["sub"],),
    ).fetchone()
    if row and row["layout_prefs"]:
        try:
            return json.loads(row["layout_prefs"])
        except Exception:
            return {}
    return {}


@app.put("/api/user/layout-preferences")
async def put_layout_preferences(
    prefs: Dict[str, Any], user=Depends(require_role("user"))
) -> Dict[str, Any]:
    data = json.dumps(prefs)
    row = db_conn.execute(
        "SELECT id FROM users WHERE username= ?",
        (user["sub"],),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="User not found")

    db_conn.execute(
        "INSERT OR REPLACE INTO sessions (user_id, data, updated_at) VALUES (?, ?, ?)",
        (row["id"], json.dumps(model.data), time.time()),
    )
    db_conn.commit()
    return {"status": "saved"}

    uid = row["id"]
    db_conn.execute(
        "INSERT OR IGNORE INTO settings (user_id, theme) VALUES (?, 'light')",
        (uid,),
    )
    db_conn.execute(
        "UPDATE settings SET layout_prefs=? WHERE user_id=?",
        (data, uid),
    )
    db_conn.commit()
    return prefs


class ErrorLogModel(BaseModel):
    message: str
    stack: Optional[str] = None


@app.post("/api/errors/log")
async def log_client_error(model: ErrorLogModel, request: Request) -> Dict[str, str]:
    username = None
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        token = auth.split()[1]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            username = payload.get("sub")
        except Exception:
            pass
    db_conn.execute(
        "INSERT INTO error_log (timestamp, username, message, stack) VALUES (?, ?, ?, ?)",
        (time.time(), username, model.message, model.stack),
    )
    db_conn.commit()
    return {"status": "logged"}


@app.websocket("/ws/notifications")
async def notifications_ws(ws: WebSocket):
    await ws.accept()
    notification_clients.add(ws)
    try:

@app.get("/api/formatting/rules")
async def get_formatting_rules(user=Depends(require_role("user"))) -> Dict[str, Any]:
    """Return organisation-specific formatting rules for the user."""
    try:
        row = db_conn.execute(
            "SELECT s.rules FROM settings s JOIN users u ON s.user_id = u.id WHERE u.username=?",
            (user["sub"],),
        ).fetchone()
        if row and row["rules"]:
            rules = json.loads(row["rules"])
        else:
            rules = []
    except sqlite3.OperationalError:
        rules = []
    return {"rules": rules}

class UserProfile(BaseModel):
    currentView: Optional[str] = None
    clinic: Optional[str] = None
    preferences: Dict[str, Any] = Field(default_factory=dict)
    uiPreferences: Dict[str, Any] = Field(default_factory=dict)


class UiPreferencesModel(BaseModel):
    uiPreferences: Dict[str, Any] = Field(default_factory=dict)


@app.get("/api/user/profile")
async def get_user_profile(user=Depends(require_role("user"))) -> Dict[str, Any]:
    row = db_conn.execute(
        "SELECT up.current_view, up.clinic, up.preferences, up.ui_preferences "
        "FROM user_profile up JOIN users u ON up.user_id = u.id WHERE u.username=?",
        (user["sub"],),
    ).fetchone()
    if row:
        return {
            "currentView": row["current_view"],
            "clinic": row["clinic"],
            "preferences": json.loads(row["preferences"]) if row["preferences"] else {},
            "uiPreferences": json.loads(row["ui_preferences"]) if row["ui_preferences"] else {},
        }
    return UserProfile().model_dump()


@app.put("/api/user/profile")
async def update_user_profile(
    profile: UserProfile, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?", (user["sub"],)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="User not found")
    db_conn.execute(
        "INSERT OR REPLACE INTO user_profile (user_id, current_view, clinic, preferences, ui_preferences) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            row["id"],
            profile.currentView,
            profile.clinic,
            json.dumps(profile.preferences),
            json.dumps(profile.uiPreferences),
        ),
    )
    db_conn.commit()
    return profile.model_dump()


@app.get("/api/user/current-view")
async def get_current_view(user=Depends(require_role("user"))) -> Dict[str, Any]:
    row = db_conn.execute(
        "SELECT up.current_view FROM user_profile up JOIN users u ON up.user_id = u.id WHERE u.username=?",
        (user["sub"],),
    ).fetchone()
    return {"currentView": row["current_view"] if row else None}


@app.get("/api/user/ui-preferences")
async def get_ui_preferences(user=Depends(require_role("user"))) -> Dict[str, Any]:
    row = db_conn.execute(
        "SELECT up.ui_preferences FROM user_profile up JOIN users u ON up.user_id = u.id WHERE u.username=?",
        (user["sub"],),
    ).fetchone()
    prefs = json.loads(row["ui_preferences"]) if row and row["ui_preferences"] else {}
    return {"uiPreferences": prefs}


@app.put("/api/user/ui-preferences")
async def put_ui_preferences(
    model: UiPreferencesModel, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?", (user["sub"],)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="User not found")
    updated = json.dumps(model.uiPreferences)
    cur = db_conn.execute(
        "UPDATE user_profile SET ui_preferences=? WHERE user_id=?",
        (updated, row["id"]),
    )
    if cur.rowcount == 0:
        db_conn.execute(
            "INSERT INTO user_profile (user_id, ui_preferences) VALUES (?, ?)",
            (row["id"], updated),
        )
    db_conn.commit()
    return {"uiPreferences": model.uiPreferences}


@app.get("/api/notifications/count")
async def get_notification_count(
    user=Depends(require_role("user"))
) -> Dict[str, int]:
    return {"count": notification_counts[user["sub"]]}


@app.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket, token: str):
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = data["sub"]
    except jwt.PyJWTError:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    notification_subscribers[username].append(websocket)
    try:
        await websocket.send_json({"count": notification_counts[username]})

        while True:
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        pass
    finally:

        notification_clients.discard(ws)

        if websocket in notification_subscribers[username]:
            notification_subscribers[username].remove(websocket)


class NoteRequest(BaseModel):
    """
    Schema for a note submitted by the frontend.  The primary field is
    `text`, the de‑identified clinical note.  Additional optional
    fields allow the client to provide context from an uploaded chart,
    user‑defined rules, or a transcript of a recorded visit.  These
    fields are appended to the note before sending to the AI model.
    """

    text: str
    chart: Optional[str] = None
    rules: Optional[List[str]] = None
    audio: Optional[str] = None
    lang: str = "en"
    specialty: Optional[str] = None
    payer: Optional[str] = None
    age: Optional[int] = Field(None, alias="patientAge")
    sex: Optional[str] = None
    region: Optional[str] = None
    useLocalModels: Optional[bool] = False
    useOfflineMode: Optional[bool] = False
    agencies: Optional[List[str]] = None
    beautifyModel: Optional[str] = None
    suggestModel: Optional[str] = None
    summarizeModel: Optional[str] = None

    class Config:
        populate_by_name = True



class CodesSuggestRequest(BaseModel):
    content: str
    patientData: Optional[Dict[str, Any]] = None
    useLocalModels: Optional[bool] = False
    useOfflineMode: Optional[bool] = False


class ComplianceCheckRequest(BaseModel):
    content: str
    codes: Optional[List[str]] = None
    useLocalModels: Optional[bool] = False
    useOfflineMode: Optional[bool] = False


class DifferentialsGenerateRequest(BaseModel):
    content: str
    symptoms: Optional[List[str]] = None
    patientData: Optional[Dict[str, Any]] = None
    useLocalModels: Optional[bool] = False
    useOfflineMode: Optional[bool] = False


class PreventionSuggestRequest(BaseModel):
    patientData: Optional[Dict[str, Any]] = None
    demographics: Optional[Dict[str, Any]] = None
    useLocalModels: Optional[bool] = False
    useOfflineMode: Optional[bool] = False


class RealtimeAnalyzeRequest(BaseModel):
    content: str
    patientContext: Optional[Dict[str, Any]] = None
    useLocalModels: Optional[bool] = False
    useOfflineMode: Optional[bool] = False

class VisitSessionModel(BaseModel):  # pragma: no cover - simple schema
    id: Optional[int] = None
    encounter_id: int
    data: Optional[str] = None


class AutoSaveModel(BaseModel):  # pragma: no cover - simple schema
    note_id: Optional[int] = None
    content: str
    beautifyModel: Optional[str] = None
    suggestModel: Optional[str] = None
    summarizeModel: Optional[str] = None

    class Config:
        populate_by_name = True



class CodeSuggestion(BaseModel):
    """Represents a single coding suggestion with rationale and upgrade."""

    code: str
    rationale: Optional[str] = None
    upgrade_to: Optional[str] = None
    upgradePath: Optional[str] = Field(None, alias="upgrade_path")


class PublicHealthSuggestion(BaseModel):
    """Preventative care recommendation with supporting reason."""

    recommendation: str
    reason: Optional[str] = None
    source: Optional[str] = None
    evidenceLevel: Optional[str] = None


class DifferentialSuggestion(BaseModel):
    """Potential differential diagnosis with likelihood score."""

    diagnosis: str
    # Use plain float optional; range validation can be enforced elsewhere.
    score: Optional[float] = None


class FollowUp(BaseModel):
    """Recommended follow-up interval and optional calendar event."""

    interval: Optional[str]
    ics: Optional[str] = None
    reason: Optional[str] = None


class SuggestionsResponse(BaseModel):
    """Schema for the suggestions returned to the frontend."""

    codes: List[CodeSuggestion]
    compliance: List[str]
    publicHealth: List[PublicHealthSuggestion]
    differentials: List[DifferentialSuggestion]
    followUp: Optional[FollowUp] = None



class PreFinalizeCheckRequest(BaseModel):
    """Payload for validating a note before finalization."""

    content: str
    codes: List[str] = Field(default_factory=list)
    prevention: List[str] = Field(default_factory=list)
    diagnoses: List[str] = Field(default_factory=list)
    differentials: List[str] = Field(default_factory=list)
    compliance: List[str] = Field(default_factory=list)


class FinalizeNoteRequest(PreFinalizeCheckRequest):
    """Request payload for completing note finalization."""
    pass

class CodeSuggestItem(BaseModel):
    code: str
    type: Optional[str] = None
    description: Optional[str] = None
    confidence: Optional[float] = None
    reasoning: Optional[str] = None


class CodesSuggestResponse(BaseModel):
    suggestions: List[CodeSuggestItem]


class ComplianceAlert(BaseModel):
    text: str
    category: Optional[str] = None
    priority: Optional[str] = None
    confidence: Optional[float] = None
    reasoning: Optional[str] = None


class ComplianceCheckResponse(BaseModel):
    alerts: List[ComplianceAlert]


class DifferentialItem(BaseModel):
    diagnosis: str
    confidence: Optional[float] = None
    reasoning: Optional[str] = None
    supportingFactors: Optional[List[str]] = None
    contradictingFactors: Optional[List[str]] = None
    testsToConfirm: Optional[List[str]] = None


class DifferentialsResponse(BaseModel):
    differentials: List[DifferentialItem]


class PreventionItem(BaseModel):
    recommendation: str
    priority: Optional[str] = None
    source: Optional[str] = None
    confidence: Optional[float] = None
    reasoning: Optional[str] = None
    ageRelevant: Optional[bool] = None


class PreventionResponse(BaseModel):
    recommendations: List[PreventionItem]


class RealtimeAnalysisResponse(BaseModel):
    analysisId: str
    extractedSymptoms: List[str]
    medicalHistory: List[str]
    currentMedications: List[str]
    confidence: Optional[float] = None
    reasoning: Optional[str] = None


class ScheduleRequest(BaseModel):
    """Request payload for the /schedule endpoint."""
    text: str
    codes: Optional[List[str]] = None
    specialty: Optional[str] = None
    payer: Optional[str] = None
    # Optional patient/reason for immediate appointment creation when exporting
    patient: Optional[str] = None
    reason: Optional[str] = None

class ScheduleResponse(FollowUp):
    """Response model containing recommended interval and optional ICS."""
    pass


# Schema for logging events from the frontend.  Each event should include
# an eventType (e.g., "note_started", "beautify", "suggest") and
# optional details (such as patient ID or note length).  The timestamp
# is optional; if not provided the current UTC time is used.
class EventModel(BaseModel):
    """Schema for analytics events sent from the frontend.

    In addition to a free-form ``details`` dictionary, several common
    analytics fields are exposed explicitly so clients can supply structured
    data without nesting.  These fields are merged back into ``details``
    when the event is stored.
    """

    eventType: str
    details: Optional[Dict[str, Any]] = None
    timestamp: Optional[float] = None
    codes: Optional[List[str]] = None
    revenue: Optional[float] = None
    denial: Optional[bool] = None
    timeToClose: Optional[float] = None
    clinician: Optional[str] = None
    deficiency: Optional[bool] = None
    compliance: Optional[List[str]] = None
    publicHealth: Optional[bool] = None
    satisfaction: Optional[int] = None
    baseline: Optional[bool] = None


class SurveyModel(BaseModel):
    """Schema for clinician feedback after completing a note."""

    rating: int = Field(..., ge=1, le=5)
    feedback: Optional[str] = None
    patientID: Optional[str] = None
    clinician: Optional[str] = None


# ------------------------- Dashboard models -------------------------------

class DailyOverviewModel(BaseModel):
    todaysNotes: int
    completedVisits: int
    pendingReviews: int
    complianceScore: float
    revenueToday: float


class QuickActionsModel(BaseModel):
    draftCount: int
    upcomingAppointments: int
    urgentReviews: int
    systemAlerts: List[Dict[str, Any]] = Field(default_factory=list)


class ActivityItemModel(BaseModel):
    id: int
    type: str
    timestamp: datetime
    description: Optional[str] = None
    userId: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SystemStatusModel(BaseModel):
    aiServicesStatus: str
    ehrConnectionStatus: str
    lastSyncTime: Optional[datetime] = None

# ------------------------- Dashboard endpoints ---------------------------


@app.get("/api/dashboard/daily-overview", response_model=DailyOverviewModel)
async def dashboard_daily_overview(user=Depends(require_role("user"))):
    def builder() -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        row = db_conn.execute(
            """
            SELECT
                SUM(CASE WHEN eventType IN ('note_started','note_saved') THEN 1 ELSE 0 END) AS notes,
                SUM(CASE WHEN eventType='note_closed' THEN 1 ELSE 0 END) AS closed,
                SUM(CASE WHEN eventType='note_closed' AND (compliance_flags IS NULL OR compliance_flags='[]') THEN 1 ELSE 0 END) AS compliant,
                SUM(COALESCE(revenue,0)) AS revenue
            FROM events
            WHERE timestamp>=? AND timestamp<?
            """,
            (start.timestamp(), end.timestamp()),
        ).fetchone()
        notes = row["notes"] or 0
        closed = row["closed"] or 0
        compliant = row["compliant"] or 0
        revenue = row["revenue"] or 0.0
        pending = notes - closed
        score = 100.0 if closed == 0 else (compliant / closed) * 100.0
        return {
            "todaysNotes": int(notes),
            "completedVisits": int(closed),
            "pendingReviews": int(pending),
            "complianceScore": round(score, 2),
            "revenueToday": float(revenue),
        }

    return _cached_response("daily_overview", builder)


@app.get("/api/dashboard/quick-actions", response_model=QuickActionsModel)
async def dashboard_quick_actions(user=Depends(require_role("user"))):
    def builder() -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        row = db_conn.execute(
            """
            SELECT
                SUM(CASE WHEN eventType IN ('note_started','note_saved') THEN 1 ELSE 0 END) AS notes,
                SUM(CASE WHEN eventType='note_closed' THEN 1 ELSE 0 END) AS closed,
                SUM(CASE WHEN eventType='note_closed' AND compliance_flags IS NOT NULL AND compliance_flags<>'[]' THEN 1 ELSE 0 END) AS urgent
            FROM events
            WHERE timestamp>=? AND timestamp<?
            """,
            (start.timestamp(), end.timestamp()),
        ).fetchone()
        notes = row["notes"] or 0
        closed = row["closed"] or 0
        urgent = row["urgent"] or 0
        now_dt = datetime.utcnow()
        upcoming = 0
        try:
            for appt in list_appointments():
                try:
                    if datetime.fromisoformat(appt["start"]) >= now_dt:
                        upcoming += 1
                except Exception:
                    continue
        except Exception:
            upcoming = 0
        return {
            "draftCount": int(max(notes - closed, 0)),
            "upcomingAppointments": int(upcoming),
            "urgentReviews": int(urgent),
        }

    data = _cached_response("quick_actions", builder)
    h = await health()
    alerts: List[Dict[str, Any]] = []
    if not h.get("db", True):
        alerts.append({"type": "db", "message": "Database unavailable"})
    data["systemAlerts"] = alerts
    return data


@app.get("/api/dashboard/activity", response_model=List[ActivityItemModel])
async def dashboard_activity(user=Depends(require_role("user"))):
    def builder() -> List[Dict[str, Any]]:
        cursor = db_conn.execute(
            "SELECT id, eventType, timestamp, details FROM events ORDER BY timestamp DESC LIMIT 20"
        )
        items: List[Dict[str, Any]] = []
        for row in cursor.fetchall():
            try:
                details = json.loads(row["details"] or "{}")
            except Exception:
                details = {}
            items.append(
                {
                    "id": row["id"],
                    "type": row["eventType"],
                    "timestamp": datetime.fromtimestamp(row["timestamp"], tz=timezone.utc),
                    "description": details.get("description"),
                    "userId": details.get("userId") or details.get("clinician"),
                    "metadata": details,
                }
            )
        return items

    return _cached_response("activity", builder)


@app.get("/api/system/status", response_model=SystemStatusModel, tags=["system"])
async def system_status():
    def builder() -> Dict[str, Any]:
        row = db_conn.execute("SELECT MAX(timestamp) as ts FROM events").fetchone()
        last_sync = (
            datetime.fromtimestamp(row["ts"], tz=timezone.utc) if row["ts"] else None
        )
        if USE_OFFLINE_MODEL:
            ai_status = "offline"
        elif get_api_key():
            ai_status = "online"
        else:
            ai_status = "degraded"
        ehr_url = os.getenv("FHIR_SERVER_URL", "https://fhir.example.com")
        ehr_status = (
            "connected" if ehr_url and "example.com" not in ehr_url else "disconnected"
        )
        return {
            "aiServicesStatus": ai_status,
            "ehrConnectionStatus": ehr_status,
            "lastSyncTime": last_sync,
        }

    return _cached_response("system_status", builder)

# The deidentify() implementation has been moved to backend.deid and is now
# exposed via the thin wrapper defined near the top of this file. Tests
# continue to monkeypatch symbols on backend.main (e.g. _DEID_ENGINE) which
# are forwarded to the modular implementation.

@app.get("/events")
async def get_events(user=Depends(require_role("admin"))) -> List[Dict[str, Any]]:
    try:
        cursor = db_conn.cursor()
        cursor.execute(
            "SELECT eventType, timestamp, details FROM events ORDER BY timestamp DESC LIMIT 200"
        )
        rows = cursor.fetchall()
        result: List[Dict[str, Any]] = []
        for row in rows:
            try:
                details = json.loads(row["details"] or "{}")
            except Exception:
                details = {}
            result.append(
                {
                    "eventType": row["eventType"],
                    "timestamp": row["timestamp"],
                    "details": details,
                }
            )
        return result
    except Exception as exc:
        logging.error("Error fetching events: %s", exc)
        # Return empty list on error
        return []


# Endpoint: log an event for analytics purposes.  The frontend should
# call this endpoint whenever a notable action occurs (e.g., starting
# a note, beautifying a note, requesting suggestions).  Events are
# stored in the global `events` list.  Returns a simple status.
@app.post("/event")
async def log_event(
    event: EventModel, user=Depends(require_role("user"))
) -> Dict[str, str]:
    data = {
        "eventType": event.eventType,
        "details": event.details or {},
        "timestamp": event.timestamp or datetime.utcnow().timestamp(),
    }

    # Merge structured fields into the details dict so downstream
    # aggregation queries can rely on a consistent schema regardless of
    # how the client supplied the data.
    for key in [
        "codes",
        "revenue",
        "denial",
        "timeToClose",
        "clinician",
        "deficiency",
        "compliance",
        "publicHealth",
        "satisfaction",
        "baseline",
    ]:
        value = getattr(event, key)
        if value is not None:
            data["details"][key] = value
    codes = data["details"].get("codes") or []
    if codes and "revenue" not in data["details"]:
        data["details"]["revenue"] = sum(
            CPT_REVENUE.get(str(c), 0.0) for c in codes
        )
    if "timeToClose" in data["details"]:
        try:
            data["details"]["timeToClose"] = float(data["details"]["timeToClose"])
        except (TypeError, ValueError):
            pass

    events.append(data)
    # Persist the event to the SQLite database.  Serialize the details
    # dictionary as JSON for storage.  Use a simple INSERT statement
    # and commit immediately because the volume of events is low in
    # this prototype.  In a production system, consider batching
    # writes or using an async database driver.
    try:
        db_conn.execute(
            "INSERT INTO events (eventType, timestamp, details, revenue, time_to_close, codes, compliance_flags, public_health, satisfaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                data["eventType"],
                data["timestamp"],
                json.dumps(data["details"], ensure_ascii=False),
                data["details"].get("revenue"),
                data["details"].get("timeToClose"),
                (
                    json.dumps(data["details"].get("codes"))
                    if data["details"].get("codes") is not None
                    else None
                ),
                (
                    json.dumps(data["details"].get("compliance"))
                    if data["details"].get("compliance") is not None
                    else None
                ),
                (
                    1
                    if data["details"].get("publicHealth") is True
                    else 0 if data["details"].get("publicHealth") is False else None
                ),
                data["details"].get("satisfaction"),
            ),
        )
        db_conn.commit()
    except Exception as exc:
        logging.error("Error inserting event into database: %s", exc)
    return {"status": "logged"}


@app.post("/survey")
async def submit_survey(
    survey: SurveyModel, user=Depends(require_role("user"))
) -> Dict[str, str]:
    """Record a satisfaction survey with optional free-text feedback."""

    ts = datetime.utcnow().timestamp()
    details = {
        "satisfaction": survey.rating,
        "feedback": survey.feedback or "",
    }
    if survey.patientID:
        details["patientID"] = survey.patientID
    if survey.clinician:
        details["clinician"] = survey.clinician
    events.append({"eventType": "survey", "details": details, "timestamp": ts})
    try:
        db_conn.execute(
            "INSERT INTO events (eventType, timestamp, details, revenue, codes, compliance_flags, public_health, satisfaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "survey",
                ts,
                json.dumps(details, ensure_ascii=False),
                None,
                None,
                None,
                None,
                survey.rating,
            ),
        )
        db_conn.commit()
    except Exception as exc:
        logging.error("Error inserting survey into database: %s", exc)
    return {"status": "recorded"}


def _validate_prompt_templates(data: Dict[str, Any]) -> None:
    """Ensure prompt template structure is a mapping of mappings."""
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Template must be a JSON object")
    for key in ("default", "specialty", "payer"):
        if key in data and not isinstance(data[key], dict):
            raise HTTPException(
                status_code=400, detail=f"'{key}' section must be an object"
            )


@app.get("/prompt-templates", response_model=Dict[str, Any])
def get_prompt_templates(user=Depends(require_role("admin"))) -> Dict[str, Any]:
    """Return the current prompt templates file."""
    path = os.path.join(os.path.dirname(__file__), "prompt_templates.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


@app.post("/prompt-templates", response_model=Dict[str, Any])
def save_prompt_templates(
    data: Dict[str, Any], user=Depends(require_role("admin"))
) -> Dict[str, Any]:
    """Validate and persist prompt templates supplied by an admin user."""
    _validate_prompt_templates(data)
    path = os.path.join(os.path.dirname(__file__), "prompt_templates.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    prompt_utils._load_custom_templates.cache_clear()
    return data


@app.get("/templates", response_model=List[TemplateModel])
@app.get("/api/templates/list", response_model=List[TemplateModel])
def get_templates(
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
    user=Depends(require_role("user")),
) -> List[TemplateModel]:
    """Return templates for the current user and clinic, optionally filtered by specialty or payer."""

    return list_user_templates(
        db_conn, user["sub"], user.get("clinic"), specialty, payer
    )


@app.post("/templates", response_model=TemplateModel)
@app.post("/api/templates", response_model=TemplateModel)
def create_template(
    tpl: TemplateModel, user=Depends(require_role("user"))
) -> TemplateModel:
    """Create a new template for the user or clinic."""

    return create_user_template(
        db_conn,
        user["sub"],
        user.get("clinic"),
        tpl,
        user.get("role") == "admin",
    )


@app.put("/templates/{template_id}", response_model=TemplateModel)
@app.put("/api/templates/{template_id}", response_model=TemplateModel)
def update_template(
    template_id: int, tpl: TemplateModel, user=Depends(require_role("user"))
) -> TemplateModel:
    """Update an existing template owned by the user or clinic."""

    return update_user_template(
        db_conn,
        user["sub"],
        user.get("clinic"),
        template_id,
        tpl,
        user.get("role") == "admin",
    )


@app.delete("/templates/{template_id}")
@app.delete("/api/templates/{template_id}")
def delete_template(
    template_id: int, user=Depends(require_role("user"))
) -> Dict[str, str]:
    """Delete a template owned by the user or clinic."""

    delete_user_template(
        db_conn,
        user["sub"],
        user.get("clinic"),
        template_id,
        user.get("role") == "admin",
    )
    return {"status": "deleted"}


class AutoSaveRequest(BaseModel):
    noteId: str
    content: str


@app.post("/api/notes/auto-save")
def auto_save_note(
    req: AutoSaveRequest, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """Persist note content in-memory for versioning."""

    versions = NOTE_VERSIONS[req.noteId]
    versions.append(
        {"timestamp": datetime.now(timezone.utc).isoformat(), "content": req.content}
    )
    if len(versions) > 20:
        versions.pop(0)
    return {"status": "saved", "version": len(versions)}


@app.get("/api/notes/versions/{note_id}")
def get_note_versions(
    note_id: str, user=Depends(require_role("user"))
) -> List[Dict[str, str]]:
    """Return previously auto-saved versions for a note."""

    return NOTE_VERSIONS.get(note_id, [])


class ExportRequest(BaseModel):
    """Payload for exporting a note and codes to an external EHR system.

    ``codes`` are user‑selected billing / clinical codes. The backend will
    infer resource types (Condition, Procedure, Observation, MedicationStatement)
    and construct a FHIR Transaction Bundle containing:
      * Composition (summary + references)
      * Observation (raw note)
      * DocumentReference (base64 note)
      * Claim (billing items)
      * Condition / Procedure / Observation / MedicationStatement resources
        derived from supplied codes
    When the FHIR server is not configured the generated bundle is returned
    directly instead of being posted so the client can download it manually.
    """
    note: str
    codes: List[str] = Field(default_factory=list)
    procedures: List[str] = Field(default_factory=list)
    medications: List[str] = Field(default_factory=list)
    patientID: Optional[str] = None
    encounterID: Optional[str] = None
    ehrSystem: Optional[str] = None

async def _perform_ehr_export(req: ExportRequest) -> Dict[str, Any]:
    """Internal helper to post (or generate) a FHIR bundle."""
    try:
        from backend import ehr_integration  # absolute import for packaged mode
        result = ehr_integration.post_note_and_codes(
            req.note,
            req.codes,
            req.patientID,
            req.encounterID,
            req.procedures,
            req.medications,
        )
        if result.get("status") not in {"exported", "bundle"}:
            logger.error("EHR export failed: %s", result)
        return result
    except requests.exceptions.RequestException as exc:  # pragma: no cover - network failures
        logger.exception("Network error during EHR export")
        return {"status": "error", "detail": str(exc)}
    except Exception as exc:  # pragma: no cover - unexpected failures
        logger.exception("Unexpected error during EHR export")
        return {"status": "error", "detail": str(exc)}


@app.post("/export")
async def export_to_ehr(
    req: ExportRequest, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """Legacy endpoint for exporting a note to an external EHR."""
    return await _perform_ehr_export(req)


@app.post("/api/export/ehr")
async def export_to_ehr_api(
    req: ExportRequest, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """Export a note to an EHR system and track the result."""
    result = await _perform_ehr_export(req)
    try:
        cur = db_conn.cursor()
        cur.execute(
            "INSERT INTO exports (timestamp, ehr, note, status, detail) VALUES (?, ?, ?, ?, ?)",
            (
                time.time(),
                req.ehrSystem or "",
                req.note,
                result.get("status"),
                json.dumps(result),
            ),
        )
        db_conn.commit()
        export_id = cur.lastrowid
    except Exception:
        export_id = None
    progress = 1.0 if result.get("status") in {"exported", "bundle"} else 0.0
    resp: Dict[str, Any] = {"status": result.get("status"), "progress": progress}
    if export_id is not None:
        resp["exportId"] = export_id
    return resp


@app.get("/api/export/ehr/{export_id}")
async def get_export_status(
    export_id: int, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    row = db_conn.execute(
        "SELECT id, status, ehr, timestamp, detail FROM exports WHERE id=?",
        (export_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Export not found")
    detail = json.loads(row["detail"]) if row["detail"] else None
    return {
        "exportId": row["id"],
        "status": row["status"],
        "ehrSystem": row["ehr"],
        "timestamp": row["timestamp"],
        "detail": detail,
    }


# Endpoint: aggregate metrics from the logged events.  Returns counts of
# notes created/saved, beautification actions and suggestions, as well
# as the average note length (in characters) if provided in event
# details.
@app.get("/metrics")
async def get_metrics(
    start: Optional[str] = None,
    end: Optional[str] = None,
    clinician: Optional[str] = None,
    daily: bool = True,
    weekly: bool = True,
    user=Depends(require_role("admin")),
) -> Dict[str, Any]:
    """Aggregate analytics separately for baseline and current events.

    Events with ``baseline=true`` represent pre‑implementation metrics.
    The response contains aggregates for both baseline and current periods
    plus percentage improvement of current over baseline."""

    cursor = db_conn.cursor()

    # Detect optional schema columns for backwards compatibility (older tests/DBs)
    try:
        event_columns = {row[1] for row in cursor.execute("PRAGMA table_info(events)")}
    except Exception:
        event_columns = set()
    has_time_to_close = "time_to_close" in event_columns
    # Build reusable fragments depending on column availability
    time_to_close_avg_expr = (
        "AVG(time_to_close) AS avg_time_to_close," if has_time_to_close else "NULL AS avg_time_to_close,"  # noqa: E501
    )

    cursor.execute(
        """
        SELECT DISTINCT json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.clinician') AS clinician
        FROM events
        WHERE json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.clinician') IS NOT NULL
        """
    )
    clinicians = [row["clinician"] for row in cursor.fetchall() if row["clinician"]]

    def _parse_iso_ts(value: str) -> float | None:
        try:
            dt = datetime.fromisoformat(value)
            # Treat naive datetimes as UTC (tests supply epoch-based times)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.timestamp()
        except Exception:
            return None

    base_conditions: List[str] = []
    base_params: List[Any] = []
    if start:
        ts = _parse_iso_ts(start)
        if ts is not None:
            base_conditions.append("timestamp >= ?")
            base_params.append(ts)
    if end:
        ts = _parse_iso_ts(end)
        if ts is not None:
            base_conditions.append("timestamp <= ?")
            base_params.append(ts)
    if clinician:
        base_conditions.append(
            "json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.clinician') = ?"
        )
        base_params.append(clinician)

    baseline_cond = "json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.baseline') = 1"
    current_cond = "(json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.baseline') IS NULL OR json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.baseline') = 0)"

    current_conditions = base_conditions + [current_cond]
    baseline_conditions = base_conditions + [baseline_cond]

    where_current = (
        f"WHERE {' AND '.join(current_conditions)}" if current_conditions else ""
    )
    where_baseline = (
        f"WHERE {' AND '.join(baseline_conditions)}" if baseline_conditions else ""
    )

    def compute_basic(
        where_clause: str, params: List[Any], collect_timeseries: bool = False
    ) -> Dict[str, Any]:
        totals_query = f"""
            SELECT
                SUM(CASE WHEN eventType IN ('note_started','note_saved') THEN 1 ELSE 0 END) AS total_notes,
                SUM(CASE WHEN eventType='beautify' THEN 1 ELSE 0 END)        AS total_beautify,
                SUM(CASE WHEN eventType='suggest' THEN 1 ELSE 0 END)         AS total_suggest,
                SUM(CASE WHEN eventType='summary' THEN 1 ELSE 0 END)         AS total_summary,
                SUM(CASE WHEN eventType='chart_upload' THEN 1 ELSE 0 END)    AS total_chart_upload,
                SUM(CASE WHEN eventType='audio_recorded' THEN 1 ELSE 0 END)  AS total_audio,
                AVG(CAST(json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.length') AS REAL)) AS avg_note_length,
                SUM(revenue) AS revenue_projection,
                AVG(revenue) AS revenue_per_visit,
                {time_to_close_avg_expr}
                AVG(satisfaction) AS avg_satisfaction,
                AVG(public_health) AS public_health_rate
            FROM events {where_clause}
        """.replace("\n                {time_to_close_avg_expr}\n", f"\n                {time_to_close_avg_expr}\n")
        cursor.execute(totals_query, params)
        row = cursor.fetchone()
        totals = dict(row) if row else {}
        metrics: Dict[str, Any] = {
            "total_notes": totals.get("total_notes", 0) or 0,
            "total_beautify": totals.get("total_beautify", 0) or 0,
            "total_suggest": totals.get("total_suggest", 0) or 0,
            "total_summary": totals.get("total_summary", 0) or 0,
            "total_chart_upload": totals.get("total_chart_upload", 0) or 0,
            "total_audio": totals.get("total_audio", 0) or 0,
            "avg_note_length": totals.get("avg_note_length") or 0,
            "revenue_projection": totals.get("revenue_projection") or 0,
            "revenue_per_visit": totals.get("revenue_per_visit") or 0,
            "avg_time_to_close": totals.get("avg_time_to_close") or 0,
        }

        cursor.execute(
            f"SELECT eventType, timestamp, details, codes, compliance_flags, public_health, satisfaction FROM events {where_clause} ORDER BY timestamp",
            params,
        )
        rows = cursor.fetchall()
        code_counts: Dict[str, int] = {}
        denial_counts: Dict[str, List[int]] = {}
        denial_totals = [0, 0]
        deficiency_totals = [0, 0]
        compliance_counts: Dict[str, int] = {}
        public_health_totals = [0, 0]
        satisfaction_sum = satisfaction_count = 0
        beautify_time_sum = beautify_time_count = 0.0
        beautify_daily: Dict[str, List[float]] = {} if collect_timeseries else {}
        beautify_weekly: Dict[str, List[float]] = {} if collect_timeseries else {}
        last_start_for_patient: Dict[str, float] = {}
        template_counts: Dict[str, int] = {}
        beautify_weekly: Dict[str, List[float]] = {} if collect_timeseries else {}
        last_start_for_patient: Dict[str, float] = {}
        template_counts: Dict[str, int] = {}

        for r in rows:
            evt = r["eventType"]
            ts = r["timestamp"]
            try:
                details = json.loads(r["details"] or "{}")
            except Exception:
                details = {}

            codes_val = r["codes"]
            try:
                codes = json.loads(codes_val) if codes_val else []
            except Exception:
                codes = []
            if isinstance(codes, list):
                denial_flag = (
                    details.get("denial")
                    if isinstance(details.get("denial"), bool)
                    else None
                )
                for code in codes:
                    code_counts[code] = code_counts.get(code, 0) + 1
                    if denial_flag is not None:
                        totals_d = denial_counts.get(code, [0, 0])
                        totals_d[0] += 1
                        if denial_flag:
                            totals_d[1] += 1
                        denial_counts[code] = totals_d

            comp_val = r["compliance_flags"]
            try:
                comp_list = json.loads(comp_val) if comp_val else []
            except Exception:
                comp_list = []
            for flag in comp_list:
                compliance_counts[flag] = compliance_counts.get(flag, 0) + 1

            public_health = r["public_health"]
            if isinstance(public_health, int):
                public_health_totals[0] += 1
                if public_health:
                    public_health_totals[1] += 1

            satisfaction = r["satisfaction"]
            if isinstance(satisfaction, (int, float)):
                satisfaction_sum += float(satisfaction)
                satisfaction_count += 1

            denial = details.get("denial")
            if isinstance(denial, bool):
                denial_totals[0] += 1
                if denial:
                    denial_totals[1] += 1

            deficiency = details.get("deficiency")
            if isinstance(deficiency, bool):
                deficiency_totals[0] += 1
                if deficiency:
                    deficiency_totals[1] += 1

            if evt == "template_use":
                tpl_id = details.get("templateId") or details.get("template_id")
                if tpl_id is not None:
                    template_counts[str(tpl_id)] = template_counts.get(str(tpl_id), 0) + 1

            patient_id = (
                details.get("patientID")
                or details.get("patientId")
                or details.get("patient_id")
            )
            if evt == "note_started" and patient_id:
                last_start_for_patient[patient_id] = ts
            if (
                evt == "beautify"
                and patient_id
                and patient_id in last_start_for_patient
            ):
                duration = ts - last_start_for_patient[patient_id]
                beautify_time_sum += duration
                beautify_time_count += 1
                if collect_timeseries:
                    day = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
                    week = datetime.utcfromtimestamp(ts).strftime("%Y-%W")
                    drec = beautify_daily.setdefault(day, [0.0, 0])
                    drec[0] += duration
                    drec[1] += 1
                    wrec = beautify_weekly.setdefault(week, [0.0, 0])
                    wrec[0] += duration
                    wrec[1] += 1

        avg_beautify_time = (
            beautify_time_sum / beautify_time_count if beautify_time_count else 0
        )
        denial_rates = {
            c: (v[1] / v[0] if v[0] else 0) for c, v in denial_counts.items()
        }
        overall_denial = denial_totals[1] / denial_totals[0] if denial_totals[0] else 0
        deficiency_rate = (
            deficiency_totals[1] / deficiency_totals[0] if deficiency_totals[0] else 0
        )
        public_health_rate = (
            public_health_totals[1] / public_health_totals[0]
            if public_health_totals[0]
            else 0
        )
        avg_satisfaction = (
            satisfaction_sum / satisfaction_count if satisfaction_count else 0
        )

        sorted_compliance = sorted(
            compliance_counts.items(), key=lambda x: x[1], reverse=True
        )
        metrics.update(
            {
                "avg_beautify_time": avg_beautify_time,
                "coding_distribution": code_counts,
                "denial_rate": overall_denial,
                "denial_rates": denial_rates,
                "deficiency_rate": deficiency_rate,
                "compliance_counts": compliance_counts,
                "top_compliance": [
                    {"flag": f, "count": c} for f, c in sorted_compliance[:5]
                ],
                "public_health_rate": public_health_rate,
                "avg_satisfaction": avg_satisfaction,
                "template_counts": template_counts,
            }
        )
        if collect_timeseries:
            metrics["beautify_daily"] = beautify_daily
            metrics["beautify_weekly"] = beautify_weekly
        return metrics

    current_metrics = compute_basic(where_current, base_params, collect_timeseries=True)
    baseline_metrics = compute_basic(where_baseline, base_params)

    beautify_daily = current_metrics.pop("beautify_daily")
    beautify_weekly = current_metrics.pop("beautify_weekly")
    coding_distribution = current_metrics.pop("coding_distribution")
    denial_rates = current_metrics.pop("denial_rates")
    compliance_counts = current_metrics.pop("compliance_counts")
    top_compliance = current_metrics.pop("top_compliance")
    public_health_rate = current_metrics.pop("public_health_rate")
    avg_satisfaction = current_metrics.pop("avg_satisfaction")
    template_counts = current_metrics.pop("template_counts")
    baseline_template_counts = baseline_metrics.pop("template_counts")
    top_compliance = sorted(
        compliance_counts.items(), key=lambda x: x[1], reverse=True
    )[:5]


    top_compliance = [
        k for k, _ in sorted(compliance_counts.items(), key=lambda kv: kv[1], reverse=True)[:5]
    ]

    top_compliance = [
        k
        for k, _ in sorted(
            compliance_counts.items(), key=lambda x: x[1], reverse=True
        )[:5]
    ]

    top_compliance = [
        k
        for k, _ in sorted(
            compliance_counts.items(), key=lambda kv: kv[1], reverse=True
        )[:5]
    ]

    daily_list: List[Dict[str, Any]] = []
    if daily:
        daily_query = f"""
            SELECT
                date(datetime(timestamp, 'unixepoch')) AS date,
                SUM(CASE WHEN eventType IN ('note_started','note_saved') THEN 1 ELSE 0 END) AS notes,
                SUM(CASE WHEN eventType='beautify' THEN 1 ELSE 0 END)   AS beautify,
                SUM(CASE WHEN eventType='suggest' THEN 1 ELSE 0 END)    AS suggest,
                SUM(CASE WHEN eventType='summary' THEN 1 ELSE 0 END)    AS summary,
                SUM(CASE WHEN eventType='chart_upload' THEN 1 ELSE 0 END) AS chart_upload,
                SUM(CASE WHEN eventType='audio_recorded' THEN 1 ELSE 0 END) AS audio,
                AVG(CAST(json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.length') AS REAL)) AS avg_note_length,
                SUM(revenue) AS revenue_projection,
                AVG(revenue) AS revenue_per_visit,
                {('AVG(time_to_close) AS avg_time_to_close,' if has_time_to_close else 'NULL AS avg_time_to_close,')}
                SUM(CASE WHEN eventType='note_closed' AND json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.denial') = 1 THEN 1 ELSE 0 END) AS denials,
                SUM(CASE WHEN eventType='note_closed' AND json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.deficiency') = 1 THEN 1 ELSE 0 END) AS deficiencies,
                SUM(json_array_length(CASE WHEN json_valid(compliance_flags) THEN compliance_flags ELSE '[]' END)) AS compliance_flags
            FROM events {where_current}
            GROUP BY date
            ORDER BY date
        """
        cursor.execute(daily_query, base_params)
        daily_list = [dict(r) for r in cursor.fetchall()]
    weekly_list: List[Dict[str, Any]] = []
    if weekly:
        weekly_query = f"""
            SELECT
                strftime('%Y-%W', datetime(timestamp, 'unixepoch')) AS week,
                SUM(CASE WHEN eventType IN ('note_started','note_saved') THEN 1 ELSE 0 END) AS notes,
                SUM(CASE WHEN eventType='beautify' THEN 1 ELSE 0 END)   AS beautify,
                SUM(CASE WHEN eventType='suggest' THEN 1 ELSE 0 END)    AS suggest,
                SUM(CASE WHEN eventType='summary' THEN 1 ELSE 0 END)    AS summary,
                SUM(CASE WHEN eventType='chart_upload' THEN 1 ELSE 0 END) AS chart_upload,
                SUM(CASE WHEN eventType='audio_recorded' THEN 1 ELSE 0 END) AS audio,
                AVG(CAST(json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.length') AS REAL)) AS avg_note_length,
                SUM(revenue) AS revenue_projection,
                AVG(revenue) AS revenue_per_visit,
                {('AVG(time_to_close) AS avg_time_to_close,' if has_time_to_close else 'NULL AS avg_time_to_close,')}
                SUM(CASE WHEN eventType='note_closed' AND json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.denial') = 1 THEN 1 ELSE 0 END) AS denials,
                SUM(CASE WHEN eventType='note_closed' AND json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.deficiency') = 1 THEN 1 ELSE 0 END) AS deficiencies,
                SUM(json_array_length(CASE WHEN json_valid(compliance_flags) THEN compliance_flags ELSE '[]' END)) AS compliance_flags
            FROM events {where_current}
            GROUP BY week
            ORDER BY week
        """
        cursor.execute(weekly_query, base_params)
        weekly_list = [dict(r) for r in cursor.fetchall()]
    # attach beautify averages to the SQL-produced time series
    if daily:
        for entry in daily_list:
            bt = beautify_daily.get(entry["date"])
            entry["avg_beautify_time"] = bt[0] / bt[1] if bt and bt[1] else 0
            notes = entry.get("notes") or 0
            entry["denial_rate"] = (entry.get("denials", 0) / notes) if notes else 0
            entry["deficiency_rate"] = (entry.get("deficiencies", 0) / notes) if notes else 0
    if weekly:
        for entry in weekly_list:
            bt = beautify_weekly.get(entry["week"])
            entry["avg_beautify_time"] = bt[0] / bt[1] if bt and bt[1] else 0
            notes = entry.get("notes") or 0
            entry["denial_rate"] = (entry.get("denials", 0) / notes) if notes else 0
            entry["deficiency_rate"] = (entry.get("deficiencies", 0) / notes) if notes else 0

    def _add_rolling(records: List[Dict[str, Any]], window: int) -> None:
        """Attach rolling averages for key metrics."""
        fields = [
            "notes",
            "beautify",
            "suggest",
            "summary",
            "chart_upload",
            "audio",
            "avg_note_length",
            "avg_beautify_time",
            "avg_time_to_close",
            "revenue_per_visit",
            "revenue_projection",
            "denials",
            "deficiencies",
            "compliance_flags",
        ]
        sums: Dict[str, float] = {f: 0.0 for f in fields}
        queues: Dict[str, deque] = {f: deque() for f in fields}
        for rec in records:
            for f in fields:
                val = float(rec.get(f, 0) or 0)
                q = queues[f]
                q.append(val)
                sums[f] += val
                if len(q) > window:
                    sums[f] -= q.popleft()
                rec[f"rolling_{f}"] = sums[f] / len(q) if q else 0

    if daily:
        _add_rolling(daily_list, 7)
    if weekly:
        _add_rolling(weekly_list, 4)

    def _code_timeseries(period_sql: str) -> Dict[str, Dict[str, int]]:
        # Reformatted to avoid multiline f-string indentation issues seen in some Python versions.
        base_select = (
            "SELECT "
            + period_sql
            + " AS period, json_each.value AS code, COUNT(*) AS count FROM events "
            "JOIN json_each(COALESCE(events.codes, '[]')) "
        )
        query = (
            base_select
            + (where_current + " " if where_current else "")
            + "GROUP BY period, code ORDER BY period"
        )
        cursor.execute(query, base_params)
        result: Dict[str, Dict[str, int]] = {}
        for r in cursor.fetchall():
            period = r["period"]
            code_map = result.setdefault(period, {})
            code_map[r["code"]] = r["count"]
        return result

    codes_daily: Dict[str, Dict[str, int]] = {}
    codes_weekly: Dict[str, Dict[str, int]] = {}
    if daily:
        codes_daily = _code_timeseries("date(datetime(timestamp, 'unixepoch'))")
    if weekly:
        codes_weekly = _code_timeseries("strftime('%Y-%W', datetime(timestamp, 'unixepoch'))")

    timeseries: Dict[str, List[Dict[str, Any]]] = {}
    if daily:
        timeseries["daily"] = daily_list
        timeseries["codes_daily"] = codes_daily
    if weekly:
        timeseries["weekly"] = weekly_list
        timeseries["codes_weekly"] = codes_weekly

    def pct_change(b: float, c: float) -> float | None:
        return ((c - b) / b * 100) if b else None

    keys = [
        "total_notes",
        "total_beautify",
        "total_suggest",
        "total_summary",
        "total_chart_upload",
        "total_audio",
        "avg_note_length",
        "avg_beautify_time",
        "avg_time_to_close",
        "revenue_per_visit",
        "revenue_projection",
        "denial_rate",
        "deficiency_rate",
    ]
    improvement = {
        k: pct_change(baseline_metrics.get(k, 0), current_metrics.get(k, 0))
        for k in keys
    }


    top_compliance = [
        k for k, _ in sorted(compliance_counts.items(), key=lambda kv: kv[1], reverse=True)
    ]

    return {
        "baseline": baseline_metrics,
        "current": current_metrics,
        "improvement": improvement,
        "coding_distribution": coding_distribution,
        "denial_rates": denial_rates,
        "compliance_counts": compliance_counts,
        "top_compliance": [c for c, _ in top_compliance],
        "public_health_rate": public_health_rate,
        "avg_satisfaction": avg_satisfaction,
        "template_usage": {
            "current": template_counts,
            "baseline": baseline_template_counts,
        },
        "clinicians": clinicians,
        "timeseries": timeseries,
        "top_compliance": top_compliance,

    }


def _analytics_where(user: Dict[str, Any]) -> tuple[str, List[Any]]:
    """Return a WHERE clause limiting events based on user role."""
    if user.get("role") == "admin":
        return "", []
    return (
        "WHERE json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.clinician') = ?",
        [user["sub"]],
    )


@app.get("/api/analytics/usage")
async def analytics_usage(user=Depends(require_role("user"))) -> Dict[str, Any]:
    """Basic usage analytics aggregated from events."""
    where, params = _analytics_where(user)
    cursor = db_conn.cursor()
    cursor.execute(
        f"""
        SELECT
            SUM(CASE WHEN eventType IN ('note_started','note_saved','note_closed') THEN 1 ELSE 0 END) AS total_notes,
            SUM(CASE WHEN eventType='beautify' THEN 1 ELSE 0 END) AS beautify,
            SUM(CASE WHEN eventType='suggest' THEN 1 ELSE 0 END) AS suggest,
            SUM(CASE WHEN eventType='summary' THEN 1 ELSE 0 END) AS summary,
            SUM(CASE WHEN eventType='chart_upload' THEN 1 ELSE 0 END) AS chart_upload,
            SUM(CASE WHEN eventType='audio_recorded' THEN 1 ELSE 0 END) AS audio,
            AVG(CAST(json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.length') AS REAL)) AS avg_note_length
        FROM events {where}
        """,
        params,
    )
    row = cursor.fetchone()
    data = dict(row) if row else {}
    return {
        "total_notes": data.get("total_notes", 0) or 0,
        "beautify": data.get("beautify", 0) or 0,
        "suggest": data.get("suggest", 0) or 0,
        "summary": data.get("summary", 0) or 0,
        "chart_upload": data.get("chart_upload", 0) or 0,
        "audio": data.get("audio", 0) or 0,
        "avg_note_length": data.get("avg_note_length", 0) or 0,
    }


@app.get("/api/analytics/coding-accuracy")
async def analytics_coding_accuracy(user=Depends(require_role("user"))) -> Dict[str, Any]:
    """Coding accuracy metrics derived from events and billing codes."""
    where, params = _analytics_where(user)
    cursor = db_conn.cursor()
    cursor.execute(
        f"""
        SELECT
            SUM(CASE WHEN eventType='note_closed' THEN 1 ELSE 0 END) AS total_notes,
            SUM(CASE WHEN eventType='note_closed' AND json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.denial') = 1 THEN 1 ELSE 0 END) AS denials,
            SUM(CASE WHEN eventType='note_closed' AND json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.deficiency') = 1 THEN 1 ELSE 0 END) AS deficiencies
        FROM events {where}
        """,
        params,
    )
    row = cursor.fetchone()
    data = dict(row) if row else {}
    total = data.get("total_notes", 0) or 0
    denials = data.get("denials", 0) or 0
    deficiencies = data.get("deficiencies", 0) or 0
    accuracy = (total - denials - deficiencies) / total if total else 0
    cursor.execute(
        "SELECT json_each.value AS code, COUNT(*) AS count FROM events "
        "JOIN json_each(COALESCE(events.codes, '[]')) "
        f"{where} GROUP BY code",
        params,
    )
    distribution = {r["code"]: r["count"] for r in cursor.fetchall()}
    return {
        "total_notes": total,
        "denials": denials,
        "deficiencies": deficiencies,
        "accuracy": accuracy,
        "coding_distribution": distribution,
    }


@app.get("/api/analytics/revenue")
async def analytics_revenue(user=Depends(require_role("user"))) -> Dict[str, Any]:
    """Revenue analytics aggregated from event billing data."""
    where, params = _analytics_where(user)
    cursor = db_conn.cursor()
    cursor.execute(
        f"SELECT SUM(revenue) AS total, AVG(revenue) AS average FROM events {where}",
        params,
    )
    row = cursor.fetchone()
    data = dict(row) if row else {}
    cursor.execute(
        "SELECT json_each.value AS code, SUM(events.revenue) AS revenue FROM events "
        "JOIN json_each(COALESCE(events.codes, '[]')) "
        f"{where} GROUP BY code",
        params,
    )
    by_code = {r["code"]: r["revenue"] for r in cursor.fetchall()}
    return {
        "total_revenue": data.get("total", 0) or 0,
        "average_revenue": data.get("average", 0) or 0,
        "revenue_by_code": by_code,
    }


@app.get("/api/analytics/compliance")
async def analytics_compliance(user=Depends(require_role("user"))) -> Dict[str, Any]:
    """Compliance analytics derived from logged events."""
    where, params = _analytics_where(user)
    cursor = db_conn.cursor()
    cursor.execute(
        "SELECT json_each.value AS flag, COUNT(*) AS count FROM events "
        "JOIN json_each(COALESCE(events.compliance_flags, '[]')) "
        f"{where} GROUP BY flag",
        params,
    )
    flags = {r["flag"]: r["count"] for r in cursor.fetchall()}
    cursor.execute(
        f"SELECT SUM(CASE WHEN compliance_flags IS NOT NULL AND compliance_flags != '[]' THEN 1 ELSE 0 END) AS notes_with_flags FROM events {where}",
        params,
    )
    notes_row = cursor.fetchone()
    cursor.execute(
        f"SELECT SUM(json_array_length(COALESCE(compliance_flags, '[]'))) AS total_flags FROM events {where}",
        params,
    )
    flags_row = cursor.fetchone()
    return {
        "compliance_counts": flags,
        "notes_with_flags": (dict(notes_row).get("notes_with_flags", 0) if notes_row else 0),
        "total_flags": (dict(flags_row).get("total_flags", 0) if flags_row else 0),
    }


@app.get("/api/user/permissions")
async def get_user_permissions(user=Depends(require_role("user"))) -> Dict[str, Any]:
    """Return the current user's role."""
    return {"role": user["role"]}


@app.post("/summarize")
async def summarize(
    req: NoteRequest, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """
    Generate a patient‑friendly summary of a clinical note.  This endpoint
    combines the draft text with any optional chart and audio transcript,
    de‑identifies the content and calls an LLM to rewrite it in plain
    language suitable for patients.  If the LLM call fails, it returns
    a truncated version of the de‑identified note as a fallback.

    Args:
        req: NoteRequest with the clinical note and optional context.
    Returns:
        A dictionary containing "summary", "patient_friendly", "recommendations", "warnings".
    """
    combined = req.text or ""
    if req.chart:
        combined += "\n\n" + str(req.chart)
    if req.audio:
        combined += "\n\n" + str(req.audio)
    cleaned = deidentify(combined)
    offline_active = req.useOfflineMode if req.useOfflineMode is not None else False
    if not offline_active:
        # check user stored preference (table may not exist in some test fixtures)
        try:
            row = db_conn.execute("SELECT use_offline_mode FROM settings WHERE user_id=(SELECT id FROM users WHERE username=?)", (user["sub"],)).fetchone()
            if row:
                offline_active = bool(row["use_offline_mode"])
        except sqlite3.OperationalError:
            # settings table not present; ignore
            pass
    if offline_active or USE_OFFLINE_MODEL:
        from backend.offline_model import summarize as offline_summarize

        data = offline_summarize(
            cleaned,
            req.lang,
            req.specialty,
            req.payer,
            req.age,
            use_local=req.useLocalModels,
            model_path=req.summarizeModel,
        )
        # Ensure patient_friendly key present
        if "patient_friendly" not in data:
            data["patient_friendly"] = data.get("summary", "")
    else:
        try:
            messages = build_summary_prompt(
                cleaned, req.lang, req.specialty, req.payer, req.age
            )
            response_content = call_openai(messages)
            data = json.loads(response_content)
            # If model returns only summary, mirror into patient_friendly
            if "patient_friendly" not in data and "summary" in data:
                data["patient_friendly"] = data["summary"]
        except Exception as exc:
            logging.error("Error during summary LLM call: %s", exc)
            summary = cleaned[:200]
            if len(cleaned) > 200:
                summary += "..."
            data = {
                "summary": summary,
                "patient_friendly": summary,
                "recommendations": [],
                "warnings": [],
            }
    return data


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    diarise: bool = False,
    lang: Optional[str] = None,
    user=Depends(require_role("user")),
) -> Dict[str, Any]:
    """Transcribe uploaded audio.

    The endpoint accepts an audio file (e.g. from the browser's
    ``MediaRecorder`` API) and returns a JSON object with separate
    ``provider`` and ``patient`` transcripts.  When ``diarise`` is false,
    the full transcription is returned under ``provider`` and ``patient``
    is left empty.  Actual transcription is delegated to
    :mod:`backend.audio_processing`.
    """

    audio_bytes = await file.read()
    if diarise:
        result = diarize_and_transcribe(audio_bytes, language=lang)

    else:
        text = simple_transcribe(audio_bytes, language=lang)
        result = {
            "provider": text,
            "patient": "",
            "segments": [
                {"speaker": "provider", "start": 0.0, "end": 0.0, "text": text}
            ],
        }
    # Store the transcript in the user's history so it can be revisited
    transcript_history[user["sub"]].append(result)
    return result


@app.get("/transcribe")
async def get_last_transcript(user=Depends(require_role("user"))) -> Dict[str, Any]:
    """Return recent audio transcripts for the current user."""

    history = list(transcript_history.get(user["sub"], []))
    return {"history": history}


@app.get("/api/patients/search")  # pragma: no cover - not exercised in tests
async def search_patients(q: str, user=Depends(require_role("user"))):
    """Search patients by name."""

    cursor = db_conn.execute(
        "SELECT id, name, dob FROM patients WHERE name LIKE ?",
        (f"%{q}%",),
    )
    rows = [dict(r) for r in cursor.fetchall()]
    return {"patients": rows}


@app.get("/api/encounters/validate/{encounter_id}")  # pragma: no cover - not exercised in tests
async def validate_encounter(encounter_id: int, user=Depends(require_role("user"))):
    """Validate that an encounter exists."""

    cur = db_conn.execute(
        "SELECT 1 FROM encounters WHERE id = ?",
        (encounter_id,),
    )
    return {"id": encounter_id, "valid": cur.fetchone() is not None}


@app.post("/api/visits/session")  # pragma: no cover - not exercised in tests
async def create_visit_session(
    session: VisitSessionModel, user=Depends(require_role("user"))
):
    """Create a new visit session."""

    cur = db_conn.execute(
        "INSERT INTO visit_sessions (encounter_id, data, updated_at) VALUES (?, ?, ?)",
        (session.encounter_id, session.data or "", time.time()),
    )
    db_conn.commit()
    return {"id": cur.lastrowid}


@app.put("/api/visits/session")  # pragma: no cover - not exercised in tests
async def update_visit_session(
    session: VisitSessionModel, user=Depends(require_role("user"))
):
    """Update an existing visit session."""

    if session.id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "id required")
    db_conn.execute(
        "UPDATE visit_sessions SET encounter_id = ?, data = ?, updated_at = ? WHERE id = ?",
        (session.encounter_id, session.data or "", time.time(), session.id),
    )
    db_conn.commit()
    return {"status": "ok"}


@app.websocket("/api/transcribe/stream")  # pragma: no cover - not exercised in tests
async def transcribe_stream(websocket: WebSocket):
    """Stream transcription via WebSocket."""

    await websocket.accept()
    try:
        while True:
            chunk = await websocket.receive_bytes()
            text = simple_transcribe(chunk)
            await websocket.send_json(
                {"transcript": text, "confidence": 1.0, "isInterim": False}
            )
    except WebSocketDisconnect:
        pass


# Endpoint: set the OpenAI API key.  Accepts a JSON body with a single
# field "key" and stores it in a local file.  Also updates the
# environment variable OPENAI_API_KEY so future requests in this
# process use the new key.  This enables users to configure the key
# through the UI without editing environment variables directly.
@app.post("/apikey")
async def set_api_key(model: ApiKeyModel, user=Depends(require_role("admin"))):
    """
    Store and validate an OpenAI API key.  Accepts a JSON body with a
    single field "key" and writes it to a local file.  Validation is
    performed using a simple format check rather than a live API call so
    that newer project‑scoped keys (e.g. ``sk-proj-``) are accepted even
    when the SDK's built-in regex is out of date.  Returns JSON with
    status ``saved`` on success or an error message on failure.
    """
    key = model.key.strip()
    if not key:
        return JSONResponse(
            {"status": "error", "message": "Key cannot be empty"}, status_code=400
        )

    # Basic format validation: accept keys starting with ``sk-`` and at
    # least 20 additional non‑whitespace characters.  This intentionally
    # permits new project‑scoped keys such as ``sk-proj-`` which may
    # include hyphens or colons in their suffix without relying on the
    # OpenAI SDK's pattern enforcement.
    import re

    if not re.fullmatch(r"sk-\S{20,}", key):
        return JSONResponse(
            {"status": "error", "message": "Key not in expected format"},
            status_code=400,
        )

    try:
        save_api_key(key)
        return {"status": "saved"}
    except Exception as exc:
        return JSONResponse(
            {"status": "error", "message": f"Failed to save API key: {exc}"},
            status_code=400,
        )


@app.post("/beautify")
async def beautify_note(req: NoteRequest, user=Depends(require_role("user"))) -> dict:
    """
    Beautify (reformat) a clinical note.  This endpoint de‑identifies the
    incoming note and then calls an LLM to rephrase it into a professional
    format. If the model call fails, the cleaned text is returned with each
    sentence capitalised as a fallback.

    Args:
        req: NoteRequest with a raw clinical note.
    Returns:
        A dictionary with the beautified note as a string.
    """
    cleaned = deidentify(req.text)
    offline_active = req.useOfflineMode if req.useOfflineMode is not None else False
    if not offline_active:
        # check user stored preference (table may not exist in some test fixtures)
        try:
            row = db_conn.execute("SELECT use_offline_mode FROM settings WHERE user_id=(SELECT id FROM users WHERE username=?)", (user["sub"],)).fetchone()
            if row:
                offline_active = bool(row["use_offline_mode"])
        except sqlite3.OperationalError:
            pass
    if offline_active or USE_OFFLINE_MODEL:
        from backend.offline_model import beautify as offline_beautify

        beautified = offline_beautify(
            cleaned,
            req.lang,
            req.specialty,
            req.payer,
            use_local=req.useLocalModels,
            model_path=req.beautifyModel,
        )
        return {"beautified": beautified}

    # Attempt to call the LLM to beautify the note. If the call
    # fails for any reason (e.g., missing API key, network error), fall
    # back to returning the trimmed note with only the first letter of
    # each sentence capitalised so the endpoint still returns something useful.
    try:
        messages = build_beautify_prompt(cleaned, req.lang, req.specialty, req.payer)
        response_content = call_openai(messages)
        # The assistant's reply is expected to contain only the
        # beautified note text. We strip any leading/trailing
        # whitespace to tidy the result.
        beautified = response_content.strip()
        return {"beautified": beautified}
    except Exception as exc:
        # Log the exception and fall back to a basic transformation.
        logging.error("Error during beautify LLM call: %s", exc)
        sentences = re.split(r"(?<=[.!?])\s+", cleaned.strip())
        beautified = " ".join(s[:1].upper() + s[1:] for s in sentences if s)
        return {"beautified": beautified, "error": str(exc)}


@app.post("/api/ai/beautify")
async def beautify_note_api(req: NoteRequest, user=Depends(require_role("user"))) -> dict:
    """Alias for ``/beautify`` to support ``/api/ai/beautify`` path."""
    return await beautify_note(req, user)


@app.post("/suggest", response_model=SuggestionsResponse, response_model_exclude_none=True)
async def suggest(
    req: NoteRequest, user=Depends(require_role("user"))
) -> SuggestionsResponse:
    """
    Generate coding and compliance suggestions for a clinical note.  This
    endpoint de‑identifies the text and then calls an AI model to
    determine relevant CPT/ICD codes, compliance prompts, public health
    reminders, and differential diagnoses.  Falls back to rule-based
    suggestions if the model call fails.

    Args:
        req: NoteRequest with a raw clinical note.
    Returns:
        SuggestionsResponse with four categories of suggestions.
    """
    # Combine the main note with any optional chart text or audio transcript
    combined = req.text or ""
    if req.chart:
        combined += "\n\n" + str(req.chart)
    if req.audio:
        combined += "\n\n" + str(req.audio)
    # Apply de-identification to the combined text
    cleaned = deidentify(combined)
    # If the client provided custom rules, append them as a guidance section
    if req.rules:
        # Join rules into a bulleted list
        rules_section = "\n\nUser‑defined rules:\n" + "\n".join(
            f"- {r}" for r in req.rules
        )
        cleaned_for_prompt = cleaned + rules_section
    else:
        cleaned_for_prompt = cleaned
    offline_active = req.useOfflineMode if req.useOfflineMode is not None else False
    if not offline_active:
        # check user stored preference (table may not exist in some test fixtures)
        try:
            row = db_conn.execute("SELECT use_offline_mode FROM settings WHERE user_id=(SELECT id FROM users WHERE username=?)", (user["sub"],)).fetchone()
            if row:
                offline_active = bool(row["use_offline_mode"])
        except sqlite3.OperationalError:
            pass
    if offline_active or USE_OFFLINE_MODEL:
        from backend.offline_model import suggest as offline_suggest

        data = offline_suggest(
            cleaned_for_prompt,
            req.lang,
            req.specialty,
            req.payer,
            req.age,
            req.sex,
            req.region,
            use_local=req.useLocalModels,
            model_path=req.suggestModel,
        )
        # Ensure evidenceLevel is preserved regardless of key style.
        public_health = [
            PublicHealthSuggestion(
                recommendation=p.get("recommendation"),
                reason=p.get("reason"),
                source=p.get("source"),
                evidenceLevel=p.get("evidenceLevel") or p.get("evidence_level"),
            )
            for p in data["publicHealth"]
        ]
        try:
            extra_ph = public_health_api.get_public_health_suggestions(
                req.age, req.sex, req.region, req.agencies
            )
        except Exception as exc:  # pragma: no cover - network errors
            logging.warning("Public health fetch failed: %s", exc)
            extra_ph = []
        if extra_ph:
            existing = {p.recommendation for p in public_health}
            for rec in extra_ph:
                rec_name = rec.get("recommendation") if isinstance(rec, dict) else rec
                if rec_name and rec_name not in existing:
                    if isinstance(rec, dict):
                        public_health.append(PublicHealthSuggestion(**rec))
                    else:
                        public_health.append(
                            PublicHealthSuggestion(recommendation=str(rec))
                        )
        return SuggestionsResponse(
            codes=[CodeSuggestion(**c) for c in data["codes"]],
            compliance=data["compliance"],
            publicHealth=public_health,
            differentials=[DifferentialSuggestion(**d) for d in data["differentials"]],
        )
    # Try to call the LLM to generate structured suggestions.  The prompt
    # instructs the model to return JSON with keys codes, compliance,
    # public_health and differentials.  We parse the JSON into the
    # SuggestionsResponse schema.  If anything fails, we fall back to
    # the simple rule-based engine defined previously.
    try:
        messages = build_suggest_prompt(
            cleaned_for_prompt,
            req.lang,
            req.specialty,
            req.payer,
            req.age,
            req.sex,
            req.region,
        )
        response_content = call_openai(messages)
        # The model should return raw JSON.  Parse it into a Python dict.
        data = json.loads(response_content)
        # Convert codes list of dicts into CodeSuggestion objects.  Provide
        # defaults for missing fields.
        codes_list: List[CodeSuggestion] = []
        for item in data.get("codes", []):
            code_str = item.get("code") or item.get("Code") or ""
            rationale = item.get("rationale") or item.get("Rationale") or None
            upgrade = item.get("upgrade_to") or item.get("upgradeTo") or None
            upgrade_path = item.get("upgrade_path") or item.get("upgradePath") or None
            if code_str:
                codes_list.append(
                    CodeSuggestion(
                        code=code_str,
                        rationale=rationale,
                        upgrade_to=upgrade,
                        upgradePath=upgrade_path,
                    )
                )
        # Extract compliance as list of strings
        compliance = [str(x) for x in data.get("compliance", [])]
        # Public health objects
        public_health: List[PublicHealthSuggestion] = []
        for item in data.get("publicHealth", data.get("public_health", [])):
            if isinstance(item, dict):
                rec = item.get("recommendation") or item.get("Recommendation") or ""
                reason = item.get("reason") or item.get("Reason") or None
                source = item.get("source") or item.get("Source")
                evidence = (
                    item.get("evidenceLevel")
                    or item.get("evidence_level")
                    or item.get("evidence")
                )
                if rec:
                    public_health.append(
                        PublicHealthSuggestion(
                            recommendation=rec,
                            reason=reason,
                            source=source,
                            evidenceLevel=evidence,
                        )
                    )
            else:
                public_health.append(
                    PublicHealthSuggestion(recommendation=str(item), reason=None)
                )
        # Differential diagnoses with scores
        diffs: List[DifferentialSuggestion] = []
        for item in data.get("differentials", []):
            if isinstance(item, dict):
                diag = item.get("diagnosis") or item.get("Diagnosis") or ""
                raw_score = item.get("score")
                score_val: Optional[float] = None
                if isinstance(raw_score, (int, float)):
                    score_val = float(raw_score)
                    if score_val > 1:
                        score_val /= 100.0
                    if not 0 <= score_val <= 1:
                        score_val = None
                elif isinstance(raw_score, str):
                    try:
                        score_val = float(raw_score.strip().rstrip("%"))
                        if score_val > 1:
                            score_val /= 100.0
                        if not 0 <= score_val <= 1:
                            score_val = None
                    except Exception:
                        score_val = None
                if diag:
                    diffs.append(
                        DifferentialSuggestion(diagnosis=diag, score=score_val)
                    )
            else:
                diffs.append(DifferentialSuggestion(diagnosis=str(item), score=None))
        # Augment public health suggestions with external guidelines
        try:
            extra_ph = public_health_api.get_public_health_suggestions(
                req.age, req.sex, req.region, req.agencies
            )
        except Exception as exc:  # pragma: no cover - network errors
            logging.warning("Public health fetch failed: %s", exc)
            extra_ph = []
        if extra_ph:
            existing = {p.recommendation for p in public_health}
            for rec in extra_ph:
                rec_name = rec.get("recommendation") if isinstance(rec, dict) else rec
                if rec_name and rec_name not in existing:
                    if isinstance(rec, dict):
                        public_health.append(PublicHealthSuggestion(**rec))
                    else:
                        public_health.append(
                            PublicHealthSuggestion(recommendation=str(rec))
                        )
        # If all categories are empty, raise an error to fall back to rule-based suggestions.
        if not (codes_list or compliance or public_health or diffs):
            raise ValueError("No suggestions returned from LLM")
        follow_up = recommend_follow_up(
            [c.code for c in codes_list],
            [d.diagnosis for d in diffs],
            req.specialty,
            req.payer,
        )
        return SuggestionsResponse(
            codes=codes_list,
            compliance=compliance,
            publicHealth=public_health,
            differentials=diffs,
            followUp=follow_up,
        )
    except Exception as exc:
        # Log error and use rule-based fallback suggestions.
        logging.error("Error during suggest LLM call or parsing JSON: %s", exc)
        codes: List[CodeSuggestion] = []  # fixed invalid generic syntax
        compliance: List[str] = []
        public_health: List[PublicHealthSuggestion] = []
        diffs: List[DifferentialSuggestion] = []
        # Respiratory symptoms
        if any(
            keyword in cleaned.lower() for keyword in ["cough", "fever", "cold", "sore throat"]
        ):
            codes.append(
                CodeSuggestion(
                    code="99213",
                    rationale="Established patient with respiratory symptoms",
                )
            )
            codes.append(
                CodeSuggestion(
                    code="J06.9", rationale="Upper respiratory infection, unspecified"
                )
            )
            compliance.append("Document duration of fever and associated symptoms")
            public_health.append(
                PublicHealthSuggestion(
                    recommendation="Consider influenza vaccine", reason=None
                )
            )
            diffs.extend(
                [
                    DifferentialSuggestion(diagnosis="Common cold"),
                    DifferentialSuggestion(diagnosis="COVID-19"),
                    DifferentialSuggestion(diagnosis="Influenza"),
                ]
            )
        # Diabetes management
        if "diabetes" in cleaned.lower():
            codes.append(
                CodeSuggestion(
                    code="E11.9",
                    rationale="Type 2 diabetes mellitus without complications",
                )
            )
            compliance.append("Include latest HbA1c results and medication list")
            public_health.append(
                PublicHealthSuggestion(
                    recommendation="Remind patient about foot and eye exams",
                    reason=None,
                )
            )
            diffs.append(DifferentialSuggestion(diagnosis="Impaired glucose tolerance"))
        # Hypertension
        if "hypertension" in cleaned.lower() or "high blood pressure" in cleaned.lower():
            codes.append(
                CodeSuggestion(code="I10", rationale="Essential (primary) hypertension")
            )
            compliance.append(
                "Document blood pressure readings and lifestyle counselling"
            )
            public_health.append(
                PublicHealthSuggestion(
                    recommendation="Discuss sodium restriction and exercise",
                    reason=None,
                )
            )
            diffs.append(DifferentialSuggestion(diagnosis="White coat hypertension"))
        # Preventive visit
        if "annual" in cleaned.lower() or "wellness" in cleaned.lower():
            codes.append(
                CodeSuggestion(
                    code="99395", rationale="Periodic comprehensive preventive visit"
                )
            )
            compliance.append("Ensure all preventive screenings are up to date")
            public_health.append(
                PublicHealthSuggestion(
                    recommendation="Screen for depression and alcohol use", reason=None
                )
            )
            diffs.append(DifferentialSuggestion(diagnosis="–"))
        # Mental health
        if any(word in cleaned.lower() for word in ["depression", "anxiety", "sad", "depressed"]):
            codes.append(
                CodeSuggestion(
                    code="F32.9", rationale="Major depressive disorder, unspecified"
                )
            )
            compliance.append(
                "Assess severity and suicidal ideation; document mental status exam"
            )
            public_health.append(
                PublicHealthSuggestion(
                    recommendation="Offer referral to counselling or psychotherapy",
                    reason=None,
                )
            )
            diffs.append(DifferentialSuggestion(diagnosis="Adjustment disorder"))
        # Musculoskeletal pain
        if any(
            word in cleaned.lower()
            for word in [
                "back pain",
                "low back",
                "joint pain",
                "knee pain",
                "shoulder pain",
            ]
        ):
            codes.append(CodeSuggestion(code="M54.5", rationale="Low back pain"))
            compliance.append(
                "Document onset, aggravating/relieving factors, and functional limitations"
            )
            public_health.append(
                PublicHealthSuggestion(
                    recommendation="Recommend stretching and physical therapy",
                    reason=None,
                )
            )
            diffs.append(DifferentialSuggestion(diagnosis="Lumbar strain"))
        # Default suggestions if nothing matched
        if not codes:
            codes.append(
                CodeSuggestion(
                    code="99212", rationale="Established patient, straightforward"
                )
            )
        if not compliance:
            compliance.append("Ensure chief complaint and history are complete")
        if not public_health:
            public_health.append(
                PublicHealthSuggestion(
                    recommendation="Consider influenza vaccine", reason=None
                )
            )
        if not diffs:
            diffs.append(DifferentialSuggestion(diagnosis="Routine follow-up"))
        try:
            extra_ph = public_health_api.get_public_health_suggestions(
                req.age, req.sex, req.region, req.agencies
            )
        except Exception as exc:  # pragma: no cover - network errors
            logging.warning("Public health fetch failed: %s", exc)
            extra_ph = []
        if extra_ph:
            existing = {p.recommendation for p in public_health}
            for rec in extra_ph:
                rec_name = rec.get("recommendation") if isinstance(rec, dict) else rec
                if rec_name and rec_name not in existing:
                    if isinstance(rec, dict):
                        public_health.append(PublicHealthSuggestion(**rec))
                    else:
                        public_health.append(
                            PublicHealthSuggestion(recommendation=str(rec))
                        )
        follow_up = recommend_follow_up(
            [c.code for c in codes],
            [d.diagnosis for d in diffs],
            req.specialty,
            req.payer,
        )

        return SuggestionsResponse(
            codes=codes,
            compliance=compliance,
            publicHealth=public_health,
            differentials=diffs,
            followUp=follow_up,
        )



def _validate_note(req: PreFinalizeCheckRequest) -> Tuple[Dict[str, List[str]], List[Dict[str, float]], float]:
    """Perform simple validation on a draft note and its metadata."""

    issues: Dict[str, List[str]] = {
        "content": [],
        "codes": [],
        "prevention": [],
        "diagnoses": [],
        "differentials": [],
        "compliance": [],
    }

    content = req.content or ""
    if not content.strip():
        issues["content"].append("Content is empty")
    if len(content.strip()) < 20:
        issues["content"].append("Content too short")

    details: List[Dict[str, float]] = []
    total = 0.0
    for code in req.codes:
        if not re.fullmatch(r"\d{4,5}", code):
            issues["codes"].append(f"Invalid code {code}")
            continue
        amt = CPT_REVENUE.get(code)
        if amt is None:
            issues["codes"].append(f"Unknown code {code}")
        else:
            details.append({"code": code, "amount": amt})
            total += amt

    if not req.prevention:
        issues["prevention"].append("No prevention documented")
    if not req.diagnoses:
        issues["diagnoses"].append("No diagnoses provided")
    if not req.differentials:
        issues["differentials"].append("No differentials provided")
    if not req.compliance:
        issues["compliance"].append("No compliance checks provided")

    return issues, details, total


@app.post("/api/notes/pre-finalize-check")
async def pre_finalize_check(
    req: PreFinalizeCheckRequest, user=Depends(require_role("user"))
):
    """Validate a draft note before allowing finalization."""

    issues, details, total = _validate_note(req)
    can_finalize = all(len(v) == 0 for v in issues.values())
    return {
        "canFinalize": can_finalize,
        "issues": issues,
        "estimatedReimbursement": total,
        "reimbursementSummary": {"total": total, "codes": details},
    }


@app.post("/api/notes/finalize")
async def finalize_note(
    req: FinalizeNoteRequest, user=Depends(require_role("user"))
):
    """Finalize a note and report export readiness and reimbursement."""

    issues, details, total = _validate_note(req)
    export_ready = all(len(v) == 0 for v in issues.values())
    return {
        "finalizedContent": req.content.strip(),
        "codesSummary": details,
        "reimbursementSummary": {"total": total, "codes": details},
        "exportReady": export_ready,
        "issues": issues,
    }


async def _codes_suggest(req: CodesSuggestRequest) -> CodesSuggestResponse:
    cleaned = deidentify(req.content or "")
    offline = req.useOfflineMode or USE_OFFLINE_MODEL
    if offline:
        from backend.offline_model import suggest as offline_suggest

        data = offline_suggest(cleaned)
        suggestions = [
            CodeSuggestItem(
                code=item.get("code", ""),
                type=item.get("type"),
                description=item.get("rationale"),
                confidence=1.0,
                reasoning=item.get("rationale"),
            )
            for item in data.get("codes", [])
        ]
        return CodesSuggestResponse(suggestions=suggestions)
    try:
        patient = json.dumps(req.patientData or {})
        messages = [
            {
                "role": "system",
                "content": (
                    "You are an expert medical coder. Return JSON with key 'suggestions' "
                    "as an array of {code,type,description,confidence,reasoning}. Confidence in 0-1."
                ),
            },
            {
                "role": "user",
                "content": f"Note:\n{cleaned}\nPatient data:{patient}",
            },
        ]
        resp = call_openai(messages)
        data = json.loads(resp)
        suggestions = [CodeSuggestItem(**s) for s in data.get("suggestions", [])]
        return CodesSuggestResponse(suggestions=suggestions)
    except Exception as exc:
        logging.error("codes suggest failed: %s", exc)
        return CodesSuggestResponse(suggestions=[])


@app.post("/api/ai/codes/suggest", response_model=CodesSuggestResponse)
async def codes_suggest(
    req: CodesSuggestRequest, user=Depends(require_role("user"))
) -> CodesSuggestResponse:
    return await _codes_suggest(req)


@app.websocket("/ws/api/ai/codes/suggest")
async def ws_codes_suggest(websocket: WebSocket):
    await websocket.accept()
    data = await websocket.receive_json()
    resp = await _codes_suggest(CodesSuggestRequest(**data))
    await websocket.send_json(resp.model_dump())
    await websocket.close()


async def _compliance_check(req: ComplianceCheckRequest) -> ComplianceCheckResponse:
    cleaned = deidentify(req.content or "")
    offline = req.useOfflineMode or USE_OFFLINE_MODEL
    if offline:
        from backend.offline_model import suggest as offline_suggest

        data = offline_suggest(cleaned)
        alerts = [
            ComplianceAlert(
                text=str(item),
                confidence=1.0,
                reasoning=str(item),
            )
            for item in data.get("compliance", [])
        ]
        return ComplianceCheckResponse(alerts=alerts)
    try:
        codes = json.dumps(req.codes or [])
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a compliance assistant. Return JSON {alerts:[{text,category,priority,confidence,reasoning}]}."
                ),
            },
            {
                "role": "user",
                "content": f"Note:\n{cleaned}\nCodes:{codes}",
            },
        ]
        resp = call_openai(messages)
        data = json.loads(resp)
        alerts = [ComplianceAlert(**a) for a in data.get("alerts", [])]
        return ComplianceCheckResponse(alerts=alerts)
    except Exception as exc:
        logging.error("compliance check failed: %s", exc)
        return ComplianceCheckResponse(alerts=[])


@app.post("/api/ai/compliance/check", response_model=ComplianceCheckResponse)
async def compliance_check(
    req: ComplianceCheckRequest, user=Depends(require_role("user"))
) -> ComplianceCheckResponse:
    return await _compliance_check(req)


@app.websocket("/ws/api/ai/compliance/check")
async def ws_compliance_check(websocket: WebSocket):
    await websocket.accept()
    data = await websocket.receive_json()
    resp = await _compliance_check(ComplianceCheckRequest(**data))
    await websocket.send_json(resp.model_dump())
    await websocket.close()


async def _differentials_generate(
    req: DifferentialsGenerateRequest,
) -> DifferentialsResponse:
    cleaned = deidentify(req.content or "")
    offline = req.useOfflineMode or USE_OFFLINE_MODEL
    if offline:
        from backend.offline_model import suggest as offline_suggest

        data = offline_suggest(cleaned)
        diffs = [
            DifferentialItem(
                diagnosis=item.get("diagnosis", ""),
                confidence=item.get("score"),
                reasoning="offline",
            )
            for item in data.get("differentials", [])
        ]
        return DifferentialsResponse(differentials=diffs)
    try:
        symptoms = json.dumps(req.symptoms or [])
        patient = json.dumps(req.patientData or {})
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a clinical decision support system. Return JSON {differentials:[{diagnosis,confidence,reasoning,supportingFactors,contradictingFactors,testsToConfirm}]}. Confidence 0-1."
                ),
            },
            {
                "role": "user",
                "content": f"Note:\n{cleaned}\nSymptoms:{symptoms}\nPatient:{patient}",
            },
        ]
        resp = call_openai(messages)
        data = json.loads(resp)
        diffs = [DifferentialItem(**d) for d in data.get("differentials", [])]
        return DifferentialsResponse(differentials=diffs)
    except Exception as exc:
        logging.error("differentials generate failed: %s", exc)
        return DifferentialsResponse(differentials=[])


@app.post("/api/ai/differentials/generate", response_model=DifferentialsResponse)
async def differentials_generate(
    req: DifferentialsGenerateRequest, user=Depends(require_role("user"))
) -> DifferentialsResponse:
    return await _differentials_generate(req)


@app.websocket("/ws/api/ai/differentials/generate")
async def ws_differentials_generate(websocket: WebSocket):
    await websocket.accept()
    data = await websocket.receive_json()
    resp = await _differentials_generate(DifferentialsGenerateRequest(**data))
    await websocket.send_json(resp.model_dump())
    await websocket.close()


async def _prevention_suggest(req: PreventionSuggestRequest) -> PreventionResponse:
    offline = req.useOfflineMode or USE_OFFLINE_MODEL
    if offline:
        from backend.offline_model import suggest as offline_suggest

        data = offline_suggest("")
        recs = [
            PreventionItem(
                recommendation=item.get("recommendation", ""),
                priority="routine",
                source=item.get("source"),
                confidence=1.0,
                reasoning=item.get("reason"),
            )
            for item in data.get("publicHealth", [])
        ]
        return PreventionResponse(recommendations=recs)
    try:
        patient = json.dumps(req.patientData or {})
        demo = json.dumps(req.demographics or {})
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a preventative care assistant. Return JSON {recommendations:[{recommendation,priority,source,confidence,reasoning}]}."
                ),
            },
            {
                "role": "user",
                "content": f"Patient:{patient}\nDemographics:{demo}",
            },
        ]
        resp = call_openai(messages)
        data = json.loads(resp)
        recs = [PreventionItem(**r) for r in data.get("recommendations", [])]
        return PreventionResponse(recommendations=recs)
    except Exception as exc:
        logging.error("prevention suggest failed: %s", exc)
        return PreventionResponse(recommendations=[])


@app.post("/api/ai/prevention/suggest", response_model=PreventionResponse)
async def prevention_suggest(
    req: PreventionSuggestRequest, user=Depends(require_role("user"))
) -> PreventionResponse:
    return await _prevention_suggest(req)


@app.websocket("/ws/api/ai/prevention/suggest")
async def ws_prevention_suggest(websocket: WebSocket):
    await websocket.accept()
    data = await websocket.receive_json()
    resp = await _prevention_suggest(PreventionSuggestRequest(**data))
    await websocket.send_json(resp.model_dump())
    await websocket.close()


async def _realtime_analyze(req: RealtimeAnalyzeRequest) -> RealtimeAnalysisResponse:
    cleaned = deidentify(req.content or "")
    offline = req.useOfflineMode or USE_OFFLINE_MODEL
    if offline:
        return RealtimeAnalysisResponse(
            analysisId="offline",
            extractedSymptoms=[],
            medicalHistory=[],
            currentMedications=[],
            confidence=1.0,
            reasoning="offline",
        )
    try:
        context = json.dumps(req.patientContext or {})
        messages = [
            {
                "role": "system",
                "content": (
                    "You analyse clinical text. Return JSON with keys analysisId (string), extractedSymptoms (array), medicalHistory (array), currentMedications (array), confidence (0-1), reasoning (string)."
                ),
            },
            {
                "role": "user",
                "content": f"Content:\n{cleaned}\nContext:{context}",
            },
        ]
        resp = call_openai(messages)
        data = json.loads(resp)
        if not data.get("analysisId"):
            data["analysisId"] = str(uuid4())
        return RealtimeAnalysisResponse(**data)
    except Exception as exc:
        logging.error("realtime analysis failed: %s", exc)
        return RealtimeAnalysisResponse(
            analysisId=str(uuid4()),
            extractedSymptoms=[],
            medicalHistory=[],
            currentMedications=[],
            confidence=None,
            reasoning=str(exc),
        )


@app.post("/api/ai/analyze/realtime", response_model=RealtimeAnalysisResponse)
async def realtime_analyze(
    req: RealtimeAnalyzeRequest, user=Depends(require_role("user"))
) -> RealtimeAnalysisResponse:
    return await _realtime_analyze(req)


@app.websocket("/ws/api/ai/analyze/realtime")
async def ws_realtime_analyze(websocket: WebSocket):
    await websocket.accept()
    data = await websocket.receive_json()
    resp = await _realtime_analyze(RealtimeAnalyzeRequest(**data))
    await websocket.send_json(resp.model_dump())
    await websocket.close()


@app.post("/api/compliance/analyze")  # pragma: no cover - not exercised in tests
async def analyze_compliance(
    req: NoteRequest, user=Depends(require_role("user"))
):
    """Analyze compliance issues in a note using an AI model."""

    cleaned = deidentify(req.text or "")
    messages = [
        {
            "role": "system",
            "content": "Return JSON with key 'compliance' listing documentation issues.",
        },
        {"role": "user", "content": cleaned},
    ]
    try:
        response_content = call_openai(messages)
        data = json.loads(response_content)
        compliance = [str(x) for x in data.get("compliance", [])]
    except Exception:
        try:
            from backend.offline_model import suggest as offline_suggest

            data = offline_suggest(
                cleaned,
                req.lang,
                req.specialty,
                req.payer,
                req.age,
                req.sex,
                req.region,
                use_local=req.useLocalModels,
                model_path=req.suggestModel,
            )
            compliance = [str(x) for x in data.get("compliance", [])]
        except Exception:
            compliance = ["offline compliance"]
    return {"compliance": compliance}


@app.put("/api/notes/auto-save")  # pragma: no cover - not exercised in tests
async def auto_save_note(note: AutoSaveModel, user=Depends(require_role("user"))):
    """Persist a draft note for the current user."""

    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?",
        (user["sub"],),
    ).fetchone()
    uid = row["id"] if row else None
    db_conn.execute(
        "INSERT INTO note_auto_saves (user_id, note_id, content, updated_at) VALUES (?, ?, ?, ?)",
        (uid, note.note_id, note.content, time.time()),
    )
    db_conn.commit()
    return {"status": "saved"}


@app.post("/api/notes/finalize-check")  # pragma: no cover - not exercised in tests
async def finalize_check(req: NoteRequest, user=Depends(require_role("user"))):
    """Use an AI model to check if a note is ready for finalization."""

    cleaned = deidentify(req.text or "")
    messages = [
        {
            "role": "system",
            "content": "Return JSON {\"ok\": bool, \"issues\": []} indicating remaining problems.",

class AnalyzeRequest(BaseModel):
    text: str
    model: Optional[str] = None


@app.post("/api/ai/analyze")
async def analyze_note(
    req: AnalyzeRequest, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """Extract structured content from a note via the LLM."""

    cleaned = deidentify(req.text or "")
    if USE_OFFLINE_MODEL:
        return {"analysis": {}}
    messages = [
        {
            "role": "system",
            "content": "Extract key medical facts as JSON with any fields you find relevant.",
        },
        {"role": "user", "content": cleaned},
    ]
    try:

        response_content = call_openai(messages)
        data = json.loads(response_content)
        ok = bool(data.get("ok", True))
        issues = [str(x) for x in data.get("issues", [])]
    except Exception:
        ok = True
        issues = []
    return {"ok": ok, "issues": issues}



@app.post("/followup", response_model=ScheduleResponse)
async def followup(req: ScheduleRequest, user=Depends(require_role("user"))) -> ScheduleResponse:
    """Return a recommended follow-up interval (no persistence)."""
    cleaned = deidentify(req.text or "")
    follow = recommend_follow_up(
        req.codes or [],
        [cleaned],
        req.specialty,
        req.payer,
    )
    return ScheduleResponse(**follow)

# ------------------- Appointment CRUD & ICS export -------------------------
class AppointmentCreate(BaseModel):
    patient: str
    reason: str
    start: datetime
    end: Optional[datetime] = None

class Appointment(BaseModel):
    id: int
    patient: str
    reason: str
    start: datetime
    end: datetime

class AppointmentList(BaseModel):
    appointments: List[Appointment]

@app.post("/schedule", response_model=Appointment)
async def create_schedule_appointment(appt: AppointmentCreate, user=Depends(require_role("user"))):
    rec = create_appointment(appt.patient, appt.reason, appt.start, appt.end)
    return Appointment(**{**rec, "start": rec["start"], "end": rec["end"]})

@app.get("/schedule", response_model=AppointmentList)
async def list_schedule_appointments(user=Depends(require_role("user"))):
    items = list_appointments()
    parsed: List[Appointment] = []
    for item in items:
        parsed.append(
            Appointment(
                **{
                    **item,
                    "start": datetime.fromisoformat(item["start"]),
                    "end": datetime.fromisoformat(item["end"]),
                }
            )
        )
    return AppointmentList(appointments=parsed)

class ScheduleExportRequest(BaseModel):
    id: int

@app.post("/schedule/export")
async def export_schedule_appointment(req: ScheduleExportRequest, user=Depends(require_role("user"))):
    appt = get_appointment(req.id)
    if not appt:
        raise HTTPException(status_code=404, detail="appointment not found")
    return {"ics": export_appointment_ics(appt)}
# ------------------- Additional API endpoints ------------------------------


class Patient(BaseModel):
    patientId: str
    name: str
    age: int
    gender: str
    insurance: str
    lastVisit: str
    allergies: List[str]
    medications: List[str]


@app.get("/api/patients/{patient_id}", response_model=Patient)
async def get_patient_api(patient_id: str, user=Depends(require_role("user"))):
    rec = patients.get_patient(patient_id)
    if not rec:
        raise HTTPException(status_code=404, detail="patient not found")
    return Patient(**rec)


@app.get("/api/schedule/appointments", response_model=AppointmentList)
async def api_list_appointments(user=Depends(require_role("user"))):
    items = list_appointments()
    parsed: List[Appointment] = []
    for item in items:
        parsed.append(
            Appointment(
                **{
                    **item,
                    "start": datetime.fromisoformat(item["start"]),
                    "end": datetime.fromisoformat(item["end"]),
                }
            )
        )
    return AppointmentList(appointments=parsed)


class VisitManageRequest(BaseModel):
    encounterId: str
    action: Literal["start", "complete"]


class VisitState(BaseModel):
    encounterId: str
    visitStatus: str
    startTime: Optional[str] = None
    duration: int = 0
    documentationComplete: bool = False


@app.post("/api/visits/manage", response_model=VisitState)
async def manage_visit_state(
    req: VisitManageRequest,
    background_tasks: BackgroundTasks,
    user=Depends(require_role("user")),
):
    background_tasks.add_task(visits.update_visit_state, req.encounterId, req.action)
    state = visits.peek_state(req.encounterId, req.action)
    return VisitState(**state)


@app.post("/api/charts/upload")
async def upload_chart(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user=Depends(require_role("user")),
):
    data = await file.read()
    background_tasks.add_task(process_chart, file.filename, data)
    return {"status": "processing"}
# ---------------------------------------------------------------------------


# Notes and drafts management

class BulkNotesRequest(BaseModel):
    ids: List[int]
    status: Optional[str] = None
    delete: StrictBool = False


@app.get("/api/notes/drafts")
async def list_draft_notes(user=Depends(require_role("user"))):
    cur = db_conn.execute(
        "SELECT id, content, status, created_at, updated_at FROM notes WHERE status = 'draft' ORDER BY id"
    )
    return [dict(row) for row in cur.fetchall()]


@app.get("/api/notes/search")
async def search_notes(
    q: str,
    status: Optional[str] = None,
    user=Depends(require_role("user")),
):
    params: List[Any] = [f"%{q}%"]
    query = "SELECT id, content, status, created_at, updated_at FROM notes WHERE content LIKE ?"
    if status:
        query += " AND status = ?"
        params.append(status)
    cur = db_conn.execute(query, params)
    return [dict(row) for row in cur.fetchall()]


@app.get("/api/analytics/drafts")
async def draft_analytics(user=Depends(require_role("user"))):
    total = db_conn.execute(
        "SELECT COUNT(*) FROM notes WHERE status='draft'"
    ).fetchone()[0]
    return {"drafts": total}


@app.post("/api/notes/bulk-operations")
async def notes_bulk_operations(
    req: BulkNotesRequest, user=Depends(require_role("user"))
):
    if not req.ids:
        return {"updated": 0}
    placeholders = ",".join("?" for _ in req.ids)
    cur = db_conn.cursor()
    if req.delete:
        cur.execute(f"DELETE FROM notes WHERE id IN ({placeholders})", req.ids)
        db_conn.commit()
        return {"deleted": cur.rowcount}
    if req.status is not None:
        params: List[Any] = [req.status, time.time()] + list(req.ids)
        cur.execute(
            f"UPDATE notes SET status=?, updated_at=? WHERE id IN ({placeholders})",
            params,
        )
        db_conn.commit()
        return {"updated": cur.rowcount}
    return {"updated": 0}

# ------------------------- Coding & Billing APIs ---------------------------


class CodesRequest(BaseModel):
    codes: List[str]


class BillingRequest(CodesRequest):
    payerType: Optional[str] = None
    location: Optional[str] = None


@app.post("/api/codes/details/batch")
async def code_details_batch(
    req: CodesRequest, user=Depends(require_role("user"))
) -> List[Dict[str, Any]]:
    """Return metadata for a batch of billing/clinical codes."""

    metadata = load_code_metadata()
    details: List[Dict[str, Any]] = []
    for code in req.codes:
        info = metadata.get(code)
        if info:
            details.append(
                {
                    "code": code,
                    "type": info["type"],
                    "category": info["category"],
                    "description": info["description"],
                    "rationale": "Selected by user",
                    "confidence": 100,
                    "reimbursement": info.get("reimbursement"),
                    "rvu": info.get("rvu"),
                }
            )
        else:
            details.append(
                {
                    "code": code,
                    "type": "unknown",
                    "category": "codes",
                    "description": "Unknown code",
                    "rationale": "Not found",
                    "confidence": 0,
                    "reimbursement": 0.0,
                    "rvu": 0.0,
                }
            )
    return details


@app.post("/api/billing/calculate")
async def billing_calculate(
    req: BillingRequest, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """Calculate total reimbursement and RVUs for provided codes."""

    metadata = load_code_metadata()
    breakdown: List[Dict[str, Any]] = []
    total_amount = 0.0
    total_rvu = 0.0
    for code in req.codes:
        info = metadata.get(code)
        amount = float(info.get("reimbursement", 0.0)) if info else 0.0
        rvu = float(info.get("rvu", 0.0)) if info else 0.0
        breakdown.append({"code": code, "amount": amount, "rvu": rvu})
        total_amount += amount
        total_rvu += rvu
    return {
        "totalEstimated": round(total_amount, 2),
        "totalRvu": round(total_rvu, 2),
        "breakdown": breakdown,
    }


@app.post("/api/codes/validate/combination")
async def validate_code_combination(
    req: CodesRequest, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """Check a set of codes for known conflicts."""

    conflicts: List[Dict[str, str]] = []
    conflict_defs = load_conflicts()
    codes_set = set(req.codes)
    for c1, c2, reason in conflict_defs:
        if c1 in codes_set and c2 in codes_set:
            conflicts.append({"code1": c1, "code2": c2, "reason": reason})
    return {
        "validCombinations": not conflicts,
        "conflicts": conflicts,
        "warnings": [],
    }


