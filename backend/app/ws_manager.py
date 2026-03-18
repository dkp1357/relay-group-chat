import json
import asyncio
from typing import Dict, Set
from fastapi import WebSocket
import redis.asyncio as aioredis
from .config import settings


class ConnectionManager:
    """
    Manages WebSocket connections per room.
    Uses Redis pub/sub so multiple backend instances can broadcast to each other.
    """

    def __init__(self):
        self._connections: Dict[str, Dict[str, WebSocket]] = {}
        self._redis: aioredis.Redis | None = None
        self._pubsub: aioredis.client.PubSub | None = None
        self._listener_task: asyncio.Task | None = None

    async def startup(self):
        self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        self._pubsub = self._redis.pubsub()
        await self._pubsub.subscribe("relay:broadcast")
        self._listener_task = asyncio.create_task(self._listen())

    async def shutdown(self):
        if self._listener_task:
            self._listener_task.cancel()
        if self._pubsub:
            await self._pubsub.unsubscribe()
        if self._redis:
            await self._redis.aclose()

    async def _listen(self):
        async for raw in self._pubsub.listen():
            if raw["type"] != "message":
                continue
            try:
                envelope = json.loads(raw["data"])
                room_id = envelope["room_id"]
                payload = envelope["payload"]
                await self._send_to_local(room_id, payload)
            except Exception:
                pass

    async def _send_to_local(self, room_id: str, payload: dict):
        conns = self._connections.get(room_id, {})
        dead = []
        for cid, ws in conns.items():
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(cid)
        for cid in dead:
            conns.pop(cid, None)

    async def connect(self, room_id: str, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self._connections.setdefault(room_id, {})[client_id] = websocket

    def disconnect(self, room_id: str, client_id: str):
        room = self._connections.get(room_id, {})
        room.pop(client_id, None)
        if not room:
            self._connections.pop(room_id, None)

    async def broadcast(self, room_id: str, payload: dict):
        """Publish to Redis so all instances receive it."""
        if self._redis:
            envelope = json.dumps({"room_id": room_id, "payload": payload})
            await self._redis.publish("relay:broadcast", envelope)
        else:
            # Fallback: local only
            await self._send_to_local(room_id, payload)

    def room_count(self, room_id: str) -> int:
        return len(self._connections.get(room_id, {}))


manager = ConnectionManager()
