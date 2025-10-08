
"""Compose websocket stream helpers."""


from __future__ import annotations

from backend.ws_streams import EncounterDeltaStream


# A singleton stream for broadcasting compose job updates keyed by encounter.
compose_stream = EncounterDeltaStream("compose")


__all__ = ["compose_stream"]
class ComposeDeltaStream(EncounterDeltaStream):
    """Encounter-scoped delta stream for compose updates."""

    def __init__(self) -> None:
        super().__init__("compose")


__all__ = ["ComposeDeltaStream"]
