"""Azure Active Directory integration service.

This module provides functionality to authenticate with Microsoft Graph API
and fetch user data from Azure AD.
"""

import logging
from typing import List, Dict, Optional
import msal
import requests
from .settings import get_settings

logger = logging.getLogger(__name__)


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
            response = requests.get(url, headers=headers, params=params)
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
            response = requests.get(url, headers=headers, params=params)
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
            
            response = requests.get(url, headers=headers, params=params)
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


# Global instance
azure_service = AzureGraphService()