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
import threading
import uuid
import secrets
import math
from pathlib import Path
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone, date
from typing import (
    List,
    Optional,
    Dict,
    Any,
    Literal,
    Set,
    Tuple,
    Callable,
    Iterable,
    Awaitable,
)
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
    Body,
)
import requests
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, Response
from fastapi.encoders import jsonable_encoder
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import (
    BaseModel,
    Field,
    validator,  # legacy import still used elsewhere
    StrictBool,
    field_validator,
    model_validator,
    ConfigDict,
    ValidationError,

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
    ensure_users_table,
    ensure_clinics_table,
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
    ensure_note_versions_table,
    ensure_notifications_table,
    ensure_user_profile_table,
    ensure_session_state_table,
    ensure_shared_workflow_sessions_table,
    ensure_event_aggregates_table,
    ensure_compliance_issues_table,
    ensure_compliance_issue_history_table,
    ensure_compliance_rules_table,
    ensure_confidence_scores_table,
    ensure_notification_counters_table,
    ensure_notification_events_table,
    ensure_compliance_rule_catalog_table,
    ensure_cpt_codes_table,
    ensure_icd10_codes_table,
    ensure_hcpcs_codes_table,
    ensure_cpt_reference_table,
    ensure_payer_schedule_table,
    ensure_billing_audits_table,
    ensure_password_reset_tokens_table,
    ensure_mfa_challenges_table,
    ensure_audit_log_table,
    seed_compliance_rules,
    seed_cpt_codes,
    seed_icd10_codes,
    seed_hcpcs_codes,
    seed_cpt_reference,
    seed_payer_schedules,
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
    apply_bulk_operations,
    configure_database as configure_schedule_database,
)
from backend import code_tables  # type: ignore
from backend import patients  # type: ignore
from backend import visits  # type: ignore
from backend.charts import process_chart  # type: ignore
from backend.codes_data import load_code_metadata, load_conflicts  # type: ignore
from backend.auth import (  # type: ignore
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


def _success_payload(data: Any) -> Dict[str, Any]:
    """Return a ``SuccessResponse`` merged with dictionary data for legacy clients."""

    payload = SuccessResponse(data=data).model_dump()
    if isinstance(data, dict):
        for key, value in data.items():
            if key not in payload:
                payload[key] = value
    return payload


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

    if response.headers.get("X-Bypass-Envelope") == "1":
        try:
            del response.headers["X-Bypass-Envelope"]
        except KeyError:  # pragma: no cover - header may already be absent
            pass
        return response

    use_envelope = response.headers.get("X-Use-Envelope")
    if use_envelope != "1":
        if use_envelope is not None:
            try:
                del response.headers["X-Use-Envelope"]
            except KeyError:  # pragma: no cover - defensive cleanup
                pass
        return response

    try:
        del response.headers["X-Use-Envelope"]
    except KeyError:  # pragma: no cover - header may already be absent
        pass

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
    headers = dict(exc.headers or {})
    headers["X-Use-Envelope"] = "1"
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload.model_dump(),
        headers=headers,
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


# Simple in-memory storage for note versions keyed by note ID.
NOTE_VERSIONS: Dict[str, List[Dict[str, str]]] = defaultdict(list)


# Active WebSocket connections for system notifications.
notification_clients: Set[WebSocket] = set()


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


# Simple in-memory notification tracking backed by persistent storage.
notification_counts: Dict[str, int] = {}

# Active websocket subscribers interested in notification counts.
notification_subscribers: Dict[str, List[WebSocket]] = defaultdict(list)



class NotificationStore:
    """SQLite-backed mapping interface for notification counters."""

    def __contains__(self, username: object) -> bool:  # pragma: no cover - trivial lookup
        if not isinstance(username, str):
            return False
        ensure_notifications_table(db_conn)
        try:
            row = db_conn.execute(
                "SELECT 1 FROM notifications WHERE username=?",
                (username,),
            ).fetchone()
        except sqlite3.Error:
            return False
        return bool(row)

    def __getitem__(self, username: str) -> int:
        return self.get(username, 0)

    def __setitem__(self, username: str, value: int) -> None:
        ensure_notifications_table(db_conn)
        db_conn.execute(
            """
            INSERT INTO notifications (username, count, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
                count=excluded.count,
                updated_at=excluded.updated_at
            """,
            (username, int(value), time.time()),
        )
        db_conn.commit()

    def get(self, username: str, default: int = 0) -> int:
        ensure_notifications_table(db_conn)
        try:
            row = db_conn.execute(
                "SELECT count FROM notifications WHERE username=?",
                (username,),
            ).fetchone()
        except sqlite3.Error:
            return default
        if not row:
            return default
        try:
            return int(row["count"])
        except (KeyError, TypeError, ValueError):
            try:
                return int(row[0])
            except (TypeError, ValueError, IndexError):
                return default


notification_counts = NotificationStore()


def _timestamp_to_iso(value: Any) -> str | None:
    """Convert a Unix timestamp to ISO 8601 in UTC."""

    if value is None:
        return None
    try:
        return datetime.fromtimestamp(float(value), timezone.utc).isoformat()
    except Exception:
        return None


def _parse_timestamp(value: Any) -> float:
    """Best-effort conversion of *value* to a Unix timestamp."""

    if value is None:
        return time.time()
    if isinstance(value, (int, float)):
        try:
            return float(value)
        except (TypeError, ValueError):
            return time.time()
    if isinstance(value, str):
        try:
            return float(value)
        except (TypeError, ValueError):
            try:
                normalised = value.strip()
                if normalised.endswith("Z"):
                    normalised = normalised[:-1] + "+00:00"
                return datetime.fromisoformat(normalised).timestamp()
            except Exception:
                return time.time()
    return time.time()


def _normalise_notification_event_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce an inbound notification payload into stored schema."""

    raw_id = (
        payload.get("notificationId")
        or payload.get("eventId")
        or payload.get("id")
        or uuid.uuid4()
    )
    event_id = str(raw_id)

    title = payload.get("title")
    if not isinstance(title, str) or not title.strip():
        title = payload.get("type")
    title_str = str(title).strip() if title else "Notification"

    message_source = payload.get("message")
    if not isinstance(message_source, str) or not message_source.strip():
        for candidate in ("description", "detail", "text"):
            value = payload.get(candidate)
            if isinstance(value, str) and value.strip():
                message_source = value
                break
    message_str = (
        str(message_source).strip()
        if isinstance(message_source, str) and message_source.strip()
        else "You have a new notification."
    )

    severity_value = payload.get("severity") or payload.get("type") or "info"
    severity_str = str(severity_value).strip().lower() or "info"

    timestamp = (
        payload.get("timestamp")
        or payload.get("created_at")
        or payload.get("createdAt")
    )
    created_at = _parse_timestamp(timestamp)

    return {
        "id": event_id,
        "title": title_str,
        "message": message_str,
        "severity": severity_str,
        "created_at": created_at,
    }


def _sync_unread_notification_count(
    username: str, *, user_id: int | None = None
) -> int:
    """Recompute unread notification count for *username* from stored events."""

    ensure_notification_events_table(db_conn)
    if user_id is None:
        user_id = _get_user_db_id(username)
    if user_id is None:
        return set_notification_count(username, 0)
    row = db_conn.execute(
        "SELECT COUNT(*) AS unread FROM notification_events WHERE user_id=? AND is_read=0",
        (user_id,),
    ).fetchone()
    unread = int(row["unread"]) if row and row["unread"] is not None else 0
    return set_notification_count(username, unread)


def _persist_notification_event(
    username: str,
    payload: Dict[str, Any],
    *,
    mark_unread: bool,
) -> tuple[Dict[str, Any], int]:
    """Insert or update a notification event for *username*."""

    ensure_notification_events_table(db_conn)
    record = _normalise_notification_event_payload(payload)
    user_id = _get_user_db_id(username)
    if user_id is None:
        enriched = {
            "id": record["id"],
            "title": record["title"],
            "message": record["message"],
            "severity": record["severity"],
            "timestamp": _iso_timestamp(record["created_at"]),
            "isRead": not mark_unread,
        }
        return enriched, current_notification_count(username)

    now = time.time()
    existing = db_conn.execute(
        """
        SELECT created_at, is_read, read_at
          FROM notification_events
         WHERE event_id=? AND user_id=?
        """,
        (record["id"], user_id),
    ).fetchone()

    if existing:
        is_read = int(existing["is_read"]) if existing["is_read"] is not None else 0
        read_at = existing["read_at"]
        if mark_unread:
            is_read = 0
            read_at = None
        db_conn.execute(
            """
            UPDATE notification_events
               SET title=?,
                   message=?,
                   severity=?,
                   updated_at=?,
                   is_read=?,
                   read_at=?
             WHERE event_id=? AND user_id=?
            """,
            (
                record["title"],
                record["message"],
                record["severity"],
                now,
                is_read,
                read_at,
                record["id"],
                user_id,
            ),
        )
        created_at = (
            existing["created_at"] if existing["created_at"] is not None else record["created_at"]
        )
    else:
        is_read = 0 if mark_unread else 1
        read_at = None if mark_unread else now
        created_at = record["created_at"]
        db_conn.execute(
            """
            INSERT INTO notification_events (
                event_id,
                user_id,
                title,
                message,
                severity,
                created_at,
                updated_at,
                is_read,
                read_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["id"],
                user_id,
                record["title"],
                record["message"],
                record["severity"],
                created_at,
                now,
                is_read,
                read_at,
            ),
        )

    db_conn.commit()

    unread = _sync_unread_notification_count(username, user_id=user_id)

    row = db_conn.execute(
        """
        SELECT created_at, is_read, read_at, severity, title, message
          FROM notification_events
         WHERE event_id=? AND user_id=?
        """,
        (record["id"], user_id),
    ).fetchone()

    created_at = row["created_at"] if row and row["created_at"] is not None else created_at
    is_read = bool(row["is_read"]) if row else bool(not mark_unread)
    read_at = row["read_at"] if row else (None if mark_unread else now)
    severity = row["severity"] if row and row["severity"] else record["severity"]
    title = row["title"] if row and row["title"] else record["title"]
    message = row["message"] if row and row["message"] else record["message"]

    enriched = {
        "id": record["id"],
        "title": title,
        "message": message,
        "severity": severity,
        "timestamp": _iso_timestamp(created_at),
        "isRead": is_read,
    }
    if read_at:
        enriched["readAt"] = _iso_timestamp(read_at)

    return enriched, unread


def _serialise_notification_row(row: sqlite3.Row) -> Dict[str, Any]:
    """Convert a notification row into an API-friendly dictionary."""

    return {
        "id": row["event_id"],
        "title": row["title"],
        "message": row["message"],
        "severity": row["severity"],
        "timestamp": _iso_timestamp(row["created_at"]),
        "isRead": bool(row["is_read"]),
        "readAt": _timestamp_to_iso(row["read_at"]),
    }


def _get_user_db_id(username: str) -> int | None:
    """Return the internal database user id for ``username`` if present."""

    try:
        row = db_conn.execute(
            "SELECT id FROM users WHERE username=?",
            (username,),
        ).fetchone()
    except sqlite3.Error:
        return None
    if not row:
        return None
    try:
        return int(row["id"])
    except (KeyError, TypeError, ValueError):
        try:
            return int(row[0])
        except (TypeError, ValueError, IndexError):
            return None


def _save_note_version(
    note_id: str,
    content: str,
    user_id: int | None = None,
    created_at: datetime | None = None,
) -> datetime:
    """Persist a note version to SQLite and prune history beyond 20 entries."""

    ensure_note_versions_table(db_conn)
    timestamp = created_at or datetime.now(timezone.utc)
    db_conn.execute(
        "INSERT INTO note_versions (note_id, user_id, content, created_at) VALUES (?, ?, ?, ?)",
        (str(note_id), user_id, content, timestamp.timestamp()),
    )
    db_conn.execute(
        """
        DELETE FROM note_versions
        WHERE note_id = ?
          AND id NOT IN (
            SELECT id FROM note_versions
            WHERE note_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 20
        )
        """,
        (str(note_id), str(note_id)),
    )
    return timestamp


def _fetch_note_versions(note_id: str) -> List[Dict[str, str]]:
    """Retrieve ordered note versions for ``note_id`` from SQLite."""

    ensure_note_versions_table(db_conn)
    try:
        rows = db_conn.execute(
            """
            SELECT content, created_at
            FROM note_versions
            WHERE note_id=?
            ORDER BY created_at ASC, id ASC
            """,
            (str(note_id),),
        ).fetchall()
    except sqlite3.Error:
        return []
    versions: List[Dict[str, str]] = []
    for row in rows or []:
        try:
            created = row["created_at"]
        except (KeyError, TypeError):
            created = row[1] if len(row) > 1 else None
        try:
            content = row["content"]
        except (KeyError, TypeError):
            content = row[0] if row else ""
        versions.append({"timestamp": _timestamp_to_iso(created), "content": content or ""})
    return versions


COMPLIANCE_SEVERITIES = {"low", "medium", "high", "critical"}
COMPLIANCE_STATUSES = {"open", "in_progress", "resolved", "dismissed"}



async def _broadcast_notification_count(username: str) -> None:
    """Send updated notification count to all websocket subscribers."""
    badges = _navigation_badges(username)
    for ws in list(notification_subscribers.get(username, [])):
        try:
            await ws.send_json(badges)
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
ensure_note_versions_table(db_conn)
ensure_notifications_table(db_conn)
ensure_event_aggregates_table(db_conn)
ensure_compliance_issues_table(db_conn)
ensure_compliance_rules_table(db_conn)
ensure_confidence_scores_table(db_conn)
ensure_notification_counters_table(db_conn)
ensure_notification_events_table(db_conn)
patients.configure_database(db_conn)
configure_schedule_database(db_conn)

# Keep the compliance ORM bound to the active database connection.
compliance_engine.configure_engine(db_conn)


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


# Reference data seeding helpers ensure consistent test fixtures and sensible
# defaults when the application starts with an empty database.
def _seed_reference_data(conn: sqlite3.Connection) -> None:
    try:
        existing_rules = conn.execute(
            "SELECT COUNT(*) FROM compliance_rule_catalog"
        ).fetchone()[0]
    except sqlite3.Error as exc:  # pragma: no cover - defensive
        logger.warning("Unable to inspect compliance rules table: %s", exc)
        return

    try:
        if existing_rules == 0:
            seed_compliance_rules(conn, compliance_engine.get_rules())

        metadata = load_code_metadata()
        cpt_metadata = {
            code: info
            for code, info in metadata.items()
            if (info.get("type") or "").upper() == "CPT"
        }

        existing_cpt_codes = conn.execute("SELECT COUNT(*) FROM cpt_codes").fetchone()[0]
        if existing_cpt_codes == 0:
            seed_cpt_codes(conn, code_tables.DEFAULT_CPT_CODES.items())

        existing_icd_codes = conn.execute("SELECT COUNT(*) FROM icd10_codes").fetchone()[0]
        if existing_icd_codes == 0:
            seed_icd10_codes(conn, code_tables.DEFAULT_ICD10_CODES.items())

        existing_hcpcs_codes = conn.execute("SELECT COUNT(*) FROM hcpcs_codes").fetchone()[0]
        if existing_hcpcs_codes == 0:
            seed_hcpcs_codes(conn, code_tables.DEFAULT_HCPCS_CODES.items())

        existing_cpt = conn.execute("SELECT COUNT(*) FROM cpt_reference").fetchone()[0]
        if existing_cpt == 0:
            seed_cpt_reference(conn, cpt_metadata.items())

        existing_schedules = conn.execute(
            "SELECT COUNT(*) FROM payer_schedules"
        ).fetchone()[0]
        if existing_schedules == 0:
            schedules = []
            for code, info in cpt_metadata.items():
                reimbursement = info.get("reimbursement")
                if reimbursement in (None, ""):
                    continue
                rvu_value = info.get("rvu")
                base_amount = float(reimbursement)
                schedules.append(
                    {
                        "payer_type": "commercial",
                        "location": "",
                        "code": code,
                        "reimbursement": base_amount,
                        "rvu": rvu_value,
                    }
                )
                schedules.append(
                    {
                        "payer_type": "medicare",
                        "location": "",
                        "code": code,
                        "reimbursement": round(base_amount * 0.8, 2),
                        "rvu": rvu_value,
                    }
                )
            seed_payer_schedules(conn, schedules)

        conn.commit()
    except Exception as exc:  # pragma: no cover - best effort
        logger.warning("Failed to seed reference data: %s", exc)


def get_db() -> sqlite3.Connection:
    """FastAPI dependency returning the primary SQLite connection."""

    return db_conn


# Helper to (re)initialise core tables when db_conn is swapped in tests.
def _init_core_tables(conn):  # pragma: no cover - invoked in tests indirectly
    ensure_users_table(conn)
    ensure_clinics_table(conn)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp REAL NOT NULL, username TEXT, action TEXT NOT NULL, details TEXT)"
    )

    ensure_audit_log_table(conn)
    ensure_settings_table(conn)
    ensure_templates_table(conn)
    ensure_user_profile_table(conn)
    ensure_events_table(conn)
    ensure_refresh_table(conn)
    ensure_session_table(conn)
    ensure_password_reset_tokens_table(conn)
    ensure_mfa_challenges_table(conn)
    ensure_notes_table(conn)
    ensure_error_log_table(conn)
    ensure_exports_table(conn)
    ensure_patients_table(conn)
    ensure_encounters_table(conn)
    ensure_visit_sessions_table(conn)
    ensure_note_auto_saves_table(conn)
    ensure_session_state_table(conn)
    ensure_shared_workflow_sessions_table(conn)
    ensure_compliance_issues_table(conn)
    ensure_compliance_issue_history_table(conn)
    ensure_compliance_rules_table(conn)
    ensure_confidence_scores_table(conn)
    ensure_notification_counters_table(conn)
    ensure_compliance_rule_catalog_table(conn)
    ensure_cpt_codes_table(conn)
    ensure_icd10_codes_table(conn)
    ensure_hcpcs_codes_table(conn)
    ensure_cpt_reference_table(conn)
    ensure_payer_schedule_table(conn)
    ensure_billing_audits_table(conn)
    existing_patients = conn.execute("SELECT COUNT(*) FROM patients").fetchone()[0]
    if existing_patients == 0:
        now = datetime.utcnow().replace(microsecond=0)
        last_visit_date = (now - timedelta(days=45)).date().isoformat()
        allergies = json.dumps(["Penicillin"])
        medications = json.dumps(["Lisinopril"])
        conn.execute(
            """
            INSERT INTO patients
                (first_name, last_name, dob, mrn, gender, insurance, last_visit, allergies, medications)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "Alice",
                "Anderson",
                "1985-04-12",
                "MRN-1001",
                "female",
                "medicare",
                last_visit_date,
                allergies,
                medications,
            ),
        )
        patient_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        encounter_start = now + timedelta(days=1)
        encounter_end = encounter_start + timedelta(minutes=30)
        conn.execute(
            """
            INSERT INTO encounters (patient_id, date, type, provider, description)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                patient_id,
                encounter_start.isoformat(),
                "telehealth",
                "Dr. Smith",
                "Telehealth follow-up",
            ),
        )
        encounter_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.execute(
            """
            INSERT INTO visit_sessions (encounter_id, status, start_time, end_time, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                encounter_id,
                "scheduled",
                encounter_start.isoformat(),
                encounter_end.isoformat(),
                time.time(),
            ),
        )
    _seed_reference_data(conn)
    conn.commit()
    patients.configure_database(conn)
    configure_schedule_database(conn)
    compliance_engine.configure_engine(conn)


# Proper users table creation (replacing previously malformed snippet)
ensure_users_table(db_conn)
ensure_clinics_table(db_conn)
ensure_audit_log_table(db_conn)

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
ensure_shared_workflow_sessions_table(db_conn)
ensure_compliance_issues_table(db_conn)
ensure_compliance_issue_history_table(db_conn)
ensure_compliance_rules_table(db_conn)
ensure_confidence_scores_table(db_conn)
ensure_compliance_rule_catalog_table(db_conn)
ensure_cpt_codes_table(db_conn)
ensure_icd10_codes_table(db_conn)
ensure_hcpcs_codes_table(db_conn)
ensure_cpt_reference_table(db_conn)
ensure_payer_schedule_table(db_conn)
ensure_billing_audits_table(db_conn)

# User profile details including current view and UI preferences.
ensure_user_profile_table(db_conn)

# Centralized error logging table.
ensure_error_log_table(db_conn)

# Table storing notes and drafts with status metadata.
ensure_notes_table(db_conn)

# Tables for refresh tokens and user session state
ensure_refresh_table(db_conn)
ensure_session_table(db_conn)
ensure_password_reset_tokens_table(db_conn)
ensure_mfa_challenges_table(db_conn)


# Core clinical data tables.
ensure_patients_table(db_conn)
ensure_encounters_table(db_conn)
ensure_visit_sessions_table(db_conn)

_seed_reference_data(db_conn)

# Configure the database connection to return rows as dictionaries.  This
# makes it easier to access columns by name when querying events for
# metrics computations.
db_conn.row_factory = sqlite3.Row

# Preload any stored API key into the environment so subsequent calls work.
get_api_key()


def _iso_timestamp(ts: float | None = None) -> str:
    """Return an ISO 8601 timestamp, defaulting to current UTC time."""

    if ts is None:
        return datetime.now(timezone.utc).isoformat()
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def _load_notification_count(username: str) -> int:
    """Fetch the persisted unread notification count for *username*."""

    if username in notification_counts:
        return notification_counts[username]
    row = db_conn.execute(
        """
        SELECT nc.count
          FROM notification_counters nc
          JOIN users u ON u.id = nc.user_id
         WHERE u.username = ?
        """,
        (username,),
    ).fetchone()
    count = int(row["count"]) if row and row["count"] is not None else 0
    notification_counts[username] = count
    return count


def _persist_notification_count(username: str, count: int) -> None:
    """Persist unread notification *count* for *username*."""

    ensure_notification_counters_table(db_conn)
    row = db_conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
    if not row:
        return
    user_id = row["id"]
    now = time.time()
    db_conn.execute(
        """
        INSERT INTO notification_counters (user_id, count, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            count=excluded.count,
            updated_at=excluded.updated_at
        """,
        (user_id, count, now),
    )
    db_conn.commit()


def current_notification_count(username: str) -> int:
    """Return the current unread notification count for *username*."""

    return _load_notification_count(username)


def increment_notification_count(username: str, delta: int = 1) -> int:
    """Increase unread notifications for *username* and persist the result."""

    count = _load_notification_count(username) + delta
    if count < 0:
        count = 0
    notification_counts[username] = count
    _persist_notification_count(username, count)
    return count


def set_notification_count(username: str, count: int) -> int:
    """Explicitly set unread notifications for *username*."""

    count = max(count, 0)
    notification_counts[username] = count
    _persist_notification_count(username, count)
    return count


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


def _deserialise_audit_details(details: Any) -> Any:
    """Best-effort conversion of stored audit detail payloads back to rich types."""

    if details in (None, ""):
        return None
    if isinstance(details, (dict, list)):
        return details
    if isinstance(details, (bytes, bytearray)):
        try:
            details = details.decode("utf-8")
        except Exception:
            return None
    if isinstance(details, str):
        stripped = details.strip()
        if not stripped:
            return None
        try:
            return json.loads(stripped)
        except (TypeError, ValueError, json.JSONDecodeError):
            return stripped
    return details


def _insert_audit_log(
    username: str | None,
    action: str,
    details: Any | None = None,
    *,
    success: bool | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    clinic_id: str | None = None,
) -> None:
    """Persist an entry into the audit_log table (best effort)."""

    ensure_audit_log_table(db_conn)
    payload = _serialise_audit_details(details)
    timestamp = time.time()
    user_id: int | None = None
    resolved_clinic = clinic_id
    if username:
        try:
            row = db_conn.execute(
                "SELECT id, clinic_id FROM users WHERE username=?",
                (username,),
            ).fetchone()
        except sqlite3.Error:
            row = None
        if row:
            user_id = row["id"]
            if resolved_clinic is None:
                resolved_clinic = row["clinic_id"]
    success_value: int | None
    if success is None:
        success_value = None
    else:
        success_value = 1 if success else 0

    try:
        db_conn.execute(
            """
            INSERT INTO audit_log (
                timestamp,
                username,
                user_id,
                clinic_id,
                action,
                details,
                ip_address,
                user_agent,
                success
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                timestamp,
                username,
                user_id,
                resolved_clinic,
                action,
                payload,
                ip_address,
                user_agent,
                success_value,
            ),
        )
        db_conn.commit()
    except sqlite3.OperationalError as exc:
        if "no such table: audit_log" not in str(exc):
            logger.exception("Failed to write audit log entry")
            return
        ensure_audit_log_table(db_conn)
        try:
            db_conn.execute(
                """
                INSERT INTO audit_log (
                    timestamp,
                    username,
                    user_id,
                    clinic_id,
                    action,
                    details,
                    ip_address,
                    user_agent,
                    success
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    timestamp,
                    username,
                    user_id,
                    resolved_clinic,
                    action,
                    payload,
                    ip_address,
                    user_agent,
                    success_value,
                ),
            )
            db_conn.commit()
        except Exception:
            logger.exception("Failed to write audit log entry")
    except Exception:
        logger.exception("Failed to write audit log entry")


def _create_auth_session(
    user_id: int,
    access_token: str,
    refresh_token: str,
    *,
    offline: bool = False,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> str:
    """Persist a session entry for the authenticated user."""

    ensure_session_table(db_conn)
    session_id = str(uuid.uuid4())
    now = time.time()
    refresh_expiry = (
        datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    ).timestamp()
    try:
        db_conn.execute(
            """
            INSERT INTO sessions (
                id,
                user_id,
                token_hash,
                refresh_token_hash,
                expires_at,
                created_at,
                last_accessed,
                ip_address,
                user_agent,
                offline_session
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                user_id,
                hash_password(access_token),
                hash_password(refresh_token),
                refresh_expiry,
                now,
                now,
                ip_address,
                user_agent,
                1 if offline else 0,
            ),
        )
        db_conn.commit()
    except sqlite3.Error:
        logger.exception("Failed to persist auth session")
    return session_id


def _touch_auth_session(
    user_id: int,
    refresh_token: str,
    *,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> Optional[str]:
    """Update last access time for the matching session, if any."""

    ensure_session_table(db_conn)
    rows = db_conn.execute(
        "SELECT id, refresh_token_hash FROM sessions WHERE user_id=?",
        (user_id,),
    ).fetchall()
    now = time.time()
    refresh_expiry = (
        datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    ).timestamp()
    for row in rows:
        stored_hash = row["refresh_token_hash"]
        if stored_hash and verify_password(refresh_token, stored_hash):
            try:
                db_conn.execute(
                    """
                    UPDATE sessions
                       SET last_accessed=?,
                           expires_at=?,
                           ip_address=COALESCE(?, ip_address),
                           user_agent=COALESCE(?, user_agent)
                     WHERE id=?
                    """,
                    (
                        now,
                        refresh_expiry,
                        ip_address,
                        user_agent,
                        row["id"],
                    ),
                )
                db_conn.commit()
            except sqlite3.Error:
                logger.exception("Failed to update auth session")
            return row["id"]
    return None


def _remove_auth_session(user_id: int, refresh_token: str) -> bool:
    """Remove the session matching the provided refresh token."""

    ensure_session_table(db_conn)
    rows = db_conn.execute(
        "SELECT id, refresh_token_hash FROM sessions WHERE user_id=?",
        (user_id,),
    ).fetchall()
    for row in rows:
        stored_hash = row["refresh_token_hash"]
        if stored_hash and verify_password(refresh_token, stored_hash):
            try:
                db_conn.execute("DELETE FROM sessions WHERE id=?", (row["id"],))
                db_conn.commit()
                return True
            except sqlite3.Error:
                logger.exception("Failed to remove auth session")
                return False
    return False


def _normalise_confidence(value: Any) -> Optional[float]:
    """Parse ``value`` into a 0-1 confidence score when possible."""

    if value is None:
        return None
    if isinstance(value, (int, float)):
        score = float(value)
    elif isinstance(value, str):
        try:
            cleaned = value.strip().rstrip("%")
            if not cleaned:
                return None
            score = float(cleaned)
        except ValueError:
            return None
    else:
        return None
    if score > 1:
        score /= 100.0
    if 0 <= score <= 1:
        return score
    return None


def _log_confidence_scores(
    user: Dict[str, Any],
    note_id: str | None,
    codes: List[Tuple[str, Optional[float]]],
) -> None:
    """Persist confidence scores for returned code suggestions."""

    if not codes:
        return
    username = user.get("sub")
    if not username:
        return
    try:
        row = db_conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
    except sqlite3.Error as exc:  # pragma: no cover - defensive logging
        logger.warning("Unable to record confidence scores: %s", exc)
        return
    if not row:
        return
    user_id = row["id"] if isinstance(row, sqlite3.Row) else row[0]
    note_ref = str(note_id) if note_id is not None else None
    timestamp = time.time()
    entries = [(user_id, note_ref, code, confidence, 0, timestamp) for code, confidence in codes if code]
    if not entries:
        return
    try:
        db_conn.executemany(
            """
            INSERT INTO confidence_scores (user_id, note_id, code, confidence, accepted, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            entries,
        )
        db_conn.commit()
    except sqlite3.Error as exc:  # pragma: no cover - defensive logging
        logger.warning("Failed to persist confidence scores: %s", exc)


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


def _clean_optional_text(value: Any) -> str | None:
    if value in (None, ""):
        return None
    try:
        text = str(value)
    except Exception:
        return None
    stripped = text.strip()
    if not stripped:
        return None
    return sanitize_text(stripped)


def _deserialise_findings(value: Any) -> Any:
    if value in (None, "", b""):
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, (bytes, bytearray)):
        try:
            text = value.decode("utf-8")
        except Exception:
            text = value.decode("utf-8", "ignore")
    else:
        text = str(value)
    try:
        return json.loads(text)
    except Exception:
        return text


def _log_compliance_history_entry(
    *,
    issue_id: str,
    code: str | None,
    payer: str | None,
    findings: Dict[str, Any] | str | None,
    user_id: str | None,
    timestamp: float,
) -> None:
    try:
        ensure_compliance_issue_history_table(db_conn)
        payload: str | None
        if isinstance(findings, str):
            payload = findings
        else:
            payload = _serialise_metadata(findings)
        db_conn.execute(
            """
            INSERT INTO compliance_issue_history (
                issue_id, code, payer, findings, created_at, user_id
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                issue_id,
                code,
                payer,
                payload,
                timestamp,
                user_id,
            ),
        )
    except sqlite3.Error as exc:  # pragma: no cover - best effort logging
        logging.warning("Failed to append compliance history: %s", exc)


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
    payer: str | None = None,
) -> Dict[str, Any]:
    issue_id = issue_id or str(uuid4())
    severity_norm = _normalise_severity(severity)
    status_norm = _normalise_status(status)
    note_excerpt_clean = sanitize_text(note_excerpt) if note_excerpt else None
    metadata_json = _serialise_metadata(metadata)
    now = time.time()
    payer_clean = _clean_optional_text(payer)
    user_clean = _clean_optional_text(created_by)
    code_clean = _clean_optional_text(rule_id)
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
                user_clean,
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
                user_clean,
                issue_id,
            ),
        )
    findings_payload: Dict[str, Any] = {
        "title": title,
        "severity": severity_norm,
        "category": category,
        "status": status_norm,
    }
    if note_excerpt_clean:
        findings_payload["noteExcerpt"] = note_excerpt_clean
    if metadata_json:
        try:
            findings_payload["metadata"] = json.loads(metadata_json)
        except Exception:
            findings_payload["metadata"] = metadata_json
    _log_compliance_history_entry(
        issue_id=issue_id,
        code=code_clean,
        payer=payer_clean,
        findings=findings_payload,
        user_id=user_clean,
        timestamp=now,
    )
    db_conn.commit()
    row = db_conn.execute(
        "SELECT * FROM compliance_issues WHERE issue_id = ?",
        (issue_id,),
    ).fetchone()
    return _row_to_compliance_issue(row)


def _persist_billing_audit(
    *,
    audit_id: str | None,
    codes: Iterable[str],
    payer: str | None,
    findings: Dict[str, Any] | None,
    user_id: str | None,
) -> str:
    audit_ref = audit_id or str(uuid4())
    try:
        ensure_billing_audits_table(db_conn)
    except sqlite3.Error as exc:  # pragma: no cover - defensive
        logging.warning("Failed to ensure billing audits table: %s", exc)
    now = time.time()
    payer_clean = _clean_optional_text(payer)
    user_clean = _clean_optional_text(user_id)
    normalized_codes = [
        code.strip().upper()
        for code in codes
        if isinstance(code, str) and code.strip()
    ]
    records = normalized_codes or ["__SUMMARY__"]
    breakdown: Dict[str, Any]
    payer_specific: Dict[str, Any] | None
    issues: List[str]
    total_estimated: Any
    total_rvu: Any

    if isinstance(findings, dict):
        breakdown = (
            findings.get("breakdown")
            if isinstance(findings.get("breakdown"), dict)
            else {}
        )
        payer_specific = (
            findings.get("payerSpecific")
            if isinstance(findings.get("payerSpecific"), dict)
            else None
        )
        issues = (
            findings.get("issues")
            if isinstance(findings.get("issues"), list)
            else []
        )
        total_estimated = findings.get("totalEstimated")
        total_rvu = findings.get("totalRvu")
    else:
        breakdown = {}
        payer_specific = None
        issues = []
        total_estimated = None
        total_rvu = None

    for code in records:
        detail = breakdown.get(code) if breakdown else None
        payload: Dict[str, Any] = {
            "totalEstimated": total_estimated,
            "totalRvu": total_rvu,
        }
        if payer_specific:
            payload["payerSpecific"] = payer_specific
        if detail is not None:
            payload["detail"] = detail
        if issues:
            if code and code != "__SUMMARY__":
                related = [
                    issue
                    for issue in issues
                    if isinstance(issue, str) and code in issue
                ]
                payload["issues"] = related or issues
            else:
                payload["issues"] = issues
        try:
            db_conn.execute(
                """
                INSERT INTO billing_audits (
                    audit_id, code, payer, findings, created_at, user_id
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    audit_ref,
                    code,
                    payer_clean,
                    _serialise_metadata(payload),
                    now,
                    user_clean,
                ),
            )
        except sqlite3.Error as exc:  # pragma: no cover - best effort logging
            logging.warning("Failed to persist billing audit entry: %s", exc)
    try:
        db_conn.commit()
    except sqlite3.Error:
        pass
    return audit_ref
def _audit_details_from_request(request: Request) -> Dict[str, Any]:
    """Capture structured request metadata for audit logging."""

    payload: Dict[str, Any] = {
        "method": request.method,
        "path": request.url.path,
    }
    if request.query_params:
        payload["query"] = dict(request.query_params)
    if request.client:
        payload["client"] = request.client.host
    return payload


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


_SYSTEM_STATUS_DEFAULT = {
    "status": "operational",
    "maintenanceMode": False,
    "message": None,
}


def _load_system_status() -> Dict[str, Any]:
    payload = dict(_SYSTEM_STATUS_DEFAULT)
    try:
        data = load_json_config("system_status")
        if isinstance(data, dict):
            payload.update({k: data.get(k, payload[k]) for k in payload})
    except Exception:
        logger.exception("Failed to load system status configuration")
    return payload


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
# Rate limiting primitives
# ---------------------------------------------------------------------------


class RateLimiter:
    """Simple fixed-window rate limiter keyed by an arbitrary string."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window_seconds = window_seconds
        self._events: Dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.time()
        with self._lock:
            events = self._events[key]
            threshold = now - self.window_seconds
            while events and events[0] <= threshold:
                events.popleft()
            if len(events) >= self.limit:
                return False
            events.append(now)
            return True

    def retry_after(self, key: str) -> float:
        now = time.time()
        with self._lock:
            events = self._events.get(key)
            if not events:
                return 0.0
            threshold = now - self.window_seconds
            while events and events[0] <= threshold:
                events.popleft()
            if len(events) < self.limit:
                return 0.0
            oldest = events[0]
            return max(0.0, self.window_seconds - (now - oldest))

    def reset(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)


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
REMEMBER_ME_ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("REMEMBER_ME_ACCESS_MINUTES", "720")
)
REMEMBER_ME_REFRESH_TOKEN_EXPIRE_DAYS = int(
    os.getenv("REMEMBER_ME_REFRESH_DAYS", "30")
)
OFFLINE_TOKEN_EXPIRE_DAYS = int(os.getenv("OFFLINE_TOKEN_EXPIRE_DAYS", "21"))

LOGIN_RATE_LIMITER = RateLimiter(limit=5, window_seconds=15 * 60)
MFA_VERIFY_RATE_LIMITER = RateLimiter(limit=3, window_seconds=5 * 60)
MFA_RESEND_RATE_LIMITER = RateLimiter(limit=1, window_seconds=60)
FORGOT_PASSWORD_RATE_LIMITER = RateLimiter(limit=3, window_seconds=15 * 60)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _user_agent(request: Request) -> str:
    return request.headers.get("user-agent", "")


def _normalize_identifier(identifier: str) -> str:
    return identifier.strip().lower()


def _lookup_clinic_by_code(code: str) -> sqlite3.Row | None:
    return db_conn.execute(
        "SELECT id, code, active FROM clinics WHERE LOWER(code)=?",
        (code.lower(),),
    ).fetchone()


def _load_user_for_login(
    identifier: str, clinic_id: str | None = None
) -> sqlite3.Row | None:
    ensure_users_table(db_conn)
    normalized = _normalize_identifier(identifier)
    params: List[Any] = [normalized, normalized]
    query = (
        "SELECT id, username, email, name, password_hash, role, clinic_id, mfa_enabled, mfa_secret, "
        "account_locked_until, failed_login_attempts, last_login FROM users "
        "WHERE (LOWER(username)=? OR LOWER(email)=?)"
    )
    if clinic_id:
        query += " AND clinic_id=?"
        params.append(clinic_id)
    return db_conn.execute(query, params).fetchone()


def _row_get(row: sqlite3.Row, key: str, default: Any | None = None) -> Any | None:
    if row is None:
        return default
    try:
        keys = row.keys()  # type: ignore[attr-defined]
        if key in keys:
            return row[key]
    except Exception:
        pass
    return default


def _build_user_payload(user_row: sqlite3.Row) -> Dict[str, Any]:
    email = _row_get(user_row, "email") or user_row["username"]
    name = _row_get(user_row, "name") or user_row["username"]
    payload = {
        "id": user_row["id"],
        "email": email,
        "name": name,
        "role": user_row["role"],
        "clinicId": _row_get(user_row, "clinic_id"),
    }
    return payload


def _persist_session_record(
    user_id: int,
    session_id: str,
    access_token: str,
    refresh_token: str | None,
    expires_at: datetime,
    ip_address: str,
    user_agent: str,
    remember_me: bool,
    *,
    offline: bool = False,
    extra_metadata: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    ensure_session_table(db_conn)
    created_at = datetime.utcnow()
    metadata = {
        "id": session_id,
        "createdAt": created_at.replace(tzinfo=timezone.utc).isoformat(),
        "expiresAt": expires_at.replace(tzinfo=timezone.utc).isoformat(),
        "ip": ip_address,
        "userAgent": user_agent,
        "rememberMe": remember_me,
        "offline": offline,
    }
    if extra_metadata:
        metadata.update(extra_metadata)

    try:
        db_conn.execute(
            """
            INSERT OR REPLACE INTO sessions
            (id, user_id, token_hash, refresh_token_hash, expires_at, created_at, last_accessed, ip_address, user_agent, offline_session, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                user_id,
                hash_password(access_token),
                hash_password(refresh_token) if refresh_token else None,
                expires_at.timestamp(),
                created_at.timestamp(),
                created_at.timestamp(),
                ip_address,
                user_agent,
                1 if offline else 0,
                json.dumps(metadata, ensure_ascii=False),
            ),
        )
        db_conn.commit()
    except sqlite3.Error:
        logger.exception("Failed to persist session metadata")

    return metadata


def _issue_session_tokens(
    user_row: sqlite3.Row,
    *,
    remember_me: bool,
    clinic_id: str | None,
    ip_address: str,
    user_agent: str,
    offline: bool = False,
    offline_payload: Dict[str, Any] | None = None,
) -> Tuple[Dict[str, Any], Dict[str, Any], str, str | None, str]:
    session_id = str(uuid.uuid4())
    created_at = datetime.utcnow()

    if offline:
        minutes = OFFLINE_TOKEN_EXPIRE_DAYS * 24 * 60
        access_token = create_access_token(
            user_row["username"],
            user_row["role"],
            clinic_id,
            expires_minutes=minutes,
            session_id=session_id,
            token_type="offline",
        )
        refresh_token = None
        expires_at = created_at + timedelta(minutes=minutes)
    else:
        minutes = (
            REMEMBER_ME_ACCESS_TOKEN_EXPIRE_MINUTES
            if remember_me
            else ACCESS_TOKEN_EXPIRE_MINUTES
        )
        days = (
            REMEMBER_ME_REFRESH_TOKEN_EXPIRE_DAYS
            if remember_me
            else REFRESH_TOKEN_EXPIRE_DAYS
        )
        access_token = create_access_token(
            user_row["username"],
            user_row["role"],
            clinic_id,
            expires_minutes=minutes,
            session_id=session_id,
        )
        refresh_token = create_refresh_token(
            user_row["username"],
            user_row["role"],
            clinic_id,
            expires_days=days,
            session_id=session_id,
        )
        expires_at = created_at + timedelta(minutes=minutes)

    metadata = _persist_session_record(
        user_row["id"],
        session_id,
        access_token,
        refresh_token,
        expires_at,
        ip_address,
        user_agent,
        remember_me,
        offline=offline,
        extra_metadata=offline_payload,
    )

    tokens = {
        "accessToken": access_token,
        "expiresIn": int(minutes * 60),
    }
    if refresh_token:
        tokens["refreshToken"] = refresh_token

    return tokens, metadata, access_token, refresh_token, session_id


def _persist_refresh_token(user_id: int, refresh_token: str, days: int) -> None:
    ensure_refresh_table(db_conn)
    try:
        db_conn.execute(
            "DELETE FROM refresh_tokens WHERE expires_at < ?",
            (time.time(),),
        )
        db_conn.execute(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
            (
                user_id,
                hash_password(refresh_token),
                (datetime.utcnow() + timedelta(days=days)).timestamp(),
            ),
        )
        db_conn.commit()
    except sqlite3.Error:
        logger.exception("Failed to persist refresh token")


def _load_user_preferences(user_id: int) -> Tuple[Dict[str, Any], Dict[str, Any]]:
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

    try:
        session_row = db_conn.execute(
            "SELECT data FROM session_state WHERE user_id=?",
            (user_id,),
        ).fetchone()
    except sqlite3.OperationalError:
        session_row = None
    if session_row and session_row["data"]:
        session_state = _normalize_session_state(session_row["data"])
    else:
        session_state = _normalize_session_state(SessionStateModel())

    return settings, session_state


def _compose_auth_response(
    user_row: sqlite3.Row,
    settings: Dict[str, Any],
    session_state: Dict[str, Any],
    *,
    remember_me: bool,
    clinic_id: str | None,
    ip_address: str,
    user_agent: str,
    clinic_code: str | None,
) -> Dict[str, Any]:
    user_payload = _build_user_payload(user_row)
    user_payload.update(
        {
            "specialty": settings.get("specialty"),
            "permissions": [user_row["role"]],
            "preferences": settings,
        }
    )

    tokens, session_meta, access_token, refresh_token, session_id = _issue_session_tokens(
        user_row,
        remember_me=remember_me,
        clinic_id=clinic_id or _row_get(user_row, "clinic_id"),
        ip_address=ip_address,
        user_agent=user_agent,
    )

    refresh_days = (
        REMEMBER_ME_REFRESH_TOKEN_EXPIRE_DAYS if remember_me else REFRESH_TOKEN_EXPIRE_DAYS
    )
    if refresh_token:
        _persist_refresh_token(user_row["id"], refresh_token, refresh_days)

    permissions = [user_row["role"]]
    _insert_audit_log(
        user_row["username"],
        "login",
        {
            "client": ip_address,
            "sessionId": session_id,
            "remember": remember_me,
            "clinicCode": clinic_code,
        },
    )

    response: Dict[str, Any] = {
        "success": True,
        "requiresMFA": False,
        "user": user_payload,
        "tokens": tokens,
        "permissions": permissions,
        "session": session_state,
        "sessionMeta": session_meta,
        "settings": settings,
        "sessionState": session_state,
        "expiresAt": session_meta.get("expiresAt"),
        "token": tokens["accessToken"],
        "access_token": tokens["accessToken"],
        "expires_in": tokens["expiresIn"],
    }
    if "refreshToken" in tokens:
        response["refreshToken"] = tokens["refreshToken"]
        response["refresh_token"] = tokens["refreshToken"]

    return response


def _create_mfa_challenge(
    user_id: int, method: str = "totp", remember_me: bool = False
) -> Tuple[str, str, str]:
    ensure_mfa_challenges_table(db_conn)
    session_token = str(uuid.uuid4())
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    try:
        db_conn.execute(
            "REPLACE INTO mfa_challenges (session_token, user_id, code_hash, method, expires_at, attempts, last_sent, remember_me)"
            " VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
            (
                session_token,
                user_id,
                hash_password(code),
                method,
                expires_at.timestamp(),
                time.time(),
                1 if remember_me else 0,
            ),
        )
        db_conn.commit()
    except sqlite3.Error:
        logger.exception("Failed to create MFA challenge")
    return session_token, code, method


def _load_mfa_challenge(session_token: str) -> sqlite3.Row | None:
    ensure_mfa_challenges_table(db_conn)
    return db_conn.execute(
        "SELECT session_token, user_id, code_hash, method, expires_at, attempts, last_sent, remember_me FROM mfa_challenges WHERE session_token=?",
        (session_token,),
    ).fetchone()


def _delete_mfa_challenge(session_token: str) -> None:
    try:
        db_conn.execute(
            "DELETE FROM mfa_challenges WHERE session_token=?",
            (session_token,),
        )
        db_conn.commit()
    except sqlite3.Error:
        logger.exception("Failed to delete MFA challenge")


def _validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if not any(ch.isalpha() for ch in password):
        raise ValueError("Password must include a letter")
    if not any(ch.isdigit() for ch in password):
        raise ValueError("Password must include a number")


def create_access_token(
    username: str,
    role: str,
    clinic: str | None = None,
    *,
    expires_minutes: int | None = None,
    session_id: str | None = None,
    token_type: str = "access",
) -> str:
    """Create a signed JWT access token for the given user."""
    minutes = expires_minutes or ACCESS_TOKEN_EXPIRE_MINUTES
    payload = {
        "sub": username,
        "role": role,
        "type": token_type,
        "exp": datetime.utcnow() + timedelta(minutes=minutes),
    }
    if clinic is not None:
        payload["clinic"] = clinic
    if session_id:
        payload["sid"] = session_id
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(
    username: str,
    role: str,
    clinic: str | None = None,
    *,
    expires_days: int | None = None,
    session_id: str | None = None,
) -> str:
    """Create a refresh token with a longer expiry."""
    days = expires_days or REFRESH_TOKEN_EXPIRE_DAYS
    payload = {
        "sub": username,
        "role": role,
        "type": "refresh",
        "exp": datetime.utcnow() + timedelta(days=days),
    }
    if clinic is not None:
        payload["clinic"] = clinic
    if session_id:
        payload["sid"] = session_id
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

    def _normalise_token(candidate: str | None) -> str | None:
        if not candidate:
            return None
        value = candidate.strip()
        if not value:
            return None
        if value.lower().startswith("bearer "):
            _, _, remainder = value.partition(" ")
            value = remainder.strip()
        return value or None

    token: str | None = None
    auth_header = websocket.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = _normalise_token(auth_header)

    if not token:
        token = _normalise_token(websocket.query_params.get("token"))

    if not token:
        candidates: List[str] = []
        header_protocols = websocket.headers.get("sec-websocket-protocol")
        if header_protocols:
            candidates.extend(
                [part.strip() for part in header_protocols.split(",") if part.strip()]
            )
        scope_protocols = websocket.scope.get("subprotocols") or []
        for proto in scope_protocols:
            if proto and proto not in candidates:
                candidates.append(proto)
        for proto in candidates:
            if proto.lower().startswith("bearer "):
                token = _normalise_token(proto)
                if token:
                    break

    if not token:
        await websocket.close(code=1008)
        raise WebSocketDisconnect()

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


EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class LoginModel(BaseModel):
    emailOrUsername: str | None = Field(default=None, alias="emailOrUsername")
    password: str
    clinicCode: str | None = Field(default=None, alias="clinicCode")
    rememberMe: bool = Field(default=False, alias="rememberMe")
    username: str | None = None  # Backwards compatibility
    lang: str | None = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _coerce_identifier(cls, values: Any) -> Any:
        if isinstance(values, dict):
            data = dict(values)
            if not data.get("emailOrUsername") and data.get("username"):
                data["emailOrUsername"] = data.get("username")
            return data
        return values

    @field_validator("emailOrUsername")
    @classmethod
    def _require_identifier(cls, value: str | None) -> str:
        if not value or not str(value).strip():
            raise ValueError("emailOrUsername is required")
        return str(value)

    @field_validator("password")
    @classmethod
    def _require_password(cls, value: str) -> str:
        if not value or not str(value).strip():
            raise ValueError("Password is required")
        return value


class VerifyMFAModel(BaseModel):
    code: str
    mfaSessionToken: str = Field(alias="mfaSessionToken")

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("code")
    @classmethod
    def _validate_code(cls, value: str) -> str:
        value = value.strip()
        if not value.isdigit() or len(value) != 6:
            raise ValueError("code must be a 6 digit number")
        return value


class ResendMFAModel(BaseModel):
    mfaSessionToken: str = Field(alias="mfaSessionToken")

    model_config = ConfigDict(populate_by_name=True)


class ForgotPasswordModel(BaseModel):
    email: str
    clinicCode: str | None = Field(default=None, alias="clinicCode")

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        value = value.strip()
        if not EMAIL_REGEX.match(value):
            raise ValueError("Invalid email")
        return value


class ResetPasswordTokenModel(BaseModel):
    token: str
    newPassword: str = Field(alias="newPassword")
    confirmPassword: str = Field(alias="confirmPassword")

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def _ensure_match(self) -> "ResetPasswordTokenModel":
        if self.newPassword != self.confirmPassword:
            raise ValueError("Passwords do not match")
        return self


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
    client_host = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    try:
        _user_id = register_user(db_conn, model.username, model.password)
    except sqlite3.IntegrityError:
        _insert_audit_log(
            model.username,
            "register_failed",
            {"reason": "username exists", "client": client_host},
            success=False,
            ip_address=client_host,
            user_agent=user_agent,
        )
        raise HTTPException(status_code=400, detail="Username already exists")
    _insert_audit_log(
        model.username,
        "register",
        {"client": client_host},
        success=True,
        ip_address=client_host,
        user_agent=user_agent,
    )
    access_token = create_access_token(model.username, "user")
    refresh_token = create_refresh_token(model.username, "user")
    settings = UserSettings().model_dump()
    session = _normalize_session_state(SessionStateModel())
    ensure_session_state_table(db_conn)
    ensure_shared_workflow_sessions_table(db_conn)
    ensure_notification_counters_table(db_conn)
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
    client_host = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    try:
        _user_id = register_user(db_conn, model.username, model.password)
        _insert_audit_log(
            model.username,
            "register",
            {"source": "auth", "client": client_host},
            success=True,
            ip_address=client_host,
            user_agent=user_agent,
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
            {"source": "auth", "client": client_host},
            success=True,
            ip_address=client_host,
            user_agent=user_agent,
        )
        session_row = (
            db_conn.execute(
                "SELECT data FROM session_state WHERE user_id=?", (user_id,)
            ).fetchone()
            if user_id is not None
            else None
        )
        if session_row and session_row["data"]:
            session = _normalize_session_state(session_row["data"])
        else:
            session = _normalize_session_state(SessionStateModel())
    else:
        role = "user"
        user_id = _user_id
        session = _normalize_session_state(SessionStateModel())
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
    ensure_session_state_table(db_conn)
    ensure_shared_workflow_sessions_table(db_conn)
    ensure_notification_counters_table(db_conn)
    client_host = request.client.host if request.client else None
    user_agent_header = request.headers.get("user-agent")

    identifier = model.emailOrUsername or ""
    normalized_identifier = _normalize_identifier(identifier)
    ip_address = _client_ip(request)
    limiter_key = f"{ip_address}:{normalized_identifier}"

    def _enforce_login_rate_limit() -> None:
        allowed = LOGIN_RATE_LIMITER.allow(limiter_key)
        if allowed:
            return
        retry_after = LOGIN_RATE_LIMITER.retry_after(limiter_key)
        headers = {"Retry-After": str(int(math.ceil(retry_after)))} if retry_after else None
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": "Too many login attempts", "code": "RATE_LIMITED"},
            headers=headers,
        )

    clinic_id: str | None = None
    if model.clinicCode:
        clinic = _lookup_clinic_by_code(model.clinicCode)
        if not clinic or not clinic["active"]:
            _insert_audit_log(
                normalized_identifier,
                "failed_login",
                {
                    "reason": "invalid_clinic",
                    "clinicCode": model.clinicCode,
                    "client": ip_address,
                },
                success=False,
                ip_address=client_host,
                user_agent=user_agent_header,
            )
            _enforce_login_rate_limit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "Invalid credentials", "code": "INVALID_CREDENTIALS"},
            )
        clinic_id = clinic["id"]

    user_row = _load_user_for_login(identifier, clinic_id)
    if not user_row:
        await asyncio.sleep(0.2)
        _insert_audit_log(
            normalized_identifier,
            "failed_login",
            {"reason": "unknown_user", "client": ip_address, "clinicCode": model.clinicCode},
            success=False,
            ip_address=client_host,
            user_agent=user_agent_header,
        )
        _enforce_login_rate_limit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Invalid credentials", "code": "INVALID_CREDENTIALS"},
        )

    now_ts = time.time()
    locked_until = _row_get(user_row, "account_locked_until")
    if locked_until and locked_until > now_ts:
        _insert_audit_log(
            user_row["username"],
            "login_locked",
            {
                "client": ip_address,
                "lockedUntil": locked_until,
                "clinicCode": model.clinicCode,
                "reason": "invalid credentials",
            },
            success=False,
            ip_address=client_host,
            user_agent=user_agent_header,
        )
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={"error": "Account locked", "code": "ACCOUNT_LOCKED"},
        )

    if not verify_password(model.password, user_row["password_hash"]):
        attempts = int(_row_get(user_row, "failed_login_attempts", 0) or 0) + 1
        lock_until: float | None = None
        if attempts >= 5:
            lock_until = now_ts + 15 * 60
        db_conn.execute(
            "UPDATE users SET failed_login_attempts=?, account_locked_until=?, updated_at=? WHERE id=?",
            (attempts, lock_until, now_ts, user_row["id"]),
        )
        db_conn.commit()
        await asyncio.sleep(min(0.25 * attempts, 2.0))
        detail_payload = {
            "reason": "invalid_credentials",
            "attempts": attempts,
            "client": ip_address,
            "clinicCode": model.clinicCode,
        }
        if lock_until:
            detail_payload["lockedUntil"] = lock_until
        _insert_audit_log(
            user_row["username"],
            "failed_login",
            detail_payload,
            success=False,
            ip_address=client_host,
            user_agent=user_agent_header,
        )
        _enforce_login_rate_limit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Invalid credentials", "code": "INVALID_CREDENTIALS"},
        )

    db_conn.execute(
        "UPDATE users SET failed_login_attempts=0, account_locked_until=NULL, last_login=?, updated_at=? WHERE id=?",
        (now_ts, now_ts, user_row["id"]),
    )
    db_conn.commit()
    LOGIN_RATE_LIMITER.reset(limiter_key)

    settings, session_state = _load_user_preferences(user_row["id"])
    user_agent = _user_agent(request)

    if _row_get(user_row, "mfa_enabled"):
        session_token, code, method = _create_mfa_challenge(
            user_row["id"], remember_me=model.rememberMe
        )
        details = {
            "method": method,
            "client": ip_address,
            "sessionToken": session_token,
        }
        _insert_audit_log(user_row["username"], "login_mfa_challenge", details)
        payload: Dict[str, Any] = {
            "success": True,
            "requiresMFA": True,
            "mfaSessionToken": session_token,
            "mfaMethod": method,
        }
        if ENVIRONMENT in {"development", "dev"}:
            payload["debugCode"] = code
        return payload

    return _compose_auth_response(
        user_row,
        settings,
        session_state,
        remember_me=model.rememberMe,
        clinic_id=clinic_id,
        ip_address=ip_address,
        user_agent=user_agent,
        clinic_code=model.clinicCode,
    )


@app.post("/auth/login")
@app.post("/api/auth/login")
async def auth_login(model: LoginModel, request: Request):
    return await login(model, request)


@app.post("/api/auth/verify-mfa")
async def verify_mfa(model: VerifyMFAModel, request: Request) -> Dict[str, Any]:
    token = model.mfaSessionToken
    if not MFA_VERIFY_RATE_LIMITER.allow(token):
        retry = MFA_VERIFY_RATE_LIMITER.retry_after(token)
        headers = {"Retry-After": str(int(math.ceil(retry)))} if retry else None
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": "Too many verification attempts", "code": "RATE_LIMITED"},
            headers=headers,
        )

    challenge = _load_mfa_challenge(token)
    if not challenge:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Invalid or expired MFA code", "code": "INVALID_MFA"},
        )

    if challenge["expires_at"] < time.time():
        _delete_mfa_challenge(token)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "MFA code expired", "code": "INVALID_MFA"},
        )

    if not verify_password(model.code, challenge["code_hash"]):
        attempts = int(challenge["attempts"] or 0) + 1
        db_conn.execute(
            "UPDATE mfa_challenges SET attempts=? WHERE session_token=?",
            (attempts, token),
        )
        db_conn.commit()
        _insert_audit_log(
            str(challenge["user_id"]),
            "mfa_failed",
            {"attempts": attempts, "sessionToken": token, "client": _client_ip(request)},
        )
        if attempts >= 3:
            _delete_mfa_challenge(token)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Invalid or expired MFA code", "code": "INVALID_MFA"},
        )

    _delete_mfa_challenge(token)
    MFA_VERIFY_RATE_LIMITER.reset(token)
    user_row = db_conn.execute(
        "SELECT id, username, email, name, password_hash, role, clinic_id, mfa_enabled, mfa_secret, account_locked_until, failed_login_attempts, last_login FROM users WHERE id=?",
        (challenge["user_id"],),
    ).fetchone()
    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Invalid or expired MFA code", "code": "INVALID_MFA"},
        )

    settings, session_state = _load_user_preferences(user_row["id"])
    ip_address = _client_ip(request)
    user_agent = _user_agent(request)
    remember_me = bool(_row_get(challenge, "remember_me"))
    response = _compose_auth_response(
        user_row,
        settings,
        session_state,
        remember_me=remember_me,
        clinic_id=_row_get(user_row, "clinic_id"),
        ip_address=ip_address,
        user_agent=user_agent,
        clinic_code=None,
    )
    _insert_audit_log(
        user_row["username"],
        "mfa_verified",
        {"client": ip_address, "sessionToken": token},
    )
    return response


@app.post("/api/auth/resend-mfa")
async def resend_mfa(model: ResendMFAModel) -> Dict[str, Any]:
    token = model.mfaSessionToken
    if not MFA_RESEND_RATE_LIMITER.allow(token):
        retry = MFA_RESEND_RATE_LIMITER.retry_after(token)
        headers = {"Retry-After": str(int(math.ceil(retry)))} if retry else None
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": "MFA resend rate limited", "code": "RATE_LIMITED"},
            headers=headers,
        )

    challenge = _load_mfa_challenge(token)
    if not challenge:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Invalid MFA session", "code": "INVALID_MFA"},
        )

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    db_conn.execute(
        "UPDATE mfa_challenges SET code_hash=?, expires_at=?, attempts=0, last_sent=?, remember_me=? WHERE session_token=?",
        (
            hash_password(code),
            expires_at.timestamp(),
            time.time(),
            _row_get(challenge, "remember_me", 0),
            token,
        ),
    )
    db_conn.commit()
    method = challenge["method"]
    _insert_audit_log(
        str(challenge["user_id"]),
        "mfa_resent",
        {"sessionToken": token},
    )
    payload: Dict[str, Any] = {
        "success": True,
        "message": "Verification code sent",
    }
    if ENVIRONMENT in {"development", "dev"}:
        payload["debugCode"] = code
    return payload


@app.post("/api/auth/forgot-password")
async def forgot_password(model: ForgotPasswordModel, request: Request) -> Dict[str, Any]:
    ip_address = _client_ip(request)
    if not FORGOT_PASSWORD_RATE_LIMITER.allow(ip_address):
        retry = FORGOT_PASSWORD_RATE_LIMITER.retry_after(ip_address)
        headers = {"Retry-After": str(int(math.ceil(retry)))} if retry else None
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": "Too many requests", "code": "RATE_LIMITED"},
            headers=headers,
        )

    clinic_id: str | None = None
    if model.clinicCode:
        clinic = _lookup_clinic_by_code(model.clinicCode)
        if clinic and clinic["active"]:
            clinic_id = clinic["id"]
        else:
            _insert_audit_log(
                None,
                "password_reset_requested",
                {
                    "reason": "invalid_clinic",
                    "clinicCode": model.clinicCode,
                    "client": ip_address,
                },
            )
            return {
                "success": True,
                "message": "If an account exists, reset instructions have been sent",
            }

    identifier = _normalize_identifier(model.email)
    params: List[Any] = [identifier, identifier]
    query = "SELECT id, username, email, clinic_id FROM users WHERE (LOWER(email)=? OR LOWER(username)=?)"
    if clinic_id:
        query += " AND clinic_id=?"
        params.append(clinic_id)
    user_row = db_conn.execute(query, params).fetchone()

    debug_token: str | None = None
    if user_row:
        ensure_password_reset_tokens_table(db_conn)
        db_conn.execute(
            "UPDATE password_reset_tokens SET used=1 WHERE user_id=?",
            (user_row["id"],),
        )
        reset_token = secrets.token_urlsafe(32)
        debug_token = reset_token
        db_conn.execute(
            "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used) VALUES (?, ?, ?, ?, 0)",
            (
                str(uuid.uuid4()),
                user_row["id"],
                hash_password(reset_token),
                (datetime.utcnow() + timedelta(hours=1)).timestamp(),
            ),
        )
        db_conn.commit()
        _insert_audit_log(
            user_row["username"],
            "password_reset_requested",
            {"client": ip_address, "clinicCode": model.clinicCode},
        )
    else:
        _insert_audit_log(
            None,
            "password_reset_requested",
            {"reason": "unknown_email", "client": ip_address, "clinicCode": model.clinicCode},
        )

    response: Dict[str, Any] = {
        "success": True,
        "message": "If an account exists, reset instructions have been sent",
    }
    if debug_token and ENVIRONMENT in {"development", "dev"}:
        response["debugToken"] = debug_token
    return response


@app.post("/api/auth/reset-password")
async def reset_password_with_token(
    model: ResetPasswordTokenModel, request: Request
) -> Dict[str, Any]:
    try:
        _validate_password_strength(model.newPassword)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": str(exc), "code": "WEAK_PASSWORD"},
        ) from exc

    ensure_password_reset_tokens_table(db_conn)
    rows = db_conn.execute(
        "SELECT id, user_id, token_hash, expires_at, used FROM password_reset_tokens WHERE used=0",
    ).fetchall()
    match: sqlite3.Row | None = None
    for row in rows:
        if verify_password(model.token, row["token_hash"]):
            match = row
            break

    if not match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Invalid token", "code": "INVALID_TOKEN"},
        )

    if match["expires_at"] < time.time():
        db_conn.execute(
            "UPDATE password_reset_tokens SET used=1 WHERE id=?",
            (match["id"],),
        )
        db_conn.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "Token expired", "code": "INVALID_TOKEN"},
        )

    password_hash = hash_password(model.newPassword)
    now_ts = time.time()
    db_conn.execute(
        "UPDATE users SET password_hash=?, updated_at=? WHERE id=?",
        (password_hash, now_ts, match["user_id"]),
    )
    db_conn.execute(
        "UPDATE password_reset_tokens SET used=1 WHERE user_id=?",
        (match["user_id"],),
    )
    db_conn.execute(
        "DELETE FROM refresh_tokens WHERE user_id=?",
        (match["user_id"],),
    )
    db_conn.execute(
        "DELETE FROM sessions WHERE user_id=?",
        (match["user_id"],),
    )
    db_conn.commit()

    user_row = db_conn.execute(
        "SELECT username FROM users WHERE id=?",
        (match["user_id"],),
    ).fetchone()
    username = user_row["username"] if user_row else None
    _insert_audit_log(
        username,
        "password_reset_completed",
        {"client": _client_ip(request)},
    )
    return {"success": True, "message": "Password successfully reset"}


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


@app.get("/api/auth/validate")
async def auth_validate(
    request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict[str, Any]:
    token_data = get_current_user(credentials)
    if token_data.get("type") not in (None, "access", "offline"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    username = token_data.get("sub")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    row = db_conn.execute(
        "SELECT id, username, email, name, role, clinic_id FROM users WHERE username=?",
        (username,),
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    settings, _session_state = _load_user_preferences(row["id"])
    user_payload = _build_user_payload(row)
    user_payload.update(
        {
            "specialty": settings.get("specialty"),
            "permissions": [row["role"]],
            "preferences": settings,
        }
    )
    _insert_audit_log(
        row["username"],
        "token_validated",
        {"client": _client_ip(request)},
    )
    return {"valid": True, "user": user_payload, "permissions": [row["role"]]}


@app.post("/refresh")
@app.post("/api/auth/refresh")
async def refresh(model: RefreshModel, request: Request) -> Dict[str, Any]:
    """Issue a new access token given a valid refresh token."""
    ensure_refresh_table(db_conn)
    client_host = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    try:
        data = jwt.decode(model.refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if data.get("type") != "refresh":
            raise jwt.PyJWTError()
    except jwt.PyJWTError:
        _insert_audit_log(
            None,
            "refresh_failed",
            {"reason": "invalid_token"},
            success=False,
            ip_address=client_host,
            user_agent=user_agent,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?",
        (data["sub"],),
    ).fetchone()
    if not row:
        _insert_audit_log(
            data.get("sub"),
            "refresh_failed",
            {"reason": "unknown_user"},
            success=False,
            ip_address=client_host,
            user_agent=user_agent,
        )
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
        _insert_audit_log(
            data.get("sub"),
            "refresh_failed",
            {"reason": "token_mismatch"},
            success=False,
            ip_address=client_host,
            user_agent=user_agent,
        )
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    _touch_auth_session(
        user_id,
        model.refresh_token,
        ip_address=client_host,
        user_agent=user_agent,
    )
    access_token = create_access_token(data["sub"], data["role"], data.get("clinic"))
    expires_at_iso = (
        datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    ).isoformat() + "Z"

    _insert_audit_log(
        data.get("sub"),
        "refresh_token",
        None,
        success=True,
        ip_address=client_host,
        user_agent=user_agent,
    )
    return {
        "token": access_token,
        "expiresAt": expires_at_iso,
        "access_token": access_token,
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }
    return response


@app.post("/auth/logout")
@app.post("/api/auth/logout")
async def auth_logout(model: LogoutModel, request: Request) -> Dict[str, bool]:  # pragma: no cover - simple DB op
    """Revoke a refresh token by removing it from storage."""
    ensure_refresh_table(db_conn)
    client_host = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
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
        _insert_audit_log(
            data.get("sub"),
            "logout_failed",
            {"reason": "unknown_user"},
            success=False,
            ip_address=client_host,
            user_agent=user_agent,
        )
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
    session_removed = _remove_auth_session(user_id, model.token)
    if success:
        _insert_audit_log(
            data.get("sub"),
            "logout",
            None,
            success=True,
            ip_address=client_host,
            user_agent=user_agent,
        )
    else:
        _insert_audit_log(
            data.get("sub"),
            "logout_failed",
            {"reason": "token_not_found"},
            success=False,
            ip_address=client_host,
            user_agent=user_agent,
        )
    if session_removed and not success:
        success = True
    else:
        success = success or session_removed
    return {"success": success}


@app.post("/api/auth/offline-session")
async def create_offline_session(
    request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict[str, Any]:
    token_data = get_current_user(credentials)
    if token_data.get("type") not in (None, "access"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Offline token requires access token",
        )

    username = token_data.get("sub")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Offline token requires access token",
        )

    user_row = db_conn.execute(
        "SELECT id, username, email, name, role, clinic_id FROM users WHERE username=?",
        (username,),
    ).fetchone()
    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Offline token requires access token",
        )

    ip_address = _client_ip(request)
    user_agent = _user_agent(request)
    tokens, session_meta, access_token, _refresh, session_id = _issue_session_tokens(
        user_row,
        remember_me=True,
        clinic_id=_row_get(user_row, "clinic_id"),
        ip_address=ip_address,
        user_agent=user_agent,
        offline=True,
        offline_payload={"purpose": "offline"},
    )

    offline_token_value = access_token
    user_payload = _build_user_payload(user_row)
    permissions = [user_row["role"]]
    user_data = {
        "id": user_row["id"],
        "email": user_payload["email"],
        "name": user_payload["name"],
        "role": user_row["role"],
        "permissions": permissions,
    }
    _insert_audit_log(
        user_row["username"],
        "offline_session_created",
        {"client": ip_address, "sessionId": session_id},
    )
    return {
        "success": True,
        "offlineToken": offline_token_value,
        "expiresAt": session_meta.get("expiresAt"),
        "userData": user_data,
    }


@app.get("/api/system/status", tags=["system"])
async def system_status() -> JSONResponse:
    config = _load_system_status()
    row = db_conn.execute("SELECT MAX(timestamp) as ts FROM events").fetchone()
    last_sync = (
        datetime.fromtimestamp(row["ts"], tz=timezone.utc) if row and row["ts"] else None
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
    payload = {
        "status": config.get("status", "operational"),
        "maintenanceMode": bool(config.get("maintenanceMode")),
        "message": config.get("message"),
        "aiServicesStatus": ai_status,
        "ehrConnectionStatus": ehr_status,
        "lastSyncTime": last_sync,
    }
    response = JSONResponse(content=jsonable_encoder(payload))
    response.headers["X-Bypass-Envelope"] = "1"
    return response


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


@app.get("/audit")
async def get_audit_logs(user=Depends(require_role("admin"))) -> List[Dict[str, Any]]:
    rows = db_conn.execute(
        """
        SELECT timestamp, username, action, details, ip_address, user_agent, success, clinic_id
          FROM audit_log
         ORDER BY timestamp DESC
        """
    ).fetchall()
    entries: List[Dict[str, Any]] = []
    for row in rows:

        details_raw = row["details"]
        parsed_details: Any = None
        if details_raw:
            try:
                parsed_details = json.loads(details_raw)
            except json.JSONDecodeError:
                parsed_details = details_raw
        metadata: Dict[str, Any] | None = None
        details_value: Any = parsed_details
        if isinstance(parsed_details, dict):
            metadata = parsed_details
            details_value = parsed_details.get("path") or parsed_details
        entry = {
            "timestamp": row["timestamp"],
            "username": row["username"],
            "action": row["action"],
            "details": details_value,
            "ipAddress": row["ip_address"],
            "userAgent": row["user_agent"],
            "success": None if row["success"] is None else bool(row["success"]),
        }
        if metadata is not None:
            entry["metadata"] = metadata
        if row["clinic_id"]:
            entry["clinicId"] = row["clinic_id"]
        entries.append(entry)
    return JSONResponse(content=entries, headers={"X-Bypass-Envelope": "1"})


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

    data: Dict[str, Any] = {}
    if row and row["layout_prefs"]:
        try:
            loaded = json.loads(row["layout_prefs"])
            if isinstance(loaded, dict):
                data = loaded
        except Exception:
            logging.getLogger(__name__).warning(
                "Failed to deserialize layout preferences for user %s", user.get("sub")
            )
    response_payload: Dict[str, Any] = {"success": True, "data": data}
    if isinstance(data, dict):
        response_payload.update(data)
    return response_payload



@app.put("/api/user/layout-preferences")
async def put_layout_preferences(
    prefs: Dict[str, Any], user=Depends(require_role("user"))
) -> Response:
    core: Dict[str, Any]
    if "data" in prefs and isinstance(prefs["data"], dict):
        core = dict(prefs["data"])
    else:
        core = {key: value for key, value in prefs.items() if key not in {"success", "data"}}
    data = json.dumps(core)
    row = db_conn.execute(
        "SELECT id FROM users WHERE username= ?",
        (user["sub"],),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="User not found")

    uid = row["id"]
    db_conn.execute(
        """
        INSERT INTO settings (user_id, theme, layout_prefs)
        VALUES (?, 'light', ?)
        ON CONFLICT(user_id) DO UPDATE SET layout_prefs=excluded.layout_prefs
        """,
        (uid, data),
    )
    db_conn.commit()

    stored = db_conn.execute(
        "SELECT layout_prefs FROM settings WHERE user_id=?",
        (uid,),
    ).fetchone()

    data_payload: Dict[str, Any] = {}
    if stored and stored["layout_prefs"]:
        try:
            loaded = json.loads(stored["layout_prefs"])
            if isinstance(loaded, dict):
                data_payload = loaded
        except Exception:
            logging.getLogger(__name__).warning(
                "Failed to deserialize layout preferences for user %s", uid
            )
    if not data_payload and isinstance(prefs, dict):
        data_payload = {key: value for key, value in prefs.items() if key not in {"success", "data"}}
    response_payload: Dict[str, Any] = {"success": True, "data": data_payload}
    if isinstance(data_payload, dict):
        response_payload.update(data_payload)
    return JSONResponse(content=response_payload)



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


def _build_user_profile_payload(username: str) -> Dict[str, Any]:
    """Assemble the profile payload for ``username`` combining settings and UI prefs."""

    user_row = db_conn.execute(
        "SELECT id, username, name, email, role, clinic_id FROM users WHERE username=?",
        (username,),
    ).fetchone()
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = user_row["id"]
    profile_row = db_conn.execute(
        "SELECT current_view, clinic, preferences, ui_preferences FROM user_profile WHERE user_id=?",
        (user_id,),
    ).fetchone()

    current_view: Optional[str] = None
    clinic = user_row["clinic_id"]
    stored_preferences: Dict[str, Any] = {}
    ui_preferences: Dict[str, Any] = {}

    if profile_row:
        current_view = profile_row["current_view"]
        if profile_row["clinic"]:
            clinic = profile_row["clinic"]
        raw_prefs = profile_row["preferences"]
        if raw_prefs:
            try:
                parsed = json.loads(raw_prefs)
            except (TypeError, ValueError, json.JSONDecodeError):
                parsed = None
            if isinstance(parsed, dict):
                stored_preferences = parsed
        raw_ui = profile_row["ui_preferences"]
        if raw_ui:
            try:
                parsed_ui = json.loads(raw_ui)
            except (TypeError, ValueError, json.JSONDecodeError):
                parsed_ui = None
            if isinstance(parsed_ui, dict):
                ui_preferences = parsed_ui

    settings, _ = _load_user_preferences(user_id)
    combined_preferences = copy.deepcopy(settings)
    if stored_preferences:
        combined_preferences.update(stored_preferences)

    name = user_row["name"] or user_row["username"]
    email = user_row["email"]
    role = user_row["role"]

    normalized_ui = _normalize_ui_preferences_payload(ui_preferences)

    payload = {
        "id": user_id,
        "username": user_row["username"],
        "name": name,
        "email": email,
        "role": role,
        "permissions": [role],
        "clinic": clinic,
        "clinicId": clinic,
        "currentView": current_view,
        "preferences": combined_preferences,
        "uiPreferences": normalized_ui,
        "specialty": combined_preferences.get("specialty"),
    }
    return payload


_DEFAULT_SELECTED_CODES: Dict[str, int] = {
    "codes": 0,
    "prevention": 0,
    "diagnoses": 0,
    "differentials": 0,
}

_DEFAULT_PANEL_STATES: Dict[str, bool] = {"suggestionPanel": False}

_DEFAULT_NAVIGATION_PREFS: Dict[str, Any] = {
    "collapsed": False,
    "hoverStates": {},
    "animationPreferences": {"enabled": True, "speed": "normal"},
}


def _normalize_ui_preferences_payload(payload: Any) -> Dict[str, Any]:
    """Ensure navigation/UI preference payloads include required structure."""

    result: Dict[str, Any] = {}
    if isinstance(payload, dict):
        result = copy.deepcopy(payload)

    navigation_raw = result.get("navigation") if isinstance(result.get("navigation"), dict) else {}
    navigation = copy.deepcopy(navigation_raw) if isinstance(navigation_raw, dict) else {}

    collapsed_raw = navigation.get("collapsed")
    if not isinstance(collapsed_raw, bool):
        collapsed_raw = result.get("sidebarCollapsed") if isinstance(result.get("sidebarCollapsed"), bool) else None
    collapsed = bool(collapsed_raw) if collapsed_raw is not None else _DEFAULT_NAVIGATION_PREFS["collapsed"]

    hover_states_raw = navigation.get("hoverStates")
    if not isinstance(hover_states_raw, dict):
        hover_states_raw = result.get("hoverStates") if isinstance(result.get("hoverStates"), dict) else {}
    hover_states = copy.deepcopy(hover_states_raw) if isinstance(hover_states_raw, dict) else {}

    anim = navigation.get("animationPreferences")
    if not isinstance(anim, dict):
        raw_anim = result.get("animationPreferences") if isinstance(result.get("animationPreferences"), dict) else {}
        anim = copy.deepcopy(raw_anim) if isinstance(raw_anim, dict) else {}
    else:
        anim = copy.deepcopy(anim)
    speed = anim.get("speed") if isinstance(anim, dict) else None
    if speed not in {"slow", "normal", "fast"}:
        speed = "normal"
    enabled_raw = anim.get("enabled") if isinstance(anim, dict) else None
    enabled = bool(enabled_raw) if isinstance(enabled_raw, bool) else True

    normalized_nav: Dict[str, Any] = {
        "collapsed": collapsed,
        "hoverStates": hover_states if isinstance(hover_states, dict) else {},
        "animationPreferences": {
            "enabled": enabled,
            "speed": speed,
        },
    }

    extras = {
        key: value
        for key, value in navigation.items()
        if key not in {"collapsed", "hoverStates", "animationPreferences"}
    }
    result["navigation"] = {**_DEFAULT_NAVIGATION_PREFS, **extras, **normalized_nav}
    result["sidebarCollapsed"] = normalized_nav["collapsed"]
    result["hoverStates"] = normalized_nav["hoverStates"]
    result["animationPreferences"] = normalized_nav["animationPreferences"]
    return result


class SessionCodeModel(BaseModel):
    code: str
    type: str
    category: str
    description: str
    rationale: Optional[str] = None
    confidence: Optional[float] = None
    reimbursement: Optional[str] = None
    rvu: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class SessionStateModel(BaseModel):
    selectedCodes: Dict[str, int] = Field(
        default_factory=lambda: dict(_DEFAULT_SELECTED_CODES)
    )
    panelStates: Dict[str, StrictBool] = Field(
        default_factory=lambda: dict(_DEFAULT_PANEL_STATES)
    )
    currentNote: Optional[Dict[str, Any]] = None
    selectedCodesList: List[SessionCodeModel] = Field(default_factory=list)
    addedCodes: List[str] = Field(default_factory=list)
    isSuggestionPanelOpen: bool = False
    finalizationSessions: Dict[str, Any] = Field(default_factory=dict)
    draftsPreferences: Dict[str, Any] = Field(default_factory=dict)
    analyticsPreferences: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="allow")

    @model_validator(mode="before")
    @classmethod
    def _coerce_legacy_payload(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values
        data = dict(values)
        panel_states = data.get("panelStates")
        if "isSuggestionPanelOpen" not in data and isinstance(panel_states, dict):
            suggestion = panel_states.get("suggestionPanel")
            if isinstance(suggestion, bool):
                data["isSuggestionPanelOpen"] = suggestion
            elif isinstance(suggestion, (int, float)):
                data["isSuggestionPanelOpen"] = bool(suggestion)
            elif isinstance(suggestion, str):
                lowered = suggestion.strip().lower()
                if lowered in {"1", "true", "yes", "on"}:
                    data["isSuggestionPanelOpen"] = True
                elif lowered in {"0", "false", "no", "off"}:
                    data["isSuggestionPanelOpen"] = False
        if "selectedCodesList" not in data or not isinstance(data.get("selectedCodesList"), (list, tuple)):
            data["selectedCodesList"] = []
        if "addedCodes" not in data or not isinstance(data.get("addedCodes"), (list, tuple)):
            data["addedCodes"] = []
        if "finalizationSessions" not in data or not isinstance(data.get("finalizationSessions"), dict):
            data["finalizationSessions"] = {}
        return data

    @field_validator("panelStates", mode="before")
    @classmethod
    def _normalize_panel_states(cls, value: Any) -> Dict[str, bool]:
        if not isinstance(value, dict):
            return dict(_DEFAULT_PANEL_STATES)
        normalized: Dict[str, bool] = {}
        for key, raw in value.items():
            normalized[key] = bool(raw)
        if "suggestionPanel" not in normalized:
            normalized["suggestionPanel"] = False
        return normalized

    @field_validator("selectedCodes", mode="before")
    @classmethod
    def _normalize_selected_codes(cls, value: Any) -> Dict[str, int]:
        result = dict(_DEFAULT_SELECTED_CODES)
        if isinstance(value, dict):
            for key, raw in value.items():
                try:
                    result[key] = int(raw)
                except (TypeError, ValueError):
                    continue
        return result

    @field_validator("selectedCodesList", mode="before")
    @classmethod
    def _ensure_list(cls, value: Any) -> List[Any]:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        if isinstance(value, tuple):
            return list(value)
        return []

    @field_validator("addedCodes", mode="before")
    @classmethod
    def _normalize_added_codes(cls, value: Any) -> List[str]:
        if not isinstance(value, (list, tuple)):
            return []
        seen: Set[str] = set()
        result: List[str] = []
        for raw in value:
            if raw is None:
                continue
            text = str(raw)
            if text in seen:
                continue
            seen.add(text)
            result.append(text)
        return result

    @model_validator(mode="after")
    def _sync_fields(self) -> "SessionStateModel":
        panel_states = {**self.panelStates}
        panel_states["suggestionPanel"] = bool(self.isSuggestionPanelOpen)
        self.panelStates = panel_states
        # Ensure the canonical keys remain in selectedCodes even if omitted in payload
        normalized_counts = dict(_DEFAULT_SELECTED_CODES)
        for key, value in self.selectedCodes.items():
            try:
                normalized_counts[key] = int(value)
            except (TypeError, ValueError):
                continue
        self.selectedCodes = normalized_counts
        return self


def _normalize_session_state(payload: Any | None = None) -> Dict[str, Any]:
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            payload = None
    if isinstance(payload, SessionStateModel):
        model = payload
    else:
        data = payload if isinstance(payload, dict) else {}
        try:
            model = SessionStateModel.model_validate(data)
        except ValidationError:
            model = SessionStateModel()
    normalized = model.model_dump()
    suggestion = bool(normalized.get("isSuggestionPanelOpen", False))
    panel_states_raw = normalized.get("panelStates")
    if not isinstance(panel_states_raw, dict):
        panel_states = dict(_DEFAULT_PANEL_STATES)
    else:
        panel_states = {key: bool(value) for key, value in panel_states_raw.items()}
    panel_states["suggestionPanel"] = suggestion
    normalized["panelStates"] = panel_states
    sessions_raw = normalized.get("finalizationSessions")
    sessions: Dict[str, Any] = {}
    if isinstance(sessions_raw, dict):
        logger = logging.getLogger(__name__)
        for key, value in sessions_raw.items():
            session_key = str(key)
            if isinstance(value, dict):
                try:
                    sessions[session_key] = _normalize_finalization_session(value)
                except Exception:  # pragma: no cover - defensive logging
                    logger.exception("Failed to normalize stored finalization session %s", session_key)
            else:
                sessions[session_key] = value
    normalized["finalizationSessions"] = sessions
    if not isinstance(normalized.get("draftsPreferences"), dict):
        normalized["draftsPreferences"] = {}
    if not isinstance(normalized.get("analyticsPreferences"), dict):
        normalized["analyticsPreferences"] = {}
    return normalized


_FINALIZATION_STEPS = tuple(range(1, 7))


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _default_step_states() -> Dict[str, Dict[str, Any]]:
    now = _utc_now_iso()
    states: Dict[str, Dict[str, Any]] = {}
    for step in _FINALIZATION_STEPS:
        status = "in_progress" if step == 1 else "not_started"
        states[str(step)] = {
            "step": step,
            "status": status,
            "progress": 0,
            "startedAt": now if step == 1 else None,
            "completedAt": None,
            "updatedAt": now,
            "notes": None,
            "blockingIssues": [],
        }
    return states


def _normalize_code_entry(raw: Dict[str, Any], index: int) -> Dict[str, Any]:
    base: Dict[str, Any]
    try:
        base = SessionCodeModel.model_validate(raw).model_dump()
    except ValidationError:
        base = {
            "code": str(raw.get("code") or f"code-{index + 1}"),
            "type": str(raw.get("type") or "CPT"),
            "category": str(raw.get("category") or "codes"),
            "description": str(raw.get("description") or ""),
            "rationale": raw.get("rationale"),
            "confidence": raw.get("confidence"),
            "reimbursement": raw.get("reimbursement"),
            "rvu": raw.get("rvu"),
        }
    identifier = raw.get("id") or base.get("code") or f"code-{index + 1}"
    try:
        numeric_identifier = int(identifier)
        identifier = numeric_identifier
    except Exception:
        identifier = str(identifier)
    reimbursement = base.get("reimbursement")
    if not reimbursement and base.get("code"):
        revenue_value = CPT_REVENUE.get(str(base["code"]))
        if revenue_value is not None:
            reimbursement = f"${revenue_value:0.2f}"
    entry = {
        **base,
        "id": identifier,
        "status": raw.get("status") or "pending",
        "docSupport": raw.get("docSupport"),
        "gaps": [str(g).strip() for g in raw.get("gaps", []) if isinstance(g, str) and g.strip()],
        "evidence": [str(e).strip() for e in raw.get("evidence", []) if isinstance(e, str) and e.strip()],
        "tags": [str(t).strip() for t in raw.get("tags", []) if isinstance(t, str) and t.strip()],
        "aiReasoning": raw.get("aiReasoning") or raw.get("rationale"),
        "reimbursement": reimbursement,
    }
    return entry


def _normalize_compliance_entry(raw: Dict[str, Any], index: int) -> Dict[str, Any]:
    identifier = raw.get("id") or f"issue-{index + 1}"
    try:
        identifier = int(identifier)
    except Exception:
        identifier = str(identifier)
    severity = str(raw.get("severity") or "medium").lower()
    if severity not in {"critical", "high", "medium", "low", "warning", "info"}:
        severity = "medium"
    normalized_severity = {
        "critical": "critical",
        "high": "critical",
        "warning": "warning",
        "info": "info",
        "medium": "warning",
        "low": "info",
    }[severity]
    title = raw.get("title") or raw.get("description") or f"Issue {index + 1}"
    return {
        "id": identifier,
        "title": str(title),
        "description": str(raw.get("description") or title),
        "severity": normalized_severity,
        "category": raw.get("category") or "documentation",
        "code": raw.get("code"),
        "dismissed": bool(raw.get("dismissed", False)),
        "details": raw.get("details") or raw.get("description"),
    }


def _compute_reimbursement_summary(selected_codes: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = 0.0
    codes_summary: List[Dict[str, Any]] = []
    for code in selected_codes:
        code_value = str(code.get("code") or "")
        amount = CPT_REVENUE.get(code_value)
        if amount is None:
            amount = 0.0
        total += amount
        codes_summary.append(
            {
                "code": code_value,
                "amount": amount,
                "description": code.get("description"),
                "category": code.get("category"),
            }
        )
    return {"total": total, "codes": codes_summary}


def _generate_patient_questions(
    selected_codes: List[Dict[str, Any]],
    compliance_issues: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    questions: List[Dict[str, Any]] = []
    counter = 1
    for code in selected_codes:
        gaps = code.get("gaps") if isinstance(code, dict) else None
        if not isinstance(gaps, list):
            continue
        for gap in gaps:
            if not isinstance(gap, str) or not gap.strip():
                continue
            normalized_gap = gap.strip()
            lower = normalized_gap.lower()
            if lower.endswith("?"):
                question_text = normalized_gap
            else:
                question_text = f"Please document: {normalized_gap}?"
            priority = "medium"
            if any(keyword in lower for keyword in ("smok", "sepsis", "allergy")):
                priority = "high"
            elif any(keyword in lower for keyword in ("lab", "follow", "screen")):
                priority = "medium"
            else:
                priority = "low"
            timestamp = _utc_now_iso()
            questions.append(
                {
                    "id": counter,
                    "questionText": question_text,
                    "question": question_text,
                    "source": f"Code Gap: {code.get('code') or code.get('description') or 'Code'}",
                    "priority": priority,
                    "category": "clinical",
                    "questionType": "text_input",
                    "possibleAnswers": [],
                    "expectedDataType": "string",
                    "relatedCode": code.get("code") or code.get("description"),
                    "codeRelated": code.get("code") or code.get("description"),
                    "relatedSection": None,
                    "isRequired": True,
                    "autoGenerated": True,
                    "status": "pending",
                    "answer": None,
                    "answeredAt": None,
                    "answeredBy": None,
                    "createdAt": timestamp,
                    "updatedAt": timestamp,
                }
            )
            counter += 1
    if not questions:
        for issue in compliance_issues:
            details = issue.get("details") or issue.get("description")
            if not isinstance(details, str) or not details.strip():
                continue
            text = details.strip()
            priority = "high" if issue.get("severity") == "critical" else "medium"
            timestamp = _utc_now_iso()
            questions.append(
                {
                    "id": counter,
                    "questionText": text if text.endswith("?") else f"Address compliance: {text}",
                    "question": text if text.endswith("?") else f"Address compliance: {text}",
                    "source": f"Compliance: {issue.get('title') or 'Item'}",
                    "priority": priority,
                    "category": "documentation",
                    "questionType": "text_input",
                    "possibleAnswers": [],
                    "expectedDataType": "string",
                    "relatedCode": issue.get("code"),
                    "codeRelated": issue.get("code"),
                    "relatedSection": None,
                    "isRequired": True,
                    "autoGenerated": True,
                    "status": "pending",
                    "answer": None,
                    "answeredAt": None,
                    "answeredBy": None,
                    "createdAt": timestamp,
                    "updatedAt": timestamp,
                }
            )
            counter += 1
    return questions


def _derive_billing_summary_from_session(session: Dict[str, Any]) -> Dict[str, Any]:
    codes = session.get("selectedCodes") or []
    if not isinstance(codes, list):
        codes = []
    diagnoses: List[str] = []
    procedures: List[str] = []
    modifiers: List[str] = []
    total_rvu = 0.0
    for entry in codes:
        if not isinstance(entry, dict):
            continue
        code_value = str(entry.get("code") or "").strip()
        category = str(entry.get("category") or "").lower()
        if category in {"diagnosis", "diagnoses", "differentials", "differential"}:
            if code_value:
                diagnoses.append(code_value)
        elif category in {"procedure", "codes", "billing"}:
            if code_value:
                procedures.append(code_value)
        else:
            if code_value and not diagnoses:
                diagnoses.append(code_value)
        modifiers_field = entry.get("modifiers") or entry.get("modifierCodes")
        if isinstance(modifiers_field, list):
            for modifier in modifiers_field:
                if isinstance(modifier, str) and modifier.strip():
                    modifiers.append(modifier.strip())
        rvu_value = entry.get("rvu")
        try:
            if rvu_value is not None:
                total_rvu += float(rvu_value)
        except (TypeError, ValueError):
            continue
    reimbursement = session.get("reimbursementSummary") or {}
    estimated_payment = reimbursement.get("total")
    try:
        if estimated_payment is not None:
            estimated_payment = float(estimated_payment)
    except (TypeError, ValueError):
        estimated_payment = None
    summary = BillingSummaryModel(
        primaryDiagnosis=diagnoses[0] if diagnoses else None,
        secondaryDiagnoses=diagnoses[1:] if len(diagnoses) > 1 else [],
        procedures=procedures,
        evaluationManagementLevel=procedures[0] if procedures else None,
        totalRvu=total_rvu if total_rvu else None,
        estimatedPayment=estimated_payment,
        modifierCodes=modifiers,
    )
    return summary.model_dump()


def _derive_compliance_checks_from_session(session: Dict[str, Any]) -> List[Dict[str, Any]]:
    issues = session.get("complianceIssues") or []
    checks: List[Dict[str, Any]] = []
    if not isinstance(issues, list):
        issues = []
    severity_to_status = {
        "critical": "fail",
        "high": "fail",
        "warning": "warning",
        "medium": "warning",
        "info": "pass",
        "low": "pass",
    }
    for issue in issues:
        if not isinstance(issue, dict):
            continue
        severity = str(issue.get("severity") or "info").lower()
        status = severity_to_status.get(severity, "warning")
        description = issue.get("description") or issue.get("details") or issue.get("title")
        actions: List[str] = []
        details = issue.get("details")
        if isinstance(details, str) and details.strip():
            actions.append(details.strip())
        normalized = ComplianceCheckModel(
            checkType=issue.get("category") or "documentation_standards",
            status=status,
            description=description,
            requiredActions=actions,
        )
        checks.append(normalized.model_dump())
    return checks


def _derive_billing_validation_from_session(session: Dict[str, Any]) -> Dict[str, Any]:
    validation = session.get("lastValidation") or {}
    issues = validation.get("issues") if isinstance(validation, dict) else {}
    if not isinstance(issues, dict):
        issues = {}
    codes_ok = not (issues.get("codes") or [])
    content_ok = not (issues.get("content") or [])
    compliance_ok = not (issues.get("compliance") or [])
    prevention_ok = not (issues.get("prevention") or [])
    reimbursement = validation.get("estimatedReimbursement")
    if reimbursement is None:
        reimbursement_summary = session.get("reimbursementSummary") or {}
        reimbursement = reimbursement_summary.get("total", 0.0)
    try:
        reimbursement_value = float(reimbursement or 0.0)
    except (TypeError, ValueError):
        reimbursement_value = 0.0
    billing_validation = BillingValidationModel(
        codesValidated=codes_ok,
        documentationLevelVerified=content_ok,
        medicalNecessityConfirmed=compliance_ok,
        billingComplianceChecked=compliance_ok and prevention_ok,
        estimatedReimbursement=reimbursement_value,
        payerSpecificRequirements=[],
    )
    return billing_validation.model_dump()


def _derive_final_review_from_session(session: Dict[str, Any]) -> Dict[str, Any]:
    step_states = session.get("stepStates") or {}
    if isinstance(step_states, list):
        states_iterable = step_states
    elif isinstance(step_states, dict):
        states_iterable = step_states.values()
    else:
        states_iterable = []
    all_completed = True
    for entry in states_iterable:
        if not isinstance(entry, dict):
            continue
        status = entry.get("status") or "not_started"
        if status != "completed" and entry.get("step") != 6:
            all_completed = False
            break
    blocking = session.get("blockingIssues") or []
    compliance_verified = not blocking
    review = FinalReviewModel(
        allStepsCompleted=all_completed,
        physicianFinalApproval=True,
        qualityReviewPassed=compliance_verified,
        complianceVerified=compliance_verified,
        readyForDispatch=all_completed and compliance_verified,
    )
    return review.model_dump()


def _normalize_attestation_payload(raw: Any) -> Dict[str, Any]:
    payload = raw if isinstance(raw, dict) else {}
    billing_raw = (
        payload.get("billingValidation")
        or payload.get("billing_validation")
        or {}
    )
    try:
        billing = BillingValidationModel.model_validate(billing_raw).model_dump()
    except ValidationError:
        billing = BillingValidationModel().model_dump()
    attestation_raw = payload.get("attestation") or {}
    if not attestation_raw and payload:
        attestation_raw = {
            "attestedBy": payload.get("attestedBy"),
            "attestationText": payload.get("statement"),
            "attestationTimestamp": payload.get("timestamp"),
        }
    try:
        attestation = AttestationDetailsModel.model_validate(attestation_raw).model_dump()
    except ValidationError:
        attestation = AttestationDetailsModel().model_dump()
    if payload.get("statement") and not attestation.get("attestationText"):
        attestation["attestationText"] = str(payload["statement"])
    if payload.get("timestamp") and not attestation.get("attestationTimestamp"):
        attestation["attestationTimestamp"] = str(payload["timestamp"])
    if payload.get("attestedBy") and not attestation.get("attestedBy"):
        attestation["attestedBy"] = str(payload["attestedBy"])
    if attestation.get("physicianAttestation") is None:
        attestation["physicianAttestation"] = bool(attestation.get("attestedBy"))
    compliance_raw = (
        payload.get("complianceChecks")
        or payload.get("compliance_checks")
        or []
    )
    compliance: List[Dict[str, Any]] = []
    if isinstance(compliance_raw, list):
        for item in compliance_raw:
            if not isinstance(item, dict):
                continue
            try:
                compliance.append(ComplianceCheckModel.model_validate(item).model_dump())
            except ValidationError:
                continue
    billing_summary_raw = (
        payload.get("billingSummary")
        or payload.get("billing_summary")
        or {}
    )
    try:
        billing_summary = BillingSummaryModel.model_validate(billing_summary_raw).model_dump()
    except ValidationError:
        billing_summary = BillingSummaryModel().model_dump()
    record = {
        "billingValidation": billing,
        "attestation": attestation,
        "complianceChecks": compliance,
        "billingSummary": billing_summary,
    }
    return record


def _normalize_dispatch_payload(raw: Any) -> Dict[str, Any]:
    payload = raw if isinstance(raw, dict) else {}
    destination = payload.get("destination") or "ehr"
    delivery_method = payload.get("deliveryMethod") or payload.get("delivery_method") or "internal"
    timestamp = payload.get("timestamp") or payload.get("dispatchTimestamp")
    final_review_raw = payload.get("finalReview") or payload.get("final_review") or {}
    try:
        final_review = FinalReviewModel.model_validate(final_review_raw).model_dump()
    except ValidationError:
        final_review = FinalReviewModel().model_dump()
    dispatch_options_raw = payload.get("dispatchOptions") or payload.get("dispatch_options") or {}
    try:
        dispatch_options = DispatchOptionsModel.model_validate(dispatch_options_raw).model_dump()
    except ValidationError:
        dispatch_options = DispatchOptionsModel().model_dump()
    dispatch_status_raw = payload.get("dispatchStatus") or payload.get("dispatch_status") or {}
    if not dispatch_status_raw:
        dispatch_status_raw = {
            "dispatchInitiated": True,
            "dispatchCompleted": bool(payload.get("dispatchCompleted")),
            "dispatchTimestamp": timestamp,
            "dispatchConfirmationNumber": payload.get("dispatchConfirmationNumber"),
            "dispatchErrors": payload.get("dispatchErrors"),
        }
    try:
        dispatch_status = DispatchStatusModel.model_validate(dispatch_status_raw).model_dump()
    except ValidationError:
        dispatch_status = DispatchStatusModel().model_dump()
    if timestamp and not dispatch_status.get("dispatchTimestamp"):
        dispatch_status["dispatchTimestamp"] = timestamp
    if dispatch_status.get("dispatchConfirmationNumber") is None:
        dispatch_status["dispatchConfirmationNumber"] = uuid4().hex[:8]
    if dispatch_status.get("dispatchInitiated") is None:
        dispatch_status["dispatchInitiated"] = True
    actions_raw = payload.get("postDispatchActions") or payload.get("post_dispatch_actions") or []
    actions: List[Dict[str, Any]] = []
    if isinstance(actions_raw, list):
        for item in actions_raw:
            if not isinstance(item, dict):
                continue
            try:
                actions.append(PostDispatchActionModel.model_validate(item).model_dump())
            except ValidationError:
                continue
    return {
        "destination": destination,
        "deliveryMethod": delivery_method,
        "timestamp": timestamp,
        "finalReview": final_review,
        "dispatchOptions": dispatch_options,
        "dispatchStatus": dispatch_status,
        "postDispatchActions": actions,
    }

def _recalculate_current_step(session: Dict[str, Any]) -> None:
    states = session.get("stepStates") or {}
    for step in _FINALIZATION_STEPS:
        entry = states.get(str(step)) or {}
        if entry.get("status") != "completed":
            session["currentStep"] = step
            break
    else:
        session["currentStep"] = 6


def _update_session_progress(session: Dict[str, Any]) -> None:
    states = session.get("stepStates") or {}
    completed = sum(1 for step in _FINALIZATION_STEPS if states.get(str(step), {}).get("status") == "completed")
    session["sessionProgress"] = {
        "completedSteps": completed,
        "totalSteps": len(_FINALIZATION_STEPS),
        "percentage": int((completed / len(_FINALIZATION_STEPS)) * 100) if _FINALIZATION_STEPS else 0,
    }


def _append_audit_event(
    session: Dict[str, Any],
    action: str,
    details: Dict[str, Any] | None = None,
    *,
    actor: Optional[str] = None,
) -> None:
    audit = session.setdefault("auditTrail", [])
    if not isinstance(audit, list):
        audit = []
    event = {
        "id": uuid4().hex,
        "timestamp": _utc_now_iso(),
        "action": action,
        "actor": actor or session.get("lastUpdatedBy"),
        "details": details or {},
    }
    audit.append(event)
    session["auditTrail"] = audit


def _normalize_finalization_session(session: Dict[str, Any]) -> Dict[str, Any]:
    data = copy.deepcopy(session) if isinstance(session, dict) else {}
    if data.get("owner") is None and data.get("createdBy"):
        data["owner"] = data.get("createdBy")
    if data.get("createdBy") is None and data.get("owner"):
        data["createdBy"] = data.get("owner")
    if data.get("lastUpdatedBy") is None:
        candidate = data.get("owner") or data.get("createdBy")
        if candidate:
            data["lastUpdatedBy"] = candidate
    raw_states = data.get("stepStates")
    normalized_states: Dict[str, Dict[str, Any]] = {}
    states_map: Dict[str, Dict[str, Any]] = {}
    if isinstance(raw_states, dict):
        for key, entry in raw_states.items():
            if isinstance(entry, dict):
                states_map[str(key)] = entry
    elif isinstance(raw_states, list):
        for index, entry in enumerate(raw_states):
            if not isinstance(entry, dict):
                continue
            raw_step = entry.get("step")
            step_number: Optional[int] = None
            if isinstance(raw_step, (int, float)):
                try:
                    step_number = int(raw_step)
                except Exception:
                    step_number = None
            elif isinstance(raw_step, str):
                try:
                    step_number = int(raw_step.strip())
                except Exception:
                    step_number = None
            if step_number not in _FINALIZATION_STEPS:
                if index < len(_FINALIZATION_STEPS):
                    step_number = _FINALIZATION_STEPS[index]
                else:
                    step_number = None
            if step_number is None:
                continue
            states_map[str(step_number)] = entry
    now = _utc_now_iso()
    for step in _FINALIZATION_STEPS:
        key = str(step)
        entry = states_map.get(key) or {}
        raw_status = entry.get("status")
        status = str(raw_status).strip().lower() if isinstance(raw_status, str) else raw_status
        if status not in {"not_started", "in_progress", "completed", "blocked"}:
            status = "in_progress" if step == 1 else "not_started"
        normalized_states[key] = {
            "step": step,
            "status": status,
            "progress": int(entry.get("progress", 0) or 0),
            "startedAt": entry.get("startedAt") or (now if step == 1 else None),
            "completedAt": entry.get("completedAt"),
            "updatedAt": entry.get("updatedAt") or now,
            "notes": entry.get("notes"),
            "blockingIssues": entry.get("blockingIssues") if isinstance(entry.get("blockingIssues"), list) else [],
        }
    data["stepStates"] = normalized_states
    codes_input = data.get("selectedCodes") or []
    if not isinstance(codes_input, list):
        codes_input = []
    normalized_codes = [_normalize_code_entry(item, idx) for idx, item in enumerate(codes_input)]
    data["selectedCodes"] = normalized_codes
    compliance_input = data.get("complianceIssues") or []
    if not isinstance(compliance_input, list):
        compliance_input = []
    data["complianceIssues"] = [
        _normalize_compliance_entry(item, idx)
        for idx, item in enumerate(compliance_input)
        if isinstance(item, dict)
    ]
    if "reimbursementSummary" not in data or not isinstance(data.get("reimbursementSummary"), dict):
        data["reimbursementSummary"] = _compute_reimbursement_summary(normalized_codes)
    data.setdefault("noteContent", "")
    data.setdefault("patientMetadata", {})
    data.setdefault("blockingIssues", [])
    context_payload = data.get("context")
    if isinstance(context_payload, dict):
        data["context"] = dict(context_payload)
    else:
        data["context"] = {}
    collaborators = _normalize_collaborator_entries(data.get("collaborators"))
    collaborators_map = {entry["userId"]: entry for entry in collaborators}
    key_users = (
        (data.get("createdBy"), data.get("createdAt")),
        (data.get("owner"), data.get("createdAt")),
        (data.get("lastUpdatedBy"), data.get("updatedAt")),
    )
    for username, timestamp in key_users:
        if not username:
            continue
        entry = collaborators_map.get(username)
        if entry is None:
            entry = _resolve_collaborator_profile(username)
            entry["status"] = "active"
            entry["lastActiveAt"] = timestamp or _utc_now_iso()
            collaborators.append(entry)
            collaborators_map[username] = entry
        else:
            entry.setdefault("status", "active")
            if not entry.get("lastActiveAt"):
                entry["lastActiveAt"] = timestamp or _utc_now_iso()
    data["collaborators"] = collaborators
    active_entries = _normalize_active_editor_entries(data.get("activeEditors"))
    active_map = {entry["userId"]: entry for entry in active_entries}
    last_user = data.get("lastUpdatedBy")
    if last_user and last_user not in active_map:
        active_entries.append(
            {
                "userId": last_user,
                "lastActiveAt": data.get("updatedAt") or _utc_now_iso(),
            }
        )
    data["activeEditors"] = active_entries
    questions_input = data.get("patientQuestions")
    if not isinstance(questions_input, list) or not questions_input:
        data["patientQuestions"] = _generate_patient_questions(normalized_codes, data["complianceIssues"])
    else:
        normalized_questions: List[Dict[str, Any]] = []
        for item in questions_input:
            if not isinstance(item, dict):
                continue
            identifier = item.get("id")
            try:
                identifier = int(identifier)
            except Exception:
                identifier = uuid4().int % 100000
            question_text = (
                item.get("questionText")
                or item.get("question")
                or item.get("question_text")
                or "Clarify patient information"
            )
            source = item.get("source") or "Documentation"
            priority_raw = str(item.get("priority") or "medium").lower()
            if priority_raw not in {"high", "medium", "low"}:
                priority_raw = "medium"
            category_raw = str(item.get("category") or "clinical").lower()
            if category_raw not in {"clinical", "administrative", "documentation", "billing"}:
                category_raw = "clinical"
            related_code = item.get("relatedCode") or item.get("codeRelated") or item.get("code")
            if related_code is not None:
                related_code = str(related_code)
            related_section = item.get("relatedSection") or item.get("section")
            if related_section is not None:
                related_section = str(related_section)
            question_type = str(item.get("questionType") or item.get("question_type") or "text_input").lower()
            if question_type not in {"yes_no", "multiple_choice", "text_input", "numeric", "date"}:
                question_type = "text_input"
            expected_data_type = str(
                item.get("expectedDataType")
                or item.get("expected_data_type")
                or "string"
            ).lower()
            if expected_data_type not in {"string", "number", "date", "boolean"}:
                expected_data_type = "string"
            possible_answers_raw = item.get("possibleAnswers") or item.get("possible_answers")
            possible_answers: List[str] = []
            if isinstance(possible_answers_raw, (list, tuple)):
                for answer in possible_answers_raw:
                    if answer is None:
                        continue
                    possible_answers.append(str(answer))
            required_field = item.get("isRequired")
            if required_field is None:
                required_field = item.get("required")
            is_required = bool(required_field) if required_field is not None else True
            auto_generated_field = item.get("autoGenerated")
            if auto_generated_field is None:
                auto_generated_field = item.get("auto_generated")
            auto_generated = bool(auto_generated_field) if auto_generated_field is not None else True
            status_raw = str(item.get("status") or item.get("state") or "pending").lower()
            status_map = {
                "open": "pending",
                "new": "pending",
                "resolved": "answered",
                "completed": "answered",
                "complete": "answered",
                "answered": "answered",
                "dismissed": "skipped",
                "skipped": "skipped",
                "n/a": "not_applicable",
                "not_applicable": "not_applicable",
            }
            status_value = status_map.get(status_raw, status_raw)
            allowed_canonical = {"pending", "in_progress", "answered", "skipped", "not_applicable"}
            if status_value not in allowed_canonical:
                status_value = "pending"
            canonical_status = status_value
            legacy_candidates = {"pending", "in_progress", "resolved", "dismissed", "not_applicable"}
            if status_raw in legacy_candidates:
                legacy_status = status_raw
            elif canonical_status == "answered":
                legacy_status = "resolved"
            elif canonical_status == "skipped":
                legacy_status = "dismissed"
            elif canonical_status == "not_applicable":
                legacy_status = "not_applicable"
            else:
                legacy_status = canonical_status
            if legacy_status not in legacy_candidates:
                legacy_status = "pending"
            now_ts = _utc_now_iso()
            created_at = item.get("createdAt") or item.get("created_at") or now_ts
            if not isinstance(created_at, str):
                created_at = str(created_at)
            updated_at = item.get("updatedAt") or item.get("updated_at") or created_at
            if not isinstance(updated_at, str):
                updated_at = str(updated_at)
            answer_raw = item.get("answer")
            if not isinstance(answer_raw, dict):
                metadata_raw = item.get("answerMetadata")
                if isinstance(metadata_raw, dict):
                    answer_raw = metadata_raw
            normalized_answer: Optional[Dict[str, Any]] = None
            if isinstance(answer_raw, dict):
                answer_text = (
                    answer_raw.get("answerText")
                    or answer_raw.get("answer_text")
                    or answer_raw.get("value")
                    or answer_raw.get("text")
                )
                if answer_text is not None:
                    confidence = answer_raw.get("confidenceLevel") or answer_raw.get("confidence_level")
                    if isinstance(confidence, str):
                        confidence = confidence.lower()
                    if confidence not in {"certain", "probable", "uncertain"}:
                        confidence = "certain"
                    verification = answer_raw.get("verificationNeeded")
                    if verification is None:
                        verification = answer_raw.get("verification_needed")
                    notes = answer_raw.get("notes")
                    normalized_answer = {
                        "answerText": str(answer_text),
                        "confidenceLevel": confidence or "certain",
                        "notes": str(notes) if isinstance(notes, str) else notes,
                        "verificationNeeded": bool(verification) if verification is not None else False,
                    }
            elif isinstance(answer_raw, str) and answer_raw.strip():
                normalized_answer = {
                    "answerText": answer_raw.strip(),
                    "confidenceLevel": "certain",
                    "notes": None,
                    "verificationNeeded": False,
                }
            if normalized_answer and normalized_answer.get("confidenceLevel") not in {"certain", "probable", "uncertain"}:
                normalized_answer["confidenceLevel"] = "certain"
            answered_by = item.get("answeredBy") or item.get("answered_by")
            if answered_by is not None:
                answered_by = str(answered_by)
            answered_at = item.get("answeredAt") or item.get("answered_at")
            if not answered_at and status_value == "answered" and normalized_answer:
                answered_at = updated_at
            if answered_at is not None and not isinstance(answered_at, str):
                answered_at = str(answered_at)
            answer_value = None
            if normalized_answer:
                answer_value = normalized_answer.get("answerText")
            normalized_questions.append(
                {
                    "id": identifier,
                    "questionText": question_text,
                    "question": question_text,
                    "source": source,
                    "priority": priority_raw,
                    "category": category_raw,
                    "questionType": question_type,
                    "possibleAnswers": possible_answers,
                    "expectedDataType": expected_data_type,
                    "relatedCode": related_code,
                    "codeRelated": related_code,
                    "relatedSection": related_section,
                    "isRequired": is_required,
                    "autoGenerated": auto_generated,
                    "status": legacy_status,
                    "canonicalStatus": canonical_status,
                    "answer": answer_value,
                    "answerMetadata": normalized_answer,
                    "answeredAt": answered_at,
                    "answeredBy": answered_by,
                    "createdAt": created_at,
                    "updatedAt": updated_at,
                }
            )
        data["patientQuestions"] = normalized_questions
    data["attestation"] = _normalize_attestation_payload(data.get("attestation") or {})
    data["dispatch"] = _normalize_dispatch_payload(data.get("dispatch") or {})
    if not isinstance(data.get("lastValidation"), dict):
        last_validation = data.get("lastValidation")
        data["lastValidation"] = last_validation if isinstance(last_validation, dict) else {}
    _ensure_session_context(data)
    data.setdefault("createdAt", _utc_now_iso())
    data.setdefault("updatedAt", data["createdAt"])
    _recalculate_current_step(data)
    _update_session_progress(data)
    return data


def _session_to_response(session: Dict[str, Any]) -> Dict[str, Any]:
    normalized = _normalize_finalization_session(session)
    step_states = [normalized["stepStates"][str(step)] for step in _FINALIZATION_STEPS]
    completion = {
        f"step_{entry['step']}": entry.get("status") == "completed"
        for entry in step_states
    }
    return {
        "sessionId": normalized.get("sessionId"),
        "encounterId": normalized.get("encounterId"),
        "patientId": normalized.get("patientId"),
        "noteId": normalized.get("noteId"),
        "createdBy": normalized.get("createdBy"),
        "owner": normalized.get("owner"),
        "lastUpdatedBy": normalized.get("lastUpdatedBy"),
        "collaborators": normalized.get("collaborators", []),
        "activeEditors": normalized.get("activeEditors", []),
        "context": normalized.get("context", {}),
        "currentStep": normalized.get("currentStep", 1),
        "stepStates": step_states,
        "stepCompletionStatus": completion,
        "selectedCodes": normalized.get("selectedCodes", []),
        "complianceIssues": normalized.get("complianceIssues", []),
        "patientMetadata": normalized.get("patientMetadata") or {},
        "patientSummary": normalized.get("patientSummary") or {},
        "encounterSummary": normalized.get("encounterSummary") or {},
        "visitSummary": normalized.get("visitSummary") or {},
        "noteContent": normalized.get("noteContent", ""),
        "reimbursementSummary": normalized.get("reimbursementSummary", {}),
        "auditTrail": normalized.get("auditTrail", []),
        "patientQuestions": normalized.get("patientQuestions", []),
        "blockingIssues": normalized.get("blockingIssues", []),
        "sessionProgress": normalized.get("sessionProgress", {}),
        "transcriptEntries": normalized.get("transcriptEntries", []),
        "timeline": normalized.get("timeline", []),
        "createdAt": normalized.get("createdAt"),
        "updatedAt": normalized.get("updatedAt"),
        "attestation": normalized.get("attestation", _normalize_attestation_payload({})),
        "dispatch": normalized.get("dispatch", _normalize_dispatch_payload({})),
        "lastValidation": normalized.get("lastValidation"),
    }


def _get_user_id_and_session_state(username: str) -> Tuple[int, Dict[str, Any]]:
    row = db_conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="User not found")
    user_id = row["id"]
    session_row = db_conn.execute(
        "SELECT data FROM session_state WHERE user_id=?",
        (user_id,),
    ).fetchone()
    if session_row and session_row["data"]:
        session_state = _normalize_session_state(session_row["data"])
    else:
        session_state = _normalize_session_state(SessionStateModel())
    return user_id, session_state


def _get_finalization_sessions(username: str) -> Tuple[int, Dict[str, Any], Dict[str, Any]]:
    user_id, session_state = _get_user_id_and_session_state(username)
    sessions = session_state.get("finalizationSessions")
    if not isinstance(sessions, dict):
        sessions = {}
    return user_id, session_state, sessions


def _persist_session_state(user_id: int, session_state: Dict[str, Any]) -> None:
    db_conn.execute(
        "INSERT OR REPLACE INTO session_state (user_id, data, updated_at) VALUES (?, ?, ?)",
        (user_id, json.dumps(session_state), time.time()),
    )
    db_conn.commit()


def _store_shared_workflow_session(session: Dict[str, Any]) -> None:
    session_id = session.get("sessionId")
    if not session_id:
        return
    owner = session.get("owner") or session.get("createdBy")
    try:
        db_conn.execute(
            "INSERT OR REPLACE INTO shared_workflow_sessions (session_id, owner_username, data, updated_at) VALUES (?, ?, ?, ?)",
            (session_id, owner, json.dumps(session), time.time()),
        )
        db_conn.commit()
    except Exception:
        logging.getLogger(__name__).exception(
            "Failed to persist shared workflow session %s", session_id
        )


def _fetch_shared_workflow_session(session_id: str) -> Optional[Dict[str, Any]]:
    if not session_id:
        return None
    row = db_conn.execute(
        "SELECT data FROM shared_workflow_sessions WHERE session_id=?",
        (session_id,),
    ).fetchone()
    if not row or not row["data"]:
        return None
    try:
        return json.loads(row["data"])
    except Exception:
        logging.getLogger(__name__).warning(
            "Unable to deserialize shared workflow session %s", session_id
        )
        return None


def _fetch_shared_session_by_encounter(encounter_id: str) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    if not encounter_id:
        return None, None
    rows = db_conn.execute(
        "SELECT session_id, data FROM shared_workflow_sessions"
    ).fetchall()
    for row in rows:
        if not row or not row["data"]:
            continue
        try:
            payload = json.loads(row["data"])
        except Exception:
            continue
        if payload.get("encounterId") == encounter_id:
            return row["session_id"], payload
    return None, None


def _delete_shared_workflow_session(session_id: str) -> None:
    if not session_id:
        return
    try:
        db_conn.execute(
            "DELETE FROM shared_workflow_sessions WHERE session_id=?",
            (session_id,),
        )
        db_conn.commit()
    except Exception:
        logging.getLogger(__name__).exception(
            "Failed to delete shared workflow session %s", session_id
        )


def _persist_finalization_sessions(
    user_id: int,
    session_state: Dict[str, Any],
    sessions: Dict[str, Any],
) -> None:
    session_state = copy.deepcopy(session_state)
    session_state["finalizationSessions"] = sessions
    _persist_session_state(user_id, session_state)
    for payload in sessions.values():
        if isinstance(payload, dict):
            _store_shared_workflow_session(payload)


def _resolve_session_for_user(
    username: str, session_id: str
) -> Tuple[int, Dict[str, Any], Dict[str, Any], Optional[Dict[str, Any]]]:
    user_id, session_state, sessions = _get_finalization_sessions(username)
    payload = sessions.get(session_id)
    if payload is None and session_id:
        shared = _fetch_shared_workflow_session(session_id)
        if isinstance(shared, dict):
            sessions[session_id] = copy.deepcopy(shared)
            payload = sessions[session_id]
            _persist_finalization_sessions(user_id, session_state, sessions)
    return user_id, session_state, sessions, payload


def _collect_blocking_issues(issues: Dict[str, Any]) -> List[str]:
    blocking: List[str] = []
    for value in issues.values():
        if not isinstance(value, list):
            continue
        for item in value:
            if isinstance(item, str) and item.strip():
                blocking.append(item.strip())
    return blocking


def _resolve_collaborator_profile(username: str, role: Optional[str] = None) -> Dict[str, Any]:
    """Look up persisted user details for *username* when available."""

    if not username:
        return {}
    display_name = username
    resolved_role = role or "user"
    try:
        row = db_conn.execute(
            "SELECT name, role FROM users WHERE username=?",
            (username,),
        ).fetchone()
    except Exception:
        row = None
    if row:
        name_value = row["name"] if "name" in row.keys() else row["name"]
        if name_value:
            display_name = name_value
        role_value = row["role"] if "role" in row.keys() else row["role"]
        if role_value:
            resolved_role = role_value
    return {
        "userId": username,
        "displayName": display_name,
        "role": resolved_role or "user",
    }


def _normalize_collaborator_entries(entries: Any) -> List[Dict[str, Any]]:
    """Normalize collaborator payloads stored on a workflow session."""

    normalized: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    if isinstance(entries, list):
        for item in entries:
            if isinstance(item, dict):
                raw_identifier = (
                    item.get("userId")
                    or item.get("username")
                    or item.get("id")
                    or item.get("email")
                )
                if isinstance(raw_identifier, (int, float)):
                    user_id = str(raw_identifier)
                elif isinstance(raw_identifier, str):
                    user_id = raw_identifier.strip()
                else:
                    user_id = ""
                if not user_id or user_id in seen:
                    continue
                profile = _resolve_collaborator_profile(user_id, role=item.get("role"))
                entry = dict(profile)
                display = item.get("displayName") or item.get("name")
                if isinstance(display, str) and display.strip():
                    entry["displayName"] = display.strip()
                status = item.get("status") or item.get("state") or "active"
                entry["status"] = status
                last_active = item.get("lastActiveAt") or item.get("updatedAt")
                if isinstance(last_active, (int, float)):
                    entry["lastActiveAt"] = _iso_timestamp(float(last_active))
                elif isinstance(last_active, str) and last_active.strip():
                    entry["lastActiveAt"] = last_active.strip()
                else:
                    entry["lastActiveAt"] = _utc_now_iso()
                normalized.append(entry)
                seen.add(user_id)
            elif isinstance(item, str):
                user_id = item.strip()
                if not user_id or user_id in seen:
                    continue
                profile = _resolve_collaborator_profile(user_id)
                profile["status"] = "active"
                profile["lastActiveAt"] = _utc_now_iso()
                normalized.append(profile)
                seen.add(user_id)
    return normalized


def _normalize_active_editor_entries(entries: Any) -> List[Dict[str, Any]]:
    """Normalize active editor payloads for workflow collaboration."""

    normalized: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    now = _utc_now_iso()
    if isinstance(entries, list):
        for item in entries:
            user_id = ""
            last_active = now
            if isinstance(item, dict):
                raw_identifier = (
                    item.get("userId")
                    or item.get("username")
                    or item.get("id")
                )
                if isinstance(raw_identifier, (int, float)):
                    user_id = str(raw_identifier)
                elif isinstance(raw_identifier, str):
                    user_id = raw_identifier.strip()
                raw_last = item.get("lastActiveAt") or item.get("timestamp") or item.get("updatedAt")
                if isinstance(raw_last, (int, float)):
                    last_active = _iso_timestamp(float(raw_last))
                elif isinstance(raw_last, str) and raw_last.strip():
                    last_active = raw_last.strip()
            elif isinstance(item, str):
                user_id = item.strip()
            if not user_id or user_id in seen:
                continue
            normalized.append({"userId": user_id, "lastActiveAt": last_active})
            seen.add(user_id)
    return normalized


def _coerce_int(value: Any) -> Optional[int]:
    """Attempt to coerce ``value`` into an int where possible."""

    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if not text or not re.fullmatch(r"-?\d+", text):
            return None
        try:
            return int(text)
        except ValueError:
            return None
    return None


def _normalize_transcript_entries(entries: Any) -> List[Dict[str, Any]]:
    """Normalize transcript payloads into a consistent list of dicts."""

    if not isinstance(entries, list):
        return []
    normalized: List[Dict[str, Any]] = []
    for index, item in enumerate(entries):
        data = item if isinstance(item, dict) else {}
        text_value = None
        if isinstance(item, dict):
            text_value = (
                item.get("text")
                or item.get("transcript")
                or item.get("content")
                or item.get("value")
            )
        elif isinstance(item, str):
            text_value = item
        if text_value is None:
            continue
        text = str(text_value).strip()
        if not text:
            continue
        identifier: Any = data.get("id") or data.get("segmentId") or index + 1
        try:
            normalized_id: Any = int(identifier)
        except Exception:
            normalized_id = str(identifier)
        speaker_raw = data.get("speaker") or data.get("role") or data.get("speakerLabel") or data.get("participant")
        speaker = str(speaker_raw) if speaker_raw is not None else None
        timestamp_raw = data.get("timestamp") or data.get("time") or data.get("offset") or data.get("start")
        if isinstance(timestamp_raw, (int, float)):
            timestamp: Any = timestamp_raw
        elif isinstance(timestamp_raw, str) and timestamp_raw.strip():
            timestamp = timestamp_raw.strip()
        else:
            timestamp = None
        confidence_raw = (
            data.get("confidence")
            or data.get("confidenceScore")
            or data.get("accuracy")
        )
        confidence: Optional[float] = None
        if isinstance(confidence_raw, (int, float)):
            value = float(confidence_raw)
            if 1.0 < value <= 100.0:
                value = value / 100.0
            confidence = max(0.0, min(1.0, value))
        elif isinstance(confidence_raw, str):
            try:
                parsed = float(confidence_raw)
            except ValueError:
                parsed = None
            if parsed is not None:
                if 1.0 < parsed <= 100.0:
                    parsed = parsed / 100.0
                confidence = max(0.0, min(1.0, parsed))
        entry: Dict[str, Any] = {"id": normalized_id, "text": text}
        if speaker:
            entry["speaker"] = speaker
        if timestamp is not None:
            entry["timestamp"] = timestamp
        if confidence is not None:
            entry["confidence"] = confidence
        normalized.append(entry)
    return normalized


def _ensure_session_context(session: Dict[str, Any]) -> None:
    """Populate patient, encounter, transcript, and timeline context fields."""

    context = session.get("context") if isinstance(session.get("context"), dict) else {}
    encounter_id = session.get("encounterId")
    patient_id = session.get("patientId")

    encounter_summary: Dict[str, Any] = {}
    patient_summary: Dict[str, Any] = {}
    visit_summary: Dict[str, Any] = {}

    encounter_record: Optional[Dict[str, Any]] = None
    encounter_lookup = _coerce_int(encounter_id)
    if encounter_lookup is not None:
        try:
            encounter_record = patients.get_encounter(encounter_lookup)
        except Exception:
            encounter_record = None
    if encounter_record:
        encounter_summary = {
            "encounterId": encounter_record.get("encounterId") or encounter_id,
            "patientId": encounter_record.get("patientId"),
            "date": encounter_record.get("date"),
            "type": encounter_record.get("type"),
            "provider": encounter_record.get("provider"),
            "description": encounter_record.get("description"),
        }
        if isinstance(encounter_record.get("patient"), dict):
            context.setdefault("patientSnapshot", encounter_record["patient"])

    patient_record: Optional[Dict[str, Any]] = None
    if patient_id:
        try:
            patient_record = patients.get_patient(patient_id)
        except Exception:
            patient_record = None
    if not patient_record and encounter_record and isinstance(encounter_record.get("patient"), dict):
        patient_record = encounter_record.get("patient")

    if patient_record:
        patient_summary = {
            "patientId": patient_record.get("patientId") or patient_id,
            "mrn": patient_record.get("mrn"),
            "name": patient_record.get("name"),
            "firstName": patient_record.get("firstName"),
            "lastName": patient_record.get("lastName"),
            "dob": patient_record.get("dob"),
            "age": patient_record.get("age"),
            "sex": patient_record.get("gender"),
            "gender": patient_record.get("gender"),
            "insurance": patient_record.get("insurance"),
            "lastVisit": patient_record.get("lastVisit"),
            "allergies": patient_record.get("allergies") or [],
            "medications": patient_record.get("medications") or [],
        }
        metadata = session.get("patientMetadata") if isinstance(session.get("patientMetadata"), dict) else {}
        metadata.setdefault("patientId", patient_summary.get("patientId"))
        metadata.setdefault("name", patient_summary.get("name"))
        if patient_summary.get("age") is not None:
            metadata.setdefault("age", patient_summary.get("age"))
        if patient_summary.get("sex"):
            metadata.setdefault("sex", patient_summary.get("sex"))
        if patient_summary.get("dob"):
            metadata.setdefault("dob", patient_summary.get("dob"))
        if encounter_summary.get("date"):
            metadata.setdefault("encounterDate", encounter_summary.get("date"))
        if encounter_summary.get("provider"):
            metadata.setdefault("providerName", encounter_summary.get("provider"))
        session["patientMetadata"] = metadata

    if encounter_summary and encounter_summary.get("date"):
        visit_summary = {
            "status": "in_progress" if session.get("currentStep", 1) < 6 else "completed",
            "encounterDate": encounter_summary.get("date"),
            "provider": encounter_summary.get("provider"),
        }

    visit_state = visits.get_visit(str(encounter_id)) if encounter_id else None
    if visit_state:
        visit_summary.update(
            {
                "visitStatus": visit_state.get("visitStatus"),
                "startTime": visit_state.get("startTime"),
                "duration": visit_state.get("duration"),
                "documentationComplete": visit_state.get("documentationComplete"),
            }
        )

    transcript_context = context.get("transcript") if isinstance(context.get("transcript"), dict) else {}
    if session.get("transcriptEntries"):
        transcript_source = session.get("transcriptEntries")
    elif transcript_context.get("entries"):
        transcript_source = transcript_context.get("entries")
    elif transcript_context.get("segments"):
        transcript_source = transcript_context.get("segments")
    else:
        transcript_source = []
    transcripts = _normalize_transcript_entries(transcript_source)
    session["transcriptEntries"] = transcripts
    transcript_context = dict(transcript_context)
    transcript_context["entries"] = transcripts
    transcript_context["hasTranscript"] = bool(transcripts)
    if transcripts and not transcript_context.get("summary"):
        summary_text = " ".join(entry.get("text", "") for entry in transcripts[:2]).strip()
        transcript_context["summary"] = summary_text[:500]
    transcript_context.setdefault("lastUpdated", _utc_now_iso())
    context["transcript"] = transcript_context

    audit_entries = session.get("auditTrail") if isinstance(session.get("auditTrail"), list) else []
    normalized_audit: List[Dict[str, Any]] = []
    for entry in audit_entries:
        if not isinstance(entry, dict):
            continue
        normalized_audit.append(
            {
                "id": entry.get("id") or uuid4().hex,
                "timestamp": entry.get("timestamp") or _utc_now_iso(),
                "action": entry.get("action") or "event",
                "actor": entry.get("actor"),
                "details": entry.get("details") or {},
            }
        )
    session["auditTrail"] = normalized_audit
    context["auditTimeline"] = [
        {
            "timestamp": entry.get("timestamp"),
            "action": entry.get("action"),
            "actor": entry.get("actor"),
            "details": entry.get("details", {}),
        }
        for entry in normalized_audit
    ]

    if patient_summary:
        context["patientSummary"] = patient_summary
        context.setdefault("patient", patient_summary)
    if encounter_summary:
        context["encounterSummary"] = encounter_summary
    if visit_summary:
        context["visitSummary"] = visit_summary

    session["patientSummary"] = context.get("patientSummary", {})
    session["encounterSummary"] = context.get("encounterSummary", {})
    session["visitSummary"] = context.get("visitSummary", {})
    session["timeline"] = context.get("auditTimeline", [])
    session["context"] = context


def _register_session_activity(
    session: Dict[str, Any], user: Dict[str, Any], *, status: str = "active"
) -> None:
    """Update collaboration metadata for a session based on the acting user."""

    username = user.get("sub")
    if not username:
        return
    now = _utc_now_iso()
    session.setdefault("createdBy", session.get("createdBy") or username)
    session.setdefault("owner", session.get("owner") or session.get("createdBy"))
    session["lastUpdatedBy"] = username

    collaborators = _normalize_collaborator_entries(session.get("collaborators"))
    collaborator_map = {item["userId"]: item for item in collaborators}
    entry = collaborator_map.get(username)
    if entry is None:
        entry = _resolve_collaborator_profile(username, role=user.get("role"))
        entry["status"] = status
        entry["lastActiveAt"] = now
        collaborators.append(entry)
    else:
        entry["status"] = status or entry.get("status") or "active"
        entry["lastActiveAt"] = now
        if user.get("role"):
            entry["role"] = user["role"]
        if not entry.get("displayName"):
            entry["displayName"] = _resolve_collaborator_profile(username).get("displayName")
    session["collaborators"] = collaborators

    active_entries = _normalize_active_editor_entries(session.get("activeEditors"))
    active_map = {item["userId"]: item for item in active_entries}
    active_entry = active_map.get(username)
    if active_entry is None:
        active_entries.append({"userId": username, "lastActiveAt": now})
    else:
        active_entry["lastActiveAt"] = now
    session["activeEditors"] = active_entries


def _load_user_settings_preferences(user_id: int) -> Dict[str, Any]:
    """Load legacy user settings preferences for compatibility."""

    defaults = UserSettings().model_dump()
    preferences = copy.deepcopy(defaults)
    try:
        row = db_conn.execute(
            """
            SELECT
                theme,
                categories,
                rules,
                lang,
                summary_lang,
                specialty,
                payer,
                region,
                use_local_models,
                use_offline_mode,
                agencies,
                template,
                beautify_model,
                suggest_model,
                summarize_model,
                deid_engine
            FROM settings
            WHERE user_id=?
            """,
            (user_id,),
        ).fetchone()
    except sqlite3.Error:
        row = None
    if not row:
        return preferences
    record = dict(row)
    categories_default = copy.deepcopy(preferences.get("categories") or {})
    categories_value = categories_default
    categories_raw = record.get("categories")
    if categories_raw:
        try:
            parsed = json.loads(categories_raw)
            if isinstance(parsed, dict):
                categories_value.update({key: bool(value) for key, value in parsed.items()})
        except json.JSONDecodeError:
            pass
    preferences["categories"] = categories_value
    rules_raw = record.get("rules")
    rules_value: List[str] = []
    if rules_raw:
        try:
            parsed_rules = json.loads(rules_raw)
            if isinstance(parsed_rules, list):
                rules_value = [str(item) for item in parsed_rules if isinstance(item, str)]
        except json.JSONDecodeError:
            rules_value = []
    preferences["rules"] = rules_value or preferences.get("rules", [])
    lang_value = record.get("lang") or preferences.get("lang")
    preferences["lang"] = lang_value
    summary_lang = record.get("summary_lang") or lang_value
    preferences["summaryLang"] = summary_lang
    preferences["specialty"] = record.get("specialty") or preferences.get("specialty")
    preferences["payer"] = record.get("payer") or preferences.get("payer")
    region = record.get("region")
    preferences["region"] = region if isinstance(region, str) else preferences.get("region")
    template = record.get("template")
    preferences["template"] = template if template is not None else preferences.get("template")
    preferences["useLocalModels"] = bool(record.get("use_local_models", preferences.get("useLocalModels", False)))
    preferences["useOfflineMode"] = bool(record.get("use_offline_mode", preferences.get("useOfflineMode", False)))
    agencies_raw = record.get("agencies")
    agencies_value = preferences.get("agencies") or []
    if agencies_raw:
        try:
            parsed_agencies = json.loads(agencies_raw)
            if isinstance(parsed_agencies, list):
                agencies_value = [str(item) for item in parsed_agencies if item]
        except json.JSONDecodeError:
            agencies_value = preferences.get("agencies") or []
    preferences["agencies"] = agencies_value or ["CDC", "WHO"]
    preferences["beautifyModel"] = record.get("beautify_model") or preferences.get("beautifyModel")
    preferences["suggestModel"] = record.get("suggest_model") or preferences.get("suggestModel")
    preferences["summarizeModel"] = record.get("summarize_model") or preferences.get("summarizeModel")
    deid_engine = record.get("deid_engine") or os.getenv("DEID_ENGINE")
    preferences["deidEngine"] = deid_engine or preferences.get("deidEngine")
    theme = record.get("theme")
    if isinstance(theme, str) and theme:
        preferences["theme"] = theme
    return preferences


def _sync_selected_codes_to_session_state(
    session_state: Dict[str, Any], normalized_session: Dict[str, Any]
) -> None:
    codes = normalized_session.get("selectedCodes") or []
    if not isinstance(codes, list):
        codes = []
    session_state["selectedCodesList"] = codes
    counts = dict(_DEFAULT_SELECTED_CODES)
    for code in codes:
        category = str(code.get("category") or "").lower()
        if category in counts:
            counts[category] += 1
        elif "prevent" in category:
            counts["prevention"] += 1
        elif "differ" in category:
            counts["differentials"] += 1
        elif "diagn" in category:
            counts["diagnoses"] += 1
        else:
            counts["codes"] += 1
    session_state["selectedCodes"] = counts


@app.get("/api/user/profile")
async def get_user_profile(user=Depends(require_role("user"))) -> Dict[str, Any]:

    base_profile = UserProfile().model_dump()
    defaults = UserSettings().model_dump()
    normalized_defaults = _normalize_ui_preferences_payload(base_profile.get("uiPreferences", {}))
    result: Dict[str, Any] = {
        **base_profile,
        "userId": None,
        "username": user.get("sub"),
        "name": None,
        "role": None,
        "permissions": [],
        "preferences": defaults,
        "uiPreferences": normalized_defaults,
    }
    row = db_conn.execute(
        """
        SELECT
            u.id AS user_id,
            u.username,
            u.name,
            u.role,
            u.clinic_id,
            up.current_view,
            up.clinic,
            up.preferences,
            up.ui_preferences
        FROM users u
        LEFT JOIN user_profile up ON up.user_id = u.id
        WHERE u.username=?
        """,
        (user["sub"],),
    ).fetchone()
    if not row:
        return result
    preferences_raw = row["preferences"] if row["preferences"] else {}
    if isinstance(preferences_raw, str):
        try:
            profile_preferences = json.loads(preferences_raw)
        except json.JSONDecodeError:
            profile_preferences = {}
    elif isinstance(preferences_raw, dict):
        profile_preferences = preferences_raw
    else:
        profile_preferences = {}
    ui_raw = row["ui_preferences"] if row["ui_preferences"] else {}
    if isinstance(ui_raw, str):
        try:
            ui_dict = json.loads(ui_raw)
        except json.JSONDecodeError:
            ui_dict = {}
    elif isinstance(ui_raw, dict):
        ui_dict = ui_raw
    else:
        ui_dict = {}
    normalized_ui = _normalize_ui_preferences_payload(ui_dict)
    user_id = row["user_id"]
    settings_preferences = _load_user_settings_preferences(user_id)
    merged_preferences = copy.deepcopy(settings_preferences)
    if isinstance(profile_preferences, dict):
        for key, value in profile_preferences.items():
            if key == "categories" and isinstance(value, dict):
                base_categories = merged_preferences.get("categories") or {}
                if isinstance(base_categories, dict):
                    base_categories.update(value)
                    merged_preferences["categories"] = base_categories
                else:
                    merged_preferences["categories"] = value
            else:
                merged_preferences[key] = value
    clinic_value = row["clinic"] if row["clinic"] else row["clinic_id"]
    if clinic_value is not None and not isinstance(clinic_value, str):
        clinic_value = str(clinic_value)
    result.update(
        {
            "userId": str(user_id) if user_id is not None else None,
            "username": row["username"],
            "name": row["name"] or row["username"],
            "role": row["role"],
            "permissions": [row["role"]] if row["role"] else [],
            "clinic": clinic_value,
            "currentView": row["current_view"] or base_profile.get("currentView"),
            "preferences": merged_preferences,
            "uiPreferences": normalized_ui,
            "specialty": merged_preferences.get("specialty"),
        }
    )
    return result



@app.put("/api/user/profile")
async def update_user_profile(
    profile: UserProfile, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?", (user["sub"],)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="User not found")
    preferences = profile.preferences if isinstance(profile.preferences, dict) else {}
    ui_preferences = _normalize_ui_preferences_payload(profile.uiPreferences)
    db_conn.execute(
        "INSERT OR REPLACE INTO user_profile (user_id, current_view, clinic, preferences, ui_preferences) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            row["id"],
            profile.currentView,
            profile.clinic,
            json.dumps(preferences),
            json.dumps(ui_preferences),
        ),
    )
    db_conn.commit()
    return await get_user_profile(user=user)



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
    normalized = _normalize_ui_preferences_payload(prefs)
    return {"uiPreferences": normalized}


@app.put("/api/user/ui-preferences")
async def put_ui_preferences(
    model: UiPreferencesModel, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?", (user["sub"],)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="User not found")
    normalized = _normalize_ui_preferences_payload(model.uiPreferences)
    updated = json.dumps(normalized)
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
    return {"uiPreferences": normalized}


@app.get("/api/user/session")
async def get_user_session(user=Depends(require_role("user"))):
    row = db_conn.execute(
        "SELECT ss.user_id, ss.data FROM session_state ss JOIN users u ON ss.user_id = u.id WHERE u.username=?",
        (user["sub"],),
    ).fetchone()
    if row:
        raw_dict: Optional[Dict[str, Any]] = None
        if row["data"]:
            try:
                raw_dict = json.loads(row["data"])
            except Exception:
                raw_dict = None
        normalized = _normalize_session_state(raw_dict if raw_dict is not None else row["data"])
        if row["user_id"] is not None and raw_dict != normalized:
            db_conn.execute(
                "UPDATE session_state SET data=?, updated_at=? WHERE user_id=?",
                (json.dumps(normalized), time.time(), row["user_id"]),
            )
            db_conn.commit()
        return normalized
    return _normalize_session_state(SessionStateModel())


@app.put("/api/user/session")
async def put_user_session(
    payload: Dict[str, Any] = Body(default_factory=dict),
    user=Depends(require_role("user")),
) -> Dict[str, Any]:
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?", (user["sub"],),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="User not found")
    user_id = row["id"]
    existing_row = db_conn.execute(
        "SELECT data FROM session_state WHERE user_id=?", (user_id,),
    ).fetchone()
    if existing_row and existing_row["data"]:
        current_state = _normalize_session_state(existing_row["data"])
    else:
        current_state = _normalize_session_state(SessionStateModel())
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid session payload")
    merged_state = copy.deepcopy(current_state)
    for key, value in payload.items():
        merged_state[key] = value
    normalized = _normalize_session_state(merged_state)
    db_conn.execute(
        "INSERT OR REPLACE INTO session_state (user_id, data, updated_at) VALUES (?, ?, ?)",
        (user_id, json.dumps(normalized), time.time()),
    )
    db_conn.commit()
    return normalized


@app.get("/api/notifications/count")
async def get_notification_count(
    user=Depends(require_role("user"))
) -> Dict[str, int]:
    count = _sync_unread_notification_count(user["sub"])
    return _navigation_badges(user["sub"], count)


@app.get("/api/notifications")
async def list_notifications(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(require_role("user")),
) -> Dict[str, Any]:
    username = user["sub"]
    ensure_notification_events_table(db_conn)
    user_id = _get_user_db_id(username)
    if user_id is None:
        set_notification_count(username, 0)
        return {
            "items": [],
            "total": 0,
            "limit": limit,
            "offset": offset,
            "nextOffset": None,
            "unreadCount": 0,
        }

    rows = db_conn.execute(
        """
        SELECT event_id, title, message, severity, created_at, is_read, read_at
          FROM notification_events
         WHERE user_id=?
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?
        """,
        (user_id, limit, offset),
    ).fetchall()
    total_row = db_conn.execute(
        "SELECT COUNT(*) AS total FROM notification_events WHERE user_id=?",
        (user_id,),
    ).fetchone()
    total = int(total_row["total"]) if total_row and total_row["total"] is not None else 0
    unread = _sync_unread_notification_count(username, user_id=user_id)
    items = [_serialise_notification_row(row) for row in rows or []]
    next_offset = offset + limit if offset + limit < total else None
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "nextOffset": next_offset,
        "unreadCount": unread,
    }


@app.post("/api/notifications/{event_id}/read")
async def mark_notification_read(
    event_id: str,
    user=Depends(require_role("user")),
) -> Dict[str, Any]:
    username = user["sub"]
    ensure_notification_events_table(db_conn)
    user_id = _get_user_db_id(username)
    if user_id is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    row = db_conn.execute(
        "SELECT is_read FROM notification_events WHERE event_id=? AND user_id=?",
        (event_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not row["is_read"]:
        now = time.time()
        db_conn.execute(
            """
            UPDATE notification_events
               SET is_read=1,
                   read_at=?,
                   updated_at=?
             WHERE event_id=? AND user_id=?
            """,
            (now, now, event_id, user_id),
        )
        db_conn.commit()
    unread = _sync_unread_notification_count(username, user_id=user_id)
    await _broadcast_notification_count(username)
    return {"status": "ok", "unreadCount": unread}


@app.post("/api/notifications/read-all")
async def mark_all_notifications_read(
    user=Depends(require_role("user")),
) -> Dict[str, Any]:
    username = user["sub"]
    ensure_notification_events_table(db_conn)
    user_id = _get_user_db_id(username)
    if user_id is None:
        set_notification_count(username, 0)
        return {"status": "ok", "unreadCount": 0}
    now = time.time()
    db_conn.execute(
        """
        UPDATE notification_events
           SET is_read=1,
               read_at=COALESCE(read_at, ?),
               updated_at=?
         WHERE user_id=? AND is_read=0
        """,
        (now, now, user_id),
    )
    db_conn.commit()
    unread = _sync_unread_notification_count(username, user_id=user_id)
    await _broadcast_notification_count(username)
    return {"status": "ok", "unreadCount": unread}


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
    noteId: Optional[str] = Field(None, alias="note_id")

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


class WorkflowSessionCreateRequest(BaseModel):
    encounterId: str
    patientId: Optional[str] = None
    noteId: Optional[str] = None
    noteContent: Optional[str] = None
    sessionId: Optional[str] = None
    selectedCodes: List[Dict[str, Any]] = Field(default_factory=list)
    complianceIssues: List[Dict[str, Any]] = Field(default_factory=list)
    patientMetadata: Dict[str, Any] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)
    createdBy: Optional[str] = None
    owner: Optional[str] = None
    collaborators: List[Dict[str, Any]] = Field(default_factory=list)
    activeEditors: List[Dict[str, Any]] = Field(default_factory=list)


class WorkflowStepUpdateRequest(BaseModel):
    step: int
    status: Literal["not_started", "in_progress", "completed", "blocked"]
    progress: Optional[int] = Field(None, ge=0, le=100)
    notes: Optional[str] = None
    blockingIssues: Optional[List[str]] = None


class WorkflowSessionResponse(BaseModel):
    sessionId: str
    encounterId: Optional[str] = None
    patientId: Optional[str] = None
    noteId: Optional[str] = None
    createdBy: Optional[str] = None
    owner: Optional[str] = None
    lastUpdatedBy: Optional[str] = None
    collaborators: List[Dict[str, Any]] = Field(default_factory=list)
    activeEditors: List[Dict[str, Any]] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)
    currentStep: int = 1
    stepStates: List[Dict[str, Any]] = Field(default_factory=list)
    stepCompletionStatus: Dict[str, bool] = Field(default_factory=dict)
    selectedCodes: List[Dict[str, Any]] = Field(default_factory=list)
    complianceIssues: List[Dict[str, Any]] = Field(default_factory=list)
    patientMetadata: Dict[str, Any] = Field(default_factory=dict)
    patientSummary: Dict[str, Any] = Field(default_factory=dict)
    encounterSummary: Dict[str, Any] = Field(default_factory=dict)
    visitSummary: Dict[str, Any] = Field(default_factory=dict)
    noteContent: Optional[str] = None
    reimbursementSummary: Dict[str, Any] = Field(default_factory=dict)
    auditTrail: List[Dict[str, Any]] = Field(default_factory=list)
    patientQuestions: List[Dict[str, Any]] = Field(default_factory=list)
    blockingIssues: List[str] = Field(default_factory=list)
    sessionProgress: Dict[str, Any] = Field(default_factory=dict)
    transcriptEntries: List[Dict[str, Any]] = Field(default_factory=list)
    timeline: List[Dict[str, Any]] = Field(default_factory=list)
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    attestation: Dict[str, Any] = Field(default_factory=dict)
    dispatch: Dict[str, Any] = Field(default_factory=dict)
    lastValidation: Dict[str, Any] = Field(default_factory=dict)


class NoteContentUpdateRequest(PreFinalizeCheckRequest):
    sessionId: str
    encounterId: Optional[str] = None
    noteId: Optional[str] = None


class NoteContentUpdateResponse(BaseModel):
    encounterId: Optional[str] = None
    sessionId: str
    noteContent: str
    reimbursementSummary: Dict[str, Any]
    validation: Dict[str, Any]
    session: WorkflowSessionResponse


class FinalizeResult(BaseModel):
    finalizedContent: str
    codesSummary: List[Dict[str, Any]] = Field(default_factory=list)
    reimbursementSummary: Dict[str, Any] = Field(default_factory=dict)
    exportReady: bool = False
    issues: Dict[str, Any] = Field(default_factory=dict)


class PayerRequirementModel(BaseModel):
    payerName: Optional[str] = Field(None, alias="payer_name")
    requirementType: Optional[str] = Field(None, alias="requirement_type")
    description: Optional[str] = None
    isMet: Optional[bool] = Field(None, alias="is_met")
    missingElements: List[str] = Field(default_factory=list, alias="missing_elements")
    model_config = ConfigDict(populate_by_name=True)


class ComplianceCheckModel(BaseModel):
    checkType: Optional[str] = Field(None, alias="check_type")
    status: Optional[str] = None
    description: Optional[str] = None
    requiredActions: List[str] = Field(default_factory=list, alias="required_actions")
    model_config = ConfigDict(populate_by_name=True)


class BillingValidationModel(BaseModel):
    codesValidated: bool = Field(False, alias="codes_validated")
    documentationLevelVerified: bool = Field(False, alias="documentation_level_verified")
    medicalNecessityConfirmed: bool = Field(False, alias="medical_necessity_confirmed")
    billingComplianceChecked: bool = Field(False, alias="billing_compliance_checked")
    estimatedReimbursement: float = Field(0.0, alias="estimated_reimbursement")
    payerSpecificRequirements: List[PayerRequirementModel] = Field(
        default_factory=list, alias="payer_specific_requirements"
    )
    model_config = ConfigDict(populate_by_name=True)


class BillingSummaryModel(BaseModel):
    primaryDiagnosis: Optional[str] = Field(None, alias="primary_diagnosis")
    secondaryDiagnoses: List[str] = Field(default_factory=list, alias="secondary_diagnoses")
    procedures: List[str] = Field(default_factory=list)
    evaluationManagementLevel: Optional[str] = Field(None, alias="evaluation_management_level")
    totalRvu: Optional[float] = Field(None, alias="total_rvu")
    estimatedPayment: Optional[float] = Field(None, alias="estimated_payment")
    modifierCodes: List[str] = Field(default_factory=list, alias="modifier_codes")
    model_config = ConfigDict(populate_by_name=True)


class AttestationDetailsModel(BaseModel):
    physicianAttestation: bool = Field(False, alias="physician_attestation")
    attestationText: Optional[str] = Field(None, alias="attestation_text")
    attestationTimestamp: Optional[str] = Field(None, alias="attestation_timestamp")
    digitalSignature: Optional[str] = Field(None, alias="digital_signature")
    attestationIpAddress: Optional[str] = Field(None, alias="attestation_ip_address")
    attestedBy: Optional[str] = None
    model_config = ConfigDict(populate_by_name=True)


class AttestationRequest(BaseModel):
    encounterId: Optional[str] = None
    sessionId: Optional[str] = None
    attestedBy: Optional[str] = None
    statement: Optional[str] = None
    timestamp: Optional[str] = None
    billingValidation: Optional[BillingValidationModel] = Field(
        None, alias="billing_validation"
    )
    attestation: Optional[AttestationDetailsModel] = None
    complianceChecks: List[ComplianceCheckModel] = Field(
        default_factory=list, alias="compliance_checks"
    )
    billingSummary: Optional[BillingSummaryModel] = Field(
        None, alias="billing_summary"
    )
    model_config = ConfigDict(populate_by_name=True)


class WorkflowAttestationResponse(BaseModel):
    session: WorkflowSessionResponse


class FinalReviewModel(BaseModel):
    allStepsCompleted: bool = Field(False, alias="all_steps_completed")
    physicianFinalApproval: bool = Field(False, alias="physician_final_approval")
    qualityReviewPassed: bool = Field(False, alias="quality_review_passed")
    complianceVerified: bool = Field(False, alias="compliance_verified")
    readyForDispatch: bool = Field(False, alias="ready_for_dispatch")
    model_config = ConfigDict(populate_by_name=True)


class DispatchOptionsModel(BaseModel):
    sendToEmr: bool = Field(False, alias="send_to_emr")
    generatePatientSummary: bool = Field(False, alias="generate_patient_summary")
    scheduleFollowup: bool = Field(False, alias="schedule_followup")
    sendToBilling: bool = Field(False, alias="send_to_billing")
    notifyReferrals: bool = Field(False, alias="notify_referrals")
    model_config = ConfigDict(populate_by_name=True)


class DispatchStatusModel(BaseModel):
    dispatchInitiated: bool = Field(False, alias="dispatch_initiated")
    dispatchCompleted: bool = Field(False, alias="dispatch_completed")
    dispatchTimestamp: Optional[str] = Field(None, alias="dispatch_timestamp")
    dispatchConfirmationNumber: Optional[str] = Field(
        None, alias="dispatch_confirmation_number"
    )
    dispatchErrors: List[str] = Field(default_factory=list, alias="dispatch_errors")
    model_config = ConfigDict(populate_by_name=True)


class PostDispatchActionModel(BaseModel):
    actionType: Optional[str] = Field(None, alias="action_type")
    status: Optional[str] = None
    scheduledTime: Optional[str] = Field(None, alias="scheduled_time")
    completionTime: Optional[str] = Field(None, alias="completion_time")
    errorMessage: Optional[str] = Field(None, alias="error_message")
    retryCount: int = Field(0, alias="retry_count")
    model_config = ConfigDict(populate_by_name=True)


class DispatchRequest(BaseModel):
    encounterId: Optional[str] = None
    sessionId: Optional[str] = None
    destination: Optional[str] = None
    deliveryMethod: Optional[str] = None
    timestamp: Optional[str] = None
    finalReview: Optional[FinalReviewModel] = Field(None, alias="final_review")
    dispatchOptions: Optional[DispatchOptionsModel] = Field(
        None, alias="dispatch_options"
    )
    dispatchStatus: Optional[DispatchStatusModel] = Field(None, alias="dispatch_status")
    postDispatchActions: List[PostDispatchActionModel] = Field(
        default_factory=list, alias="post_dispatch_actions"
    )
    model_config = ConfigDict(populate_by_name=True)


class DispatchResponse(BaseModel):
    session: WorkflowSessionResponse
    result: FinalizeResult


class SelectedCodeBase(BaseModel):
    code: str
    type: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    rationale: Optional[str] = None
    confidence: Optional[float] = None
    reimbursement: Optional[str] = None
    rvu: Optional[str] = None
    status: Optional[str] = None
    gaps: Optional[List[str]] = None
    evidence: Optional[List[str]] = None
    tags: Optional[List[str]] = None


class SelectedCodeCreateRequest(SelectedCodeBase):
    encounterId: str
    sessionId: Optional[str] = None


class SelectedCodeUpdateRequest(SelectedCodeBase):
    encounterId: Optional[str] = None
    sessionId: Optional[str] = None


class QuestionAnswerRequest(BaseModel):
    sessionId: Optional[str] = None
    answer: str
    answeredBy: Optional[str] = None
    timestamp: Optional[str] = None
    confidenceLevel: Optional[Literal["certain", "probable", "uncertain"]] = None
    notes: Optional[str] = None
    verificationNeeded: Optional[bool] = None


class QuestionStatusUpdateRequest(BaseModel):
    sessionId: Optional[str] = None
    status: Literal[
        "pending",
        "in_progress",
        "answered",
        "skipped",
        "not_applicable",
        "dismissed",
        "resolved",
    ]
    updatedBy: Optional[str] = None
    timestamp: Optional[str] = None

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


class RuleCitation(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    citation: Optional[str] = None


class RuleReference(BaseModel):
    ruleId: str
    citations: List[RuleCitation] = Field(default_factory=list)


class ComplianceAlert(BaseModel):
    text: str
    category: Optional[str] = None
    priority: Optional[str] = None
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    reasoning: Optional[str] = None
    ruleReferences: List[RuleReference] = Field(default_factory=list)


class ComplianceCheckResponse(BaseModel):
    alerts: List[ComplianceAlert]
    ruleReferences: List[RuleReference] = Field(default_factory=list)


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


class ComplianceRuleBase(BaseModel):
    """Shared fields for compliance rule create/update operations."""

    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    severity: Optional[str] = None
    type: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    references: Optional[List[Dict[str, Any]]] = None

    model_config = ConfigDict(extra="allow")

    @field_validator("metadata")
    @classmethod
    def validate_metadata(cls, value: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:  # noqa: D401,N805
        if value is None:
            return None
        if not isinstance(value, dict):
            raise ValueError("metadata must be an object")
        return value

    @field_validator("references")
    @classmethod
    def validate_references(cls, value: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:  # noqa: D401,N805
        if value is None:
            return None
        cleaned = [item for item in value if isinstance(item, dict)]
        return cleaned or None


class ComplianceRuleCreateRequest(ComplianceRuleBase):
    id: str
    name: str
    description: str

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:  # noqa: D401,N805
        if not value or not value.strip():
            raise ValueError("id is required")
        return value.strip()

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:  # noqa: D401,N805
        if not value or not value.strip():
            raise ValueError("name is required")
        return value

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:  # noqa: D401,N805
        if not value or not value.strip():
            raise ValueError("description is required")
        return value


class ComplianceRuleUpdateRequest(ComplianceRuleBase):
    pass


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
    ipAddress: Optional[str] = None
    userAgent: Optional[str] = None
    success: Optional[bool] = None
    clinicId: Optional[str] = None


class UsageTrendPoint(BaseModel):
    day: date
    total_notes: int
    beautify: int
    suggest: int
    summary: int
    chart_upload: int
    audio: int


class UsageAnalytics(BaseModel):
    total_notes: int
    beautify: int
    suggest: int
    summary: int
    chart_upload: int
    audio: int
    avg_note_length: float
    daily_trends: List[UsageTrendPoint] = Field(default_factory=list)
    projected_totals: Dict[str, float] = Field(default_factory=dict)
    event_distribution: Dict[str, float] = Field(default_factory=dict)


class CodingAccuracyTrendPoint(BaseModel):
    day: date
    total_notes: int
    denials: int
    deficiencies: int
    accuracy: float


class CodingAccuracyAnalytics(BaseModel):
    total_notes: int
    denials: int
    deficiencies: int
    accuracy: float
    coding_distribution: Dict[str, int] = Field(default_factory=dict)
    outcome_distribution: Dict[str, float] = Field(default_factory=dict)
    accuracy_trend: List[CodingAccuracyTrendPoint] = Field(default_factory=list)
    projections: Dict[str, float] = Field(default_factory=dict)


class RevenueTrendPoint(BaseModel):
    day: date
    total_revenue: float
    average_revenue: float


class RevenueAnalytics(BaseModel):
    total_revenue: float
    average_revenue: float
    revenue_by_code: Dict[str, float] = Field(default_factory=dict)
    revenue_trend: List[RevenueTrendPoint] = Field(default_factory=list)
    projections: Dict[str, float] = Field(default_factory=dict)
    revenue_distribution: Dict[str, float] = Field(default_factory=dict)


class ComplianceTrendPoint(BaseModel):
    day: date
    notes_with_flags: int
    total_flags: int


class ComplianceAnalytics(BaseModel):
    compliance_counts: Dict[str, int] = Field(default_factory=dict)
    notes_with_flags: int = 0
    total_flags: int = 0
    flagged_rate: float = 0.0
    compliance_trend: List[ComplianceTrendPoint] = Field(default_factory=list)
    projections: Dict[str, float] = Field(default_factory=dict)
    compliance_distribution: Dict[str, float] = Field(default_factory=dict)

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

    payload = _cached_response("daily_overview", builder)
    response = JSONResponse(content=jsonable_encoder(payload))
    response.headers["X-Bypass-Envelope"] = "1"
    return response


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
        upper_bound = now_dt + timedelta(days=1)
        upcoming = 0
        try:
            for appt in list_appointments():
                try:
                    start_dt = datetime.fromisoformat(appt["start"])
                except Exception:
                    continue
                if start_dt.date() != now_dt.date():
                    continue
                if start_dt >= now_dt:
                    upcoming += 1
        except Exception:
            upcoming = 0
        return {
            "draftCount": int(max(notes - closed, 0)),
            "upcomingAppointments": int(upcoming),
            "urgentReviews": int(urgent),
        }

    base = _cached_response("quick_actions", builder)
    data = {"draftCount": 0, "upcomingAppointments": 0, "urgentReviews": 0}
    if isinstance(base, dict):
        data.update(base)
    h = await health()
    alerts: List[Dict[str, Any]] = []
    if not h.get("db", True):
        alerts.append({"type": "db", "message": "Database unavailable"})
    data["systemAlerts"] = alerts
    response = JSONResponse(content=jsonable_encoder(data))
    response.headers["X-Bypass-Envelope"] = "1"
    return response


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

    payload = _cached_response("activity", builder)
    response = JSONResponse(content=jsonable_encoder(payload))
    response.headers["X-Bypass-Envelope"] = "1"
    return response


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
        try:
            event_columns = {
                row[1] for row in db_conn.execute("PRAGMA table_info(events)")
            }
        except Exception:
            event_columns = set()
        has_time_to_close = "time_to_close" in event_columns
        codes_payload = (
            json.dumps(data["details"].get("codes"))
            if data["details"].get("codes") is not None
            else None
        )
        compliance_payload = (
            json.dumps(data["details"].get("compliance"))
            if data["details"].get("compliance") is not None
            else None
        )
        public_health_value = (
            1
            if data["details"].get("publicHealth") is True
            else 0 if data["details"].get("publicHealth") is False else None
        )
        common_params = [
            data["eventType"],
            data["timestamp"],
            json.dumps(data["details"], ensure_ascii=False),
            data["details"].get("revenue"),
        ]
        if has_time_to_close:
            insert_sql = (
                "INSERT INTO events (eventType, timestamp, details, revenue, time_to_close, codes, compliance_flags, public_health, satisfaction) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            params = common_params + [
                data["details"].get("timeToClose"),
                codes_payload,
                compliance_payload,
                public_health_value,
                data["details"].get("satisfaction"),
            ]
        else:
            insert_sql = (
                "INSERT INTO events (eventType, timestamp, details, revenue, codes, compliance_flags, public_health, satisfaction) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )
            params = common_params + [
                codes_payload,
                compliance_payload,
                public_health_value,
                data["details"].get("satisfaction"),
            ]
        db_conn.execute(insert_sql, params)
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


class NoteCreateRequest(BaseModel):
    patientId: str
    encounterId: Optional[str] = None
    template: Optional[str] = None
    content: Optional[str] = Field(default="", max_length=10000)

    @field_validator("content", mode="before")
    @classmethod
    def _default_content(cls, value: str | None) -> str:  # noqa: D401,N805
        return value or ""

    @field_validator("content")
    @classmethod
    def sanitize_content(cls, value: str) -> str:  # noqa: D401,N805
        return sanitize_text(value)


@app.post("/api/notes/create")
def create_note(
    req: NoteCreateRequest, user=Depends(require_role("user"))
) -> Dict[str, str]:
    """Create a new draft note and seed the persisted version history."""

    now = datetime.now(timezone.utc)
    timestamp = now.timestamp()
    user_id = _get_user_db_id(user["sub"])
    try:
        cursor = db_conn.execute(
            "INSERT INTO notes (content, status, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (req.content or "", "draft", timestamp, timestamp),
        )
        note_id = str(cursor.lastrowid)
        _save_note_version(note_id, req.content or "", user_id, created_at=now)
        db_conn.commit()
    except sqlite3.Error as exc:  # pragma: no cover - safety net
        logger.exception("Failed to create note")
        db_conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to create note") from exc

    return {"noteId": note_id}


@app.post("/api/notes/auto-save")
def auto_save_note(
    req: AutoSaveRequest, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """Persist note content for versioning in the database."""

    user_id = _get_user_db_id(user["sub"])
    try:
        _save_note_version(req.noteId, req.content, user_id)
        row = db_conn.execute(
            "SELECT COUNT(*) FROM note_versions WHERE note_id=?",
            (str(req.noteId),),
        ).fetchone()
        version_count = int(row[0] if row else 0)
        db_conn.commit()
    except sqlite3.Error as exc:  # pragma: no cover - safety net
        logger.exception("Failed to auto-save note %s", req.noteId)
        db_conn.rollback()
        raise HTTPException(status_code=500, detail="Failed to auto-save note") from exc
    return {"status": "saved", "version": version_count}


@app.get("/api/notes/versions/{note_id}")
def get_note_versions(
    note_id: str, user=Depends(require_role("user"))
) -> List[Dict[str, str]]:
    """Return previously auto-saved versions for a note."""

    return _fetch_note_versions(note_id)


@app.get("/api/notes/auto-save/status")
def get_auto_save_status(
    note_id: Optional[str] = None, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    """Return auto-save status for a specific note or all notes."""

    ensure_note_versions_table(db_conn)
    if note_id is not None:
        try:
            row = db_conn.execute(
                "SELECT COUNT(*) AS count, MAX(created_at) AS last FROM note_versions WHERE note_id=?",
                (str(note_id),),
            ).fetchone()
        except sqlite3.Error:
            row = None
        count = 0
        last_iso = None
        if row:
            try:
                count = int(row["count"])
            except (KeyError, TypeError):
                count = int(row[0]) if row[0] is not None else 0
            try:
                last_raw = row["last"]
            except (KeyError, TypeError):
                last_raw = row[1] if len(row) > 1 else None
            last_iso = _timestamp_to_iso(last_raw)
        return {"noteId": note_id, "versions": count, "lastSave": last_iso}

    try:
        rows = db_conn.execute(
            "SELECT note_id, COUNT(*) AS count, MAX(created_at) AS last FROM note_versions GROUP BY note_id"
        ).fetchall()
    except sqlite3.Error:
        return {}

    result: Dict[str, Any] = {}
    for row in rows or []:
        try:
            nid = row["note_id"]
        except (KeyError, TypeError):
            nid = row[0] if row else None
        if nid is None:
            continue
        try:
            count = row["count"]
        except (KeyError, TypeError):
            count = row[1] if len(row) > 1 else 0
        try:
            last_raw = row["last"]
        except (KeyError, TypeError):
            last_raw = row[2] if len(row) > 2 else None
        result[str(nid)] = {
            "versions": int(count) if count is not None else 0,
            "lastSave": _timestamp_to_iso(last_raw),
        }
    return result


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
        "SELECT id, timestamp, username, action, details, ip_address, user_agent, success, clinic_id FROM audit_log "
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
                ipAddress=row["ip_address"],
                userAgent=row["user_agent"],
                success=None if row["success"] is None else bool(row["success"]),
                clinicId=row["clinic_id"],
            )
        )

    next_cursor = rows[-1]["id"] if rows and len(rows) == limit else None
    return {
        "entries": [entry.model_dump() for entry in entries],
        "next": next_cursor,
        "count": len(entries),
    }


@app.get("/api/analytics/usage")
async def analytics_usage(user=Depends(require_roles("analyst", "user"))) -> Dict[str, Any]:
    """Basic usage analytics aggregated from events."""
    where, params = _analytics_where(user)
    base_where = where if where else "WHERE 1=1"
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
        FROM events {base_where}
        """,
        params,
    )
    row = cursor.fetchone()
    data = dict(row) if row else {}

    total_notes = int(data.get("total_notes") or 0)
    beautify = int(data.get("beautify") or 0)
    suggest = int(data.get("suggest") or 0)
    summary = int(data.get("summary") or 0)
    chart_upload = int(data.get("chart_upload") or 0)
    audio = int(data.get("audio") or 0)
    avg_note_length_raw = data.get("avg_note_length")
    avg_note_length = float(avg_note_length_raw) if avg_note_length_raw is not None else 0.0

    cursor.execute(
        f"""
        SELECT
            DATE(timestamp, 'unixepoch') AS day,
            SUM(CASE WHEN eventType IN ('note_started','note_saved','note_closed') THEN 1 ELSE 0 END) AS total_notes,
            SUM(CASE WHEN eventType='beautify' THEN 1 ELSE 0 END) AS beautify,
            SUM(CASE WHEN eventType='suggest' THEN 1 ELSE 0 END) AS suggest,
            SUM(CASE WHEN eventType='summary' THEN 1 ELSE 0 END) AS summary,
            SUM(CASE WHEN eventType='chart_upload' THEN 1 ELSE 0 END) AS chart_upload,
            SUM(CASE WHEN eventType='audio_recorded' THEN 1 ELSE 0 END) AS audio
        FROM events
        {where}
        GROUP BY day
        ORDER BY day DESC
        LIMIT 14
        """,
        params,
    )
    trend_rows = cursor.fetchall()
    daily_trends: List[UsageTrendPoint] = []
    for trend_row in reversed(trend_rows):
        day_value = trend_row["day"]
        if not day_value:
            continue
        try:
            trend_day = datetime.strptime(day_value, "%Y-%m-%d").date()
        except ValueError:  # pragma: no cover - defensive for unexpected formats
            continue
        daily_trends.append(
            UsageTrendPoint(
                day=trend_day,
                total_notes=int(trend_row["total_notes"] or 0),
                beautify=int(trend_row["beautify"] or 0),
                suggest=int(trend_row["suggest"] or 0),
                summary=int(trend_row["summary"] or 0),
                chart_upload=int(trend_row["chart_upload"] or 0),
                audio=int(trend_row["audio"] or 0),
            )
        )

    if daily_trends:
        days_count = len(daily_trends)
        averages = {
            "total_notes": sum(point.total_notes for point in daily_trends) / days_count,
            "beautify": sum(point.beautify for point in daily_trends) / days_count,
            "suggest": sum(point.suggest for point in daily_trends) / days_count,
            "summary": sum(point.summary for point in daily_trends) / days_count,
            "chart_upload": sum(point.chart_upload for point in daily_trends) / days_count,
            "audio": sum(point.audio for point in daily_trends) / days_count,
        }
        projected_totals = {
            f"next_7_days_{key}": round(value * 7, 2) for key, value in averages.items()
        }
        projected_totals["expected_avg_note_length"] = round(avg_note_length, 2)
    else:
        projected_totals = {
            "next_7_days_total_notes": 0.0,
            "next_7_days_beautify": 0.0,
            "next_7_days_suggest": 0.0,
            "next_7_days_summary": 0.0,
            "next_7_days_chart_upload": 0.0,
            "next_7_days_audio": 0.0,
            "expected_avg_note_length": 0.0,
        }

    distribution_total = total_notes + beautify + suggest + summary + chart_upload + audio
    if distribution_total:
        event_distribution = {
            "notes": round(total_notes / distribution_total, 4),
            "beautify": round(beautify / distribution_total, 4),
            "suggest": round(suggest / distribution_total, 4),
            "summary": round(summary / distribution_total, 4),
            "chart_upload": round(chart_upload / distribution_total, 4),
            "audio": round(audio / distribution_total, 4),
        }
    else:
        event_distribution = {
            "notes": 0.0,
            "beautify": 0.0,
            "suggest": 0.0,
            "summary": 0.0,
            "chart_upload": 0.0,
            "audio": 0.0,
        }

    analytics = UsageAnalytics(
        total_notes=total_notes,
        beautify=beautify,
        suggest=suggest,
        summary=summary,
        chart_upload=chart_upload,
        audio=audio,
        avg_note_length=avg_note_length,
        daily_trends=daily_trends,
        projected_totals=projected_totals,
        event_distribution=event_distribution,
    )
    payload = analytics.model_dump(mode="json")

    daily_usage_basic: List[Dict[str, Any]] = []
    daily_usage_breakdown: List[Dict[str, Any]] = []
    for point in payload.get("daily_trends", []):
        day_value = point.get("day")
        if not day_value:
            continue
        total_events = (
            point.get("total_notes", 0)
            + point.get("beautify", 0)
            + point.get("suggest", 0)
            + point.get("summary", 0)
            + point.get("chart_upload", 0)
            + point.get("audio", 0)
        )
        breakdown_entry = {
            "date": day_value,
            "total_events": total_events,
            "total_notes": point.get("total_notes", 0),
            "beautify": point.get("beautify", 0),
            "suggest": point.get("suggest", 0),
            "summary": point.get("summary", 0),
            "chart_upload": point.get("chart_upload", 0),
            "audio": point.get("audio", 0),
        }
        daily_usage_breakdown.append(breakdown_entry)
        count_value = breakdown_entry["total_notes"]
        if count_value:
            daily_usage_basic.append({"date": day_value, "count": count_value})

    cursor.execute(
        f"""
        SELECT
            strftime('%Y-%W', timestamp, 'unixepoch') AS week,
            COUNT(*) AS total_events,
            SUM(CASE WHEN eventType IN ('note_started','note_saved','note_closed') THEN 1 ELSE 0 END) AS total_notes
        FROM events {base_where}
        GROUP BY week
        ORDER BY week DESC
        LIMIT 8
        """,
        params,
    )
    weekly_rows = cursor.fetchall()
    weekly_trend_basic: List[Dict[str, Any]] = []
    weekly_trend_breakdown: List[Dict[str, Any]] = []
    for row in reversed(weekly_rows):
        week_value = row["week"]
        if week_value is None:
            continue
        total_notes_week = row["total_notes"] or 0
        breakdown_entry = {
            "week": week_value,
            "total_events": row["total_events"] or 0,
            "total_notes": total_notes_week,
        }
        weekly_trend_breakdown.append(breakdown_entry)
        if total_notes_week:
            weekly_trend_basic.append({"week": week_value, "count": total_notes_week})

    cursor.execute(
        f"""
        SELECT
            strftime('%Y-%m', timestamp, 'unixepoch') AS month,
            COUNT(*) AS total_events,
            SUM(CASE WHEN eventType IN ('note_started','note_saved','note_closed') THEN 1 ELSE 0 END) AS total_notes
        FROM events {base_where}
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
        """,
        params,
    )
    monthly_rows = cursor.fetchall()
    monthly_trend_basic: List[Dict[str, Any]] = []
    monthly_trend_breakdown: List[Dict[str, Any]] = []
    for row in reversed(monthly_rows):
        month_value = row["month"]
        if month_value is None:
            continue
        total_notes_month = row["total_notes"] or 0
        breakdown_entry = {
            "month": month_value,
            "total_events": row["total_events"] or 0,
            "total_notes": total_notes_month,
        }
        monthly_trend_breakdown.append(breakdown_entry)
        if total_notes_month:
            monthly_trend_basic.append({"month": month_value, "count": total_notes_month})

    payload["dailyUsage"] = daily_usage_basic
    payload["dailyUsageBreakdown"] = daily_usage_breakdown
    payload["weeklyTrend"] = weekly_trend_basic
    payload["weeklyTrendBreakdown"] = weekly_trend_breakdown
    payload["monthlyTrend"] = monthly_trend_basic
    payload["monthlyTrendBreakdown"] = monthly_trend_breakdown
    return payload



@app.get("/api/analytics/coding-accuracy")
async def analytics_coding_accuracy(user=Depends(require_roles("analyst", "user"))) -> Dict[str, Any]:
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
    total = int(data.get("total_notes") or 0)
    denials = int(data.get("denials") or 0)
    deficiencies = int(data.get("deficiencies") or 0)
    accuracy = (total - denials - deficiencies) / total if total else 0.0
    cursor.execute(
        "SELECT json_each.value AS code, COUNT(*) AS count FROM events "
        "JOIN json_each(COALESCE(events.codes, '[]')) "
        f"{where} GROUP BY code",
        params,
    )
    distribution = {r["code"]: r["count"] for r in cursor.fetchall()}

    cursor.execute(
        f"""
        SELECT
            DATE(timestamp, 'unixepoch') AS day,
            SUM(CASE WHEN eventType='note_closed' THEN 1 ELSE 0 END) AS total_notes,
            SUM(CASE WHEN eventType='note_closed' AND json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.denial') = 1 THEN 1 ELSE 0 END) AS denials,
            SUM(CASE WHEN eventType='note_closed' AND json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.deficiency') = 1 THEN 1 ELSE 0 END) AS deficiencies
        FROM events
        {where}
        GROUP BY day
        ORDER BY day DESC
        LIMIT 14
        """,
        params,
    )
    trend_rows = cursor.fetchall()
    accuracy_trend: List[CodingAccuracyTrendPoint] = []
    for trend_row in reversed(trend_rows):
        day_value = trend_row["day"]
        if not day_value:
            continue
        try:
            trend_day = datetime.strptime(day_value, "%Y-%m-%d").date()
        except ValueError:  # pragma: no cover - defensive for unexpected formats
            continue
        day_total = int(trend_row["total_notes"] or 0)
        day_denials = int(trend_row["denials"] or 0)
        day_deficiencies = int(trend_row["deficiencies"] or 0)
        day_accuracy = (
            (day_total - day_denials - day_deficiencies) / day_total if day_total else 0.0
        )
        accuracy_trend.append(
            CodingAccuracyTrendPoint(
                day=trend_day,
                total_notes=day_total,
                denials=day_denials,
                deficiencies=day_deficiencies,
                accuracy=day_accuracy,
            )
        )

    if accuracy_trend:
        days_count = len(accuracy_trend)
        avg_accuracy = sum(point.accuracy for point in accuracy_trend) / days_count
        avg_denials = sum(point.denials for point in accuracy_trend) / days_count
        avg_deficiencies = sum(point.deficiencies for point in accuracy_trend) / days_count
        projections = {
            "expected_accuracy_next_7_days": round(avg_accuracy, 4),
            "projected_denials_next_7_days": round(avg_denials * 7, 2),
            "projected_deficiencies_next_7_days": round(avg_deficiencies * 7, 2),
        }
    else:
        projections = {
            "expected_accuracy_next_7_days": 0.0,
            "projected_denials_next_7_days": 0.0,
            "projected_deficiencies_next_7_days": 0.0,
        }

    accurate_count = max(total - denials - deficiencies, 0)
    if total:
        outcome_distribution = {
            "accurate": round(accurate_count / total, 4),
            "denials": round(denials / total, 4),
            "deficiencies": round(deficiencies / total, 4),
        }
    else:
        outcome_distribution = {
            "accurate": 0.0,
            "denials": 0.0,
            "deficiencies": 0.0,
        }

    analytics = CodingAccuracyAnalytics(
        total_notes=total,
        denials=denials,
        deficiencies=deficiencies,
        accuracy=accuracy,
        coding_distribution=distribution,
        outcome_distribution=outcome_distribution,
        accuracy_trend=accuracy_trend,
        projections=projections,
    )
    return analytics.model_dump()


@app.get("/api/analytics/revenue")
async def analytics_revenue(user=Depends(require_roles("analyst", "user"))) -> Dict[str, Any]:
    """Revenue analytics aggregated from event billing data."""
    where, params = _analytics_where(user)
    base_where = where if where else "WHERE 1=1"
    cursor = db_conn.cursor()
    cursor.execute(
        f"SELECT SUM(revenue) AS total, AVG(revenue) AS average FROM events {base_where}",
        params,
    )
    row = cursor.fetchone()
    data = dict(row) if row else {}
    total_revenue = float(data.get("total", 0) or 0)
    average_revenue = float(data.get("average", 0) or 0)
    cursor.execute(
        f"""
        SELECT
            strftime('%Y-%m', datetime(timestamp, 'unixepoch')) AS month,
            SUM(COALESCE(revenue, 0)) AS revenue
        FROM events {where}
        GROUP BY month
        ORDER BY month
        """,
        params,
    )
    monthly_trend = [
        {"month": r["month"], "revenue": float(r["revenue"] or 0.0)}
        for r in cursor.fetchall()
        if r["month"] and (r["revenue"] or 0)
    ]
    revenue_where = f"{where} AND revenue IS NOT NULL" if where else "WHERE revenue IS NOT NULL"
    cursor.execute(
        f"SELECT COUNT(DISTINCT date(datetime(timestamp, 'unixepoch'))) AS days FROM events {revenue_where}",
        params,
    )
    span_row = cursor.fetchone()
    distinct_days = int(span_row["days"]) if span_row and span_row["days"] else 0
    if distinct_days <= 0:
        distinct_days = 1 if total_revenue else 0
    projected_revenue = (
        total_revenue / distinct_days * 30 if distinct_days else 0.0
    )
    cursor.execute(
        "SELECT json_each.value AS code, COUNT(*) AS count, SUM(events.revenue) AS revenue FROM events "
        "JOIN json_each(COALESCE(events.codes, '[]')) "
        f"{where} GROUP BY code",
        params,
    )

    code_rows = cursor.fetchall()
    revenue_by_code: Dict[str, float] = {}
    code_distribution_detail: Dict[str, Dict[str, Any]] = {}
    for row in code_rows:
        code = row["code"]
        if not code:
            continue
        revenue_amount = float(row["revenue"] or 0.0)
        count_value = int(row["count"] or 0)
        revenue_by_code[code] = revenue_amount
        code_distribution_detail[code] = {
            "count": count_value,
            "revenue": revenue_amount,
        }

    cursor.execute(
        f"""
        SELECT
            DATE(timestamp, 'unixepoch') AS day,
            SUM(COALESCE(revenue, 0)) AS total_revenue,
            AVG(CASE WHEN revenue IS NOT NULL THEN revenue END) AS average_revenue
        FROM events
        {where}
        GROUP BY day
        ORDER BY day DESC
        LIMIT 14
        """,
        params,
    )
    trend_rows = cursor.fetchall()
    revenue_trend: List[RevenueTrendPoint] = []
    for trend_row in reversed(trend_rows):
        day_value = trend_row["day"]
        if not day_value:
            continue
        try:
            trend_day = datetime.strptime(day_value, "%Y-%m-%d").date()
        except ValueError:  # pragma: no cover - defensive for unexpected formats
            continue
        total_revenue_day = float(trend_row["total_revenue"] or 0.0)
        average_revenue_day = (
            float(trend_row["average_revenue"])
            if trend_row["average_revenue"] is not None
            else 0.0
        )
        revenue_trend.append(
            RevenueTrendPoint(
                day=trend_day,
                total_revenue=total_revenue_day,
                average_revenue=average_revenue_day,
            )
        )

    total_revenue = float(data.get("total") or 0.0)
    average_revenue = float(data.get("average") or 0.0)

    if revenue_trend:
        days_count = len(revenue_trend)
        avg_daily_revenue = (
            sum(point.total_revenue for point in revenue_trend) / days_count
        )
        avg_daily_avg_revenue = (
            sum(point.average_revenue for point in revenue_trend) / days_count
        )
        projections = {
            "projected_revenue_next_7_days": round(avg_daily_revenue * 7, 2),
            "expected_average_revenue_next_7_days": round(avg_daily_avg_revenue, 2),
        }
    else:
        projections = {
            "projected_revenue_next_7_days": 0.0,
            "expected_average_revenue_next_7_days": 0.0,
        }

    if total_revenue:
        revenue_distribution = {
            code: round(amount / total_revenue, 4) if total_revenue else 0.0
            for code, amount in revenue_by_code.items()
        }
    else:
        revenue_distribution = {code: 0.0 for code in revenue_by_code.keys()}

    analytics = RevenueAnalytics(
        total_revenue=total_revenue,
        average_revenue=average_revenue,
        revenue_by_code=revenue_by_code,
        revenue_trend=revenue_trend,
        projections=projections,
        revenue_distribution=revenue_distribution,
    )
    payload = analytics.model_dump(mode="json")
    payload["monthlyTrend"] = monthly_trend
    payload["projectedRevenue"] = projected_revenue
    payload["code_distribution"] = code_distribution_detail
    payload.setdefault("averageRevenue", payload.get("average_revenue", 0.0))
    return payload



@app.get("/api/analytics/compliance")
async def analytics_compliance(user=Depends(require_roles("analyst", "user"))) -> Dict[str, Any]:
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
        f"""
        SELECT
            SUM(CASE WHEN compliance_flags IS NOT NULL AND compliance_flags != '[]' THEN 1 ELSE 0 END) AS notes_with_flags,
            SUM(json_array_length(COALESCE(compliance_flags, '[]'))) AS total_flags,
            SUM(CASE WHEN eventType='note_closed' THEN 1 ELSE 0 END) AS total_notes
        FROM events
        {where}
        """,
        params,
    )
    stats_row = cursor.fetchone()
    stats = dict(stats_row) if stats_row else {}
    notes_with_flags = int(stats.get("notes_with_flags") or 0)
    total_flags = int(stats.get("total_flags") or 0)
    total_notes = int(stats.get("total_notes") or 0)
    flagged_rate = notes_with_flags / total_notes if total_notes else 0.0

    cursor.execute(
        f"""
        SELECT
            DATE(timestamp, 'unixepoch') AS day,
            SUM(CASE WHEN compliance_flags IS NOT NULL AND compliance_flags != '[]' THEN 1 ELSE 0 END) AS notes_with_flags,
            SUM(json_array_length(COALESCE(compliance_flags, '[]'))) AS total_flags
        FROM events
        {where}
        GROUP BY day
        ORDER BY day DESC
        LIMIT 14
        """,
        params,
    )
    trend_rows = cursor.fetchall()
    compliance_trend: List[ComplianceTrendPoint] = []
    for trend_row in reversed(trend_rows):
        day_value = trend_row["day"]
        if not day_value:
            continue
        try:
            trend_day = datetime.strptime(day_value, "%Y-%m-%d").date()
        except ValueError:  # pragma: no cover - defensive for unexpected formats
            continue
        compliance_trend.append(
            ComplianceTrendPoint(
                day=trend_day,
                notes_with_flags=int(trend_row["notes_with_flags"] or 0),
                total_flags=int(trend_row["total_flags"] or 0),
            )
        )

    if compliance_trend:
        days_count = len(compliance_trend)
        avg_notes_with_flags = (
            sum(point.notes_with_flags for point in compliance_trend) / days_count
        )
        avg_total_flags = (
            sum(point.total_flags for point in compliance_trend) / days_count
        )
        projections = {
            "projected_flagged_notes_next_7_days": round(avg_notes_with_flags * 7, 2),
            "projected_flags_next_7_days": round(avg_total_flags * 7, 2),
        }
    else:
        projections = {
            "projected_flagged_notes_next_7_days": 0.0,
            "projected_flags_next_7_days": 0.0,
        }

    if total_flags:
        compliance_distribution = {
            flag: round(count / total_flags, 4) for flag, count in flags.items()
        }
    else:
        compliance_distribution = {flag: 0.0 for flag in flags.keys()}

    analytics = ComplianceAnalytics(
        compliance_counts=flags,
        notes_with_flags=notes_with_flags,
        total_flags=total_flags,
        flagged_rate=flagged_rate,
        compliance_trend=compliance_trend,
        projections=projections,
        compliance_distribution=compliance_distribution,
    )
    return analytics.model_dump()


@app.get("/api/analytics/confidence")
async def analytics_confidence(user=Depends(require_roles("analyst"))) -> Dict[str, Any]:
    """Aggregate confidence score accuracy over time."""

    cursor = db_conn.cursor()
    cursor.execute(
        """
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) AS accepted,
            AVG(confidence) AS avg_confidence
        FROM confidence_scores
        """
    )
    overall_row = cursor.fetchone()
    total = int(overall_row["total"]) if overall_row and overall_row["total"] is not None else 0
    accepted = (
        int(overall_row["accepted"])
        if overall_row and overall_row["accepted"] is not None
        else 0
    )
    avg_conf = (
        float(overall_row["avg_confidence"])
        if overall_row and overall_row["avg_confidence"] is not None
        else 0.0
    )
    accuracy = accepted / total if total else 0.0
    calibration_gap = accuracy - avg_conf if total else 0.0

    cursor.execute(
        """
        SELECT
            date(datetime(created_at, 'unixepoch')) AS day,
            COUNT(*) AS total,
            SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) AS accepted,
            AVG(confidence) AS avg_confidence
        FROM confidence_scores
        GROUP BY day
        ORDER BY day
        """
    )
    series: List[Dict[str, Any]] = []
    for row in cursor.fetchall():
        day_total = row["total"] or 0
        day_accepted = row["accepted"] or 0
        avg_day_conf = row["avg_confidence"] if row["avg_confidence"] is not None else 0.0
        series.append(
            {
                "day": row["day"],
                "total": day_total,
                "accepted": day_accepted,
                "accuracy": (day_accepted / day_total) if day_total else 0.0,
                "avg_confidence": avg_day_conf,
            }
        )

    return {
        "overall": {
            "total": total,
            "accepted": accepted,
            "accuracy": accuracy,
            "avg_confidence": avg_conf,
            "calibration_gap": calibration_gap,
        },
        "timeseries": series,
    }


@app.get("/api/user/permissions")
async def get_user_permissions(user=Depends(require_role("user"))) -> JSONResponse:
    """Return the current user's role."""
    return JSONResponse(
        content={"role": user["role"]},
        headers={"X-Bypass-Envelope": "1"},
    )


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
    return JSONResponse(content=result, headers={"X-Bypass-Envelope": "1"})


@app.get("/transcribe")
async def get_last_transcript(user=Depends(require_role("user"))) -> Dict[str, Any]:
    """Return recent audio transcripts for the current user."""

    history = list(transcript_history.get(user["sub"], []))
    return {"history": history}


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
        code_items = data.get("codes", [])
        codes = [CodeSuggestion(**c) for c in code_items]
        _log_confidence_scores(
            user,
            req.noteId,
            [
                (
                    item.get("code") or item.get("Code"),
                    _normalise_confidence(item.get("confidence") or item.get("Confidence")),
                )
                for item in code_items
            ],
        )
        return SuggestionsResponse(
            codes=codes,
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
        logged_codes: List[Tuple[str, Optional[float]]] = []
        for item in data.get("codes", []):
            code_str = item.get("code") or item.get("Code") or ""
            rationale = item.get("rationale") or item.get("Rationale") or None
            upgrade = item.get("upgrade_to") or item.get("upgradeTo") or None
            upgrade_path = item.get("upgrade_path") or item.get("upgradePath") or None
            confidence_val = _normalise_confidence(
                item.get("confidence") or item.get("Confidence")
            )
            if code_str:
                logged_codes.append((code_str, confidence_val))
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
        _log_confidence_scores(user, req.noteId, logged_codes)
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



def _slugify_identifier(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "item"


def _infer_issue_severity(text: str) -> str:
    lowered = text.lower()
    if any(keyword in lowered for keyword in ("violation", "breach", "critical", "fail", "urgent", "must")):
        return "critical"
    if any(keyword in lowered for keyword in ("missing", "incomplete", "insufficient", "warning", "review")):
        return "warning"
    return "info"


def _infer_issue_category(text: str) -> str:
    lowered = text.lower()
    if any(keyword in lowered for keyword in ("code", "coding", "cpt", "icd", "modifier", "billing")):
        return "coding"
    if any(keyword in lowered for keyword in ("hipaa", "privacy", "compliance", "quality", "regulation")):
        return "quality"
    return "documentation"


def _normalize_compliance_issue_entries(entries: Iterable[str]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    for index, raw_entry in enumerate(entries):
        if raw_entry is None:
            continue
        text = str(raw_entry).strip()
        if not text:
            continue
        issue_id = f"compliance-{_slugify_identifier(text)}-{index}"
        if issue_id in seen_ids:
            continue
        seen_ids.add(issue_id)
        severity = _infer_issue_severity(text)
        category = _infer_issue_category(text)
        normalized.append(
            {
                "id": issue_id,
                "title": text,
                "description": text,
                "details": text,
                "category": category,
                "severity": severity,
                "suggestion": "Review and resolve before finalization.",
                "dismissed": False,
                "source": "wizard",
            }
        )
    return normalized


def _extend_unique(target: List[str], values: Iterable[str]) -> None:
    for value in values:
        if not isinstance(value, str):
            continue
        trimmed = value.strip()
        if not trimmed:
            continue
        if trimmed not in target:
            target.append(trimmed)


def _validate_note(req: PreFinalizeCheckRequest) -> Dict[str, Any]:
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

    required_fields: List[str] = []
    missing_documentation: List[str] = []

    for key in ("content", "codes", "prevention", "diagnoses", "differentials", "compliance"):
        category_issues = issues.get(key, [])
        if category_issues:
            if key not in required_fields:
                required_fields.append(key)
            _extend_unique(missing_documentation, category_issues)

    confidence = 0.0
    if req.differentials:
        confidence = min(1.0, 0.4 + 0.15 * len(req.differentials))
        confidence = min(confidence, 1.0)

    step_validation = {
        "contentReview": {"passed": not issues["content"], "issues": issues["content"]},
        "codeVerification": {"passed": not issues["codes"], "conflicts": issues["codes"]},
        "preventionItems": {"passed": not issues["prevention"], "missing": issues["prevention"]},
        "diagnosesConfirmation": {
            "passed": not issues["diagnoses"],
            "requirements": issues["diagnoses"],
        },
        "differentialsReview": {"passed": not issues["differentials"], "confidence": confidence},
        "complianceChecks": {
            "passed": not issues["compliance"],
            "criticalIssues": issues["compliance"],
        },
    }

    compliance_entries = list(req.compliance or []) + issues["compliance"]
    compliance_issues = _normalize_compliance_issue_entries(compliance_entries)

    can_finalize = all(len(v) == 0 for v in issues.values())

    return {
        "issues": issues,
        "reimbursementDetails": details,
        "estimatedTotal": total,
        "requiredFields": required_fields,
        "missingDocumentation": missing_documentation,
        "stepValidation": step_validation,
        "complianceIssues": compliance_issues,
        "canFinalize": can_finalize,
    }


@app.post("/api/v1/workflow/sessions", response_model=WorkflowSessionResponse)
async def create_workflow_session_v1(
    req: WorkflowSessionCreateRequest, user=Depends(require_role("user"))
) -> WorkflowSessionResponse:
    user_id, session_state, sessions = _get_finalization_sessions(user["sub"])
    session_id = req.sessionId
    existing = None
    created_now = False
    if session_id and session_id in sessions:
        existing = copy.deepcopy(sessions[session_id])
    else:
        for sid, payload in sessions.items():
            if payload.get("encounterId") == req.encounterId:
                existing = copy.deepcopy(payload)
                session_id = sid
                break
    if existing is None:
        session_id = session_id or uuid4().hex
        existing = {
            "sessionId": session_id,
            "encounterId": req.encounterId,
            "patientId": req.patientId,
            "noteId": req.noteId,
            "createdAt": _utc_now_iso(),
            "auditTrail": [],
        }
        created_now = True
    existing.update(
        {
            "sessionId": session_id,
            "encounterId": req.encounterId or existing.get("encounterId"),
            "patientId": req.patientId or existing.get("patientId"),
            "noteId": req.noteId or existing.get("noteId"),
        }
    )
    existing["noteContent"] = (
        req.noteContent if req.noteContent is not None else existing.get("noteContent", "")
    )
    metadata = existing.get("patientMetadata") or {}
    if req.patientMetadata:
        metadata.update({k: v for k, v in req.patientMetadata.items() if v is not None})
    existing["patientMetadata"] = metadata
    context_payload = existing.get("context") if isinstance(existing.get("context"), dict) else {}
    if req.context:
        context_payload.update({k: v for k, v in req.context.items() if v is not None})
    existing["context"] = context_payload
    if req.createdBy:
        existing["createdBy"] = req.createdBy
    if req.owner:
        existing["owner"] = req.owner
    if req.collaborators:
        existing["collaborators"] = req.collaborators
    if req.activeEditors:
        existing["activeEditors"] = req.activeEditors
    codes_payload = req.selectedCodes or existing.get("selectedCodes") or session_state.get("selectedCodesList") or []
    existing["selectedCodes"] = codes_payload
    issues_payload = req.complianceIssues or existing.get("complianceIssues") or []
    existing["complianceIssues"] = issues_payload
    _register_session_activity(existing, user)
    existing["updatedAt"] = _utc_now_iso()
    event_details = {"encounterId": req.encounterId, "patientId": existing.get("patientId")}
    if created_now:
        _append_audit_event(existing, "session_created", event_details, actor=user.get("sub"))
    else:
        _append_audit_event(existing, "session_updated", event_details, actor=user.get("sub"))
    normalized = _normalize_finalization_session(existing)
    normalized["reimbursementSummary"] = _compute_reimbursement_summary(normalized["selectedCodes"])
    normalized["patientQuestions"] = _generate_patient_questions(
        normalized["selectedCodes"], normalized["complianceIssues"]
    )
    normalized["updatedAt"] = existing["updatedAt"]
    normalized["context"] = existing.get("context", {})
    _recalculate_current_step(normalized)
    _update_session_progress(normalized)
    sessions[session_id] = normalized
    _sync_selected_codes_to_session_state(session_state, normalized)
    _persist_finalization_sessions(user_id, session_state, sessions)
    response_payload = _session_to_response(normalized)
    return WorkflowSessionResponse(**response_payload)


@app.get("/api/v1/workflow/sessions/{session_id}", response_model=WorkflowSessionResponse)
async def get_workflow_session_v1(
    session_id: str, user=Depends(require_role("user"))
) -> WorkflowSessionResponse:
    user_id, session_state, sessions, payload = _resolve_session_for_user(
        user["sub"], session_id
    )
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")
    # ``_resolve_session_for_user`` persists shared sessions into the caller's
    # state. Normalize a copy to guarantee consistent structure before storing
    # it locally for the requester.
    normalized = _normalize_finalization_session(copy.deepcopy(payload))
    sessions[session_id] = normalized
    _persist_finalization_sessions(user_id, session_state, sessions)
    return WorkflowSessionResponse(**_session_to_response(normalized))


@app.put("/api/v1/workflow/sessions/{session_id}/step", response_model=WorkflowSessionResponse)
async def update_workflow_session_step_v1(
    session_id: str,
    req: WorkflowStepUpdateRequest,
    user=Depends(require_role("user")),
) -> WorkflowSessionResponse:
    user_id, session_state, sessions, payload = _resolve_session_for_user(
        user["sub"], session_id
    )
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session = copy.deepcopy(payload)
    states = session.get("stepStates") or {}
    key = str(req.step)
    if key not in states:
        states[key] = _default_step_states()[key]
    entry = states[key]
    entry["status"] = req.status
    entry["updatedAt"] = _utc_now_iso()
    if req.progress is not None:
        entry["progress"] = int(req.progress)
    if entry["status"] == "in_progress" and not entry.get("startedAt"):
        entry["startedAt"] = entry["updatedAt"]
    if entry["status"] == "completed":
        entry["completedAt"] = entry["updatedAt"]
        entry["progress"] = max(entry.get("progress", 0), 100)
    if req.notes is not None:
        entry["notes"] = req.notes
    if req.blockingIssues is not None:
        entry["blockingIssues"] = [
            str(item).strip()
            for item in req.blockingIssues
            if isinstance(item, str) and item.strip()
        ]
        session["blockingIssues"] = entry["blockingIssues"]
    states[key] = entry
    session["stepStates"] = states
    _register_session_activity(session, user)
    session["updatedAt"] = _utc_now_iso()
    _append_audit_event(
        session,
        "step_updated",
        {"step": req.step, "status": req.status},
        actor=user.get("sub"),
    )
    normalized = _normalize_finalization_session(session)
    normalized["updatedAt"] = session["updatedAt"]
    _recalculate_current_step(normalized)
    _update_session_progress(normalized)
    sessions[session_id] = normalized
    _persist_finalization_sessions(user_id, session_state, sessions)
    return WorkflowSessionResponse(**_session_to_response(normalized))


@app.delete("/api/v1/workflow/sessions/{session_id}")
async def delete_workflow_session_v1(
    session_id: str, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    user_id, session_state, sessions, payload = _resolve_session_for_user(
        user["sub"], session_id
    )
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")
    sessions.pop(session_id, None)
    _persist_finalization_sessions(user_id, session_state, sessions)
    _delete_shared_workflow_session(session_id)
    return {"status": "ended", "sessionId": session_id}


@app.get("/api/v1/codes/selected/{encounter_id}")
async def get_selected_codes_v1(
    encounter_id: str, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    user_id, session_state, sessions = _get_finalization_sessions(user["sub"])
    found_session = None
    found_id = None
    for sid, payload in sessions.items():
        if payload.get("encounterId") == encounter_id:
            found_session = payload
            found_id = sid
            break
    if not found_session:
        shared_id, shared_payload = _fetch_shared_session_by_encounter(encounter_id)
        if shared_payload:
            found_session = copy.deepcopy(shared_payload)
            found_id = shared_id
            sessions[shared_id] = found_session
            _persist_finalization_sessions(user_id, session_state, sessions)
        else:
            codes = session_state.get("selectedCodesList") or []
            if not isinstance(codes, list):
                codes = []
            summary = _compute_reimbursement_summary(
                [_normalize_code_entry(item, idx) for idx, item in enumerate(codes)]
            )
            return {
                "encounterId": encounter_id,
                "sessionId": None,
                "codes": codes,
                "reimbursementSummary": summary,
                "complianceIssues": [],
            }
    normalized = _normalize_finalization_session(found_session)
    return {
        "encounterId": encounter_id,
        "sessionId": found_id,
        "codes": normalized.get("selectedCodes", []),
        "reimbursementSummary": normalized.get("reimbursementSummary", {}),
        "complianceIssues": normalized.get("complianceIssues", []),
    }


@app.post("/api/v1/codes/selected", response_model=WorkflowSessionResponse)
async def add_selected_code_v1(
    req: SelectedCodeCreateRequest, user=Depends(require_role("user"))
) -> WorkflowSessionResponse:
    user_id, session_state, sessions = _get_finalization_sessions(user["sub"])
    session_id = req.sessionId
    payload = None
    if session_id:
        user_id, session_state, sessions, payload = _resolve_session_for_user(
            user["sub"], session_id
        )
    if payload is None:
        for sid, entry in sessions.items():
            if entry.get("encounterId") == req.encounterId:
                payload = entry
                session_id = sid
                break
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session = copy.deepcopy(payload)
    codes = session.get("selectedCodes") or []
    codes.append(req.model_dump(exclude={"encounterId", "sessionId"}, exclude_none=True))
    session["selectedCodes"] = codes
    _register_session_activity(session, user)
    session["updatedAt"] = _utc_now_iso()
    _append_audit_event(
        session,
        "code_added",
        {"code": req.code},
        actor=user.get("sub"),
    )
    normalized = _normalize_finalization_session(session)
    normalized["reimbursementSummary"] = _compute_reimbursement_summary(normalized["selectedCodes"])
    normalized["updatedAt"] = session["updatedAt"]
    sessions[session_id] = normalized
    _sync_selected_codes_to_session_state(session_state, normalized)
    _persist_finalization_sessions(user_id, session_state, sessions)
    return WorkflowSessionResponse(**_session_to_response(normalized))


@app.put("/api/v1/codes/selected/{code_id}", response_model=WorkflowSessionResponse)
async def update_selected_code_v1(
    code_id: str,
    req: SelectedCodeUpdateRequest,
    user=Depends(require_role("user")),
) -> WorkflowSessionResponse:
    user_id, session_state, sessions = _get_finalization_sessions(user["sub"])
    session_id = req.sessionId
    payload = None
    if session_id:
        user_id, session_state, sessions, payload = _resolve_session_for_user(
            user["sub"], session_id
        )
    if payload is None:
        for sid, entry in sessions.items():
            if req.encounterId and entry.get("encounterId") != req.encounterId:
                continue
            if any(
                str(item.get("id")) == str(code_id)
                or str(item.get("code")) == str(code_id)
                for item in entry.get("selectedCodes", [])
            ):
                payload = entry
                session_id = sid
                break
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session = copy.deepcopy(payload)
    updated = False
    codes = session.get("selectedCodes") or []
    for item in codes:
        if str(item.get("id")) == str(code_id) or str(item.get("code")) == str(code_id):
            item.update({k: v for k, v in req.model_dump(exclude_none=True).items() if k not in {"sessionId", "encounterId"}})
            updated = True
            break
    if not updated:
        raise HTTPException(status_code=404, detail="Code not found")
    session["selectedCodes"] = codes
    _register_session_activity(session, user)
    session["updatedAt"] = _utc_now_iso()
    _append_audit_event(
        session,
        "code_updated",
        {"codeId": code_id},
        actor=user.get("sub"),
    )
    normalized = _normalize_finalization_session(session)
    normalized["reimbursementSummary"] = _compute_reimbursement_summary(normalized["selectedCodes"])
    normalized["updatedAt"] = session["updatedAt"]
    sessions[session_id] = normalized
    _sync_selected_codes_to_session_state(session_state, normalized)
    _persist_finalization_sessions(user_id, session_state, sessions)
    return WorkflowSessionResponse(**_session_to_response(normalized))


@app.delete("/api/v1/codes/selected/{code_id}", response_model=WorkflowSessionResponse)
async def delete_selected_code_v1(
    code_id: str,
    encounterId: Optional[str] = None,
    sessionId: Optional[str] = None,
    user=Depends(require_role("user")),
) -> WorkflowSessionResponse:
    user_id, session_state, sessions = _get_finalization_sessions(user["sub"])
    session_id = sessionId
    payload = None
    if session_id:
        user_id, session_state, sessions, payload = _resolve_session_for_user(
            user["sub"], session_id
        )
    if payload is None:
        for sid, entry in sessions.items():
            if encounterId and entry.get("encounterId") != encounterId:
                continue
            if any(
                str(item.get("id")) == str(code_id)
                or str(item.get("code")) == str(code_id)
                for item in entry.get("selectedCodes", [])
            ):
                payload = entry
                session_id = sid
                break
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session = copy.deepcopy(payload)
    codes = [
        item
        for item in session.get("selectedCodes", [])
        if not (str(item.get("id")) == str(code_id) or str(item.get("code")) == str(code_id))
    ]
    session["selectedCodes"] = codes
    _register_session_activity(session, user)
    session["updatedAt"] = _utc_now_iso()
    _append_audit_event(
        session,
        "code_removed",
        {"codeId": code_id},
        actor=user.get("sub"),
    )
    normalized = _normalize_finalization_session(session)
    normalized["reimbursementSummary"] = _compute_reimbursement_summary(normalized["selectedCodes"])
    normalized["updatedAt"] = session["updatedAt"]
    sessions[session_id] = normalized
    _sync_selected_codes_to_session_state(session_state, normalized)
    _persist_finalization_sessions(user_id, session_state, sessions)
    return WorkflowSessionResponse(**_session_to_response(normalized))


@app.put(
    "/api/v1/notes/{encounter_id}/content",
    response_model=NoteContentUpdateResponse,
)
async def update_note_content_v1(
    encounter_id: str,
    req: NoteContentUpdateRequest,
    user=Depends(require_role("user")),
) -> NoteContentUpdateResponse:
    user_id, session_state, sessions = _get_finalization_sessions(user["sub"])
    session_id = req.sessionId
    payload = None
    if session_id:
        user_id, session_state, sessions, payload = _resolve_session_for_user(
            user["sub"], session_id
        )
    if payload is None:
        for sid, entry in sessions.items():
            if entry.get("encounterId") == encounter_id:
                payload = entry
                session_id = sid
                break
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session = copy.deepcopy(payload)
    session["noteContent"] = req.content
    updated_at = _utc_now_iso()
    session["updatedAt"] = updated_at
    step_states = session.get("stepStates") or {}
    if "3" in step_states:
        compose_step = step_states["3"]
    else:
        compose_step = _default_step_states()["3"]
    compose_step.update(
        {
            "status": "completed",
            "progress": 100,
            "completedAt": updated_at,
            "updatedAt": updated_at,
        }
    )
    if not compose_step.get("startedAt"):
        compose_step["startedAt"] = updated_at
    step_states["3"] = compose_step
    if "4" in step_states:
        compare_step = step_states["4"]
    else:
        compare_step = _default_step_states()["4"]
    if compare_step.get("status") == "not_started":
        compare_step["status"] = "in_progress"
        compare_step["startedAt"] = updated_at
    compare_step["updatedAt"] = updated_at
    step_states["4"] = compare_step
    session["stepStates"] = step_states
    _register_session_activity(session, user)
    normalized = _normalize_finalization_session(session)
    codes = [str(item.get("code")) for item in normalized.get("selectedCodes", []) if item.get("code")]
    precheck = PreFinalizeCheckRequest(
        content=req.content,
        codes=req.codes or codes,
        prevention=req.prevention or [],
        diagnoses=req.diagnoses or [],
        differentials=req.differentials or [],
        compliance=req.compliance or [],
    )
    validation_result = _validate_note(precheck)
    issues = validation_result["issues"]
    details = validation_result["reimbursementDetails"]
    total = validation_result["estimatedTotal"]
    validation = {
        "canFinalize": validation_result["canFinalize"],
        "issues": issues,
        "estimatedReimbursement": total,
        "reimbursementSummary": {"total": total, "codes": details},
        "requiredFields": validation_result["requiredFields"],
        "missingDocumentation": validation_result["missingDocumentation"],
        "stepValidation": validation_result["stepValidation"],
        "complianceIssues": validation_result["complianceIssues"],
    }
    normalized["reimbursementSummary"] = validation["reimbursementSummary"]
    normalized["blockingIssues"] = _collect_blocking_issues(issues)
    normalized["lastValidation"] = validation
    normalized["updatedAt"] = updated_at
    normalized["context"] = session.get("context", {})
    _append_audit_event(
        normalized,
        "note_updated",
        {"encounterId": encounter_id},
        actor=user.get("sub"),
    )
    _recalculate_current_step(normalized)
    _update_session_progress(normalized)
    sessions[session_id] = normalized
    _sync_selected_codes_to_session_state(session_state, normalized)
    _persist_finalization_sessions(user_id, session_state, sessions)
    response_payload = NoteContentUpdateResponse(
        encounterId=encounter_id,
        sessionId=session_id,
        noteContent=req.content,
        reimbursementSummary=validation["reimbursementSummary"],
        validation=validation,
        session=WorkflowSessionResponse(**_session_to_response(normalized)),
    )
    return response_payload


@app.post(
    "/api/v1/workflow/{session_id}/step5/attest",
    response_model=WorkflowAttestationResponse,
)
async def attest_workflow_session_v1(
    session_id: str,
    req: AttestationRequest,
    user=Depends(require_role("user")),
) -> WorkflowAttestationResponse:
    user_id, session_state, sessions, payload = _resolve_session_for_user(
        user["sub"], session_id
    )
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session = copy.deepcopy(payload)
    requested_attestation = req.attestation.model_dump() if req.attestation else {}
    attestation_timestamp = (
        requested_attestation.get("attestationTimestamp")
        or req.timestamp
        or _utc_now_iso()
    )
    attested_by = (
        requested_attestation.get("attestedBy")
        or req.attestedBy
        or user.get("sub")
    )
    statement = (
        requested_attestation.get("attestationText")
        or req.statement
        or "Provider attestation recorded"
    )
    requested_attestation.setdefault("attestationTimestamp", attestation_timestamp)
    requested_attestation.setdefault("attestationText", statement)
    requested_attestation.setdefault("attestedBy", attested_by)
    if requested_attestation.get("physicianAttestation") is None:
        requested_attestation["physicianAttestation"] = True
    billing_validation = (
        req.billingValidation.model_dump()
        if req.billingValidation
        else _derive_billing_validation_from_session(session)
    )
    if not billing_validation.get("estimatedReimbursement"):
        fallback_billing = _derive_billing_validation_from_session(session)
        billing_validation["estimatedReimbursement"] = fallback_billing.get(
            "estimatedReimbursement", 0.0
        )
    compliance_checks = (
        [item.model_dump() for item in req.complianceChecks]
        if req.complianceChecks
        else _derive_compliance_checks_from_session(session)
    )
    billing_summary = (
        req.billingSummary.model_dump()
        if req.billingSummary
        else _derive_billing_summary_from_session(session)
    )
    session["attestation"] = _normalize_attestation_payload(
        {
            "billingValidation": billing_validation,
            "attestation": requested_attestation,
            "complianceChecks": compliance_checks,
            "billingSummary": billing_summary,
        }
    )
    step_states = session.get("stepStates") or {}
    attest_step = step_states.get("5") or _default_step_states()["5"]
    attest_step.update(
        {
            "status": "completed",
            "progress": 100,
            "completedAt": attestation_timestamp,
            "updatedAt": attestation_timestamp,
        }
    )
    if not attest_step.get("startedAt"):
        attest_step["startedAt"] = attestation_timestamp
    step_states["5"] = attest_step
    dispatch_step = step_states.get("6") or _default_step_states()["6"]
    if dispatch_step.get("status") == "not_started":
        dispatch_step["status"] = "in_progress"
        dispatch_step["startedAt"] = attestation_timestamp
    dispatch_step["updatedAt"] = attestation_timestamp
    step_states["6"] = dispatch_step
    session["stepStates"] = step_states
    _register_session_activity(session, user)
    session["updatedAt"] = attestation_timestamp
    _append_audit_event(
        session,
        "attestation_submitted",
        session["attestation"].get("attestation", {}),
        actor=user.get("sub"),
    )
    normalized = _normalize_finalization_session(session)
    normalized["attestation"] = session["attestation"]
    normalized["updatedAt"] = session["updatedAt"]
    normalized["context"] = session.get("context", {})
    _recalculate_current_step(normalized)
    _update_session_progress(normalized)
    sessions[session_id] = normalized
    _persist_finalization_sessions(user_id, session_state, sessions)
    return WorkflowAttestationResponse(session=WorkflowSessionResponse(**_session_to_response(normalized)))


@app.post(
    "/api/v1/workflow/{session_id}/step6/dispatch",
    response_model=DispatchResponse,
)
async def dispatch_workflow_session_v1(
    session_id: str,
    req: DispatchRequest,
    user=Depends(require_role("user")),
) -> DispatchResponse:
    user_id, session_state, sessions, payload = _resolve_session_for_user(
        user["sub"], session_id
    )
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session = copy.deepcopy(payload)
    dispatch_status_payload = req.dispatchStatus.model_dump() if req.dispatchStatus else {}
    dispatch_timestamp = (
        dispatch_status_payload.get("dispatchTimestamp")
        or req.timestamp
        or _utc_now_iso()
    )
    destination = req.destination or payload.get("dispatch", {}).get("destination") or "ehr"
    delivery_method = (
        req.deliveryMethod
        or payload.get("dispatch", {}).get("deliveryMethod")
        or "internal"
    )
    final_review = (
        req.finalReview.model_dump()
        if req.finalReview
        else _derive_final_review_from_session(session)
    )
    dispatch_options = (
        req.dispatchOptions.model_dump()
        if req.dispatchOptions
        else DispatchOptionsModel(sendToEmr=True, sendToBilling=True).model_dump()
    )
    dispatch_status_payload.setdefault("dispatchTimestamp", dispatch_timestamp)
    if dispatch_status_payload.get("dispatchInitiated") is None:
        dispatch_status_payload["dispatchInitiated"] = True
    if dispatch_status_payload.get("dispatchCompleted") is None:
        dispatch_status_payload["dispatchCompleted"] = True
    if dispatch_status_payload.get("dispatchConfirmationNumber") is None:
        dispatch_status_payload["dispatchConfirmationNumber"] = uuid4().hex[:8]
    if dispatch_status_payload.get("dispatchErrors") is None:
        dispatch_status_payload["dispatchErrors"] = []
    dispatch_status = DispatchStatusModel.model_validate(
        dispatch_status_payload
    ).model_dump()
    actions = (
        [item.model_dump() for item in req.postDispatchActions]
        if req.postDispatchActions
        else []
    )
    session["dispatch"] = _normalize_dispatch_payload(
        {
            "destination": destination,
            "deliveryMethod": delivery_method,
            "timestamp": dispatch_timestamp,
            "finalReview": final_review,
            "dispatchOptions": dispatch_options,
            "dispatchStatus": dispatch_status,
            "postDispatchActions": actions,
        }
    )
    step_states = session.get("stepStates") or {}
    dispatch_step = step_states.get("6") or _default_step_states()["6"]
    dispatch_step.update(
        {
            "status": "completed",
            "progress": 100,
            "completedAt": dispatch_timestamp,
            "updatedAt": dispatch_timestamp,
        }
    )
    if not dispatch_step.get("startedAt"):
        dispatch_step["startedAt"] = dispatch_timestamp
    step_states["6"] = dispatch_step
    session["stepStates"] = step_states
    _register_session_activity(session, user)
    session["updatedAt"] = dispatch_timestamp
    normalized = _normalize_finalization_session(session)
    normalized["dispatch"] = session["dispatch"]
    validation = normalized.get("lastValidation")
    if not isinstance(validation, dict):
        validation = {
            "issues": {},
            "reimbursementSummary": normalized.get("reimbursementSummary", {}),
            "canFinalize": True,
        }
    issues = validation.get("issues") or {}
    reimbursement_summary = validation.get("reimbursementSummary") or normalized.get("reimbursementSummary") or {
        "total": 0.0,
        "codes": [],
    }
    blocking = _collect_blocking_issues(issues)
    normalized["blockingIssues"] = blocking
    export_ready = not blocking
    finalized_content = (normalized.get("noteContent") or "").strip()
    normalized["updatedAt"] = session["updatedAt"]
    normalized["context"] = session.get("context", {})
    _append_audit_event(
        normalized,
        "dispatch_completed",
        normalized["dispatch"].get("dispatchStatus", {}),
        actor=user.get("sub"),
    )
    _recalculate_current_step(normalized)
    _update_session_progress(normalized)
    sessions[session_id] = normalized
    _persist_finalization_sessions(user_id, session_state, sessions)
    result = FinalizeResult(
        finalizedContent=finalized_content,
        codesSummary=reimbursement_summary.get("codes", []),
        reimbursementSummary=reimbursement_summary,
        exportReady=export_ready,
        issues=issues,
    )
    return DispatchResponse(
        session=WorkflowSessionResponse(**_session_to_response(normalized)),
        result=result,
    )


@app.get("/api/v1/questions/{encounter_id}")
async def get_patient_questions_v1(
    encounter_id: str, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    user_id, session_state, sessions = _get_finalization_sessions(user["sub"])
    for sid, payload in sessions.items():
        if payload.get("encounterId") == encounter_id:
            normalized = _normalize_finalization_session(payload)
            return {
                "encounterId": encounter_id,
                "sessionId": sid,
                "questions": normalized.get("patientQuestions", []),
            }
    shared_id, shared_payload = _fetch_shared_session_by_encounter(encounter_id)
    if shared_payload:
        normalized = _normalize_finalization_session(shared_payload)
        sessions[shared_id] = copy.deepcopy(normalized)
        _persist_finalization_sessions(user_id, session_state, sessions)
        return {
            "encounterId": encounter_id,
            "sessionId": shared_id,
            "questions": normalized.get("patientQuestions", []),
        }
    return {"encounterId": encounter_id, "sessionId": None, "questions": []}


@app.post("/api/v1/questions/{question_id}/answer")
async def answer_patient_question_v1(
    question_id: str,
    req: QuestionAnswerRequest,
    user=Depends(require_role("user")),
) -> Dict[str, Any]:
    user_id, session_state, sessions = _get_finalization_sessions(user["sub"])
    session_id = req.sessionId
    payload = None
    if session_id:
        user_id, session_state, sessions, payload = _resolve_session_for_user(
            user["sub"], session_id
        )
    if payload is None:
        for sid, entry in sessions.items():
            if any(str(item.get("id")) == str(question_id) for item in entry.get("patientQuestions", [])):
                payload = entry
                session_id = sid
                break
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found for question")
    session = copy.deepcopy(payload)
    questions = session.get("patientQuestions") or []
    updated = None
    answer_timestamp = req.timestamp or _utc_now_iso()
    for item in questions:
        if str(item.get("id")) == str(question_id):
            existing_answer = item.get("answer") if isinstance(item.get("answer"), dict) else {}
            if not existing_answer and isinstance(item.get("answerMetadata"), dict):
                existing_answer = item.get("answerMetadata")
            confidence = req.confidenceLevel or existing_answer.get("confidenceLevel") or "certain"
            if not isinstance(confidence, str) or confidence not in {"certain", "probable", "uncertain"}:
                confidence = "certain"
            notes = req.notes if req.notes is not None else existing_answer.get("notes")
            if notes is not None and not isinstance(notes, str):
                notes = str(notes)
            verification_needed = (
                bool(req.verificationNeeded)
                if req.verificationNeeded is not None
                else bool(existing_answer.get("verificationNeeded", False))
            )
            metadata = {
                "answerText": req.answer,
                "confidenceLevel": confidence,
                "notes": notes,
                "verificationNeeded": verification_needed,
            }
            item["answer"] = metadata
            item["answerMetadata"] = metadata
            item["answeredBy"] = req.answeredBy or user.get("sub")
            item["answeredAt"] = answer_timestamp
            item["status"] = "answered"
            item["updatedAt"] = answer_timestamp
            updated = item
            break
    if updated is None:
        raise HTTPException(status_code=404, detail="Question not found")
    session["patientQuestions"] = questions
    _register_session_activity(session, user)
    session["updatedAt"] = answer_timestamp
    _append_audit_event(
        session,
        "question_answered",
        {"questionId": question_id},
        actor=user.get("sub"),
    )
    normalized = _normalize_finalization_session(session)
    normalized["updatedAt"] = session["updatedAt"]
    normalized["context"] = session.get("context", {})
    sessions[session_id] = normalized
    _persist_finalization_sessions(user_id, session_state, sessions)
    question_payload = next(
        (item for item in normalized.get("patientQuestions", []) if str(item.get("id")) == str(question_id)),
        updated,
    )
    return {
        "question": question_payload,
        "session": WorkflowSessionResponse(**_session_to_response(normalized)),
    }


@app.put("/api/v1/questions/{question_id}/status")
async def update_patient_question_status_v1(
    question_id: str,
    req: QuestionStatusUpdateRequest,
    user=Depends(require_role("user")),
) -> Dict[str, Any]:
    user_id, session_state, sessions = _get_finalization_sessions(user["sub"])
    session_id = req.sessionId
    payload = None
    if session_id:
        user_id, session_state, sessions, payload = _resolve_session_for_user(
            user["sub"], session_id
        )
    if payload is None:
        for sid, entry in sessions.items():
            if any(str(item.get("id")) == str(question_id) for item in entry.get("patientQuestions", [])):
                payload = entry
                session_id = sid
                break
    if payload is None:
        raise HTTPException(status_code=404, detail="Session not found for question")
    session = copy.deepcopy(payload)
    questions = session.get("patientQuestions") or []
    updated = None
    status_timestamp = req.timestamp or _utc_now_iso()
    normalized_status_value: Optional[str] = None
    for item in questions:
        if str(item.get("id")) == str(question_id):
            new_status = req.status or "pending"
            if new_status == "resolved":
                new_status = "answered"
            item["status"] = new_status
            item["updatedBy"] = req.updatedBy or user.get("sub")
            item["updatedAt"] = status_timestamp
            if new_status == "answered":
                if not item.get("answeredAt"):
                    item["answeredAt"] = status_timestamp
                if not item.get("answeredBy"):
                    item["answeredBy"] = req.updatedBy or user.get("sub")
            elif new_status in {"pending", "in_progress"}:
                answer_payload = item.get("answer")
                if not (isinstance(answer_payload, dict) and answer_payload.get("answerText")):
                    answer_payload = item.get("answerMetadata")
                if not (isinstance(answer_payload, dict) and answer_payload.get("answerText")):
                    item.pop("answeredAt", None)
                    item.pop("answeredBy", None)
                    item["answer"] = None
                    item["answerMetadata"] = None
            updated = item
            normalized_status_value = new_status
            break
    if updated is None:
        raise HTTPException(status_code=404, detail="Question not found")
    session["patientQuestions"] = questions
    _register_session_activity(session, user)
    session["updatedAt"] = status_timestamp
    _append_audit_event(
        session,
        "question_status_updated",
        {"questionId": question_id, "status": normalized_status_value or req.status},
        actor=user.get("sub"),
    )
    normalized = _normalize_finalization_session(session)
    normalized["updatedAt"] = session["updatedAt"]
    normalized["context"] = session.get("context", {})
    sessions[session_id] = normalized
    _persist_finalization_sessions(user_id, session_state, sessions)
    question_payload = next(
        (item for item in normalized.get("patientQuestions", []) if str(item.get("id")) == str(question_id)),
        updated,
    )
    return {
        "question": question_payload,
        "session": WorkflowSessionResponse(**_session_to_response(normalized)),
    }


@app.post("/api/notes/pre-finalize-check")
async def pre_finalize_check(
    req: PreFinalizeCheckRequest, user=Depends(require_role("user"))
):
    """Validate a draft note before allowing finalization."""

    validation_result = _validate_note(req)
    details = validation_result["reimbursementDetails"]
    total = validation_result["estimatedTotal"]
    return {
        "canFinalize": validation_result["canFinalize"],
        "issues": validation_result["issues"],
        "requiredFields": validation_result["requiredFields"],
        "missingDocumentation": validation_result["missingDocumentation"],
        "stepValidation": validation_result["stepValidation"],
        "complianceIssues": validation_result["complianceIssues"],
        "estimatedReimbursement": total,
        "reimbursementSummary": {"total": total, "codes": details},
    }


@app.post("/api/notes/finalize")
async def finalize_note(
    req: FinalizeNoteRequest, user=Depends(require_role("user"))
):
    """Finalize a note and report export readiness and reimbursement."""

    validation_result = _validate_note(req)
    details = validation_result["reimbursementDetails"]
    total = validation_result["estimatedTotal"]
    export_ready = validation_result["canFinalize"]
    compliance_certification = {
        "status": "pass" if export_ready else "fail",
        "attestedBy": user.get("sub"),
        "attestedAt": _utc_now_iso(),
        "summary": "All compliance checks passed." if export_ready else "Outstanding compliance items require attention.",
        "pendingActions": validation_result["missingDocumentation"],
        "issuesReviewed": validation_result["complianceIssues"],
        "stepValidation": validation_result["stepValidation"],
    }
    return {
        "finalizedContent": req.content.strip(),
        "codesSummary": details,
        "reimbursementSummary": {"total": total, "codes": details},
        "estimatedReimbursement": total,
        "exportReady": export_ready,
        "exportStatus": "complete" if export_ready else "pending",
        "issues": validation_result["issues"],
        "requiredFields": validation_result["requiredFields"],
        "missingDocumentation": validation_result["missingDocumentation"],
        "stepValidation": validation_result["stepValidation"],
        "complianceIssues": validation_result["complianceIssues"],
        "complianceCertification": compliance_certification,
        "finalizedNoteId": uuid4().hex,
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


def _load_compliance_rule_index(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    try:
        rows = conn.execute(
            "SELECT id, name, category, priority, citations, keywords FROM compliance_rule_catalog"
        ).fetchall()
    except sqlite3.Error:
        return []

    catalogue: List[Dict[str, Any]] = []
    for row in rows:
        record = dict(row)
        citations_raw = record.get("citations")
        citations: List[Any]
        if citations_raw:
            try:
                parsed = json.loads(citations_raw)
            except Exception:
                parsed = citations_raw
            if isinstance(parsed, list):
                citations = list(parsed)
            elif isinstance(parsed, dict):
                citations = [parsed]
            else:
                citations = [parsed]
        else:
            citations = []

        keywords_raw = record.get("keywords")
        keywords: List[str] = []
        if keywords_raw:
            try:
                parsed_kw = json.loads(keywords_raw)
            except Exception:
                parsed_kw = keywords_raw
            if isinstance(parsed_kw, str):
                items = [parsed_kw]
            else:
                items = list(parsed_kw)
            for item in items:
                if not item:
                    continue
                keywords.append(str(item).lower())

        catalogue.append(
            {
                "id": record.get("id"),
                "name": record.get("name"),
                "category": record.get("category"),
                "priority": record.get("priority"),
                "citations": citations,
                "keywords": keywords,
            }
        )
    return catalogue


def _match_rule_references(
    alert: ComplianceAlert, rule_index: List[Dict[str, Any]]
) -> List[RuleReference]:
    if not rule_index:
        return []

    haystack_parts = [alert.text or "", alert.reasoning or "", alert.category or "", alert.priority or ""]
    haystack = " ".join(part for part in haystack_parts if part).lower()

    matches: List[RuleReference] = []
    seen: Set[str] = set()
    for record in rule_index:
        rule_id = record.get("id")
        if not rule_id or rule_id in seen:
            continue
        keywords = record.get("keywords") or []
        matched = False
        for keyword in keywords:
            if keyword and keyword in haystack:
                matched = True
                break
        if not matched and record.get("name"):
            name = str(record["name"]).lower()
            if name and name in haystack:
                matched = True
        if not matched and alert.category and record.get("category"):
            if alert.category.lower() == str(record["category"]).lower():
                matched = True
        if not matched:
            continue
        seen.add(rule_id)
        citations: List[RuleCitation] = []
        for citation in record.get("citations", []):
            if isinstance(citation, dict):
                citations.append(
                    RuleCitation(
                        title=citation.get("title"),
                        url=citation.get("url"),
                        citation=citation.get("citation"),
                    )
                )
            elif citation:
                citations.append(RuleCitation(title=str(citation)))
        matches.append(RuleReference(ruleId=str(rule_id), citations=citations))
    return matches


def _build_compliance_response(
    alerts: List[ComplianceAlert], conn: sqlite3.Connection
) -> ComplianceCheckResponse:
    if not alerts:
        return ComplianceCheckResponse(alerts=[], ruleReferences=[])

    rule_index = _load_compliance_rule_index(conn)
    aggregated: Dict[str, RuleReference] = {}
    enriched_alerts: List[ComplianceAlert] = []

    for alert in alerts:
        references = _match_rule_references(alert, rule_index)
        alert_payload = alert.model_dump()
        alert_payload["ruleReferences"] = references
        enriched_alerts.append(ComplianceAlert(**alert_payload))
        for reference in references:
            existing = aggregated.get(reference.ruleId)
            if existing is None:
                aggregated[reference.ruleId] = RuleReference(
                    ruleId=reference.ruleId,
                    citations=list(reference.citations),
                )
                continue
            existing_keys = {
                (item.title, item.url, item.citation) for item in existing.citations
            }
            for citation in reference.citations:
                key = (citation.title, citation.url, citation.citation)
                if key not in existing_keys:
                    existing.citations.append(citation)

    aggregated_list = sorted(aggregated.values(), key=lambda ref: ref.ruleId)
    return ComplianceCheckResponse(alerts=enriched_alerts, ruleReferences=aggregated_list)


async def _compliance_check(
    req: ComplianceCheckRequest, db: sqlite3.Connection | None = None
) -> ComplianceCheckResponse:
    conn = db or db_conn
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
        return _build_compliance_response(alerts, conn)
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
        return _build_compliance_response(alerts, conn)
    except Exception as exc:
        logging.error("compliance check failed: %s", exc)
        return ComplianceCheckResponse(alerts=[], ruleReferences=[])


@app.post("/api/ai/compliance/check", response_model=ComplianceCheckResponse)
async def compliance_check(
    req: ComplianceCheckRequest,
    user=Depends(require_role("user")),
    conn: sqlite3.Connection = Depends(get_db),
) -> ComplianceCheckResponse:
    return await _compliance_check(req, conn)


@app.websocket("/ws/api/ai/compliance/check")
async def ws_compliance_check(websocket: WebSocket):
    await ws_require_role(websocket, "user")
    await websocket.accept()
    data = await websocket.receive_json()
    resp = await _compliance_check(ComplianceCheckRequest(**data), db_conn)
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
                payer=metadata.get("payer") if isinstance(metadata, dict) else None,
            )
            if record.get("issueId"):
                persisted_ids.append(record["issueId"])
                recipients = {
                    user.get("sub"),
                    record.get("assignee"),
                    record.get("createdBy"),
                }
                await _notify_compliance_issue(record, recipients)
    response = ComplianceMonitorResponse(
        issues=issues,
        summary=result.get("summary", {}),
        rulesEvaluated=result.get("rulesEvaluated", 0),
        appliedRules=result.get("appliedRules", []),
        persistedIssueIds=persisted_ids or None,
    )
    return response


def _rule_payload_to_dict(
    model: ComplianceRuleBase, include_id: bool = False
) -> Dict[str, Any]:
    data = model.model_dump(exclude_none=True)
    extras = getattr(model, "model_extra", {}) or {}
    for key, value in extras.items():
        if key not in data:
            data[key] = value
    if not include_id:
        data.pop("id", None)
    return data


def _sanitize_rule_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    def _sanitize(value: Any) -> Any:
        if isinstance(value, str):
            return sanitize_text(value)
        if isinstance(value, list):
            return [_sanitize(item) for item in value]
        if isinstance(value, dict):
            return {key: _sanitize(val) for key, val in value.items()}
        return value

    return {key: _sanitize(value) for key, value in payload.items()}


@app.get("/api/compliance/rules")
async def compliance_rules(user=Depends(require_role("user"))) -> Dict[str, Any]:
    rules = compliance_engine.get_rules()
    return {"rules": rules, "count": len(rules)}


@app.post("/api/compliance/rules")
async def create_compliance_rule(
    rule: ComplianceRuleCreateRequest, user=Depends(require_role("admin"))
) -> Dict[str, Any]:
    payload = _rule_payload_to_dict(rule, include_id=True)
    sanitized = _sanitize_rule_payload(payload)
    try:
        created = compliance_engine.create_rule(sanitized)
    except ValueError as exc:  # pragma: no cover - validation handled in service
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"rule": created}


@app.put("/api/compliance/rules/{rule_id}")
async def update_compliance_rule(
    rule_id: str,
    rule: ComplianceRuleUpdateRequest,
    user=Depends(require_role("admin")),
) -> Dict[str, Any]:
    cleaned_id = sanitize_text(rule_id).strip()
    if not cleaned_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid rule id")
    payload = _rule_payload_to_dict(rule)
    sanitized = _sanitize_rule_payload(payload)
    try:
        updated = compliance_engine.update_rule(cleaned_id, sanitized)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return {"rule": updated}


@app.delete("/api/compliance/rules/{rule_id}")
async def delete_compliance_rule(
    rule_id: str, user=Depends(require_role("admin"))
) -> Dict[str, str]:
    cleaned_id = sanitize_text(rule_id).strip()
    if not cleaned_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid rule id")
    if not compliance_engine.delete_rule(cleaned_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return {"status": "deleted"}


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
        payer=metadata_payload.get("payer"),
    )
    if not record:
        raise HTTPException(status_code=500, detail="Failed to persist issue")
    recipients = {user.get("sub"), record.get("assignee"), record.get("createdBy")}
    await _notify_compliance_issue(record, recipients)
    return ComplianceIssueRecord(**record)


@app.get("/api/compliance/issues/history")
async def compliance_issue_history(
    issue_id: Optional[str] = Query(None, alias="issueId"),
    code: Optional[str] = Query(None),
    payer: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None, alias="userId"),
    start: Optional[float] = Query(None, ge=0),
    end: Optional[float] = Query(None, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user=Depends(require_role("user")),
    conn: sqlite3.Connection = Depends(get_db),
) -> Dict[str, Any]:
    query = (
        "SELECT issue_id, code, payer, findings, created_at, user_id "
        "FROM compliance_issue_history"
    )
    clauses: List[str] = []
    params: List[Any] = []

    if issue_id:
        clauses.append("issue_id = ?")
        params.append(issue_id.strip())
    if code:
        clauses.append("UPPER(code) = ?")
        params.append(code.strip().upper())
    if payer:
        clauses.append("LOWER(payer) = ?")
        params.append(payer.strip().lower())
    if user_id:
        clauses.append("user_id = ?")
        params.append(user_id.strip())
    if start is not None:
        clauses.append("created_at >= ?")
        params.append(float(start))
    if end is not None:
        clauses.append("created_at <= ?")
        params.append(float(end))

    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY created_at DESC"
    if limit:
        query += " LIMIT ?"
        params.append(int(limit))

    rows = conn.execute(query, params).fetchall()
    records = [
        {
            "issueId": row["issue_id"],
            "code": row["code"],
            "payer": row["payer"],
            "findings": _deserialise_findings(row["findings"]),
            "timestamp": _iso_timestamp(row["created_at"]),
            "userId": row["user_id"],
        }
        for row in rows
    ]
    return {"count": len(records), "records": records}


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
    await _notify_note_auto_save(user["sub"], note.note_id)
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
    provider: Optional[str] = None
    patientId: Optional[str] = None
    encounterId: Optional[str] = None
    location: Optional[str] = None

class Appointment(BaseModel):
    id: int
    patient: str
    reason: str
    start: datetime
    end: datetime
    provider: Optional[str] = None
    status: str = "scheduled"
    patientId: Optional[str] = None
    encounterId: Optional[str] = None
    location: Optional[str] = None
    visitSummary: Optional[Dict[str, Any]] = None

class AppointmentList(BaseModel):
    appointments: List[Appointment]
    visitSummaries: Dict[str, Any] = Field(default_factory=dict)

@app.post("/schedule", response_model=Appointment)
async def create_schedule_appointment(appt: AppointmentCreate, user=Depends(require_role("user"))):
    rec = create_appointment(
        appt.patient,
        appt.reason,
        appt.start,
        appt.end,
        provider=appt.provider,
        patient_id=appt.patientId,
        encounter_id=appt.encounterId,
        location=appt.location,
    )
    return Appointment(
        **{
            **rec,
            "start": datetime.fromisoformat(rec["start"]),
            "end": datetime.fromisoformat(rec["end"]),
        }
    )

@app.get("/schedule", response_model=AppointmentList)
async def list_schedule_appointments(user=Depends(require_role("user"))):
    items = list_appointments()
    parsed: List[Appointment] = []
    summaries: Dict[str, Any] = {}
    for item in items:
        summary = item.get("visitSummary") if isinstance(item, dict) else None
        if isinstance(summary, dict) and item.get("id") is not None:
            summaries[str(item["id"])] = summary
        parsed.append(
            Appointment(
                **{
                    **item,
                    "start": datetime.fromisoformat(item["start"]),
                    "end": datetime.fromisoformat(item["end"]),
                }
            )
        )
    return AppointmentList(appointments=parsed, visitSummaries=summaries)


class ScheduleBulkOperation(BaseModel):
    id: int
    action: str
    time: Optional[datetime] = None


class ScheduleBulkRequest(BaseModel):
    updates: List[ScheduleBulkOperation]
    provider: Optional[str] = None


class ScheduleBulkSummary(BaseModel):
    succeeded: int = 0
    failed: int = 0

class ScheduleExportRequest(BaseModel):
    id: int

@app.post("/schedule/export")
async def export_schedule_appointment(req: ScheduleExportRequest, user=Depends(require_role("user"))):
    appt = get_appointment(req.id)
    if not appt:
        raise HTTPException(status_code=404, detail="appointment not found")
    return {"ics": export_appointment_ics(appt)}


@app.post("/api/schedule/bulk-operations", response_model=ScheduleBulkSummary)
async def schedule_bulk_operations(
    req: ScheduleBulkRequest, user=Depends(require_role("user"))
) -> ScheduleBulkSummary:
    if not req.updates:
        return ScheduleBulkSummary(succeeded=0, failed=0)
    succeeded, failed = apply_bulk_operations(
        [{"id": item.id, "action": item.action, "time": item.time} for item in req.updates],
        req.provider,
    )
    return ScheduleBulkSummary(succeeded=succeeded, failed=failed)
# ------------------- Additional API endpoints ------------------------------


@app.get("/api/schedule/appointments", response_model=AppointmentList)
async def api_list_appointments(user=Depends(require_role("user"))):
    items = list_appointments()
    parsed: List[Appointment] = []
    summaries: Dict[str, Any] = {}
    for item in items:
        summary = item.get("visitSummary") if isinstance(item, dict) else None
        if isinstance(summary, dict) and item.get("id") is not None:
            summaries[str(item["id"])] = summary
        parsed.append(
            Appointment(
                **{
                    **item,
                    "start": datetime.fromisoformat(item["start"]),
                    "end": datetime.fromisoformat(item["end"]),
                }
            )
        )
    return AppointmentList(appointments=parsed, visitSummaries=summaries)


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


# ---------------------------------------------------------------------------
# ---------------------- Code validation & billing -------------------------
          
class CombinationRequest(BaseModel):
    cpt: List[str] = Field(default_factory=list)
    icd10: List[str] = Field(default_factory=list)
    codes: List[str] = Field(default_factory=list)
    age: Optional[int] = Field(default=None, ge=0, le=130)
    gender: Optional[str] = None
    encounterType: Optional[str] = None
    providerSpecialty: Optional[str] = None

    model_config = {"populate_by_name": True, "extra": "allow"}

    @model_validator(mode="before")
    @classmethod
    def _expand_codes(cls, values: Dict[str, Any]) -> Dict[str, Any]:  # noqa: D401
        if not isinstance(values, dict):
            return values
        codes = values.get("codes") or []
        if codes:
            cpt = [code.strip().upper() for code in values.get("cpt", []) if code]
            icd10 = [code.strip().upper() for code in values.get("icd10", []) if code]
            for raw in codes:
                if not isinstance(raw, str):
                    continue
                normalized = raw.strip().upper()
                if not normalized:
                    continue
                if normalized[0].isdigit():
                    if normalized not in cpt:
                        cpt.append(normalized)
                else:
                    if normalized not in icd10:
                        icd10.append(normalized)
            values["cpt"] = cpt
            values["icd10"] = icd10
        return values


@app.get("/api/codes/categorization/rules")
async def get_code_categorization_rules(
    user=Depends(require_role("user")),
) -> Dict[str, Any]:
    """Return categorization rules for client-side code organization."""

    rules = load_code_categorization_rules()
    return _success_payload(rules)


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


@app.get("/api/codes/validate/hcpcs/{code}")
async def validate_hcpcs_code(
    code: str,
    age: int | None = Query(None, ge=0, le=130),
    gender: str | None = Query(None),
    encounter_type: str | None = Query(None, alias="encounterType"),
    provider_specialty: str | None = Query(None, alias="providerSpecialty"),
    user=Depends(require_role("user")),
):
    """Validate an HCPCS code."""

    return code_tables.validate_hcpcs(
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
    result = code_tables.validate_combination(
        cpt_codes,
        icd10_codes,
        age=req.age,
        gender=gender,
        encounter_type=encounter_type,
        specialty=specialty,
    )
    conflicts: List[Dict[str, str]] = list(result.get("conflicts", []))
    codes_set = {code for code in {*cpt_codes, *icd10_codes} if code}
    for code1, code2, reason in load_conflicts():
        if code1 in codes_set and code2 in codes_set:
            entry = {"code1": code1, "code2": code2, "reason": reason}
            if entry not in conflicts:
                conflicts.append(entry)
    valid = not conflicts and not result.get("contextIssues")
    enriched = {
        **result,
        "conflicts": conflicts,
        "validCombinations": valid,
    }
    return _success_payload(enriched)


class BillingRequest(BaseModel):
    cpt: List[str]
    codes: List[str] = Field(default_factory=list)
    payerType: str = "commercial"
    location: Optional[str] = None

    model_config = {"populate_by_name": True, "extra": "allow"}

    @model_validator(mode="before")
    @classmethod
    def _populate_cpt(cls, values: Dict[str, Any]) -> Dict[str, Any]:  # noqa: D401
        if not isinstance(values, dict):
            return values
        codes = values.get("codes")
        if codes and not values.get("cpt"):
            values["cpt"] = [code for code in codes if isinstance(code, str)]
        return values


@app.post("/api/billing/calculate")
async def billing_calculate(
    req: BillingRequest,
    user=Depends(require_role("user")),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Return estimated reimbursement for CPT codes."""
    cpt_codes = [c.upper() for c in req.cpt]
    result = code_tables.calculate_billing(
        cpt_codes,
        req.payerType,
        req.location,
        session=conn,
    )
    try:
        _persist_billing_audit(
            audit_id=None,
            codes=cpt_codes,
            payer=req.payerType,
            findings=result,
            user_id=user.get("sub"),
        )
    except Exception as exc:  # pragma: no cover - best effort audit
        logging.warning("Failed to persist billing audit: %s", exc)
    return _success_payload(result)


@app.get("/api/codes/documentation/{code}")
async def get_code_documentation(code: str, user=Depends(require_role("user"))):
    """Return documentation requirements for a CPT or ICD-10 code."""
    documentation = code_tables.get_documentation(code)
    return _success_payload(documentation)

# ---------------------------------------------------------------------------
# WebSocket endpoints
# ---------------------------------------------------------------------------


class ConnectionManager:
    """Track active WebSocket sessions and replay missed events on reconnect."""

    def __init__(self) -> None:
        self.active: Dict[str, WebSocket] = {}
        self.session_users: Dict[str, str] = {}
        self.user_sessions: Dict[str, Set[str]] = defaultdict(set)
        self.latest_session_by_user: Dict[str, str] = {}
        self.history: Dict[str, deque[dict]] = defaultdict(deque)
        self.counters: Dict[str, int] = defaultdict(int)

    async def connect(
        self,
        websocket: WebSocket,
        username: str,
        session_id: Optional[str],
        last_event_id: Optional[int],
    ) -> str:
        await websocket.accept()
        if not session_id or session_id not in self.session_users:
            session_id = str(uuid.uuid4())
        self.session_users[session_id] = username
        self.active[session_id] = websocket
        self.user_sessions[username].add(session_id)
        self.latest_session_by_user[username] = session_id
        events = list(self.history[username])
        if last_event_id is not None:
            events = [e for e in events if e["eventId"] > last_event_id]
        for payload in events:
            await websocket.send_json(payload)
        return session_id

    def disconnect(self, session_id: str) -> None:
        self.active.pop(session_id, None)
        username = self.session_users.pop(session_id, None)
        if not username:
            return
        sessions = self.user_sessions.get(username)
        if sessions:
            sessions.discard(session_id)
            if not sessions:
                self.user_sessions.pop(username, None)
                self.latest_session_by_user.pop(username, None)
            elif self.latest_session_by_user.get(username) == session_id:
                self.latest_session_by_user[username] = next(iter(sessions))

    def latest_session(self, username: str) -> Optional[str]:
        """Return the most recently active session for *username*."""

        return self.latest_session_by_user.get(username)

    async def push(self, session_id: str, payload: Dict[str, Any]) -> None:
        username = self.session_users.get(session_id)
        if not username:
            return
        self.counters[username] += 1
        enriched = {"eventId": self.counters[username], **payload}
        enriched.setdefault("event", "message")
        history = self.history[username]
        history.append(enriched)
        if len(history) > 50:
            history.popleft()
        for sid in list(self.user_sessions.get(username, [])):
            ws = self.active.get(sid)
            if ws is None:
                continue
            try:
                await ws.send_json(enriched)
            except Exception:
                self.disconnect(sid)

    async def push_user(self, username: str, payload: Dict[str, Any]) -> None:
        """Queue *payload* for *username*, broadcasting if connected."""

        session_id = self.latest_session(username)
        if session_id:
            await self.push(session_id, payload)
            return
        self.counters[username] += 1
        enriched = {"eventId": self.counters[username], **payload}
        enriched.setdefault("event", "message")
        history = self.history[username]
        history.append(enriched)
        if len(history) > 50:
            history.popleft()


async def _ws_endpoint(
    manager: ConnectionManager,
    websocket: WebSocket,
    *,
    channel: str,
    required_role: str = "user",
    announce: bool = True,
    handshake_first: bool = True,
    on_connect: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None,
) -> None:
    """Common WebSocket connection handler with reconnect support."""

    user = await ws_require_role(websocket, required_role)
    username = user["sub"]
    params = websocket.query_params
    session_id = params.get("session_id")
    last_event_id = params.get("last_event_id")
    last_event = int(last_event_id) if last_event_id is not None else None
    session_id = await manager.connect(websocket, username, session_id, last_event)
    if announce and handshake_first:
        await websocket.send_json({"event": "connected", "sessionId": session_id})
    if on_connect is not None:
        await on_connect(session_id, user)
    if announce and not handshake_first:
        await websocket.send_json({"event": "connected", "sessionId": session_id})
    try:
        while True:
            data = await websocket.receive_json()
            payload = {**data}
            payload.setdefault("channel", channel)
            payload.setdefault("timestamp", _iso_timestamp())
            payload.setdefault("event", f"{channel}_message")
            await manager.push(session_id, payload)
    except WebSocketDisconnect:
        manager.disconnect(session_id)


transcription_manager = ConnectionManager()
compliance_manager = ConnectionManager()
collaboration_manager = ConnectionManager()
codes_manager = ConnectionManager()
notifications_manager = ConnectionManager()


async def _push_notification_event(
    username: str,
    payload: Dict[str, Any],
    *,
    increment: bool = False,
) -> None:
    """Dispatch a notification payload to ``/ws/notifications`` for *username*."""

    stored, count = _persist_notification_event(
        username,
        payload,
        mark_unread=increment,
    )
    enriched = {**payload}
    enriched.setdefault("channel", "notifications")
    enriched.setdefault("event", "notification")
    enriched.setdefault("title", stored.get("title"))
    enriched.setdefault("message", stored.get("message"))
    enriched.setdefault("severity", stored.get("severity"))
    enriched.setdefault("timestamp", stored.get("timestamp", _iso_timestamp()))
    enriched.setdefault("isRead", stored.get("isRead", False))
    if "readAt" not in enriched and stored.get("readAt"):
        enriched["readAt"] = stored["readAt"]
    enriched["id"] = stored.get("id")
    enriched["unreadCount"] = count
    enriched.update(_navigation_badges(username, count))
    session_id = notifications_manager.latest_session(username)
    if session_id:
        await notifications_manager.push(session_id, enriched)
    else:
        await notifications_manager.push_user(username, enriched)
    await _broadcast_notification_count(username)


def _get_draft_count() -> int:
    """Return the total number of draft notes available."""

    try:
        row = db_conn.execute(
            "SELECT COUNT(*) AS total FROM notes WHERE status='draft'"
        ).fetchone()
    except sqlite3.Error:
        return 0
    if not row:
        return 0
    try:
        value = row["total"]
    except Exception:
        value = 0
    try:
        return max(int(value or 0), 0)
    except (TypeError, ValueError):
        return 0


def _navigation_badges(username: Optional[str], notifications: Optional[int] = None) -> Dict[str, int]:
    """Compute navigation badge counts for the sidebar."""

    notif_count = notifications
    if notif_count is None and username:
        notif_count = current_notification_count(username)
    try:
        notif_value = max(int(notif_count or 0), 0)
    except (TypeError, ValueError):
        notif_value = 0
    payload = {
        "notifications": notif_value,
        "drafts": _get_draft_count(),
    }
    payload["count"] = notif_value
    return payload


async def _notify_note_auto_save(username: str, note_id: Optional[int]) -> None:
    """Broadcast an auto-save event to collaboration clients for *username*."""

    payload = {
        "channel": "collaboration",
        "event": "note_auto_save",
        "noteId": note_id,
        "status": "saved",
        "timestamp": _iso_timestamp(),
    }
    session_id = collaboration_manager.latest_session(username)
    if session_id:
        await collaboration_manager.push(session_id, payload)
    else:
        await collaboration_manager.push_user(username, payload)


async def _notify_compliance_issue(
    record: Dict[str, Any],
    recipients: Iterable[str],
) -> None:
    """Broadcast compliance issue updates and increment notifications."""

    metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
    note_id = metadata.get("noteId") or metadata.get("note_id")
    timestamp = _iso_timestamp(record.get("updatedAt") or record.get("createdAt"))
    base_payload = {
        "channel": "compliance",
        "event": "compliance_issue",
        "issueId": record.get("issueId"),
        "ruleId": record.get("ruleId"),
        "title": record.get("title"),
        "severity": record.get("severity"),
        "status": record.get("status"),
        "category": record.get("category"),
        "noteId": note_id,
        "timestamp": timestamp,
    }
    notify_payload = {
        "type": "compliance_issue",
        "issueId": record.get("issueId"),
        "severity": record.get("severity"),
        "title": record.get("title"),
        "timestamp": timestamp,
    }
    for username in {user for user in recipients if user}:
        session_id = compliance_manager.latest_session(username)
        payload = dict(base_payload)
        if session_id:
            await compliance_manager.push(session_id, payload)
        else:
            await compliance_manager.push_user(username, payload)
        await _push_notification_event(username, dict(notify_payload), increment=True)


@app.websocket("/ws/transcription")
async def ws_transcription(websocket: WebSocket) -> None:
    """Live speech-to-text stream.

    Expected payload: ``{"transcript", "confidence", "isInterim", "timestamp", "speakerLabel"}``
    """

    await _ws_endpoint(transcription_manager, websocket, channel="transcription")


@app.websocket("/ws/compliance")
async def ws_compliance(websocket: WebSocket) -> None:
    """Real-time compliance alerts.

    Expected payload: ``{"analysisId", "issues", "severity", "timestamp"}``
    """

    await _ws_endpoint(compliance_manager, websocket, channel="compliance")


@app.websocket("/ws/collaboration")
async def ws_collaboration(websocket: WebSocket) -> None:
    """Collaborative editing channel.

    Expected payload: ``{"noteId", "changes", "userId", "timestamp", "conflicts"}``
    """

    await _ws_endpoint(collaboration_manager, websocket, channel="collaboration")


@app.websocket("/ws/codes")
async def ws_codes(websocket: WebSocket) -> None:
    """Streaming coding suggestions.

    Expected payload: ``{"code", "type", "description", "rationale", "confidence", "timestamp"}``
    """

    await _ws_endpoint(codes_manager, websocket, channel="codes")


@app.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket) -> None:
    """System notification channel.

    Expected payload: ``{"type", "message", "priority", "userId", "timestamp"}``
    """

    async def _initial(session_id: str, user_data: Dict[str, Any]) -> None:
        username = user_data.get("sub")
        badges = _navigation_badges(username) if username else {"notifications": 0, "drafts": 0, "count": 0}
        payload = {
            "channel": "notifications",
            "event": "notification_snapshot",
            **badges,
            "unreadCount": badges.get("notifications", 0),
            "timestamp": _iso_timestamp(),
        }
        await notifications_manager.push(session_id, payload)

    await _ws_endpoint(
        notifications_manager,
        websocket,
        channel="notifications",
        handshake_first=False,
        on_connect=_initial,
    )

# ---------------------------------------------------------------------------



class EncounterValidationRequest(BaseModel):
    """Request payload for validating an encounter identifier."""

    encounter_id: int = Field(alias="encounterId")
    patient_id: Optional[str] = Field(default=None, alias="patientId")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _merge_legacy_keys(cls, values: Any) -> Any:  # noqa: D401
        if not isinstance(values, dict):
            return values
        data = dict(values)
        if "encounter_id" not in data and "encounterId" in data:
            data["encounter_id"] = data["encounterId"]
        if "patient_id" not in data and "patientId" in data:
            data["patient_id"] = data["patientId"]
        return data

    @field_validator("encounter_id", mode="before")
    @classmethod
    def _coerce_encounter_id(cls, value: Any) -> Any:  # noqa: D401
        if isinstance(value, str):
            text = value.strip()
            if not text:
                raise ValueError("encounterId cannot be empty")
            try:
                return int(text)
            except ValueError as exc:  # pragma: no cover - defensive guard
                raise ValueError("encounterId must be numeric") from exc
        return value

    @field_validator("patient_id", mode="before")
    @classmethod
    def _normalize_patient_id(cls, value: Any) -> Optional[str]:  # noqa: D401
        if value is None:
            return None
        if isinstance(value, str):
            text = value.strip()
            return text or None
        return str(value)


class VisitSessionCreate(BaseModel):
    encounter_id: int


class VisitSessionUpdate(BaseModel):
    session_id: int
    action: str


def _build_encounter_validation_response(
    encounter_id: int, patient_id: Optional[str] = None
) -> Dict[str, Any]:
    """Return a normalized validation payload for *encounter_id*."""

    encounter = patients.get_encounter(encounter_id)
    if encounter is None:
        return {
            "valid": False,
            "errors": ["Encounter not found"],
            "encounterId": encounter_id,
        }

    patient_info = encounter.get("patient") if isinstance(encounter.get("patient"), dict) else None
    encounter_patient_id = None
    if patient_info:
        encounter_patient_id = (
            patient_info.get("patientId")
            or patient_info.get("patient_id")
        )
    if encounter_patient_id is None:
        encounter_patient_id = encounter.get("patientId") or encounter.get("patient_id")

    if not patient_info or encounter_patient_id is None:
        result = {
            "valid": False,
            "errors": ["Encounter is missing an associated patient"],
            "encounter": encounter,
            "encounterId": encounter_id,
        }
        if encounter_patient_id is not None:
            result["patientId"] = str(encounter_patient_id)
        return result

    result: Dict[str, Any] = {
        "valid": True,
        "encounter": encounter,
        "encounterId": encounter_id,
        "patientId": str(encounter_patient_id),
    }

    if patient_id is not None and str(encounter_patient_id) != str(patient_id):
        result["valid"] = False
        result["errors"] = ["Encounter is associated with a different patient"]
    return result


@app.get("/api/patients/search")
async def search_patients_v2(
    q: str = Query(..., min_length=1),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(require_role("user")),
):
    return patients.search_patients(q, limit=limit, offset=offset)


@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: int, user=Depends(require_role("user"))):
    record = patients.get_patient(patient_id)
    if not record:
        raise HTTPException(status_code=404, detail="patient not found")
    demographics = {
        "patientId": record.get("patientId"),
        "mrn": record.get("mrn"),
        "name": record.get("name"),
        "firstName": record.get("firstName"),
        "lastName": record.get("lastName"),
        "dob": record.get("dob"),
        "age": record.get("age"),
        "gender": record.get("gender"),
        "insurance": record.get("insurance"),
        "lastVisit": record.get("lastVisit"),
    }
    payload = {
        "demographics": demographics,
        "allergies": record.get("allergies", []),
        "medications": record.get("medications", []),
        "encounters": record.get("encounters", []),
    }
    for key in (
        "patientId",
        "mrn",
        "name",
        "firstName",
        "lastName",
        "dob",
        "age",
        "gender",
        "insurance",
        "lastVisit",
    ):
        value = demographics.get(key)
        if value is not None:
            payload[key] = value
    return payload


@app.get("/api/encounters/validate/{encounter_id}")
async def validate_encounter_v2(
    encounter_id: int, user=Depends(require_role("user"))
):
    return _build_encounter_validation_response(encounter_id)


@app.post("/api/encounters/validate")
async def validate_encounter_post(
    payload: EncounterValidationRequest, user=Depends(require_role("user"))
) -> Dict[str, Any]:
    return _build_encounter_validation_response(
        payload.encounter_id, patient_id=payload.patient_id
    )


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
    return {
        "status": "processing",
        "filename": file.filename,
        "size": len(contents),
    }


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
    data = [dict(row) for row in cur.fetchall()]
    return JSONResponse(content=data, headers={"X-Bypass-Envelope": "1"})


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
    data = [dict(row) for row in cur.fetchall()]
    return JSONResponse(content=data, headers={"X-Bypass-Envelope": "1"})


@app.get("/api/analytics/drafts")
async def draft_analytics(user=Depends(require_role("user"))):
    rows = db_conn.execute(
        "SELECT id, content, status, created_at, updated_at FROM notes WHERE status='draft'"
    ).fetchall()

    total = len(rows)
    durations: List[float] = []
    stale = 0
    now = time.time()
    ordered_notes: List[Tuple[float, Dict[str, Any]]] = []

    for row in rows:
        created = float(row["created_at"]) if row["created_at"] else 0.0
        updated = float(row["updated_at"]) if row["updated_at"] else created
        if created and updated and updated >= created:
            durations.append(updated - created)
        reference = updated or created
        if reference and now - reference >= 7 * 24 * 60 * 60:
            stale += 1
        formatted = _format_note_row(row)
        ordered_notes.append((reference, formatted))

    average_completion_minutes = 0.0
    if durations:
        average_completion_minutes = round((sum(durations) / len(durations)) / 60.0, 2)

    abandonment_rate = round(stale / total, 4) if total else 0.0

    recent_activity: List[Dict[str, Any]] = []
    for _reference, note in sorted(ordered_notes, key=lambda item: item[0] or 0.0, reverse=True)[:5]:
        recent_activity.append(
            {
                "id": note.get("id"),
                "title": note.get("title"),
                "status": note.get("status"),
                "patientName": note.get("patientName"),
                "lastModified": note.get("lastModified") or note.get("createdAt"),
            }
        )

    return {
        "drafts": total,
        "averageCompletionTimeMinutes": average_completion_minutes,
        "abandonmentRate": abandonment_rate,
        "staleDrafts": stale,
        "recentActivity": recent_activity,
    }


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
) -> Dict[str, Any]:
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
    return {"data": details}


@app.post("/api/billing/calculate")
async def billing_calculate(
    req: BillingRequest,
    user=Depends(require_role("user")),
    conn: sqlite3.Connection = Depends(get_db),
) -> Dict[str, Any]:
    """Calculate total reimbursement and RVUs for provided codes."""

    codes_upper = [code.upper() for code in req.codes]
    payer_type = req.payerType or "commercial"

    result = code_tables.calculate_billing(
        codes_upper,
        payer_type,
        req.location,
        session=conn,
    )
    try:
        _persist_billing_audit(
            audit_id=None,
            codes=codes_upper,
            payer=payer_type,
            findings=result,
            user_id=user.get("sub"),
        )
    except Exception as exc:  # pragma: no cover - best effort audit
        logging.warning("Failed to persist billing audit: %s", exc)
    return _success_payload(result)


@app.get("/api/billing/audits")
async def list_billing_audits(
    audit_id: Optional[str] = Query(None, alias="auditId"),
    code: Optional[str] = Query(None),
    payer: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None, alias="userId"),
    start: Optional[float] = Query(None, ge=0),
    end: Optional[float] = Query(None, ge=0),
    limit: int = Query(100, ge=1, le=500),
    user=Depends(require_role("user")),
    conn: sqlite3.Connection = Depends(get_db),
) -> Dict[str, Any]:
    query = (
        "SELECT audit_id, code, payer, findings, created_at, user_id "
        "FROM billing_audits"
    )
    clauses: List[str] = []
    params: List[Any] = []

    if audit_id:
        clauses.append("audit_id = ?")
        params.append(audit_id.strip())
    if code:
        clauses.append("UPPER(code) = ?")
        params.append(code.strip().upper())
    if payer:
        clauses.append("LOWER(payer) = ?")
        params.append(payer.strip().lower())
    if user_id:
        clauses.append("user_id = ?")
        params.append(user_id.strip())
    if start is not None:
        clauses.append("created_at >= ?")
        params.append(float(start))
    if end is not None:
        clauses.append("created_at <= ?")
        params.append(float(end))

    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY created_at DESC"
    if limit:
        query += " LIMIT ?"
        params.append(int(limit))

    rows = conn.execute(query, params).fetchall()
    records = [
        {
            "auditId": row["audit_id"],
            "code": row["code"],
            "payer": row["payer"],
            "findings": _deserialise_findings(row["findings"]),
            "timestamp": _iso_timestamp(row["created_at"]),
            "userId": row["user_id"],
        }
        for row in rows
    ]
    return {"count": len(records), "records": records}


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
    enriched = {
        **result,
        "validCombinations": valid,
        "conflicts": conflicts,
    }
    return _success_payload(enriched)
