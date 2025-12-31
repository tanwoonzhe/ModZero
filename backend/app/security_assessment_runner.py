"""Security Assessment Runner - Evaluates tenant configuration against Zero Trust principles.

This module connects to Microsoft Graph API and evaluates the tenant's
configuration against security tests defined in the database.
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from .azure_service import AzureGraphService
from .models import (
    SecurityTestDefinition, SecurityTestResult, AssessmentRun,
    SecurityTestTypeEnum, TestStatusEnum
)

logger = logging.getLogger(__name__)


class SecurityAssessmentRunner:
    """Runs security assessments against Microsoft 365 tenant."""
    
    def __init__(self, db: Session):
        self.db = db
        self.azure_service = AzureGraphService()
        self._cache = {}
    
    async def run_assessment(self, test_type: str, initiated_by: str) -> AssessmentRun:
        """Run a full security assessment for a given test type.
        
        Args:
            test_type: "identity" or "devices"
            initiated_by: User ID who initiated the assessment
            
        Returns:
            AssessmentRun object with results
        """
        # Create assessment run record
        run = AssessmentRun(
            test_type=test_type,
            initiated_by=initiated_by,
            status="running",
            started_at=datetime.utcnow()
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        
        try:
            # Fetch tenant data from Microsoft Graph
            tenant_data = self._fetch_tenant_data(test_type)
            
            # Get all active test definitions for this type
            tests = self.db.query(SecurityTestDefinition).filter(
                SecurityTestDefinition.test_type == test_type,
                SecurityTestDefinition.is_active == True
            ).all()
            
            total_tests = len(tests)
            passed = 0
            failed = 0
            investigate = 0
            skipped = 0
            
            # Evaluate each test
            for test in tests:
                try:
                    result = self._evaluate_test(test, tenant_data)
                    
                    # Create result record
                    test_result = SecurityTestResult(
                        test_id=test.test_id,
                        assessment_run_id=run.run_id,
                        status=result["status"],
                        test_result_detail=result.get("detail"),
                        raw_data=result.get("raw_data")
                    )
                    self.db.add(test_result)
                    
                    # Update counters
                    if result["status"] == TestStatusEnum.PASSED:
                        passed += 1
                    elif result["status"] == TestStatusEnum.FAILED:
                        failed += 1
                    elif result["status"] == TestStatusEnum.INVESTIGATE:
                        investigate += 1
                    else:
                        skipped += 1
                        
                except Exception as e:
                    logger.error(f"Error evaluating test {test.test_id}: {e}")
                    # Create skipped result
                    test_result = SecurityTestResult(
                        test_id=test.test_id,
                        assessment_run_id=run.run_id,
                        status=TestStatusEnum.SKIPPED,
                        test_result_detail=f"Error during evaluation: {str(e)}"
                    )
                    self.db.add(test_result)
                    skipped += 1
            
            # Update run status
            run.status = "completed"
            run.completed_at = datetime.utcnow()
            run.total_tests = total_tests
            run.passed = passed
            run.failed = failed
            run.investigate = investigate
            run.skipped = skipped
            
            self.db.commit()
            logger.info(f"Assessment completed: {passed} passed, {failed} failed, {investigate} investigate, {skipped} skipped")
            
            return run
            
        except Exception as e:
            # Update run status to failed
            run.status = "failed"
            run.completed_at = datetime.utcnow()
            self.db.commit()
            logger.error(f"Assessment failed: {e}")
            raise
    
    def _fetch_tenant_data(self, test_type: str) -> Dict[str, Any]:
        """Fetch all relevant tenant data from Microsoft Graph.
        
        Args:
            test_type: "identity" or "devices"
            
        Returns:
            Dictionary containing tenant configuration data
        """
        data = {}
        
        try:
            # Common data for both types
            data["users"] = self.azure_service.get_users(top=999)
            data["connection_test"] = self.azure_service.test_connection()
            
            if test_type == "identity":
                # Fetch identity-specific data
                data["conditional_access_policies"] = self._get_conditional_access_policies()
                data["authentication_methods"] = self._get_authentication_methods()
                data["sign_in_logs"] = self.azure_service.get_sign_in_logs(top=100)
                data["risky_users"] = self._get_risky_users()
                data["directory_roles"] = self._get_directory_roles()
                data["named_locations"] = self._get_named_locations()
                data["identity_protection_policies"] = self._get_identity_protection_policies()
                
            elif test_type == "devices":
                # Fetch device-specific data
                data["managed_devices"] = self.azure_service.get_managed_devices(top=999)
                data["compliance_policies"] = self._get_compliance_policies()
                data["device_configurations"] = self._get_device_configurations()
                data["app_protection_policies"] = self._get_app_protection_policies()
                data["enrollment_restrictions"] = self._get_enrollment_restrictions()
                data["windows_autopilot"] = self._get_windows_autopilot_profiles()
                
        except Exception as e:
            logger.error(f"Error fetching tenant data: {e}")
            data["error"] = str(e)
        
        return data
    
    def _evaluate_test(self, test: SecurityTestDefinition, tenant_data: Dict) -> Dict:
        """Evaluate a single security test against tenant data.
        
        Args:
            test: SecurityTestDefinition to evaluate
            tenant_data: Fetched tenant configuration
            
        Returns:
            Dictionary with status, detail, and raw_data
        """
        # Map test IDs to evaluation functions
        evaluators = {
            # Identity tests
            "21770": self._eval_mfa_enabled,
            "21771": self._eval_legacy_auth_blocked,
            "21772": self._eval_ca_policy_exists,
            "21773": self._eval_risky_sign_in_policy,
            "21774": self._eval_risky_user_policy,
            "21775": self._eval_privileged_role_mfa,
            "21776": self._eval_guest_access_restricted,
            "21780": self._eval_admin_mfa_required,
            
            # Device tests
            "24840": self._eval_device_compliance_required,
            "24841": self._eval_bitlocker_encryption,
            "24842": self._eval_device_enrollment_restrictions,
            "24843": self._eval_app_protection_policy,
            "24844": self._eval_windows_hello,
        }
        
        evaluator = evaluators.get(test.test_id)
        
        if evaluator:
            return evaluator(tenant_data)
        else:
            # Default: return investigate status for unimplemented tests
            return {
                "status": TestStatusEnum.INVESTIGATE,
                "detail": "Test evaluation not yet implemented",
                "raw_data": None
            }
    
    # ==========================================================================
    # IDENTITY TEST EVALUATORS
    # ==========================================================================
    
    def _eval_mfa_enabled(self, data: Dict) -> Dict:
        """Check if MFA is enabled for all users."""
        policies = data.get("conditional_access_policies", [])
        
        # Check for CA policy requiring MFA
        mfa_policy = None
        for policy in policies:
            if policy.get("state") == "enabled":
                grant_controls = policy.get("grantControls", {})
                if "mfa" in grant_controls.get("builtInControls", []):
                    mfa_policy = policy
                    break
        
        if mfa_policy:
            return {
                "status": TestStatusEnum.PASSED,
                "detail": f"MFA policy found: {mfa_policy.get('displayName')}",
                "raw_data": {"policy_id": mfa_policy.get("id")}
            }
        else:
            return {
                "status": TestStatusEnum.FAILED,
                "detail": "No Conditional Access policy requiring MFA found",
                "raw_data": {"policies_checked": len(policies)}
            }
    
    def _eval_legacy_auth_blocked(self, data: Dict) -> Dict:
        """Check if legacy authentication is blocked."""
        policies = data.get("conditional_access_policies", [])
        
        for policy in policies:
            if policy.get("state") == "enabled":
                conditions = policy.get("conditions", {})
                client_apps = conditions.get("clientAppTypes", [])
                grant_controls = policy.get("grantControls", {})
                
                # Check if policy blocks legacy auth
                if "exchangeActiveSync" in client_apps or "other" in client_apps:
                    if grant_controls.get("builtInControls") == ["block"]:
                        return {
                            "status": TestStatusEnum.PASSED,
                            "detail": f"Legacy auth blocked by: {policy.get('displayName')}",
                            "raw_data": {"policy_id": policy.get("id")}
                        }
        
        return {
            "status": TestStatusEnum.FAILED,
            "detail": "No policy blocking legacy authentication found",
            "raw_data": None
        }
    
    def _eval_ca_policy_exists(self, data: Dict) -> Dict:
        """Check if Conditional Access policies exist."""
        policies = data.get("conditional_access_policies", [])
        enabled_policies = [p for p in policies if p.get("state") == "enabled"]
        
        if len(enabled_policies) >= 1:
            return {
                "status": TestStatusEnum.PASSED,
                "detail": f"{len(enabled_policies)} Conditional Access policies enabled",
                "raw_data": {"policy_count": len(enabled_policies)}
            }
        else:
            return {
                "status": TestStatusEnum.FAILED,
                "detail": "No enabled Conditional Access policies found",
                "raw_data": None
            }
    
    def _eval_risky_sign_in_policy(self, data: Dict) -> Dict:
        """Check if risky sign-in policy is configured."""
        policies = data.get("identity_protection_policies", {})
        sign_in_policy = policies.get("signInRiskPolicy")
        
        if sign_in_policy and sign_in_policy.get("isEnabled"):
            return {
                "status": TestStatusEnum.PASSED,
                "detail": "Risky sign-in policy is enabled",
                "raw_data": sign_in_policy
            }
        else:
            return {
                "status": TestStatusEnum.FAILED,
                "detail": "Risky sign-in policy is not configured",
                "raw_data": None
            }
    
    def _eval_risky_user_policy(self, data: Dict) -> Dict:
        """Check if risky user policy is configured."""
        policies = data.get("identity_protection_policies", {})
        user_policy = policies.get("userRiskPolicy")
        
        if user_policy and user_policy.get("isEnabled"):
            return {
                "status": TestStatusEnum.PASSED,
                "detail": "Risky user policy is enabled",
                "raw_data": user_policy
            }
        else:
            return {
                "status": TestStatusEnum.FAILED,
                "detail": "Risky user policy is not configured",
                "raw_data": None
            }
    
    def _eval_privileged_role_mfa(self, data: Dict) -> Dict:
        """Check if privileged roles require MFA."""
        policies = data.get("conditional_access_policies", [])
        
        privileged_roles = [
            "Global Administrator",
            "Security Administrator",
            "Exchange Administrator",
            "SharePoint Administrator"
        ]
        
        for policy in policies:
            if policy.get("state") == "enabled":
                conditions = policy.get("conditions", {})
                users = conditions.get("users", {})
                roles = users.get("includeRoles", [])
                grant_controls = policy.get("grantControls", {})
                
                if roles and "mfa" in grant_controls.get("builtInControls", []):
                    return {
                        "status": TestStatusEnum.PASSED,
                        "detail": "MFA required for privileged roles",
                        "raw_data": {"policy_id": policy.get("id")}
                    }
        
        return {
            "status": TestStatusEnum.INVESTIGATE,
            "detail": "No explicit MFA policy for privileged roles found",
            "raw_data": None
        }
    
    def _eval_guest_access_restricted(self, data: Dict) -> Dict:
        """Check if guest user access is restricted."""
        policies = data.get("conditional_access_policies", [])
        
        for policy in policies:
            if policy.get("state") == "enabled":
                conditions = policy.get("conditions", {})
                users = conditions.get("users", {})
                
                if "GuestsOrExternalUsers" in users.get("includeGuestsOrExternalUsers", {}).get("guestOrExternalUserTypes", ""):
                    return {
                        "status": TestStatusEnum.PASSED,
                        "detail": f"Guest access policy found: {policy.get('displayName')}",
                        "raw_data": {"policy_id": policy.get("id")}
                    }
        
        return {
            "status": TestStatusEnum.INVESTIGATE,
            "detail": "No specific guest access policy found",
            "raw_data": None
        }
    
    def _eval_admin_mfa_required(self, data: Dict) -> Dict:
        """Check if admin accounts require MFA."""
        return self._eval_privileged_role_mfa(data)
    
    # ==========================================================================
    # DEVICE TEST EVALUATORS
    # ==========================================================================
    
    def _eval_device_compliance_required(self, data: Dict) -> Dict:
        """Check if device compliance is required for access."""
        policies = data.get("conditional_access_policies", [])
        
        for policy in policies:
            if policy.get("state") == "enabled":
                grant_controls = policy.get("grantControls", {})
                if "compliantDevice" in grant_controls.get("builtInControls", []):
                    return {
                        "status": TestStatusEnum.PASSED,
                        "detail": f"Device compliance required: {policy.get('displayName')}",
                        "raw_data": {"policy_id": policy.get("id")}
                    }
        
        return {
            "status": TestStatusEnum.FAILED,
            "detail": "No policy requiring device compliance found",
            "raw_data": None
        }
    
    def _eval_bitlocker_encryption(self, data: Dict) -> Dict:
        """Check if BitLocker encryption is required."""
        policies = data.get("compliance_policies", [])
        
        for policy in policies:
            settings = policy.get("scheduledActionsForRule", [])
            # Check for BitLocker requirement in Windows compliance policies
            if "windows" in policy.get("@odata.type", "").lower():
                if policy.get("bitLockerEnabled"):
                    return {
                        "status": TestStatusEnum.PASSED,
                        "detail": f"BitLocker required: {policy.get('displayName')}",
                        "raw_data": {"policy_id": policy.get("id")}
                    }
        
        return {
            "status": TestStatusEnum.INVESTIGATE,
            "detail": "BitLocker requirement status unclear",
            "raw_data": None
        }
    
    def _eval_device_enrollment_restrictions(self, data: Dict) -> Dict:
        """Check if device enrollment restrictions are configured."""
        restrictions = data.get("enrollment_restrictions", [])
        
        if restrictions:
            return {
                "status": TestStatusEnum.PASSED,
                "detail": f"{len(restrictions)} enrollment restrictions configured",
                "raw_data": {"count": len(restrictions)}
            }
        else:
            return {
                "status": TestStatusEnum.INVESTIGATE,
                "detail": "No enrollment restrictions found",
                "raw_data": None
            }
    
    def _eval_app_protection_policy(self, data: Dict) -> Dict:
        """Check if app protection policies are configured."""
        policies = data.get("app_protection_policies", [])
        
        if policies:
            return {
                "status": TestStatusEnum.PASSED,
                "detail": f"{len(policies)} app protection policies configured",
                "raw_data": {"count": len(policies)}
            }
        else:
            return {
                "status": TestStatusEnum.FAILED,
                "detail": "No app protection policies found",
                "raw_data": None
            }
    
    def _eval_windows_hello(self, data: Dict) -> Dict:
        """Check if Windows Hello for Business is configured."""
        configs = data.get("device_configurations", [])
        
        for config in configs:
            if "windowsIdentityProtection" in config.get("@odata.type", ""):
                return {
                    "status": TestStatusEnum.PASSED,
                    "detail": "Windows Hello for Business configured",
                    "raw_data": {"config_id": config.get("id")}
                }
        
        return {
            "status": TestStatusEnum.INVESTIGATE,
            "detail": "Windows Hello configuration not found",
            "raw_data": None
        }
    
    # ==========================================================================
    # GRAPH API DATA FETCHERS
    # ==========================================================================
    
    def _get_conditional_access_policies(self) -> List[Dict]:
        """Fetch Conditional Access policies."""
        try:
            token = self.azure_service._get_access_token()
            if not token:
                return []
            
            headers = {"Authorization": f"Bearer {token}"}
            url = "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies"
            
            import requests
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                return response.json().get("value", [])
            else:
                logger.warning(f"Failed to fetch CA policies: {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Error fetching CA policies: {e}")
            return []
    
    def _get_authentication_methods(self) -> Dict:
        """Fetch authentication methods configuration."""
        try:
            token = self.azure_service._get_access_token()
            if not token:
                return {}
            
            headers = {"Authorization": f"Bearer {token}"}
            url = "https://graph.microsoft.com/v1.0/policies/authenticationMethodsPolicy"
            
            import requests
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                return response.json()
            return {}
        except Exception as e:
            logger.error(f"Error fetching auth methods: {e}")
            return {}
    
    def _get_risky_users(self) -> List[Dict]:
        """Fetch risky users."""
        try:
            token = self.azure_service._get_access_token()
            if not token:
                return []
            
            headers = {"Authorization": f"Bearer {token}"}
            url = "https://graph.microsoft.com/v1.0/identityProtection/riskyUsers"
            
            import requests
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                return response.json().get("value", [])
            return []
        except Exception as e:
            logger.error(f"Error fetching risky users: {e}")
            return []
    
    def _get_directory_roles(self) -> List[Dict]:
        """Fetch directory roles and assignments."""
        try:
            token = self.azure_service._get_access_token()
            if not token:
                return []
            
            headers = {"Authorization": f"Bearer {token}"}
            url = "https://graph.microsoft.com/v1.0/directoryRoles"
            
            import requests
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                return response.json().get("value", [])
            return []
        except Exception as e:
            logger.error(f"Error fetching directory roles: {e}")
            return []
    
    def _get_named_locations(self) -> List[Dict]:
        """Fetch named locations."""
        try:
            token = self.azure_service._get_access_token()
            if not token:
                return []
            
            headers = {"Authorization": f"Bearer {token}"}
            url = "https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations"
            
            import requests
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                return response.json().get("value", [])
            return []
        except Exception as e:
            logger.error(f"Error fetching named locations: {e}")
            return []
    
    def _get_identity_protection_policies(self) -> Dict:
        """Fetch Identity Protection policies."""
        # Note: These require specific permissions
        return {}
    
    def _get_compliance_policies(self) -> List[Dict]:
        """Fetch device compliance policies."""
        try:
            token = self.azure_service._get_access_token()
            if not token:
                return []
            
            headers = {"Authorization": f"Bearer {token}"}
            url = "https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies"
            
            import requests
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                return response.json().get("value", [])
            return []
        except Exception as e:
            logger.error(f"Error fetching compliance policies: {e}")
            return []
    
    def _get_device_configurations(self) -> List[Dict]:
        """Fetch device configuration profiles."""
        try:
            token = self.azure_service._get_access_token()
            if not token:
                return []
            
            headers = {"Authorization": f"Bearer {token}"}
            url = "https://graph.microsoft.com/v1.0/deviceManagement/deviceConfigurations"
            
            import requests
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                return response.json().get("value", [])
            return []
        except Exception as e:
            logger.error(f"Error fetching device configs: {e}")
            return []
    
    def _get_app_protection_policies(self) -> List[Dict]:
        """Fetch app protection policies."""
        try:
            token = self.azure_service._get_access_token()
            if not token:
                return []
            
            headers = {"Authorization": f"Bearer {token}"}
            # Get both iOS and Android policies
            policies = []
            
            for platform in ["iosManagedAppProtections", "androidManagedAppProtections"]:
                url = f"https://graph.microsoft.com/v1.0/deviceAppManagement/{platform}"
                import requests
                response = requests.get(url, headers=headers)
                if response.status_code == 200:
                    policies.extend(response.json().get("value", []))
            
            return policies
        except Exception as e:
            logger.error(f"Error fetching app protection policies: {e}")
            return []
    
    def _get_enrollment_restrictions(self) -> List[Dict]:
        """Fetch enrollment restrictions."""
        try:
            token = self.azure_service._get_access_token()
            if not token:
                return []
            
            headers = {"Authorization": f"Bearer {token}"}
            url = "https://graph.microsoft.com/v1.0/deviceManagement/deviceEnrollmentConfigurations"
            
            import requests
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                return response.json().get("value", [])
            return []
        except Exception as e:
            logger.error(f"Error fetching enrollment restrictions: {e}")
            return []
    
    def _get_windows_autopilot_profiles(self) -> List[Dict]:
        """Fetch Windows Autopilot profiles."""
        try:
            token = self.azure_service._get_access_token()
            if not token:
                return []
            
            headers = {"Authorization": f"Bearer {token}"}
            url = "https://graph.microsoft.com/v1.0/deviceManagement/windowsAutopilotDeploymentProfiles"
            
            import requests
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                return response.json().get("value", [])
            return []
        except Exception as e:
            logger.error(f"Error fetching Autopilot profiles: {e}")
            return []
