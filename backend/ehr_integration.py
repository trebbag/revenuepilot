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
import re
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


def _classify_code(code: str) -> dict:
    """Return metadata for a clinical code.

    Heuristics (can be replaced with terminology service later):
      * LOINC: digits-digits pattern (e.g. 1234-5) -> Observation
      * CPT: 5 digits OR one letter + 4 digits (e.g. 99213, A1234) -> Procedure
      * ICD-10: Letter + 2 alphanumerics optionally followed by . + up to 4 (e.g. M16.5) -> Condition
      * Medication (MED* or RX* prefix) -> MedicationStatement
      * Vital prefixes (BP, HR, TEMP) -> Observation
      * OBS* prefix -> Observation
      * Fallback -> Condition
    Returns dict with: {resourceType, system (optional), display}
    """
    c = code.upper()
    # LOINC
    if re.fullmatch(r"\d{1,5}-\d{1,4}", c):
        return {"resourceType": "Observation", "system": "http://loinc.org", "display": code}
    # CPT
    if re.fullmatch(r"\d{5}", c) or re.fullmatch(r"[A-Z]\d{4}", c):
        return {"resourceType": "Procedure", "system": "http://www.ama-assn.org/go/cpt", "display": code}
    # ICD-10 (very loose)
    if re.fullmatch(r"[A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?", c):
        return {"resourceType": "Condition", "system": "http://hl7.org/fhir/sid/icd-10-cm", "display": code}
    # Medication heuristics
    if c.startswith("MED") or c.startswith("RX"):
        return {"resourceType": "MedicationStatement", "system": "http://www.nlm.nih.gov/research/umls/rxnorm", "display": code}
    # Vital / observation prefixes
    if c.startswith("OBS") or any(c.startswith(p) for p in ("BP", "HR", "TEMP")):
        return {"resourceType": "Observation", "display": code}
    return {"resourceType": "Condition", "display": code}


def _infer_resource_for_code(code: str) -> str:  # backward compat wrapper
    return _classify_code(code)["resourceType"]


def _code_resource(code: str) -> Dict[str, Any]:
    meta = _classify_code(code)
    rtype = meta["resourceType"]
    system = meta.get("system")
    coding: Dict[str, Any] = {"code": code}
    if system:
        coding["system"] = system
    if rtype == "MedicationStatement":
        return {
            "request": {"method": "POST", "url": rtype},
            "resource": {
                "resourceType": rtype,
                "status": "completed",
                "medicationCodeableConcept": {"coding": [coding], "text": meta.get("display", code)},
            },
        }
    if rtype == "Procedure":
        return {
            "request": {"method": "POST", "url": rtype},
            "resource": {
                "resourceType": rtype,
                "status": "completed",
                "code": {"coding": [coding], "text": meta.get("display", code)},
            },
        }
    if rtype == "Observation":
        return {
            "request": {"method": "POST", "url": rtype},
            "resource": {
                "resourceType": rtype,
                "status": "final",
                "code": {"coding": [coding], "text": meta.get("display", code)},
                "valueString": code,
            },
        }
    # Condition fallback
    return {
        "request": {"method": "POST", "url": "Condition"},
        "resource": {
            "resourceType": "Condition",
            "code": {"coding": [coding], "text": meta.get("display", code)},
        },
    }


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

    # Add resources inferred from codes
    for code in codes:
        bundle["entry"].append(_code_resource(code))

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

    # Build Claim using only billing-relevant codes (Conditions + Procedures)
    billing_codes = [c for c in codes]
    claim_resource: Dict[str, Any] = {
        "resourceType": "Claim",
        "status": "active",
        "type": {"text": "professional"},
        "item": [
            {
                "sequence": idx + 1,
                "productOrService": {"coding": [{"code": code}]},
            }
            for idx, code in enumerate(billing_codes)
        ],
    }
    if patient_id:
        claim_resource["patient"] = {"reference": f"Patient/{patient_id}"}
    if encounter_id:
        claim_resource["encounter"] = [{"reference": f"Encounter/{encounter_id}"}]

    bundle["entry"].append(
        {"request": {"method": "POST", "url": "Claim"}, "resource": claim_resource}
    )

    # Optional additional resources from explicit procedure/medication lists
    # (retain previous behaviour so API remains backwards compatible)
    for code in procedures or []:
        # Skip if already added via inference
        if not any(
            e["resource"].get("resourceType") == "Procedure" and code in str(e)
            for e in bundle["entry"]
        ):
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
        if not any(
            e["resource"].get("resourceType") == "MedicationStatement" and code in str(e)
            for e in bundle["entry"]
        ):
            bundle["entry"].append(
                {
                    "request": {"method": "POST", "url": "MedicationStatement"},
                    "resource": {
                        "resourceType": "MedicationStatement",
                        "status": "completed",
                        "medicationCodeableConcept": {"coding": [{"code": code}]},
                    },
                }
            )

    # Add a Composition that references created entries (logical only)
    comp_entries = []
    for idx, entry in enumerate(bundle["entry"], start=1):
        r = entry.get("resource", {})
        rtype = r.get("resourceType")
        if rtype in {"Observation", "DocumentReference", "Condition", "Procedure", "MedicationStatement"}:
            comp_entries.append({"reference": f"urn:uuid:entry-{idx}", "display": rtype})
            # Add fullUrl so references resolve inside bundle
            entry.setdefault("fullUrl", f"urn:uuid:entry-{idx}")
    composition = {
        "request": {"method": "POST", "url": "Composition"},
        "resource": {
            "resourceType": "Composition",
            "status": "final",
            "type": {"text": "Clinical Note Composition"},
            "title": "Clinical Note Export",
            "section": [
                {"title": e.get("display"), "entry": [e]} for e in comp_entries
            ],
        },
    }
    if patient_id:
        composition["resource"]["subject"] = {"reference": f"Patient/{patient_id}"}
    bundle["entry"].insert(0, composition)

    return bundle


def post_note_and_codes(
    note: str,
    codes: Sequence[str],
    patient_id: Optional[str] = None,
    encounter_id: Optional[str] = None,
    procedures: Sequence[str] | None = None,
    medications: Sequence[str] | None = None,
) -> Dict[str, Any]:
    """Send ``note`` and associated data to the configured FHIR server.

    If the FHIR server URL is not configured (empty or points to the default
    example domain), the bundle is returned without attempting a network call
    so the frontend can offer a manual download.
    """

    payload = _build_bundle(
        note, codes, patient_id, encounter_id, procedures, medications
    )

    # Treat unset or example placeholder as not configured
    if not FHIR_SERVER_URL or "example.com" in FHIR_SERVER_URL:
        return {"status": "bundle", "bundle": payload}

    url = f"{FHIR_SERVER_URL.rstrip('/')}/Bundle"
    headers = _auth_headers()

    resp = requests.post(url, json=payload, headers=headers or None, timeout=10)

    if resp.status_code in {401, 403}:
        return {"status": "auth_error", "detail": resp.text, "bundle": payload}
    if not resp.ok:
        return {"status": "error", "detail": resp.text, "bundle": payload}

    data = resp.json()
    if isinstance(data, dict):
        data = {**data}
    return {"status": "exported", "response": data, "bundle": payload}


__all__ = ["post_note_and_codes", "get_ehr_token"]
