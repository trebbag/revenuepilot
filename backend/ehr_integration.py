"""Lightweight FHIR client used by the EHR export endpoint.

This module provides a helper :func:`post_note_and_codes` which submits
clinical notes and associated billing codes to a FHIR server using a
transaction bundle.  The function intentionally performs only the minimal
request construction required for tests; it can be expanded later to cover
additional resource types or authentication mechanisms.
"""

from __future__ import annotations

import base64
import os
import time
from typing import Any, Dict, List, Optional, Sequence

import requests
import logging

FHIR_SERVER_URL = os.getenv("FHIR_SERVER_URL", "https://fhir.example.com")
TOKEN_URL = os.getenv("EHR_TOKEN_URL")
CLIENT_ID = os.getenv("EHR_CLIENT_ID")
CLIENT_SECRET = os.getenv("EHR_CLIENT_SECRET")

# Optional basic auth credentials and static bearer token.  These provide a
# fallback authentication mechanism when OAuth2 is not configured.
BASIC_AUTH_USER = os.getenv("EHR_BASIC_USER")
BASIC_AUTH_PASSWORD = os.getenv("EHR_BASIC_PASSWORD")
STATIC_BEARER_TOKEN = os.getenv("EHR_BEARER_TOKEN")

_token_cache: Dict[str, Any] = {"token": None, "expires_at": 0}


def get_ehr_token() -> Optional[str]:
    """Return an OAuth2 bearer token for the configured EHR server.

    The token is cached in-memory until shortly before expiry to avoid
    unnecessary requests.  If the required environment variables are not set,
    ``None`` is returned and no authentication header will be added.
    """

    if not (TOKEN_URL and CLIENT_ID and CLIENT_SECRET):
        return None

    now = time.time()
    if (
        _token_cache.get("token")
        and _token_cache.get("expires_at", 0) - 60 > now
    ):
        return _token_cache["token"]

    try:
        resp = requests.post(
            TOKEN_URL,
            data={"grant_type": "client_credentials"},
            auth=(CLIENT_ID, CLIENT_SECRET),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        token = data.get("access_token")
        expires = int(data.get("expires_in", 3600))
        _token_cache["token"] = token
        _token_cache["expires_at"] = now + expires
        return token
    except Exception:  # pragma: no cover - network issues
        logging.getLogger(__name__).exception("Token retrieval failed")
        _token_cache["token"] = None
        _token_cache["expires_at"] = 0
        return None


def _auth_headers() -> Dict[str, str]:
    """Return authorization headers for FHIR requests.

    ``get_ehr_token`` is attempted first (OAuth2).  If no token can be
    obtained, basic auth credentials or a static bearer token are used if
    available.
    """

    token = get_ehr_token()
    if token:
        return {"Authorization": f"Bearer {token}"}

    if STATIC_BEARER_TOKEN:
        return {"Authorization": f"Bearer {STATIC_BEARER_TOKEN}"}

    if BASIC_AUTH_USER and BASIC_AUTH_PASSWORD:
        basic = base64.b64encode(
            f"{BASIC_AUTH_USER}:{BASIC_AUTH_PASSWORD}".encode()
        ).decode()
        return {"Authorization": f"Basic {basic}"}

    return {}


def _build_bundle(
    note: str,
    codes: Sequence[str],
    patient_id: Optional[str] = None,
    encounter_id: Optional[str] = None,
    procedures: Sequence[str] | None = None,
    medications: Sequence[str] | None = None,
) -> Dict[str, Any]:
    """Return a FHIR transaction bundle for ``note`` and ``codes``.

    The bundle includes the note as both an ``Observation`` and a
    ``DocumentReference``.  Billing codes are represented in ``Condition``
    resources and combined into a single ``Claim``.
    """

    bundle: Dict[str, Any] = {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": [
            {
                "request": {"method": "POST", "url": "Observation"},
                "resource": {
                    "resourceType": "Observation",
                    "status": "final",
                    "code": {"text": "Clinical Note"},
                    "valueString": note,
                },
            }
        ],
    }

    for code in codes:
        bundle["entry"].append(
            {
                "request": {"method": "POST", "url": "Condition"},
                "resource": {
                    "resourceType": "Condition",
                    "code": {"coding": [{"code": code}]},
                },
            }
        )

    doc_resource: Dict[str, Any] = {
        "resourceType": "DocumentReference",
        "status": "current",
        "type": {"text": "Clinical Note"},
        "content": [
            {
                "attachment": {
                    "contentType": "text/plain",
                    "data": base64.b64encode(note.encode()).decode(),
                }
            }
        ],
    }
    if patient_id:
        doc_resource["subject"] = {"reference": f"Patient/{patient_id}"}
    if encounter_id:
        doc_resource["context"] = {"encounter": [{"reference": f"Encounter/{encounter_id}"}]}
    bundle["entry"].append(
        {"request": {"method": "POST", "url": "DocumentReference"}, "resource": doc_resource}
    )

    claim_resource: Dict[str, Any] = {
        "resourceType": "Claim",
        "status": "active",
        "type": {"text": "professional"},
        "item": [
            {
                "sequence": idx + 1,
                "productOrService": {"coding": [{"code": code}]},
            }
            for idx, code in enumerate(codes)
        ],
    }
    if patient_id:
        claim_resource["patient"] = {"reference": f"Patient/{patient_id}"}
    if encounter_id:
        claim_resource["encounter"] = [{"reference": f"Encounter/{encounter_id}"}]

    bundle["entry"].append(
        {"request": {"method": "POST", "url": "Claim"}, "resource": claim_resource}
    )

    # Optional additional resources
    for code in procedures or []:
        bundle["entry"].append(
            {
                "request": {"method": "POST", "url": "Procedure"},
                "resource": {
                    "resourceType": "Procedure",
                    "status": "completed",
                    "code": {"coding": [{"code": code}]},
                },
            }
        )

    for code in medications or []:
        bundle["entry"].append(
            {
                "request": {"method": "POST", "url": "MedicationStatement"},
                "resource": {
                    "resourceType": "MedicationStatement",
                    "status": "completed",
                    "medicationCodeableConcept": {
                        "coding": [{"code": code}]
                    },
                },
            }
        )

    return bundle


def post_note_and_codes(
    note: str,
    codes: Sequence[str],
    patient_id: Optional[str] = None,
    encounter_id: Optional[str] = None,
    procedures: Sequence[str] | None = None,
    medications: Sequence[str] | None = None,
) -> Dict[str, Any]:
    """Send ``note`` and associated data to the configured FHIR server."""

    url = f"{FHIR_SERVER_URL.rstrip('/')}/Bundle"
    payload = _build_bundle(
        note, codes, patient_id, encounter_id, procedures, medications
    )
    headers = _auth_headers()

    resp = requests.post(url, json=payload, headers=headers or None, timeout=10)

    if resp.status_code in {401, 403}:
        return {"status": "auth_error", "detail": resp.text}
    if not resp.ok:
        return {"status": "error", "detail": resp.text}

    data = resp.json()
    if isinstance(data, dict):
        data = {**data}
    return {"status": "exported", **data}


__all__ = ["post_note_and_codes", "get_ehr_token"]
