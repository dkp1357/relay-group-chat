import os
import uuid
import shutil
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from .database import get_db
from .models import User, Room, Message, room_members
from .schemas import RoomOut, MessageOut
from .auth import get_current_user
from .config import settings
from .ws_manager import manager

router = APIRouter(prefix="/rooms", tags=["rooms"])

HTTP_BASE = settings.HTTP_BASE   # adjust per env / reverse proxy


# ── Helpers ──────────────────────────────────────────────────────────────────

def msg_to_out(msg: Message) -> dict:
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


async def get_or_create_room(slug: str, db: AsyncSession) -> Room:
    result = await db.execute(select(Room).where(Room.slug == slug))
    room = result.scalar_one_or_none()
    if not room:
        room = Room(slug=slug)
        db.add(room)
        await db.commit()
        await db.refresh(room)
    return room


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/mine", response_model=List[RoomOut])
async def my_rooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Room)
        .join(room_members)
        .where(room_members.c.user_id == current_user.id)
        .order_by(room_members.c.joined_at.desc())
    )
    rooms = result.scalars().all()
    out = []
    for r in rooms:
        # Member count
        count_res = await db.execute(
            select(func.count()).select_from(room_members).where(room_members.c.room_id == r.id)
        )
        member_count = count_res.scalar()

        # Last message
        msg_res = await db.execute(
            select(Message)
            .where(Message.room_id == r.id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        last_msg = msg_res.scalar_one_or_none()

        out.append(RoomOut(
            id=r.id, 
            slug=r.slug, 
            created_at=r.created_at, 
            member_count=member_count,
            last_message_content=last_msg.content if last_msg else None,
            last_message_at=last_msg.created_at if last_msg else None,
        ))
    return out


@router.post("/leave/{slug}")
async def leave_room(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Room).where(Room.slug == slug))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    await db.execute(
        room_members.delete().where(
            room_members.c.user_id == current_user.id,
            room_members.c.room_id == room.id,
        )
    )
    await db.commit()
    return {"status": "ok"}


@router.post("/join/{slug}")
async def join_room(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    room = await get_or_create_room(slug, db)
    # Add member if not already
    existing = await db.execute(
        select(room_members).where(
            room_members.c.user_id == current_user.id,
            room_members.c.room_id == room.id,
        )
    )
    if not existing.fetchone():
        await db.execute(room_members.insert().values(user_id=current_user.id, room_id=room.id))
        await db.commit()
    return {"room_id": str(room.id), "slug": room.slug}


@router.get("/{slug}/messages")
async def get_messages(
    slug: str,
    limit: int = Query(50, le=200),
    before: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Room).where(Room.slug == slug))
    room = result.scalar_one_or_none()
    if not room:
        return []

    q = (
        select(Message)
        .options(selectinload(Message.author))
        .where(Message.room_id == room.id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    if before:
        q = q.where(Message.created_at < before)

    msgs = (await db.execute(q)).scalars().all()
    return [msg_to_out(m) for m in reversed(msgs)]


@router.post("/{slug}/upload")
async def upload_file(
    slug: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Room).where(Room.slug == slug))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_id = uuid.uuid4().hex
    safe_name = file.filename.replace(" ", "_")
    path = os.path.join(settings.UPLOAD_DIR, f"{file_id}_{safe_name}")

    with open(path, "wb") as buf:
        shutil.copyfileobj(file.file, buf)

    file_url = f"/files/{file_id}_{safe_name}"

    # Persist message
    msg = Message(
        room_id=room.id,
        user_id=current_user.id,
        content=f"Shared a file: {file.filename}",
        msg_type="file",
        file_url=file_url,
        filename=file.filename,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    # Load author
    await db.refresh(msg, ["author"])

    payload = msg_to_out(msg)
    await manager.broadcast(str(room.id), payload)

    return {"filename": file.filename, "url": file_url}
