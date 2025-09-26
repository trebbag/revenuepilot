"""Compliance WebSocket stream helpers."""

from __future__ import annotations

from backend.ws_streams import EncounterDeltaStream


class ComplianceDeltaStream(EncounterDeltaStream):
    """Encounter-scoped delta stream for compliance updates."""

    def __init__(self) -> None:
        super().__init__("compliance")


__all__ = ["ComplianceDeltaStream"]
