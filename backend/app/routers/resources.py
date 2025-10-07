"""Remote networks and resources management endpoints."""

from typing import List, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from pydantic import BaseModel
from ..deps import get_db, get_current_admin

router = APIRouter()


class NetworkOut(BaseModel):
    network_id: str
    name: str
    cidr_range: str
    status: str
    connector_health: str
    created_at: str
    resources: List[dict]

    class Config:
        orm_mode = True


@router.get("/", response_model=List[NetworkOut])
def list_networks(
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    networks = db.query(models.RemoteNetwork).all()
    result: list[NetworkOut] = []
    for net in networks:
        result.append(
            NetworkOut(
                network_id=str(net.network_id),
                name=net.name,
                cidr_range=net.cidr_range,
                status=net.status.value,
                connector_health=net.connector_health.value,
                created_at=str(net.created_at),
                resources=[
                    {
                        "resource_id": str(res.resource_id),
                        "name": res.name,
                        "description": res.description,
                        "connector_status": res.connector_status.value,
                        "last_checked": str(res.last_checked) if res.last_checked else None,
                    }
                    for res in net.resources
                ],
            )
        )
    return result


@router.post("/networks", response_model=schemas.BaseModel, status_code=status.HTTP_201_CREATED)
def create_network(
    payload: dict,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
) -> Any:
    name = payload.get("name")
    cidr_range = payload.get("cidr_range")
    if not name or not cidr_range:
        raise HTTPException(status_code=400, detail="Name and cidr_range are required")
    if db.query(models.RemoteNetwork).filter(models.RemoteNetwork.name == name).first():
        raise HTTPException(status_code=400, detail="Network name already exists")
    net = models.RemoteNetwork(name=name, cidr_range=cidr_range)
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
    if not name:
        raise HTTPException(status_code=400, detail="Resource name required")
    res = models.Resource(network_id=network_id, name=name, description=description)
    db.add(res)
    db.commit()
    db.refresh(res)
    return {"resource_id": str(res.resource_id), "name": res.name}