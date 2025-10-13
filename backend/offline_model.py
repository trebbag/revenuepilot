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


_PIPELINES: Dict[tuple, object] = {}
_LLAMAS: Dict[str, "Llama"] = {}


def _get_pipeline(task: str, model: str):
    """Lazy-load and cache a ``transformers`` pipeline."""

    key = (task, model)
    if key not in _PIPELINES:
        from transformers import pipeline  # Imported lazily for performance

        _PIPELINES[key] = pipeline(task, model=model)
    return _PIPELINES[key]


def _get_llama(model_path: str):
    """Lazy-load and cache a llama.cpp model."""

    if model_path not in _LLAMAS:
        from llama_cpp import Llama  # Imported lazily when needed

        _LLAMAS[model_path] = Llama(
            model_path=model_path,
            n_ctx=int(os.getenv("LLAMA_CTX", "2048")),
            seed=0,
        )
    return _LLAMAS[model_path]


def _use_local() -> bool:
    return os.getenv("USE_LOCAL_MODELS", "").lower() in {"1", "true", "yes"}


def beautify(
    text: str,
    lang: str = "en",
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
    use_local: Optional[bool] = None,
    model_path: Optional[str] = None,
) -> str:
    """Beautify ``text`` via llama.cpp or deterministic placeholder."""

    if use_local is None:
        use_local = _use_local()

    if use_local:
        model = (
            model_path
            or os.getenv("LOCAL_BEAUTIFY_MODEL")
            or os.getenv("LOCAL_LLM_MODEL")
        )
        if model and os.path.exists(model):
            try:
                llm = _get_llama(model)
                prompt = (
                    "You are a helpful assistant that rewrites clinical notes in a "
                    "professional tone.\n\nNote:\n" + text.strip() + "\n\nBeautified:"
                )
                out = llm(
                    prompt,
                    max_tokens=256,
                    temperature=0.0,
                    top_p=1.0,
                )
                result = out["choices"][0]["text"].strip()
                if result:
                    return result
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
    model_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Summarise ``text`` with a local model or deterministic placeholder."""

    if use_local is None:
        use_local = _use_local()

    if use_local:
        model = model_path or os.getenv("LOCAL_SUMMARIZE_MODEL")
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
        # Backward compatibility field; mirrors summary
        "patient_friendly": f"Summary (offline): {snippet}",
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
    model_path: Optional[str] = None,
) -> Dict[str, List]:
    """Return suggestions via a local model or deterministic placeholder."""

    if use_local is None:
        use_local = _use_local()

    if use_local:
        model = (
            model_path
            or os.getenv("LOCAL_SUGGEST_MODEL")
            or os.getenv("LOCAL_LLM_MODEL")
        )
        if model and os.path.exists(model):
            try:
                llm = _get_llama(model)
                prompt = (
                    "You are a medical coding assistant. Given the clinical note "
                    "below, reply with JSON containing keys codes, compliance, "
                    "publicHealth and differentials.\n\nNote:\n"
                    + text.strip()
                    + "\n\nJSON:"
                )
                out = llm(
                    prompt,
                    max_tokens=512,
                    temperature=0.0,
                    top_p=1.0,
                )
                raw = out["choices"][0]["text"].strip()
                data = json.loads(raw)
                if all(
                    k in data for k in ("codes", "compliance", "publicHealth", "differentials")
                ):
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
                "confidence": 0.72,
                "accepted": False,
                "accepted_by_user": False,
                "demotions": [],
                "supporting_spans": [],
                "evidence": ["Patient visit documented"],
            }
        ],
        "questions": [
            {
                "prompt": "Document key exam findings",
                "why": "Ensures accurate offline suggestion coverage.",
                "confidence": 0.5,
                "evidence": ["offline"],
            }
        ],
        "compliance": ["offline compliance"],
        "publicHealth": [
            {
                "recommendation": "offline public health",
                "reason": "offline reason",
                "source": "CDC",
                "evidenceLevel": "A",
            }
        ],
        "differentials": [
            {
                "dx": "offline differential",
                "diagnosis": "offline differential",
                "whatItIs": "Placeholder offline condition",
                "supportingFactors": ["Offline mode active"],
                "contradictingFactors": [],
                "testsToConfirm": ["00000"],
                "testsToExclude": ["00001"],
                "evidence": ["No live model available"],
                "score": 0.1,
            }
        ],
        "potentialConcerns": [
            "Using offline fallback; validate diagnoses against clinical context."
        ],
        "questions": [
            {
                "prompt": "Document key exam findings",
                "why": "Ensures accurate offline suggestion coverage.",
                "confidence": 0.5,
                "evidence": ["offline"],
            }
        ],
    }


def plan(
    text: str,
    encounter_type: Optional[str] = None,
    selected_codes: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None,
    *,
    use_local: Optional[bool] = None,
    model_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Return a deterministic care plan when LLM access is unavailable."""

    if use_local is None:
        use_local = _use_local()

    if use_local:
        model = model_path or os.getenv("LOCAL_PLAN_MODEL") or os.getenv("LOCAL_LLM_MODEL")
        if model and os.path.exists(model):
            try:
                llm = _get_llama(model)
                prompt = (
                    "You are preparing a care plan. Review the encounter summary and produce "
                    "structured JSON with risks, interventions and tasks.\n\nEncounter:\n"
                    + text.strip()
                    + "\n\nJSON:"
                )
                out = llm(prompt, max_tokens=512, temperature=0.0, top_p=1.0)
                raw = out["choices"][0]["text"].strip()
                data = json.loads(raw)
                if isinstance(data, dict) and {"risks", "interventions", "tasks"} <= set(data):
                    return data
            except Exception:
                pass

    codes: List[str] = []
    for entry in selected_codes or []:
        if isinstance(entry, dict):
            code = entry.get("code") or entry.get("id")
            if code:
                codes.append(str(code))
        elif isinstance(entry, str):
            codes.append(entry)
    codes = codes[:3]
    snippet = text.strip().splitlines()[:2]
    note_excerpt = " ".join(line.strip() for line in snippet if line.strip())
    encounter_label = encounter_type or "clinical encounter"
    codes_label = ", ".join(codes) if codes else "documented diagnoses"

    return {
        "overallRisk": "moderate",
        "risks": [
            {
                "name": "Potential condition progression",
                "rationale": f"The {encounter_label} note describes ongoing issues that may worsen without timely follow-up.",
                "confidence": 0.45,
                "evidence": [note_excerpt or "Review presenting symptoms and history."],
            }
        ],
        "interventions": [
            {
                "name": "Structured follow-up plan",
                "steps": [
                    "Confirm medication adherence and symptom trends at the next contact.",
                    f"Address documentation gaps related to {codes_label}.",
                ],
                "monitoring": [
                    "Escalate if red-flag symptoms emerge or vitals deteriorate.",
                ],
                "confidence": 0.5,
                "evidence": ["Generated by offline rules"],
            }
        ],
        "tasks": [
            {
                "title": "Schedule follow-up outreach",
                "assignee": "care_team",
                "due": "within 14 days",
                "confidence": 0.4,
            },
            {
                "title": "Review patient education for warning signs",
                "assignee": "provider",
                "due": "at discharge",
                "confidence": 0.5,
            },
        ],
    }
