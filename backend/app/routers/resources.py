"""Remote networks and resources management endpoints."""

from typing import List, Any, Optional
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from pydantic import BaseModel, ConfigDict
from ..deps import get_db, get_current_admin

router = APIRouter()


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    s = _SLUG_RE.sub("-", (name or "").lower()).strip("-")
    return s or "resource"


def _ensure_unique_slug(db: Session, slug: str, exclude_id: Optional[str] = None) -> None:
    q = db.query(models.Resource).filter(models.Resource.slug == slug)
    if exclude_id:
        q = q.filter(models.Resource.resource_id != exclude_id)
    if q.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Resource slug '{slug}' is already in use",
        )


class NetworkOut(BaseModel):
    network_id: str
    name: str
    cidr_range: str
    location: Optional[str] = None
    status: str
    connector_health: str
    connector_name: Optional[str] = None
    connector_count: int = 0
    created_at: str
    resources: List[dict]

    model_config = ConfigDict(from_attributes=True)


@router.get("/", response_model=List[NetworkOut])
def list_networks(
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    networks = db.query(models.RemoteNetwork).all()
    result: list[NetworkOut] = []
    for net in networks:
        # Find connectors serving this network
        connectors = db.query(models.Connector).filter(
            models.Connector.network == net.name
        ).all()
        connector_name = connectors[0].name if connectors else None
        connector_count = len(connectors)

        result.append(
            NetworkOut(
                network_id=str(net.network_id),
                name=net.name,
                cidr_range=net.cidr_range,
                location=net.location,
                status=net.status.value,
                connector_health=net.connector_health.value,
                connector_name=connector_name,
                connector_count=connector_count,
                created_at=str(net.created_at),
                resources=[
                    {
                        "resource_id": str(res.resource_id),
                        "name": res.name,
                        "description": res.description,
                        "type": res.resource_type or "server",
                        "ip_address": res.ip_address,
                        "port": int(res.port) if res.port else None,
                        "slug": res.slug,
                        "target_host": res.target_host,
                        "target_port": int(res.target_port) if res.target_port else None,
                        "target_scheme": res.target_scheme or "http",
                        "path_prefix": res.path_prefix,
                        "connector_status": res.connector_status.value,
                        "last_checked": str(res.last_checked) if res.last_checked else None,
                    }
                    for res in net.resources
                ],
            )
        )
    return result


@router.post("/networks", status_code=status.HTTP_201_CREATED)
def create_network(
    payload: dict,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    name = payload.get("name")
    cidr_range = payload.get("cidr_range")
    location = payload.get("location")
    if not name or not cidr_range:
        raise HTTPException(status_code=400, detail="Name and cidr_range are required")
    if db.query(models.RemoteNetwork).filter(models.RemoteNetwork.name == name).first():
        raise HTTPException(status_code=400, detail="Network name already exists")
    net = models.RemoteNetwork(name=name, cidr_range=cidr_range, location=location)
    db.add(net)
    db.commit()
    db.refresh(net)
    return {"network_id": str(net.network_id), "name": net.name}


@router.post("/networks/{network_id}/resources", status_code=status.HTTP_201_CREATED)
def create_resource(
    network_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    net = db.query(models.RemoteNetwork).filter(models.RemoteNetwork.network_id == network_id).first()
    if not net:
        raise HTTPException(status_code=404, detail="Network not found")
    name = payload.get("name")
    description = payload.get("description")
    resource_type = payload.get("type", "server")
    ip_address = payload.get("ip_address")
    port = payload.get("port")
    # Phase 1: explicit slug + target_* fields. If absent, derive from
    # legacy name/ip_address/port for backward compatibility.
    target_host = payload.get("target_host") or ip_address
    target_port = payload.get("target_port") or port
    target_scheme = payload.get("target_scheme") or "http"
    path_prefix = payload.get("path_prefix")
    slug = (payload.get("slug") or "").strip().lower() or _slugify(name or "")
    if not name:
        raise HTTPException(status_code=400, detail="Resource name required")
    _ensure_unique_slug(db, slug)
    res = models.Resource(
        network_id=network_id,
        name=name,
        description=description,
        resource_type=resource_type,
        ip_address=ip_address,
        port=port,
        slug=slug,
        target_host=target_host,
        target_port=target_port,
        target_scheme=target_scheme,
        path_prefix=path_prefix,
    )
    db.add(res)
    db.commit()
    db.refresh(res)
    return {"resource_id": str(res.resource_id), "name": res.name, "slug": res.slug}


@router.patch("/networks/{network_id}/resources/{resource_id}")
def update_resource(
    network_id: str,
    resource_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    res = db.query(models.Resource).filter(
        models.Resource.resource_id == resource_id,
        models.Resource.network_id == network_id,
    ).first()
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    if "slug" in payload and payload["slug"]:
        new_slug = payload["slug"].strip().lower()
        if new_slug != res.slug:
            _ensure_unique_slug(db, new_slug, exclude_id=str(res.resource_id))
            res.slug = new_slug
    for field in ("name", "description", "resource_type", "ip_address", "port",
                  "target_host", "target_port", "target_scheme", "path_prefix"):
        if field in payload:
            setattr(res, field, payload[field])
    db.commit()
    db.refresh(res)
    return {"resource_id": str(res.resource_id), "name": res.name, "slug": res.slug}


@router.delete("/networks/{network_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_network(
    network_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> None:
    net = db.query(models.RemoteNetwork).filter(models.RemoteNetwork.network_id == network_id).first()
    if not net:
        raise HTTPException(status_code=404, detail="Network not found")
    db.delete(net)
    db.commit()


@router.delete("/networks/{network_id}/resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resource(
    network_id: str,
    resource_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> None:
    res = db.query(models.Resource).filter(
        models.Resource.resource_id == resource_id,
        models.Resource.network_id == network_id,
    ).first()
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    db.delete(res)
    db.commit()