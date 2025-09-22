from __future__ import annotations

"""Helpers for handling uploaded chart files."""

from pathlib import Path
import logging
import os


logger = logging.getLogger(__name__)

_UPLOAD_DIR = Path(os.getenv("CHART_UPLOAD_DIR", "/tmp/revenuepilot_charts"))
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _path_within(base: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(base)
    except ValueError:
        return False
    return True


def _get_upload_dir() -> Path:
    override = os.getenv("CHART_UPLOAD_DIR")
    if override:
        return Path(override)
    return _UPLOAD_DIR


def process_chart(filename: str, data: bytes) -> Path | None:
    """Persist uploaded chart data to a temporary directory.

    The incoming *filename* is sanitised in the same way as the
    ``/api/charts/upload`` endpoint to ensure background processing cannot
    traverse outside of :data:`_UPLOAD_DIR`.
    """

    upload_dir = _get_upload_dir()
    upload_dir.mkdir(parents=True, exist_ok=True)

    from backend.main import sanitize_chart_filename

    sanitized = sanitize_chart_filename(filename)
    base_dir = upload_dir.resolve()
    destination = (base_dir / sanitized).resolve()
    if not _path_within(base_dir, destination):
        logger.warning(
            "chart_upload.rejected sanitized=%s reason=%s",
            sanitized,
            "outside_upload_dir",
        )
        raise ValueError("Resolved chart path escapes upload directory")

    try:
        destination.write_bytes(data)
    except Exception as exc:  # pragma: no cover - filesystem dependent failures
        logger.warning(
            "chart_upload.write_failed sanitized=%s error=%s",
            sanitized,
            exc,
        )
        return None

    logger.info(
        "chart_upload.persisted sanitized=%s size=%s",
        sanitized,
        len(data),
    )
    return destination
