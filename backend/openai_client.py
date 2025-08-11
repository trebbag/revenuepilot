"""
Simple wrapper for the OpenAI Chat Completion API with optional offline/local fallbacks.

Behaviour hierarchy:
1. If USE_OFFLINE_MODEL is set, return a deterministic placeholder without any
   external calls.
2. Else if USE_LOCAL_MODELS is set, attempt to use a local llama.cpp model (path
   from LOCAL_LLM_MODEL or a specific LOCAL_*_MODEL). If that fails, raise to
   allow caller fallback handling.
3. Otherwise call the real OpenAI API.

Any exception during OpenAI or local model invocation is converted into a
RuntimeError so callers have a consistent error path.
"""

from typing import List, Dict
import os
import hashlib

# ``openai`` is imported lazily only when needed to avoid requiring the
# dependency in offline/local deterministic modes.

from backend.key_manager import get_api_key

# Cached llama.cpp model instance
_LLAMA = None


def _use_offline() -> bool:
    return os.getenv("USE_OFFLINE_MODEL", "").lower() in {"1", "true", "yes"}


def _use_local() -> bool:
    return os.getenv("USE_LOCAL_MODELS", "").lower() in {"1", "true", "yes"}


def _get_llama():
    """Lazy load a llama.cpp model specified by environment variables.

    Priority order for model path:
    1. LOCAL_LLM_MODEL
    2. LOCAL_BEAUTIFY_MODEL / LOCAL_SUMMARIZE_MODEL / LOCAL_SUGGEST_MODEL (any that exists)
    """
    global _LLAMA
    if _LLAMA is not None:
        return _LLAMA
    model_path = (
        os.getenv("LOCAL_LLM_MODEL")
        or os.getenv("LOCAL_BEAUTIFY_MODEL")
        or os.getenv("LOCAL_SUMMARIZE_MODEL")
        or os.getenv("LOCAL_SUGGEST_MODEL")
    )
    if not model_path or not os.path.exists(model_path):  # pragma: no cover - defensive
        raise RuntimeError("Local model path not found for llama.cpp usage")
    try:
        from llama_cpp import Llama  # type: ignore

        _LLAMA = Llama(
            model_path=model_path,
            n_ctx=int(os.getenv("LLAMA_CTX", "2048")),
            seed=0,
        )
        return _LLAMA
    except Exception as exc:  # pragma: no cover - environment specific
        raise RuntimeError(f"Failed to load local model: {exc}") from exc


def _deterministic_placeholder(messages: List[Dict[str, str]]) -> str:
    """Return a deterministic placeholder string based on the message content."""
    joined = "\n".join(f"{m.get('role')}:{m.get('content','')}" for m in messages)
    h = hashlib.sha1(joined.encode("utf-8")).hexdigest()[:12]
    return f"Offline response ({h})"


def _build_prompt(messages: List[Dict[str, str]]) -> str:
    """Flatten chat messages into a single prompt for local llama.cpp inference."""
    lines = []
    system_prefix = "System:"
    user_prefix = "User:"
    assistant_prefix = "Assistant:"
    for m in messages:
        role = m.get("role", "user")
        content = (m.get("content") or "").strip()
        if role == "system":
            lines.append(f"{system_prefix} {content}")
        elif role == "assistant":
            lines.append(f"{assistant_prefix} {content}")
        else:
            lines.append(f"{user_prefix} {content}")
    lines.append("Assistant:")  # cue for generation
    return "\n".join(lines)


def call_openai(messages: List[Dict[str, str]], model: str = "gpt-4o", temperature: float = 0) -> str:
    """Chat completion with offline/local fallbacks.

    Args:
        messages: OpenAI-style message dicts.
        model: Remote model name (ignored for offline/local modes).
        temperature: Sampling temperature.
    Returns:
        Assistant response content string.
    Raises:
        RuntimeError on failure (network/local model issues) unless offline deterministic path.
    """
    # 1. Pure offline deterministic mode
    if _use_offline():
        return _deterministic_placeholder(messages)

    # 2. Local model mode
    if _use_local():
        try:
            llama = _get_llama()
            prompt = _build_prompt(messages)
            # Deterministic generation (seed fixed in loader)
            out = llama(
                prompt,
                max_tokens=int(os.getenv("LOCAL_MAX_TOKENS", "256")),
                temperature=temperature,
                top_p=1.0,
            )
            text = out["choices"][0]["text"].strip()
            if not text:
                raise RuntimeError("Empty local model response")
            return text
        except Exception as exc:
            # Surface as runtime error so caller fallback logic triggers.
            raise RuntimeError(f"Local model inference failed: {exc}") from exc

    # 3. Remote OpenAI call
    api_key = get_api_key()
    if not api_key:
        raise RuntimeError("OpenAI key not configured.")
    try:
        import openai  # type: ignore

        openai.api_key = api_key
        response = openai.ChatCompletion.create(
            model=model,
            messages=messages,
            temperature=temperature,
        )
        return response.choices[0].message["content"]
    except Exception as exc:  # pragma: no cover - network errors / SDK issues
        raise RuntimeError(f"Error calling OpenAI: {exc}") from exc
