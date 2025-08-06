"""Offline placeholders and optional local model evaluation for API endpoints.

This module backs the ``/beautify``, ``/suggest`` and ``/summarize``
endpoints when the environment variable ``USE_OFFLINE_MODEL`` is enabled.
By default it returns deterministic strings and lists so the backend can run
without network access.  If ``USE_LOCAL_MODELS`` is set, lightweight
``transformers`` pipelines can be used to evaluate local models instead.  Any
error loading or running the model results in the deterministic placeholder so
the caller always receives a response.
"""

from __future__ import annotations

import json
import os
from typing import Dict, List, Optional, Any


_PIPELINES = {}


def _get_pipeline(task: str, model: str):
    """Lazy-load and cache a ``transformers`` pipeline.

    Parameters
    ----------
    task:
        The pipeline task, e.g. ``"summarization"``.
    model:
        Model identifier to pass to :func:`transformers.pipeline`.
    """

    key = (task, model)
    if key not in _PIPELINES:
        from transformers import pipeline  # Imported lazily for performance

        _PIPELINES[key] = pipeline(task, model=model)
    return _PIPELINES[key]


def _use_local() -> bool:
    return os.getenv("USE_LOCAL_MODELS", "").lower() in {"1", "true", "yes"}


def beautify(
    text: str,
    lang: str = "en",
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
    use_local: Optional[bool] = None,
) -> str:
    """Beautify ``text`` using a local model or deterministic placeholder."""

    if use_local is None:
        use_local = _use_local()

    if use_local:
        model = os.getenv("LOCAL_BEAUTIFY_MODEL")
        if model:
            try:
                pipe = _get_pipeline("text2text-generation", model)
                return pipe(text)[0]["generated_text"].strip()
            except Exception:
                pass
    return f"Beautified (offline): {text.strip()}"


def summarize(
    text: str,
    lang: str = "en",
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
    patient_age: Optional[int] = None,
    use_local: Optional[bool] = None,
) -> Dict[str, Any]:
    """Summarise ``text`` with a local model or deterministic placeholder."""

    if use_local is None:
        use_local = _use_local()

    if use_local:
        model = os.getenv("LOCAL_SUMMARIZE_MODEL")
        if model:
            try:
                pipe = _get_pipeline("summarization", model)
                result = pipe(text)[0]
                summary_text = result.get("summary_text", "").strip() or result.get(
                    "generated_text", ""
                ).strip()
                return {
                    "summary": summary_text,
                    "recommendations": [],
                    "warnings": [],
                }
            except Exception:
                pass
    snippet = text.strip()[:50]
    return {
        "summary": f"Summary (offline): {snippet}",
        "recommendations": [],
        "warnings": [],
    }


def suggest(
    text: str,
    lang: str = "en",
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
    age: Optional[int] = None,
    sex: Optional[str] = None,
    region: Optional[str] = None,
    use_local: Optional[bool] = None,
) -> Dict[str, List]:
    """Return suggestions via a local model or deterministic placeholder."""

    if use_local is None:
        use_local = _use_local()

    if use_local:
        model = os.getenv("LOCAL_SUGGEST_MODEL")
        if model:
            try:
                pipe = _get_pipeline("text-generation", model)
                raw = pipe(text, max_new_tokens=256)[0]["generated_text"]
                data = json.loads(raw)
                if all(k in data for k in ("codes", "compliance", "publicHealth", "differentials")):
                    return data
            except Exception:
                pass

    return {
        "codes": [
            {
                "code": "00000",
                "rationale": "offline",
                "upgrade_to": "00001",
                "upgrade_path": "00000 → 00001 for demo",
            }
        ],
        "compliance": ["offline compliance"],
        "publicHealth": [
            {"recommendation": "offline public health", "reason": "offline reason"}
        ],
        "differentials": [
            {"diagnosis": "offline differential", "score": 0.5}
        ],
    }
