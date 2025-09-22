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
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple
from urllib.parse import urljoin

import requests

from sqlalchemy import and_, func, literal, or_, select
from sqlalchemy.orm import Session


def configure_database(_conn) -> None:
    """Compatibility shim retained for legacy database initialisers."""

    return None

from backend import models as sa_models

from backend.time_utils import ensure_utc, from_epoch_seconds


logger = logging.getLogger(__name__)

EHR_PATIENT_API_URL = os.getenv("EHR_PATIENT_API_URL")
EHR_PATIENT_SEARCH_ENDPOINT = os.getenv("EHR_PATIENT_SEARCH_ENDPOINT", "/patients/search")
EHR_PATIENT_DETAIL_ENDPOINT = os.getenv("EHR_PATIENT_DETAIL_ENDPOINT", "/patients/{patientId}")
EHR_PATIENT_TIMEOUT = float(os.getenv("EHR_PATIENT_TIMEOUT", "5"))
EHR_PATIENT_API_KEY = os.getenv("EHR_PATIENT_API_KEY")
EHR_PATIENT_AUTH_HEADER = os.getenv("EHR_PATIENT_AUTH_HEADER", "Authorization")


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


def _normalise_timestamp(value: Any) -> Any:
    """Return ISO 8601 text for epoch ``value`` when possible."""

    dt = from_epoch_seconds(value)
    if dt is None:
        return value
    dt_utc = ensure_utc(dt).replace(microsecond=0)
    text = dt_utc.isoformat()
    if text.endswith("+00:00"):
        return text[:-6] + "Z"
    return text


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


def _row_to_mapping(row: Mapping[str, Any] | Any) -> Mapping[str, Any]:
    if isinstance(row, Mapping):
        return row
    keys = (
        "id",
        "patient_id",
        "first_name",
        "last_name",
        "dob",
        "mrn",
        "gender",
        "insurance",
        "last_visit",
        "allergies",
        "medications",
    )
    return {key: getattr(row, key, None) for key in keys}


def _format_patient_row(row: Mapping[str, Any] | Any) -> Dict[str, Any]:
    """Normalise a patient row from SQLite into the API response format."""

    data = dict(_row_to_mapping(row))
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
        "lastVisit": _normalise_timestamp(data.get("last_visit")),
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
        "lastVisit": _normalise_timestamp(
            data.get("lastVisit") or data.get("last_visit")
        ),
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
    session: Session,
    patient_id: str | int,
    *,
    include_encounters: bool = True,
    prefer_remote: bool = False,
) -> Optional[Dict[str, Any]]:
    """Return a patient record from the local dataset or EHR."""

    identifier = str(patient_id)
    patient_row: Optional[Mapping[str, Any]] = None
    try:
        patient_pk = int(identifier)
    except (TypeError, ValueError):
        patient_pk = None

    if patient_pk is not None:
        patient_row = (
            session.execute(
                select(sa_models.patients).where(sa_models.patients.c.id == patient_pk)
            )
            .mappings()
            .first()
        )

    if patient_row is None:
        patient_row = (
            session.execute(
                select(sa_models.patients).where(sa_models.patients.c.mrn == identifier)
            )
            .mappings()
            .first()
        )

    if patient_row is not None:
        patient = _format_patient_row(patient_row)
        patient_pk_value = patient_row.get("id")
        if include_encounters and patient_pk_value is not None:
            patient["encounters"] = list(
                _load_encounters_for_patient(session, int(patient_pk_value))
            )
        return patient

    if prefer_remote:
        return _fetch_remote_patient(identifier)
    remote = _fetch_remote_patient(identifier)
    if remote:
        return remote
    return None


def _load_encounters_for_patient(
    session: Session, patient_id: int
) -> Iterable[Dict[str, Any]]:
    stmt = (
        select(
            sa_models.encounters.c.id,
            sa_models.encounters.c.patient_id,
            sa_models.encounters.c.date,
            sa_models.encounters.c.type,
            sa_models.encounters.c.provider,
            sa_models.encounters.c.description,
        )
        .where(sa_models.encounters.c.patient_id == patient_id)
        .order_by(
            func.coalesce(sa_models.encounters.c.date, "").desc(),
            sa_models.encounters.c.id.desc(),
        )
    )
    for row in session.execute(stmt).mappings():
        yield {
            "encounterId": row["id"],
            "patientId": row["patient_id"],
            "date": row["date"],
            "type": row["type"],
            "provider": row["provider"],
            "description": row["description"],
        }


def search_patients(
    session: Session,
    query: str,
    *,
    limit: int = 25,
    offset: int = 0,
    fields: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    """Search for patients by multiple fields with pagination support."""

    fields = fields or ("first_name", "last_name", "mrn", "dob")
    tokens = [token.strip() for token in query.split() if token.strip()]

    filters = []
    if tokens:
        full_name_expr = func.lower(
            func.coalesce(sa_models.patients.c.first_name, "").op("||")(literal(" ")).op("||")(
                func.coalesce(sa_models.patients.c.last_name, "")
            )
        )
        for token in tokens:
            like = f"%{token.lower()}%"
            clauses = []
            for field in fields:
                column = getattr(sa_models.patients.c, field, None)
                if column is None:
                    continue
                clauses.append(
                    func.lower(func.coalesce(column, "")).like(like)
                )
            clauses.append(full_name_expr.like(like))
            if clauses:
                filters.append(or_(*clauses))

    stmt = select(sa_models.patients)
    count_stmt = select(func.count()).select_from(sa_models.patients)
    if filters:
        condition = and_(*filters)
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)

    stmt = stmt.order_by(
        sa_models.patients.c.first_name.collate("NOCASE"),
        sa_models.patients.c.last_name.collate("NOCASE"),
        sa_models.patients.c.id,
    ).limit(limit).offset(offset)

    total = int(session.execute(count_stmt).scalar_one())
    rows = session.execute(stmt).mappings().all()
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
    session: Session,
    encounter_id: int,
    *,
    include_patient: bool = True,
) -> Optional[Dict[str, Any]]:
    """Return encounter metadata along with patient context when available."""

    stmt = (
        select(
            sa_models.encounters.c.id.label("encounter_id"),
            sa_models.encounters.c.patient_id.label("encounter_patient_id"),
            sa_models.encounters.c.date,
            sa_models.encounters.c.type,
            sa_models.encounters.c.provider,
            sa_models.encounters.c.description,
            sa_models.patients.c.id.label("patient_id"),
            sa_models.patients.c.first_name,
            sa_models.patients.c.last_name,
            sa_models.patients.c.dob,
            sa_models.patients.c.mrn,
            sa_models.patients.c.gender,
            sa_models.patients.c.insurance,
            sa_models.patients.c.last_visit,
            sa_models.patients.c.allergies,
            sa_models.patients.c.medications,
        )
        .select_from(
            sa_models.encounters.outerjoin(
                sa_models.patients,
                sa_models.encounters.c.patient_id == sa_models.patients.c.id,
            )
        )
        .where(sa_models.encounters.c.id == encounter_id)
    )
    row = session.execute(stmt).mappings().first()

    if row is None:
        return None

    encounter = {
        "encounterId": row["encounter_id"],
        "patientId": row["encounter_patient_id"],
        "date": _normalise_timestamp(row["date"]),
        "type": row["type"],
        "provider": row["provider"],
        "description": row["description"],
    }
    if include_patient and row["patient_id"] is not None:
        encounter["patient"] = _format_patient_row(row)
    return encounter


__all__ = [
    "get_patient",
    "search_patients",
    "get_encounter",
]

