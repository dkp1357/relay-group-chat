from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, field_validator
import re


class RegisterRequest(BaseModel):
    username: str
    email: Optional[str] = None
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v):
        if v is None:
            return None
        v = v.strip().lower()
        return v if v else None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v):
        v = v.strip().lower()
        if not v or len(v) > 40:
            raise ValueError("Username must be 1–40 characters")
        if not re.match(r'^[\w\-\.]+$', v):
            raise ValueError("Username may only contain letters, numbers, _, -, .")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        if not v or not v.strip():
            raise ValueError("Password is required")
        return v

class LoginRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None

    @field_validator("username", "email", mode="before")
    @classmethod
    def normalize_empty(cls, v):
        if v is None: return None
        v = v.strip().lower()
        return v if v else None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v):
        return v.strip().lower()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    is_anonymous: bool


class UserOut(BaseModel):
    id: UUID
    username: str
    is_anonymous: bool

    model_config = {"from_attributes": True}


class RoomOut(BaseModel):
    id: UUID
    slug: str
    created_at: datetime
    member_count: int = 0
    last_message_content: Optional[str] = None
    last_message_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: UUID
    room_id: UUID
    username: str
    content: str
    msg_type: str
    file_url: Optional[str] = None
    filename: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WsMessage(BaseModel):
    username: str
    content: str
