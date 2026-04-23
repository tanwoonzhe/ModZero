"""Remote networks and resources management endpoints."""

from typing import List, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from pydantic import BaseModel, ConfigDict
from ..deps import get_db, get_current_admin

router = APIRouter()


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
    if not name:
        raise HTTPException(status_code=400, detail="Resource name required")
    res = models.Resource(
        network_id=network_id,
        name=name,
        description=description,
        resource_type=resource_type,
        ip_address=ip_address,
        port=port,
    )
    db.add(res)
    db.commit()
    db.refresh(res)
    return {"resource_id": str(res.resource_id), "name": res.name}


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