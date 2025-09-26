"""Utilities for loading finalized note artifacts."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional

from backend.security import hash_identifier


@dataclass
class FinalizedNoteArtifacts:
    finalized_note_id: str
    note_html: Optional[str]
    note_markdown: Optional[str]
    note_text: Optional[str]
    summary_html: Optional[str]
    summary_markdown: Optional[str]
    summary_json: Optional[Any]
    summary_text: Optional[str]
    finalized_by: Optional[str]
    clinic_id: Optional[str]
    patient_hash: Optional[str]


def load_finalized_note_artifacts(db_conn, finalized_note_id: str) -> FinalizedNoteArtifacts | None:
    """Load immutable artifacts for a finalized note."""

    row = db_conn.execute(
        "SELECT * FROM notes WHERE finalized_note_id = ? LIMIT 1",
        (finalized_note_id,),
    ).fetchone()

    if row is None:
        return None

    data = dict(row)

    summary_payload = data.get("finalized_summary")
    summary_json: Optional[Any]
    summary_text: Optional[str] = None

    if summary_payload is None:
        summary_json = None
    elif isinstance(summary_payload, (dict, list)):
        summary_json = summary_payload
    else:
        try:
            summary_json = json.loads(summary_payload)
        except (TypeError, json.JSONDecodeError):
            summary_json = None
            if isinstance(summary_payload, str):
                summary_text = summary_payload

    if summary_json is None and summary_text is None:
        summary_text = None

    artifacts = FinalizedNoteArtifacts(
        finalized_note_id=finalized_note_id,
        note_html=data.get("finalized_note_html"),
        note_markdown=data.get("finalized_note_md"),
        note_text=data.get("finalized_content") or data.get("content"),
        summary_html=data.get("finalized_summary_html"),
        summary_markdown=data.get("finalized_summary_md"),
        summary_json=summary_json,
        summary_text=summary_text,
        finalized_by=data.get("finalized_by"),
        clinic_id=data.get("finalized_clinic_id"),
        patient_hash=data.get("finalized_patient_hash"),
    )

    return artifacts


def verify_patient_access(patient_id: Optional[str], expected_hash: Optional[str], *, role: Optional[str]) -> bool:
    if expected_hash is None:
        return True

    if role == "admin":
        return True

    if not patient_id:
        return False

    provided_hash = hash_identifier(patient_id.strip())
    return provided_hash == expected_hash

