"""Compose job pipeline coordination utilities.

This module provides a staged orchestration pipeline used by the API to
generate enhanced note artifacts.  The stages mirror the frontend wizard
experience so progress can be surfaced consistently to the user:

* ``analyzing`` – Normalise the source note and collect metadata.
* ``enhancing_structure`` – Reformat the note into a consistent layout.
* ``beautifying_language`` – Invoke the beautify model (with offline
  fallbacks) and derive accompanying artifacts such as billing
  justifications and a patient summary.
* ``final_review`` – Run validation on the enhanced note and surface any
  blocking issues.

The pipeline is intentionally self-contained so the FastAPI application can
reuse it inside a background worker.  Callers provide progress callbacks and
optionally cancellation hooks to integrate with persistence, analytics and
session management concerns owned by the API layer.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Mapping, Optional

from backend.openai_client import call_openai
from backend.prompts import build_beautify_prompt
from backend.sanitizer import sanitize_text

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

ANALYZING_STAGE = "analyzing"
ENHANCING_STAGE = "enhancing_structure"
BEAUTIFYING_STAGE = "beautifying_language"
FINAL_REVIEW_STAGE = "final_review"

STAGE_SEQUENCE = (
    ANALYZING_STAGE,
    ENHANCING_STAGE,
    BEAUTIFYING_STAGE,
    FINAL_REVIEW_STAGE,
)

STAGE_PROGRESS = {
    ANALYZING_STAGE: 0.15,
    ENHANCING_STAGE: 0.35,
    BEAUTIFYING_STAGE: 0.85,
    FINAL_REVIEW_STAGE: 1.0,
}


@dataclass(slots=True)
class ComposeJobPayload:
    """All inputs required to run the compose pipeline for a session."""

    compose_id: int
    note: str
    metadata: Dict[str, Any]
    codes: List[Dict[str, Any]]
    transcript: List[Dict[str, Any]]
    lang: str = "en"
    specialty: Optional[str] = None
    payer: Optional[str] = None
    offline: bool = False
    use_local_models: bool = False
    beautify_model: Optional[str] = None
    session_id: Optional[str] = None
    encounter_id: Optional[str] = None
    note_id: Optional[str] = None
    username: Optional[str] = None


@dataclass(slots=True)
class ComposeJobState:
    """State snapshot emitted by the pipeline when progress updates."""

    compose_id: int
    status: str = "in_progress"
    stage: str = ANALYZING_STAGE
    progress: float = 0.0
    steps: List[Dict[str, Any]] = field(default_factory=list)
    result: Optional[Dict[str, Any]] = None
    validation: Optional[Dict[str, Any]] = None
    message: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "composeId": self.compose_id,
            "status": self.status,
            "stage": self.stage,
            "progress": self.progress,
            "steps": self.steps,
            "result": self.result,
            "validation": self.validation,
            "message": self.message,
        }


ProgressCallback = Callable[[ComposeJobState], Awaitable[None] | None]
CancellationChecker = Callable[[], bool]


class ComposeJobCancelled(Exception):
    """Raised when a compose job is cancelled mid-flight."""


# ---------------------------------------------------------------------------
# Helper functions shared across stages
# ---------------------------------------------------------------------------


def _initial_steps() -> List[Dict[str, Any]]:
    steps: List[Dict[str, Any]] = []
    for index, stage in enumerate(STAGE_SEQUENCE, start=1):
        steps.append(
            {
                "id": index,
                "stage": stage,
                "status": "pending",
                "progress": 0.0,
            }
        )
    return steps


def _get_patient_name(metadata: Mapping[str, Any]) -> str:
    value = metadata.get("name") if isinstance(metadata, Mapping) else None
    if isinstance(value, str) and value.strip():
        return value.strip()
    return "Patient"


def _default_note_content(metadata: Mapping[str, Any]) -> str:
    name = _get_patient_name(metadata)
    date = metadata.get("encounterDate") if isinstance(metadata, Mapping) else None
    if not isinstance(date, str) or not date.strip():
        from datetime import datetime

        date = datetime.now().date().isoformat()
    return (
        f"PATIENT: {name}\nDATE: {date}\n\nCHIEF COMPLAINT:\n"
        "Chest pain for 2 days.\n\nHISTORY OF PRESENT ILLNESS:\n"
        "Patient reports chest pain. Started 2 days ago. Pain is sharp. "
        "Located in precordial region. Intermittent. Worsens with activity. "
        "Smoking history 1 pack per day for 30 years.\n\nPHYSICAL EXAMINATION:\n"
        "GENERAL: Alert, oriented, comfortable at rest\n"
        "CARDIOVASCULAR: Regular rate and rhythm, no murmurs, no peripheral edema\n"
        "RESPIRATORY: Clear to auscultation bilaterally\n"
        "EXTREMITIES: No cyanosis, clubbing, or edema\n\nASSESSMENT:\n"
        "Chest pain, likely musculoskeletal. Given smoking history and age, "
        "cardiac evaluation warranted.\n\nPLAN:\n"
        "1. EKG to rule out cardiac abnormalities\n"
        "2. Basic metabolic panel and lipid profile\n"
        "3. Consider stress testing if symptoms persist\n"
        "4. Smoking cessation counseling provided"
    )


def _normalize_whitespace(value: str) -> str:
    return " ".join(value.split())


def _normalize_bullet_sentence(text: str) -> str:
    collapsed = _normalize_whitespace(text)
    if not collapsed:
        return ""
    if collapsed.startswith(("-", "•")):
        body = collapsed[1:].strip()
        if not body:
            return "•"
        return "• " + body[:1].upper() + body[1:]
    if "." in collapsed:
        prefix, _, body = collapsed.partition(".")
        if prefix.isdigit() and body.strip():
            normalized = body.strip()
            return f"{prefix}. {normalized[:1].upper() + normalized[1:]}"
    return collapsed


def _normalize_sentence(line: str) -> str:
    collapsed = _normalize_whitespace(line)
    if not collapsed:
        return ""
    if collapsed.startswith(("-", "•")) or collapsed[:1].isdigit():
        return _normalize_bullet_sentence(collapsed)
    if not collapsed[:1].isalpha():
        return collapsed
    return collapsed[:1].upper() + collapsed[1:]


def _format_note_for_enhancement(note: str) -> str:
    lines = note.splitlines()
    formatted: List[str] = []
    previous_was_heading = False
    for raw_line in lines:
        trimmed = raw_line.strip()
        if not trimmed:
            continue
        is_heading = trimmed.replace(" ", "").isalpha() and trimmed.endswith(":")
        if is_heading:
            heading = _normalize_whitespace(trimmed).upper()
            if formatted and formatted[-1] != "":
                formatted.append("")
            formatted.append(heading)
            previous_was_heading = True
            continue
        normalized = _normalize_sentence(trimmed)
        formatted.append(normalized)
        previous_was_heading = False
    return "\n".join(formatted).strip()


def _clean_sentence(text: str) -> str:
    collapsed = _normalize_whitespace(text)
    if not collapsed:
        return ""
    capitalized = (
        collapsed[:1].upper() + collapsed[1:] if collapsed[:1].isalpha() else collapsed
    )
    if capitalized.endswith(tuple(".!?:;")):
        return capitalized
    return capitalized + "."


def _build_code_justifications(
    codes: Iterable[Mapping[str, Any]], metadata: Mapping[str, Any]
) -> List[str]:
    normalized: List[str] = []
    seen: set[str] = set()
    patient_name = _get_patient_name(metadata)
    for index, item in enumerate(codes, start=1):
        if not isinstance(item, Mapping):
            continue
        identifier = str(item.get("code") or "").strip()
        title = str(item.get("title") or item.get("description") or "").strip()
        key = (identifier or title or str(item.get("id") or index)).lower()
        if key in seen:
            continue
        seen.add(key)
        descriptor_parts: List[str] = []
        if identifier:
            descriptor_parts.append(identifier)
        if title and title.lower() != identifier.lower():
            descriptor_parts.append(title)
        descriptor = descriptor_parts[0] if len(descriptor_parts) == 1 else " – ".join(descriptor_parts)
        if not descriptor:
            descriptor = f"Code {index}"
        evidence_sources = [
            item.get("docSupport"),
            item.get("details"),
            item.get("description"),
            item.get("aiReasoning"),
        ]
        evidence = next(
            (
                str(source).strip()
                for source in evidence_sources
                if isinstance(source, str) and source.strip()
            ),
            None,
        )
        if evidence is None and isinstance(item.get("evidence"), list):
            evidence = next(
                (
                    str(entry).strip()
                    for entry in item["evidence"]
                    if isinstance(entry, str) and entry.strip()
                ),
                None,
            )
        if not evidence and isinstance(item.get("gaps"), list):
            evidence = next(
                (
                    str(entry).strip()
                    for entry in item["gaps"]
                    if isinstance(entry, str) and entry.strip()
                ),
                None,
            )
        reason = (
            _clean_sentence(evidence)
            if evidence
            else f"Documented findings for {patient_name} support this selection."
        )
        normalized.append(f"• {descriptor}: {reason}")
    if not normalized:
        normalized.append("• No billing codes were selected during this workflow.")
    return normalized


def _derive_transcript_highlights(entries: Iterable[Mapping[str, Any]]) -> List[str]:
    highlights: List[str] = []
    for item in entries:
        if len(highlights) >= 3:
            break
        if not isinstance(item, Mapping):
            continue
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        speaker = str(item.get("speaker") or "").strip()
        prefix = f"{speaker}: " if speaker else ""
        highlights.append(f"• {prefix}{text}")
    return highlights


def _build_patient_summary(
    note: str,
    metadata: Mapping[str, Any],
    code_justifications: Iterable[str],
    transcript: Iterable[Mapping[str, Any]],
) -> str:
    name = _get_patient_name(metadata)
    date = metadata.get("encounterDate") if isinstance(metadata, Mapping) else None
    if not isinstance(date, str) or not date.strip():
        from datetime import datetime

        date = datetime.now().date().isoformat()
    paragraphs = [
        _normalize_whitespace(block)
        for block in note.split("\n\n")
        if _normalize_whitespace(block)
    ]
    key_points = [f"• {block}" for block in paragraphs[:6]]
    highlights = _derive_transcript_highlights(transcript)
    billing_points = [
        f"• {str(entry).lstrip('• ').strip()}" for entry in code_justifications
    ]
    summary_lines = [
        f"VISIT SUMMARY FOR: {name}",
        f"DATE: {date}",
        "",
        "WHAT WE DISCUSSED:",
        *(key_points or ["• Please review the clinical note for visit details."]),
    ]
    if highlights:
        summary_lines.extend(["", "CONVERSATION HIGHLIGHTS:", *highlights])
    if billing_points:
        summary_lines.extend(["", "BILLING CODES & REASONS:", *billing_points])
    summary_lines.extend(
        [
            "",
            "NEXT STEPS:",
            "• Follow the care plan outlined above.",
            "• Contact the clinic if symptoms change or new concerns arise.",
        ]
    )
    return "\n".join(summary_lines)


# ---------------------------------------------------------------------------
# Pipeline implementation
# ---------------------------------------------------------------------------


class ComposePipeline:
    """Execute the staged compose workflow and emit progress updates."""

    def __init__(
        self,
        *,
        validator: Callable[[Dict[str, Any]], Dict[str, Any]],
    ) -> None:
        self._validator = validator

    async def run(
        self,
        job: ComposeJobPayload,
        reporter: ProgressCallback,
        *,
        is_cancelled: CancellationChecker | None = None,
    ) -> ComposeJobState:
        state = ComposeJobState(
            compose_id=job.compose_id,
            steps=_initial_steps(),
        )
        result: Dict[str, Any] = {
            "sessionId": job.session_id,
            "encounterId": job.encounter_id,
            "noteId": job.note_id,
        }
        state.result = result

        async def emit() -> None:
            try:
                maybe_awaitable = reporter(state)
                if asyncio.iscoroutine(maybe_awaitable):
                    await maybe_awaitable
            except Exception:  # pragma: no cover - defensive
                logger.exception(
                    "compose_pipeline.reporter_failure composeId=%s", job.compose_id
                )

        def check_cancelled() -> None:
            if is_cancelled and is_cancelled():
                raise ComposeJobCancelled()

        try:
            # Stage: Analyzing -------------------------------------------------
            check_cancelled()
            state.stage = ANALYZING_STAGE
            state.status = "in_progress"
            state.progress = 0.01
            state.steps[0].update({"status": "in_progress", "progress": 0.0})
            await emit()

            normalized_metadata = {
                str(k): v for k, v in job.metadata.items() if v is not None
            }
            raw_note = job.note or ""
            sanitized_note = sanitize_text(raw_note)
            base_note = sanitized_note.strip() or _default_note_content(normalized_metadata)
            result["analysis"] = {
                "normalizedNote": base_note,
                "metadata": normalized_metadata,
                "codeCount": len(job.codes),
                "transcriptHighlights": _derive_transcript_highlights(job.transcript),
            }
            state.progress = STAGE_PROGRESS[ANALYZING_STAGE]
            state.steps[0].update({"status": "completed", "progress": state.progress})
            await emit()

            # Stage: Enhancing structure --------------------------------------
            check_cancelled()
            state.stage = ENHANCING_STAGE
            state.steps[1].update({"status": "in_progress"})
            await emit()
            structured_note = _format_note_for_enhancement(base_note)
            if not structured_note:
                structured_note = base_note
            result["structuredNote"] = structured_note
            state.progress = STAGE_PROGRESS[ENHANCING_STAGE]
            state.steps[1].update({"status": "completed", "progress": state.progress})
            await emit()

            # Stage: Beautifying language -------------------------------------
            check_cancelled()
            state.stage = BEAUTIFYING_STAGE
            state.steps[2].update({"status": "in_progress"})
            await emit()
            beautified, mode = await self._beautify(structured_note, job)
            code_justifications = _build_code_justifications(job.codes, normalized_metadata)
            patient_summary = _build_patient_summary(
                structured_note, normalized_metadata, code_justifications, job.transcript
            )
            result.update(
                {
                    "beautifiedNote": beautified,
                    "codeJustifications": code_justifications,
                    "patientSummary": patient_summary,
                    "mode": mode,
                }
            )
            state.progress = STAGE_PROGRESS[BEAUTIFYING_STAGE]
            state.steps[2].update({"status": "completed", "progress": state.progress})
            await emit()

            # Stage: Final review ---------------------------------------------
            check_cancelled()
            state.stage = FINAL_REVIEW_STAGE
            state.steps[3].update({"status": "in_progress"})
            await emit()
            validation_payload = self._validator(
                {
                    "content": beautified,
                    "codes": [
                        str(item.get("code") or "")
                        for item in job.codes
                        if isinstance(item, Mapping)
                    ],
                    "prevention": normalized_metadata.get("preventionItems", []),
                    "diagnoses": normalized_metadata.get("diagnoses", []),
                    "differentials": normalized_metadata.get("differentials", []),
                    "compliance": normalized_metadata.get("complianceChecks", []),
                }
            )
            issues = validation_payload.get("issues") or {}
            can_finalize = bool(validation_payload.get("canFinalize"))
            state.validation = {
                "ok": can_finalize,
                "issues": issues,
                "detail": validation_payload,
            }
            state.progress = STAGE_PROGRESS[FINAL_REVIEW_STAGE]
            if can_finalize:
                state.status = "completed"
                state.steps[3].update({"status": "completed", "progress": state.progress})
            else:
                state.status = "blocked"
                state.steps[3].update({"status": "blocked", "progress": state.progress})
                state.message = "Validation identified blocking issues."
            await emit()
            return state
        except ComposeJobCancelled:
            state.status = "cancelled"
            state.stage = FINAL_REVIEW_STAGE
            state.message = "Compose job cancelled"
            state.progress = min(state.progress, STAGE_PROGRESS.get(state.stage, 1.0))
            state.steps[-1].update({"status": "cancelled", "progress": state.progress})
            await emit()
            raise
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.exception(
                "compose_pipeline_error composeId=%s error=%s", job.compose_id, exc
            )
            state.status = "failed"
            state.message = str(exc)
            stage = state.stage if state.stage in STAGE_SEQUENCE else ANALYZING_STAGE
            state.stage = stage
            try:
                index = STAGE_SEQUENCE.index(stage)
            except ValueError:
                index = 0
            target_index = min(len(state.steps) - 1, index)
            state.steps[target_index].update({"status": "failed"})
            await emit()
            return state

    async def _beautify(
        self, note: str, job: ComposeJobPayload
    ) -> tuple[str, str]:
        """Beautify ``note`` respecting offline/local fallbacks.

        Returns a tuple of beautified text and the mode used (``offline`` or
        ``remote``).
        """

        mode = "offline" if job.offline else "remote"
        if job.offline:
            try:
                from backend.offline_model import beautify as offline_beautify

                beautified = offline_beautify(
                    note,
                    job.lang,
                    job.specialty,
                    job.payer,
                    use_local=job.use_local_models,
                    model_path=job.beautify_model,
                )
                return beautified, mode
            except Exception as exc:  # pragma: no cover - offline safety net
                logger.warning(
                    "compose_offline_beautify_failed error=%s", exc
                )
                mode = "remote"
        try:
            messages = build_beautify_prompt(note, job.lang, job.specialty, job.payer)
            beautified = await asyncio.to_thread(
                call_openai,
                messages,
                job.beautify_model or "gpt-4o",
                0,
            )
            return beautified.strip(), mode
        except Exception as exc:
            logger.error("compose_beautify_remote_failed error=%s", exc)
            sentences = [
                segment.strip()
                for segment in note.split(". ")
                if segment.strip()
            ]
            fallback = " ".join(
                sentence[:1].upper() + sentence[1:] for sentence in sentences
            )
            return fallback or note, mode

