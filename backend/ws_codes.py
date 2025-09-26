"""Coding WebSocket stream helpers."""

from __future__ import annotations

from backend.ws_streams import EncounterDeltaStream


class CodesDeltaStream(EncounterDeltaStream):
    """Encounter-scoped delta stream for coding updates."""

    def __init__(self) -> None:
        super().__init__("codes")


__all__ = ["CodesDeltaStream"]
