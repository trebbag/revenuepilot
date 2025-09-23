"""Lightweight embedding utilities for deterministic offline tests."""

from __future__ import annotations

import hashlib
import math
import re
from typing import Iterable, List

_TOKEN_RE = re.compile(r"[a-z0-9]+", re.IGNORECASE)


class HashingVectorizerEmbedding:
    """Simple hashing-based embedding model.

    The model tokenizes text into alphanumeric tokens, maps tokens into a
    fixed-size vector using SHA-1 hashing and L2 normalises the result.  The
    implementation is deterministic, fast and requires no external
    dependencies which makes it suitable for unit tests while still behaving
    like a "real" embedding model.
    """

    def __init__(self, dimensions: int = 128) -> None:
        if dimensions <= 0:
            raise ValueError("dimensions must be positive")
        self._dimensions = dimensions

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def embed(self, text: str) -> List[float]:
        tokens = self._tokenize(text)
        if not tokens:
            return [0.0] * self._dimensions
        vector = [0.0] * self._dimensions
        for token in tokens:
            digest = hashlib.sha1(token.encode("utf-8")).digest()
            bucket = int.from_bytes(digest[:4], "big") % self._dimensions
            vector[bucket] += 1.0
        norm = math.sqrt(sum(value * value for value in vector))
        if norm:
            vector = [value / norm for value in vector]
        return vector

    def _tokenize(self, text: str) -> Iterable[str]:
        return _TOKEN_RE.findall(text.lower())


__all__ = ["HashingVectorizerEmbedding"]
