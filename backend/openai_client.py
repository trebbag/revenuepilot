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

from collections import OrderedDict
from threading import Lock
from typing import Dict, List, Sequence
import os
import hashlib

# ``openai`` is imported lazily only when needed to avoid requiring the
# dependency in offline/local deterministic modes.

from backend.embedding import HashingVectorizerEmbedding
from backend.key_manager import get_api_key

# Cached llama.cpp model instance
_LLAMA = None
_EMBED_CLIENTS: Dict[str, "EmbeddingClient"] = {}


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


class EmbeddingClient:
    """Thin wrapper around the OpenAI embedding API with local fallbacks."""

    def __init__(self, model: str = "text-embedding-3-small", *, cache_size: int = 256) -> None:
        if cache_size <= 0:
            raise ValueError("cache_size must be positive")
        self._model = model
        self._cache_size = cache_size
        self._cache: "OrderedDict[str, List[float]]" = OrderedDict()
        self._lock = Lock()
        self._offline_embedder = None
        if _use_offline() or _use_local():
            self._offline_embedder = HashingVectorizerEmbedding(dimensions=1536)

    @property
    def model(self) -> str:
        return self._model

    def embed(self, text: str) -> List[float]:
        return self.embed_many([text])[0]

    def embed_many(self, texts: Sequence[str]) -> List[List[float]]:
        if not texts:
            return []

        cached: List[List[float] | None] = [None] * len(texts)
        missing: List[str] = []
        missing_indices: List[int] = []

        for idx, text in enumerate(texts):
            cached_vec = self._cache_get(text)
            if cached_vec is not None:
                cached[idx] = list(cached_vec)
            else:
                missing.append(text)
                missing_indices.append(idx)

        if missing:
            fetched = self._fetch_embeddings(missing)
            if len(fetched) != len(missing):
                raise RuntimeError("Embedding response size mismatch")
            for text, vector in zip(missing, fetched):
                normalized = self._normalize_vector(vector)
                self._cache_set(text, normalized)
            for idx, text in zip(missing_indices, missing):
                cached[idx] = list(self._cache[text])

        return [vec if vec is not None else [] for vec in cached]

    def _cache_key(self, text: str) -> str:
        return text

    def _cache_get(self, text: str) -> List[float] | None:
        key = self._cache_key(text)
        with self._lock:
            vector = self._cache.get(key)
            if vector is not None:
                self._cache.move_to_end(key)
            return vector

    def _cache_set(self, text: str, vector: List[float]) -> None:
        key = self._cache_key(text)
        with self._lock:
            self._cache[key] = vector
            self._cache.move_to_end(key)
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)

    def _normalize_vector(self, vector: Sequence[float]) -> List[float]:
        if not isinstance(vector, (list, tuple)):
            raise RuntimeError("Embedding vector must be a sequence of floats")
        if not vector:
            raise RuntimeError("Embedding vector cannot be empty")
        return [float(value) for value in vector]

    def _fetch_embeddings(self, texts: Sequence[str]) -> List[List[float]]:
        if self._offline_embedder is not None:
            return [self._offline_embedder.embed(text) for text in texts]

        api_key = get_api_key()
        if not api_key:
            raise RuntimeError("OpenAI key not configured.")

        try:
            import openai  # type: ignore

            openai.api_key = api_key
            response = openai.Embedding.create(model=self._model, input=list(texts))
            data = response.get("data")
            if not isinstance(data, list):
                raise RuntimeError("Invalid embedding response format")
            return [item.get("embedding", []) for item in data]
        except Exception as exc:  # pragma: no cover - network errors / SDK issues
            raise RuntimeError(f"Error generating embeddings: {exc}") from exc


def get_embedding_client(model: str = "text-embedding-3-small") -> EmbeddingClient:
    """Return (and cache) an :class:`EmbeddingClient` for *model*."""

    if model not in _EMBED_CLIENTS:
        _EMBED_CLIENTS[model] = EmbeddingClient(model=model)
    return _EMBED_CLIENTS[model]
