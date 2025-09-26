"""Reusable helpers for encounter-scoped WebSocket streams."""

from __future__ import annotations

import asyncio
import copy
import json
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, Mapping, Optional, Set

import structlog
from fastapi import WebSocket, WebSocketDisconnect

logger = structlog.get_logger(__name__)

AuthCallable = Callable[[WebSocket], Awaitable[Mapping[str, Any]]]


@dataclass
class _EncounterState:
    """Track connection and delivery state for a single encounter."""

    clients: Set[WebSocket] = field(default_factory=set)
    last_event_id: int = 0
    last_payload: Optional[Dict[str, Any]] = None
    last_fingerprint: Optional[str] = None
    last_sent_monotonic: float = 0.0
    pending: Optional[Dict[str, Any]] = None
    pending_fingerprint: Optional[str] = None
    flush_task: Optional[asyncio.Task[None]] = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class EncounterDeltaStream:
    """Manage WebSocket connections and delta delivery per encounter."""

    def __init__(self, channel: str, *, min_interval: float = 0.5) -> None:
        self.channel = channel
        self.min_interval = min_interval
        self._states: Dict[str, _EncounterState] = {}

    async def handle(self, websocket: WebSocket, authenticator: AuthCallable) -> None:
        """Authenticate *websocket* and stream deltas for its encounter."""

        user = await authenticator(websocket)
        encounter_id = (
            websocket.query_params.get("encounterId")
            or websocket.query_params.get("encounter_id")
        )
        encounter_id = (encounter_id or "").strip()
        if not encounter_id:
            logger.warning(
                "stream_missing_encounter",
                channel=self.channel,
                user=user.get("sub"),
                path=str(websocket.url),
            )
            await websocket.close(code=1008)
            return

        await websocket.accept()
        await websocket.send_json(
            {
                "event": "connected",
                "channel": self.channel,
                "encounterId": encounter_id,
            }
        )

        state = self._states.setdefault(encounter_id, _EncounterState())
        async with state.lock:
            state.clients.add(websocket)
            snapshot = copy.deepcopy(state.last_payload)

        if snapshot is not None:
            try:
                await websocket.send_json(snapshot)
            except Exception as exc:  # pragma: no cover - defensive close
                logger.warning(
                    "stream_snapshot_send_failed",
                    channel=self.channel,
                    encounter_id=encounter_id,
                    error=str(exc),
                )
                await websocket.close()
                async with state.lock:
                    state.clients.discard(websocket)
                return

        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        except Exception as exc:  # pragma: no cover - unexpected payload
            logger.debug(
                "stream_receive_error",
                channel=self.channel,
                encounter_id=encounter_id,
                error=str(exc),
            )
        finally:
            async with state.lock:
                state.clients.discard(websocket)

    async def publish(self, encounter_id: str, payload: Mapping[str, Any]) -> None:
        """Broadcast *payload* to listeners for *encounter_id* if changed."""

        if not encounter_id:
            return
        state = self._states.setdefault(encounter_id, _EncounterState())
        cloned = copy.deepcopy(dict(payload))
        fingerprint = self._fingerprint(cloned)
        async with state.lock:
            if fingerprint == state.last_fingerprint and state.pending is None:
                return
            if fingerprint == state.pending_fingerprint:
                return
            state.pending = cloned
            state.pending_fingerprint = fingerprint
            delay = self._compute_delay(state.last_sent_monotonic)
            if delay <= 0 or not state.clients:
                await self._flush_locked(encounter_id, state)
                return
            if state.flush_task is None or state.flush_task.done():
                state.flush_task = asyncio.create_task(
                    self._delayed_flush(encounter_id, state, delay)
                )

    async def _delayed_flush(
        self, encounter_id: str, state: _EncounterState, delay: float
    ) -> None:
        try:
            await asyncio.sleep(delay)
            async with state.lock:
                await self._flush_locked(encounter_id, state)
        except asyncio.CancelledError:  # pragma: no cover - cleanup path
            raise
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.error(
                "stream_flush_failed",
                channel=self.channel,
                encounter_id=encounter_id,
                error=str(exc),
            )
        finally:
            state.flush_task = None

    async def _flush_locked(
        self, encounter_id: str, state: _EncounterState
    ) -> None:
        if not state.pending:
            state.pending_fingerprint = None
            return

        payload = state.pending
        state.pending = None
        fingerprint = state.pending_fingerprint or self._fingerprint(payload)
        state.pending_fingerprint = None

        if fingerprint == state.last_fingerprint and state.last_payload is not None:
            return

        state.last_event_id += 1
        enriched = copy.deepcopy(payload)
        enriched.setdefault("type", payload.get("type"))
        enriched.setdefault("encounterId", encounter_id)
        enriched.setdefault("channel", self.channel)
        enriched["eventId"] = state.last_event_id

        state.last_payload = enriched
        state.last_fingerprint = fingerprint
        state.last_sent_monotonic = time.monotonic()

        if not state.clients:
            return

        dead: Set[WebSocket] = set()
        for ws in state.clients:
            try:
                await ws.send_json(enriched)
            except Exception:
                dead.add(ws)
        for ws in dead:
            state.clients.discard(ws)

    def _compute_delay(self, last_sent: float) -> float:
        if last_sent <= 0:
            return 0.0
        elapsed = time.monotonic() - last_sent
        remaining = self.min_interval - elapsed
        return remaining if remaining > 0 else 0.0

    @staticmethod
    def _fingerprint(payload: Mapping[str, Any]) -> str:
        try:
            return json.dumps(payload, sort_keys=True, separators=(",", ":"))
        except Exception:
            return repr(sorted(payload.items()))


__all__ = ["EncounterDeltaStream", "AuthCallable"]

