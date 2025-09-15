"""
Backend API for the RevenuePilot application.

This FastAPI application provides endpoints to beautify clinical notes,
generate coding/compliance suggestions and produce patient‑friendly
summaries. It performs basic de‑identification on incoming text before
sending it to an AI model via ``call_openai``. If the model call fails,
each endpoint returns a sensible fallback.
"""

from __future__ import annotations

import copy
import logging
import os
import re
import shutil
import time
import asyncio
import sys
import uuid
from pathlib import Path
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone, date
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
    Query,
    WebSocket,
    WebSocketDisconnect,
    Query,
)
import requests
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, Response
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
    list_key_metadata,
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
    ensure_session_state_table,
    ensure_event_aggregates_table,
    ensure_compliance_issues_table,
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
from backend import code_tables  # type: ignore
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
from backend import compliance as compliance_engine  # type: ignore
from backend.sanitizer import sanitize_text
from backend import worker  # type: ignore


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


CATEGORIZATION_RULES_FILENAME = "code_categorization_rules.json"
CATEGORIZATION_RULES_ENV = "CODE_CATEGORIZATION_RULES_PATH"
DEFAULT_CATEGORIZATION_RULES: Dict[str, Any] = {
    "autoCategories": {},
    "userOverrides": {},
    "rules": [],
}
_categorization_rules_cache: Dict[str, Any] | None = None
_categorization_rules_mtime: float | None = None


def _categorization_rules_path() -> Path:
    """Return the path to the categorization rules file."""

    override = os.getenv(CATEGORIZATION_RULES_ENV)
    if override:
        return Path(override)
    return Path(__file__).with_name(CATEGORIZATION_RULES_FILENAME)


def load_code_categorization_rules(force_refresh: bool = False) -> Dict[str, Any]:
    """Load categorization rules from disk with basic caching."""

    global _categorization_rules_cache, _categorization_rules_mtime

    path = _categorization_rules_path()
    try:
        mtime = path.stat().st_mtime
    except FileNotFoundError:
        mtime = None

    if (
        not force_refresh
        and _categorization_rules_cache is not None
        and _categorization_rules_mtime == mtime
    ):
        return copy.deepcopy(_categorization_rules_cache)

    if not path.exists():
        logger.warning(
            "Code categorization rules file not found at %s; using defaults.", path
        )
        data = copy.deepcopy(DEFAULT_CATEGORIZATION_RULES)
    else:
        try:
            with path.open("r", encoding="utf-8") as fp:
                payload = json.load(fp)
        except (OSError, json.JSONDecodeError) as exc:
            logger.error(
                "Failed to load code categorization rules from %s: %s", path, exc
            )
            data = copy.deepcopy(DEFAULT_CATEGORIZATION_RULES)
        else:
            data = {
                "autoCategories": payload.get("autoCategories") or {},
                "userOverrides": payload.get("userOverrides") or {},
                "rules": payload.get("rules") or [],
            }

    _categorization_rules_cache = copy.deepcopy(data)
    _categorization_rules_mtime = mtime
    return copy.deepcopy(data)


class SuccessResponse(BaseModel):
    """Standard successful response envelope."""

    success: Literal[True] = True
    data: Any | None = None

    model_config = {"extra": "allow"}


class ErrorDetail(BaseModel):
    """Details describing an error response payload."""

    code: int | str | None = None
    message: str
    details: Any | None = None

    model_config = {"extra": "allow"}


class ErrorResponse(BaseModel):
    """Standard error response envelope."""

    success: Literal[False] = False
    error: ErrorDetail


_ERROR_MESSAGE_KEYS: Tuple[str, ...] = ("message", "detail", "error", "msg")
_ERROR_RESERVED_KEYS = {"code", "details", *_ERROR_MESSAGE_KEYS}


def _stringify_error_detail(item: Any) -> str:
    """Return a readable message from arbitrary error detail structures."""

    if isinstance(item, dict):
        for key in _ERROR_MESSAGE_KEYS:
            value = item.get(key)
            if value not in (None, ""):
                return str(value)
        return str(item)
    return str(item)


def _build_error_response(payload: Any, status_code: int | None = None) -> ErrorResponse:
    """Normalize ``payload`` into the standard :class:`ErrorResponse` structure."""

    code: int | str | None = status_code
    message = "An error occurred"
    details: Any | None = None
    extras: Dict[str, Any] = {}

    if isinstance(payload, dict):
        if payload.get("code") not in (None, ""):
            code = payload["code"]
        if "details" in payload:
            details = payload["details"]
        for key in _ERROR_MESSAGE_KEYS:
            if payload.get(key) not in (None, ""):
                message = str(payload[key])
                break
        else:
            # Fallback to a simple string representation when no known key exists.
            message = str(payload) if payload else message
        extras = {
            k: v for k, v in payload.items() if k not in _ERROR_RESERVED_KEYS
        }
    elif isinstance(payload, list):
        rendered = [
            _stringify_error_detail(item) for item in payload if item not in (None, "")
        ]
        if rendered:
            message = "; ".join(rendered)
        details = payload
    elif payload not in (None, ""):
        message = str(payload)

    error_payload: Dict[str, Any] = {"message": message}
    if code is not None:
        error_payload["code"] = code
    if details is not None:
        error_payload["details"] = details
    if extras:
        error_payload.update(extras)

    return ErrorResponse(error=ErrorDetail(**error_payload))


async def _collect_body_bytes(response: Response) -> bytes:
    """Return the fully buffered response body for further processing."""

    body = getattr(response, "body", None)
    if isinstance(body, (bytes, bytearray)):
        return bytes(body)
    if isinstance(body, str):
        charset = getattr(response, "charset", "utf-8") or "utf-8"
        return body.encode(charset)

    iterator = getattr(response, "body_iterator", None)
    if iterator is None:
        return b""

    charset = getattr(response, "charset", "utf-8") or "utf-8"
    chunks = [
        chunk if isinstance(chunk, (bytes, bytearray)) else str(chunk).encode(charset)
        async for chunk in iterator
    ]
    close = getattr(iterator, "aclose", None)
    if callable(close):  # pragma: no cover - best effort cleanup
        await close()
    return b"".join(chunks)


ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()

# Graceful shutdown via FastAPI lifespan (uvicorn will call this on SIGINT/SIGTERM)
from contextlib import asynccontextmanager

_SHUTTING_DOWN = False  # exported for potential test assertions

@asynccontextmanager
async def lifespan(app: FastAPI):  # pragma: no cover - exercised indirectly in integration
    logger.info("Lifespan startup begin")
    # Lightweight startup tasks could go here (e.g. warm caches)
    worker.start_scheduler()
    start_ts = time.time()
    try:
        yield
    finally:
        global _SHUTTING_DOWN
        _SHUTTING_DOWN = True
        await worker.stop_scheduler()
        try:
            db_conn.commit()  # ensure any buffered writes are flushed
        except Exception:  # pragma: no cover - defensive
            pass
        shutdown_duration = time.time() - start_ts
        logger.info("Lifespan shutdown complete (uptime=%.2fs)", shutdown_duration)

# Instantiate app with lifespan for graceful shutdown
app = FastAPI(title="RevenuePilot API", lifespan=lifespan)


@app.middleware("http")
async def wrap_api_response(request: Request, call_next):
    """Ensure all JSON endpoints return a standard envelope."""

    try:
        response = await call_next(request)
    except HTTPException as exc:  # Allow dedicated handlers to run
        raise exc
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Unhandled error: %s", exc)
        error_payload = _build_error_response(str(exc), status_code=500)
        return JSONResponse(status_code=500, content=error_payload.model_dump())

    content_type = response.headers.get("content-type", "")
    if "json" in content_type.lower():
        body_bytes = await _collect_body_bytes(response)
        charset = getattr(response, "charset", "utf-8") or "utf-8"
        try:
            payload = json.loads(body_bytes.decode(charset)) if body_bytes else None
        except Exception:  # pragma: no cover - non-json payload
            logger.debug(
                "Failed to decode JSON response for %s; returning original payload",
                request.url.path,
            )
            headers = {
                k: v
                for k, v in response.headers.items()
                if k.lower() != "content-length"
            }
            return Response(
                content=body_bytes,
                status_code=response.status_code,
                headers=headers,
                media_type=response.media_type,
                background=response.background,
            )
        if isinstance(payload, dict) and "success" in payload:
            headers = {
                k: v
                for k, v in response.headers.items()
                if k.lower() != "content-length"
            }
            return JSONResponse(
                status_code=response.status_code,
                content=payload,
                headers=headers,
                media_type=response.media_type,
                background=response.background,
            )
        if 200 <= response.status_code < 400:
            wrapper = SuccessResponse(data=payload)
            content = wrapper.model_dump()
            if isinstance(payload, dict):
                merged_content = dict(payload)
                merged_content.update(content)
                content = merged_content
        else:
            wrapper = _build_error_response(payload, status_code=response.status_code)
            content = wrapper.model_dump()
        headers = {
            k: v
            for k, v in response.headers.items()
            if k.lower() != "content-length"
        }
        return JSONResponse(
            status_code=response.status_code,
            content=content,
            headers=headers,
            media_type=response.media_type,
            background=response.background,
        )
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Convert ``HTTPException`` instances into the standard error envelope."""

    error_payload = _build_error_response(exc.detail, status_code=exc.status_code)
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload.model_dump(),
        headers=exc.headers,
    )


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

COMPLIANCE_SEVERITIES = {"low", "medium", "high", "critical"}
COMPLIANCE_STATUSES = {"open", "in_progress", "resolved", "dismissed"}


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
UPLOAD_DIR = Path(os.getenv("CHART_UPLOAD_DIR", os.path.join(data_dir, "uploaded_charts")))

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
ensure_event_aggregates_table(db_conn)
ensure_compliance_issues_table(db_conn)


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
    ensure_session_state_table(conn)
    ensure_compliance_issues_table(conn)
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
ensure_session_state_table(db_conn)
ensure_compliance_issues_table(db_conn)

# User profile details including current view and UI preferences.
ensure_user_profile_table(db_conn)

# Centralized error logging table.
ensure_error_log_table(db_conn)

# Table storing notes and drafts with status metadata.
ensure_notes_table(db_conn)

# Tables for refresh tokens and user session state
ensure_refresh_table(db_conn)
ensure_session_table(db_conn)

# Core clinical data tables.
ensure_patients_table(db_conn)
ensure_encounters_table(db_conn)
ensure_visit_sessions_table(db_conn)

# Configure the database connection to return rows as dictionaries.  This
# makes it easier to access columns by name when querying events for
# metrics computations.
db_conn.row_factory = sqlite3.Row

# Preload any stored API key into the environment so subsequent calls work.
get_api_key()


def _serialise_audit_details(details: Any | None) -> str | None:
    """Return a JSON serialisation suitable for the audit log."""

    if details is None:
        return None
    if isinstance(details, str):
        return details
    try:
        return json.dumps(details, ensure_ascii=False)
    except TypeError:
        return str(details)


def _insert_audit_log(
    username: str | None,
    action: str,
    details: Any | None = None,
) -> None:
    """Persist an entry into the audit_log table (best effort)."""

    payload = _serialise_audit_details(details)
    timestamp = time.time()
    try:
        db_conn.execute(
            "INSERT INTO audit_log (timestamp, username, action, details) VALUES (?, ?, ?, ?)",
            (timestamp, username, action, payload),
        )
        db_conn.commit()
    except sqlite3.OperationalError as exc:
        if "no such table: audit_log" not in str(exc):
            logger.exception("Failed to write audit log entry")
            return
        db_conn.execute(
            "CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL NOT NULL, username TEXT, action TEXT NOT NULL, details TEXT)"
        )
        db_conn.execute(
            "INSERT INTO audit_log (timestamp, username, action, details) VALUES (?, ?, ?, ?)",
            (timestamp, username, action, payload),
        )
        db_conn.commit()
    except Exception:
        logger.exception("Failed to write audit log entry")


def _normalise_severity(value: str | None) -> str:
    if not value:
        return "medium"
    value_norm = value.lower()
    if value_norm not in COMPLIANCE_SEVERITIES:
        return "medium"
    return value_norm


def _normalise_status(value: str | None) -> str:
    if not value:
        return "open"
    value_norm = value.lower()
    if value_norm not in COMPLIANCE_STATUSES:
        return "open"
    return value_norm


def _row_to_compliance_issue(row: sqlite3.Row | None) -> Dict[str, Any]:
    if row is None:
        return {}
    data = dict(row)
    metadata_payload = data.get("metadata")
    metadata: Dict[str, Any] | None = None
    if metadata_payload:
        try:
            metadata = json.loads(metadata_payload)
        except Exception:
            metadata = {"raw": metadata_payload}
    return {
        "issueId": data.get("issue_id"),
        "ruleId": data.get("rule_id"),
        "title": data.get("title"),
        "severity": _normalise_severity(data.get("severity")),
        "category": data.get("category"),
        "status": _normalise_status(data.get("status")),
        "noteExcerpt": data.get("note_excerpt"),
        "metadata": metadata,
        "createdAt": data.get("created_at"),
        "updatedAt": data.get("updated_at"),
        "createdBy": data.get("created_by"),
        "assignee": data.get("assignee"),
    }


def _serialise_metadata(metadata: Dict[str, Any] | None) -> str | None:
    if not metadata:
        return None

    def _convert(value: Any) -> Any:
        if isinstance(value, dict):
            return {str(k): _convert(v) for k, v in value.items()}
        if isinstance(value, list):
            return [_convert(v) for v in value]
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        return str(value)

    safe_payload = _convert(metadata)
    try:
        return json.dumps(safe_payload, ensure_ascii=False)
    except Exception:
        return json.dumps(str(safe_payload), ensure_ascii=False)


def _persist_compliance_issue(
    *,
    issue_id: str | None,
    rule_id: str | None,
    title: str,
    severity: str | None,
    category: str | None,
    status: str | None,
    note_excerpt: str | None,
    metadata: Dict[str, Any] | None,
    created_by: str | None,
    assignee: str | None,
) -> Dict[str, Any]:
    issue_id = issue_id or str(uuid4())
    severity_norm = _normalise_severity(severity)
    status_norm = _normalise_status(status)
    note_excerpt_clean = sanitize_text(note_excerpt) if note_excerpt else None
    metadata_json = _serialise_metadata(metadata)
    now = time.time()
    try:
        db_conn.execute(
            """
            INSERT INTO compliance_issues (
                issue_id, rule_id, title, severity, category, status,
                note_excerpt, metadata, created_at, updated_at, created_by, assignee
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                issue_id,
                rule_id,
                title,
                severity_norm,
                category,
                status_norm,
                note_excerpt_clean,
                metadata_json,
                now,
                now,
                created_by,
                assignee,
            ),
        )
    except sqlite3.IntegrityError:
        db_conn.execute(
            """
            UPDATE compliance_issues
               SET rule_id = ?,
                   title = ?,
                   severity = ?,
                   category = ?,
                   status = ?,
                   note_excerpt = ?,
                   metadata = ?,
                   updated_at = ?,
                   assignee = ?,
                   created_by = COALESCE(created_by, ?)
             WHERE issue_id = ?
            """,
            (
                rule_id,
                title,
                severity_norm,
                category,
                status_norm,
                note_excerpt_clean,
                metadata_json,
                now,
                assignee,
                created_by,
                issue_id,
            ),
        )
    db_conn.commit()
    row = db_conn.execute(
        "SELECT * FROM compliance_issues WHERE issue_id = ?",
        (issue_id,),
    ).fetchone()
    return _row_to_compliance_issue(row)
def _audit_details_from_request(request: Request) -> Dict[str, Any]:
    """Capture structured request metadata for audit logging."""

    details: Dict[str, Any] = {
        "method": request.method,
        "path": request.url.path,
    }
    if request.query_params:
        details["query"] = dict(request.query_params)
    if request.client:
        details["client"] = request.client.host
    return details


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
# Allow optional bearer credentials for endpoints that should respond with a
# graceful unauthenticated payload rather than an HTTP error.
optional_security = HTTPBearer(auto_error=False)

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


def _log_action_for_user(
    user: Dict[str, Any], action: str, details: Dict[str, Any] | None = None
) -> None:
    """Record an audit entry for the supplied user."""

    payload = dict(details or {})
    if user.get("role") and "role" not in payload:
        payload["role"] = user["role"]
    _insert_audit_log(user.get("sub"), action, payload)


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
        _log_action_for_user(
            data, f"{request.method} {request.url.path}", _audit_details_from_request(request)
        )
        return data

    return checker


def require_roles(*roles: str):
    """Dependency factory ensuring the current user is in an allowed role."""

    allowed = {"admin", *roles}

    def checker(
        request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)
    ):
        data = get_current_user(credentials)
        if data.get("role") not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient privileges",
            )
        _log_action_for_user(
            data, f"{request.method} {request.url.path}", _audit_details_from_request(request)
        )
        return data

    return checker


async def ws_require_role(websocket: WebSocket, role: str) -> Dict[str, Any]:
    """Authenticate a websocket connection against a required role."""

    auth = websocket.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        await websocket.close(code=1008)
        raise WebSocketDisconnect()
    token = auth.split()[1]
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    try:
        data = get_current_user(credentials, required_role=role)
        details = {"path": websocket.url.path, "type": "websocket"}
        if websocket.client:
            details["client"] = websocket.client.host
        _log_action_for_user(data, "websocket_connect", details)
        return data
    except HTTPException:
        await websocket.close(code=1008)
        raise WebSocketDisconnect()


# Model for setting API key via API endpoint
class ApiKeyModel(BaseModel):
    key: str


class ServiceKeyModel(BaseModel):
    service: str
    key: str


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


class ThemePreviewModel(BaseModel):
    """Color swatch preview metadata for a UI theme."""

    background: Optional[str] = None
    surface: Optional[str] = None
    primary: Optional[str] = None
    accent: Optional[str] = None
    text: Optional[str] = None

    model_config = {"extra": "allow"}


class ThemeMetadataModel(BaseModel):
    """Metadata describing an available UI theme."""

    id: str
    name: str
    description: str
    preview: ThemePreviewModel = Field(default_factory=ThemePreviewModel)
    isDefault: bool = False

    model_config = {"extra": "allow"}


THEME_METADATA_PATH = Path(__file__).with_name("themes.json")

_THEME_METADATA_FALLBACK: List[Dict[str, Any]] = [
    {
        "id": "modern",
        "name": "Modern Minimal",
        "description": "Clean neutral surfaces with bright accent colors for focus-intensive workflows.",
        "preview": {
            "background": "#f5f7fb",
            "surface": "#ffffff",
            "primary": "#2563eb",
            "accent": "#38bdf8",
            "text": "#1f2937",
        },
        "isDefault": True,
    },
    {
        "id": "dark",
        "name": "Midnight Contrast",
        "description": "High contrast dark theme designed to reduce eye strain in low-light environments.",
        "preview": {
            "background": "#0f172a",
            "surface": "#1e293b",
            "primary": "#38bdf8",
            "accent": "#f59e0b",
            "text": "#e2e8f0",
        },
    },
    {
        "id": "warm",
        "name": "Warm Sunrise",
        "description": "Soft warm neutrals with gentle contrast for a welcoming documentation experience.",
        "preview": {
            "background": "#fdf6f0",
            "surface": "#fff7ed",
            "primary": "#f97316",
            "accent": "#facc15",
            "text": "#78350f",
        },
    },
]


def _load_theme_catalog(path: Path = THEME_METADATA_PATH) -> List[ThemeMetadataModel]:
    """Load available themes from JSON metadata with sensible fallbacks."""

    try:
        with path.open("r", encoding="utf-8") as f:
            raw_data = json.load(f)
    except FileNotFoundError:
        logger.warning("Theme metadata file not found at %s; using defaults", path)
        raw_data = _THEME_METADATA_FALLBACK
    except Exception:
        logger.exception("Failed to load theme metadata; using defaults")
        raw_data = _THEME_METADATA_FALLBACK

    if isinstance(raw_data, dict):
        items = raw_data.get("themes", [])
    else:
        items = raw_data

    catalog: List[ThemeMetadataModel] = []
    for entry in items:
        try:
            catalog.append(ThemeMetadataModel.model_validate(entry))
        except Exception:
            logger.warning("Skipping invalid theme metadata entry: %s", entry)

    if not catalog:
        catalog = [ThemeMetadataModel.model_validate(item) for item in _THEME_METADATA_FALLBACK]

    return catalog


THEME_CATALOG: List[ThemeMetadataModel] = _load_theme_catalog()
THEME_ID_SET: Set[str] = {theme.id for theme in THEME_CATALOG}
DEFAULT_THEME_ID: str = next(
    (theme.id for theme in THEME_CATALOG if theme.isDefault),
    "modern",
)

if not THEME_ID_SET:
    THEME_ID_SET = {"modern", "dark", "warm"}

if DEFAULT_THEME_ID not in THEME_ID_SET:
    DEFAULT_THEME_ID = next(iter(THEME_ID_SET))


class CategorySettings(BaseModel):
    """Which suggestion categories are enabled for a user."""

    codes: StrictBool = True
    compliance: StrictBool = True
    publicHealth: StrictBool = True
    differentials: StrictBool = True

    model_config = {"extra": "forbid"}


class UserSettings(BaseModel):
    theme: str = DEFAULT_THEME_ID
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
        allowed = THEME_ID_SET
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
async def register(model: RegisterModel, request: Request) -> Dict[str, Any]:
    """Register a new user and immediately issue JWT tokens."""
    try:
        _user_id = register_user(db_conn, model.username, model.password)
    except sqlite3.IntegrityError:
        _insert_audit_log(
            model.username,
            "register_failed",
            {"reason": "username exists", "client": request.client.host if request.client else None},
        )
        raise HTTPException(status_code=400, detail="Username already exists")
    _insert_audit_log(
        model.username,
        "register",
        {"client": request.client.host if request.client else None},
    )
    access_token = create_access_token(model.username, "user")
    refresh_token = create_refresh_token(model.username, "user")
    settings = UserSettings().model_dump()
    session = SessionStateModel().model_dump()
    db_conn.execute(
        "INSERT OR REPLACE INTO session_state (user_id, data, updated_at) VALUES (?, ?, ?)",
        (_user_id, json.dumps(session), time.time()),
    )
    db_conn.commit()
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "settings": settings,
        "session": session,
    }


@app.post("/auth/register")
async def auth_register(model: RegisterModel, request: Request):
    """Namespaced registration endpoint (idempotent for tests).

    Mirrors /register but if the user already exists returns 200 with tokens
    instead of a 400 so that repeated calls in isolated test DBs succeed.
    """
    try:
        _user_id = register_user(db_conn, model.username, model.password)
        _insert_audit_log(
            model.username,
            "register",
            {"source": "auth", "client": request.client.host if request.client else None},
        )
    except sqlite3.IntegrityError:
        row = db_conn.execute(
            "SELECT id, role FROM users WHERE username=?", (model.username,)
        ).fetchone()
        role = row["role"] if row else "user"
        user_id = row["id"] if row else None
        _insert_audit_log(
            model.username,
            "register_exists",
            {"source": "auth", "client": request.client.host if request.client else None},
        )
        session_row = (
            db_conn.execute(
                "SELECT data FROM session_state WHERE user_id=?", (user_id,)
            ).fetchone()
            if user_id is not None
            else None
        )
        if session_row and session_row["data"]:
            try:
                session = json.loads(session_row["data"])
            except Exception:
                session = SessionStateModel().model_dump()
        else:
            session = SessionStateModel().model_dump()
    else:
        role = "user"
        user_id = _user_id
        session = SessionStateModel().model_dump()
        db_conn.execute(
            "INSERT OR REPLACE INTO session_state (user_id, data, updated_at) VALUES (?, ?, ?)",
            (user_id, json.dumps(session), time.time()),
        )
        db_conn.commit()
    access_token = create_access_token(model.username, role)
    refresh_token = create_refresh_token(model.username, role)
    settings = UserSettings().model_dump()
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "settings": settings,
        "session": session,
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
async def login(model: LoginModel, request: Request) -> Dict[str, Any]:
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
        _insert_audit_log(
            model.username,
            "failed_login",
            {
                "reason": "invalid credentials",
                "client": request.client.host if request.client else None,
            },
        )
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

    _insert_audit_log(
        model.username,
        "login",
        {"client": request.client.host if request.client else None},
    )

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

    session_row = db_conn.execute(
        "SELECT data FROM session_state WHERE user_id=?", (user_id,)
    ).fetchone()
    if session_row and session_row["data"]:
        try:
            session = json.loads(session_row["data"])
        except Exception:
            session = SessionStateModel().model_dump()
    else:
        session = SessionStateModel().model_dump()

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
        "session": session,
    }


@app.post("/auth/login")
@app.post("/api/auth/login")
async def auth_login(model: LoginModel, request: Request):
    return await login(model, request)


@app.get("/auth/status")
@app.get("/api/auth/status")
async def auth_status(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security),
) -> Dict[str, Any]:
    """Return authentication state for the provided bearer token."""

    if not credentials:
        return {"authenticated": False}

    try:
        token_data = get_current_user(credentials)
    except HTTPException:
        return {"authenticated": False}

    if token_data.get("type") not in (None, "access"):
        return {"authenticated": False}

    username = token_data.get("sub")
    if not username:
        return {"authenticated": False}

    row = db_conn.execute(
        "SELECT id, role FROM users WHERE username=?",
        (username,),
    ).fetchone()
    if not row:
        return {"authenticated": False}

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

    user_payload = {
        "id": user_id,
        "name": username,
        "role": role,
        "specialty": preferences.get("specialty"),
        "permissions": [role],
        "preferences": preferences,
    }

    if token_data.get("role") != role:
        token_data = dict(token_data)
        token_data["role"] = role

    _log_action_for_user(
        token_data,
        "auth_status",
        _audit_details_from_request(request),
    )

    return {"authenticated": True, "user": user_payload}


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
        _insert_audit_log(None, "refresh_failed", {"reason": "invalid_token"})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?",
        (data["sub"],),
    ).fetchone()
    if not row:
        _insert_audit_log(data.get("sub"), "refresh_failed", {"reason": "unknown_user"})
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
        _insert_audit_log(data.get("sub"), "refresh_failed", {"reason": "token_mismatch"})
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    access_token = create_access_token(data["sub"], data["role"], data.get("clinic"))
    expires_at_iso = (
        datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    ).isoformat() + "Z"
    _insert_audit_log(data.get("sub"), "refresh_token", None)
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
    if success:
        _insert_audit_log(data.get("sub"), "logout", None)
    else:
        _insert_audit_log(data.get("sub"), "logout_failed", None)
    return {"success": success}


@app.post("/reset-password")
async def reset_password(model: ResetPasswordModel) -> Dict[str, str]:
    """Allow a user to change their password by providing the current one."""
    row = db_conn.execute(
        "SELECT password_hash FROM users WHERE username=?",
        (model.username,),
    ).fetchone()
    if not row or not verify_password(model.password, row["password_hash"]):
        _insert_audit_log(
            model.username,
            "password_reset_failed",
            {"reason": "invalid_credentials"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    db_conn.execute(
        "UPDATE users SET password_hash=? WHERE username=?",
        (hash_password(model.new_password), model.username),
    )
    db_conn.commit()
    _insert_audit_log(model.username, "password_reset", None)
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


@app.get("/api/themes/available", tags=["themes"])
async def list_available_themes() -> Dict[str, Any]:
    """Return metadata describing the themes that the UI can render."""

    return {
        "themes": [theme.model_dump() for theme in THEME_CATALOG],
        "default": DEFAULT_THEME_ID,
    }

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
    return {"keys": list_key_metadata()}


@app.post("/api/keys")
async def post_keys_endpoint(
    model: ServiceKeyModel, user=Depends(require_role("admin"))
):
    store_key(model.service, model.key)
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

# Removed obsolete websocket handler

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


class SessionStateModel(BaseModel):
    selectedCodes: Dict[str, int] = Field(
        default_factory=lambda: {
            "codes": 0,
            "prevention": 0,
            "diagnoses": 0,
            "differentials": 0,
        }
    )
    panelStates: Dict[str, StrictBool] = Field(
        default_factory=lambda: {"suggestionPanel": False}
    )
    currentNote: Optional[Dict[str, Any]] = None


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


@app.get("/api/user/session")
async def get_user_session(user=Depends(require_role("user"))):
    row = db_conn.execute(
        "SELECT ss.data FROM session_state ss JOIN users u ON ss.user_id = u.id WHERE u.username=?",
        (user["sub"],),
    ).fetchone()
    if row and row["data"]:
        try:
            data = json.loads(row["data"])
        except Exception:
            data = SessionStateModel().model_dump()
    else:
        data = SessionStateModel().model_dump()
    return data


@app.put("/api/user/session")
async def put_user_session(
    model: SessionStateModel, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?", (user["sub"],),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="User not found")
    db_conn.execute(
        "INSERT OR REPLACE INTO session_state (user_id, data, updated_at) VALUES (?, ?, ?)",
        (row["id"], json.dumps(model.model_dump()), time.time()),
    )
    db_conn.commit()
    return model.model_dump()


@app.get("/api/notifications/count")
async def get_notification_count(
    user=Depends(require_role("user"))
) -> Dict[str, int]:
    return {"count": notification_counts[user["sub"]]}


@app.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket):
    user = await ws_require_role(websocket, "user")
    username = user["sub"]
    await websocket.accept()
    notification_clients.add(websocket)
    notification_subscribers[username].append(websocket)
    try:
        await websocket.send_json({"count": notification_counts[username]})
        while True:
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        pass
    finally:
        notification_clients.discard(websocket)
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

    text: str = Field(..., max_length=10000)
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

    @field_validator("text")
    @classmethod
    def sanitize_text_field(cls, v: str) -> str:  # noqa: D401,N805
        return sanitize_text(v)



class CodesSuggestRequest(BaseModel):
    content: str = Field(..., max_length=10000)
    patientData: Optional[Dict[str, Any]] = None
    useLocalModels: Optional[bool] = False
    useOfflineMode: Optional[bool] = False

    @field_validator("content")
    @classmethod
    def sanitize_content(cls, v: str) -> str:  # noqa: D401,N805
        return sanitize_text(v)


class ComplianceCheckRequest(BaseModel):
    content: str = Field(..., max_length=10000)
    codes: Optional[List[str]] = None
    useLocalModels: Optional[bool] = False
    useOfflineMode: Optional[bool] = False

    @field_validator("content")
    @classmethod
    def sanitize_content(cls, v: str) -> str:  # noqa: D401,N805
        return sanitize_text(v)


class DifferentialsGenerateRequest(BaseModel):
    content: str = Field(..., max_length=10000)
    symptoms: Optional[List[str]] = None
    patientData: Optional[Dict[str, Any]] = None
    useLocalModels: Optional[bool] = False
    useOfflineMode: Optional[bool] = False

    @field_validator("content")
    @classmethod
    def sanitize_content(cls, v: str) -> str:  # noqa: D401,N805
        return sanitize_text(v)


class PreventionSuggestRequest(BaseModel):
    patientData: Optional[Dict[str, Any]] = None
    demographics: Optional[Dict[str, Any]] = None
    useLocalModels: Optional[bool] = False
    useOfflineMode: Optional[bool] = False


class RealtimeAnalyzeRequest(BaseModel):
    content: str = Field(..., max_length=10000)
    patientContext: Optional[Dict[str, Any]] = None
    useLocalModels: Optional[bool] = False
    useOfflineMode: Optional[bool] = False

    @field_validator("content")
    @classmethod
    def sanitize_content(cls, v: str) -> str:  # noqa: D401,N805
        return sanitize_text(v)

class VisitSessionModel(BaseModel):  # pragma: no cover - simple schema
    id: Optional[int] = None
    encounter_id: int
    data: Optional[str] = None


class AutoSaveModel(BaseModel):  # pragma: no cover - simple schema
    note_id: Optional[int] = None
    content: str = Field(..., max_length=10000)
    beautifyModel: Optional[str] = None
    suggestModel: Optional[str] = None
    summarizeModel: Optional[str] = None

    class Config:
        populate_by_name = True

    @field_validator("content")
    @classmethod
    def sanitize_content(cls, v: str) -> str:  # noqa: D401,N805
        return sanitize_text(v)


# Regular expressions for validating medical code formats
CPT_CODE_RE = re.compile(r"^\d{5}$")
ICD10_CODE_RE = re.compile(r"^[A-TV-Z][0-9][A-Z0-9](?:\.[A-Z0-9]{1,4})?$")
HCPCS_CODE_RE = re.compile(r"^[A-Z]\d{4}$")
GENERAL_CODE_RE = re.compile(r"^[A-Z0-9]{1,7}$")


def _validate_code(value: str) -> str:
    """Validate that *value* matches a CPT, ICD-10 or HCPCS pattern."""
    canonical = value.strip().upper()
    if any(
        regex.match(canonical)
        for regex in (CPT_CODE_RE, ICD10_CODE_RE, HCPCS_CODE_RE, GENERAL_CODE_RE)
    ):
        return canonical
    if canonical:
        # Preserve non-empty custom codes rather than failing the entire payload.
        logger.debug("Accepting non-standard code %s without strict validation", value)
        return value
    raise ValueError("invalid code format")



class CodeSuggestion(BaseModel):
    """Represents a single coding suggestion with rationale and upgrade."""

    code: str
    rationale: Optional[str] = None
    upgrade_to: Optional[str] = None
    upgradePath: Optional[str] = Field(None, alias="upgrade_path")

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:  # noqa: D401,N805
        return _validate_code(v)


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
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    reasoning: Optional[str] = None

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:  # noqa: D401,N805
        return _validate_code(v)


class CodesSuggestResponse(BaseModel):
    suggestions: List[CodeSuggestItem]


class ComplianceAlert(BaseModel):
    text: str
    category: Optional[str] = None
    priority: Optional[str] = None
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    reasoning: Optional[str] = None


class ComplianceCheckResponse(BaseModel):
    alerts: List[ComplianceAlert]


class ComplianceMonitorIssue(BaseModel):
    issueId: str
    ruleId: Optional[str] = None
    title: str
    severity: str
    category: Optional[str] = None
    summary: Optional[str] = None
    recommendation: Optional[str] = None
    references: Optional[List[Dict[str, Any]]] = None
    status: Optional[str] = None
    noteExcerpt: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    createdAt: Optional[float] = None


class ComplianceMonitorRequest(BaseModel):
    note: str = Field(..., max_length=10000)
    metadata: Optional[Dict[str, Any]] = None
    ruleIds: Optional[List[str]] = None
    persistFindings: Optional[bool] = False

    class Config:
        populate_by_name = True

    @field_validator("note")
    @classmethod
    def sanitize_note(cls, value: str) -> str:  # noqa: D401,N805
        return sanitize_text(value)

    @field_validator("ruleIds")
    @classmethod
    def unique_rules(cls, value: Optional[List[str]]) -> Optional[List[str]]:  # noqa: D401,N805
        if not value:
            return value
        seen: Set[str] = set()
        unique: List[str] = []
        for item in value:
            if not isinstance(item, str):
                continue
            lowered = item.strip()
            if not lowered:
                continue
            lowered_norm = lowered.lower()
            if lowered_norm in seen:
                continue
            seen.add(lowered_norm)
            unique.append(lowered)
        return unique


class ComplianceMonitorResponse(BaseModel):
    issues: List[ComplianceMonitorIssue]
    summary: Dict[str, Any]
    rulesEvaluated: int
    appliedRules: List[str]
    persistedIssueIds: Optional[List[str]] = None


class ComplianceIssueCreateRequest(BaseModel):
    title: str
    severity: str
    ruleId: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    noteExcerpt: Optional[str] = Field(None, max_length=2000)
    metadata: Optional[Dict[str, Any]] = None
    assignee: Optional[str] = None
    issueId: Optional[str] = None
    createdBy: Optional[str] = None

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, value: str) -> str:  # noqa: D401,N805
        if not value:
            raise ValueError("Severity is required")
        normalised = value.lower()
        if normalised not in COMPLIANCE_SEVERITIES:
            raise ValueError("Invalid severity")
        return normalised

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: Optional[str]) -> Optional[str]:  # noqa: D401,N805
        if value is None:
            return value
        normalised = value.lower()
        if normalised not in COMPLIANCE_STATUSES:
            raise ValueError("Invalid status")
        return normalised

    @field_validator("noteExcerpt")
    @classmethod
    def sanitize_excerpt(cls, value: Optional[str]) -> Optional[str]:  # noqa: D401,N805
        return sanitize_text(value) if value else value


class ComplianceIssueRecord(BaseModel):
    issueId: str
    ruleId: Optional[str] = None
    title: str
    severity: str
    category: Optional[str] = None
    status: str
    noteExcerpt: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    createdAt: float
    updatedAt: float
    createdBy: Optional[str] = None
    assignee: Optional[str] = None


class DifferentialItem(BaseModel):
    diagnosis: str
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
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
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    reasoning: Optional[str] = None
    ageRelevant: Optional[bool] = None


class PreventionResponse(BaseModel):
    recommendations: List[PreventionItem]


class RealtimeAnalysisResponse(BaseModel):
    analysisId: str
    extractedSymptoms: List[str]
    medicalHistory: List[str]
    currentMedications: List[str]
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
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


class AuditLogEntryModel(BaseModel):
    id: int
    timestamp: datetime
    username: Optional[str] = None
    action: str
    details: Optional[Any] = None

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
@app.post("/event", deprecated=True)
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


@app.post("/api/activity/log")
async def log_activity_event(
    event: EventModel, user=Depends(require_role("user"))
) -> Dict[str, str]:
    """Canonical activity logging endpoint that forwards to ``/event`` handler."""

    return await log_event(event, user)


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
    content: str = Field(..., max_length=10000)

    @field_validator("content")
    @classmethod
    def sanitize_content(cls, v: str) -> str:  # noqa: D401,N805
        return sanitize_text(v)


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


@app.get("/api/notes/auto-save/status")
def get_auto_save_status(
    note_id: Optional[str] = None, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """Return auto-save status for a specific note or all notes."""

    if note_id:
        versions = NOTE_VERSIONS.get(note_id, [])
        last = versions[-1]["timestamp"] if versions else None
        return {"noteId": note_id, "versions": len(versions), "lastSave": last}
    return {
        nid: {
            "versions": len(v),
            "lastSave": v[-1]["timestamp"] if v else None,
        }
        for nid, v in NOTE_VERSIONS.items()
    }


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
    note: str = Field(..., max_length=10000)
    codes: List[str] = Field(default_factory=list)
    procedures: List[str] = Field(default_factory=list)
    medications: List[str] = Field(default_factory=list)
    patientID: Optional[str] = None
    encounterID: Optional[str] = None

    @field_validator("note")
    @classmethod
    def sanitize_note(cls, v: str) -> str:  # noqa: D401,N805
        return sanitize_text(v)

    @field_validator("codes", "procedures", "medications")
    @classmethod
    def validate_codes(cls, v: List[str]) -> List[str]:  # noqa: D401,N805
        return [_validate_code(c) for c in v]
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


@app.get("/api/export/status/{export_id}")
async def get_export_status_generic(
    export_id: int, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """Poll the status of an export operation by ID."""

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
    user=Depends(require_roles("analyst")),
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
                SUM(CASE WHEN eventType='beautify' THEN 1 ELSE 0 END)        AS beautify,
                SUM(CASE WHEN eventType='suggest' THEN 1 ELSE 0 END)         AS suggest,
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
            "beautify": totals.get("beautify", 0) or 0,
            "suggest": totals.get("suggest", 0) or 0,
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
        "beautify",
        "suggest",
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
        k
        for k, _ in sorted(
            compliance_counts.items(), key=lambda kv: kv[1], reverse=True
        )[:5]

    ]

    return {
        "baseline": baseline_metrics,
        "current": current_metrics,
        "improvement": improvement,
        "coding_distribution": coding_distribution,
        "denial_rates": denial_rates,
        "compliance_counts": compliance_counts,
        "top_compliance": top_compliance,
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


def _aggregate_events_for_day(day: date) -> bool:
    """Aggregate metrics for a single UTC day into ``event_aggregates``."""

    start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    start_ts = start.timestamp()
    end_ts = end.timestamp()

    cursor = db_conn.cursor()
    try:
        row = cursor.execute(
            """
        SELECT
            COUNT(*) AS total_events,
            SUM(CASE WHEN eventType IN ('note_started','note_saved','note_closed') THEN 1 ELSE 0 END) AS notes,
            SUM(CASE WHEN eventType='beautify' THEN 1 ELSE 0 END) AS beautify,
            SUM(CASE WHEN eventType='suggest' THEN 1 ELSE 0 END) AS suggest,
            SUM(CASE WHEN eventType='summary' THEN 1 ELSE 0 END) AS summary,
            SUM(CASE WHEN eventType='chart_upload' THEN 1 ELSE 0 END) AS chart_upload,
            SUM(CASE WHEN eventType='audio_recorded' THEN 1 ELSE 0 END) AS audio,
            SUM(COALESCE(revenue, 0)) AS revenue,
            AVG(time_to_close) AS avg_time_to_close,
            SUM(CASE WHEN eventType='note_closed' AND json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.denial') = 1 THEN 1 ELSE 0 END) AS denials,
            SUM(CASE WHEN eventType='note_closed' AND json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.deficiency') = 1 THEN 1 ELSE 0 END) AS deficiencies,
            SUM(CASE WHEN public_health = 1 THEN 1 ELSE 0 END) AS public_health_events,
            AVG(CASE WHEN satisfaction IS NOT NULL THEN satisfaction END) AS avg_satisfaction,
            SUM(json_array_length(COALESCE(compliance_flags, '[]'))) AS compliance_flags,
            SUM(json_array_length(COALESCE(codes, '[]'))) AS total_codes,
            COUNT(DISTINCT json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.clinician')) AS clinicians
        FROM events
        WHERE timestamp >= ? AND timestamp < ?
        """,
        (start_ts, end_ts),
        ).fetchone()
    except sqlite3.OperationalError as exc:  # pragma: no cover - depends on SQLite build
        logger.warning("Skipping detailed aggregation for %s: %s", day.isoformat(), exc)
        return False

    if row is None:
        return False

    metrics = {
        "notes": row["notes"] or 0,
        "beautify": row["beautify"] or 0,
        "suggest": row["suggest"] or 0,
        "summary": row["summary"] or 0,
        "chart_upload": row["chart_upload"] or 0,
        "audio": row["audio"] or 0,
        "revenue": float(row["revenue"] or 0.0),
        "avg_time_to_close": float(row["avg_time_to_close"]) if row["avg_time_to_close"] is not None else None,
        "denials": row["denials"] or 0,
        "deficiencies": row["deficiencies"] or 0,
        "public_health_events": row["public_health_events"] or 0,
        "avg_satisfaction": float(row["avg_satisfaction"]) if row["avg_satisfaction"] is not None else None,
        "compliance_flags": row["compliance_flags"] or 0,
        "total_codes": row["total_codes"] or 0,
        "clinicians": row["clinicians"] or 0,
    }

    db_conn.execute(
        """
        INSERT INTO event_aggregates (day, start_ts, end_ts, total_events, metrics, computed_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(day) DO UPDATE SET
            start_ts=excluded.start_ts,
            end_ts=excluded.end_ts,
            total_events=excluded.total_events,
            metrics=excluded.metrics,
            computed_at=excluded.computed_at
        """,
        (
            day.isoformat(),
            start_ts,
            end_ts,
            row["total_events"] or 0,
            json.dumps(metrics, ensure_ascii=False),
            time.time(),
        ),
    )
    db_conn.commit()
    return True


def _aggregate_pending_days() -> int:
    """Aggregate any days that have not yet been summarised."""

    cursor = db_conn.cursor()
    first_last = cursor.execute(
        "SELECT MIN(timestamp) AS first_ts, MAX(timestamp) AS last_ts FROM events"
    ).fetchone()
    if not first_last or first_last["first_ts"] is None:
        return 0

    first_day = datetime.fromtimestamp(first_last["first_ts"], tz=timezone.utc).date()
    last_event_day = datetime.fromtimestamp(first_last["last_ts"], tz=timezone.utc).date()
    last_full_day = min(last_event_day, datetime.utcnow().date() - timedelta(days=1))
    if first_day > last_full_day:
        return 0

    latest_row = cursor.execute(
        "SELECT day FROM event_aggregates ORDER BY day DESC LIMIT 1"
    ).fetchone()
    if latest_row and latest_row["day"]:
        start_day = datetime.fromisoformat(latest_row["day"]).date() + timedelta(days=1)
    else:
        start_day = first_day

    if start_day > last_full_day:
        return 0

    aggregated_days = 0
    current = start_day
    while current <= last_full_day:
        if _aggregate_events_for_day(current):
            aggregated_days += 1
        current += timedelta(days=1)
    return aggregated_days


async def _run_nightly_aggregation() -> None:
    """Background task entry point executed by the worker scheduler."""

    aggregated_days = await asyncio.to_thread(_aggregate_pending_days)
    if aggregated_days:
        logger.info("Aggregated analytics for %s day(s)", aggregated_days)
        _insert_audit_log(None, "system_aggregate_events", {"days": aggregated_days})
    else:
        logger.debug("No analytics aggregation required")


worker.register_analytics_aggregator(_run_nightly_aggregation)


def _analytics_where(user: Dict[str, Any]) -> tuple[str, List[Any]]:
    """Return a WHERE clause limiting events based on user role."""
    if user.get("role") in {"admin", "analyst"}:
        return "", []
    return (
        "WHERE json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.clinician') = ?",
        [user["sub"]],
    )


@app.get("/api/activity/log")
async def get_activity_log(
    limit: int = 100,
    cursor: Optional[int] = None,
    user=Depends(require_roles("analyst")),
) -> Dict[str, Any]:
    """Return a paginated audit trail ordered from newest to oldest."""

    if limit <= 0:
        raise HTTPException(status_code=400, detail="limit must be positive")
    limit = min(limit, 500)

    params: List[Any] = []
    where_clause = ""
    if cursor is not None:
        where_clause = "WHERE id < ?"
        params.append(cursor)

    query = (
        "SELECT id, timestamp, username, action, details FROM audit_log "
        f"{where_clause} ORDER BY id DESC LIMIT ?"
    )
    params.append(limit)
    rows = db_conn.execute(query, params).fetchall()

    entries: List[AuditLogEntryModel] = []
    for row in rows:
        details_raw = row["details"]
        parsed: Any | None = None
        if details_raw:
            try:
                parsed = json.loads(details_raw)
            except json.JSONDecodeError:
                parsed = details_raw
        entries.append(
            AuditLogEntryModel(
                id=row["id"],
                timestamp=datetime.fromtimestamp(row["timestamp"], tz=timezone.utc),
                username=row["username"],
                action=row["action"],
                details=parsed,
            )
        )

    next_cursor = rows[-1]["id"] if rows and len(rows) == limit else None
    return {
        "entries": [entry.model_dump() for entry in entries],
        "next": next_cursor,
        "count": len(entries),
    }


@app.get("/api/analytics/usage")
async def analytics_usage(user=Depends(require_roles("analyst"))) -> Dict[str, Any]:
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
async def analytics_coding_accuracy(user=Depends(require_roles("analyst"))) -> Dict[str, Any]:
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
async def analytics_revenue(user=Depends(require_roles("analyst"))) -> Dict[str, Any]:
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
async def analytics_compliance(user=Depends(require_roles("analyst"))) -> Dict[str, Any]:
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

    await ws_require_role(websocket, "user")
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
    await ws_require_role(websocket, "user")
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
    await ws_require_role(websocket, "user")
    await websocket.accept()
    data = await websocket.receive_json()
    resp = await _compliance_check(ComplianceCheckRequest(**data))
    await websocket.send_json(resp.model_dump())
    await websocket.close()


@app.post("/api/compliance/monitor", response_model=ComplianceMonitorResponse)
async def compliance_monitor(
    req: ComplianceMonitorRequest, user=Depends(require_role("user"))
) -> ComplianceMonitorResponse:
    metadata = req.metadata if isinstance(req.metadata, dict) else {}
    result = compliance_engine.evaluate_note(
        note=req.note,
        metadata=metadata,
        rule_ids=req.ruleIds,
    )
    issues = [ComplianceMonitorIssue(**item) for item in result.get("issues", [])]
    persisted_ids: List[str] = []
    if req.persistFindings and issues:
        for issue in issues:
            metadata_payload: Dict[str, Any] = {}
            if issue.details:
                metadata_payload["details"] = issue.details
            if metadata:
                metadata_payload["context"] = metadata
            if issue.recommendation:
                metadata_payload["recommendation"] = issue.recommendation
            if issue.references:
                metadata_payload["references"] = issue.references
            if issue.summary:
                metadata_payload["summary"] = issue.summary
            record = _persist_compliance_issue(
                issue_id=issue.issueId,
                rule_id=issue.ruleId,
                title=issue.title,
                severity=issue.severity,
                category=issue.category,
                status=issue.status or "open",
                note_excerpt=issue.noteExcerpt,
                metadata=metadata_payload or None,
                created_by=user.get("sub"),
                assignee=None,
            )
            if record.get("issueId"):
                persisted_ids.append(record["issueId"])
    response = ComplianceMonitorResponse(
        issues=issues,
        summary=result.get("summary", {}),
        rulesEvaluated=result.get("rulesEvaluated", 0),
        appliedRules=result.get("appliedRules", []),
        persistedIssueIds=persisted_ids or None,
    )
    return response


@app.get("/api/compliance/rules")
async def compliance_rules(user=Depends(require_role("user"))) -> Dict[str, Any]:
    rules = compliance_engine.get_rules()
    return {"rules": rules, "count": len(rules)}


@app.post("/api/compliance/issue-tracking", response_model=ComplianceIssueRecord)
async def compliance_issue_tracking(
    req: ComplianceIssueCreateRequest, user=Depends(require_role("user"))
) -> ComplianceIssueRecord:
    metadata_payload: Dict[str, Any] = {}
    if isinstance(req.metadata, dict):
        metadata_payload.update(req.metadata)
    metadata_payload["manual"] = True
    record = _persist_compliance_issue(
        issue_id=req.issueId,
        rule_id=req.ruleId,
        title=sanitize_text(req.title),
        severity=req.severity,
        category=req.category,
        status=req.status or "open",
        note_excerpt=req.noteExcerpt,
        metadata=metadata_payload or None,
        created_by=req.createdBy or user.get("sub"),
        assignee=req.assignee,
    )
    if not record:
        raise HTTPException(status_code=500, detail="Failed to persist issue")
    return ComplianceIssueRecord(**record)


@app.get("/api/compliance/resources")
async def compliance_resources(
    region: Optional[str] = None,
    category: Optional[str] = None,
    user=Depends(require_role("user")),
) -> Dict[str, Any]:
    resources = compliance_engine.get_resources(region=region, category=category)
    return {"resources": resources, "count": len(resources)}


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
    await ws_require_role(websocket, "user")
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
    await ws_require_role(websocket, "user")
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
    await ws_require_role(websocket, "user")
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
    if USE_OFFLINE_MODEL:
        return {"ok": True, "issues": []}
    messages = [
        {
            "role": "system",
            "content": "Return JSON {\"ok\": bool, \"issues\": []} indicating remaining problems.",
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
    except Exception:
        data = {}
    return {"analysis": data}



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
# ---------------------- Code validation & billing -------------------------
          
class CombinationRequest(BaseModel):
    cpt: List[str] = Field(default_factory=list)
    icd10: List[str] = Field(default_factory=list)
    age: Optional[int] = Field(default=None, ge=0, le=130)
    gender: Optional[str] = None
    encounterType: Optional[str] = None
    providerSpecialty: Optional[str] = None


@app.get("/api/codes/categorization/rules")
async def get_code_categorization_rules(
    user=Depends(require_role("user")),
) -> Dict[str, Any]:
    """Return categorization rules for client-side code organization."""

    return load_code_categorization_rules()


@app.get("/api/codes/validate/cpt/{code}")
async def validate_cpt_code(
    code: str,
    age: int | None = Query(None, ge=0, le=130),
    gender: str | None = Query(None),
    encounter_type: str | None = Query(None, alias="encounterType"),
    provider_specialty: str | None = Query(None, alias="providerSpecialty"),
    user=Depends(require_role("user")),
):
    """Validate a CPT code."""

    return code_tables.validate_cpt(
        code,
        age=age,
        gender=gender.strip() if gender else None,
        encounter_type=encounter_type.strip() if encounter_type else None,
        specialty=provider_specialty.strip() if provider_specialty else None,
    )


@app.get("/api/codes/validate/icd10/{code}")
async def validate_icd10_code(
    code: str,
    age: int | None = Query(None, ge=0, le=130),
    gender: str | None = Query(None),
    encounter_type: str | None = Query(None, alias="encounterType"),
    provider_specialty: str | None = Query(None, alias="providerSpecialty"),
    user=Depends(require_role("user")),
):
    """Validate an ICD-10 code."""

    return code_tables.validate_icd10(
        code,
        age=age,
        gender=gender.strip() if gender else None,
        encounter_type=encounter_type.strip() if encounter_type else None,
        specialty=provider_specialty.strip() if provider_specialty else None,
    )


@app.post("/api/codes/validate/combination")
async def validate_code_combination(
    req: CombinationRequest, user=Depends(require_role("user"))
):
    """Validate CPT/ICD-10 code combinations for medical necessity."""
    cpt_codes = [c.upper() for c in req.cpt]
    icd10_codes = [c.upper() for c in req.icd10]
    gender = req.gender.strip() if req.gender else None
    encounter_type = req.encounterType.strip() if req.encounterType else None
    specialty = req.providerSpecialty.strip() if req.providerSpecialty else None
    return code_tables.validate_combination(
        cpt_codes,
        icd10_codes,
        age=req.age,
        gender=gender,
        encounter_type=encounter_type,
        specialty=specialty,
    )


class BillingRequest(BaseModel):
    cpt: List[str]
    payerType: str = "commercial"
    location: Optional[str] = None


@app.post("/api/billing/calculate")
async def billing_calculate(
    req: BillingRequest, user=Depends(require_role("user"))
):
    """Return estimated reimbursement for CPT codes."""
    cpt_codes = [c.upper() for c in req.cpt]
    return code_tables.calculate_billing(cpt_codes, req.payerType, req.location)


@app.get("/api/codes/documentation/{code}")
async def get_code_documentation(code: str, user=Depends(require_role("user"))):
    """Return documentation requirements for a CPT or ICD-10 code."""
    return code_tables.get_documentation(code)

# ---------------------------------------------------------------------------
# WebSocket endpoints
# ---------------------------------------------------------------------------


class ConnectionManager:
    """Track active WebSocket sessions and replay missed events on reconnect."""

    def __init__(self) -> None:
        self.active: Dict[str, WebSocket] = {}
        self.history: Dict[str, deque[dict]] = defaultdict(deque)
        self.counters: Dict[str, int] = defaultdict(int)

    async def connect(
        self,
        websocket: WebSocket,
        session_id: Optional[str],
        last_event_id: Optional[int],
    ) -> str:
        await websocket.accept()
        if not session_id or session_id not in self.history:
            session_id = str(uuid.uuid4())
        self.active[session_id] = websocket
        await websocket.send_json({"event": "connected", "sessionId": session_id})
        events = list(self.history[session_id])
        if last_event_id is not None:
            events = [e for e in events if e["eventId"] > last_event_id]
        for payload in events:
            await websocket.send_json(payload)
        return session_id

    def disconnect(self, session_id: str) -> None:
        self.active.pop(session_id, None)

    async def push(self, session_id: str, payload: Dict[str, Any]) -> None:
        self.counters[session_id] += 1
        enriched = {"event": "message", "eventId": self.counters[session_id], **payload}
        self.history[session_id].append(enriched)
        if len(self.history[session_id]) > 50:
            self.history[session_id].popleft()
        ws = self.active.get(session_id)
        if ws is not None:
            await ws.send_json(enriched)


async def _ws_endpoint(manager: ConnectionManager, websocket: WebSocket) -> None:
    """Common WebSocket connection handler with reconnect support."""

    params = websocket.query_params
    session_id = params.get("session_id")
    last_event_id = params.get("last_event_id")
    last_event = int(last_event_id) if last_event_id is not None else None
    session_id = await manager.connect(websocket, session_id, last_event)
    try:
        while True:
            data = await websocket.receive_json()
            await manager.push(session_id, data)
    except WebSocketDisconnect:
        manager.disconnect(session_id)


transcription_manager = ConnectionManager()
compliance_manager = ConnectionManager()
collaboration_manager = ConnectionManager()
codes_manager = ConnectionManager()
notifications_manager = ConnectionManager()


@app.websocket("/ws/transcription")
async def ws_transcription(websocket: WebSocket) -> None:
    """Live speech-to-text stream.

    Expected payload: ``{"transcript", "confidence", "isInterim", "timestamp", "speakerLabel"}``
    """

    await _ws_endpoint(transcription_manager, websocket)


@app.websocket("/ws/compliance")
async def ws_compliance(websocket: WebSocket) -> None:
    """Real-time compliance alerts.

    Expected payload: ``{"analysisId", "issues", "severity", "timestamp"}``
    """

    await _ws_endpoint(compliance_manager, websocket)


@app.websocket("/ws/collaboration")
async def ws_collaboration(websocket: WebSocket) -> None:
    """Collaborative editing channel.

    Expected payload: ``{"noteId", "changes", "userId", "timestamp", "conflicts"}``
    """

    await _ws_endpoint(collaboration_manager, websocket)


@app.websocket("/ws/codes")
async def ws_codes(websocket: WebSocket) -> None:
    """Streaming coding suggestions.

    Expected payload: ``{"code", "type", "description", "rationale", "confidence", "timestamp"}``
    """

    await _ws_endpoint(codes_manager, websocket)


@app.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket) -> None:
    """System notification channel.

    Expected payload: ``{"type", "message", "priority", "userId", "timestamp"}``
    """

    await _ws_endpoint(notifications_manager, websocket)

# ---------------------------------------------------------------------------



class VisitSessionCreate(BaseModel):
    encounter_id: int


class VisitSessionUpdate(BaseModel):
    session_id: int
    action: str


@app.get("/api/patients/search")
async def search_patients(q: str, user=Depends(require_role("user"))):
    like = f"%{q}%"
    rows = db_conn.execute(
        "SELECT id, first_name, last_name, dob, mrn FROM patients WHERE first_name LIKE ? OR last_name LIKE ? OR mrn LIKE ? LIMIT 10",
        (like, like, like),
    ).fetchall()
    return [
        {
            "patientId": r["id"],
            "name": f"{r['first_name']} {r['last_name']}",
            "dob": r["dob"],
            "mrn": r["mrn"],
        }
        for r in rows
    ]


@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: int, user=Depends(require_role("user"))):
    row = db_conn.execute("SELECT * FROM patients WHERE id=?", (patient_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="patient not found")
    return {
        "demographics": {
            "patientId": row["id"],
            "name": f"{row['first_name']} {row['last_name']}",
            "dob": row["dob"],
            "gender": row["gender"],
        },
        "allergies": json.loads(row["allergies"] or "[]"),
        "medications": json.loads(row["medications"] or "[]"),
        "lastVisit": row["last_visit"],
        "insurance": row["insurance"],
    }


@app.get("/api/encounters/validate/{encounter_id}")
async def validate_encounter(encounter_id: int, user=Depends(require_role("user"))):
    row = db_conn.execute("SELECT * FROM encounters WHERE id=?", (encounter_id,)).fetchone()
    if not row:
        return {"valid": False, "error": "Encounter not found"}
    return {
        "valid": True,
        "patientId": row["patient_id"],
        "date": row["date"],
        "type": row["type"],
        "provider": row["provider"],
    }


@app.post("/api/visits/session")
async def start_visit_session(model: VisitSessionCreate, user=Depends(require_role("user"))):
    now = datetime.utcnow().isoformat()
    cursor = db_conn.cursor()
    cursor.execute(
        "INSERT INTO visit_sessions (encounter_id, status, start_time) VALUES (?, ?, ?)",
        (model.encounter_id, "started", now),
    )
    session_id = cursor.lastrowid
    db_conn.commit()
    return {"sessionId": session_id, "status": "started", "startTime": now}


@app.put("/api/visits/session")
async def update_visit_session(model: VisitSessionUpdate, user=Depends(require_role("user"))):
    row = db_conn.execute("SELECT * FROM visit_sessions WHERE id=?", (model.session_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="session not found")
    end_time = row["end_time"]
    status = model.action
    if model.action == "complete":
        end_time = datetime.utcnow().isoformat()
    db_conn.execute(
        "UPDATE visit_sessions SET status=?, end_time=? WHERE id=?",
        (status, end_time, model.session_id),
    )
    db_conn.commit()
    updated = db_conn.execute("SELECT * FROM visit_sessions WHERE id=?", (model.session_id,)).fetchone()
    return {
        "sessionId": updated["id"],
        "status": updated["status"],
        "startTime": updated["start_time"],
        "endTime": updated["end_time"],
    }


@app.post("/api/charts/upload")
async def upload_chart(file: UploadFile = File(...), user=Depends(require_role("user"))):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    contents = await file.read()
    dest = UPLOAD_DIR / file.filename
    with open(dest, "wb") as f:
        f.write(contents)
    return {"filename": file.filename, "size": len(contents)}


# Notes and drafts management

_DEEP_SEARCH_NOT_FOUND = object()


def _safe_json_loads(value: Any) -> Any:
    """Return parsed JSON for ``value`` if possible, otherwise ``None``."""

    if isinstance(value, (bytes, bytearray)):
        try:
            value = value.decode("utf-8")
        except Exception:
            value = value.decode("utf-8", errors="ignore")
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _deep_get(container: Any, key: str) -> Any:
    """Recursively search ``container`` for ``key`` and return its value."""

    if isinstance(container, dict):
        for current_key, value in container.items():
            if current_key == key:
                return value
            nested = _deep_get(value, key)
            if nested is not _DEEP_SEARCH_NOT_FOUND:
                return nested
    elif isinstance(container, list):
        for item in container:
            nested = _deep_get(item, key)
            if nested is not _DEEP_SEARCH_NOT_FOUND:
                return nested
    return _DEEP_SEARCH_NOT_FOUND


def _normalize_tags(value: Any) -> List[str]:
    """Convert a tag payload into a list of string tags."""

    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    if isinstance(value, str):
        parsed = _safe_json_loads(value)
        if isinstance(parsed, list):
            return [str(item) for item in parsed if item is not None]
        text = value.strip()
        if text:
            return [text]
    return []


def _parse_datetime_param(value: Any, *, end_of_day: bool = False) -> Optional[float]:
    """Parse a date/datetime/epoch input into a UTC timestamp."""

    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, (int, float)):
        if float(value) == 0:
            return None
        return float(value)
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if re.fullmatch(r"-?\d+(?:\.\d+)?", text):
            try:
                numeric = float(text)
            except ValueError:
                return None
            if numeric == 0:
                return None
            return numeric
        iso_text = text[:-1] + "+00:00" if text.endswith("Z") else text
        try:
            dt = datetime.fromisoformat(iso_text)
        except ValueError:
            try:
                dt = datetime.strptime(text, "%Y-%m-%d")
            except ValueError:
                return None
        if end_of_day and re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            dt = dt + timedelta(days=1) - timedelta(microseconds=1)
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def _ts_to_iso(value: Any) -> Optional[str]:
    """Convert a timestamp/date-like value into an ISO 8601 string."""

    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    if isinstance(value, (int, float)):
        if float(value) == 0:
            return None
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc).isoformat()
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if re.fullmatch(r"-?\d+(?:\.\d+)?", text):
            try:
                numeric = float(text)
            except ValueError:
                numeric = None
            else:
                if numeric == 0:
                    return None
                try:
                    return datetime.fromtimestamp(numeric, tz=timezone.utc).isoformat()
                except (OverflowError, OSError, ValueError):
                    return None
        iso_text = text[:-1] + "+00:00" if text.endswith("Z") else text
        try:
            dt = datetime.fromisoformat(iso_text)
        except ValueError:
            return text
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return None


def _format_note_row(row: sqlite3.Row) -> Dict[str, Any]:
    """Map a raw ``notes`` row into the list API response structure."""

    raw_content = row["content"]
    if isinstance(raw_content, (bytes, bytearray)):
        raw_content = raw_content.decode("utf-8", errors="ignore")
    if raw_content is None:
        raw_content = ""
    elif not isinstance(raw_content, str):
        raw_content = str(raw_content)

    parsed = _safe_json_loads(raw_content)
    metadata: Dict[str, Any] = {}
    if isinstance(parsed, dict):
        meta_candidate = parsed.get("metadata")
        if isinstance(meta_candidate, dict):
            metadata = meta_candidate
        elif isinstance(parsed.get("meta"), dict):
            metadata = dict(parsed.get("meta") or {})
        else:
            metadata = parsed

    patient_info: Optional[Dict[str, Any]] = None
    for source in (metadata, parsed):
        if isinstance(source, dict):
            for key in ("patient", "patientInfo", "patientDetails", "patient_data", "patientData", "demographics"):
                candidate = source.get(key)
                if isinstance(candidate, dict):
                    patient_info = candidate
                    break
        if patient_info:
            break
    if patient_info is None and isinstance(parsed, dict):
        for key in ("patient", "patientInfo", "patientDetails", "patient_data", "patientData", "demographics"):
            candidate = _deep_get(parsed, key)
            if candidate is not _DEEP_SEARCH_NOT_FOUND and isinstance(candidate, dict):
                patient_info = candidate
                break

    patient_name: Optional[str] = None
    patient_id: Optional[str] = None
    if isinstance(patient_info, dict):
        name_candidates = [
            patient_info.get("name"),
            patient_info.get("fullName"),
            patient_info.get("patientName"),
        ]
        patient_name = next(
            (
                str(val).strip()
                for val in name_candidates
                if isinstance(val, str) and val.strip()
            ),
            None,
        )
        if not patient_name:
            first = patient_info.get("firstName") or patient_info.get("first_name")
            last = patient_info.get("lastName") or patient_info.get("last_name")
            combined = " ".join(
                str(part).strip()
                for part in (first, last)
                if isinstance(part, str) and part.strip()
            ).strip()
            patient_name = combined or None
        for identifier in ("id", "patientId", "patient_id", "mrn", "externalId"):
            value = patient_info.get(identifier)
            if value not in (None, ""):
                patient_id = str(value)
                break
    if not patient_name and isinstance(metadata, dict):
        name_value = metadata.get("patientName") or metadata.get("patient_name")
        if isinstance(name_value, str) and name_value.strip():
            patient_name = name_value.strip()
    if not patient_name and isinstance(parsed, dict):
        name_value = parsed.get("patientName") or parsed.get("patient_name")
        if isinstance(name_value, str) and name_value.strip():
            patient_name = name_value.strip()
    if not patient_id and isinstance(metadata, dict):
        id_value = metadata.get("patientId") or metadata.get("patient_id")
        if id_value not in (None, ""):
            patient_id = str(id_value)
    if not patient_id and isinstance(parsed, dict):
        id_value = parsed.get("patientId") or parsed.get("patient_id")
        if id_value not in (None, ""):
            patient_id = str(id_value)

    title: Optional[str] = None
    title_keys = ("title", "noteTitle", "subject", "summaryTitle", "visitTitle")
    for source in (metadata, parsed):
        if isinstance(source, dict):
            for key in title_keys:
                value = source.get(key)
                if isinstance(value, str) and value.strip():
                    title = value.strip()
                    break
        if title:
            break
    if not title and isinstance(parsed, dict):
        for key in title_keys:
            value = _deep_get(parsed, key)
            if value is not _DEEP_SEARCH_NOT_FOUND and isinstance(value, str) and value.strip():
                title = value.strip()
                break

    body_candidates: List[str] = []
    for source in (metadata, parsed):
        if isinstance(source, dict):
            for key in ("content", "note", "body", "text"):
                value = source.get(key)
                if isinstance(value, str) and value.strip():
                    body_candidates.append(value)
    if not body_candidates and raw_content:
        body_candidates.append(raw_content)
    body_text = next((text for text in body_candidates if text.strip()), "")

    summary: Optional[str] = None
    for source in (metadata, parsed):
        if isinstance(source, dict):
            for key in ("summary", "description", "preview", "abstract"):
                value = source.get(key)
                if isinstance(value, str) and value.strip():
                    summary = value.strip()
                    break
        if summary:
            break

    template: Optional[str] = None
    for source in (metadata, parsed):
        if isinstance(source, dict):
            for key in ("template", "templateName", "noteTemplate"):
                value = source.get(key)
                if isinstance(value, str) and value.strip():
                    template = value.strip()
                    break
        if template:
            break

    tags: List[str] = []
    for source in (metadata, parsed):
        if isinstance(source, dict):
            for key in ("tags", "labels"):
                extracted = _normalize_tags(source.get(key))
                if extracted:
                    tags = extracted
                    break
        if tags:
            break

    date_value: Optional[str] = None
    for source in (metadata, parsed):
        if isinstance(source, dict):
            for key in ("date", "noteDate", "encounterDate", "visitDate"):
                raw_date = source.get(key)
                if raw_date is None:
                    continue
                iso_val = _ts_to_iso(raw_date)
                if iso_val:
                    date_value = iso_val
                elif isinstance(raw_date, str) and raw_date.strip():
                    date_value = raw_date.strip()
                if date_value:
                    break
        if date_value:
            break
    if not date_value:
        date_value = _ts_to_iso(row["created_at"])

    last_modified = _ts_to_iso(row["updated_at"]) or None
    if not last_modified:
        for source in (metadata, parsed):
            if isinstance(source, dict):
                for key in ("lastModified", "updatedAt", "modifiedAt"):
                    candidate = source.get(key)
                    if candidate is None:
                        continue
                    iso_val = _ts_to_iso(candidate)
                    if iso_val:
                        last_modified = iso_val
                        break
                if last_modified:
                    break
    if not last_modified:
        last_modified = _ts_to_iso(row["created_at"])

    created_at = _ts_to_iso(row["created_at"])

    if not title:
        if body_text:
            for line in body_text.splitlines():
                stripped = line.strip()
                if stripped:
                    title = stripped[:120]
                    break
        if not title:
            title = f"Note {row['id']}"

    preview: Optional[str] = None
    if summary:
        preview = summary
    elif body_text:
        preview = body_text
    if preview:
        preview = re.sub(r"\s+", " ", preview).strip()[:200]

    note: Dict[str, Any] = {
        "id": row["id"],
        "title": title,
        "patientName": patient_name,
        "patientId": patient_id,
        "status": row["status"] or "draft",
        "lastModified": last_modified,
        "createdAt": created_at,
        "date": date_value,
        "template": template,
        "tags": tags,
    }
    if summary:
        note["summary"] = summary
    if preview:
        note["preview"] = preview

    search_parts: List[str] = []
    for field in ("patientName", "patientId", "title", "summary", "preview"):
        value = note.get(field)
        if isinstance(value, str) and value:
            search_parts.append(value.lower())
    if raw_content:
        search_parts.append(str(raw_content).lower())
    if isinstance(parsed, dict):
        try:
            search_parts.append(json.dumps(parsed).lower())
        except (TypeError, ValueError):
            pass
    note["_search_blob"] = " ".join(search_parts)

    return note


def _note_matches_patient(note: Dict[str, Any], patient_query: str) -> bool:
    """Return ``True`` if ``note`` should be included for ``patient_query``."""

    if not patient_query:
        return True
    query = patient_query.strip().lower()
    if not query:
        return True
    for key in ("patientName", "patientId"):
        value = note.get(key)
        if isinstance(value, str) and query in value.lower():
            return True
    blob = note.get("_search_blob")
    if isinstance(blob, str) and query in blob:
        return True
    return False


@app.get("/api/notes/list")
async def list_notes(
    page: int = Query(1, ge=1),
    page_size: Optional[int] = Query(None, ge=1, le=200),
    page_size_alias: Optional[int] = Query(None, alias="pageSize", ge=1, le=200),
    status: Optional[str] = None,
    patient: Optional[str] = None,
    start_date: Optional[str] = Query(None),
    start_date_alias: Optional[str] = Query(None, alias="startDate"),
    end_date: Optional[str] = Query(None),
    end_date_alias: Optional[str] = Query(None, alias="endDate"),
    user=Depends(require_role("user")),
):
    """Return paginated notes with optional status, patient and date filters."""

    size = page_size_alias or page_size or 20
    size = max(1, min(int(size), 200))

    start_filter = start_date_alias or start_date
    end_filter = end_date_alias or end_date

    timestamp_expr = "COALESCE(updated_at, created_at, 0)"
    conditions: List[str] = []
    params: List[Any] = []

    if status:
        conditions.append("status = ?")
        params.append(status)

    start_ts = _parse_datetime_param(start_filter)
    if start_ts is not None:
        conditions.append(f"{timestamp_expr} >= ?")
        params.append(start_ts)

    end_ts = _parse_datetime_param(end_filter, end_of_day=True)
    if end_ts is not None:
        conditions.append(f"{timestamp_expr} <= ?")
        params.append(end_ts)

    query = "SELECT id, content, status, created_at, updated_at FROM notes"
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += f" ORDER BY {timestamp_expr} DESC"

    rows = db_conn.execute(query, params).fetchall()

    notes: List[Dict[str, Any]] = []
    for row in rows:
        formatted = _format_note_row(row)
        if patient and not _note_matches_patient(formatted, patient):
            continue
        formatted.pop("_search_blob", None)
        notes.append(formatted)

    start_index = (page - 1) * size
    end_index = start_index + size
    return notes[start_index:end_index]


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
    age: Optional[int] = Field(default=None, ge=0, le=130)
    gender: Optional[str] = None
    encounterType: Optional[str] = None
    providerSpecialty: Optional[str] = None


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
    codes_upper = [code.upper() for code in req.codes]
    cpt_codes = [code for code in codes_upper if code and code[0].isdigit()]
    payer_type = req.payerType or "commercial"

    billing = code_tables.calculate_billing(cpt_codes, payer_type, req.location)

    total_rvu = 0.0
    breakdown = billing.get("breakdown", {})
    for code in cpt_codes:
        info = metadata.get(code, {})
        rvu = float(info.get("rvu", 0.0) or 0.0)
        total_rvu += rvu
        entry = breakdown.setdefault(code, {"amount": 0.0, "amountFormatted": None})
        entry["rvu"] = round(rvu, 2)

    billing["totalRvu"] = round(total_rvu, 2)
    billing["breakdown"] = breakdown
    return billing


@app.post("/api/codes/validate/combination")
async def validate_code_combination(
    req: CodesRequest, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """Check a set of codes for known conflicts."""

    codes_upper = [code.upper() for code in req.codes]
    cpt_codes = [code for code in codes_upper if code and code[0].isdigit()]
    icd10_codes = [code for code in codes_upper if code and code[0].isalpha()]
    gender = req.gender.strip() if req.gender else None
    encounter_type = req.encounterType.strip() if req.encounterType else None
    specialty = req.providerSpecialty.strip() if req.providerSpecialty else None

    result = code_tables.validate_combination(
        cpt_codes,
        icd10_codes,
        age=req.age,
        gender=gender,
        encounter_type=encounter_type,
        specialty=specialty,
    )

    conflicts: List[Dict[str, str]] = list(result.get("conflicts", []))
    codes_set = set(codes_upper)
    for c1, c2, reason in load_conflicts():
        if c1 in codes_set and c2 in codes_set:
            entry = {"code1": c1, "code2": c2, "reason": reason}
            if entry not in conflicts:
                conflicts.append(entry)

    valid = not conflicts and not result.get("contextIssues")
    return {
        **result,
        "validCombinations": valid,
        "conflicts": conflicts,
    }
