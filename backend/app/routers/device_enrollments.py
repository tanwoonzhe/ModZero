"""Device-enrollment endpoints for the ModZero desktop client.

Distinct from the legacy ``/devices`` router (which handles managed-device
posture for compliance assessments). These endpoints power the Phase 1
zero-trust resource-access flow:

  POST   /api/device-enrollments/enroll          (auth)        -> mint device + secret (returned ONCE)
  GET    /api/device-enrollments/me              (auth)        -> caller's enrolled devices
  POST   /api/device-enrollments/{id}/revoke     (auth/admin)  -> revoke a device
  GET    /api/device-enrollments                 (admin)       -> list all (audit)
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..deps import get_current_admin, get_current_user, get_db
from ..models import DeviceEnrollment, User

router = APIRouter(prefix="/device-enrollments", tags=["device-enrollments"])


class EnrollRequest(BaseModel):
    device_name: Optional[str] = Field(default=None, max_length=128)
    os: Optional[str] = Field(default=None, max_length=64)
    os_version: Optional[str] = Field(default=None, max_length=64)


class EnrollResponse(BaseModel):
    """Returned ONCE at enrollment. ``hmac_secret`` is never re-emitted."""
    device_id: str
    hmac_secret: str
    enrolled_at: datetime


class DeviceOut(BaseModel):
    device_id: str
    device_name: Optional[str]
    os: Optional[str]
    os_version: Optional[str]
    enrolled_at: datetime
    last_seen_at: Optional[datetime]
    revoked: bool


def _project(d: DeviceEnrollment) -> DeviceOut:
    return DeviceOut(
        device_id=str(d.device_id),
        device_name=d.device_name,
        os=d.os,
        os_version=d.os_version,
        enrolled_at=d.enrolled_at,
        last_seen_at=d.last_seen_at,
        revoked=bool(d.revoked),
    )


@router.post("/enroll", response_model=EnrollResponse)
def enroll(
    payload: EnrollRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EnrollResponse:
    """Enroll the calling client as a new device. The returned
    ``hmac_secret`` MUST be stored client-side immediately — the server
    will not return it again."""
    secret = secrets.token_urlsafe(32)
    dev = DeviceEnrollment(
        user_id=user.user_id,
        hmac_secret=secret,
        device_name=payload.device_name,
        os=payload.os,
        os_version=payload.os_version,
    )
    db.add(dev)
    db.commit()
    db.refresh(dev)
    return EnrollResponse(
        device_id=str(dev.device_id),
        hmac_secret=secret,
        enrolled_at=dev.enrolled_at,
    )


@router.get("/me", response_model=list[DeviceOut])
def my_devices(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DeviceOut]:
    rows = (
        db.query(DeviceEnrollment)
        .filter(DeviceEnrollment.user_id == user.user_id)
        .order_by(DeviceEnrollment.enrolled_at.desc())
        .all()
    )
    return [_project(d) for d in rows]


@router.post("/{device_id}/revoke", response_model=DeviceOut)
def revoke(
    device_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DeviceOut:
    """Revoke a device. Owner OR admin may revoke."""
    dev = (
        db.query(DeviceEnrollment)
        .filter(DeviceEnrollment.device_id == device_id)
        .first()
    )
    if not dev:
        raise HTTPException(status_code=404, detail="Device not found")
    is_owner = str(dev.user_id) == str(user.user_id)
    is_admin = getattr(getattr(user, "role", None), "value", None) == "admin"
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Not authorised to revoke this device")
    dev.revoked = True
    dev.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(dev)
    return _project(dev)


@router.get("", response_model=list[DeviceOut])
def list_all(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[DeviceOut]:
    rows = (
        db.query(DeviceEnrollment)
        .order_by(DeviceEnrollment.enrolled_at.desc())
        .all()
    )
    return [_project(d) for d in rows]
