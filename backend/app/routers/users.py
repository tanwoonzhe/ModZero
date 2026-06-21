"""User management endpoints."""

from typing import List, Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_user, get_current_admin
from ..settings import get_settings
from ..security import verify_password, get_password_hash
from ..services.identity_signal_service import (
    score_identity_signals,
    signals_from_local_user,
    get_mock_identity_signals,
)


class UserPatch(BaseModel):
    role: Optional[models.RoleEnum] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

router = APIRouter()


@router.get("/me", response_model=schemas.UserOut)
def get_current_user_profile(
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """Return the current authenticated user's profile."""
    return current_user


@router.post("/me/change-password", status_code=200)
def change_my_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """Change the current user's password."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    current_user.password_hash = get_password_hash(payload.new_password)
    db.commit()
    return {"message": "Password changed successfully"}


@router.get("/", response_model=List[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db), current_admin: models.User = Depends(get_current_admin)
) -> Any:
    """Return a list of all users (admin only)."""
    users = db.query(models.User).all()
    return users


@router.get("/{user_id}", response_model=schemas.UserOut)
def get_user_by_id(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/{user_id}/details", response_model=Dict[str, Any])
def get_user_details(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    """Get detailed user information including devices and recent access attempts."""
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get user's devices
    devices = db.query(models.Device).filter(models.Device.user_id == user_id).all()

    # Get user's recent access log entries (last 20) from AccessRequestLog
    # (AccessAttempt is a legacy empty table; real ZTNA decisions land in access_request_logs)
    import uuid as _uuid
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        uid = None
    logs = []
    if uid:
        logs = (
            db.query(models.AccessRequestLog)
            .filter(models.AccessRequestLog.user_id == uid)
            .order_by(models.AccessRequestLog.timestamp.desc())
            .limit(20)
            .all()
        )

    # Build resource name lookup
    resource_ids = list({l.resource_id for l in logs if l.resource_id})
    resources = {}
    if resource_ids:
        for r in db.query(models.ProtectedResource).filter(models.ProtectedResource.id.in_(resource_ids)).all():
            resources[r.id] = r.name

    return {
        "user": {
            "user_id": str(user.user_id),
            "username": user.username,
            "email": user.email,
            "role": user.role.value if hasattr(user.role, 'value') else user.role,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        },
        "devices": [
            {
                "device_id": str(d.device_id),
                "device_name": d.device_name,
                "os_version": d.os_version,
                "fingerprint": d.fingerprint,
                "registered_at": d.registered_at.isoformat() if d.registered_at else None,
            }
            for d in devices
        ],
        "recent_attempts": [
            {
                "attempt_id": str(l.id),
                "timestamp": l.timestamp.isoformat() if l.timestamp else None,
                "result": l.decision,
                "ip_address": None,
                "device_id": str(l.device_id) if l.device_id else None,
                "total_score": float(l.trust_score) if l.trust_score is not None else None,
                "reason": l.reason,
                "resource_name": resources.get(l.resource_id, str(l.resource_id) if l.resource_id else None),
            }
            for l in logs
        ],
        "stats": {
            "total_devices": len(devices),
            "total_attempts": len(logs),
            "allowed_attempts": sum(1 for l in logs if l.decision == 'allow'),
            "denied_attempts": sum(1 for l in logs if l.decision == 'deny'),
        }
    }


@router.patch("/{user_id}", response_model=schemas.UserOut)
def patch_user(
    user_id: str,
    payload: UserPatch,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    """Update a user's role (admin only)."""
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.role is not None:
        user.role = payload.role
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> None:
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return None


# ── GET /api/users/{user_id}/identity-signals ─────────────────────────────────

@router.get("/{user_id}/identity-signals")
def get_user_identity_signals(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """Return per-signal identity breakdown for trust scoring (GRAPH_MODE aware)."""
    settings = get_settings()

    if current_user.role != models.RoleEnum.ADMIN and str(current_user.user_id) != user_id:
        raise HTTPException(status_code=403, detail="Not authorised")

    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if settings.graph_mode == "real":
        # Placeholder: real Graph call would go here
        signals = signals_from_local_user(user)
    elif settings.graph_mode == "mock":
        signals = get_mock_identity_signals(user)
    else:
        signals = signals_from_local_user(user)

    identity_score, breakdown = score_identity_signals(signals)
    return {
        "user_id": str(user.user_id),
        "username": user.username,
        "identity_score": identity_score,
        "graph_mode": settings.graph_mode,
        "source": signals.source,
        "breakdown": breakdown,
    }