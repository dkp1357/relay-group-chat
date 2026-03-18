import uuid
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .database import AsyncSessionLocal
from .models import User, Room, Message, room_members
from .auth import decode_token
from .ws_manager import manager

router = APIRouter()


async def _get_user(token: str) -> User | None:
    if not token:
        return None
    user_id = decode_token(token)
    if not user_id:
        return None
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()


async def _get_or_create_room(slug: str) -> Room:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Room).where(Room.slug == slug))
        room = result.scalar_one_or_none()
        if not room:
            room = Room(slug=slug)
            db.add(room)
            await db.commit()
            await db.refresh(room)
        return room


async def _ensure_member(room_id, user_id):
    async with AsyncSessionLocal() as db:
        existing = await db.execute(
            select(room_members).where(
                room_members.c.user_id == user_id,
                room_members.c.room_id == room_id,
            )
        )
        if not existing.fetchone():
            await db.execute(room_members.insert().values(user_id=user_id, room_id=room_id))
            await db.commit()


async def _save_message(room_id, user_id, content: str, msg_type: str = "text") -> dict:
    async with AsyncSessionLocal() as db:
        msg = Message(
            room_id=room_id,
            user_id=user_id,
            content=content,
            msg_type=msg_type,
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        result = await db.execute(
            select(Message).options(selectinload(Message.author)).where(Message.id == msg.id)
        )
        msg = result.scalar_one()
        return {
            "id": str(msg.id),
            "room_id": str(msg.room_id),
            "username": msg.author.username if msg.author else "Unknown",
            "content": msg.content,
            "msg_type": msg.msg_type,
            "file_url": msg.file_url,
            "filename": msg.filename,
            "timestamp": msg.created_at.strftime("%H:%M:%S"),
            "created_at": msg.created_at.isoformat(),
        }


@router.websocket("/ws/{slug}")
async def websocket_endpoint(
    websocket: WebSocket,
    slug: str,
    token: str = Query(None),
):
    user = await _get_user(token)
    if not user:
        await websocket.close(code=4001)
        return

    room = await _get_or_create_room(slug)
    await _ensure_member(room.id, user.id)

    client_id = uuid.uuid4().hex[:8]
    await manager.connect(str(room.id), client_id, websocket)

    # System: user joined
    join_payload = await _save_message(
        room.id, user.id,
        f"{user.username} joined the room.", "system"
    )
    await manager.broadcast(str(room.id), join_payload)

    try:
        while True:
            data = await websocket.receive_json()
            content = (data.get("content") or "").strip()
            if not content:
                continue
            payload = await _save_message(room.id, user.id, content, "text")
            await manager.broadcast(str(room.id), payload)

    except WebSocketDisconnect:
        manager.disconnect(str(room.id), client_id)
        leave_payload = await _save_message(
            room.id, user.id,
            f"{user.username} left the room.", "system"
        )
        await manager.broadcast(str(room.id), leave_payload)
