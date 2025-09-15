"""Patient data access helpers.

This module previously exposed a static in-memory map of mock patients for
demo purposes.  The tests and API endpoints now require access to the real
SQLite-backed dataset that powers the rest of the application, with optional
fallback to an external EHR API when configured via environment variables.

The helpers below centralise patient search and retrieval logic so the HTTP
handlers can remain thin while unit tests may inject an in-memory connection.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple
from urllib.parse import urljoin

import requests

logger = logging.getLogger(__name__)


_DB_CONN: Optional[sqlite3.Connection] = None

EHR_PATIENT_API_URL = os.getenv("EHR_PATIENT_API_URL")
EHR_PATIENT_SEARCH_ENDPOINT = os.getenv("EHR_PATIENT_SEARCH_ENDPOINT", "/patients/search")
EHR_PATIENT_DETAIL_ENDPOINT = os.getenv("EHR_PATIENT_DETAIL_ENDPOINT", "/patients/{patientId}")
EHR_PATIENT_TIMEOUT = float(os.getenv("EHR_PATIENT_TIMEOUT", "5"))
EHR_PATIENT_API_KEY = os.getenv("EHR_PATIENT_API_KEY")
EHR_PATIENT_AUTH_HEADER = os.getenv("EHR_PATIENT_AUTH_HEADER", "Authorization")


def configure_database(conn: sqlite3.Connection) -> None:
    """Remember ``conn`` so helpers can be used without passing it explicitly."""

    global _DB_CONN
    _DB_CONN = conn


def _resolve_connection(conn: Optional[sqlite3.Connection] = None) -> Optional[sqlite3.Connection]:
    """Return a SQLite connection to use for queries."""

    if conn is not None:
        return conn
    if _DB_CONN is not None:
        return _DB_CONN
    try:  # Late import to avoid circular dependency during module import.
        from backend import main  # type: ignore

        return getattr(main, "db_conn", None)
    except Exception:
        return None


def _deserialize_json_list(value: Any) -> List[str]:
    """Return ``value`` coerced into a list of strings."""

    if value in (None, "", b""):
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    if isinstance(value, (bytes, bytearray)):
        try:
            value = value.decode("utf-8")
        except Exception:
            value = value.decode("utf-8", errors="ignore")
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = text
        if isinstance(parsed, list):
            return [str(item) for item in parsed if item is not None]
        if isinstance(parsed, str):
            stripped = parsed.strip()
            return [stripped] if stripped else []
    return []


def _calculate_age(dob_str: Optional[str]) -> Optional[int]:
    """Return the approximate age in years for the given ISO date string."""

    if not dob_str:
        return None
    try:
        dob = datetime.strptime(dob_str, "%Y-%m-%d").date()
    except ValueError:
        return None
    today = date.today()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return max(years, 0)


def _format_patient_row(row: Mapping[str, Any]) -> Dict[str, Any]:
    """Normalise a patient row from SQLite into the API response format."""

    data = dict(row)
    patient_id = data.get("id") or data.get("patient_id")
    first = (data.get("first_name") or "").strip()
    last = (data.get("last_name") or "").strip()
    mrn = data.get("mrn")
    name_parts = [part for part in (first, last) if part]
    name = " ".join(name_parts) if name_parts else (mrn or f"Patient {patient_id}")
    payload: Dict[str, Any] = {
        "patientId": str(patient_id) if patient_id is not None else None,
        "mrn": mrn,
        "firstName": first,
        "lastName": last,
        "name": name,
        "dob": data.get("dob"),
        "age": _calculate_age(data.get("dob")),
        "gender": data.get("gender"),
        "insurance": data.get("insurance"),
        "lastVisit": data.get("last_visit"),
        "allergies": _deserialize_json_list(data.get("allergies")),
        "medications": _deserialize_json_list(data.get("medications")),
    }
    return payload


def _ehr_headers() -> Dict[str, str]:
    """Return headers for talking to the external EHR API."""

    headers: Dict[str, str] = {}
    if EHR_PATIENT_API_KEY:
        headers[EHR_PATIENT_AUTH_HEADER] = EHR_PATIENT_API_KEY
    return headers


def _build_ehr_url(endpoint: str) -> str:
    base = EHR_PATIENT_API_URL
    if not base:
        raise RuntimeError("EHR_PATIENT_API_URL is not configured")
    return urljoin(base.rstrip("/") + "/", endpoint.lstrip("/"))


def _normalize_remote_patient(data: Mapping[str, Any]) -> Dict[str, Any]:
    """Coerce a remote payload into the internal patient representation."""

    patient_id = data.get("patientId") or data.get("id") or data.get("identifier")
    first = data.get("firstName") or data.get("first_name") or data.get("givenName") or ""
    last = data.get("lastName") or data.get("last_name") or data.get("familyName") or ""
    name = data.get("name") or " ".join(part for part in (first, last) if part)
    payload = {
        "patientId": str(patient_id) if patient_id is not None else None,
        "mrn": data.get("mrn") or data.get("identifier"),
        "firstName": first,
        "lastName": last,
        "name": name,
        "dob": data.get("dob") or data.get("dateOfBirth"),
        "age": data.get("age"),
        "gender": data.get("gender"),
        "insurance": data.get("insurance"),
        "lastVisit": data.get("lastVisit") or data.get("last_visit"),
        "allergies": _deserialize_json_list(data.get("allergies")),
        "medications": _deserialize_json_list(data.get("medications")),
    }
    encounters = data.get("encounters")
    if isinstance(encounters, Iterable) and not isinstance(encounters, (str, bytes, dict)):
        payload["encounters"] = list(encounters)
    return payload


def _fetch_remote_patient(patient_id: str) -> Optional[Dict[str, Any]]:
    if not EHR_PATIENT_API_URL:
        return None
    endpoint = EHR_PATIENT_DETAIL_ENDPOINT.format(patientId=patient_id, mrn=patient_id)
    try:
        resp = requests.get(
            _build_ehr_url(endpoint),
            headers=_ehr_headers(),
            timeout=EHR_PATIENT_TIMEOUT,
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        payload = resp.json()
    except Exception:  # pragma: no cover - depends on external service
        logger.exception("EHR patient lookup failed for id=%s", patient_id)
        return None
    if isinstance(payload, Mapping):
        return _normalize_remote_patient(payload)
    return None


def _fetch_remote_patients(
    query: str, *, limit: int, offset: int
) -> Tuple[List[Dict[str, Any]], Optional[Mapping[str, Any]]]:
    if not EHR_PATIENT_API_URL or not query:
        return [], None
    try:
        resp = requests.get(
            _build_ehr_url(EHR_PATIENT_SEARCH_ENDPOINT),
            params={"q": query, "limit": limit, "offset": offset},
            headers=_ehr_headers(),
            timeout=EHR_PATIENT_TIMEOUT,
        )
        resp.raise_for_status()
        payload = resp.json()
    except Exception:  # pragma: no cover - depends on external service
        logger.exception("EHR patient search failed for query=%s", query)
        return [], None

    if isinstance(payload, Mapping):
        raw_results = payload.get("patients") or payload.get("results") or []
        pagination = payload.get("pagination")
    elif isinstance(payload, list):
        raw_results = payload
        pagination = None
    else:
        return [], None

    normalised = [
        _normalize_remote_patient(item)
        for item in raw_results
        if isinstance(item, Mapping)
    ]
    return normalised, pagination


def get_patient(
    patient_id: str | int,
    *,
    conn: Optional[sqlite3.Connection] = None,
    include_encounters: bool = True,
    prefer_remote: bool = False,
) -> Optional[Dict[str, Any]]:
    """Return a patient record from the local dataset or EHR."""

    identifier = str(patient_id)
    connection = _resolve_connection(conn)
    row = None
    if connection is not None:
        try:
            row = connection.execute(
                "SELECT * FROM patients WHERE id = ?", (identifier,)
            ).fetchone()
        except sqlite3.Error:
            row = None
        if row is None:
            try:
                row = connection.execute(
                    "SELECT * FROM patients WHERE mrn = ?", (identifier,)
                ).fetchone()
            except sqlite3.Error:
                row = None
    if row is not None:
        patient = _format_patient_row(row)
        if include_encounters and connection is not None and patient.get("patientId"):
            patient["encounters"] = list(
                _load_encounters_for_patient(connection, int(patient["patientId"]))
            )
        return patient

    if prefer_remote:
        return _fetch_remote_patient(identifier)
    remote = _fetch_remote_patient(identifier)
    if remote:
        return remote
    return None


def _load_encounters_for_patient(
    conn: sqlite3.Connection, patient_id: int
) -> Iterable[Dict[str, Any]]:
    cursor = conn.execute(
        """
        SELECT id, patient_id, date, type, provider, description
        FROM encounters
        WHERE patient_id = ?
        ORDER BY COALESCE(date, '') DESC, id DESC
        """,
        (patient_id,),
    )
    for row in cursor.fetchall():
        yield {
            "encounterId": row["id"],
            "patientId": row["patient_id"],
            "date": row["date"],
            "type": row["type"],
            "provider": row["provider"],
            "description": row["description"],
        }


def search_patients(
    query: str,
    *,
    conn: Optional[sqlite3.Connection] = None,
    limit: int = 25,
    offset: int = 0,
    fields: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    """Search for patients by multiple fields with pagination support."""

    connection = _resolve_connection(conn)
    fields = fields or ("first_name", "last_name", "mrn", "dob")
    like_terms: List[str] = []
    params: List[str] = []

    tokens = [token.strip() for token in query.split() if token.strip()]
    if tokens:
        for token in tokens:
            like = f"%{token}%"
            clauses = [f"LOWER({field}) LIKE LOWER(?)" for field in fields]
            clauses.append("LOWER(first_name || ' ' || last_name) LIKE LOWER(?)")
            like_terms.append("(" + " OR ".join(clauses) + ")")
            params.extend([like] * len(fields))
            params.append(like)
        where_clause = " WHERE " + " AND ".join(like_terms)
    else:
        where_clause = ""

    total = 0
    patients_local: List[Dict[str, Any]] = []
    if connection is not None:
        try:
            total = connection.execute(
                f"SELECT COUNT(*) FROM patients{where_clause}", params
            ).fetchone()[0]
            rows = connection.execute(
                """
                SELECT id, first_name, last_name, dob, mrn, gender, insurance, last_visit, allergies, medications
                FROM patients
            """
                + where_clause
                + " ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE, id LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()
        except sqlite3.Error:
            rows = []
        patients_local = [_format_patient_row(row) for row in rows]

    pagination = {
        "query": query,
        "limit": limit,
        "offset": offset,
        "returned": len(patients_local),
        "total": total,
        "hasMore": offset + len(patients_local) < total,
    }

    result: Dict[str, Any] = {"patients": patients_local, "pagination": pagination}

    remote_patients, remote_pagination = _fetch_remote_patients(
        query, limit=limit, offset=offset
    )
    if remote_patients:
        result["externalPatients"] = remote_patients
        if remote_pagination:
            result["externalPagination"] = dict(remote_pagination)

    return result


def get_encounter(
    encounter_id: int,
    *,
    conn: Optional[sqlite3.Connection] = None,
    include_patient: bool = True,
) -> Optional[Dict[str, Any]]:
    """Return encounter metadata along with patient context when available."""

    connection = _resolve_connection(conn)
    if connection is None:
        return None
    try:
        row = connection.execute(
            """
            SELECT
                e.id AS encounter_id,
                e.patient_id AS encounter_patient_id,
                e.date,
                e.type,
                e.provider,
                e.description,
                p.id AS patient_id,
                p.first_name,
                p.last_name,
                p.dob,
                p.mrn,
                p.gender,
                p.insurance,
                p.last_visit,
                p.allergies,
                p.medications
            FROM encounters e
            LEFT JOIN patients p ON e.patient_id = p.id
            WHERE e.id = ?
            """,
            (encounter_id,),
        ).fetchone()
    except sqlite3.Error:
        row = None

    if row is None:
        return None

    encounter = {
        "encounterId": row["encounter_id"],
        "patientId": row["encounter_patient_id"],
        "date": row["date"],
        "type": row["type"],
        "provider": row["provider"],
        "description": row["description"],
    }
    if include_patient and row["patient_id"] is not None:
        encounter["patient"] = _format_patient_row(row)
    return encounter


__all__ = [
    "configure_database",
    "get_patient",
    "search_patients",
    "get_encounter",
]

