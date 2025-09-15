from __future__ import annotations

"""Static code tables and validation helpers for medical coding."""

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import re
from typing import Dict, Iterable, List, Optional, Tuple

# Example CPT, HCPCS and ICD-10 tables. In a production system these would be
# loaded from an external database and kept up to date via scheduled jobs. The
# small subset here is sufficient for unit tests and demo purposes.

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
        "demographics": {"minAge": 18, "allowedGenders": ["male", "female"]},
        "encounterTypes": ["office", "outpatient"],
        "specialties": ["family medicine", "internal medicine", "primary care"],
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
        "demographics": {"minAge": 18, "allowedGenders": ["male", "female"]},
        "encounterTypes": ["office", "outpatient"],
        "specialties": ["family medicine", "internal medicine", "primary care"],
    },
    "59400": {
        "description": "Routine obstetric care including antepartum care, vaginal delivery and postpartum care",
        "rvu": 4.5,
        "reimbursement": 250.0,
        "documentation": {
            "required": ["antepartum visits", "delivery note", "postpartum follow up"],
            "recommended": ["fetal monitoring", "patient counseling"],
            "timeRequirements": "Global obstetric package",
            "examples": ["Routine obstetric care"],
        },
        "icd10_prefixes": ["O09", "O80"],
        "demographics": {"minAge": 12, "maxAge": 55, "allowedGenders": ["female"]},
        "encounterTypes": ["outpatient", "inpatient"],
        "specialties": ["obstetrics", "obgyn"],
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
        "demographics": {"minAge": 18, "allowedGenders": ["male", "female"]},
        "encounterTypes": ["office", "outpatient", "inpatient"],
        "specialties": ["endocrinology", "primary care", "family medicine"],
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
        "demographics": {"minAge": 18, "allowedGenders": ["any"]},
        "encounterTypes": ["office", "inpatient"],
        "specialties": ["cardiology", "primary care"],
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
        "demographics": {"minAge": 0, "allowedGenders": ["any"]},
        "encounterTypes": ["office", "telehealth", "urgent care"],
        "specialties": ["primary care", "pediatrics", "urgent care"],
    },
    "O09.90": {
        "description": "Supervision of high risk pregnancy, unspecified, unspecified trimester",
        "clinicalContext": "High risk pregnancy",
        "contraindications": [],
        "documentation": {
            "required": ["gestational age", "risk factors documented"],
            "recommended": ["fetal assessment"],
            "examples": ["High risk pregnancy supervision"],
        },
        "demographics": {"minAge": 12, "maxAge": 55, "allowedGenders": ["female"]},
        "encounterTypes": ["outpatient", "inpatient"],
        "specialties": ["obstetrics", "maternal-fetal medicine"],
    },
}

HCPCS_CODES: Dict[str, dict] = {
    "J3490": {
        "description": "Unclassified drugs",
        "reimbursement": 10.0,
        "coverage": {
            "status": "requires documentation",
            "notes": "Submit invoice and drug details with claim.",
        },
        "documentation": {
            "required": ["drug name", "dosage administered", "route"],
            "recommended": ["NDC number", "invoice attached"],
            "examples": ["Use when no specific HCPCS code exists for drug"],
        },
        "demographics": {"allowedGenders": ["any"]},
        "encounterTypes": ["outpatient", "office", "infusion center"],
        "specialties": ["any"],
    },
    "G0008": {
        "description": "Administration of influenza virus vaccine",
        "reimbursement": 25.0,
        "coverage": {
            "status": "covered",
            "notes": "Medicare covers one influenza vaccine per season.",
        },
        "documentation": {
            "required": ["vaccine lot", "site administered"],
            "recommended": ["vaccine manufacturer", "informed consent"],
            "examples": ["Annual influenza immunization"]
        },
        "demographics": {"minAge": 5, "allowedGenders": ["any"]},
        "encounterTypes": ["outpatient", "office", "home health"],
        "specialties": [
            "primary care",
            "internal medicine",
            "family medicine",
            "geriatrics",
        ],
    },
}


def _normalize_value(value: str) -> str:
    return value.strip().lower()


def _normalize_gender(value: str) -> str:
    base = _normalize_value(value)
    return {
        "f": "female",
        "female": "female",
        "woman": "female",
        "w": "female",
        "m": "male",
        "male": "male",
        "man": "male",
        "nb": "nonbinary",
    }.get(base, base)


def _format_allowed(values: Iterable[str]) -> str:
    normalized = {value.strip() for value in values if value}
    return ", ".join(sorted(value for value in normalized if value))


def _collect_context_issues(
    info: dict,
    code: str,
    *,
    age: Optional[int] = None,
    gender: Optional[str] = None,
    encounter_type: Optional[str] = None,
    specialty: Optional[str] = None,
) -> List[str]:
    """Return human readable context validation issues for a code."""

    issues: List[str] = []
    demographics = info.get("demographics") or {}

    if age is not None and demographics:
        min_age = demographics.get("minAge")
        max_age = demographics.get("maxAge")
        if min_age is not None and age < min_age:
            issues.append(
                f"Patient age {age} is below the supported minimum age {min_age} for code {code}."
            )
        if max_age is not None and age > max_age:
            issues.append(
                f"Patient age {age} exceeds the supported maximum age {max_age} for code {code}."
            )

    if gender and demographics:
        allowed_genders = demographics.get("allowedGenders") or []
        normalized_allowed = {_normalize_gender(item) for item in allowed_genders}
        normalized_gender = _normalize_gender(gender)
        if (
            normalized_allowed
            and "any" not in normalized_allowed
            and normalized_gender not in normalized_allowed
        ):
            allowed_display = _format_allowed(allowed_genders)
            issues.append(
                f"Patient gender '{gender}' is incompatible with code {code}. Allowed: {allowed_display}."
            )

    if encounter_type:
        allowed_encounters = info.get("encounterTypes") or []
        normalized_allowed_encounters = {
            _normalize_value(item) for item in allowed_encounters
        }
        normalized_encounter = _normalize_value(encounter_type)
        if (
            normalized_allowed_encounters
            and "any" not in normalized_allowed_encounters
            and normalized_encounter not in normalized_allowed_encounters
        ):
            allowed_display = _format_allowed(allowed_encounters)
            issues.append(
                f"Encounter type '{encounter_type}' is not supported for code {code}. Allowed: {allowed_display}."
            )

    if specialty:
        allowed_specialties = info.get("specialties") or []
        normalized_allowed_specialties = {
            _normalize_value(item) for item in allowed_specialties
        }
        normalized_specialty = _normalize_value(specialty)
        if (
            normalized_allowed_specialties
            and "any" not in normalized_allowed_specialties
            and normalized_specialty not in normalized_allowed_specialties
        ):
            allowed_display = _format_allowed(allowed_specialties)
            issues.append(
                f"Specialty '{specialty}' is not permitted for code {code}. Allowed: {allowed_display}."
            )

    return issues


def _format_currency(value: Decimal) -> str:
    return f"${value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)}"

# Update schedule metadata; a real implementation would dynamically update these.
CACHE_DATE = date(2024, 1, 1)
CODE_UPDATE_SCHEDULE = {
    "cpt": {"updated": CACHE_DATE, "next_update": date(2025, 1, 1)},
    "hcpcs": {"updated": CACHE_DATE, "next_update": date(2025, 1, 1)},
    "icd10": {"updated": date(2023, 10, 1), "next_update": date(2024, 10, 1)},
}

CPT_PATTERN = re.compile(r"^\d{5}$")
ICD10_PATTERN = re.compile(r"^[A-Z]\d{2}(?:\.\d{1,3})?$")
HCPCS_PATTERN = re.compile(r"^[A-Z]\d{4}$")


def validate_cpt(
    code: str,
    *,
    age: Optional[int] = None,
    gender: Optional[str] = None,
    encounter_type: Optional[str] = None,
    specialty: Optional[str] = None,
) -> dict:
    """Validate a CPT code against pattern, table and clinical context."""

    normalized = code.strip().upper()
    if not CPT_PATTERN.fullmatch(normalized):
        return {
            "valid": False,
            "reason": "pattern",
            "issues": ["CPT codes must contain exactly five digits."],
        }

    info = CPT_CODES.get(normalized)
    if not info:
        return {
            "valid": False,
            "reason": "unknown",
            "issues": ["CPT code not found in reference table."],
        }

    context_issues = _collect_context_issues(
        info,
        normalized,
        age=age,
        gender=gender,
        encounter_type=encounter_type,
        specialty=specialty,
    )

    result = {
        "valid": not context_issues,
        "description": info["description"],
        "rvu": info["rvu"],
        "reimbursement": info["reimbursement"],
        "requirements": info["documentation"]["required"],
        "issues": context_issues,
    }
    if context_issues:
        result["reason"] = "context"
    return result


def validate_icd10(
    code: str,
    *,
    age: Optional[int] = None,
    gender: Optional[str] = None,
    encounter_type: Optional[str] = None,
    specialty: Optional[str] = None,
) -> dict:
    """Validate an ICD-10 code including demographic constraints."""

    normalized = code.strip().upper()
    if not ICD10_PATTERN.fullmatch(normalized):
        return {
            "valid": False,
            "reason": "pattern",
            "issues": ["ICD-10 codes must match the pattern A00 or A00.0."],
        }
    info = ICD10_CODES.get(normalized)
    if not info:
        return {
            "valid": False,
            "reason": "unknown",
            "issues": ["ICD-10 code not found in reference table."],
        }

    context_issues = _collect_context_issues(
        info,
        normalized,
        age=age,
        gender=gender,
        encounter_type=encounter_type,
        specialty=specialty,
    )

    result = {
        "valid": not context_issues,
        "description": info["description"],
        "clinicalContext": info["clinicalContext"],
        "contraindications": info["contraindications"],
        "issues": context_issues,
    }
    if context_issues:
        result["reason"] = "context"
    return result


def validate_hcpcs(
    code: str,
    *,
    age: Optional[int] = None,
    gender: Optional[str] = None,
    encounter_type: Optional[str] = None,
    specialty: Optional[str] = None,
) -> dict:
    """Validate an HCPCS code including coverage metadata."""

    normalized = code.strip().upper()
    if not HCPCS_PATTERN.fullmatch(normalized):
        return {
            "valid": False,
            "reason": "pattern",
            "issues": ["HCPCS codes must match the pattern A0000."],
        }

    info = HCPCS_CODES.get(normalized)
    if not info:
        return {
            "valid": False,
            "reason": "unknown",
            "issues": ["HCPCS code not found in reference table."],
        }

    context_issues = _collect_context_issues(
        info,
        normalized,
        age=age,
        gender=gender,
        encounter_type=encounter_type,
        specialty=specialty,
    )

    result = {
        "valid": not context_issues,
        "description": info["description"],
        "reimbursement": info.get("reimbursement"),
        "coverage": info.get("coverage", {}),
        "documentation": info.get("documentation", {}),
        "issues": context_issues,
    }
    if context_issues:
        result["reason"] = "context"
    return result


def validate_combination(
    cpt_codes: List[str],
    icd10_codes: List[str],
    *,
    age: Optional[int] = None,
    gender: Optional[str] = None,
    encounter_type: Optional[str] = None,
    specialty: Optional[str] = None,
) -> dict:
    """Validate CPT/ICD-10 combinations for medical necessity and context."""

    conflicts: List[dict] = []
    context_issues: List[dict] = []

    for raw_cpt in cpt_codes:
        cpt = raw_cpt.strip().upper()
        info = CPT_CODES.get(cpt)
        if not info:
            conflicts.append({"code1": cpt, "code2": "", "reason": "unknown CPT"})
            continue
        prefixes = info.get("icd10_prefixes", [])
        if prefixes and not any(
            any(code.strip().upper().startswith(prefix) for prefix in prefixes)
            for code in icd10_codes
        ):
            conflicts.append(
                {
                    "code1": cpt,
                    "code2": ",".join(icd10_codes) if icd10_codes else "",
                    "reason": "medical necessity not met",
                }
            )

        for issue in _collect_context_issues(
            info,
            cpt,
            age=age,
            gender=gender,
            encounter_type=encounter_type,
            specialty=specialty,
        ):
            context_issues.append({"code": cpt, "issue": issue})

    for raw_icd in icd10_codes:
        icd = raw_icd.strip().upper()
        info = ICD10_CODES.get(icd)
        if not info:
            continue
        for issue in _collect_context_issues(
            info,
            icd,
            age=age,
            gender=gender,
            encounter_type=encounter_type,
            specialty=specialty,
        ):
            context_issues.append({"code": icd, "issue": issue})

    return {
        "validCombinations": not conflicts and not context_issues,
        "conflicts": conflicts,
        "warnings": [],
        "contextIssues": context_issues,
    }


def calculate_billing(
    cpt_codes: List[str],
    payer_type: str = "commercial",
    location: str | None = None,
) -> dict:
    """Calculate estimated reimbursement for CPT codes with currency validation."""

    multiplier = Decimal("0.8") if payer_type and payer_type.lower() == "medicare" else Decimal("1.0")
    breakdown: Dict[str, dict] = {}
    issues: List[str] = []
    total = Decimal("0.00")
    total_rvu = Decimal("0.00")

    for raw_code in cpt_codes:
        code = raw_code.strip().upper()
        info = CPT_CODES.get(code)
        if not info:
            issues.append(f"CPT code {code} is not recognized.")
            continue

        reimbursement = Decimal(str(info.get("reimbursement", 0)))
        rvu_value = Decimal(str(info.get("rvu", 0)))
        if reimbursement <= 0:
            issues.append(f"CPT code {code} has a non-positive reimbursement amount.")
            continue

        amount = (reimbursement * multiplier).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if amount <= 0:
            issues.append(f"Calculated reimbursement for code {code} is not positive.")
            continue

        breakdown[code] = {
            "amount": float(amount),
            "amountFormatted": _format_currency(amount),
            "rvu": float(rvu_value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        }
        total += amount
        total_rvu += rvu_value

    total = total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total_rvu = total_rvu.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {
        "totalEstimated": float(total),
        "totalEstimatedFormatted": _format_currency(total),
        "breakdown": breakdown,
        "currency": "USD",
        "payerSpecific": {"payerType": payer_type, "location": location},
        "issues": issues,
        "totalRvu": float(total_rvu),
    }


def get_documentation(code: str) -> dict:
    """Return documentation requirements for a code."""
    code = code.strip().upper()
    info = CPT_CODES.get(code) or ICD10_CODES.get(code) or HCPCS_CODES.get(code)
    if not info:
        return {"code": code, "required": [], "recommended": [], "examples": []}
    doc = info.get("documentation", {})
    return {"code": code, **doc}
