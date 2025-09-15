import asyncio
import logging
from typing import Awaitable, Callable, List, Optional

logger = logging.getLogger(__name__)

# Queue for background jobs
_task_queue: asyncio.Queue[Callable[[], Awaitable[None]]] = asyncio.Queue()
# Track running background tasks so they can be cancelled on shutdown
_background_tasks: List[asyncio.Task] = []

# Optional callback provided by the API to perform analytics aggregation
_aggregate_callback: Optional[Callable[[], Awaitable[None]]] = None


async def update_code_databases() -> None:
    """Placeholder task to refresh code databases."""
    logger.info("Updating code databases")


async def check_compliance_rules() -> None:
    """Placeholder task to check compliance rules."""
    logger.info("Checking compliance rules")


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
            asyncio.create_task(_run_periodic(24 * 60 * 60, update_code_databases)),
            asyncio.create_task(_run_periodic(4 * 60 * 60, check_compliance_rules)),
            asyncio.create_task(_run_periodic(24 * 60 * 60, aggregate_analytics_and_backup)),
            asyncio.create_task(_run_periodic(24 * 60 * 60, queue_model_retraining)),
            asyncio.create_task(_run_periodic(24 * 60 * 60, queue_audit_trail_generation)),
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

