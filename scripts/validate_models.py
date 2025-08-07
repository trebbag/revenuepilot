#!/usr/bin/env python3
"""Run a basic validation of locally installed models.

Each model is loaded with the same code paths as the backend and invoked
with sample data. If a model fails to load or produce the expected
structure, a deterministic placeholder is returned so callers can see the
fallback behaviour. Results are printed as JSON for easy inspection.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict

# Force local model usage
os.environ.setdefault("USE_OFFLINE_MODEL", "true")
os.environ.setdefault("USE_LOCAL_MODELS", "true")

from backend import offline_model as om
from backend import audio_processing as ap

logging.basicConfig(level=logging.INFO, format="%(message)s")

SAMPLE_NOTE = "Subjective: patient states pain. Objective: vitals stable.".strip()


def _validate_beautify() -> str:
    try:
        out = om.beautify(SAMPLE_NOTE)
        if "Subjective" not in out and "Beautified" not in out:
            raise ValueError("missing SOAP headers")
        return out
    except Exception:
        logging.exception("Beautify model failed; using placeholder")
        return om.beautify(SAMPLE_NOTE, use_local=False)


def _validate_summarize() -> Dict[str, Any]:
    try:
        out = om.summarize(SAMPLE_NOTE)
        if not all(k in out for k in ("summary", "recommendations", "warnings")):
            raise ValueError("bad summarize output")
        return out
    except Exception:
        logging.exception("Summarize model failed; using placeholder")
        return om.summarize(SAMPLE_NOTE, use_local=False)


def _validate_suggest() -> Dict[str, Any]:
    try:
        out = om.suggest(SAMPLE_NOTE)
        if not all(k in out for k in ("codes", "compliance", "publicHealth", "differentials")):
            raise ValueError("bad suggest output")
        return out
    except Exception:
        logging.exception("Suggest model failed; using placeholder")
        return om.suggest(SAMPLE_NOTE, use_local=False)


def _validate_whisper() -> str:
    try:
        # Small byte sample; decoding is handled by simple_transcribe
        text = ap.simple_transcribe(b"hello")
        return text
    except Exception:
        logging.exception("Whisper model failed; returning empty string")
        return ""


def main() -> None:
    results = {
        "beautify": _validate_beautify(),
        "summarize": _validate_summarize(),
        "suggest": _validate_suggest(),
        "whisper": _validate_whisper(),
    }
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
