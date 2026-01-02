"""Microsoft Graph API client using MSAL for authentication.

This module provides functions to obtain access tokens and make requests to
the Microsoft Graph API using client credentials flow.
"""

import logging
from functools import lru_cache
from typing import Any, Dict, List, Optional

import msal
import requests

from .settings import get_settings

logger = logging.getLogger(__name__)

# Microsoft Graph API base URLs
GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
GRAPH_BETA_URL = "https://graph.microsoft.com/beta"

# Default scope for client credentials flow
DEFAULT_SCOPES = ["https://graph.microsoft.com/.default"]


class GraphClient:
    """Client for interacting with Microsoft Graph API."""

    def __init__(self):
        self.settings = get_settings()
        self._app: Optional[msal.ConfidentialClientApplication] = None
        self._token_cache: Dict[str, Any] = {}

    @property
    def is_configured(self) -> bool:
        """Check if Azure credentials are configured."""
        return all([
            self.settings.azure_tenant_id,
            self.settings.azure_client_id,
            self.settings.azure_client_secret,
        ])

    def _get_msal_app(self) -> msal.ConfidentialClientApplication:
        """Get or create MSAL confidential client application."""
        if self._app is None:
            if not self.is_configured:
                raise ValueError(
                    "Azure credentials not configured. Set AZURE_TENANT_ID, "
                    "AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET environment variables."
                )
            
            authority = f"https://login.microsoftonline.com/{self.settings.azure_tenant_id}"
            self._app = msal.ConfidentialClientApplication(
                client_id=self.settings.azure_client_id,
                client_credential=self.settings.azure_client_secret,
                authority=authority,
            )
        return self._app

    def get_token(self) -> str:
        """Acquire an access token using client credentials flow.
        
        Returns:
            str: The access token for Microsoft Graph API.
            
        Raises:
            Exception: If token acquisition fails.
        """
        app = self._get_msal_app()
        
        # Try to get token from cache first
        result = app.acquire_token_silent(DEFAULT_SCOPES, account=None)
        
        if not result:
            # No cached token, acquire new one
            result = app.acquire_token_for_client(scopes=DEFAULT_SCOPES)
        
        if "access_token" in result:
            return result["access_token"]
        
        error_msg = result.get("error_description", result.get("error", "Unknown error"))
        logger.error(f"Failed to acquire token: {error_msg}")
        raise Exception(f"Failed to acquire Graph API token: {error_msg}")

    def _make_request(
        self,
        method: str,
        endpoint: str,
        use_beta: bool = False,
        params: Optional[Dict] = None,
        json_data: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Make an authenticated request to Microsoft Graph API.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (without base URL)
            use_beta: Whether to use beta API endpoint
            params: Query parameters
            json_data: JSON body for POST/PATCH requests
            
        Returns:
            Dict containing the API response
        """
        base_url = GRAPH_BETA_URL if use_beta else GRAPH_BASE_URL
        url = f"{base_url}/{endpoint.lstrip('/')}"
        
        headers = {
            "Authorization": f"Bearer {self.get_token()}",
            "Content-Type": "application/json",
        }
        
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            params=params,
            json=json_data,
            timeout=30,
        )
        
        if response.status_code == 204:
            return {}
        
        if not response.ok:
            logger.error(f"Graph API error: {response.status_code} - {response.text}")
            response.raise_for_status()
        
        return response.json()

    def get(self, endpoint: str, use_beta: bool = False, params: Optional[Dict] = None) -> Dict:
        """Make a GET request to Graph API."""
        return self._make_request("GET", endpoint, use_beta, params)

    def get_all_pages(self, endpoint: str, use_beta: bool = False, params: Optional[Dict] = None) -> List[Dict]:
        """Get all pages of results from a paginated Graph API endpoint."""
        all_items = []
        
        result = self.get(endpoint, use_beta, params)
        all_items.extend(result.get("value", []))
        
        # Handle pagination
        while "@odata.nextLink" in result:
            next_url = result["@odata.nextLink"]
            # Extract the endpoint from the full URL
            if GRAPH_BETA_URL in next_url:
                endpoint = next_url.replace(GRAPH_BETA_URL, "")
                result = self.get(endpoint, use_beta=True)
            else:
                endpoint = next_url.replace(GRAPH_BASE_URL, "")
                result = self.get(endpoint, use_beta=False)
            all_items.extend(result.get("value", []))
        
        return all_items

    # ==================== Identity Tests ====================

    def get_security_defaults(self) -> Dict:
        """Get identity security defaults enforcement policy."""
        return self.get("policies/identitySecurityDefaultsEnforcementPolicy")

    def get_risk_detections(self, top: int = 100) -> List[Dict]:
        """Get identity protection risk detections (beta API)."""
        params = {"$top": top, "$orderby": "activityDateTime desc"}
        return self.get_all_pages("identityProtection/riskDetections", use_beta=True, params=params)

    def get_risky_users(self) -> List[Dict]:
        """Get users flagged as risky."""
        return self.get_all_pages("identityProtection/riskyUsers", use_beta=True)

    def get_conditional_access_policies(self) -> List[Dict]:
        """Get all conditional access policies."""
        return self.get_all_pages("identity/conditionalAccess/policies")

    def get_directory_roles(self) -> List[Dict]:
        """Get all directory roles."""
        return self.get_all_pages("directoryRoles")

    def get_directory_role_members(self, role_id: str) -> List[Dict]:
        """Get members of a specific directory role."""
        return self.get_all_pages(f"directoryRoles/{role_id}/members")

    def get_users(self, select: Optional[str] = None) -> List[Dict]:
        """Get all users with optional field selection."""
        params = {}
        if select:
            params["$select"] = select
        return self.get_all_pages("users", params=params)

    def get_user_authentication_methods(self, user_id: str) -> List[Dict]:
        """Get authentication methods for a user."""
        try:
            return self.get_all_pages(f"users/{user_id}/authentication/methods")
        except Exception as e:
            logger.warning(f"Could not get auth methods for user {user_id}: {e}")
            return []

    def get_mfa_registration_details(self) -> List[Dict]:
        """Get MFA registration details for all users (beta API)."""
        return self.get_all_pages(
            "reports/authenticationMethods/userRegistrationDetails",
            use_beta=True
        )

    def get_named_locations(self) -> List[Dict]:
        """Get named locations for conditional access."""
        return self.get_all_pages("identity/conditionalAccess/namedLocations")

    def get_authentication_methods_policy(self) -> Dict:
        """Get authentication methods policy."""
        return self.get("policies/authenticationMethodsPolicy")

    # ==================== Device Tests ====================

    def get_managed_devices(self) -> List[Dict]:
        """Get all managed devices from Intune."""
        return self.get_all_pages("deviceManagement/managedDevices")

    def get_device_compliance_policies(self) -> List[Dict]:
        """Get device compliance policies."""
        return self.get_all_pages("deviceManagement/deviceCompliancePolicies")

    def get_device_configurations(self) -> List[Dict]:
        """Get device configuration profiles."""
        return self.get_all_pages("deviceManagement/deviceConfigurations")

    def get_device_compliance_policy_settings(self) -> List[Dict]:
        """Get device compliance policy settings."""
        return self.get_all_pages("deviceManagement/deviceCompliancePolicySettingStateSummaries")

    def get_windows_autopilot_devices(self) -> List[Dict]:
        """Get Windows Autopilot device identities."""
        return self.get_all_pages("deviceManagement/windowsAutopilotDeviceIdentities")

    def get_mobile_app_management_policies(self) -> List[Dict]:
        """Get mobile app management policies (beta)."""
        return self.get_all_pages("deviceAppManagement/managedAppPolicies", use_beta=True)

    def get_device_enrollment_configurations(self) -> List[Dict]:
        """Get device enrollment configurations."""
        return self.get_all_pages("deviceManagement/deviceEnrollmentConfigurations")

    def get_device_compliance_summary(self) -> Dict:
        """Get device compliance summary."""
        return self.get("deviceManagement/deviceCompliancePolicyDeviceStateSummary")

    def get_conditional_access_device_states(self) -> Dict:
        """Get conditional access device state summary."""
        try:
            return self.get("deviceManagement/managedDeviceOverview")
        except Exception as e:
            logger.warning(f"Could not get managed device overview: {e}")
            return {}


# Global instance
graph_client = GraphClient()


def get_graph_client() -> GraphClient:
    """Get the global Graph client instance."""
    return graph_client
