from __future__ import annotations

"""Simple in-memory patient store used by API endpoints.

This module exposes a ``get_patient`` helper returning mock patient
records.  In a real deployment this would query an EHR system or
external service.  The lightweight store keeps data deterministic for
unit tests and examples.
"""

from typing import Dict, Optional

# Minimal static patient records for demonstration and tests.
_PATIENTS: Dict[str, Dict[str, object]] = {
    "1": {
        "patientId": "1",
        "name": "Jane Doe",
        "age": 29,
        "gender": "female",
        "insurance": "Acme Health",
        "lastVisit": "2024-05-01",
        "allergies": ["penicillin"],
        "medications": ["ibuprofen"],
    },
    "2": {
        "patientId": "2",
        "name": "John Smith",
        "age": 41,
        "gender": "male",
        "insurance": "Universal Care",
        "lastVisit": "2024-04-15",
        "allergies": [],
        "medications": ["lisinopril"],
    },
}


def get_patient(patient_id: str) -> Optional[Dict[str, object]]:
    """Return a patient record if available."""

    return _PATIENTS.get(str(patient_id))
