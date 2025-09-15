from __future__ import annotations

"""Static code tables and validation helpers for medical coding."""

from datetime import date
import re
from typing import Dict, List, Tuple

# Example CPT and ICD-10 tables. In a production system these would be loaded
# from an external database and kept up to date via scheduled jobs. The small
# subset here is sufficient for unit tests and demo purposes.

CPT_CODES: Dict[str, dict] = {
    "99213": {
        "description": "Office or other outpatient visit, established patient",
        "rvu": 1.0,
        "reimbursement": 75.0,
        "documentation": {
            "required": ["history", "exam", "medical decision making"],
            "recommended": ["review of systems"],
            "timeRequirements": "15 minutes",  # typical time
            "examples": ["Stable chronic illness follow up"],
        },
        # CPT to ICD-10 medical necessity mapping via allowed ICD-10 prefixes
        "icd10_prefixes": ["E11", "I10", "J06"],
    },
    "99214": {
        "description": "Office or other outpatient visit, established patient",
        "rvu": 1.5,
        "reimbursement": 110.0,
        "documentation": {
            "required": ["history", "exam", "medical decision making"],
            "recommended": ["review of systems", "counseling"],
            "timeRequirements": "25 minutes",
            "examples": ["Two or more stable chronic illnesses"],
        },
        "icd10_prefixes": ["E11", "I10"],
    },
}

ICD10_CODES: Dict[str, dict] = {
    "E11.9": {
        "description": "Type 2 diabetes mellitus without complications",
        "clinicalContext": "Diabetes management",
        "contraindications": [],
        "documentation": {
            "required": ["diagnosis noted"],
            "recommended": ["A1c level"],
            "examples": ["Type 2 diabetes without complications"],
        },
    },
    "I10": {
        "description": "Essential (primary) hypertension",
        "clinicalContext": "Hypertension management",
        "contraindications": [],
        "documentation": {
            "required": ["blood pressure documented"],
            "recommended": ["medication list"],
            "examples": ["Blood pressure 150/90"],
        },
    },
    "J06.9": {
        "description": "Acute upper respiratory infection, unspecified",
        "clinicalContext": "URI",
        "contraindications": [],
        "documentation": {
            "required": ["symptoms noted"],
            "recommended": ["vital signs"],
            "examples": ["Cough and congestion"],
        },
    },
}

# Update schedule metadata; a real implementation would dynamically update these.
CODE_UPDATE_SCHEDULE = {
    "cpt": {"updated": date(2024, 1, 1), "next_update": date(2025, 1, 1)},
    "icd10": {"updated": date(2023, 10, 1), "next_update": date(2024, 10, 1)},
}

CPT_PATTERN = re.compile(r"^\d{5}$")
ICD10_PATTERN = re.compile(r"^[A-Z]\d{2}(?:\.\d{1,3})?$")


def validate_cpt(code: str) -> dict:
    """Validate a CPT code against pattern and table."""
    code = code.strip().upper()
    if not CPT_PATTERN.fullmatch(code):
        return {"valid": False, "reason": "pattern"}
    info = CPT_CODES.get(code)
    if not info:
        return {"valid": False, "reason": "unknown"}
    return {
        "valid": True,
        "description": info["description"],
        "rvu": info["rvu"],
        "reimbursement": info["reimbursement"],
        "requirements": info["documentation"]["required"],
    }


def validate_icd10(code: str) -> dict:
    """Validate an ICD-10 code."""
    code = code.strip().upper()
    if not ICD10_PATTERN.fullmatch(code):
        return {"valid": False, "reason": "pattern"}
    info = ICD10_CODES.get(code)
    if not info:
        return {"valid": False, "reason": "unknown"}
    return {
        "valid": True,
        "description": info["description"],
        "clinicalContext": info["clinicalContext"],
        "contraindications": info["contraindications"],
    }


def validate_combination(cpt_codes: List[str], icd10_codes: List[str]) -> dict:
    """Validate CPT/ICD-10 combinations for medical necessity."""
    conflicts: List[dict] = []
    for cpt in cpt_codes:
        info = CPT_CODES.get(cpt)
        if not info:
            conflicts.append({"code1": cpt, "code2": "", "reason": "unknown CPT"})
            continue
        prefixes = info.get("icd10_prefixes", [])
        if prefixes and not any(any(code.startswith(p) for p in prefixes) for code in icd10_codes):
            conflicts.append(
                {
                    "code1": cpt,
                    "code2": ",".join(icd10_codes) if icd10_codes else "",
                    "reason": "medical necessity not met",
                }
            )
    return {"validCombinations": not conflicts, "conflicts": conflicts, "warnings": []}


def calculate_billing(cpt_codes: List[str], payer_type: str = "commercial", location: str | None = None) -> dict:
    """Calculate estimated reimbursement for CPT codes."""
    multiplier = 0.8 if payer_type and payer_type.lower() == "medicare" else 1.0
    breakdown: Dict[str, float] = {}
    total = 0.0
    for code in cpt_codes:
        info = CPT_CODES.get(code)
        if not info:
            continue
        amt = info["reimbursement"] * multiplier
        breakdown[code] = round(amt, 2)
        total += amt
    return {
        "totalEstimated": round(total, 2),
        "breakdown": breakdown,
        "payerSpecific": {"payerType": payer_type, "location": location},
    }


def get_documentation(code: str) -> dict:
    """Return documentation requirements for a code."""
    code = code.strip().upper()
    info = CPT_CODES.get(code) or ICD10_CODES.get(code)
    if not info:
        return {"code": code, "required": [], "recommended": [], "examples": []}
    doc = info.get("documentation", {})
    return {"code": code, **doc}
