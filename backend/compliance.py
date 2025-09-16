"""Compliance rule engine and knowledge base helpers.

This module exposes a lightweight rule engine used by the REST endpoints in
``backend.main``.  Rules are represented as dictionaries so they can be easily
serialised and surfaced in the UI.  The engine focuses on deterministic and
transparent checks so it can run without external dependencies or network
access.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence
from uuid import uuid4

from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

try:  # prefer appdirs when available
    from appdirs import user_data_dir  # type: ignore
except Exception:  # pragma: no cover - fallback for limited environments
    from platformdirs import user_data_dir  # type: ignore

from backend.compliance_models import Base, ComplianceRule
from backend.key_manager import APP_NAME

# ---------------------------------------------------------------------------
# Rule catalogue
# ---------------------------------------------------------------------------

_RULE_SEED: List[Dict[str, Any]] = [
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


_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker] = None


def _default_db_url() -> str:
    """Return the SQLite URL for the analytics database."""

    data_dir = user_data_dir(APP_NAME, APP_NAME)
    os.makedirs(data_dir, exist_ok=True)
    db_path = os.path.join(data_dir, "analytics.db")
    return f"sqlite:///{db_path}"


def configure_engine(
    connection: Optional[sqlite3.Connection] = None,
    db_url: Optional[str] = None,
) -> None:
    """Configure the SQLAlchemy engine used for compliance rules."""

    global _engine, _SessionLocal

    if connection is not None:
        def _creator() -> sqlite3.Connection:
            return connection

        _engine = create_engine(
            "sqlite://",
            creator=_creator,
            poolclass=StaticPool,
            future=True,
        )
    else:
        url = db_url or _default_db_url()
        _engine = create_engine(
            url,
            connect_args={"check_same_thread": False},
            future=True,
        )

    Base.metadata.create_all(_engine)
    _SessionLocal = sessionmaker(
        bind=_engine,
        expire_on_commit=False,
        autoflush=False,
        future=True,
    )
    _seed_rules_if_empty()


def _get_session() -> Session:
    if _SessionLocal is None:
        configure_engine()
    assert _SessionLocal is not None
    return _SessionLocal()


@contextmanager
def session_scope() -> Iterable[Session]:
    """Provide a transactional scope around a series of operations."""

    session = _get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _seed_rules_if_empty() -> None:
    """Populate the database with seed rules when empty."""

    with session_scope() as session:
        existing = session.execute(select(ComplianceRule.id).limit(1)).scalar_one_or_none()
        if existing is not None:
            return
        now = datetime.utcnow()
        for payload in _RULE_SEED:
            rule = ComplianceRule.from_dict(payload)
            rule.created_at = now
            rule.updated_at = now
            session.add(rule)


# Initialise the engine on import for default usage. Tests may reconfigure it.
configure_engine()


def _split_rule_payload(
    data: Mapping[str, Any]
) -> tuple[Dict[str, Any], Dict[str, Any], bool, Optional[List[Dict[str, Any]]], bool]:
    """Split an incoming payload into core fields, metadata and references."""

    core: Dict[str, Any] = {}
    metadata: Dict[str, Any] = {}
    metadata_replace = False
    references: Optional[List[Dict[str, Any]]] = None
    references_replace = False

    if "metadata" in data:
        metadata_replace = True
        raw_metadata = data.get("metadata")
        if isinstance(raw_metadata, Mapping):
            metadata.update(dict(raw_metadata))
        else:
            metadata = {}

    if "references" in data:
        references_replace = True
        raw_refs = data.get("references")
        if isinstance(raw_refs, Sequence):
            references = [dict(item) for item in raw_refs if isinstance(item, Mapping)]
        else:
            references = []

    for key, value in data.items():
        if key in {"metadata", "references", "created_at", "updated_at", "createdAt", "updatedAt"}:
            continue
        if key in {"id", "name", "description", "category", "severity", "type"}:
            core[key] = value
        else:
            metadata[key] = value

    return core, metadata, metadata_replace, references, references_replace


def _clean_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in metadata.items() if value is not None}


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def get_rule(rule_id: str) -> Optional[Dict[str, Any]]:
    """Return a single compliance rule when present."""

    clean_id = (rule_id or "").strip()
    if not clean_id:
        return None
    with session_scope() as session:
        rule = session.get(ComplianceRule, clean_id)
        if rule is None:
            return None
        session.expunge(rule)
        return rule.to_dict()


def create_rule(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Persist a new compliance rule and return its serialised representation."""

    core, metadata, _, references, _ = _split_rule_payload(payload)
    clean_id = str(core.get("id", "")).strip()
    if not clean_id:
        raise ValueError("Rule id is required")
    name = str(core.get("name", "")).strip()
    description = str(core.get("description", "")).strip()
    if not name:
        raise ValueError("Rule name is required")
    if not description:
        raise ValueError("Rule description is required")
    rule_type = str(core.get("type", "absence") or "absence")

    metadata_clean = _clean_metadata(metadata)
    payload_dict: Dict[str, Any] = {
        "id": clean_id,
        "name": name,
        "description": description,
        "category": core.get("category"),
        "severity": core.get("severity"),
        "type": rule_type,
    }
    if metadata_clean:
        payload_dict["metadata"] = metadata_clean
    if references:
        payload_dict["references"] = references

    with session_scope() as session:
        if session.get(ComplianceRule, clean_id) is not None:
            raise ValueError(f"Rule '{clean_id}' already exists")
        rule = ComplianceRule.from_dict(payload_dict)
        session.add(rule)
        session.flush()
        session.refresh(rule)
        result = rule.to_dict()
        session.expunge(rule)
        return result


def update_rule(rule_id: str, updates: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
    """Update an existing rule and return the new representation."""

    clean_id = (rule_id or "").strip()
    if not clean_id:
        raise ValueError("Rule id is required")

    core, metadata, metadata_replace, references, references_replace = _split_rule_payload(updates)
    metadata_clean = _clean_metadata(metadata)
    metadata_remove = {key for key, value in metadata.items() if value is None}

    with session_scope() as session:
        rule = session.get(ComplianceRule, clean_id)
        if rule is None:
            return None

        if "name" in core:
            rule.name = str(core.get("name", ""))
        if "description" in core:
            rule.description = str(core.get("description", ""))
        if "category" in core:
            rule.category = core.get("category")
        if "severity" in core:
            rule.severity = core.get("severity")
        if "type" in core:
            rule.rule_type = str(core.get("type", "absence") or "absence")

        metadata_current = rule.metadata_dict()
        if metadata_replace:
            metadata_current = {}
        else:
            for key in metadata_remove:
                metadata_current.pop(key, None)
        for key, value in metadata_clean.items():
            metadata_current[key] = value
        if metadata_current:
            rule.metadata_json = json.dumps(metadata_current)
        else:
            rule.metadata_json = None

        if references_replace:
            if references:
                rule.references_json = json.dumps(references)
            else:
                rule.references_json = None

        rule.updated_at = datetime.utcnow()
        session.add(rule)
        session.flush()
        session.refresh(rule)
        result = rule.to_dict()
        session.expunge(rule)
        return result


def delete_rule(rule_id: str) -> bool:
    """Delete a rule. Returns ``True`` when a row was removed."""

    clean_id = (rule_id or "").strip()
    if not clean_id:
        return False
    with session_scope() as session:
        result = session.execute(delete(ComplianceRule).where(ComplianceRule.id == clean_id))
        deleted = result.rowcount or 0
        return deleted > 0


def replace_rules(rules: Sequence[Mapping[str, Any]]) -> int:
    """Replace the rule catalogue with the provided sequence."""

    cleaned: List[Dict[str, Any]] = []
    for item in rules:
        if isinstance(item, Mapping):
            cleaned.append(dict(item))

    with session_scope() as session:
        session.execute(delete(ComplianceRule))
        count = 0
        for payload in cleaned:
            try:
                rule = ComplianceRule.from_dict(payload)
            except Exception:
                continue
            session.add(rule)
            count += 1
        session.flush()
        return count

def get_rules(rule_ids: Optional[Iterable[str]] = None) -> List[Dict[str, Any]]:
    """Return the configured compliance rules."""

    with session_scope() as session:
        query = select(ComplianceRule)
        if rule_ids is not None:
            wanted = {rid.lower() for rid in rule_ids if isinstance(rid, str)}
            if not wanted:
                return []
            query = query.where(func.lower(ComplianceRule.id).in_(wanted))
        query = query.order_by(ComplianceRule.name)
        results = session.execute(query).scalars().all()
        return [rule.to_dict() for rule in results]


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
