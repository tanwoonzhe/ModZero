"""Protected resource CRUD endpoints.

Routes
------
  GET    /api/resources
  POST   /api/resources         (admin)
  GET    /api/resources/{id}
  PUT    /api/resources/{id}    (admin)
  DELETE /api/resources/{id}    (admin)
"""
from __future__ import annotations

from typing import Any, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, get_current_user, get_current_admin
from ..models import AccessRequestLog, ProtectedResource, User

router = APIRouter(prefix="/resources", tags=["resources"])


@router.get("", response_model=List[schemas.ProtectedResourceOut])
def list_resources(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Any:
    return db.query(ProtectedResource).order_by(ProtectedResource.created_at.desc()).all()


@router.post("", response_model=schemas.ProtectedResourceOut, status_code=status.HTTP_201_CREATED)
def create_resource(
    payload: schemas.ProtectedResourceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> Any:
    if payload.public_name:
        existing = db.query(ProtectedResource).filter(
            ProtectedResource.public_name == payload.public_name
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="public_name already in use")

    resource = ProtectedResource(**payload.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource


@router.get("/{resource_id}", response_model=schemas.ProtectedResourceOut)
def get_resource(
    resource_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Any:
    resource = db.query(ProtectedResource).filter(ProtectedResource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return resource


@router.put("/{resource_id}", response_model=schemas.ProtectedResourceOut)
def update_resource(
    resource_id: UUID,
    payload: schemas.ProtectedResourceUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> Any:
    resource = db.query(ProtectedResource).filter(ProtectedResource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    updates = payload.model_dump(exclude_unset=True)
    if "public_name" in updates and updates["public_name"] and updates["public_name"] != resource.public_name:
        clash = db.query(ProtectedResource).filter(
            ProtectedResource.public_name == updates["public_name"],
            ProtectedResource.id != resource_id,
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="public_name already in use")

    for key, value in updates.items():
        setattr(resource, key, value)
    db.commit()
    db.refresh(resource)
    return resource


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_resource(
    resource_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> Response:
    resource = db.query(ProtectedResource).filter(ProtectedResource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    db.query(AccessRequestLog).filter(AccessRequestLog.resource_id == resource_id).update(
        {AccessRequestLog.resource_id: None}, synchronize_session=False
    )
    db.delete(resource)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
