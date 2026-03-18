import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .database import get_db
from .models import User
from .schemas import RegisterRequest, LoginRequest, TokenResponse
from .auth import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check username or email taken
    existing_username = await db.execute(select(User).where(User.username == body.username))
    if existing_username.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
    
    if body.email:
        existing_email = await db.execute(select(User).where(User.email == body.email))
        if existing_email.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already taken")

    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        is_anonymous=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id))
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        username=user.username,
        is_anonymous=user.is_anonymous,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    if body.email:
        result = await db.execute(select(User).where(User.email == body.email))
    elif body.username:
        result = await db.execute(select(User).where(User.username == body.username))
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email required")
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Anonymous user: no password needed
    if user.is_anonymous:
        token = create_access_token(str(user.id))
        return TokenResponse(
            access_token=token,
            user_id=str(user.id),
            username=user.username,
            is_anonymous=True,
        )

    # Password user
    if not body.password or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(str(user.id))
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        username=user.username,
        is_anonymous=user.is_anonymous,
    )


@router.post("/anonymous", response_model=TokenResponse)
async def anonymous_login(db: AsyncSession = Depends(get_db)):
    """Create a throwaway anonymous account with a generated username."""
    username = f"anon_{uuid.uuid4().hex[:6]}"
    user = User(username=username, is_anonymous=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id))
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        username=user.username,
        is_anonymous=True,
    )
