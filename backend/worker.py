import asyncio
import logging
import os
import sys
from collections.abc import Mapping, Sequence
from typing import Any, Awaitable, Callable, Dict, List, Optional

import requests

from backend import code_tables, codes_data, compliance

logger = logging.getLogger(__name__)

# Queue for background jobs
_task_queue: asyncio.Queue[Callable[[], Awaitable[None]]] = asyncio.Queue()
# Track running background tasks so they can be cancelled on shutdown
_background_tasks: List[asyncio.Task] = []

# Optional callback provided by the API to perform analytics aggregation
_aggregate_callback: Optional[Callable[[], Awaitable[None]]] = None


CODE_DATA_URL_ENV = "CODE_DATA_URL"
CPT_DATA_URL_ENV = "CPT_DATA_URL"
ICD10_DATA_URL_ENV = "ICD10_DATA_URL"
HCPCS_DATA_URL_ENV = "HCPCS_DATA_URL"
COMPLIANCE_RULES_URL_ENV = "COMPLIANCE_RULES_URL"

HTTP_TIMEOUT_SECONDS = 20

CODE_REFRESH_INTERVAL = 24 * 60 * 60  # daily
COMPLIANCE_REFRESH_INTERVAL = 4 * 60 * 60  # every four hours
ANALYTICS_REFRESH_INTERVAL = 24 * 60 * 60
MODEL_REFRESH_INTERVAL = 24 * 60 * 60
AUDIT_REFRESH_INTERVAL = 24 * 60 * 60


def _normalize_key(value: str) -> str:
    return value.lower().replace("-", "").replace("_", "")


def _coerce_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _normalize_dataset(entries: Any) -> Dict[str, Dict[str, Any]]:
    """Return a mapping of code -> metadata from ``entries``."""

    result: Dict[str, Dict[str, Any]] = {}

    if isinstance(entries, Mapping):
        iterable = entries.items()
    elif isinstance(entries, Sequence):
        iterable = []
        for item in entries:
            if isinstance(item, Mapping):
                code = item.get("code")
                if code is None:
                    continue
                info = {k: v for k, v in item.items() if k != "code"}
                iterable.append((code, info))
    else:
        return result

    for code, info in iterable:
        code_str = str(code or "").strip().upper()
        if not code_str:
            continue
        if not isinstance(info, Mapping):
            continue
        result[code_str] = dict(info)

    return result


def _update_codes_payload(payload: Mapping[str, Any]) -> Dict[str, Optional[int]]:
    """Update in-memory code datasets using ``payload``."""

    normalized: Dict[str, Any] = {}
    for key, value in payload.items():
        if isinstance(key, str):
            normalized[_normalize_key(key)] = value

    counts: Dict[str, Optional[int]] = {"cpt": None, "icd10": None, "hcpcs": None}

    if "cpt" in normalized:
        cpt_entries = _normalize_dataset(normalized["cpt"])
        codes_data._CPT.clear()
        for code, info in cpt_entries.items():
            base: Dict[str, Any] = {
                "type": "CPT",
                "category": info.get("category") or "codes",
                "description": info.get("description") or info.get("name") or "",
                "rvu": _coerce_float(info.get("rvu")),
                "reimbursement": _coerce_float(info.get("reimbursement")),
            }
            base.update(
                {
                    k: v
                    for k, v in info.items()
                    if k not in {"category", "description", "name", "rvu", "reimbursement"}
                }
            )
            codes_data._CPT[code] = base

        code_tables.CPT_CODES.clear()
        for code, info in cpt_entries.items():
            entry = dict(info)
            entry.setdefault("description", info.get("description") or info.get("name") or "")
            entry["rvu"] = _coerce_float(entry.get("rvu"))
            entry["reimbursement"] = _coerce_float(entry.get("reimbursement"))
            entry.setdefault("documentation", {"required": [], "recommended": [], "examples": []})
            entry.setdefault("icd10_prefixes", [])
            entry.setdefault("demographics", {})
            entry.setdefault("encounterTypes", [])
            entry.setdefault("specialties", [])
            code_tables.CPT_CODES[code] = entry

        codes_data.load_code_metadata.cache_clear()

        main_module = sys.modules.get("backend.main")
        if main_module is not None:
            try:
                main_module.CPT_REVENUE = {
                    code: _coerce_float(info.get("reimbursement")) for code, info in cpt_entries.items()
                }
            except Exception:  # pragma: no cover - defensive
                logger.exception("Failed to update CPT revenue table")

        counts["cpt"] = len(cpt_entries)

    if "icd10" in normalized:
        icd_entries = _normalize_dataset(normalized["icd10"])
        codes_data._ICD10.clear()
        for code, info in icd_entries.items():
            base = {
                "type": "ICD-10",
                "category": info.get("category") or "diagnoses",
                "description": info.get("description") or info.get("name") or "",
                "rvu": _coerce_float(info.get("rvu")),
                "reimbursement": _coerce_float(info.get("reimbursement")),
            }
            base.update(
                {
                    k: v
                    for k, v in info.items()
                    if k not in {"category", "description", "name", "rvu", "reimbursement"}
                }
            )
            codes_data._ICD10[code] = base

        code_tables.ICD10_CODES.clear()
        for code, info in icd_entries.items():
            entry = dict(info)
            entry.setdefault("description", info.get("description") or info.get("name") or "")
            entry.setdefault("clinicalContext", info.get("clinicalContext") or "")
            entry.setdefault("documentation", {"required": [], "recommended": [], "examples": []})
            entry.setdefault("contraindications", [])
            entry.setdefault("demographics", {})
            entry.setdefault("encounterTypes", [])
            entry.setdefault("specialties", [])
            entry["rvu"] = _coerce_float(entry.get("rvu"))
            entry["reimbursement"] = _coerce_float(entry.get("reimbursement"))
            code_tables.ICD10_CODES[code] = entry

        codes_data.load_code_metadata.cache_clear()
        counts["icd10"] = len(icd_entries)

    if "hcpcs" in normalized:
        hcpcs_entries = _normalize_dataset(normalized["hcpcs"])
        codes_data._HCPCS.clear()
        for code, info in hcpcs_entries.items():
            base = {
                "type": "HCPCS",
                "category": info.get("category") or "codes",
                "description": info.get("description") or info.get("name") or "",
                "rvu": _coerce_float(info.get("rvu")),
                "reimbursement": _coerce_float(info.get("reimbursement")),
            }
            base.update(
                {
                    k: v
                    for k, v in info.items()
                    if k not in {"category", "description", "name", "rvu", "reimbursement"}
                }
            )
            codes_data._HCPCS[code] = base

        codes_data.load_code_metadata.cache_clear()
        counts["hcpcs"] = len(hcpcs_entries)

    return counts


def _update_compliance_payload(payload: Mapping[str, Any]) -> Dict[str, Optional[int]]:
    counts: Dict[str, Optional[int]] = {"rules": None, "resources": None}

    if "rules" in payload:
        rules_raw = payload.get("rules")
        if not isinstance(rules_raw, Sequence):
            raise ValueError("rules payload must be a sequence")
        rules = [dict(item) for item in rules_raw if isinstance(item, Mapping)]
        counts["rules"] = compliance.replace_rules(rules)

    if "resources" in payload:
        resources_raw = payload.get("resources")
        if not isinstance(resources_raw, Sequence):
            raise ValueError("resources payload must be a sequence")
        resources = [dict(item) for item in resources_raw if isinstance(item, Mapping)]
        compliance._RESOURCE_LIBRARY = resources
        counts["resources"] = len(resources)

    return counts


def _download_json(url: str) -> Any:
    response = requests.get(url, timeout=HTTP_TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.json()


async def _fetch_json(url: str) -> Any:
    return await asyncio.to_thread(_download_json, url)


async def update_code_databases() -> None:
    """Fetch and reload CPT/ICD-10/HCPCS datasets."""

    logger.info("Refreshing code datasets")

    code_data_url = os.getenv(CODE_DATA_URL_ENV)
    sources = {
        "combined": code_data_url,
        "cpt": os.getenv(CPT_DATA_URL_ENV),
        "icd10": os.getenv(ICD10_DATA_URL_ENV),
        "hcpcs": os.getenv(HCPCS_DATA_URL_ENV),
    }

    if not any(sources.values()):
        logger.debug("No code dataset URLs configured; skipping refresh")
        return

    try:
        if sources["combined"]:
            payload = await _fetch_json(sources["combined"] or "")
            if not isinstance(payload, Mapping):
                raise ValueError("Combined code dataset must be a mapping")
            counts = _update_codes_payload(payload)
        else:
            payload: Dict[str, Any] = {}
            for key in ("cpt", "icd10", "hcpcs"):
                url = sources.get(key)
                if not url:
                    continue
                payload[key] = await _fetch_json(url)
            if not payload:
                logger.debug("No individual code dataset URLs resolved; skipping refresh")
                return
            counts = _update_codes_payload(payload)
    except Exception:
        logger.exception("Failed to refresh code datasets")
        return

    counts_display = ", ".join(
        f"{name.upper()}={(counts[name] if counts[name] is not None else 'unchanged')}"
        for name in ("cpt", "icd10", "hcpcs")
    )
    logger.info("Code datasets refreshed (%s)", counts_display)


async def check_compliance_rules() -> None:
    """Pull the latest compliance rules and resources."""

    logger.info("Refreshing compliance catalogue")

    url = os.getenv(COMPLIANCE_RULES_URL_ENV)
    if not url:
        logger.debug("No compliance rules URL configured; skipping refresh")
        return

    try:
        payload = await _fetch_json(url)
        if not isinstance(payload, Mapping):
            raise ValueError("Compliance payload must be a mapping")
        counts = _update_compliance_payload(payload)
    except Exception:
        logger.exception("Failed to refresh compliance rules from %s", url)
        return

    counts_display = ", ".join(
        f"{name}={(counts[name] if counts[name] is not None else 'unchanged')}"
        for name in ("rules", "resources")
    )
    logger.info("Compliance catalogue refreshed (%s)", counts_display)


async def aggregate_analytics_and_backup() -> None:
    """Run the configured analytics aggregation task if available."""

    if _aggregate_callback is None:
        logger.debug("No analytics aggregator configured; skipping job")
        return

    try:
        await _aggregate_callback()
        logger.info("Completed nightly analytics aggregation")
    except Exception:
        logger.exception("Analytics aggregation job failed")


async def retrain_model() -> None:
    """Placeholder task for AI model retraining."""
    logger.info("Retraining AI model")


async def generate_audit_trail() -> None:
    """Placeholder task for audit trail generation."""
    logger.info("Generating audit trail")


async def _run_periodic(interval: float, coro: Callable[[], Awaitable[None]]) -> None:
    """Run ``coro`` every ``interval`` seconds."""
    while True:
        try:
            await coro()
        except Exception:
            logger.exception("Scheduled task failed")
        await asyncio.sleep(interval)


async def _worker() -> None:
    """Process queued jobs sequentially."""
    while True:
        job = await _task_queue.get()
        try:
            await job()
        except Exception:
            logger.exception("Worker job failed")
        finally:
            _task_queue.task_done()


def start_scheduler() -> None:
    """Start background scheduler and worker loop."""
    _background_tasks.extend(
        [
            asyncio.create_task(_run_periodic(CODE_REFRESH_INTERVAL, update_code_databases)),
            asyncio.create_task(_run_periodic(COMPLIANCE_REFRESH_INTERVAL, check_compliance_rules)),
            asyncio.create_task(
                _run_periodic(ANALYTICS_REFRESH_INTERVAL, aggregate_analytics_and_backup)
            ),
            asyncio.create_task(_run_periodic(MODEL_REFRESH_INTERVAL, queue_model_retraining)),
            asyncio.create_task(_run_periodic(AUDIT_REFRESH_INTERVAL, queue_audit_trail_generation)),
            asyncio.create_task(_worker()),
        ]
    )


def queue_model_retraining() -> Awaitable[None]:
    """Queue the AI model retraining task."""
    return _task_queue.put(retrain_model)


def queue_audit_trail_generation() -> Awaitable[None]:
    """Queue the audit trail generation task."""
    return _task_queue.put(generate_audit_trail)


async def stop_scheduler() -> None:
    """Cancel all running background tasks."""
    for task in _background_tasks:
        task.cancel()
    await asyncio.gather(*_background_tasks, return_exceptions=True)
    _background_tasks.clear()


def register_analytics_aggregator(callback: Callable[[], Awaitable[None]]) -> None:
    """Register the coroutine used for nightly analytics aggregation."""

    global _aggregate_callback
    _aggregate_callback = callback

