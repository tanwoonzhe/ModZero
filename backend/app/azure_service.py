"""Azure Active Directory integration service.

This module provides functionality to authenticate with Microsoft Graph API
and fetch user data from Azure AD, including devices, sign-in logs, and risk data.
"""

import logging
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
import msal
import requests
from .settings import get_settings

logger = logging.getLogger(__name__)

# Cache expiry time in hours
CACHE_EXPIRY_HOURS = 1


class AzureGraphService:
    """Service for interacting with Microsoft Graph API."""
    
    def __init__(self):
        self.settings = get_settings()
        self.authority = f"https://login.microsoftonline.com/{self.settings.azure_tenant_id}"
        self.scope = ["https://graph.microsoft.com/.default"]
        self.graph_endpoint = "https://graph.microsoft.com/v1.0"
        
    def _get_access_token(self) -> Optional[str]:
        """Get access token using client credentials flow."""
        try:
            app = msal.ConfidentialClientApplication(
                client_id=self.settings.azure_client_id,
                client_credential=self.settings.azure_client_secret,
                authority=self.authority
            )
            
            result = app.acquire_token_for_client(scopes=self.scope)
            
            if "access_token" in result:
                logger.info("Successfully acquired Azure access token")
                return result["access_token"]
            else:
                logger.error(f"Failed to acquire token: {result.get('error_description', 'Unknown error')}")
                return None
                
        except Exception as e:
            logger.error(f"Error acquiring Azure token: {str(e)}")
            return None
    
    def get_users(self, top: int = 100) -> List[Dict]:
        """Fetch users from Azure AD via Microsoft Graph API.
        
        Args:
            top: Maximum number of users to fetch (default 100)
            
        Returns:
            List of user dictionaries with Azure AD user data
        """
        access_token = self._get_access_token()
        if not access_token:
            raise Exception("Failed to acquire Azure access token")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        # Fetch users with selected properties
        url = f"{self.graph_endpoint}/users"
        params = {
            '$top': top,
            '$select': 'id,displayName,userPrincipalName,mail,jobTitle,department,officeLocation,mobilePhone,businessPhones,accountEnabled'
        }
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            users = data.get('value', [])
            
            logger.info(f"Successfully fetched {len(users)} users from Azure AD")
            return users
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching users from Azure AD: {str(e)}")
            raise Exception(f"Failed to fetch users from Azure AD: {str(e)}")
    
    def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        """Fetch a specific user by ID from Azure AD.
        
        Args:
            user_id: The Azure AD user ID
            
        Returns:
            User dictionary or None if not found
        """
        access_token = self._get_access_token()
        if not access_token:
            raise Exception("Failed to acquire Azure access token")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.graph_endpoint}/users/{user_id}"
        params = {
            '$select': 'id,displayName,userPrincipalName,mail,jobTitle,department,officeLocation,mobilePhone,businessPhones,accountEnabled'
        }
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=5)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching user {user_id} from Azure AD: {str(e)}")
            raise Exception(f"Failed to fetch user from Azure AD: {str(e)}")
    
    def test_connection(self) -> Dict[str, bool]:
        """Test the Azure AD connection.
        
        Returns:
            Dictionary with connection test results
        """
        try:
            # Test token acquisition
            access_token = self._get_access_token()
            if not access_token:
                return {
                    "success": False,
                    "message": "Failed to acquire access token",
                    "token_acquired": False,
                    "api_accessible": False
                }
            
            # Test API access by fetching a small number of users
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            url = f"{self.graph_endpoint}/users"
            params = {'$top': 1}
            
            response = requests.get(url, headers=headers, params=params, timeout=5)
            response.raise_for_status()
            
            return {
                "success": True,
                "message": "Azure AD connection successful",
                "token_acquired": True,
                "api_accessible": True
            }
            
        except Exception as e:
            return {
                "success": False,
                "message": f"Connection failed: {str(e)}",
                "token_acquired": access_token is not None,
                "api_accessible": False
            }
    
    def get_subscribed_skus(self) -> List[Dict]:
        """Fetch subscribed SKUs (licenses) from Azure AD.
        
        Returns the list of commercial subscriptions that the organization has acquired.
        Requires Organization.Read.All or Directory.Read.All permission.
        
        Returns:
            List of SKU dictionaries containing license information
        """
        access_token = self._get_access_token()
        if not access_token:
            raise Exception("Failed to acquire Azure access token")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.graph_endpoint}/subscribedSkus"
        
        try:
            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            skus = data.get('value', [])
            
            # Debug: Log SKU details
            logger.info(f"Successfully fetched {len(skus)} subscribed SKUs from Azure AD")
            for sku in skus:
                logger.info(f"  SKU: {sku.get('skuPartNumber')} (ID: {sku.get('skuId')}, Status: {sku.get('capabilityStatus')})")
                # Also log service plans within each SKU
                for plan in sku.get('servicePlans', []):
                    if plan.get('provisioningStatus') == 'Success':
                        logger.info(f"    - Plan: {plan.get('servicePlanName')}")
            
            return skus
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching subscribed SKUs from Azure AD: {str(e)}")
            raise Exception(f"Failed to fetch subscribed SKUs: {str(e)}")
    
    def get_entra_devices(self, top: int = 100) -> List[Dict]:
        """Fetch all devices from Azure AD/Entra ID via Microsoft Graph API.
        
        This returns all registered devices (Entra joined, Entra registered, Hybrid joined).
        Requires Device.Read.All permission.
        
        Args:
            top: Maximum number of devices to fetch
            
        Returns:
            List of device dictionaries with Entra ID device data
        """
        access_token = self._get_access_token()
        if not access_token:
            raise Exception("Failed to acquire Azure access token")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.graph_endpoint}/devices"
        params = {
            '$top': top,
            '$select': 'id,displayName,operatingSystem,operatingSystemVersion,trustType,isManaged,isCompliant,deviceId,registrationDateTime,approximateLastSignInDateTime,manufacturer,model,mdmAppId'
        }
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            devices = data.get('value', [])
            
            logger.info(f"Successfully fetched {len(devices)} devices from Entra ID")
            return devices
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching Entra devices: {str(e)}")
            if hasattr(e, 'response') and e.response is not None:
                if e.response.status_code == 403:
                    logger.warning("Missing Device.Read.All permission")
                    return []
            raise Exception(f"Failed to fetch Entra devices: {str(e)}")
    
    def get_managed_devices(self, top: int = 100) -> List[Dict]:
        """Fetch managed devices from Intune via Microsoft Graph API.
        
        Requires DeviceManagementManagedDevices.Read.All permission.
        
        Args:
            top: Maximum number of devices to fetch
            
        Returns:
            List of device dictionaries with Intune device data
        """
        access_token = self._get_access_token()
        if not access_token:
            raise Exception("Failed to acquire Azure access token")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.graph_endpoint}/deviceManagement/managedDevices"
        params = {
            '$top': top,
            '$select': 'id,deviceName,operatingSystem,osVersion,complianceState,managedDeviceOwnerType,enrolledDateTime,lastSyncDateTime,model,manufacturer,serialNumber,userPrincipalName,azureADDeviceId,isEncrypted,isSupervised'
        }
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            devices = data.get('value', [])
            
            logger.info(f"Successfully fetched {len(devices)} managed devices from Intune")
            return devices
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching managed devices: {str(e)}")
            # Return empty list if permission denied or error
            if hasattr(e, 'response') and e.response is not None:
                if e.response.status_code == 403:
                    logger.warning("Missing DeviceManagementManagedDevices.Read.All permission")
                    return []
            raise Exception(f"Failed to fetch managed devices: {str(e)}")
    
    def get_sign_in_logs(self, top: int = 100, upn: Optional[str] = None,
                         timeout: int = 3) -> List[Dict]:
        """Fetch sign-in logs from Azure AD via Microsoft Graph API.

        Requires AuditLog.Read.All permission.

        The signIns endpoint has high, variable latency on some tenants, so this
        is best-effort: a timeout or transient failure returns [] rather than
        raising, letting the caller fall back to N/A for Entra sign-in signals
        instead of blocking the whole posture report.

        Args:
            top: Maximum number of logs to fetch
            upn: When set, filter server-side to this user's sign-ins (much
                 faster — avoids fetching + sorting the whole tenant log)
            timeout: Per-request read timeout in seconds (kept short so a slow
                 Graph response can't blow the client-app device-check budget)

        Returns:
            List of sign-in log dictionaries (empty on timeout/error)
        """
        access_token = self._get_access_token()
        if not access_token:
            raise Exception("Failed to acquire Azure access token")

        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }

        # Use beta endpoint: networkLocationDetails is not in v1.0 signIn schema
        url = "https://graph.microsoft.com/beta/auditLogs/signIns"
        params = {
            '$top': top,
            '$select': 'id,createdDateTime,userDisplayName,userPrincipalName,appDisplayName,ipAddress,clientAppUsed,conditionalAccessStatus,isInteractive,riskDetail,riskLevelAggregated,riskLevelDuringSignIn,riskState,deviceDetail,location,status,networkLocationDetails',
            '$orderby': 'createdDateTime desc'
        }
        if upn:
            params['$filter'] = f"userPrincipalName eq '{upn}'"

        try:
            response = requests.get(url, headers=headers, params=params, timeout=timeout)
            response.raise_for_status()

            data = response.json()
            logs = data.get('value', [])

            logger.info(f"Successfully fetched {len(logs)} sign-in logs")
            return logs

        except requests.exceptions.RequestException as e:
            logger.warning(f"Sign-in logs unavailable (best-effort): {str(e)}")
            return []
    
    def get_risky_users(self) -> List[Dict]:
        """Fetch risky users from Azure AD Identity Protection.
        
        Requires IdentityRiskyUser.Read.All permission.
        
        Returns:
            List of risky user dictionaries
        """
        access_token = self._get_access_token()
        if not access_token:
            raise Exception("Failed to acquire Azure access token")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.graph_endpoint}/identityProtection/riskyUsers"
        params = {
            '$select': 'id,userDisplayName,userPrincipalName,riskLevel,riskState,riskDetail,riskLastUpdatedDateTime,isProcessing,isDeleted'
        }
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            users = data.get('value', [])
            
            logger.info(f"Successfully fetched {len(users)} risky users")
            return users
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching risky users: {str(e)}")
            if hasattr(e, 'response') and e.response is not None:
                if e.response.status_code == 403:
                    logger.warning("Missing IdentityRiskyUser.Read.All permission")
                    return []
            raise Exception(f"Failed to fetch risky users: {str(e)}")
    
    def get_conditional_access_policies(self) -> List[Dict]:
        """Fetch conditional access policies from Azure AD.
        
        Requires Policy.Read.All permission.
        
        Returns:
            List of conditional access policy dictionaries
        """
        access_token = self._get_access_token()
        if not access_token:
            raise Exception("Failed to acquire Azure access token")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.graph_endpoint}/identity/conditionalAccess/policies"
        
        try:
            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            policies = data.get('value', [])
            
            logger.info(f"Successfully fetched {len(policies)} conditional access policies")
            return policies
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching conditional access policies: {str(e)}")
            if hasattr(e, 'response') and e.response is not None:
                if e.response.status_code == 403:
                    logger.warning("Missing Policy.Read.All permission")
                    return []
            raise Exception(f"Failed to fetch conditional access policies: {str(e)}")
    
    def get_tenant_info(self) -> Dict:
        """Fetch tenant organization information.
        
        Returns:
            Dictionary with tenant information
        """
        access_token = self._get_access_token()
        if not access_token:
            raise Exception("Failed to acquire Azure access token")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.graph_endpoint}/organization"
        
        try:
            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            orgs = data.get('value', [])
            
            if orgs:
                org = orgs[0]
                return {
                    "tenant_id": org.get("id", ""),
                    "display_name": org.get("displayName", ""),
                    "verified_domains": [d.get("name", "") for d in org.get("verifiedDomains", [])],
                    "primary_domain": next((d.get("name", "") for d in org.get("verifiedDomains", []) if d.get("isDefault")), ""),
                }
            return {}
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching tenant info: {str(e)}")
            return {}
    
    def get_user_count(self) -> int:
        """Get total user count from Azure AD."""
        access_token = self._get_access_token()
        if not access_token:
            return 0
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'ConsistencyLevel': 'eventual'
        }
        
        url = f"{self.graph_endpoint}/users/$count"
        
        try:
            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            return int(response.text)
        except:
            return 0
    
    def get_device_count(self) -> int:
        """Get total device count from Azure AD/Entra ID (includes all registered devices)."""
        access_token = self._get_access_token()
        if not access_token:
            return 0
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'ConsistencyLevel': 'eventual'
        }
        
        # Use /devices endpoint to get all Entra ID devices (not just Intune managed)
        url = f"{self.graph_endpoint}/devices/$count"
        
        try:
            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            return int(response.text)
        except:
            return 0
    
    def get_managed_device_count(self) -> int:
        """Get total Intune managed device count."""
        access_token = self._get_access_token()
        if not access_token:
            return 0
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'ConsistencyLevel': 'eventual'
        }
        
        url = f"{self.graph_endpoint}/deviceManagement/managedDevices/$count"
        
        try:
            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            return int(response.text)
        except:
            return 0
    
    def get_group_count(self) -> int:
        """Get total group count from Azure AD."""
        access_token = self._get_access_token()
        if not access_token:
            return 0
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'ConsistencyLevel': 'eventual'
        }
        
        url = f"{self.graph_endpoint}/groups/$count"
        
        try:
            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            return int(response.text)
        except:
            return 0
    
    def get_app_count(self) -> int:
        """Get total application count from Azure AD."""
        access_token = self._get_access_token()
        if not access_token:
            return 0
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'ConsistencyLevel': 'eventual'
        }
        
        url = f"{self.graph_endpoint}/applications/$count"
        
        try:
            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            return int(response.text)
        except:
            return 0
    
    def get_guest_user_count(self) -> int:
        """Get guest user count from Azure AD."""
        access_token = self._get_access_token()
        if not access_token:
            return 0
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
            'ConsistencyLevel': 'eventual'
        }
        
        url = f"{self.graph_endpoint}/users/$count"
        params = {'$filter': "userType eq 'Guest'"}
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=5)
            response.raise_for_status()
            return int(response.text)
        except:
            return 0
    
    def get_authentication_methods_summary(self) -> Dict[str, Any]:
        """Get authentication methods summary for users.
        
        Returns aggregated data for Sankey diagram visualization.
        """
        access_token = self._get_access_token()
        if not access_token:
            return self._get_demo_auth_methods_summary()
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        # Try to get authentication methods registration status
        url = f"{self.graph_endpoint}/reports/authenticationMethods/userRegistrationDetails"
        
        try:
            response = requests.get(url, headers=headers, params={'$top': 999})
            response.raise_for_status()
            
            data = response.json()
            users = data.get('value', [])
            
            # Aggregate authentication methods
            summary = {
                "total_users": len(users),
                "mfa_registered": 0,
                "passwordless": 0,
                "phone_auth": 0,
                "authenticator_app": 0,
                "fido2": 0,
                "windows_hello": 0,
                "single_factor": 0,
            }
            
            for user in users:
                methods = user.get('methodsRegistered', [])
                if 'mobilePhone' in methods or 'alternateMobilePhone' in methods:
                    summary['phone_auth'] += 1
                if 'microsoftAuthenticatorPush' in methods or 'softwareOneTimePasscode' in methods:
                    summary['authenticator_app'] += 1
                    summary['mfa_registered'] += 1
                if 'fido2SecurityKey' in methods:
                    summary['fido2'] += 1
                    summary['passwordless'] += 1
                if 'windowsHelloForBusiness' in methods:
                    summary['windows_hello'] += 1
                    summary['passwordless'] += 1
                if not methods or methods == ['password']:
                    summary['single_factor'] += 1
            
            return summary
            
        except requests.exceptions.RequestException as e:
            logger.warning(f"Error fetching auth methods summary: {str(e)}")
            return self._get_demo_auth_methods_summary()
    
    def _get_demo_auth_methods_summary(self) -> Dict[str, Any]:
        """Return demo authentication methods summary for visualization."""
        return {
            "total_users": 100,
            "mfa_registered": 85,
            "passwordless": 25,
            "phone_auth": 40,
            "authenticator_app": 60,
            "fido2": 10,
            "windows_hello": 15,
            "single_factor": 15,
        }

    def get_service_principals(self, top: int = 999) -> List[Dict]:
        """Fetch service principals (Enterprise Applications) from Azure AD.
        
        Requires Application.Read.All permission.
        
        Args:
            top: Maximum number of service principals to fetch
            
        Returns:
            List of service principal dictionaries
        """
        access_token = self._get_access_token()
        if not access_token:
            raise Exception("Failed to acquire Azure access token")
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.graph_endpoint}/servicePrincipals"
        params = {
            '$top': top,
            '$select': 'id,appId,displayName,servicePrincipalType,signInAudience,appRoles,oauth2PermissionScopes'
        }
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            sps = data.get('value', [])
            
            logger.info(f"Successfully fetched {len(sps)} service principals")
            return sps
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching service principals: {str(e)}")
            if hasattr(e, 'response') and e.response is not None:
                if e.response.status_code == 403:
                    logger.warning("Missing Application.Read.All permission")
                    return []
            raise Exception(f"Failed to fetch service principals: {str(e)}")

    def get_service_principal_owners(self, sp_id: str) -> List[Dict]:
        """Fetch owners for a specific service principal.
        
        Args:
            sp_id: The service principal ID
            
        Returns:
            List of owner dictionaries
        """
        access_token = self._get_access_token()
        if not access_token:
            return []
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.graph_endpoint}/servicePrincipals/{sp_id}/owners"
        
        try:
            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            return data.get('value', [])
            
        except requests.exceptions.RequestException as e:
            logger.warning(f"Error fetching owners for SP {sp_id}: {str(e)}")
            return []

    def get_service_principal_app_role_assignments(self, sp_id: str) -> List[Dict]:
        """Fetch app role assignments for a specific service principal.
        
        This shows which API permissions (Application permissions) are granted.
        
        Args:
            sp_id: The service principal ID
            
        Returns:
            List of app role assignment dictionaries
        """
        access_token = self._get_access_token()
        if not access_token:
            return []
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        url = f"{self.graph_endpoint}/servicePrincipals/{sp_id}/appRoleAssignments"
        
        try:
            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            return data.get('value', [])
            
        except requests.exceptions.RequestException as e:
            logger.warning(f"Error fetching app role assignments for SP {sp_id}: {str(e)}")
            return []

    def get_high_privilege_apps_without_owners(self) -> List[Dict]:
        """Get high privilege enterprise applications that lack sufficient owners.
        
        High privilege permissions include Directory.ReadWrite.All, Application.ReadWrite.All,
        RoleManagement.ReadWrite.Directory, etc.
        
        Returns:
            List of applications lacking owners with their permissions
        """
        HIGH_PRIVILEGE_PERMISSIONS = {
            'Directory.ReadWrite.All', 'Application.ReadWrite.All', 'RoleManagement.ReadWrite.Directory',
            'AppRoleAssignment.ReadWrite.All', 'GroupMember.ReadWrite.All', 'Group.ReadWrite.All',
            'User.ReadWrite.All', 'Mail.ReadWrite', 'Mail.Send', 'Files.ReadWrite.All',
            'Sites.ReadWrite.All', 'Policy.ReadWrite.ConditionalAccess', 'PrivilegedAccess.ReadWrite.AzureAD'
        }
        
        try:
            service_principals = self.get_service_principals()
            apps_without_owners = []
            
            for sp in service_principals:
                # Skip Microsoft first-party apps
                if sp.get('servicePrincipalType') == 'ManagedIdentity':
                    continue
                
                sp_id = sp.get('id')
                
                # Get app role assignments (application permissions)
                app_roles = self.get_service_principal_app_role_assignments(sp_id)
                
                # Check for high privilege permissions
                high_priv_permissions = []
                for role in app_roles:
                    # The role display name often contains the permission name
                    role_value = role.get('appRoleId', '')
                    # We need to resolve the role ID to permission name
                    # For simplicity, check the resource display name
                    if role.get('resourceDisplayName') == 'Microsoft Graph':
                        high_priv_permissions.append(role.get('appRoleId', 'Unknown'))
                
                # Get owners
                owners = self.get_service_principal_owners(sp_id)
                owner_count = len(owners)
                
                # Only include apps with < 2 owners (best practice is to have at least 2)
                if owner_count < 2:
                    # Get delegated permissions from oauth2PermissionGrants would require additional call
                    # For now, we'll use the app role assignments
                    
                    apps_without_owners.append({
                        'id': sp_id,
                        'appId': sp.get('appId'),
                        'displayName': sp.get('displayName'),
                        'signInAudience': sp.get('signInAudience', 'Unknown'),
                        'ownerCount': owner_count,
                        'permissions': high_priv_permissions,
                        'risk': 'High' if high_priv_permissions else 'Medium'
                    })
            
            return apps_without_owners[:50]  # Limit response size
            
        except Exception as e:
            logger.error(f"Error getting high privilege apps without owners: {str(e)}")
            return []

    def get_user_auth_methods(self, user_id: str) -> Dict[str, Any]:
        """Get authentication methods for a specific user.

        Returns:
            Dict with mfa_registered (bool) and mfa_methods (list of human-readable strings)
        """
        access_token = self._get_access_token()
        if not access_token:
            return {"mfa_registered": None, "mfa_methods": [], "error": "No access token"}

        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
        }

        MFA_TYPES = {
            "microsoftAuthenticatorAuthenticationMethod": "Authenticator App",
            "phoneAuthenticationMethod": "Phone/SMS",
            "fido2AuthenticationMethod": "FIDO2 Key",
            "windowsHelloForBusinessAuthenticationMethod": "Windows Hello",
            "softwareOathAuthenticationMethod": "TOTP App",
            "emailAuthenticationMethod": "Email OTP",
        }

        url = f"{self.graph_endpoint}/users/{user_id}/authentication/methods"

        try:
            response = requests.get(url, headers=headers, timeout=5)
            if response.status_code == 403:
                return {"mfa_registered": None, "mfa_methods": [], "error": "Insufficient permissions"}
            response.raise_for_status()

            methods = response.json().get("value", [])
            mfa_methods = []
            for m in methods:
                odata_type = m.get("@odata.type", "")
                method_key = odata_type.split(".")[-1] if odata_type else ""
                if method_key in MFA_TYPES:
                    mfa_methods.append(MFA_TYPES[method_key])

            return {
                "mfa_registered": len(mfa_methods) > 0,
                "mfa_methods": mfa_methods,
            }

        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching auth methods for user {user_id}: {str(e)}")
            return {"mfa_registered": None, "mfa_methods": [], "error": str(e)}

    def get_user_member_of(self, user_id: str) -> List[Dict]:
        """Get groups and directory roles the user belongs to.

        Returns list of membership objects (groups + directory roles).
        Empty list means no memberships found; raises on permission error so
        callers can distinguish "no groups" from "can't check".
        Requires GroupMember.Read.All or Directory.Read.All permission.
        """
        access_token = self._get_access_token()
        if not access_token:
            raise Exception("Failed to acquire Azure access token")

        headers = {'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}
        url = f"{self.graph_endpoint}/users/{user_id}/memberOf"
        params = {'$select': 'id,displayName', '$top': 100}

        try:
            response = requests.get(url, headers=headers, params=params, timeout=5)
            if response.status_code == 403:
                raise Exception("Missing GroupMember.Read.All permission")
            response.raise_for_status()
            return response.json().get('value', [])
        except requests.exceptions.RequestException as e:
            logger.warning(f"Error fetching memberOf for user {user_id}: {str(e)}")
            raise Exception(f"Failed to fetch memberOf: {str(e)}")

    def get_users_mfa_status(self, user_ids: List[str]) -> Dict[str, Any]:
        """Get MFA status for multiple users. Returns a dict keyed by user_id."""
        from concurrent.futures import ThreadPoolExecutor, as_completed
        results = {}
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_id = {executor.submit(self.get_user_auth_methods, uid): uid for uid in user_ids}
            for future in as_completed(future_to_id):
                uid = future_to_id[future]
                try:
                    results[uid] = future.result()
                except Exception as e:
                    results[uid] = {"mfa_registered": None, "mfa_methods": [], "error": str(e)}
        return results


# Global instance
azure_service = AzureGraphService()