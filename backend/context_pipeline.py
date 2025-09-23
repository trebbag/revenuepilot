from __future__ import annotations

"""Staged chart ingestion pipeline for patient context generation."""

import asyncio
import hashlib
import logging
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from contextlib import contextmanager
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Session

from backend.db import models as db_models

logger = logging.getLogger(__name__)

StageLiteral = str

_SUPERFICIAL = "superficial"
_DEEP = "deep"
_INDEXED = "indexed"
_STAGE_ORDER = (_SUPERFICIAL, _DEEP, _INDEXED)


@dataclass(slots=True)
class UploadedChartFile:
    """In-memory representation of an uploaded chart file."""

    name: str
    mime: Optional[str]
    data: bytes
    text: str
    sha256: str
    doc_id: str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _decode_text(data: bytes) -> str:
    for encoding in ("utf-8", "latin-1"):
        try:
            return data.decode(encoding)
        except Exception:
            continue
    return data.decode("utf-8", errors="ignore")


class ContextEventManager:
    """Simple broker for streaming context events to WebSocket listeners."""

    def __init__(self) -> None:
        self._listeners: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, correlation_id: str) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        async with self._lock:
            self._listeners[correlation_id].add(queue)
        return queue

    async def disconnect(self, correlation_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            listeners = self._listeners.get(correlation_id)
            if not listeners:
                return
            listeners.discard(queue)
            if not listeners:
                self._listeners.pop(correlation_id, None)

    async def broadcast(self, correlation_id: str, payload: Mapping[str, Any]) -> None:
        listeners = list(self._listeners.get(correlation_id, set()))
        if not listeners:
            return
        for queue in listeners:
            try:
                queue.put_nowait(dict(payload))
            except asyncio.QueueFull:  # pragma: no cover - defensive
                logger.debug("context_event.drop", correlation_id=correlation_id, payload=payload)


class ChartContextPipeline:
    """Coordinate staged processing of uploaded chart files."""

    def __init__(
        self,
        session_factory: Callable[[], Session],
        *,
        default_profile: str = "balanced",
    ) -> None:
        self._session_factory = session_factory
        self._default_profile = default_profile
        self._event_manager = ContextEventManager()
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Public accessors
    # ------------------------------------------------------------------

    @property
    def events(self) -> ContextEventManager:
        return self._event_manager

    def profile_for_request(self, override: Optional[str]) -> str:
        if override and override in {"fast", "balanced", "thorough"}:
            return override
        env_profile = os.getenv("PROFILE")
        if env_profile and env_profile in {"fast", "balanced", "thorough"}:
            return env_profile
        return self._default_profile

    # ------------------------------------------------------------------
    # Upload orchestration
    # ------------------------------------------------------------------

    async def handle_upload(
        self,
        *,
        patient_id: str,
        correlation_id: str,
        files: Iterable[tuple[str, bytes, Optional[str]]],
        profile: Optional[str] = None,
    ) -> dict[str, Any]:
        """Persist documents, enqueue processing, and return upload metadata."""

        normalized_profile = self.profile_for_request(profile)
        staged_files: list[UploadedChartFile] = []
        doc_records: list[dict[str, Any]] = []
        needs_processing = False

        with self._session_scope() as session:
            for name, raw, mime in files:
                sha = _sha256(raw)
                existing = (
                    session.execute(
                        sa.select(db_models.ChartDocument)
                        .where(db_models.ChartDocument.patient_id == patient_id)
                        .where(db_models.ChartDocument.bytes_sha256 == sha)
                    )
                    .scalars()
                    .first()
                )
                if existing:
                    doc_id = existing.doc_id
                    existing.correlation_id = correlation_id
                    doc_records.append({
                        "doc_id": doc_id,
                        "name": existing.name,
                        "hash": sha,
                        "reused": True,
                    })
                else:
                    doc_id = f"doc_{hashlib.sha1((patient_id + sha).encode()).hexdigest()[:12]}"
                    record = db_models.ChartDocument(
                        doc_id=doc_id,
                        patient_id=patient_id,
                        correlation_id=correlation_id,
                        name=name,
                        mime=mime,
                        bytes_sha256=sha,
                        uploaded_at=_utc_now(),
                    )
                    session.add(record)
                    needs_processing = True
                    doc_records.append({
                        "doc_id": doc_id,
                        "name": name,
                        "hash": sha,
                        "reused": False,
                    })
                text = _decode_text(raw)
                staged_files.append(
                    UploadedChartFile(
                        name=name,
                        mime=mime,
                        data=raw,
                        text=text,
                        sha256=sha,
                        doc_id=doc_records[-1]["doc_id"],
                    )
                )
            session.flush()
            doc_count_query = session.execute(
                sa.select(sa.func.count(db_models.ChartDocument.doc_id)).where(
                    db_models.ChartDocument.patient_id == patient_id
                )
            )
            doc_count = int(doc_count_query.scalar_one() or 0)

            jobs = self._create_jobs(session, correlation_id, patient_id, normalized_profile, doc_count)

        if not needs_processing:
            await self._mark_job_state(jobs.superficial_id, "completed", percent=100)
            if jobs.deep_id:
                await self._mark_job_state(jobs.deep_id, "completed", percent=100)
            if jobs.indexed_id:
                await self._mark_job_state(jobs.indexed_id, "completed", percent=100)
            await self._emit_cached_ready(correlation_id, patient_id, normalized_profile)
        elif needs_processing and normalized_profile != "fast":
            await self._start_pipeline(correlation_id, patient_id, staged_files, normalized_profile, jobs)
        elif needs_processing:
            await self._start_pipeline(
                correlation_id,
                patient_id,
                staged_files,
                normalized_profile,
                jobs,
                skip_deep=True,
            )

        return {
            "upload_id": f"ul_{correlation_id.split('_')[-1]}",
            "patient_id": patient_id,
            "correlation_id": correlation_id,
            "profile": normalized_profile,
            "files": [{"doc_id": entry["doc_id"], "name": entry["name"], "hash": entry["hash"], "reused": entry["reused"]} for entry in doc_records],
        }

    # ------------------------------------------------------------------
    # Public query helpers
    # ------------------------------------------------------------------

    def get_status(self, patient_id: str) -> Optional[dict[str, Any]]:
        with self._session_scope() as session:
            latest = (
                session.execute(
                    sa.select(db_models.ChartParseJob)
                    .where(db_models.ChartParseJob.patient_id == patient_id)
                    .order_by(db_models.ChartParseJob.created_at.desc())
                    .limit(1)
                )
                .scalars()
                .first()
            )
            if not latest:
                return None
            correlation_id = latest.correlation_id
            return self.get_status_by_correlation(correlation_id)

    def get_status_by_correlation(self, correlation_id: str) -> Optional[dict[str, Any]]:
        with self._session_scope() as session:
            jobs = (
                session.execute(
                    sa.select(db_models.ChartParseJob)
                    .where(db_models.ChartParseJob.correlation_id == correlation_id)
                    .order_by(db_models.ChartParseJob.created_at.asc())
                )
                .scalars()
                .all()
            )
        if not jobs:
            return None
        return self._build_status_payload(correlation_id, jobs)

    def get_snapshot(self, patient_id: str, stage: str) -> Optional[dict[str, Any]]:
        desired = stage or "superficial"
        desired = desired.lower()
        with self._session_scope() as session:
            superficial = session.get(db_models.PatientContextSuperficial, patient_id)
            deep = session.get(db_models.PatientContextNormalized, patient_id)
            chunks = (
                session.execute(
                    sa.select(db_models.PatientIndexChunk)
                    .where(db_models.PatientIndexChunk.patient_id == patient_id)
                )
                .scalars()
                .all()
            )
        if desired == "superficial" or not deep:
            if not superficial:
                return None
            return {
                "stage": _SUPERFICIAL,
                "patient_id": patient_id,
                "summary": superficial.kv,
                "provenance": {
                    "doc_count": superficial.provenance.get("doc_count"),
                    "generated_at": superficial.generated_at.isoformat(),
                },
            }
        best_stage = _DEEP
        if desired in {"final", "indexed"} and chunks:
            best_stage = _INDEXED
        payload = deep.problems or []
        return {
            "stage": best_stage,
            "patient_id": patient_id,
            "summary": {
                "problems": deep.problems,
                "medications": deep.meds,
                "allergies": deep.allergies,
                "labs": deep.labs,
                "vitals": deep.vitals,
            },
            "provenance": {
                "doc_count": deep.provenance.get("doc_count"),
                "generated_at": deep.generated_at.isoformat(),
            },
        }

    def _build_status_payload(
        self,
        correlation_id: str,
        jobs: List[db_models.ChartParseJob],
    ) -> dict[str, Any]:
        stages_payload: dict[str, dict[str, Any]] = {}
        profile = jobs[0].profile if jobs else self._default_profile
        last_updated = None
        patient_id = jobs[0].patient_id if jobs else None
        for job in jobs:
            stages_payload[job.stage] = {
                "state": job.state,
                "percent": job.percent,
                "started_at": job.started_at.isoformat() if job.started_at else None,
                "finished_at": job.finished_at.isoformat() if job.finished_at else None,
                "eta_sec": job.eta_sec,
                "doc_count": job.doc_count,
            }
            if job.finished_at and (last_updated is None or job.finished_at > last_updated):
                last_updated = job.finished_at
        if not last_updated:
            last_updated = _utc_now()
        return {
            "correlation_id": correlation_id,
            "stages": stages_payload,
            "profile": profile,
            "last_updated": last_updated.isoformat(),
            "patient_id": patient_id,
        }

    # ------------------------------------------------------------------
    # Pipeline internals
    # ------------------------------------------------------------------

    @dataclass(slots=True)
    class _JobRefs:
        superficial_id: Optional[str]
        deep_id: Optional[str]
        indexed_id: Optional[str]

    def _create_jobs(
        self,
        session: Session,
        correlation_id: str,
        patient_id: str,
        profile: str,
        doc_count: int,
    ) -> "ChartContextPipeline._JobRefs":
        existing = (
            session.execute(
                sa.select(db_models.ChartParseJob)
                .where(db_models.ChartParseJob.correlation_id == correlation_id)
            )
            .scalars()
            .all()
        )
        if existing:
            # Jobs already persisted (retries)
            mapping = {job.stage: job.job_id for job in existing}
            return self._JobRefs(mapping.get(_SUPERFICIAL), mapping.get(_DEEP), mapping.get(_INDEXED))

        created: dict[str, str] = {}
        for stage in _STAGE_ORDER:
            job_id = f"job_{hashlib.sha1(f"{correlation_id}:{stage}".encode()).hexdigest()[:12]}"
            state = "queued"
            percent = 0
            if profile == "fast" and stage == _DEEP:
                state = "completed"
                percent = 100
            job = db_models.ChartParseJob(
                job_id=job_id,
                correlation_id=correlation_id,
                patient_id=patient_id,
                stage=stage,
                state=state,
                percent=percent,
                profile=profile,
                doc_count=doc_count,
            )
            session.add(job)
            created[stage] = job_id
        return self._JobRefs(created.get(_SUPERFICIAL), created.get(_DEEP), created.get(_INDEXED))

    async def _start_pipeline(
        self,
        correlation_id: str,
        patient_id: str,
        files: list[UploadedChartFile],
        profile: str,
        jobs: "ChartContextPipeline._JobRefs",
        *,
        skip_deep: bool = False,
    ) -> None:
        async with self._lock:
            if correlation_id in self._tasks:
                return
            task = asyncio.create_task(
                self._run_pipeline(
                    correlation_id,
                    patient_id,
                    files,
                    profile,
                    jobs,
                    skip_deep=skip_deep,
                )
            )
            self._tasks[correlation_id] = task
            task.add_done_callback(lambda _: self._tasks.pop(correlation_id, None))

    async def _emit_cached_ready(self, correlation_id: str, patient_id: str, profile: str) -> None:
        status = self.get_status(patient_id)
        if not status:
            return
        available = [stage for stage, payload in status["stages"].items() if payload.get("state") == "completed"]
        best_stage = _SUPERFICIAL
        if _DEEP in available:
            best_stage = _DEEP
        if _INDEXED in available:
            best_stage = _INDEXED
        snapshot_url = f"/api/patients/{patient_id}/context?stage={'final' if best_stage == _INDEXED else best_stage}"
        await self._event_manager.broadcast(
            correlation_id,
            {
                "event": "context:ready",
                "correlation_id": correlation_id,
                "best_stage": best_stage,
                "available_stages": available,
                "snapshot_url": snapshot_url,
            },
        )

    async def _run_pipeline(
        self,
        correlation_id: str,
        patient_id: str,
        files: list[UploadedChartFile],
        profile: str,
        jobs: "ChartContextPipeline._JobRefs",
        *,
        skip_deep: bool,
    ) -> None:
        try:
            await self._run_superficial(correlation_id, patient_id, files, jobs.superficial_id)
            available = [_SUPERFICIAL]
            if skip_deep and jobs.deep_id:
                await self._mark_job_state(jobs.deep_id, "completed", percent=100)
                await self._event_manager.broadcast(
                    correlation_id,
                    {
                        "event": "context:stage",
                        "correlation_id": correlation_id,
                        "stage": _DEEP,
                        "state": "completed",
                    },
                )
            if not skip_deep:
                await self._run_deep(correlation_id, patient_id, files, jobs.deep_id)
                available.append(_DEEP)
                await self._event_manager.broadcast(
                    correlation_id,
                    {
                        "event": "context:ready",
                        "correlation_id": correlation_id,
                        "best_stage": _DEEP,
                        "available_stages": available.copy(),
                        "snapshot_url": f"/api/patients/{patient_id}/context?stage=deep",
                    },
                )
            await self._run_indexed(correlation_id, patient_id, files, jobs.indexed_id, profile)
            available.append(_INDEXED)
            await self._event_manager.broadcast(
                correlation_id,
                {
                    "event": "context:ready",
                    "correlation_id": correlation_id,
                    "best_stage": _INDEXED,
                    "available_stages": available,
                    "snapshot_url": f"/api/patients/{patient_id}/context?stage=final",
                },
            )
        except Exception as exc:  # pragma: no cover - defensive catch
            logger.exception("context_pipeline.failed", correlation_id=correlation_id, error=str(exc))
            await self._event_manager.broadcast(
                correlation_id,
                {
                    "event": "context:error",
                    "correlation_id": correlation_id,
                    "stage": "pipeline",
                    "code": "PIPELINE_ERROR",
                    "message": str(exc),
                },
            )

    # ------------------------------------------------------------------
    # Stage implementations
    # ------------------------------------------------------------------

    async def _run_superficial(
        self,
        correlation_id: str,
        patient_id: str,
        files: list[UploadedChartFile],
        job_id: Optional[str],
    ) -> None:
        await self._mark_job_state(job_id, "running", percent=5)
        await self._event_manager.broadcast(
            correlation_id,
            {
                "event": "context:stage",
                "correlation_id": correlation_id,
                "stage": _SUPERFICIAL,
                "state": "running",
            },
        )
        await self._event_manager.broadcast(
            correlation_id,
            {
                "event": "context:progress",
                "correlation_id": correlation_id,
                "stage": _SUPERFICIAL,
                "percent": 35,
                "message": "Collecting basic chart context",
            },
        )
        snippets = []
        for file in files:
            text = file.text.strip()
            snippet = text[:400]
            snippets.append(
                {
                    "doc_id": file.doc_id,
                    "name": file.name,
                    "preview": snippet,
                    "evidence": [
                        {
                            "doc_id": file.doc_id,
                            "char_start": 0,
                            "char_end": min(len(snippet), len(text)),
                        }
                    ],
                }
            )
        with self._session_scope() as session:
            payload = db_models.PatientContextSuperficial(
                patient_id=patient_id,
                correlation_id=correlation_id,
                kv={"documents": snippets},
                provenance={"doc_count": len(files)},
                generated_at=_utc_now(),
            )
            session.merge(payload)
        await self._mark_job_state(job_id, "completed", percent=100)
        await self._event_manager.broadcast(
            correlation_id,
            {
                "event": "context:stage",
                "correlation_id": correlation_id,
                "stage": _SUPERFICIAL,
                "state": "completed",
            },
        )

    async def _run_deep(
        self,
        correlation_id: str,
        patient_id: str,
        files: list[UploadedChartFile],
        job_id: Optional[str],
    ) -> None:
        await self._mark_job_state(job_id, "running", percent=10)
        await self._event_manager.broadcast(
            correlation_id,
            {
                "event": "context:stage",
                "correlation_id": correlation_id,
                "stage": _DEEP,
                "state": "running",
            },
        )
        facts = self._extract_facts(files)
        await self._event_manager.broadcast(
            correlation_id,
            {
                "event": "context:progress",
                "correlation_id": correlation_id,
                "stage": _DEEP,
                "percent": 60,
                "message": "Normalizing clinical facts",
            },
        )
        with self._session_scope() as session:
            payload = db_models.PatientContextNormalized(
                patient_id=patient_id,
                correlation_id=correlation_id,
                problems=facts["problems"],
                meds=facts["medications"],
                allergies=facts["allergies"],
                labs=facts["labs"],
                vitals=facts["vitals"],
                provenance={"doc_count": len(files)},
                generated_at=_utc_now(),
            )
            session.merge(payload)
        await self._mark_job_state(job_id, "completed", percent=100)
        await self._event_manager.broadcast(
            correlation_id,
            {
                "event": "context:stage",
                "correlation_id": correlation_id,
                "stage": _DEEP,
                "state": "completed",
            },
        )

    async def _run_indexed(
        self,
        correlation_id: str,
        patient_id: str,
        files: list[UploadedChartFile],
        job_id: Optional[str],
        profile: str,
    ) -> None:
        await self._mark_job_state(job_id, "running", percent=10)
        await self._event_manager.broadcast(
            correlation_id,
            {
                "event": "context:stage",
                "correlation_id": correlation_id,
                "stage": _INDEXED,
                "state": "running",
            },
        )
        chunks: list[db_models.PatientIndexChunk] = []
        embeddings: list[db_models.PatientIndexEmbedding] = []
        density = 1 if profile == "fast" else 2 if profile == "balanced" else 4
        for file in files:
            words = file.text.split()
            chunk_size = max(80 // density, 20)
            for idx in range(0, len(words), chunk_size):
                portion_words = words[idx : idx + chunk_size]
                if not portion_words:
                    continue
                text = " ".join(portion_words)
                char_start = max(file.text.find(portion_words[0]), 0)
                char_end = char_start + len(text)
                chunk_id = f"chk_{hashlib.sha1((file.doc_id + str(idx)).encode()).hexdigest()[:12]}"
                chunks.append(
                    db_models.PatientIndexChunk(
                        chunk_id=chunk_id,
                        patient_id=patient_id,
                        doc_id=file.doc_id,
                        stage=_INDEXED,
                        section="body",
                        text=text,
                        token_count=len(portion_words),
                        char_start=char_start,
                        char_end=char_end,
                        metadata_payload={"correlation_id": correlation_id},
                    )
                )
                embedding = self._fake_embedding(text)
                embeddings.append(
                    db_models.PatientIndexEmbedding(
                        chunk_id=chunk_id,
                        embedding=embedding,
                        model="mock-embedding",
                        created_at=_utc_now(),
                    )
                )
        with self._session_scope() as session:
            existing_chunk_ids = [
                row[0]
                for row in session.execute(
                    sa.select(db_models.PatientIndexChunk.chunk_id)
                    .where(db_models.PatientIndexChunk.patient_id == patient_id)
                )
            ]
            if existing_chunk_ids:
                session.execute(
                    sa.delete(db_models.PatientIndexEmbedding).where(
                        db_models.PatientIndexEmbedding.chunk_id.in_(existing_chunk_ids)
                    )
                )
            session.execute(
                sa.delete(db_models.PatientIndexChunk).where(db_models.PatientIndexChunk.patient_id == patient_id)
            )
            for chunk in chunks:
                session.merge(chunk)
            for emb in embeddings:
                session.merge(emb)
        await self._mark_job_state(job_id, "completed", percent=100)
        await self._event_manager.broadcast(
            correlation_id,
            {
                "event": "context:stage",
                "correlation_id": correlation_id,
                "stage": _INDEXED,
                "state": "completed",
            },
        )

    def _fake_embedding(self, text: str) -> list[float]:
        # Deterministic pseudo-embedding for testing purposes
        values = [float((ord(ch) % 32) / 31.0) for ch in text[:32]]
        if not values:
            values = [0.0]
        return values

    def _extract_facts(self, files: list[UploadedChartFile]) -> dict[str, list[dict[str, Any]]]:
        problems: list[dict[str, Any]] = []
        medications: list[dict[str, Any]] = []
        allergies: list[dict[str, Any]] = []
        vitals: list[dict[str, Any]] = []
        labs: list[dict[str, Any]] = []

        for file in files:
            text = file.text
            lower = text.lower()
            # Problems
            idx = lower.find("type 2 diabetes")
            if idx != -1:
                problems.append(
                    {
                        "code": "E11.9",
                        "system": "ICD10",
                        "label": "Type 2 diabetes",
                        "evidence": [
                            {
                                "doc_id": file.doc_id,
                                "char_start": idx,
                                "char_end": idx + len("Type 2 diabetes"),
                            }
                        ],
                    }
                )
            # Medications
            med_idx = lower.find("metformin")
            if med_idx != -1:
                span = self._expand_until(text, med_idx, {"\n"})
                medications.append(
                    {
                        "rxnorm": "860975",
                        "label": text[span[0] : span[1]].strip() or "Metformin",
                        "route": "PO",
                        "evidence": [
                            {
                                "doc_id": file.doc_id,
                                "char_start": span[0],
                                "char_end": span[1],
                            }
                        ],
                    }
                )
            # Allergies
            allergy_idx = lower.find("penicillin")
            if allergy_idx != -1:
                allergies.append(
                    {
                        "label": "Penicillin",
                        "severity": "moderate",
                        "evidence": [
                            {
                                "doc_id": file.doc_id,
                                "char_start": allergy_idx,
                                "char_end": allergy_idx + len("penicillin"),
                            }
                        ],
                    }
                )
            # Vitals (BP)
            bp_idx = lower.find("bp")
            if bp_idx != -1:
                bp_text = self._extract_bp(text[bp_idx:bp_idx + 40])
                if bp_text:
                    vitals.append(
                        {
                            "name": "BP",
                            "value": bp_text["value"],
                            "date": bp_text.get("date"),
                            "evidence": [
                                {
                                    "doc_id": file.doc_id,
                                    "char_start": bp_idx + bp_text["start"],
                                    "char_end": bp_idx + bp_text["end"],
                                }
                            ],
                        }
                    )
            # Labs (Hemoglobin)
            lab_idx = lower.find("hemoglobin")
            if lab_idx != -1:
                lab_details = self._extract_lab(text, lab_idx)
                if lab_details:
                    labs.append(
                        {
                            "loinc": "718-7",
                            "label": "Hemoglobin",
                            "value": lab_details["value"],
                            "unit": lab_details.get("unit"),
                            "date": lab_details.get("date"),
                            "ref_low": lab_details.get("ref_low"),
                            "ref_high": lab_details.get("ref_high"),
                            "evidence": [
                                {
                                    "doc_id": file.doc_id,
                                    "char_start": lab_details["start"],
                                    "char_end": lab_details["end"],
                                }
                            ],
                        }
                    )
        return {
            "problems": problems,
            "medications": medications,
            "allergies": allergies,
            "vitals": vitals,
            "labs": labs,
        }

    def _expand_until(self, text: str, index: int, terminators: set[str]) -> tuple[int, int]:
        start = index
        while start > 0 and text[start - 1] not in terminators:
            start -= 1
        end = index
        while end < len(text) and text[end] not in terminators:
            end += 1
        return start, end

    def _extract_bp(self, segment: str) -> Optional[dict[str, Any]]:
        import re

        match = re.search(r"bp[^0-9]*?(\d{2,3})\s*[\/-]\s*(\d{2,3})(?:[^0-9]*(20\d{2}-\d{2}-\d{2}))?", segment, flags=re.IGNORECASE)
        if not match:
            return None
        systolic, diastolic, date = match.groups()
        span = match.span(0)
        return {"value": f"{systolic}/{diastolic}", "date": date, "start": span[0], "end": span[1]}

    def _extract_lab(self, text: str, index: int) -> Optional[dict[str, Any]]:
        import re

        segment = text[index:index + 80]
        match = re.search(r"hemoglobin[^0-9]*(\d{1,2}\.\d)(?:\s*(g/dl|g\\/dl))?", segment, flags=re.IGNORECASE)
        if not match:
            return None
        value = float(match.group(1))
        unit = match.group(2) or "g/dL"
        date_match = re.search(r"(20\d{2}-\d{2}-\d{2})", text[max(0, index - 40):index + 40])
        date = date_match.group(1) if date_match else None
        span = match.span(0)
        return {"value": value, "unit": unit, "date": date, "start": index + span[0], "end": index + span[1]}

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    @contextmanager
    def _session_scope(self):  # type: ignore[override]
        session = self._session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    async def _mark_job_state(
        self,
        job_id: Optional[str],
        state: str,
        *,
        percent: Optional[int] = None,
    ) -> None:
        if not job_id:
            return
        with self._session_scope() as session:
            job = session.get(db_models.ChartParseJob, job_id)
            if not job:
                return
            job.state = state
            if percent is not None:
                job.percent = percent
            now = _utc_now()
            if state == "running":
                job.started_at = job.started_at or now
            if state == "completed":
                job.finished_at = now
            session.add(
                db_models.ChartParseJobEvent(
                    event_id=f"evt_{hashlib.sha1(f"{job_id}:{now.timestamp()}".encode()).hexdigest()[:12]}",
                    job_id=job_id,
                    ts=now,
                    type=state,
                    payload={"percent": job.percent},
                )
            )

