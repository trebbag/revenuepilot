from __future__ import annotations

"""Staged chart ingestion pipeline for patient context generation."""

import asyncio
import copy
import hashlib
import logging
import os
import re
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Session

from backend.db import models as db_models
from backend.clinical_parsing import ClinicalFactExtractor
from backend.embedding import HashingVectorizerEmbedding
from backend.encryption import decrypt_artifact
from backend.security import hash_identifier

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
    uploaded_at: datetime


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
        upload_dir: Path | Callable[[], Path] | None = None,
        fact_extractor: Optional[ClinicalFactExtractor] = None,
        embedding_model: Optional[HashingVectorizerEmbedding] = None,
    ) -> None:
        self._session_factory = session_factory
        self._default_profile = default_profile
        self._event_manager = ContextEventManager()
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._lock = asyncio.Lock()
        if callable(upload_dir):
            self._upload_dir_getter = upload_dir
        elif upload_dir is not None:
            fixed_dir = Path(upload_dir)
            self._upload_dir_getter = lambda fixed_dir=fixed_dir: fixed_dir
        else:
            default_dir = Path(os.getenv("CHART_UPLOAD_DIR", "/tmp/revenuepilot_charts"))
            self._upload_dir_getter = lambda default_dir=default_dir: default_dir
        self._fact_extractor = fact_extractor or ClinicalFactExtractor()
        self._embedding_model = embedding_model or HashingVectorizerEmbedding()

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

    def _resolve_upload_dir(self) -> Path:
        directory = Path(self._upload_dir_getter())
        try:
            directory.mkdir(parents=True, exist_ok=True)
        except OSError as exc:  # pragma: no cover - filesystem dependent
            logger.warning("context_pipeline.upload_dir_error", error=str(exc), path=str(directory))
        return directory

    def _load_patient_documents(
        self,
        patient_id: str,
        staged_files: list[UploadedChartFile],
    ) -> list[UploadedChartFile]:
        by_doc: dict[str, UploadedChartFile] = {file.doc_id: file for file in staged_files}
        with self._session_scope() as session:
            records = (
                session.execute(
                    sa.select(db_models.ChartDocument)
                    .where(db_models.ChartDocument.patient_id == patient_id)
                )
                .scalars()
                .all()
            )
        upload_dir = self._resolve_upload_dir()
        for record in records:
            if record.doc_id in by_doc:
                existing = by_doc[record.doc_id]
                if record.uploaded_at:
                    existing.uploaded_at = record.uploaded_at
                continue
            path = (upload_dir / record.name).resolve()
            try:
                encrypted = path.read_bytes()
                data = decrypt_artifact(encrypted)
            except (OSError, ValueError) as exc:
                logger.warning(
                    "context_pipeline.missing_document",
                    doc_id=record.doc_id,
                    path=str(path),
                    error=str(exc),
                )
                continue
            text = _decode_text(data)
            by_doc[record.doc_id] = UploadedChartFile(
                name=record.name,
                mime=record.mime,
                data=data,
                text=text,
                sha256=record.bytes_sha256,
                doc_id=record.doc_id,
                uploaded_at=record.uploaded_at or _utc_now(),
            )
        return list(by_doc.values())

    def _existing_index_state(
        self,
        patient_id: str,
    ) -> tuple[dict[str, str], dict[str, list[str]]]:
        with self._session_scope() as session:
            chunks = (
                session.execute(
                    sa.select(db_models.PatientIndexChunk)
                    .where(db_models.PatientIndexChunk.patient_id == patient_id)
                )
                .scalars()
                .all()
            )
        chunk_ids_by_doc: dict[str, list[str]] = defaultdict(list)
        hashes_by_doc: dict[str, str] = {}
        for chunk in chunks:
            chunk_ids_by_doc[chunk.doc_id].append(chunk.chunk_id)
            metadata = chunk.metadata_payload if isinstance(chunk.metadata_payload, dict) else {}
            doc_hash = metadata.get("doc_sha256") if isinstance(metadata, dict) else None
            if doc_hash and chunk.doc_id not in hashes_by_doc:
                hashes_by_doc[chunk.doc_id] = doc_hash
        return hashes_by_doc, chunk_ids_by_doc

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
                    uploaded_at = existing.uploaded_at or _utc_now()
                    doc_records.append({
                        "doc_id": doc_id,
                        "name": existing.name,
                        "hash": sha,
                        "reused": True,
                    })
                else:
                    upload_time = _utc_now()
                    doc_id = f"doc_{hashlib.sha1((patient_id + sha).encode()).hexdigest()[:12]}"
                    record = db_models.ChartDocument(
                        doc_id=doc_id,
                        patient_id=patient_id,
                        correlation_id=correlation_id,
                        name=name,
                        mime=mime,
                        bytes_sha256=sha,
                        uploaded_at=upload_time,
                    )
                    session.add(record)
                    uploaded_at = upload_time
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
                        uploaded_at=uploaded_at,
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

    def _convert_anchors(
        self,
        evidence: Optional[Iterable[Mapping[str, Any]]],
        documents: Mapping[str, Mapping[str, Any]],
    ) -> list[dict[str, Any]]:
        anchors: list[dict[str, Any]] = []
        if not evidence:
            return anchors
        for anchor in evidence:
            if not isinstance(anchor, Mapping):
                continue
            doc_id = anchor.get("doc_id")
            doc_key = str(doc_id) if doc_id is not None else None
            doc_meta = documents.get(doc_key or "") if doc_key else None
            anchors.append(
                {
                    "sourceDocId": doc_key,
                    "sourceName": doc_meta.get("name") if doc_meta else None,
                    "page": anchor.get("page"),
                    "offset": anchor.get("char_start"),
                    "offsetEnd": anchor.get("char_end"),
                }
            )
        return anchors

    def _normalize_fact_entries(
        self,
        entries: Optional[Iterable[Mapping[str, Any]]],
        documents: Mapping[str, Mapping[str, Any]],
    ) -> list[dict[str, Any]]:
        if not entries:
            return []
        normalized: list[dict[str, Any]] = []
        for entry in entries:
            cloned = copy.deepcopy(entry)
            if isinstance(cloned, dict):
                anchors = self._convert_anchors(cloned.get("evidence"), documents)
                cloned["evidence"] = anchors
                cloned["anchors"] = anchors
                history_entries = cloned.get("history") if isinstance(cloned.get("history"), list) else []
                for history_entry in history_entries:
                    if isinstance(history_entry, dict):
                        history_anchors = self._convert_anchors(history_entry.get("evidence"), documents)
                        history_entry["evidence"] = history_anchors
                        history_entry["anchors"] = history_anchors
            normalized.append(cloned if isinstance(cloned, dict) else copy.deepcopy(entry))
        return normalized

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
            doc_rows = (
                session.execute(
                    sa.select(
                        db_models.ChartDocument.doc_id,
                        db_models.ChartDocument.name,
                        db_models.ChartDocument.pages,
                    ).where(db_models.ChartDocument.patient_id == patient_id)
                )
                .all()
            )
        documents = {
            str(row.doc_id): {
                "doc_id": str(row.doc_id),
                "name": row.name,
                "pages": row.pages,
            }
            for row in doc_rows
        }
        document_list = [dict(value) for value in documents.values()]
        if desired == "superficial" or not deep:
            if not superficial:
                return None
            return {
                "stage": _SUPERFICIAL,
                "patient_id": patient_id,
                "summary": superficial.kv,
                "pmh": [],
                "meds": [],
                "allergies": [],
                "labs": [],
                "vitals": [],
                "provenance": {
                    "doc_count": superficial.provenance.get("doc_count"),
                    "generated_at": superficial.generated_at.isoformat(),
                    "documents": document_list,
                },
            }
        best_stage = _DEEP
        if desired in {"final", "indexed"} and chunks:
            best_stage = _INDEXED
        problems = self._normalize_fact_entries(deep.problems, documents)
        medications = self._normalize_fact_entries(deep.meds, documents)
        allergies = self._normalize_fact_entries(deep.allergies, documents)
        labs = self._normalize_fact_entries(deep.labs, documents)
        vitals = self._normalize_fact_entries(deep.vitals, documents)
        return {
            "stage": best_stage,
            "patient_id": patient_id,
            "summary": {
                "problems": problems,
                "medications": medications,
                "allergies": allergies,
                "labs": labs,
                "vitals": vitals,
            },
            "pmh": problems,
            "meds": medications,
            "allergies": allergies,
            "labs": labs,
            "vitals": vitals,
            "provenance": {
                "doc_count": deep.provenance.get("doc_count"),
                "generated_at": deep.generated_at.isoformat(),
                "documents": document_list,
            },
        }

    def search_context(self, patient_id: str, query: str) -> Optional[dict[str, Any]]:
        snapshot = self.get_snapshot(patient_id, "final")
        if not snapshot:
            return None
        normalized_query = (query or "").strip().lower()
        results: list[dict[str, Any]] = []
        if normalized_query:
            categories = {
                "pmh": snapshot.get("pmh", []),
                "meds": snapshot.get("meds", []),
                "allergies": snapshot.get("allergies", []),
                "labs": snapshot.get("labs", []),
                "vitals": snapshot.get("vitals", []),
            }

            def _collect_strings(value: Any) -> list[str]:
                collected: list[str] = []
                if value is None:
                    return collected
                if isinstance(value, str):
                    text = value.strip()
                    if text:
                        collected.append(text.lower())
                elif isinstance(value, (int, float)):
                    collected.append(str(value).lower())
                elif isinstance(value, list):
                    for item in value:
                        collected.extend(_collect_strings(item))
                elif isinstance(value, dict):
                    for item in value.values():
                        collected.extend(_collect_strings(item))
                return collected

            for category, entries in categories.items():
                for entry in entries or []:
                    haystack: list[str] = []
                    if isinstance(entry, Mapping):
                        haystack.extend(_collect_strings(entry.get("label")))
                        haystack.extend(_collect_strings(entry.get("code")))
                        haystack.extend(_collect_strings(entry.get("value")))
                        haystack.extend(_collect_strings(entry.get("status")))
                        haystack.extend(_collect_strings(entry.get("dose_text")))
                        haystack.extend(_collect_strings(entry.get("frequency")))
                        haystack.extend(_collect_strings(entry.get("route")))
                        haystack.extend(_collect_strings(entry.get("notes")))
                        history_entries = entry.get("history") if isinstance(entry.get("history"), list) else []
                        for history_entry in history_entries:
                            if isinstance(history_entry, Mapping):
                                haystack.extend(_collect_strings(history_entry.get("context")))
                                haystack.extend(_collect_strings(history_entry.get("value")))
                                haystack.extend(_collect_strings(history_entry.get("notes")))
                                haystack.extend(_collect_strings(history_entry.get("detail")))
                    if any(normalized_query in item for item in haystack):
                        matches = sorted({item for item in haystack if normalized_query in item})
                        results.append(
                            {
                                "category": category,
                                "matches": matches,
                                "fact": copy.deepcopy(entry),
                            }
                        )

        return {
            "query": query,
            "stage": snapshot.get("stage"),
            "documents": snapshot.get("provenance", {}).get("documents", []),
            "results": results,
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
        all_files = self._load_patient_documents(patient_id, files)
        facts, metrics = self._fact_extractor.extract(all_files)
        logger.info(
            "context_pipeline.deep.metrics",
            correlation_id=correlation_id,
            patient_hash=hash_identifier(patient_id),
            metrics=metrics,
        )
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
                provenance={"doc_count": len(all_files), "metrics": metrics},
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
        all_files = self._load_patient_documents(patient_id, files)
        density = 1 if profile == "fast" else 2 if profile == "balanced" else 4
        chunk_token_target = max(120 // density, 40)
        existing_hashes, chunk_ids_by_doc = self._existing_index_state(patient_id)
        reindex_docs = {
            file.doc_id
            for file in all_files
            if existing_hashes.get(file.doc_id) != file.sha256
        }
        target_docs = reindex_docs or set()
        token_pattern = re.compile(r"\S+")
        chunks: list[db_models.PatientIndexChunk] = []
        embeddings: list[db_models.PatientIndexEmbedding] = []
        if target_docs:
            for file in all_files:
                if file.doc_id not in target_docs:
                    continue
                sections = self._fact_extractor.sectionize(file.text)
                for section_index, section in enumerate(sections):
                    section_text = file.text[section["start"] : section["end"]]
                    tokens = list(token_pattern.finditer(section_text))
                    if not tokens:
                        continue
                    for idx in range(0, len(tokens), chunk_token_target):
                        chunk_tokens = tokens[idx : idx + chunk_token_target]
                        if not chunk_tokens:
                            continue
                        start_offset = chunk_tokens[0].start()
                        end_offset = chunk_tokens[-1].end()
                        text_segment = section_text[start_offset:end_offset].strip()
                        if not text_segment:
                            continue
                        char_start = section["start"] + start_offset
                        char_end = section["start"] + end_offset
                        page = file.text.count("\f", 0, char_start) + 1
                        chunk_id = "chk_" + hashlib.sha1(
                            f"{file.doc_id}:{file.sha256}:{section_index}:{idx}".encode()
                        ).hexdigest()[:12]
                        chunks.append(
                            db_models.PatientIndexChunk(
                                chunk_id=chunk_id,
                                patient_id=patient_id,
                                doc_id=file.doc_id,
                                stage=_INDEXED,
                                section=section["label"],
                                text=text_segment,
                                token_count=len(chunk_tokens),
                                char_start=char_start,
                                char_end=char_end,
                                metadata_payload={
                                    "correlation_id": correlation_id,
                                    "doc_sha256": file.sha256,
                                    "page": page,
                                },
                            )
                        )
                        embedding = self._embedding_model.embed(text_segment)
                        embeddings.append(
                            db_models.PatientIndexEmbedding(
                                chunk_id=chunk_id,
                                embedding=embedding,
                                model=f"hashing-{self._embedding_model.dimensions}",
                                created_at=_utc_now(),
                            )
                        )
        logger.info(
            "context_pipeline.index.metrics",
            correlation_id=correlation_id,
            patient_hash=hash_identifier(patient_id),
            reindexed_docs=len(reindex_docs),
            chunk_count=len(chunks),
        )
        if chunks:
            with self._session_scope() as session:
                for doc_id in (target_docs or set()):
                    existing_ids = chunk_ids_by_doc.get(doc_id, [])
                    if existing_ids:
                        session.execute(
                            sa.delete(db_models.PatientIndexEmbedding).where(
                                db_models.PatientIndexEmbedding.chunk_id.in_(existing_ids)
                            )
                        )
                        session.execute(
                            sa.delete(db_models.PatientIndexChunk).where(
                                db_models.PatientIndexChunk.chunk_id.in_(existing_ids)
                            )
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

