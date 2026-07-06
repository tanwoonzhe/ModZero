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

from datetime import datetime, timezone
from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, get_current_user, get_current_admin
from ..models import AccessRequestLog, Connector, ConnectorResource, ProtectedResource, User

router = APIRouter(prefix="/resources", tags=["resources"])


def _connector_status(db: Session, connector_resource_id: Optional[UUID]) -> Optional[str]:
    """Compute live connector status from heartbeat age.

    Returns one of: "online", "degraded", "offline", or None if no connector linked.
    """
    if not connector_resource_id:
        return None
    cr = db.query(ConnectorResource).filter(
        ConnectorResource.resource_id == connector_resource_id
    ).first()
    if not cr:
        return "offline"
    # No explicit connector — check network-wide for any online connector
    connector_id = cr.connector_id
    if connector_id is None:
        c = (
            db.query(Connector)
            .filter(Connector.network == cr.network)
            .order_by(Connector.last_heartbeat.desc())
            .first()
        )
    else:
        c = db.query(Connector).filter(Connector.connector_id == connector_id).first()

    if not c or not c.last_heartbeat:
        return "offline"

    age = (datetime.now(timezone.utc) - c.last_heartbeat).total_seconds()
    if age > 60:
        return "offline"
    if age > 30:
        return "degraded"
    return "online"


def _resolved_address(resource: ProtectedResource, db: Session) -> Optional[str]:
    """Address actually used for proxying: derived from the linked ConnectorResource's
    protocol/host/port when set, so it can never drift from what "Edit Proxy Route" saved.
    Falls back to the free-text internal_address when no connector is linked."""
    if resource.connector_resource_id:
        cr = db.query(ConnectorResource).filter(
            ConnectorResource.resource_id == resource.connector_resource_id
        ).first()
        if cr:
            protocol = cr.protocol.value if hasattr(cr.protocol, "value") else (cr.protocol or "http")
            path = cr.path_prefix or ""
            return f"{protocol}://{cr.target_host}:{cr.target_port}{path}"
    return resource.internal_address


def _enrich(resource: ProtectedResource, db: Session) -> schemas.ProtectedResourceOut:
    out = schemas.ProtectedResourceOut.model_validate(resource)
    out.connector_status = _connector_status(db, resource.connector_resource_id)
    out.resolved_address = _resolved_address(resource, db)
    return out


@router.get("", response_model=List[schemas.ProtectedResourceOut])
def list_resources(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Any:
    resources = db.query(ProtectedResource).order_by(ProtectedResource.created_at.desc()).all()
    return [_enrich(r, db) for r in resources]


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

    if payload.connector_resource_id:
        cr = db.query(ConnectorResource).filter(
            ConnectorResource.resource_id == payload.connector_resource_id
        ).first()
        if not cr:
            raise HTTPException(status_code=404, detail="connector_resource not found")

    resource = ProtectedResource(**payload.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return _enrich(resource, db)


@router.get("/{resource_id}", response_model=schemas.ProtectedResourceOut)
def get_resource(
    resource_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Any:
    resource = db.query(ProtectedResource).filter(ProtectedResource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return _enrich(resource, db)


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

    if "connector_resource_id" in updates and updates["connector_resource_id"]:
        cr = db.query(ConnectorResource).filter(
            ConnectorResource.resource_id == updates["connector_resource_id"]
        ).first()
        if not cr:
            raise HTTPException(status_code=404, detail="connector_resource not found")

    for key, value in updates.items():
        setattr(resource, key, value)
    db.commit()
    db.refresh(resource)
    return _enrich(resource, db)


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
