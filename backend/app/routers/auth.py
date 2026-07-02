"""Authentication and user registration endpoints."""

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status, Form
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .. import schemas, models
from ..db import SessionLocal
from ..security import (
    verify_password, create_access_token, get_password_hash,
    MAX_FAILED_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES,
)
from ..deps import get_db, get_current_user, get_current_admin


router = APIRouter()


@router.post("/login", response_model=schemas.Token)
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> Any:
    """Authenticate a user and return a JWT access token.

    Uses OAuth2PasswordRequestForm which expects fields `username` and `password`.

    Tracks failed attempts on `User.failed_login_count` and, once
    MAX_FAILED_LOGIN_ATTEMPTS is reached, locks the account for
    LOCKOUT_DURATION_MINUTES via `User.locked_until`. A successful login
    resets the counter. Locked accounts are rejected before the password is
    even checked, so repeated attempts during lockout don't also reset the
    lockout clock.
    """
    user = (
        db.query(models.User)
        .filter(
            (models.User.username == form_data.username) | (models.User.email == form_data.username)
        )
        .first()
    )

    now = datetime.now(timezone.utc)

    if user is not None and user.locked_until is not None:
        locked_until = user.locked_until
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until > now:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=f"Account locked until {locked_until.isoformat()} after too many failed login attempts.",
            )
        # Lock has expired — clear it before continuing.
        user.locked_until = None

    if not user or not verify_password(form_data.password, user.password_hash):
        if user is not None:
            user.failed_login_count = (user.failed_login_count or 0) + 1
            if user.failed_login_count >= MAX_FAILED_LOGIN_ATTEMPTS:
                user.locked_until = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    source = request.headers.get("X-ModZero-Source", "web")
    if source == "client" and not getattr(user, "client_access_enabled", True):
        raise HTTPException(status_code=403, detail="client_access_disabled")

    user.failed_login_count = 0
    db.commit()

    access_token = create_access_token(str(user.user_id))
    return schemas.Token(access_token=access_token)


@router.post("/register", response_model=schemas.UserOut)
def register_user(
    user_in: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    """Register a new user (admin only)."""
    # Check existing
    if db.query(models.User).filter(models.User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    if db.query(models.User).filter(models.User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(
        username=user_in.username,
        email=user_in.email,
        password_hash=get_password_hash(user_in.password),
        role=user_in.role,
        password_changed_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=schemas.UserOut)
def read_current_user(current_user: models.User = Depends(get_current_user)) -> Any:
    """Return current authenticated user."""
    return current_user