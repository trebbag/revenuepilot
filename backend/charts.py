from __future__ import annotations

"""Helpers for handling uploaded chart files."""

from pathlib import Path
import os

_UPLOAD_DIR = Path(os.getenv("CHART_UPLOAD_DIR", "/tmp/revenuepilot_charts"))
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def process_chart(filename: str, data: bytes) -> None:
    """Persist uploaded chart data to a temporary directory.

    This function is intended to be triggered via ``BackgroundTasks`` and
    simulates the work that would normally be done when processing
    uploaded chart files.
    """

    # Write the file; if anything fails we simply drop the data as this is
    # a demo.  Exceptions are intentionally swallowed so background tasks
    # don't crash the server.
    try:
        (_UPLOAD_DIR / filename).write_bytes(data)
    except Exception:
        pass
