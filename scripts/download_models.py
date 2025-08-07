#!/usr/bin/env python3
"""Download and cache small Hugging Face models for offline use.

This utility fetches the tiny sample models referenced in the
documentation so the backend can run without network access. The models
are loaded through the :func:`transformers.pipeline` API to ensure all
weights are cached locally. Whisper models are handled via the
``whisper`` package if installed.
"""
from __future__ import annotations

import argparse
import logging
import os
from typing import Dict


def _download_transformer(task: str, model: str) -> None:
    """Download a model via ``transformers`` pipeline."""
    from transformers import pipeline  # type: ignore

    logging.info("Downloading %s model %s", task, model)
    pipe = pipeline(task, model=model)
    # Run a dummy inference to force weight caching
    pipe("sample input")


def _download_whisper(model: str) -> None:
    """Download a Whisper speech-to-text model if the package is available."""
    try:
        import whisper  # type: ignore
    except Exception:
        logging.warning("whisper package not installed; skipping")
        return

    logging.info("Downloading Whisper model %s", model)
    whisper.load_model(model)


DEFAULT_MODELS: Dict[str, str] = {
    "beautify": "hf-internal-testing/tiny-random-t5",
    "summarize": "sshleifer/tiny-bart-large-cnn",
    "suggest": "hf-internal-testing/tiny-random-gpt2",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Download local models")
    parser.add_argument(
        "--beautify",
        default=os.getenv("LOCAL_BEAUTIFY_MODEL", DEFAULT_MODELS["beautify"]),
        help="Model name or path for beautify pipeline",
    )
    parser.add_argument(
        "--summarize",
        default=os.getenv("LOCAL_SUMMARIZE_MODEL", DEFAULT_MODELS["summarize"]),
        help="Model name for summarization",
    )
    parser.add_argument(
        "--suggest",
        default=os.getenv("LOCAL_SUGGEST_MODEL", DEFAULT_MODELS["suggest"]),
        help="Model name or path for suggestion generation",
    )
    parser.add_argument(
        "--whisper",
        default=os.getenv("WHISPER_MODEL", "base"),
        help="Whisper model size",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    try:
        _download_transformer("text2text-generation", args.beautify)
    except Exception as exc:  # pragma: no cover - network failures
        logging.error("Failed to download beautify model: %s", exc)

    try:
        _download_transformer("summarization", args.summarize)
    except Exception as exc:  # pragma: no cover
        logging.error("Failed to download summarize model: %s", exc)

    try:
        _download_transformer("text-generation", args.suggest)
    except Exception as exc:  # pragma: no cover
        logging.error("Failed to download suggest model: %s", exc)

    try:
        _download_whisper(args.whisper)
    except Exception as exc:  # pragma: no cover
        logging.error("Failed to download Whisper model: %s", exc)

    logging.info("Done")


if __name__ == "__main__":
    main()
