"""Device management endpoints."""

from typing import List, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_user, get_current_admin

router = APIRouter()


@router.get("/", response_model=List[schemas.DeviceOut])
def list_devices(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """Return a list of devices.  Admins see all devices; employees see their own."""
    if current_user.role == models.RoleEnum.ADMIN:
        devices = db.query(models.Device).all()
    else:
        devices = db.query(models.Device).filter(models.Device.user_id == current_user.user_id).all()
    return devices


@router.post("/", response_model=schemas.DeviceOut, status_code=status.HTTP_201_CREATED)
def create_device(
    device_in: schemas.DeviceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Any:
    """Register a new device.  Employees may only add their own devices; admins can add devices for any user."""
    if current_user.role != models.RoleEnum.ADMIN and device_in.user_id != str(current_user.user_id):
        raise HTTPException(status_code=403, detail="Not authorised to add device for another user")
    owner = db.query(models.User).filter(models.User.user_id == device_in.user_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="User not found")
    device = models.Device(
        user_id=device_in.user_id,
        device_name=device_in.device_name,
        os_version=device_in.os_version,
        fingerprint=device_in.fingerprint,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.get("/{device_id}", response_model=schemas.DeviceOut)
def get_device(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> Any:
    device = db.query(models.Device).filter(models.Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if current_user.role != models.RoleEnum.ADMIN and device.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorised to view this device")
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> None:
    device = db.query(models.Device).filter(models.Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if current_user.role != models.RoleEnum.ADMIN and device.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorised to delete this device")
    db.delete(device)
    db.commit()
    return None