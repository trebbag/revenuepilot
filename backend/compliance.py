"""Compliance rule engine and knowledge base helpers.

This module exposes a lightweight rule engine used by the REST endpoints in
``backend.main``.  Rules are represented as dictionaries so they can be easily
serialised and surfaced in the UI.  The engine focuses on deterministic and
transparent checks so it can run without external dependencies or network
access.
"""

from __future__ import annotations

import re
import time
from typing import Any, Dict, Iterable, List, Optional
from uuid import uuid4

# ---------------------------------------------------------------------------
# Rule catalogue
# ---------------------------------------------------------------------------

_DEFAULT_RULES: List[Dict[str, Any]] = [
    {
        "id": "documentation-chief-complaint",
        "name": "Document the chief complaint",
        "description": (
            "Evaluation and Management documentation requires a clearly "
            "documented chief complaint. Include the patient's presenting "
            "concern near the top of the note."
        ),
        "category": "documentation",
        "severity": "high",
        "type": "absence",
        "keywords": ["chief complaint", "cc:"],
        "recommendedAction": "Add a section describing the patient's chief complaint.",
        "references": [
            {
                "title": "1995/1997 E&M Documentation Guidelines",
                "url": "https://www.cms.gov/Outreach-and-Education/Medicare-Learning-Network-MLN/MLNProducts/Downloads/eval-mgmt-serv-guide-ICN006764.pdf",
            }
        ],
    },
    {
        "id": "documentation-review-of-systems",
        "name": "Include a Review of Systems",
        "description": (
            "Higher level visits typically require at least one system to be "
            "reviewed. Document positive and pertinent negatives for clarity."
        ),
        "category": "documentation",
        "severity": "medium",
        "type": "absence",
        "keywords": ["review of systems", "ros"],
        "recommendedAction": "Document the Review of Systems with any pertinent findings.",
        "references": [
            {
                "title": "Medicare E\u0026M Services Guide",
                "url": "https://www.cms.gov/Outreach-and-Education/Medicare-Learning-Network-MLN/MLNProducts/downloads/eval-mgmt-serv-guide-ICN006764.pdf",
            }
        ],
    },
    {
        "id": "documentation-hpi-elements",
        "name": "Capture key HPI elements",
        "description": (
            "Level 4/5 visits require four or more history of present illness "
            "elements such as location, duration, severity, timing or modifying "
            "factors."
        ),
        "category": "billing",
        "severity": "high",
        "type": "count",
        "threshold": 4,
        "keywords": [
            "location",
            "duration",
            "severity",
            "timing",
            "context",
            "modifying factors",
            "associated signs",
            "associated symptoms",
        ],
        "recommendedAction": "Document at least four distinct HPI elements to support coding.",
        "references": [
            {
                "title": "E\u0026M HPI Elements",
                "url": "https://www.aapc.com/resources/medical-coding/em-documentation.aspx",
            }
        ],
    },
    {
        "id": "telehealth-consent",
        "name": "Telehealth consent documented",
        "description": (
            "When the visit type is telehealth, consent must be obtained and "
            "recorded in the encounter documentation."
        ),
        "category": "regulatory",
        "severity": "high",
        "type": "conditional_absence",
        "metadata_key": "visitType",
        "metadata_values": ["telehealth", "virtual", "remote"],
        "keywords": ["telehealth consent", "verbal consent", "informed consent"],
        "recommendedAction": "Record that the patient provided consent for the telehealth visit.",
        "references": [
            {
                "title": "CMS Telehealth Guidance",
                "url": "https://www.cms.gov/newsroom/fact-sheets/medicare-telemedicine-health-care-provider-fact-sheet",
            }
        ],
    },
    {
        "id": "privacy-sensitive-identifiers",
        "name": "Remove sensitive identifiers",
        "description": (
            "Clinical documentation should avoid storing Social Security numbers "
            "or full financial account numbers to remain HIPAA compliant."
        ),
        "category": "privacy",
        "severity": "critical",
        "type": "presence",
        "keywords": ["social security", "ssn", "credit card", "123-45-6789"],
        "recommendedAction": "Remove sensitive identifiers before saving or transmitting the note.",
        "references": [
            {
                "title": "HIPAA Privacy Rule",
                "url": "https://www.hhs.gov/hipaa/for-professionals/privacy/index.html",
            }
        ],
    },
]


_RESOURCE_LIBRARY: List[Dict[str, Any]] = [
    {
        "title": "CMS Documentation Requirements for E\u0026M Services",
        "url": "https://www.cms.gov/Outreach-and-Education/Medicare-Learning-Network-MLN/MLNProducts/Downloads/eval-mgmt-serv-guide-ICN006764.pdf",
        "category": "documentation",
        "agency": "CMS",
        "regions": ["us"],
        "summary": "Official guidance covering required elements for Medicare encounters.",
    },
    {
        "title": "HIPAA Privacy Rule Summary",
        "url": "https://www.hhs.gov/hipaa/for-professionals/privacy/index.html",
        "category": "privacy",
        "agency": "HHS",
        "regions": ["us"],
        "summary": "Safeguards and permitted uses of protected health information.",
    },
    {
        "title": "Telehealth Best Practices",
        "url": "https://www.ama-assn.org/practice-management/digital/ama-telehealth-quick-guide",
        "category": "regulatory",
        "agency": "AMA",
        "regions": ["us"],
        "summary": "Checklist for documenting remote encounters and patient consent.",
    },
    {
        "title": "General Data Protection Regulation (GDPR) guide",
        "url": "https://ec.europa.eu/info/law/law-topic/data-protection/eu-data-protection-rules_en",
        "category": "privacy",
        "agency": "EU",
        "regions": ["eu"],
        "summary": "Overview of GDPR obligations for providers seeing EU residents.",
    },
]


_RISK_WEIGHTS = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def get_rules(rule_ids: Optional[Iterable[str]] = None) -> List[Dict[str, Any]]:
    """Return the configured compliance rules."""

    if rule_ids is None:
        return [dict(rule) for rule in _DEFAULT_RULES]
    wanted = {rid.lower() for rid in rule_ids}
    return [dict(rule) for rule in _DEFAULT_RULES if rule["id"].lower() in wanted]


def get_resources(region: Optional[str] = None, category: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return compliance resources filtered by region/category when provided."""

    region_norm = region.lower() if region else None
    category_norm = category.lower() if category else None
    resources: List[Dict[str, Any]] = []
    for item in _RESOURCE_LIBRARY:
        if region_norm and item.get("regions"):
            if region_norm not in {r.lower() for r in item.get("regions", [])}:
                continue
        if category_norm and item.get("category"):
            if item["category"].lower() != category_norm:
                continue
        resources.append(dict(item))
    return resources


def evaluate_note(
    note: str,
    metadata: Optional[Dict[str, Any]] = None,
    rule_ids: Optional[Iterable[str]] = None,
) -> Dict[str, Any]:
    """Evaluate ``note`` against configured rules and return structured issues."""

    metadata = metadata or {}
    rules = get_rules(rule_ids)
    note_lower = note.lower()
    issues: List[Dict[str, Any]] = []

    for rule in rules:
        triggered, details = _evaluate_rule(rule, note, note_lower, metadata)
        if not triggered:
            continue
        issue_id = str(uuid4())
        severity = (rule.get("severity") or "medium").lower()
        issue: Dict[str, Any] = {
            "issueId": issue_id,
            "ruleId": rule.get("id"),
            "title": rule.get("name"),
            "severity": severity,
            "category": rule.get("category"),
            "summary": rule.get("description"),
            "recommendation": rule.get("recommendedAction"),
            "references": rule.get("references", []),
            "status": "open",
            "details": details or {},
            "createdAt": time.time(),
        }
        snippet = details.get("noteExcerpt") or details.get("snippet")
        if not snippet:
            snippets = details.get("snippets")
            if isinstance(snippets, list) and snippets:
                snippet = snippets[0]
        if isinstance(snippet, str) and snippet.strip():
            issue["noteExcerpt"] = snippet.strip()
        issues.append(issue)

    applied_rules = [rule.get("id") for rule in rules]
    high_count = sum(1 for item in issues if (item.get("severity") or "").lower() in {"high", "critical"})
    risk_score = sum(_RISK_WEIGHTS.get((item.get("severity") or "medium").lower(), 1) for item in issues)
    summary = {
        "issuesFound": len(issues),
        "highSeverity": high_count,
        "riskScore": risk_score,
        "timestamp": time.time(),
    }
    return {
        "issues": issues,
        "summary": summary,
        "rulesEvaluated": len(rules),
        "appliedRules": applied_rules,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _evaluate_rule(
    rule: Dict[str, Any],
    note_original: str,
    note_lower: str,
    metadata: Dict[str, Any],
) -> tuple[bool, Dict[str, Any]]:
    rule_type = (rule.get("type") or "absence").lower()
    keywords = [kw.lower() for kw in rule.get("keywords", []) if isinstance(kw, str) and kw.strip()]
    details: Dict[str, Any] = {"ruleType": rule_type}

    if rule_type == "presence":
        matches = _find_keyword_matches(note_original, note_lower, keywords)
        if matches:
            details.update(matches)
            return True, details
        return False, {}

    if rule_type == "absence":
        matches = _find_keyword_matches(note_original, note_lower, keywords)
        if matches.get("matchedKeywords"):
            return False, {}
        details["missingKeywords"] = keywords
        return True, details

    if rule_type == "count":
        matches = _find_keyword_matches(note_original, note_lower, keywords)
        threshold = int(rule.get("threshold") or len(keywords))
        matched = matches.get("matchedKeywords", [])
        if len(matched) < threshold:
            details.update(matches)
            details["threshold"] = threshold
            return True, details
        return False, {}

    if rule_type == "conditional_absence":
        metadata_key = (rule.get("metadata_key") or "").strip()
        allowed_values = [str(v).lower() for v in rule.get("metadata_values", []) if str(v).strip()]
        if metadata_key:
            current_value = str(metadata.get(metadata_key, "")).lower()
            details["metadataKey"] = metadata_key
            details["metadataValue"] = current_value or None
            if allowed_values and current_value not in allowed_values:
                return False, {}
        matches = _find_keyword_matches(note_original, note_lower, keywords)
        if matches.get("matchedKeywords"):
            return False, {}
        details["missingKeywords"] = keywords
        return True, details

    return False, {}


def _find_keyword_matches(
    note_original: str,
    note_lower: str,
    keywords: List[str],
) -> Dict[str, Any]:
    matched: List[str] = []
    snippets: List[str] = []
    for keyword in keywords:
        if keyword in note_lower:
            matched.append(keyword)
            snippet = _extract_snippet(note_original, keyword)
            if snippet:
                snippets.append(snippet)
    details: Dict[str, Any] = {}
    if matched:
        details["matchedKeywords"] = matched
    if snippets:
        details["snippets"] = snippets
    return details


def _extract_snippet(note: str, keyword: str, window: int = 40) -> Optional[str]:
    try:
        pattern = re.compile(re.escape(keyword), re.IGNORECASE)
    except re.error:
        return None
    match = pattern.search(note)
    if not match:
        return None
    start = max(match.start() - window, 0)
    end = min(match.end() + window, len(note))
    snippet = note[start:end].strip()
    return snippet or None
