"""
Backend API for the RevenuePilot application.

This FastAPI application provides endpoints to beautify clinical notes,
generate coding/compliance suggestions and produce patient‑friendly
summaries. It performs basic de‑identification on incoming text before
sending it to an AI model via ``call_openai``. If the model call fails,
each endpoint returns a sensible fallback.
"""

import logging
import os
import re
import shutil
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, confloat
from pydantic import BaseModel, Field


import jwt

# Import prompt builders and OpenAI helper for LLM integration.
# These imports are commented out above to avoid import errors when the
# dependencies are missing.  They are now enabled to allow the API to
# generate results using a real language model.  Ensure `openai` is
# installed and `OPENAI_API_KEY` is set in your environment before
# deploying.
from .prompts import build_beautify_prompt, build_suggest_prompt, build_summary_prompt
from . import prompts as prompt_utils
from .openai_client import call_openai
from .key_manager import get_api_key, save_api_key, APP_NAME
from platformdirs import user_data_dir
from .audio_processing import simple_transcribe, diarize_and_transcribe
from . import public_health as public_health_api
from .migrations import ensure_settings_table, ensure_templates_table
from .scheduling import recommend_follow_up



import json
import sqlite3
import hashlib

# When ``USE_OFFLINE_MODEL`` is set, endpoints will return deterministic
# placeholder responses without calling external AI services.  This is useful
# for running the API in environments without network access.
USE_OFFLINE_MODEL = os.getenv("USE_OFFLINE_MODEL", "false").lower() in {"1", "true", "yes"}

try:
    import scrubadub
    _SCRUBBER_AVAILABLE = True
except Exception:  # pragma: no cover - library is optional
    scrubadub = None  # type: ignore
    _SCRUBBER_AVAILABLE = False

try:
    from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
    from presidio_anonymizer import AnonymizerEngine
    from presidio_anonymizer.entities import OperatorConfig
    from presidio_analyzer.nlp_engine import NlpEngineProvider

    _provider = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
        }
    )
    _nlp_engine = _provider.create_engine()
    _analyzer = AnalyzerEngine(nlp_engine=_nlp_engine, supported_languages=["en"])

    _address_pattern = Pattern(
        "address",
        r"\b\d+\s+(?:[A-Za-z]+\s?)+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b",
        0.5,
    )
    _address_recognizer = PatternRecognizer(
        supported_entity="ADDRESS", patterns=[_address_pattern]
    )
    _analyzer.registry.add_recognizer(_address_recognizer)

    _ssn_pattern = Pattern("ssn", r"\b\d{3}-\d{2}-\d{4}\b", 0.5)
    _ssn_recognizer = PatternRecognizer(
        supported_entity="US_SSN", patterns=[_ssn_pattern]
    )
    _analyzer.registry.add_recognizer(_ssn_recognizer)

    _health_id_pattern = Pattern(
        "health_id", r"\b(?:HIC|HID|INS)[- ]?\d{6,12}\b", 0.5
    )
    _health_id_recognizer = PatternRecognizer(
        supported_entity="HEALTH_INSURANCE_ID", patterns=[_health_id_pattern]
    )
    _analyzer.registry.add_recognizer(_health_id_recognizer)

    _vehicle_pattern = Pattern(
        "vehicle", r"\b[A-Z]{2,3}[- ]?\d{3,4}\b", 0.5
    )
    _vehicle_recognizer = PatternRecognizer(
        supported_entity="VEHICLE_ID", patterns=[_vehicle_pattern]
    )
    _analyzer.registry.add_recognizer(_vehicle_recognizer)

    _dob_pattern = Pattern(
        "dob", r"\bDOB[:\s-]*\d{1,2}/\d{1,2}/\d{2,4}\b", 0.5
    )
    _dob_recognizer = PatternRecognizer(supported_entity="DOB", patterns=[_dob_pattern])
    _analyzer.registry.add_recognizer(_dob_recognizer)

    _anonymizer = AnonymizerEngine()
    _PRESIDIO_AVAILABLE = True
except Exception:  # pragma: no cover - optional dependency
    _PRESIDIO_AVAILABLE = False
    _analyzer = None  # type: ignore
    _anonymizer = None  # type: ignore

try:  # pragma: no cover - optional dependency
    from philter.philter import Philter as _Philter

    _philter = _Philter()
    _PHILTER_AVAILABLE = True
except Exception:
    _PHILTER_AVAILABLE = False
    _philter = None  # type: ignore

# Select the PHI scrubbing backend. ``presidio`` and ``philter`` are supported
# when installed.  ``auto`` (default) prefers Presidio and falls back to
# Philter, then simple regex replacements if neither is available.
_DEID_ENGINE = os.getenv("DEID_ENGINE", "auto").lower()

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI(title="RevenuePilot API")

# Enable CORS so that the React frontend can communicate with this API.
# Allowed origins are configurable via the ``ALLOWED_ORIGINS`` environment
# variable (comma separated). Defaults to localhost for development.
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
origins = [o.strip() for o in allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for analytics events.  Each event is a dictionary with
# keys: eventType (str), details (dict) and timestamp (float).  This is
# reset when the server restarts.  For production use, persist events
# to a database.
events: List[Dict[str, Any]] = []

# Last audio transcript returned by the ``/transcribe`` endpoint.  This is a
# simple in-memory store so the frontend can fetch or re-use the most recent
# transcript without re-uploading the audio.  It is reset on server restart.
last_transcript: Dict[str, str] = {"provider": "", "patient": ""}

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
# Expanded events table storing structured analytics fields.  Older
# installations may lack these columns; ``ALTER TABLE`` statements add them
# defensively so the application can upgrade the schema in place.
db_conn.execute(
    "CREATE TABLE IF NOT EXISTS events ("
    "id INTEGER PRIMARY KEY AUTOINCREMENT,"
    "eventType TEXT NOT NULL,"
    "timestamp REAL NOT NULL,"
    "details TEXT,"
    "revenue REAL,"
    "codes TEXT,"
    "compliance_flags TEXT,"
    "public_health INTEGER,"
    "satisfaction INTEGER"
    ")"
)
for col, typ in [
    ("revenue", "REAL"),
    ("codes", "TEXT"),
    ("compliance_flags", "TEXT"),
    ("public_health", "INTEGER"),
    ("satisfaction", "INTEGER"),
]:
    try:
        db_conn.execute(f"ALTER TABLE events ADD COLUMN {col} {typ}")
    except sqlite3.OperationalError:
        pass
db_conn.commit()


# Table for user accounts used in role-based authentication.
db_conn.execute(
    "CREATE TABLE IF NOT EXISTS users ("
    "id INTEGER PRIMARY KEY AUTOINCREMENT,"
    "username TEXT UNIQUE NOT NULL,"
    "password_hash TEXT NOT NULL,"
    "role TEXT NOT NULL"
    ")"
)
db_conn.commit()


# Persisted user preferences for theme, enabled categories and custom rules.
# Ensure the table exists and contains the latest schema (including ``lang``).
ensure_settings_table(db_conn)

# Table storing user and clinic specific note templates.
ensure_templates_table(db_conn)

# Configure the database connection to return rows as dictionaries.  This
# makes it easier to access columns by name when querying events for
# metrics computations.
db_conn.row_factory = sqlite3.Row

# Preload any stored API key into the environment so subsequent calls work.
get_api_key()

# Attempt to use rich PHI scrubbers by default.  When Presidio or Philter is
# installed they will be used automatically.  No environment variable is
# required to enable them, keeping the behaviour simple out of the box.  Tests
# may monkeypatch ``_PRESIDIO_AVAILABLE`` or ``_PHILTER_AVAILABLE`` to force the
# fallback implementation when these optional dependencies are missing.

# ---------------------------------------------------------------------------
# JWT authentication helpers
# ---------------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_ALGORITHM = "HS256"
security = HTTPBearer()


def create_token(username: str, role: str, clinic: str | None = None) -> str:
    """Create a signed JWT for the given user and role.

    Optionally include a clinic identifier so templates can be scoped per clinic."""
    payload = {
        "sub": username,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=12),
    }
    if clinic is not None:
        payload["clinic"] = clinic
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


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

    def checker(credentials: HTTPAuthorizationCredentials = Depends(security)):
        return get_current_user(credentials, required_role=role)

    return checker

# Model for setting API key via API endpoint
class ApiKeyModel(BaseModel):
    key: str


class RegisterModel(BaseModel):
    username: str
    password: str
    role: str


class LoginModel(BaseModel):
    username: str
    password: str


class ResetPasswordModel(BaseModel):
    """Schema used when a user wishes to reset their password."""
    username: str
    password: str
    new_password: str


class UserSettings(BaseModel):
    theme: str = "modern"
    categories: Dict[str, bool] = {
        "codes": True,
        "compliance": True,
        "publicHealth": True,
        "differentials": True,
    }
    rules: List[str] = []
    lang: str = "en"
    specialty: Optional[str] = None
    payer: Optional[str] = None
    region: str = ""



def hash_password(password: str) -> str:
    """Return a SHA-256 hash of the provided password."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


@app.post("/register")
async def register(model: RegisterModel, user=Depends(require_role("admin"))):
    """Create a new user. Only admins may register users."""
    pwd_hash = hash_password(model.password)
    try:
        db_conn.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (model.username, pwd_hash, model.role),
        )
        db_conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already exists")
    return {"status": "registered"}


@app.post("/login")
async def login(model: LoginModel) -> Dict[str, str]:
    """Validate credentials and return a JWT on success."""
    row = db_conn.execute(
        "SELECT password_hash, role FROM users WHERE username=?",
        (model.username,),
    ).fetchone()
    if not row or hash_password(model.password) != row["password_hash"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    token = create_token(model.username, row["role"])
    return {"access_token": token}


@app.post("/reset-password")
async def reset_password(model: ResetPasswordModel) -> Dict[str, str]:
    """Allow a user to change their password by providing the current one."""
    row = db_conn.execute(
        "SELECT password_hash FROM users WHERE username=?",
        (model.username,),
    ).fetchone()
    if not row or hash_password(model.password) != row["password_hash"]:
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


@app.get("/settings")
async def get_user_settings(user=Depends(require_role("user"))) -> Dict[str, Any]:
    """Return the current user's saved settings or defaults if none exist."""
    row = db_conn.execute(
        "SELECT s.theme, s.categories, s.rules, s.lang, s.specialty, s.payer, s.region "
        "FROM settings s JOIN users u ON s.user_id = u.id WHERE u.username=?",
        (user["sub"],),
    ).fetchone()

    if row:
        return {
            "theme": row["theme"],
            "categories": json.loads(row["categories"]),
            "rules": json.loads(row["rules"]),
            "lang": row["lang"],
            "specialty": row["specialty"],
            "payer": row["payer"],
            "region": row["region"] or "",
        }
    return UserSettings().dict()


@app.post("/settings")
async def save_user_settings(model: UserSettings, user=Depends(require_role("user"))) -> Dict[str, Any]:
    """Persist settings for the authenticated user."""
    row = db_conn.execute(
        "SELECT id FROM users WHERE username=?",
        (user["sub"],),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="User not found")
    db_conn.execute(
        "INSERT OR REPLACE INTO settings (user_id, theme, categories, rules, lang, specialty, payer, region) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            row["id"],
            model.theme,
            json.dumps(model.categories),
            json.dumps(model.rules),
            model.lang,
            model.specialty,
            model.payer,
            model.region,
        ),
    )

    db_conn.commit()
    return model.dict()




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
    age: Optional[int] = None
    sex: Optional[str] = None
    region: Optional[str] = None



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


class DifferentialSuggestion(BaseModel):
    """Potential differential diagnosis with likelihood score."""
    diagnosis: str
    score: Optional[confloat(ge=0, le=1)] = None


class SuggestionsResponse(BaseModel):
    """Schema for the suggestions returned to the frontend."""
    codes: List[CodeSuggestion]
    compliance: List[str]
    publicHealth: List[PublicHealthSuggestion]
    differentials: List[DifferentialSuggestion]
    followUp: Optional[str] = None


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


class TemplateModel(BaseModel):
    """Template structure for note creation snippets."""

    id: Optional[int] = None
    name: str
    content: str


def deidentify(text: str) -> str:
    """Redact common protected health information from ``text``.

    The helper uses ``scrubadub`` when available and augments it with
    explicit regular expressions so that the most frequent identifiers are
    consistently replaced with bracketed placeholders.

    Args:
        text: Raw note text potentially containing PHI.
    Returns:
        The cleaned text with sensitive spans replaced by tokens such as
        ``[NAME]`` or ``[PHONE]``.
    """
    engine = _DEID_ENGINE
    backends: List[str] = []
    if engine == "presidio":
        backends.append("presidio")
    elif engine == "philter":
        backends.append("philter")
    else:  # auto
        backends.extend(["presidio", "philter"])

    for backend_name in backends:
        if backend_name == "presidio" and _PRESIDIO_AVAILABLE:
            try:
                entities = [
                    "PERSON",
                    "PHONE_NUMBER",
                    "EMAIL_ADDRESS",
                    "US_SSN",
                    "DATE_TIME",
                    "ADDRESS",
                    "HEALTH_INSURANCE_ID",
                    "VEHICLE_ID",
                    "DOB",
                ]
                results = _analyzer.analyze(text=text, language="en", entities=entities)
                token_map = {
                    "PERSON": "NAME",
                    "PHONE_NUMBER": "PHONE",
                    "EMAIL_ADDRESS": "EMAIL",
                    "US_SSN": "SSN",
                    "DATE_TIME": "DATE",
                    "ADDRESS": "ADDRESS",
                    "HEALTH_INSURANCE_ID": "HEALTH_ID",
                    "VEHICLE_ID": "VEHICLE",
                    "DOB": "DOB",
                }
                operators = {
                    r.entity_type: OperatorConfig(
                        "replace",
                        {"new_value": f"[{token_map.get(r.entity_type, r.entity_type)}]"},
                    )
                    for r in results
                }
                text = _anonymizer.anonymize(
                    text=text, analyzer_results=results, operators=operators
                ).text
                return text
            except Exception as exc:  # pragma: no cover - best effort
                logging.warning("Advanced scrubber failed: %s", exc)
        elif backend_name == "philter" and _PHILTER_AVAILABLE:
            try:
                # Philter replaces detected PHI with the literal "**PHI**".
                if hasattr(_philter, "philter"):
                    text = _philter.philter(text)
                elif hasattr(_philter, "filter"):
                    text = _philter.filter(text)
                text = text.replace("**PHI**", "[PHI]")
                return text
            except Exception as exc:  # pragma: no cover - best effort
                logging.warning("Philter failed: %s", exc)
        else:
            # Requested backend not available; move to next.
            continue

    if _SCRUBBER_AVAILABLE:
        try:
            text = scrubadub.clean(text, replace_with="placeholder")
            text = re.sub(
                r"\{\{([A-Z_]+?)(?:-\d+)?\}\}",
                lambda m: f"[{m.group(1)}]",
                text,
            )
            text = text.replace("[SOCIAL_SECURITY_NUMBER]", "[SSN]")
        except Exception as exc:  # pragma: no cover - best effort
            logging.warning("scrubadub failed: %s", exc)

    month = (
        "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
        "Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    )

    phone_pattern = re.compile(
        r"(?:(?<!\d)(?:\(\d{3}\)\s*|\d{3}[-\.\s]?)\d{3}[-\.\s]?\d{4}\b"
        r"|\+\d{1,3}[-\.\s]?\d{1,4}[-\.\s]?\d{3,4}[-\.\s]?\d{3,4}\b)",
        re.IGNORECASE,
    )
    dob_pattern = re.compile(
        r"\bDOB[:\s-]*\d{1,2}/\d{1,2}/\d{2,4}\b",
        re.IGNORECASE,
    )
    date_pattern = re.compile(
        rf"\b("  # start group
        r"\d{1,2}/\d{1,2}/\d{2,4}"
        r"|\d{4}-\d{1,2}-\d{1,2}"
        rf"|{month}\s+\d{{1,2}}(?:st|nd|rd|th)?,?\s+\d{{2,4}}"
        rf"|\d{{1,2}}(?:st|nd|rd|th)?\s+{month}\s+\d{{2,4}}"
        r")\b",
        re.IGNORECASE,
    )
    email_pattern = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
    ssn_pattern = re.compile(r"\b(?:\d{3}-\d{2}-\d{4}|\d{9})\b")
    health_id_pattern = re.compile(
        r"\b(?:HIC|HID|INS)[- ]?\d{6,12}\b",
        re.IGNORECASE,
    )
    vehicle_pattern = re.compile(r"\b[A-Z]{2,3}[- ]?\d{3,4}\b")
    address_pattern = re.compile(
        r"\b\d+\s+(?:[A-Za-z]+\s?)+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)?\b",
        re.IGNORECASE,
    )
    name_pattern = re.compile(
        r"\b(?:(?:Dr|Mr|Mrs|Ms|Prof)\.?\s+)?[A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|[A-Z]\.|[a-z]{2,3}))*\s+[A-Z][a-z]+\b"
    )

    patterns = [
        ("PHONE", phone_pattern),
        ("DOB", dob_pattern),
        ("DATE", date_pattern),
        ("EMAIL", email_pattern),
        ("SSN", ssn_pattern),
        ("HEALTH_ID", health_id_pattern),
        ("VEHICLE", vehicle_pattern),
        ("ADDRESS", address_pattern),
        ("NAME", name_pattern),
    ]

    for token, pattern in patterns:
        text = pattern.sub(f"[{token}]", text)

    return text


# Endpoint: retrieve recent events for debugging/troubleshooting.  This returns
# a list of all logged events with their type, timestamp and details.  In a
# production system you might want to restrict access, paginate results or
# limit the number returned.  This endpoint is used by the frontend logs view.
@app.get("/events")
async def get_events(user=Depends(require_role("admin"))) -> List[Dict[str, Any]]:
    try:
        cursor = db_conn.cursor()
        cursor.execute("SELECT eventType, timestamp, details FROM events ORDER BY timestamp DESC LIMIT 200")
        rows = cursor.fetchall()
        result: List[Dict[str, Any]] = []
        for row in rows:
            try:
                details = json.loads(row["details"] or '{}')
            except Exception:
                details = {}
            result.append({
                "eventType": row["eventType"],
                "timestamp": row["timestamp"],
                "details": details,
            })
        return result
    except Exception as exc:
        print(f"Error fetching events: {exc}")
        # Return empty list on error
        return []


# Endpoint: log an event for analytics purposes.  The frontend should
# call this endpoint whenever a notable action occurs (e.g., starting
# a note, beautifying a note, requesting suggestions).  Events are
# stored in the global `events` list.  Returns a simple status.
@app.post("/event")
async def log_event(event: EventModel, user=Depends(require_role("user"))) -> Dict[str, str]:
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
    ]:
        value = getattr(event, key)
        if value is not None:
            data["details"][key] = value
    events.append(data)
    # Persist the event to the SQLite database.  Serialize the details
    # dictionary as JSON for storage.  Use a simple INSERT statement
    # and commit immediately because the volume of events is low in
    # this prototype.  In a production system, consider batching
    # writes or using an async database driver.
    try:
        db_conn.execute(
            "INSERT INTO events (eventType, timestamp, details, revenue, codes, compliance_flags, public_health, satisfaction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                data["eventType"],
                data["timestamp"],
                json.dumps(data["details"], ensure_ascii=False),
                data["details"].get("revenue"),
                json.dumps(data["details"].get("codes")) if data["details"].get("codes") is not None else None,
                json.dumps(data["details"].get("compliance")) if data["details"].get("compliance") is not None else None,
                1 if data["details"].get("publicHealth") is True else 0 if data["details"].get("publicHealth") is False else None,
                data["details"].get("satisfaction"),
            ),
        )
        db_conn.commit()
    except Exception as exc:
        print(f"Error inserting event into database: {exc}")
    return {"status": "logged"}


def _validate_prompt_templates(data: Dict[str, Any]) -> None:
    """Ensure prompt template structure is a mapping of mappings."""
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Template must be a JSON object")
    for key in ("default", "specialty", "payer"):
        if key in data and not isinstance(data[key], dict):
            raise HTTPException(status_code=400, detail=f"'{key}' section must be an object")


@app.get("/prompt-templates", response_model=Dict[str, Any])
def get_prompt_templates(user=Depends(require_role("admin"))) -> Dict[str, Any]:
    """Return the current prompt templates file."""
    path = os.path.join(os.path.dirname(__file__), "prompt_templates.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


@app.post("/prompt-templates", response_model=Dict[str, Any])
def save_prompt_templates(data: Dict[str, Any], user=Depends(require_role("admin"))) -> Dict[str, Any]:
    """Validate and persist prompt templates supplied by an admin user."""
    _validate_prompt_templates(data)
    path = os.path.join(os.path.dirname(__file__), "prompt_templates.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    prompt_utils._load_custom_templates.cache_clear()
    return data


@app.get("/templates", response_model=List[TemplateModel])
def get_templates(user=Depends(require_role("user"))) -> List[TemplateModel]:
    """Return custom templates for the current user and clinic."""

    clinic = user.get("clinic")
    cursor = db_conn.cursor()
    rows = cursor.execute(
        "SELECT id, name, content FROM templates WHERE user=? AND (clinic=? OR clinic IS NULL)",
        (user["sub"], clinic),
    ).fetchall()
    return [TemplateModel(id=row["id"], name=row["name"], content=row["content"]) for row in rows]


@app.post("/templates", response_model=TemplateModel)
def create_template(tpl: TemplateModel, user=Depends(require_role("user"))) -> TemplateModel:
    """Create a new custom template for the user."""

    clinic = user.get("clinic")
    cursor = db_conn.cursor()
    cursor.execute(
        "INSERT INTO templates (user, clinic, name, content) VALUES (?, ?, ?, ?)",
        (user["sub"], clinic, tpl.name, tpl.content),
    )
    db_conn.commit()
    tpl_id = cursor.lastrowid
    return TemplateModel(id=tpl_id, name=tpl.name, content=tpl.content)


@app.put("/templates/{template_id}", response_model=TemplateModel)
def update_template(template_id: int, tpl: TemplateModel, user=Depends(require_role("user"))) -> TemplateModel:
    """Update an existing custom template owned by the current user."""

    cursor = db_conn.cursor()
    cursor.execute(
        "UPDATE templates SET name=?, content=? WHERE id=? AND user=?",
        (tpl.name, tpl.content, template_id, user["sub"]),
    )
    db_conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return TemplateModel(id=template_id, name=tpl.name, content=tpl.content)


@app.delete("/templates/{template_id}")
def delete_template(template_id: int, user=Depends(require_role("user"))) -> Dict[str, str]:
    """Delete a custom template owned by the current user."""

    cursor = db_conn.cursor()
    cursor.execute(
        "DELETE FROM templates WHERE id=? AND user=?",
        (template_id, user["sub"]),
    )
    db_conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "deleted"}


class ExportRequest(BaseModel):
    """Payload for exporting a note to an external EHR system."""
    note: str


@app.post("/export_to_ehr")
async def export_to_ehr(req: ExportRequest, user=Depends(require_role("admin"))) -> Dict[str, str]:
    """Placeholder endpoint demonstrating admin-only export functionality."""
    # Real implementation would interface with an EHR API. For now, simply
    # acknowledge the request.
    return {"status": "exported"}


# Endpoint: aggregate metrics from the logged events.  Returns counts of
# notes created/saved, beautification actions and suggestions, as well
# as the average note length (in characters) if provided in event
# details.
@app.get("/metrics")
async def get_metrics(
    start: Optional[str] = None,
    end: Optional[str] = None,
    clinician: Optional[str] = None,
    user=Depends(require_role("admin")),
) -> Dict[str, Any]:
    """Aggregate analytics from logged events with optional filtering.

    The endpoint now uses SQL aggregation to build daily and weekly
    time‑series buckets directly within SQLite rather than iterating over
    each event in Python.  This keeps the implementation reasonably
    efficient even as the number of logged events grows."""

    cursor = db_conn.cursor()

    # Collect distinct clinicians for the frontend dropdown.
    cursor.execute(
        """
        SELECT DISTINCT json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.clinician') AS clinician
        FROM events
        WHERE json_extract(CASE WHEN json_valid(details) THEN details ELSE '{}' END, '$.clinician') IS NOT NULL
        """
    )
    clinicians = [row["clinician"] for row in cursor.fetchall() if row["clinician"]]

    # ------------------------------------------------------------------
    # Build a WHERE clause based on optional query parameters
    # ------------------------------------------------------------------
    def _parse_iso_ts(value: str) -> float | None:
        """Best effort parse of an ISO date/datetime string to a timestamp."""
        try:
            return datetime.fromisoformat(value).timestamp()
        except Exception:
            return None

    conditions: List[str] = []
    params: List[Any] = []
    if start:
        start_ts = _parse_iso_ts(start)
        if start_ts is not None:
            conditions.append("timestamp >= ?")
            params.append(start_ts)
    if end:
        end_ts = _parse_iso_ts(end)
        if end_ts is not None:
            conditions.append("timestamp <= ?")
            params.append(end_ts)
    if clinician:
        conditions.append("json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.clinician') = ?")
        params.append(clinician)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    # ------------------------------------------------------------------
    # Aggregate overall totals/averages using SQL
    # ------------------------------------------------------------------
    totals_query = f"""
        SELECT
            SUM(CASE WHEN eventType IN ('note_started','note_saved') THEN 1 ELSE 0 END) AS total_notes,
            SUM(CASE WHEN eventType='beautify' THEN 1 ELSE 0 END)        AS total_beautify,
            SUM(CASE WHEN eventType='suggest' THEN 1 ELSE 0 END)         AS total_suggest,
            SUM(CASE WHEN eventType='summary' THEN 1 ELSE 0 END)         AS total_summary,
            SUM(CASE WHEN eventType='chart_upload' THEN 1 ELSE 0 END)    AS total_chart_upload,
            SUM(CASE WHEN eventType='audio_recorded' THEN 1 ELSE 0 END)  AS total_audio,
            AVG(CAST(json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.length')      AS REAL))     AS avg_note_length,
            AVG(revenue)     AS revenue_per_visit,
            AVG(CAST(json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.timeToClose') AS REAL))     AS avg_close_time,
            AVG(satisfaction) AS avg_satisfaction,
            AVG(public_health) AS public_health_rate
        FROM events {where_clause}
    """
    cursor.execute(totals_query, params)
    row = cursor.fetchone()
    totals = dict(row) if row else {}

    total_notes = totals.get("total_notes", 0) or 0
    total_beautify = totals.get("total_beautify", 0) or 0
    total_suggest = totals.get("total_suggest", 0) or 0
    total_summary = totals.get("total_summary", 0) or 0
    total_chart_upload = totals.get("total_chart_upload", 0) or 0
    total_audio = totals.get("total_audio", 0) or 0
    avg_length = totals.get("avg_note_length") or 0
    avg_revenue = totals.get("revenue_per_visit") or 0
    avg_close_time = totals.get("avg_close_time") or 0

    # ------------------------------------------------------------------
    # Build daily and weekly time series via SQL GROUP BY
    # ------------------------------------------------------------------
    daily_query = f"""
        SELECT
            date(datetime(timestamp, 'unixepoch')) AS date,
            SUM(CASE WHEN eventType IN ('note_started','note_saved') THEN 1 ELSE 0 END) AS notes,
            SUM(CASE WHEN eventType='beautify' THEN 1 ELSE 0 END)   AS beautify,
            SUM(CASE WHEN eventType='suggest' THEN 1 ELSE 0 END)    AS suggest,
            SUM(CASE WHEN eventType='summary' THEN 1 ELSE 0 END)    AS summary,
            SUM(CASE WHEN eventType='chart_upload' THEN 1 ELSE 0 END) AS chart_upload,
            SUM(CASE WHEN eventType='audio_recorded' THEN 1 ELSE 0 END) AS audio,
            AVG(CAST(json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.length')      AS REAL)) AS avg_note_length,
            AVG(revenue) AS revenue_per_visit,
            AVG(CAST(json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.timeToClose') AS REAL)) AS avg_close_time
        FROM events {where_clause}
        GROUP BY date
        ORDER BY date
    """
    cursor.execute(daily_query, params)
    daily_list = [dict(row) for row in cursor.fetchall()]

    weekly_query = f"""
        SELECT
            strftime('%Y-%W', datetime(timestamp, 'unixepoch')) AS week,
            SUM(CASE WHEN eventType IN ('note_started','note_saved') THEN 1 ELSE 0 END) AS notes,
            SUM(CASE WHEN eventType='beautify' THEN 1 ELSE 0 END)   AS beautify,
            SUM(CASE WHEN eventType='suggest' THEN 1 ELSE 0 END)    AS suggest,
            SUM(CASE WHEN eventType='summary' THEN 1 ELSE 0 END)    AS summary,
            SUM(CASE WHEN eventType='chart_upload' THEN 1 ELSE 0 END) AS chart_upload,
            SUM(CASE WHEN eventType='audio_recorded' THEN 1 ELSE 0 END) AS audio,
            AVG(CAST(json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.length')      AS REAL)) AS avg_note_length,
            AVG(revenue) AS revenue_per_visit,
            AVG(CAST(json_extract(CASE WHEN json_valid(details) THEN details ELSE '{{}}' END, '$.timeToClose') AS REAL)) AS avg_close_time
        FROM events {where_clause}
        GROUP BY week
        ORDER BY week
    """
    cursor.execute(weekly_query, params)
    weekly_list = [dict(row) for row in cursor.fetchall()]

    # ------------------------------------------------------------------
    # Additional aggregations that are easier in Python
    # (e.g. denial rates, coding distribution, beautify time)
    # ------------------------------------------------------------------
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
    beautify_daily: Dict[str, List[float]] = {}
    beautify_weekly: Dict[str, List[float]] = {}
    last_start_for_patient: Dict[str, float] = {}

    for row in rows:
        evt = row["eventType"]
        ts = row["timestamp"]
        try:
            details = json.loads(row["details"] or "{}")
        except Exception:
            details = {}

        codes_val = row["codes"]
        try:
            codes = json.loads(codes_val) if codes_val else []
        except Exception:
            codes = []
        if isinstance(codes, list):
            denial_flag = details.get("denial") if isinstance(details.get("denial"), bool) else None
            for code in codes:
                code_counts[code] = code_counts.get(code, 0) + 1
                if denial_flag is not None:
                    totals = denial_counts.get(code, [0, 0])
                    totals[0] += 1
                    if denial_flag:
                        totals[1] += 1
                    denial_counts[code] = totals

        comp_val = row["compliance_flags"]
        try:
            comp_list = json.loads(comp_val) if comp_val else []
        except Exception:
            comp_list = []
        for flag in comp_list:
            compliance_counts[flag] = compliance_counts.get(flag, 0) + 1

        public_health = row["public_health"]
        if isinstance(public_health, int):
            public_health_totals[0] += 1
            if public_health:
                public_health_totals[1] += 1

        satisfaction = row["satisfaction"]
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

        patient_id = (
            details.get("patientID")
            or details.get("patientId")
            or details.get("patient_id")
        )
        if evt == "note_started" and patient_id:
            last_start_for_patient[patient_id] = ts
        if evt == "beautify" and patient_id and patient_id in last_start_for_patient:
            duration = ts - last_start_for_patient[patient_id]
            if duration >= 0:
                beautify_time_sum += duration
                beautify_time_count += 1
                day = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
                week = datetime.utcfromtimestamp(ts).strftime("%Y-%W")
                daily_rec = beautify_daily.setdefault(day, [0.0, 0])
                daily_rec[0] += duration
                daily_rec[1] += 1
                weekly_rec = beautify_weekly.setdefault(week, [0.0, 0])
                weekly_rec[0] += duration
                weekly_rec[1] += 1

    avg_beautify_time = (
        beautify_time_sum / beautify_time_count if beautify_time_count else 0
    )

    # attach beautify averages to the SQL-produced time series
    for entry in daily_list:
        bt = beautify_daily.get(entry["date"])
        entry["avg_beautify_time"] = bt[0] / bt[1] if bt and bt[1] else 0
    for entry in weekly_list:
        bt = beautify_weekly.get(entry["week"])
        entry["avg_beautify_time"] = bt[0] / bt[1] if bt and bt[1] else 0

    denial_rates = {
        code: (v[1] / v[0] if v[0] else 0) for code, v in denial_counts.items()
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

    return {
        "total_notes": total_notes,
        "total_beautify": total_beautify,
        "total_suggest": total_suggest,
        "total_summary": total_summary,
        "total_chart_upload": total_chart_upload,
        "total_audio": total_audio,
        "avg_note_length": avg_length,
        "avg_beautify_time": avg_beautify_time,
        "avg_close_time": avg_close_time,
        "revenue_per_visit": avg_revenue,
        "coding_distribution": code_counts,
        "denial_rate": overall_denial,
        "denial_rates": denial_rates,
        "deficiency_rate": deficiency_rate,
        "compliance_counts": compliance_counts,
        "public_health_rate": public_health_rate,
        "avg_satisfaction": avg_satisfaction,
        "clinicians": clinicians,
        "timeseries": {"daily": daily_list, "weekly": weekly_list},
    }
@app.post("/summarize")
async def summarize(req: NoteRequest, user=Depends(require_role("user"))) -> Dict[str, str]:
    """
    Generate a patient‑friendly summary of a clinical note.  This endpoint
    combines the draft text with any optional chart and audio transcript,
    de‑identifies the content and calls an LLM to rewrite it in plain
    language suitable for patients.  If the LLM call fails, it returns
    a truncated version of the de‑identified note as a fallback.

    Args:
        req: NoteRequest with the clinical note and optional context.
    Returns:
        A dictionary containing the summary under the key "summary".
    """
    combined = req.text or ""
    if req.chart:
        combined += "\n\n" + str(req.chart)
    if req.audio:
        combined += "\n\n" + str(req.audio)
    cleaned = deidentify(combined)
    if USE_OFFLINE_MODEL:
        from .offline_model import summarize as offline_summarize

        summary = offline_summarize(cleaned, req.lang, req.specialty, req.payer)
    else:
        try:
            messages = build_summary_prompt(cleaned, req.lang, req.specialty, req.payer)
            response_content = call_openai(messages)
            summary = response_content.strip()
        except Exception as exc:
            # If the LLM call fails, fall back to a simple truncation of the
            # cleaned text.  Take the first 200 characters and append ellipsis
            # if the text is longer.  This ensures the endpoint still returns
            # something useful without crashing.
            print(f"Error during summary LLM call: {exc}")
            summary = cleaned[:200]
            if len(cleaned) > 200:
                summary += "..."
    return {"summary": summary}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...), diarise: bool = False, user=Depends(require_role("user"))
) -> Dict[str, str]:
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
        result = diarize_and_transcribe(audio_bytes)
    else:
        result = {"provider": simple_transcribe(audio_bytes), "patient": ""}
    # Store the most recent transcript so other endpoints or subsequent
    # requests can reuse it without reprocessing the audio.
    last_transcript.update(result)
    return result


@app.get("/transcribe")
async def get_last_transcript(user=Depends(require_role("user"))) -> Dict[str, str]:
    """Return the most recent audio transcript.

    This endpoint allows the frontend to retrieve the last transcript
    produced by :func:`transcribe` without uploading the audio again.
    The transcript is stored in-memory and reset when the server restarts.
    """

    return last_transcript

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
        return JSONResponse({"status": "error", "message": "Key cannot be empty"}, status_code=400)

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
    if USE_OFFLINE_MODEL:
        from .offline_model import beautify as offline_beautify

        beautified = offline_beautify(cleaned, req.lang, req.specialty, req.payer)
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
        print(f"Error during beautify LLM call: {exc}")
        sentences = re.split(r"(?<=[.!?])\s+", cleaned.strip())
        beautified = " ".join(s[:1].upper() + s[1:] for s in sentences if s)
        return {"beautified": beautified, "error": str(exc)}


@app.post("/suggest", response_model=SuggestionsResponse)
async def suggest(req: NoteRequest, user=Depends(require_role("user"))) -> SuggestionsResponse:
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
        rules_section = "\n\nUser‑defined rules:\n" + "\n".join(f"- {r}" for r in req.rules)
        cleaned_for_prompt = cleaned + rules_section
    else:
        cleaned_for_prompt = cleaned
    if USE_OFFLINE_MODEL:
        from .offline_model import suggest as offline_suggest

        data = offline_suggest(
            cleaned_for_prompt,
            req.lang,
            req.specialty,
            req.payer,
            req.age,
            req.sex,
            req.region,
        )
        return SuggestionsResponse(
            codes=[CodeSuggestion(**c) for c in data["codes"]],
            compliance=data["compliance"],
            publicHealth=[PublicHealthSuggestion(**p) for p in data["publicHealth"]],
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
                if rec:
                    public_health.append(
                        PublicHealthSuggestion(recommendation=rec, reason=reason)
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
                diffs.append(
                    DifferentialSuggestion(diagnosis=str(item), score=None)
                )
        # Augment public health suggestions with external guidelines
        extra_ph = public_health_api.get_public_health_suggestions(
            req.age, req.sex, req.region
        )
        if extra_ph:
            existing = {p.recommendation for p in public_health}
            for rec in extra_ph:
                if rec not in existing:
                    public_health.append(
                        PublicHealthSuggestion(recommendation=rec, reason=None)
                    )
        # If all categories are empty, raise an error to fall back to rule-based suggestions.
        if not (codes_list or compliance or public_health or diffs):
            raise ValueError("No suggestions returned from LLM")
        follow_up = recommend_follow_up(cleaned, [c.code for c in codes_list])
        return SuggestionsResponse(
            codes=codes_list,
            compliance=compliance,
            publicHealth=public_health,
            differentials=diffs,
            followUp=follow_up,
        )
    except Exception as exc:
        # Log error and use rule-based fallback suggestions.
        print(f"Error during suggest LLM call or parsing JSON: {exc}")
        lower = cleaned.lower()
        codes: List[CodeSuggestion] = []
        compliance: List[str] = []
        public_health: List[PublicHealthSuggestion] = []
        diffs: List[DifferentialSuggestion] = []
        # Respiratory symptoms
        if any(keyword in lower for keyword in ["cough", "fever", "cold", "sore throat"]):
            codes.append(CodeSuggestion(code="99213", rationale="Established patient with respiratory symptoms"))
            codes.append(CodeSuggestion(code="J06.9", rationale="Upper respiratory infection, unspecified"))
            compliance.append("Document duration of fever and associated symptoms")
            public_health.append(
                PublicHealthSuggestion(recommendation="Consider influenza vaccine", reason=None)
            )
            diffs.extend(
                [
                    DifferentialSuggestion(diagnosis="Common cold"),
                    DifferentialSuggestion(diagnosis="COVID-19"),
                    DifferentialSuggestion(diagnosis="Influenza"),
                ]
            )
        # Diabetes management
        if "diabetes" in lower:
            codes.append(CodeSuggestion(code="E11.9", rationale="Type 2 diabetes mellitus without complications"))
            compliance.append("Include latest HbA1c results and medication list")
            public_health.append(
                PublicHealthSuggestion(
                    recommendation="Remind patient about foot and eye exams", reason=None
                )
            )
            diffs.append(DifferentialSuggestion(diagnosis="Impaired glucose tolerance"))
        # Hypertension
        if "hypertension" in lower or "high blood pressure" in lower:
            codes.append(CodeSuggestion(code="I10", rationale="Essential (primary) hypertension"))
            compliance.append("Document blood pressure readings and lifestyle counselling")
            public_health.append(
                PublicHealthSuggestion(
                    recommendation="Discuss sodium restriction and exercise", reason=None
                )
            )
            diffs.append(DifferentialSuggestion(diagnosis="White coat hypertension"))
        # Preventive visit
        if "annual" in lower or "wellness" in lower:
            codes.append(CodeSuggestion(code="99395", rationale="Periodic comprehensive preventive visit"))
            compliance.append("Ensure all preventive screenings are up to date")
            public_health.append(
                PublicHealthSuggestion(
                    recommendation="Screen for depression and alcohol use", reason=None
                )
            )
            diffs.append(DifferentialSuggestion(diagnosis="–"))
        # Mental health
        if any(word in lower for word in ["depression", "anxiety", "sad", "depressed"]):
            codes.append(CodeSuggestion(code="F32.9", rationale="Major depressive disorder, unspecified"))
            compliance.append(
                "Assess severity and suicidal ideation; document mental status exam"
            )
            public_health.append(
                PublicHealthSuggestion(
                    recommendation="Offer referral to counselling or psychotherapy", reason=None
                )
            )
            diffs.append(DifferentialSuggestion(diagnosis="Adjustment disorder"))
        # Musculoskeletal pain
        if any(word in lower for word in ["back pain", "low back", "joint pain", "knee pain", "shoulder pain"]):
            codes.append(CodeSuggestion(code="M54.5", rationale="Low back pain"))
            compliance.append(
                "Document onset, aggravating/relieving factors, and functional limitations"
            )
            public_health.append(
                PublicHealthSuggestion(
                    recommendation="Recommend stretching and physical therapy", reason=None
                )
            )
            diffs.append(DifferentialSuggestion(diagnosis="Lumbar strain"))
        # Default suggestions if nothing matched
        if not codes:
            codes.append(CodeSuggestion(code="99212", rationale="Established patient, straightforward"))
        if not compliance:
            compliance.append("Ensure chief complaint and history are complete")
        if not public_health:
            public_health.append(
                PublicHealthSuggestion(recommendation="Consider influenza vaccine", reason=None)
            )
        if not diffs:
            diffs.append(DifferentialSuggestion(diagnosis="Routine follow-up"))
        extra_ph = public_health_api.get_public_health_suggestions(
            req.age, req.sex, req.region
        )
        if extra_ph:
            existing = {p.recommendation for p in public_health}
            for rec in extra_ph:
                if rec not in existing:
                    public_health.append(
                        PublicHealthSuggestion(recommendation=rec, reason=None)
                    )
        follow_up = recommend_follow_up(cleaned, [c.code for c in codes])
        return SuggestionsResponse(
            codes=codes,
            compliance=compliance,
            publicHealth=public_health,
            differentials=diffs,
            followUp=follow_up,
        )
