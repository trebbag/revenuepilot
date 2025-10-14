"""Utility helpers for working with embedding clients.

This module keeps all embedding specific helpers in one place so unit tests
can patch the embedding implementation without touching the high level gate
logic.  The production environment relies on :func:`backend.openai_client
get_embedding_client` while the test-suite swaps in deterministic fakes.
"""

from __future__ import annotations

import math
from typing import Iterable, List, Sequence

from backend.openai_client import get_embedding_client as _get_embedding_client


def get_embedding_client(model: str = "text-embedding-3-small"):
    """Return the configured embedding client.

    The indirection allows tests to patch :func:`get_embedding_client` in this
    module which keeps the production code agnostic about how vectors are
    produced.
    """

    return _get_embedding_client(model)


def cosine_distance(vec_a: Sequence[float], vec_b: Sequence[float]) -> float:
    """Return the cosine distance (1 - cosine similarity) between two vectors."""

    if not vec_a and not vec_b:
        return 0.0
    if len(vec_a) != len(vec_b):
        raise ValueError("Embedding vectors must have the same dimensionality")

    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for a, b in zip(vec_a, vec_b):
        dot += a * b
        norm_a += a * a
        norm_b += b * b

    if norm_a == 0.0 or norm_b == 0.0:
        # One of the vectors is all zeros – treat as maximally distant so the
        # caller does not erroneously accept the edit as meaningless.
        return 1.0

    similarity = dot / math.sqrt(norm_a * norm_b)
    # Numerical noise can push the similarity just outside the [-1, 1] range.
    similarity = max(-1.0, min(1.0, similarity))
    return 1.0 - similarity


def normalise_vector(vec: Iterable[float]) -> List[float]:
    """Return a copy of *vec* scaled to unit length."""

    values = [float(v) for v in vec]
    norm = math.sqrt(sum(v * v for v in values))
    if norm == 0.0:
        return [0.0 for _ in values]
    return [v / norm for v in values]


__all__ = ["cosine_distance", "get_embedding_client", "normalise_vector"]

