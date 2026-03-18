import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, Text, DateTime, ForeignKey,
    Boolean, Table, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


# Association table: which users are members of which rooms
room_members = Table(
    "room_members",
    Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("room_id", UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True),
    Column("joined_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
)


class User(Base):
    __tablename__ = "users"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username   = Column(String(40), unique=True, nullable=False, index=True)
    email      = Column(String, unique=True, nullable=True, index=True)
    password_hash = Column(String, nullable=True)   # NULL = anonymous
    is_anonymous  = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    messages = relationship("Message", back_populates="author", cascade="all, delete-orphan")
    rooms    = relationship("Room", secondary=room_members, back_populates="members")


class Room(Base):
    __tablename__ = "rooms"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug       = Column(String(60), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    messages = relationship("Message", back_populates="room", cascade="all, delete-orphan", order_by="Message.created_at")
    members  = relationship("User", secondary=room_members, back_populates="rooms")


class Message(Base):
    __tablename__ = "messages"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id    = Column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content    = Column(Text, nullable=False)
    msg_type   = Column(String(10), default="text")   # "text" | "file" | "system"
    file_url   = Column(String, nullable=True)
    filename   = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    author = relationship("User", back_populates="messages")
    room   = relationship("Room", back_populates="messages")
