from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Dict, Iterable, List, Mapping, Set

import structlog
from fastapi import WebSocket
from fastapi.websockets import WebSocketDisconnect

from backend.notifications_service import NotificationEvent, NotificationService


logger = structlog.get_logger(__name__)


class NotificationWebSocketManager:
    """Manage notification websocket sessions per user."""

    def __init__(self, service: NotificationService) -> None:
        self._service = service
        self._clients: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def handle(self, websocket: WebSocket, username: str) -> None:
        """Accept *websocket* and stream live notifications for *username*."""

        await websocket.accept()
        await websocket.send_json({"event": "connected"})
        async with self._lock:
            self._clients[username].add(websocket)
        try:
            await self._send_initial(websocket, username)
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        except Exception as exc:  # pragma: no cover - defensive
            logger.debug("notifications_ws_receive_error", username=username, error=str(exc))
        finally:
            async with self._lock:
                clients = self._clients.get(username)
                if clients:
                    clients.discard(websocket)
                    if not clients:
                        self._clients.pop(username, None)

    async def broadcast_event(self, username: str, event: NotificationEvent) -> None:
        """Send *event* to all connected clients for *username*."""

        await self.broadcast_unread(username, event.unread_count)
        await self.broadcast_items(username, [event.item])

    async def broadcast_unread(self, username: str, count: int) -> None:
        payload = {"type": "unread", "count": int(max(count, 0))}
        await self._fanout(username, payload)

    async def broadcast_items(self, username: str, items: Iterable[Mapping[str, object]]) -> None:
        materialised = [dict(item) for item in items]
        if not materialised:
            return
        limited = materialised[-self._service.push_limit :]
        payload = {"type": "items", "items": limited}
        await self._fanout(username, payload)

    async def _send_initial(self, websocket: WebSocket, username: str) -> None:
        try:
            unread = self._service.current_unread(username)
            await websocket.send_json({"type": "unread", "count": unread})
        except Exception as exc:  # pragma: no cover - defensive
            logger.debug("notifications_ws_initial_unread_failed", username=username, error=str(exc))
        items = self._service.recent_items(username)
        if items:
            try:
                await websocket.send_json({"type": "items", "items": items})
            except Exception as exc:  # pragma: no cover - defensive
                logger.debug(
                    "notifications_ws_initial_items_failed",
                    username=username,
                    error=str(exc),
                )

    async def _fanout(self, username: str, payload: Mapping[str, object]) -> None:
        async with self._lock:
            clients: List[WebSocket] = list(self._clients.get(username, set()))
        if not clients:
            return
        dead: List[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_json(payload)
            except Exception:  # pragma: no cover - drop on failure
                dead.append(ws)
        if dead:
            async with self._lock:
                clients = self._clients.get(username)
                if not clients:
                    return
                for ws in dead:
                    clients.discard(ws)
                if not clients:
                    self._clients.pop(username, None)


__all__ = ["NotificationWebSocketManager"]
