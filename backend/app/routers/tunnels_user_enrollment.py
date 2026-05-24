"""User device tunnel enrollment / Join Package.

POST /api/tunnels/user-enrollment — returns manual instructions for an
end-user device to join the tailnet. Manual-only: never calls Headscale,
never issues or returns a pre-auth key. Uses {AUTH_KEY} placeholder only.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, get_current_user
from ..models import TunnelUserEnrollmentLog, User
from ..settings import Settings, get_settings


router = APIRouter(tags=["tunnels"])


def _build_command(login_server: str, node_name: str) -> str:
    return (
        f"tailscale up --login-server={login_server} --authkey={{AUTH_KEY}} "
        f"--hostname={node_name} --accept-routes --accept-dns=false"
    )


def _instructions(login_server_known: bool) -> list[str]:
    base = [
        "Install Tailscale on this device (https://tailscale.com/download).",
        "Ask your ModZero administrator to issue you a pre-auth key from the Headscale server.",
        "Replace the literal {AUTH_KEY} placeholder in the command below with the key your admin provided.",
        "Run the substituted command in an administrator shell.",
        "Verify the join with: tailscale status",
    ]
    if not login_server_known:
        base.insert(0, "Your administrator has not yet configured a tunnel server URL — wait until they do, then return to this screen.")
    return base


@router.post("/user-enrollment", response_model=schemas.UserEnrollmentOut)
def user_enrollment(
    payload: schemas.UserEnrollmentIn,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    s: Settings = Depends(get_settings),
) -> schemas.UserEnrollmentOut:
    suggested_node_name = (payload.node_name_hint or "").strip() or f"user-{current_user.user_id.hex[:8]}"

    if not s.headscale_enabled:
        login_server = None
        status_str = "disabled"
        safe_message = "Tunnel client is disabled on this server. Use HTTP proxy access."
        response.status_code = status.HTTP_202_ACCEPTED
    elif not s.headscale_url:
        login_server = None
        status_str = "not_configured"
        safe_message = "Tunnel server URL is not configured on this server. Contact your administrator."
        response.status_code = status.HTTP_202_ACCEPTED
    else:
        login_server = s.headscale_url.rstrip("/")
        status_str = "manual_required"
        safe_message = "Run the command below on the end-user device after substituting the pre-auth key your admin provides."

    login_server_display = login_server or "{HEADSCALE_URL}"
    manual_command = _build_command(login_server_display, suggested_node_name)

    try:
        db.add(TunnelUserEnrollmentLog(
            user_id=current_user.user_id,
            device_id=payload.device_id,
            node_name=suggested_node_name,
            status=status_str,
        ))
        db.commit()
    except Exception:
        db.rollback()  # audit-only; never block the response

    return schemas.UserEnrollmentOut(
        status=status_str,
        login_server=login_server,
        suggested_node_name=suggested_node_name,
        manual_command=manual_command,
        instructions=_instructions(login_server is not None),
        safe_message=safe_message,
    )
