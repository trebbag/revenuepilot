"""Observability helpers for AI routes and ingestion queues."""

from __future__ import annotations

from collections import defaultdict
from contextlib import contextmanager, nullcontext
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
import re
import time
import sys
from typing import Any, Callable, Dict, Iterable, Iterator, List, Mapping, Optional

import structlog

from backend.db import models as db_models
from backend.migrations import session_scope


logger = structlog.get_logger(__name__)


_CURRENT_OBSERVATION: ContextVar["RouteObservation | None"] = ContextVar(
    "observability_current_route", default=None
)
_RECORDER: "ObservabilityRecorder | None" = None


_SAFE_ATTR_RE = re.compile(r"[^a-zA-Z0-9_.:@/#-]+")


def _sanitize_value(value: Any, *, limit: int = 160) -> str:
    """Return a redacted string representation safe for metrics storage."""

    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    cleaned = _SAFE_ATTR_RE.sub(" ", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) > limit:
        cleaned = cleaned[: limit - 1] + "…"
    return cleaned


def _hash_identifier(value: Optional[str]) -> Optional[str]:
    """Return a stable anonymised hash for identifiers such as note IDs."""

    if not value:
        return None
    digest = hashlib.sha256(value.encode("utf-8", "ignore")).hexdigest()
    return digest[:20]


def _ensure_timezone(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _percentile(values: List[float], pct: float) -> float:
    """Return the percentile value using linear interpolation."""

    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    sorted_vals = sorted(values)
    k = (len(sorted_vals) - 1) * pct
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    d0 = sorted_vals[int(f)] * (c - k)
    d1 = sorted_vals[int(c)] * (k - f)
    return d0 + d1


def _estimate_prompt_tokens(messages: Iterable[Mapping[str, Any]]) -> int:
    """Approximate token count when real usage data is unavailable."""

    total_chars = 0
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, str):
            total_chars += len(content)
        elif isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    total_chars += len(item["text"])
    return max(0, int(total_chars / 4))


def uuid4_hex() -> str:
    import uuid

    return uuid.uuid4().hex


@dataclass
class RouteObservation:
    """Captures the lifecycle of an AI route invocation."""

    recorder: "ObservabilityRecorder"
    route: str
    note_hash: Optional[str]
    cache_state: str
    trace_id: Optional[str]
    metadata: Dict[str, Any] = field(default_factory=dict)
    model: Optional[str] = None
    status: str = "success"
    error_detail: Optional[str] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    duration_ms: float = 0.0
    price_usd: float = 0.0
    started_at: float = field(default_factory=time.perf_counter)
    started_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: Optional[datetime] = None

    def mark_failure(self, detail: Any, *, trace_id: Optional[str] = None) -> None:
        self.status = "error"
        self.error_detail = _sanitize_value(detail, limit=200)
        if trace_id:
            self.trace_id = _sanitize_value(trace_id, limit=64)

    def set_cache_state(self, state: str) -> None:
        if state:
            self.cache_state = _sanitize_value(state, limit=32).lower() or "cold"

    def set_model(self, model: Optional[str]) -> None:
        if model:
            self.model = _sanitize_value(model, limit=80)

    def add_metadata(self, key: str, value: Any) -> None:
        safe_key = _sanitize_value(key, limit=48) or "key"
        self.metadata[safe_key] = _sanitize_value(value)

    def add_tokens(self, prompt: int = 0, completion: int = 0) -> None:
        if prompt:
            self.prompt_tokens += max(0, int(prompt))
        if completion:
            self.completion_tokens += max(0, int(completion))
        self.total_tokens = self.prompt_tokens + self.completion_tokens

    def _finalise(self) -> None:
        end = time.perf_counter()
        self.duration_ms = max(0.0, (end - self.started_at) * 1000.0)
        self.finished_at = datetime.now(timezone.utc)
        if not self.trace_id:
            self.trace_id = uuid4_hex()
        self.price_usd = self.recorder.compute_price(
            model=self.model,
            prompt_tokens=self.prompt_tokens,
            completion_tokens=self.completion_tokens,
        )


class ObservationContext:
    """Context manager used internally to manage observation state."""

    def __init__(self, observation: RouteObservation) -> None:
        self._observation = observation
        self._token = None

    def __enter__(self) -> RouteObservation:
        self._token = _CURRENT_OBSERVATION.set(self._observation)
        return self._observation

    def __exit__(self, exc_type, exc, _tb) -> bool:
        if exc is not None:
            self._observation.mark_failure(exc)
        if self._token is not None:
            _CURRENT_OBSERVATION.reset(self._token)
        self._observation.recorder.finish_observation(self._observation)
        return False


class ObservabilityRecorder:
    """Persist AI route telemetry and compute aggregated analytics."""

    def __init__(
        self,
        get_connection: Callable[[], Any],
        *,
        alert_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        metrics_callback: Optional[Callable[[RouteObservation], None]] = None,
    ) -> None:
        self._get_connection = get_connection
        self._alert_callback = alert_callback
        self._metrics_callback = metrics_callback
        self._latency_slo_ms = float(os.getenv("AI_ROUTE_LATENCY_SLO_MS", "2500"))
        self._model_pricing = self._load_model_pricing()

    # ------------------------------------------------------------------
    # Observation lifecycle
    # ------------------------------------------------------------------

    def observe_route(
        self,
        route: str,
        *,
        note_id: Optional[str] = None,
        cache_state: str = "cold",
        model: Optional[str] = None,
        trace_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ObservationContext:
        sanitized_route = _sanitize_value(route, limit=64) or "unknown"
        note_hash = _hash_identifier(note_id)
        observation = RouteObservation(
            recorder=self,
            route=sanitized_route,
            note_hash=note_hash,
            cache_state=_sanitize_value(cache_state, limit=32).lower() or "cold",
            trace_id=_sanitize_value(trace_id, limit=64) if trace_id else None,
            metadata={},
        )
        if metadata:
            for key, value in metadata.items():
                observation.add_metadata(key, value)
        if model:
            observation.set_model(model)
        return ObservationContext(observation)

    def finish_observation(self, observation: RouteObservation) -> None:
        observation._finalise()
        self._persist(observation)
        if self._metrics_callback:
            try:
                self._metrics_callback(observation)
            except Exception:  # pragma: no cover - defensive
                logger.exception("observability_metrics_callback_failed")
        self._emit_alerts(observation)

    # ------------------------------------------------------------------
    # Token recording helpers used by ``openai_client``
    # ------------------------------------------------------------------

    def capture_tokens(
        self,
        prompt_tokens: int,
        completion_tokens: int,
        *,
        model: Optional[str] = None,
    ) -> None:
        observation = _CURRENT_OBSERVATION.get()
        if not observation:
            return
        observation.add_tokens(prompt_tokens, completion_tokens)
        if model:
            observation.set_model(model)

    def capture_prompt_estimate(
        self,
        messages: Iterable[Mapping[str, Any]],
        *,
        model: Optional[str] = None,
    ) -> None:
        observation = _CURRENT_OBSERVATION.get()
        if not observation:
            return
        observation.add_tokens(prompt=_estimate_prompt_tokens(messages), completion=0)
        if model:
            observation.set_model(model)

    # ------------------------------------------------------------------
    # AI gate decision recording
    # ------------------------------------------------------------------

    def record_gate_decision(
        self,
        *,
        route: str,
        allowed: bool,
        reason: Optional[str],
        model: Optional[str],
        clinician_id: Optional[int],
        note_id: Optional[str],
        delta_chars: Optional[int],
        metadata: Optional[Mapping[str, Any]] = None,
    ) -> None:
        sanitized_route = _sanitize_value(route, limit=64) or "unknown"
        sanitized_reason = _sanitize_value(reason, limit=64) if reason else None
        sanitized_model = _sanitize_value(model, limit=80) if model else None
        note_hash = _hash_identifier(note_id)
        clinician_hash = _hash_identifier(str(clinician_id)) if clinician_id is not None else None

        metadata_payload: Dict[str, Any] | None = None
        if metadata:
            cleaned: Dict[str, Any] = {}
            for key, value in metadata.items():
                safe_key = _sanitize_value(key, limit=48)
                if not safe_key:
                    continue
                if isinstance(value, (int, float, bool)):
                    cleaned[safe_key] = value
                elif value is None:
                    continue
                else:
                    cleaned[safe_key] = _sanitize_value(value)
            if cleaned:
                metadata_payload = cleaned

        conn = self._get_connection()
        with session_scope(conn) as session:
            row = db_models.AIGateDecisionRecord(
                decision_id=uuid4_hex(),
                route=sanitized_route,
                allowed=bool(allowed),
                reason=sanitized_reason,
                model=sanitized_model,
                note_hash=note_hash,
                clinician_hash=clinician_hash,
                delta_chars=int(delta_chars) if delta_chars is not None else None,
                metadata_payload=metadata_payload,
            )
            session.add(row)

    # ------------------------------------------------------------------
    # Data persistence and aggregation
    # ------------------------------------------------------------------

    def _persist(self, observation: RouteObservation) -> None:
        conn = self._get_connection()
        with session_scope(conn) as session:
            row = db_models.AIRouteInvocation(
                invocation_id=uuid4_hex(),
                route=observation.route,
                status=observation.status,
                cache_state=observation.cache_state,
                model=observation.model,
                prompt_tokens=observation.prompt_tokens,
                completion_tokens=observation.completion_tokens,
                total_tokens=observation.total_tokens,
                duration_ms=observation.duration_ms,
                price_usd=observation.price_usd,
                note_hash=observation.note_hash,
                trace_id=observation.trace_id,
                error_detail=observation.error_detail,
                metadata_payload=observation.metadata or None,
                started_at=observation.started_time,
                finished_at=observation.finished_at,
            )
            session.add(row)

    def _emit_alerts(self, observation: RouteObservation) -> None:
        if not self._alert_callback:
            return
        payload = {
            "route": observation.route,
            "traceId": observation.trace_id,
        }
        if observation.status == "error":
            payload.update({"type": "error", "detail": observation.error_detail})
            try:
                self._alert_callback(payload)
            except Exception:  # pragma: no cover - defensive
                logger.exception("observability_alert_error")
        slo = self._latency_slo_ms
        if slo and observation.duration_ms > slo:
            payload.update(
                {"type": "latency_breach", "duration_ms": observation.duration_ms}
            )
            try:
                self._alert_callback(payload)
            except Exception:  # pragma: no cover - defensive
                logger.exception("observability_alert_latency_failed")

    # ------------------------------------------------------------------
    # Pricing helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _load_model_pricing() -> Dict[str, Dict[str, float]]:
        default_prompt = float(os.getenv("AI_PROMPT_COST_PER_1K", "0.005"))
        default_completion = float(os.getenv("AI_COMPLETION_COST_PER_1K", "0.015"))
        pricing = {
            "gpt-4o": {
                "prompt": default_prompt,
                "completion": default_completion,
            },
            "gpt-4o-mini": {
                "prompt": float(os.getenv("AI_MINI_PROMPT_COST_PER_1K", "0.00015")),
                "completion": float(os.getenv("AI_MINI_COMPLETION_COST_PER_1K", "0.0006")),
            },
        }
        extra = os.getenv("AI_MODEL_PRICING")
        if extra:
            try:
                parsed = json.loads(extra)
                if isinstance(parsed, dict):
                    for model, data in parsed.items():
                        if not isinstance(data, Mapping):
                            continue
                        prompt = float(
                            data.get(
                                "prompt",
                                pricing.get(model, {}).get("prompt", default_prompt),
                            )
                        )
                        completion = float(
                            data.get(
                                "completion",
                                pricing.get(model, {}).get(
                                    "completion", default_completion
                                ),
                            )
                        )
                        pricing[_sanitize_value(model, limit=80)] = {
                            "prompt": prompt,
                            "completion": completion,
                        }
            except Exception:  # pragma: no cover - defensive parsing
                logger.warning("ai_model_pricing_parse_failed")
        pricing["default"] = {"prompt": default_prompt, "completion": default_completion}
        return pricing

    def compute_price(
        self,
        *,
        model: Optional[str],
        prompt_tokens: int,
        completion_tokens: int,
    ) -> float:
        key = model or "default"
        if key not in self._model_pricing:
            key = "default"
        rates = self._model_pricing[key]
        total = 0.0
        if prompt_tokens:
            total += (prompt_tokens / 1000.0) * rates["prompt"]
        if completion_tokens:
            total += (completion_tokens / 1000.0) * rates["completion"]
        return round(total, 6)

    # ------------------------------------------------------------------
    # Dashboard aggregation
    # ------------------------------------------------------------------

    def build_dashboard(
        self,
        *,
        hours: int = 24,
        route: Optional[str] = None,
        failure_limit: int = 20,
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(hours=max(1, hours))
        conn = self._get_connection()
        sanitized_route = _sanitize_value(route, limit=64) if route else None
        with session_scope(conn) as session:
            query = session.query(db_models.AIRouteInvocation).filter(
                db_models.AIRouteInvocation.started_at >= window_start
            )
            if sanitized_route:
                query = query.filter(db_models.AIRouteInvocation.route == sanitized_route)
            records: List[db_models.AIRouteInvocation] = query.all()
            all_routes = (
                session.query(db_models.AIRouteInvocation.route)
                .distinct()
                .order_by(db_models.AIRouteInvocation.route.asc())
                .all()
            )

        available_routes = [row[0] for row in all_routes]
        by_route: Dict[str, List[db_models.AIRouteInvocation]] = defaultdict(list)
        for record in records:
            by_route[record.route].append(record)

        route_payload: List[Dict[str, Any]] = []
        route_trends: Dict[str, List[Dict[str, Any]]] = {}
        recent_failures: List[Dict[str, Any]] = []
        cost_by_route_model: List[Dict[str, Any]] = []

        for route_name, items in sorted(by_route.items()):
            runs = len(items)
            successes = sum(1 for item in items if item.status == "success")
            errors = runs - successes
            durations = [item.duration_ms for item in items]
            cache_counts = defaultdict(int)
            total_prompt = 0
            total_completion = 0
            total_cost = 0.0
            note_cost: Dict[str, float] = defaultdict(float)
            for item in items:
                cache_counts[(item.cache_state or "cold").lower()] += 1
                total_prompt += item.prompt_tokens or 0
                total_completion += item.completion_tokens or 0
                total_cost += item.price_usd or 0.0
                if item.note_hash and item.status == "success":
                    note_cost[item.note_hash] += item.price_usd or 0.0
                if item.status != "success" and len(recent_failures) < failure_limit:
                    failure_payload = {
                        "route": route_name,
                        "traceId": item.trace_id,
                        "detail": item.error_detail,
                        "occurredAt": _ensure_timezone(item.finished_at or item.started_at).isoformat()
                        if (item.finished_at or item.started_at)
                        else None,
                    }
                    if item.trace_id:
                        failure_payload["traceUrl"] = (
                            f"/status/observability/trace/{item.trace_id}"
                        )
                    recent_failures.append(failure_payload)

            cache_payload = {
                "cold": cache_counts.get("cold", 0),
                "warm": cache_counts.get("warm", 0),
                "other": cache_counts.get("other", 0),
            }
            p50 = _percentile(durations, 0.5)
            p95 = _percentile(durations, 0.95)
            distinct_notes = len(note_cost)
            avg_cost = (sum(note_cost.values()) / distinct_notes) if distinct_notes else 0.0

            route_payload.append(
                {
                    "route": route_name,
                    "runs": runs,
                    "successes": successes,
                    "errors": errors,
                    "latency": {"p50_ms": round(p50, 3), "p95_ms": round(p95, 3)},
                    "tokens": {
                        "prompt_total": total_prompt,
                        "completion_total": total_completion,
                        "total": total_prompt + total_completion,
                        "avg_total": round((total_prompt + total_completion) / runs, 2)
                        if runs
                        else 0.0,
                    },
                    "cache": cache_payload,
                    "cost": {
                        "total_usd": round(total_cost, 4),
                        "per_note_usd": round(avg_cost, 4),
                    },
                }
            )

            model_costs: Dict[str, Dict[str, Any]] = defaultdict(
                lambda: {"route": route_name, "model": "unknown", "calls": 0, "total_usd": 0.0}
            )
            bucket_map: Dict[str, List[float]] = defaultdict(list)
            bucket_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: {"runs": 0, "errors": 0})
            for item in items:
                bucket_dt = _ensure_timezone(item.started_at)
                if bucket_dt is None:
                    continue
                bucket_key = bucket_dt.replace(minute=0, second=0, microsecond=0).isoformat()
                bucket_map[bucket_key].append(item.duration_ms)
                bucket_counts[bucket_key]["runs"] += 1
                if item.status != "success":
                    bucket_counts[bucket_key]["errors"] += 1
                model_name = _sanitize_value(item.model, limit=80) if item.model else "unknown"
                group = model_costs[model_name]
                group["model"] = model_name
                group["calls"] += 1
                group["total_usd"] += float(item.price_usd or 0.0)
            trend_points = []
            for bucket_key in sorted(bucket_map.keys()):
                durations_bucket = bucket_map[bucket_key]
                trend_points.append(
                    {
                        "bucket": bucket_key,
                        "runs": bucket_counts[bucket_key]["runs"],
                        "errors": bucket_counts[bucket_key]["errors"],
                        "p95_latency_ms": round(_percentile(durations_bucket, 0.95), 3),
                        "avg_latency_ms": round(sum(durations_bucket) / len(durations_bucket), 3),
                    }
            )
            route_trends[route_name] = trend_points

            for model_name in sorted(model_costs.keys()):
                entry = model_costs[model_name]
                calls = entry["calls"] or 0
                total_cost = entry["total_usd"]
                avg_cost = (total_cost / calls) if calls else 0.0
                cost_by_route_model.append(
                    {
                        "route": entry["route"],
                        "model": entry["model"],
                        "calls": calls,
                        "totalUsd": round(total_cost, 6),
                        "avgUsd": round(avg_cost, 6),
                    }
                )

        recent_failures.sort(key=lambda item: item.get("occurredAt") or "", reverse=True)
        if len(recent_failures) > failure_limit:
            recent_failures = recent_failures[:failure_limit]

        queue_metrics = self._queue_snapshot(window_start)
        gate_metrics = self._gate_summary(window_start, sanitized_route)
        gate_metrics["costByRouteModel"] = cost_by_route_model

        return {
            "generatedAt": now.isoformat(),
            "window": {
                "start": window_start.isoformat(),
                "end": now.isoformat(),
            },
            "routes": route_payload,
            "trends": route_trends,
            "recentFailures": recent_failures,
            "availableRoutes": available_routes,
            "queue": queue_metrics,
            "gate": gate_metrics,
        }

    def _queue_snapshot(self, window_start: datetime) -> Dict[str, Any]:
        conn = self._get_connection()
        with session_scope(conn) as session:
            query = session.query(db_models.ChartParseJob)
            if window_start:
                query = query.filter(db_models.ChartParseJob.created_at >= window_start)
            jobs: List[db_models.ChartParseJob] = query.all()
        stages = defaultdict(lambda: defaultdict(int))
        waits: Dict[str, List[float]] = defaultdict(list)
        runs: Dict[str, List[float]] = defaultdict(list)
        for job in jobs:
            stage = job.stage or "unknown"
            state = job.state or "unknown"
            stages[stage][state] += 1
            created = _ensure_timezone(job.created_at)
            started = _ensure_timezone(job.started_at)
            finished = _ensure_timezone(job.finished_at)
            if created and started:
                wait_ms = max(0.0, (started - created).total_seconds() * 1000.0)
                waits[stage].append(wait_ms)
            if started and finished:
                run_ms = max(0.0, (finished - started).total_seconds() * 1000.0)
                runs[stage].append(run_ms)

        stage_payload = []
        for stage, counts in stages.items():
            stage_payload.append(
                {
                    "stage": stage,
                    "states": dict(counts),
                    "latency": {
                        "p95_wait_ms": round(_percentile(waits.get(stage, []), 0.95), 3),
                        "p95_run_ms": round(_percentile(runs.get(stage, []), 0.95), 3),
                    },
                }
            )
        stage_payload.sort(key=lambda item: item["stage"])
        return {"stages": stage_payload}

    def _gate_summary(
        self, window_start: datetime, route: Optional[str]
    ) -> Dict[str, Any]:
        conn = self._get_connection()
        sanitized_route = _sanitize_value(route, limit=64) if route else None
        with session_scope(conn) as session:
            query = session.query(db_models.AIGateDecisionRecord).filter(
                db_models.AIGateDecisionRecord.created_at >= window_start
            )
            if sanitized_route:
                query = query.filter(db_models.AIGateDecisionRecord.route == sanitized_route)
            decisions: List[db_models.AIGateDecisionRecord] = query.all()

        allowed_reasons: Dict[str, int] = defaultdict(int)
        blocked_reasons: Dict[str, int] = defaultdict(int)
        allowed_count = 0
        blocked_count = 0
        total_delta_allowed = 0.0

        for decision in decisions:
            if decision.allowed:
                allowed_count += 1
                reason_label = decision.reason or "allowed"
                allowed_reasons[reason_label] += 1
                if decision.delta_chars is not None:
                    total_delta_allowed += max(0.0, float(decision.delta_chars))
            else:
                blocked_count += 1
                reason_label = decision.reason or "unknown"
                blocked_reasons[reason_label] += 1

        def _format_reason_counts(mapping: Dict[str, int]) -> List[Dict[str, Any]]:
            return [
                {"reason": key, "count": mapping[key]}
                for key in sorted(mapping.keys(), key=lambda name: (-mapping[name], name))
            ]

        avg_edits = 0.0
        if allowed_count:
            avg_edits = total_delta_allowed / allowed_count

        return {
            "counts": {
                "allowed": allowed_count,
                "blocked": blocked_count,
                "total": allowed_count + blocked_count,
            },
            "allowedReasons": _format_reason_counts(allowed_reasons),
            "blockedReasons": _format_reason_counts(blocked_reasons),
            "avgEditsPerAllowed": round(avg_edits, 2),
        }

    # ------------------------------------------------------------------
    # Lookup helpers
    # ------------------------------------------------------------------

    def get_invocation(self, trace_id: str) -> Optional[Dict[str, Any]]:
        sanitized = _sanitize_value(trace_id, limit=64)
        if not sanitized:
            return None
        conn = self._get_connection()
        with session_scope(conn) as session:
            row = (
                session.query(db_models.AIRouteInvocation)
                .filter(db_models.AIRouteInvocation.trace_id == sanitized)
                .order_by(db_models.AIRouteInvocation.finished_at.desc())
                .first()
            )
        if row is None:
            return None
        started = _ensure_timezone(row.started_at)
        finished = _ensure_timezone(row.finished_at)
        return {
            "invocationId": row.invocation_id,
            "traceId": row.trace_id,
            "route": row.route,
            "status": row.status,
            "cacheState": row.cache_state,
            "model": row.model,
            "durationMs": row.duration_ms,
            "tokens": {
                "prompt": row.prompt_tokens or 0,
                "completion": row.completion_tokens or 0,
                "total": row.total_tokens or 0,
            },
            "cost": {
                "totalUsd": round(row.price_usd or 0.0, 6),
            },
            "noteHash": row.note_hash,
            "errorDetail": row.error_detail,
            "metadata": row.metadata_payload or {},
            "startedAt": started.isoformat() if started else None,
            "finishedAt": finished.isoformat() if finished else None,
        }

    # ------------------------------------------------------------------
    # Maintenance helpers (primarily for tests)
    # ------------------------------------------------------------------

    def reset(self) -> None:
        conn = self._get_connection()
        with session_scope(conn) as session:
            session.query(db_models.AIRouteInvocation).delete()
            session.query(db_models.AIGateDecisionRecord).delete()


# ---------------------------------------------------------------------------
# Module-level helpers used throughout the backend
# ---------------------------------------------------------------------------


def configure_recorder(recorder: ObservabilityRecorder | None) -> None:
    global _RECORDER
    _RECORDER = recorder


@contextmanager
def observe_ai_route(**kwargs) -> Iterator[RouteObservation]:
    if _RECORDER is None:
        with nullcontext() as observation:
            yield observation
        return
    context = _RECORDER.observe_route(**kwargs)
    observation = context.__enter__()
    try:
        yield observation
    except Exception:
        # Ensure errors propagate through ``ObservationContext`` handling.
        context.__exit__(*sys.exc_info())  # type: ignore[arg-type]
        raise
    else:
        context.__exit__(None, None, None)


def capture_openai_usage(prompt_tokens: int, completion_tokens: int, *, model: Optional[str] = None) -> None:
    if _RECORDER is None:
        return
    _RECORDER.capture_tokens(prompt_tokens, completion_tokens, model=model)


def capture_prompt_estimate(messages: Iterable[Mapping[str, Any]], *, model: Optional[str] = None) -> None:
    if _RECORDER is None:
        return
    _RECORDER.capture_prompt_estimate(messages, model=model)


def record_gate_decision(
    *,
    route: str,
    allowed: bool,
    reason: Optional[str],
    model: Optional[str],
    clinician_id: Optional[int] = None,
    note_id: Optional[str] = None,
    delta_chars: Optional[int] = None,
    metadata: Optional[Mapping[str, Any]] = None,
) -> None:
    if _RECORDER is None:
        return
    _RECORDER.record_gate_decision(
        route=route,
        allowed=allowed,
        reason=reason,
        model=model,
        clinician_id=clinician_id,
        note_id=note_id,
        delta_chars=delta_chars,
        metadata=metadata,
    )


def build_observability_dashboard(*, hours: int = 24, route: Optional[str] = None) -> Dict[str, Any]:
    if _RECORDER is None:
        return {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "window": {},
            "routes": [],
            "trends": {},
            "recentFailures": [],
            "availableRoutes": [],
            "queue": {"stages": []},
            "gate": {
                "counts": {"allowed": 0, "blocked": 0, "total": 0},
                "allowedReasons": [],
                "blockedReasons": [],
                "avgEditsPerAllowed": 0.0,
                "costByRouteModel": [],
            },
        }
    return _RECORDER.build_dashboard(hours=hours, route=route)


def get_observability_trace(trace_id: str) -> Optional[Dict[str, Any]]:
    if _RECORDER is None:
        return None
    return _RECORDER.get_invocation(trace_id)


def reset_observability_for_tests() -> None:
    if _RECORDER is not None:
        _RECORDER.reset()


