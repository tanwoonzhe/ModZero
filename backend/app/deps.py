"""Dependency functions for FastAPI routes."""

from typing import Generator, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import User, RoleEnum
from .security import decode_access_token


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    request: Request, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    user = db.query(User).filter(User.user_id == user_id).first()
    if user is None:
        raise credentials_exception

    # Re-check client_access_enabled on EVERY client-app request, not just at
    # login. Without this, disabling a user's client access (manually, or via
    # a deny_immediately_client signal) would only take effect once their
    # existing JWT expires — up to ACCESS_TOKEN_EXPIRE_MINUTES (8h default).
    # Web dashboard requests (no X-ModZero-Source header) are unaffected —
    # client_access_enabled only ever gates the client app.
    if request.headers.get("X-ModZero-Source") == "client" and not user.client_access_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="client_access_disabled")

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    # In the future, check user.is_active or other flags
    return current_user


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != RoleEnum.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required"
        )
    return current_user