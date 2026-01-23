"""Device management endpoints."""

from typing import List, Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, get_current_user, get_current_admin
from ..azure_service import azure_service

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


@router.get("/stats", response_model=Dict[str, Any])
def get_device_stats(
    current_user: models.User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get device statistics from Microsoft Intune.
    
    Returns aggregated stats about managed devices including:
    - Total device count
    - Compliance statistics
    - OS distribution
    - Encryption status
    """
    try:
        devices = azure_service.get_managed_devices(top=999)
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Failed to retrieve devices from Intune: {str(e)}"
        )
    
    total = len(devices)
    
    # Compliance statistics
    compliant = sum(1 for d in devices if d.get('complianceState') == 'compliant')
    noncompliant = sum(1 for d in devices if d.get('complianceState') == 'noncompliant')
    unknown = total - compliant - noncompliant
    
    # OS distribution
    windows = sum(1 for d in devices if 'windows' in d.get('operatingSystem', '').lower())
    mac = sum(1 for d in devices if 'mac' in d.get('operatingSystem', '').lower())
    ios = sum(1 for d in devices if 'ios' in d.get('operatingSystem', '').lower())
    android = sum(1 for d in devices if 'android' in d.get('operatingSystem', '').lower())
    
    # Encryption status
    encrypted = sum(1 for d in devices if d.get('isEncrypted', False))
    
    # Ownership
    corporate = sum(1 for d in devices if d.get('managedDeviceOwnerType') == 'company')
    personal = total - corporate
    
    return {
        "total": total,
        "compliant": compliant,
        "nonCompliant": noncompliant,
        "unknown": unknown,
        "complianceRate": round((compliant / max(total, 1)) * 100, 1),
        "windows": windows,
        "mac": mac,
        "ios": ios,
        "android": android,
        "encrypted": encrypted,
        "encryptionRate": round((encrypted / max(total, 1)) * 100, 1),
        "corporate": corporate,
        "personal": personal,
    }


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