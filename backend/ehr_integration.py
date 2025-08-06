"""Lightweight FHIR client used by the EHR export endpoint.

This module provides a helper :func:`post_note_and_codes` which submits
clinical notes and associated billing codes to a FHIR server using a
transaction bundle.  The function intentionally performs only the minimal
request construction required for tests; it can be expanded later to cover
additional resource types or authentication mechanisms.
"""

from __future__ import annotations

import os
from typing import List, Dict, Any

import requests

FHIR_SERVER_URL = os.getenv("FHIR_SERVER_URL", "https://fhir.example.com")


def _build_bundle(note: str, codes: List[str]) -> Dict[str, Any]:
    """Return a FHIR transaction bundle for ``note`` and ``codes``.

    ``note`` is wrapped in an ``Observation`` resource while each code is
    represented as a ``Condition`` with a single coding entry.  The bundle is
    intentionally simple and omits many optional fields so the tests can focus
    on verifying the HTTP interaction rather than full FHIR compliance.
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
    return bundle


def post_note_and_codes(note: str, codes: List[str]) -> Dict[str, Any]:
    """Send ``note`` and ``codes`` to the configured FHIR server.

    A transaction bundle is POSTed to ``FHIR_SERVER_URL`` (or the value of the
    environment variable of the same name).  The server's JSON response is
    returned.  ``requests`` exceptions are allowed to propagate so callers can
    surface an appropriate error to clients.
    """

    url = f"{FHIR_SERVER_URL.rstrip('/')}/Bundle"
    payload = _build_bundle(note, codes)
    resp = requests.post(url, json=payload, timeout=10)

    # Many FHIR servers require authentication and will reply with a
    # 401/403 status when credentials are missing or invalid.  Instead of
    # raising an exception we report the condition to the caller so the
    # API endpoint can surface a helpful message to the frontend.
    if resp.status_code in {401, 403}:
        return {"status": "auth_error"}

    resp.raise_for_status()

    # The server's JSON response is included alongside a success status so
    # callers can inspect any returned identifiers if desired.
    data = resp.json()
    if isinstance(data, dict):
        data = {**data}
    return {"status": "exported", **data}


__all__ = ["post_note_and_codes"]
