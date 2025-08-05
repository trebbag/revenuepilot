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
from pydantic import BaseModel

import jwt

# Import prompt builders and OpenAI helper for LLM integration.
# These imports are commented out above to avoid import errors when the
# dependencies are missing.  They are now enabled to allow the API to
# generate results using a real language model.  Ensure `openai` is
# installed and `OPENAI_API_KEY` is set in your environment before
# deploying.
from .prompts import build_beautify_prompt, build_suggest_prompt, build_summary_prompt
from .openai_client import call_openai
from .key_manager import get_api_key, save_api_key, APP_NAME
from platformdirs import user_data_dir
from .audio_processing import simple_transcribe, diarize_and_transcribe

import json
import sqlite3

try:
    import scrubadub
    _SCRUBBER_AVAILABLE = True
except Exception:  # pragma: no cover - library is optional
    scrubadub = None  # type: ignore
    _SCRUBBER_AVAILABLE = False

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
db_conn.execute(
    "CREATE TABLE IF NOT EXISTS events ("
    "id INTEGER PRIMARY KEY AUTOINCREMENT,"
    "eventType TEXT NOT NULL,"
    "timestamp REAL NOT NULL,"
    "details TEXT"
    ")"
)
db_conn.commit()

# Configure the database connection to return rows as dictionaries.  This
# makes it easier to access columns by name when querying events for
# metrics computations.
db_conn.row_factory = sqlite3.Row

# Preload any stored API key into the environment so subsequent calls work.
get_api_key()

# ---------------------------------------------------------------------------
# JWT authentication helpers
# ---------------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_ALGORITHM = "HS256"
security = HTTPBearer()


def create_token(username: str, role: str) -> str:
    """Create a signed JWT for the given user and role."""
    payload = {
        "sub": username,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=12),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Decode the provided JWT and return its payload."""
    token = credentials.credentials
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return data


def require_role(role: str):
    """Dependency factory ensuring the current user has a given role."""
    def checker(user=Depends(get_current_user)):
        if user.get("role") != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient privileges",
            )
        return user

    return checker

# Model for setting API key via API endpoint
class ApiKeyModel(BaseModel):
    key: str


class LoginModel(BaseModel):
    username: str
    role: str


@app.post("/login")
async def login(model: LoginModel) -> Dict[str, str]:
    """Return a JWT for the provided user and role."""
    token = create_token(model.username, model.role)
    return {"access_token": token}


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


class CodeSuggestion(BaseModel):
    """Represents a single coding suggestion with rationale."""
    code: str
    rationale: Optional[str] = None


class SuggestionsResponse(BaseModel):
    """Schema for the suggestions returned to the frontend."""
    codes: List[CodeSuggestion]
    compliance: List[str]
    publicHealth: List[str]
    differentials: List[str]


# Schema for logging events from the frontend.  Each event should include
# an eventType (e.g., "note_started", "beautify", "suggest") and
# optional details (such as patient ID or note length).  The timestamp
# is optional; if not provided the current UTC time is used.
class EventModel(BaseModel):
    eventType: str
    details: Optional[Dict[str, Any]] = None
    timestamp: Optional[float] = None


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
        r"(?<!\d)(?:\(\d{3}\)\s*|\d{3}[-\.\s]?)\d{3}[-\.\s]?\d{4}\b",
        re.IGNORECASE,
    )
    date_pattern = re.compile(
        rf"\b("  # start group
        r"\d{1,2}/\d{1,2}/\d{2,4}"
        r"|\d{4}-\d{1,2}-\d{1,2}"
        rf"|{month}\s+\d{{1,2}},?\s+\d{{2,4}}"
        rf"|\d{{1,2}}\s+{month}\s+\d{{2,4}}"
        r")\b",
        re.IGNORECASE,
    )
    email_pattern = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
    ssn_pattern = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
    address_pattern = re.compile(
        r"\b\d+\s+(?:[A-Za-z]+\s?)+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b",
        re.IGNORECASE,
    )
    name_pattern = re.compile(r"\b[A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|[A-Z]\.))+\b")

    patterns = [
        ("PHONE", phone_pattern),
        ("DATE", date_pattern),
        ("EMAIL", email_pattern),
        ("SSN", ssn_pattern),
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
async def log_event(event: EventModel) -> Dict[str, str]:
    data = {
        "eventType": event.eventType,
        "details": event.details or {},
        "timestamp": event.timestamp or datetime.utcnow().timestamp(),
    }
    events.append(data)
    # Persist the event to the SQLite database.  Serialize the details
    # dictionary as JSON for storage.  Use a simple INSERT statement
    # and commit immediately because the volume of events is low in
    # this prototype.  In a production system, consider batching
    # writes or using an async database driver.
    try:
        db_conn.execute(
            "INSERT INTO events (eventType, timestamp, details) VALUES (?, ?, ?)",
            (
                data["eventType"],
                data["timestamp"],
                json.dumps(data["details"], ensure_ascii=False),
            ),
        )
        db_conn.commit()
    except Exception as exc:
        print(f"Error inserting event into database: {exc}")
    return {"status": "logged"}


# Endpoint: aggregate metrics from the logged events.  Returns counts of
# notes created/saved, beautification actions and suggestions, as well
# as the average note length (in characters) if provided in event
# details.
@app.get("/metrics")
async def get_metrics(user=Depends(require_role("admin"))) -> Dict[str, Any]:
    # Use the database to compute simple counts.  This avoids scanning the
    # in-memory list and ensures metrics persist across restarts.
    cursor = db_conn.cursor()
    def count_events(*types: str) -> int:
        placeholders = ",".join(["?"] * len(types))
        cursor.execute(f"SELECT COUNT(*) AS cnt FROM events WHERE eventType IN ({placeholders})", types)
        row = cursor.fetchone()
        return row["cnt"] if row else 0
    total_notes = count_events("note_started", "note_saved")
    total_beautify = count_events("beautify")
    total_suggest = count_events("suggest")
    total_summary = count_events("summary")
    total_chart_upload = count_events("chart_upload")
    total_audio = count_events("audio_recorded")
    # Compute average note length from stored details.  Extract the 'length'
    # value from the JSON details field when present.
    cursor.execute("SELECT details FROM events")
    lengths = []
    for row in cursor.fetchall():
        try:
            det_json = row["details"]
            det = json.loads(det_json)
            length_val = det.get("length")
            if isinstance(length_val, (int, float)):
                lengths.append(length_val)
        except Exception:
            continue
    avg_length = sum(lengths) / len(lengths) if lengths else 0
    # Compute average beautify time by pulling relevant events from the database.
    # We need to pair each beautify event with the most recent note_started event
    # for the same patient ID.  Parse the patient ID from the JSON details.
    cursor.execute("SELECT eventType, timestamp, details FROM events WHERE eventType IN ('note_started','beautify') ORDER BY timestamp")
    db_events = []
    for row in cursor.fetchall():
        try:
            details = json.loads(row["details"] or '{}')
        except Exception:
            details = {}
        db_events.append({
            'eventType': row['eventType'],
            'timestamp': row['timestamp'],
            'details': details,
        })
    beautify_durations = []
    for e in db_events:
        if e['eventType'] != 'beautify':
            continue
        patient_id = e['details'].get('patientID') or e['details'].get('patientId') or e['details'].get('patient_id')
        if not patient_id:
            continue
        # Find the most recent note_started before this beautify for same patient
        prev = [ev for ev in db_events if ev['eventType'] == 'note_started' and ev['details'].get('patientID') == patient_id and ev['timestamp'] <= e['timestamp']]
        if not prev:
            continue
        latest_start = max(prev, key=lambda ev: ev['timestamp'])
        duration = e['timestamp'] - latest_start['timestamp']
        if duration >= 0:
            beautify_durations.append(duration)
    avg_beautify_time = sum(beautify_durations) / len(beautify_durations) if beautify_durations else 0
    # Daily and weekly counts for charts
    cursor.execute(
        "SELECT DATE(timestamp, 'unixepoch') as day, COUNT(*) as cnt FROM events GROUP BY day ORDER BY day"
    )
    daily = [{"date": row["day"], "count": row["cnt"]} for row in cursor.fetchall()]
    cursor.execute(
        "SELECT strftime('%Y-%W', timestamp, 'unixepoch') as week, COUNT(*) as cnt FROM events GROUP BY week ORDER BY week"
    )
    weekly = [{"week": row["week"], "count": row["cnt"]} for row in cursor.fetchall()]
    return {
        'total_notes': total_notes,
        'total_beautify': total_beautify,
        'total_suggest': total_suggest,
        'total_summary': total_summary,
        'total_chart_upload': total_chart_upload,
        'total_audio': total_audio,
        'avg_note_length': avg_length,
        'avg_beautify_time': avg_beautify_time,
        'timeseries': {'daily': daily, 'weekly': weekly},
    }


@app.post("/summarize")
async def summarize(req: NoteRequest) -> Dict[str, str]:
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
    try:
        messages = build_summary_prompt(cleaned)
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
async def transcribe(file: UploadFile = File(...), diarize: bool = False) -> Dict[str, Any]:
    """Transcribe uploaded audio.

    The endpoint accepts an audio file (e.g. from the browser's
    ``MediaRecorder`` API) and returns either a single transcript or, when
    ``diarize`` is true, separate transcripts for provider and patient.
    Actual transcription is delegated to :mod:`backend.audio_processing`.
    """

    audio_bytes = await file.read()
    if diarize:
        return diarize_and_transcribe(audio_bytes)
    return {"transcript": simple_transcribe(audio_bytes)}

# Endpoint: set the OpenAI API key.  Accepts a JSON body with a single
# field "key" and stores it in a local file.  Also updates the
# environment variable OPENAI_API_KEY so future requests in this
# process use the new key.  This enables users to configure the key
# through the UI without editing environment variables directly.
@app.post("/apikey")
async def set_api_key(model: ApiKeyModel):
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
async def beautify_note(req: NoteRequest) -> dict:
    """
    Beautify (reformat) a clinical note.  This endpoint de‑identifies the
    incoming note and then calls an LLM to rephrase it into a professional
    format. If the model call fails, the cleaned text is uppercased as a
    fallback.

    Args:
        req: NoteRequest with a raw clinical note.
    Returns:
        A dictionary with the beautified note as a string.
    """
    cleaned = deidentify(req.text)
    # Attempt to call the LLM to beautify the note.  If the call
    # fails for any reason (e.g., missing API key, network error), fall
    # back to a simple uppercase transformation so the endpoint still
    # returns something useful.
    try:
        messages = build_beautify_prompt(cleaned)
        response_content = call_openai(messages)
        # The assistant's reply is expected to contain only the
        # beautified note text.  We strip any leading/trailing
        # whitespace to tidy the result.
        beautified = response_content.strip()
    except Exception as exc:
        # Log the exception and fall back to a basic transformation.
        print(f"Error during beautify LLM call: {exc}")
        beautified = cleaned.upper()
    return {"beautified": beautified}


@app.post("/suggest", response_model=SuggestionsResponse)
async def suggest(req: NoteRequest) -> SuggestionsResponse:
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
    # Try to call the LLM to generate structured suggestions.  The prompt
    # instructs the model to return JSON with keys codes, compliance,
    # public_health and differentials.  We parse the JSON into the
    # SuggestionsResponse schema.  If anything fails, we fall back to
    # the simple rule-based engine defined previously.
    try:
        messages = build_suggest_prompt(cleaned_for_prompt)
        response_content = call_openai(messages)
        # The model should return raw JSON.  Parse it into a Python dict.
        data = json.loads(response_content)
        # Convert codes list of dicts into CodeSuggestion objects.  Provide
        # defaults for missing fields.
        codes_list = []
        for item in data.get("codes", []):
            code_str = item.get("code") or item.get("Code") or ""
            rationale = item.get("rationale") or item.get("Rationale") or None
            if code_str:
                codes_list.append(CodeSuggestion(code=code_str, rationale=rationale))
        # Extract other categories, ensuring they are lists of strings.
        compliance = [str(x) for x in data.get("compliance", [])]
        public_health_raw = data.get("publicHealth", data.get("public_health", []))
        public_health = [str(x) for x in public_health_raw]
        diffs = [str(x) for x in data.get("differentials", [])]
        # If all categories are empty, raise an error to fall back to rule-based suggestions.
        if not (codes_list or compliance or public_health or diffs):
            raise ValueError("No suggestions returned from LLM")
        return SuggestionsResponse(
            codes=codes_list,
            compliance=compliance,
            publicHealth=public_health,
            differentials=diffs,
        )
    except Exception as exc:
        # Log error and use rule-based fallback suggestions.
        print(f"Error during suggest LLM call or parsing JSON: {exc}")
        lower = cleaned.lower()
        codes = []
        compliance = []
        public_health = []
        diffs = []
        # Respiratory symptoms
        if any(keyword in lower for keyword in ["cough", "fever", "cold", "sore throat"]):
            codes.append(CodeSuggestion(code="99213", rationale="Established patient with respiratory symptoms"))
            codes.append(CodeSuggestion(code="J06.9", rationale="Upper respiratory infection, unspecified"))
            compliance.append("Document duration of fever and associated symptoms")
            public_health.append("Consider influenza vaccine")
            diffs.extend(["Common cold", "COVID-19", "Influenza"])
        # Diabetes management
        if "diabetes" in lower:
            codes.append(CodeSuggestion(code="E11.9", rationale="Type 2 diabetes mellitus without complications"))
            compliance.append("Include latest HbA1c results and medication list")
            public_health.append("Remind patient about foot and eye exams")
            diffs.append("Impaired glucose tolerance")
        # Hypertension
        if "hypertension" in lower or "high blood pressure" in lower:
            codes.append(CodeSuggestion(code="I10", rationale="Essential (primary) hypertension"))
            compliance.append("Document blood pressure readings and lifestyle counselling")
            public_health.append("Discuss sodium restriction and exercise")
            diffs.append("White coat hypertension")
        # Preventive visit
        if "annual" in lower or "wellness" in lower:
            codes.append(CodeSuggestion(code="99395", rationale="Periodic comprehensive preventive visit"))
            compliance.append("Ensure all preventive screenings are up to date")
            public_health.append("Screen for depression and alcohol use")
            diffs.append("–")
        # Mental health
        if any(word in lower for word in ["depression", "anxiety", "sad", "depressed"]):
            codes.append(CodeSuggestion(code="F32.9", rationale="Major depressive disorder, unspecified"))
            compliance.append("Assess severity and suicidal ideation; document mental status exam")
            public_health.append("Offer referral to counselling or psychotherapy")
            diffs.append("Adjustment disorder")
        # Musculoskeletal pain
        if any(word in lower for word in ["back pain", "low back", "joint pain", "knee pain", "shoulder pain"]):
            codes.append(CodeSuggestion(code="M54.5", rationale="Low back pain"))
            compliance.append("Document onset, aggravating/relieving factors, and functional limitations")
            public_health.append("Recommend stretching and physical therapy")
            diffs.append("Lumbar strain")
        # Default suggestions if nothing matched
        if not codes:
            codes.append(CodeSuggestion(code="99212", rationale="Established patient, straightforward"))
        if not compliance:
            compliance.append("Ensure chief complaint and history are complete")
        if not public_health:
            public_health.append("Consider influenza vaccine")
        if not diffs:
            diffs.append("Routine follow-up")
        return SuggestionsResponse(
            codes=codes,
            compliance=compliance,
            publicHealth=public_health,
            differentials=diffs,
        )
