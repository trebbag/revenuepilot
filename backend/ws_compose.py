"""Compose WebSocket stream helpers."""

from __future__ import annotations

from backend.ws_streams import EncounterDeltaStream


class ComposeDeltaStream(EncounterDeltaStream):
    """Encounter-scoped delta stream for compose updates."""

    def __init__(self) -> None:
        super().__init__("compose")


__all__ = ["ComposeDeltaStream"]
