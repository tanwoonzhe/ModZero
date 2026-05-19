"""Microsoft Graph API service — customer-hosted, direct client credentials flow.

ModZero calls Graph on behalf of the customer's own tenant. No data leaves
the customer's server. Credentials are stored in environment variables only.

Token caching: tokens are cached in-process until 60 s before expiry.
Thread-safety: adequate for single-worker dev deployments; add a lock if
you switch to multi-worker production.
"""

import logging
import time
from typing import Any, Dict, Optional

import httpx

from ..settings import get_settings

logger = logging.getLogger(__name__)

_TOKEN_URL = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
_GRAPH_BASE = "https://graph.microsoft.com/v1.0"


# ── Custom exceptions ─────────────────────────────────────────────────────────

class GraphError(Exception):
    """Base class for all Graph service errors."""
    status_code: int = 502


class GraphNotConfiguredError(GraphError):
    """MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET are not set."""
    status_code = 503


class GraphAuthError(GraphError):
    """Token acquisition failed — credentials are wrong or expired."""
    status_code = 401


class GraphPermissionError(GraphError):
    """Graph call returned 403 — the app registration lacks required scopes."""
    status_code = 403


class GraphAPIError(GraphError):
    """Unexpected error from the Graph API."""
    status_code = 502


# ── Service ───────────────────────────────────────────────────────────────────

class GraphService:
    """Thin wrapper around Microsoft Graph API using client credentials flow."""

    def __init__(self) -> None:
        self._token: Optional[str] = None
        self._token_expiry: float = 0.0

    # ── Configuration ─────────────────────────────────────────────────────────

    def is_configured(self) -> bool:
        s = get_settings()
        return bool(s.ms_tenant_id and s.ms_client_id and s.ms_client_secret)

    def status(self) -> Dict[str, Any]:
        """Return configuration and live token health. Never raises."""
        s = get_settings()
        result: Dict[str, Any] = {
            "configured": self.is_configured(),
            "tenant_id_present": bool(s.ms_tenant_id),
            "client_id_present": bool(s.ms_client_id),
            "client_secret_present": bool(s.ms_client_secret),
            "token_ok": False,
        }
        if result["configured"]:
            try:
                self._acquire_token()
                result["token_ok"] = True
            except GraphError as exc:
                result["error"] = str(exc)
        return result

    # ── Token management ──────────────────────────────────────────────────────

    def _acquire_token(self) -> str:
        """Return a valid bearer token, refreshing if within 60 s of expiry."""
        if self._token and time.time() < self._token_expiry:
            return self._token

        s = get_settings()
        if not self.is_configured():
            raise GraphNotConfiguredError(
                "MS_TENANT_ID, MS_CLIENT_ID, and MS_CLIENT_SECRET must all be set."
            )

        url = _TOKEN_URL.format(tenant_id=s.ms_tenant_id)
        try:
            resp = httpx.post(
                url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": s.ms_client_id,
                    "client_secret": s.ms_client_secret,
                    "scope": s.ms_graph_scopes,
                },
                timeout=10.0,
            )
        except httpx.RequestError as exc:
            raise GraphAPIError(f"Token endpoint unreachable: {exc}") from exc

        if resp.status_code != 200:
            try:
                body = resp.json()
            except Exception:
                body = {}
            err_code = body.get("error", "")
            desc = body.get("error_description", resp.text[:300])

            if err_code in ("invalid_client", "unauthorized_client") or "AADSTS7000215" in desc:
                raise GraphAuthError(f"Invalid credentials: {desc}")
            if "AADSTS700016" in desc:
                raise GraphAuthError(f"Application not found in tenant: {desc}")
            raise GraphAPIError(f"Token endpoint returned HTTP {resp.status_code}: {desc}")

        data = resp.json()
        self._token = data["access_token"]
        self._token_expiry = time.time() + data.get("expires_in", 3600) - 60
        logger.debug("Graph token acquired, expires in %ds", data.get("expires_in", 3600))
        return self._token

    # ── HTTP helper ───────────────────────────────────────────────────────────

    def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        token = self._acquire_token()
        try:
            resp = httpx.get(
                f"{_GRAPH_BASE}{path}",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
                timeout=15.0,
            )
        except httpx.RequestError as exc:
            raise GraphAPIError(f"Graph API unreachable: {exc}") from exc

        if resp.status_code == 401:
            # Token was valid when we started but Graph rejected it — clear cache.
            self._token = None
            raise GraphAuthError("Graph API returned 401 — token rejected.")

        if resp.status_code == 403:
            try:
                msg = resp.json().get("error", {}).get("message", "")
            except Exception:
                msg = resp.text[:200]
            raise GraphPermissionError(
                f"Insufficient permissions for {path}. "
                f"Ensure the app registration has the required API permissions. Detail: {msg}"
            )

        if resp.status_code != 200:
            try:
                msg = resp.json().get("error", {}).get("message", resp.text[:200])
            except Exception:
                msg = resp.text[:200]
            raise GraphAPIError(f"Graph API returned HTTP {resp.status_code} for {path}: {msg}")

        return resp.json()

    # ── Graph endpoints ───────────────────────────────────────────────────────

    def get_users(self, top: int = 10) -> Dict[str, Any]:
        """GET /v1.0/users — requires User.Read.All or Directory.Read.All."""
        return self._get(
            "/users",
            {
                "$top": top,
                "$select": "id,displayName,userPrincipalName,mail,accountEnabled,createdDateTime",
            },
        )

    def get_groups(self, top: int = 10) -> Dict[str, Any]:
        """GET /v1.0/groups — requires Group.Read.All or Directory.Read.All."""
        return self._get(
            "/groups",
            {
                "$top": top,
                "$select": "id,displayName,description,groupTypes,securityEnabled,mailEnabled",
            },
        )

    def get_devices(self, top: int = 10) -> Dict[str, Any]:
        """GET /v1.0/deviceManagement/managedDevices — requires DeviceManagementManagedDevices.Read.All."""
        return self._get("/deviceManagement/managedDevices", {"$top": top})


# Module-level singleton — imported by the router.
graph_service = GraphService()
