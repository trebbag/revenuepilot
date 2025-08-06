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
from typing import Any, Dict, List, Optional

import requests

FHIR_SERVER_URL = os.getenv("FHIR_SERVER_URL", "https://fhir.example.com")
TOKEN_URL = os.getenv("EHR_TOKEN_URL")
CLIENT_ID = os.getenv("EHR_CLIENT_ID")
CLIENT_SECRET = os.getenv("EHR_CLIENT_SECRET")

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

    resp = requests.post(
        TOKEN_URL,
        data={"grant_type": "client_credentials"},
        auth=(CLIENT_ID, CLIENT_SECRET),
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    token = data.get("access_token")
    expires = data.get("expires_in", 3600)
    _token_cache["token"] = token
    _token_cache["expires_at"] = now + int(expires)
    return token


def _build_bundle(
    note: str,
    codes: List[str],
    patient_id: Optional[str] = None,
    encounter_id: Optional[str] = None,
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

    return bundle


def post_note_and_codes(
    note: str,
    codes: List[str],
    patient_id: Optional[str] = None,
    encounter_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Send ``note`` and ``codes`` to the configured FHIR server."""

    url = f"{FHIR_SERVER_URL.rstrip('/')}/Bundle"
    payload = _build_bundle(note, codes, patient_id, encounter_id)
    headers: Dict[str, str] = {}
    token = get_ehr_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    resp = requests.post(url, json=payload, headers=headers or None, timeout=10)

    if resp.status_code in {401, 403}:
        return {"status": "auth_error"}

    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict):
        data = {**data}
    return {"status": "exported", **data}


__all__ = ["post_note_and_codes", "get_ehr_token"]
