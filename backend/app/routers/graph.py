"""Microsoft Graph API test endpoints.

All routes require admin JWT. Graph credentials come from environment
variables (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET) — no data
is sent to any vendor-owned server.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_current_admin
from ..models import User
from ..services.graph_service import (
    GraphError,
    GraphNotConfiguredError,
    GraphAuthError,
    GraphPermissionError,
    graph_service,
)

router = APIRouter(prefix="/graph", tags=["graph"])


def _to_http(exc: GraphError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


@router.get("/status")
def graph_status(_: User = Depends(get_current_admin)) -> Any:
    """
    Return Microsoft Graph configuration and live token health.

    Fields:
    - **configured** — all three credentials are present
    - **token_ok** — a token was successfully acquired from Azure AD
    - **tenant_id_present / client_id_present / client_secret_present** — individual credential presence
    - **error** — reason for failure (only when token_ok is false)
    """
    return graph_service.status()


@router.get("/users")
def list_graph_users(_: User = Depends(get_current_admin)) -> Any:
    """
    GET /v1.0/users?$top=10

    Required app permission: **User.Read.All** or **Directory.Read.All**
    """
    try:
        return graph_service.get_users()
    except GraphNotConfiguredError as exc:
        raise _to_http(exc)
    except GraphAuthError as exc:
        raise _to_http(exc)
    except GraphPermissionError as exc:
        raise _to_http(exc)
    except GraphError as exc:
        raise _to_http(exc)


@router.get("/groups")
def list_graph_groups(_: User = Depends(get_current_admin)) -> Any:
    """
    GET /v1.0/groups?$top=10

    Required app permission: **Group.Read.All** or **Directory.Read.All**
    """
    try:
        return graph_service.get_groups()
    except GraphNotConfiguredError as exc:
        raise _to_http(exc)
    except GraphAuthError as exc:
        raise _to_http(exc)
    except GraphPermissionError as exc:
        raise _to_http(exc)
    except GraphError as exc:
        raise _to_http(exc)


@router.get("/devices")
def list_graph_devices(_: User = Depends(get_current_admin)) -> Any:
    """
    GET /v1.0/deviceManagement/managedDevices?$top=10

    Required app permission: **DeviceManagementManagedDevices.Read.All**
    """
    try:
        return graph_service.get_devices()
    except GraphNotConfiguredError as exc:
        raise _to_http(exc)
    except GraphAuthError as exc:
        raise _to_http(exc)
    except GraphPermissionError as exc:
        raise _to_http(exc)
    except GraphError as exc:
        raise _to_http(exc)
