"""Offline deterministic placeholders for API endpoints.

This module provides simple functions that return fixed data structures for
``/beautify``, ``/suggest`` and ``/summarize`` when the environment variable
``USE_OFFLINE_MODEL`` is enabled.  It allows the backend to operate without
network access or an API key by returning predictable strings and lists.
"""

from typing import Dict, List, Optional


def beautify(text: str, lang: str = "en", specialty: Optional[str] = None, payer: Optional[str] = None) -> str:
    """Return a deterministic beautified note for offline testing."""
    return f"Beautified (offline): {text.strip()}"


def summarize(text: str, lang: str = "en", specialty: Optional[str] = None, payer: Optional[str] = None) -> str:
    """Return a deterministic summary for offline testing."""
    snippet = text.strip()[:50]
    return f"Summary (offline): {snippet}"


def suggest(
    text: str,
    lang: str = "en",
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
    age: Optional[int] = None,
    sex: Optional[str] = None,
    region: Optional[str] = None,
) -> Dict[str, List]:
    """Return deterministic suggestion payload for offline testing."""
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
            {"diagnosis": "offline differential", "score": 50}
        ],
    }
