"""Compose websocket stream helpers."""

from __future__ import annotations

from backend.ws_streams import EncounterDeltaStream


# A singleton stream for broadcasting compose job updates keyed by encounter.
compose_stream = EncounterDeltaStream("compose")


__all__ = ["compose_stream"]
