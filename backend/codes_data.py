from __future__ import annotations

"""Cached code metadata and reimbursement information.

This module provides lightweight in-memory tables for common CPT,
ICD-10 and HCPCS codes used throughout the tests.  In a real system
this data would likely come from an external database or reference
files.  For the purposes of the demo API we keep a very small subset of
codes with the fields needed by the frontend.
"""

from functools import lru_cache
from typing import Dict, Any, List, Tuple

# ---------------------------------------------------------------------------
# Code metadata
# ---------------------------------------------------------------------------

_CPT: Dict[str, Dict[str, Any]] = {
    "99213": {
        "type": "CPT",
        "category": "codes",
        "description": "Office or other outpatient visit for the evaluation and management of an established patient",
        "rvu": 1.29,
        "reimbursement": 75.32,
    },
    "99214": {
        "type": "CPT",
        "category": "codes",
        "description": "Office or other outpatient visit for the evaluation and management of an established patient, 25 minutes",
        "rvu": 1.92,
        "reimbursement": 109.46,
    },
}

_ICD10: Dict[str, Dict[str, Any]] = {
    "E11.9": {
        "type": "ICD-10",
        "category": "diagnoses",
        "description": "Type 2 diabetes mellitus without complications",
        "rvu": 0.0,
        "reimbursement": 0.0,
    },
    "I10": {
        "type": "ICD-10",
        "category": "diagnoses",
        "description": "Essential (primary) hypertension",
        "rvu": 0.0,
        "reimbursement": 0.0,
    },
}

_HCPCS: Dict[str, Dict[str, Any]] = {
    "J3490": {
        "type": "HCPCS",
        "category": "codes",
        "description": "Unclassified drugs",
        "rvu": 0.0,
        "reimbursement": 10.00,
    }
}

@lru_cache()
def load_code_metadata() -> Dict[str, Dict[str, Any]]:
    """Return a combined mapping of code -> metadata.

    ``lru_cache`` keeps this dictionary in memory for the life of the
    process which is sufficient for the small demo dataset.  Real
    implementations could load from a database or external service and
    refresh periodically.
    """

    data = {}
    data.update(_CPT)
    data.update(_ICD10)
    data.update(_HCPCS)
    return data

# ---------------------------------------------------------------------------
# Code conflicts
# ---------------------------------------------------------------------------

# Simple conflict table used by validation.  Each tuple represents a
# mutually exclusive combination along with a short reason.
_CONFLICTS: List[Tuple[str, str, str]] = [
    ("99213", "99214", "Evaluation and management visit levels cannot be billed together"),
]

@lru_cache()
def load_conflicts() -> List[Tuple[str, str, str]]:
    return _CONFLICTS

