"""Identity security tests router.

This module provides endpoints to run Zero Trust identity security tests
against Microsoft Graph API data.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_current_user
from ..graph_client import get_graph_client, GraphClient
from ..models import User

logger = logging.getLogger(__name__)

router = APIRouter()


def create_test_result(
    test_id: str,
    name: str,
    description: str,
    status: str,
    details: str = "",
    data: Any = None,
    recommendation: str = "",
) -> Dict:
    """Create a standardized test result object."""
    return {
        "testId": test_id,
        "name": name,
        "description": description,
        "status": status,  # "pass", "fail", "warning", "error", "not_applicable"
        "details": details,
        "data": data,
        "recommendation": recommendation,
        "timestamp": datetime.utcnow().isoformat(),
    }


def test_security_defaults(client: GraphClient) -> Dict:
    """Test ID-001: Check if security defaults are enabled."""
    try:
        policy = client.get_security_defaults()
        is_enabled = policy.get("isEnabled", False)
        
        return create_test_result(
            test_id="ID-001",
            name="Security Defaults",
            description="Check if Azure AD security defaults are enabled",
            status="pass" if is_enabled else "warning",
            details=f"Security defaults are {'enabled' if is_enabled else 'disabled'}. "
                    f"{'Good!' if is_enabled else 'Consider enabling security defaults or using Conditional Access policies.'}",
            data={"isEnabled": is_enabled},
            recommendation="" if is_enabled else "Enable security defaults or implement equivalent Conditional Access policies.",
        )
    except Exception as e:
        logger.error(f"Error testing security defaults: {e}")
        return create_test_result(
            test_id="ID-001",
            name="Security Defaults",
            description="Check if Azure AD security defaults are enabled",
            status="error",
            details=f"Failed to check security defaults: {str(e)}",
        )


def test_high_risk_detections(client: GraphClient) -> Dict:
    """Test ID-002: Check for high risk detections in the last 30 days."""
    try:
        detections = client.get_risk_detections()
        
        # Filter for high/medium risk in last 30 days
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        recent_high_risk = [
            d for d in detections
            if d.get("riskLevel") in ["high", "medium"]
            and d.get("activityDateTime")
        ]
        
        high_count = len([d for d in recent_high_risk if d.get("riskLevel") == "high"])
        medium_count = len([d for d in recent_high_risk if d.get("riskLevel") == "medium"])
        
        status = "pass"
        if high_count > 0:
            status = "fail"
        elif medium_count > 5:
            status = "warning"
        
        return create_test_result(
            test_id="ID-002",
            name="Risk Detections",
            description="Check for high/medium risk detections",
            status=status,
            details=f"Found {high_count} high-risk and {medium_count} medium-risk detections.",
            data={
                "highRiskCount": high_count,
                "mediumRiskCount": medium_count,
                "totalDetections": len(detections),
            },
            recommendation="Investigate and remediate high-risk detections immediately." if high_count > 0 else "",
        )
    except Exception as e:
        logger.error(f"Error testing risk detections: {e}")
        return create_test_result(
            test_id="ID-002",
            name="Risk Detections",
            description="Check for high/medium risk detections",
            status="error",
            details=f"Failed to retrieve risk detections: {str(e)}. Ensure IdentityRiskEvent.Read.All permission is granted.",
        )


def test_risky_users(client: GraphClient) -> Dict:
    """Test ID-003: Check for users flagged as risky."""
    try:
        risky_users = client.get_risky_users()
        
        high_risk = [u for u in risky_users if u.get("riskLevel") == "high"]
        medium_risk = [u for u in risky_users if u.get("riskLevel") == "medium"]
        
        status = "pass"
        if len(high_risk) > 0:
            status = "fail"
        elif len(medium_risk) > 0:
            status = "warning"
        
        return create_test_result(
            test_id="ID-003",
            name="Risky Users",
            description="Check for users flagged as at-risk",
            status=status,
            details=f"Found {len(high_risk)} high-risk and {len(medium_risk)} medium-risk users.",
            data={
                "highRiskUsers": len(high_risk),
                "mediumRiskUsers": len(medium_risk),
                "totalRiskyUsers": len(risky_users),
                "users": [{"displayName": u.get("userDisplayName"), "riskLevel": u.get("riskLevel")} 
                         for u in risky_users[:10]],  # Limit to first 10
            },
            recommendation="Review and remediate risky user accounts." if status != "pass" else "",
        )
    except Exception as e:
        logger.error(f"Error testing risky users: {e}")
        return create_test_result(
            test_id="ID-003",
            name="Risky Users",
            description="Check for users flagged as at-risk",
            status="error",
            details=f"Failed to retrieve risky users: {str(e)}. Ensure IdentityRiskyUser.Read.All permission is granted.",
        )


def test_conditional_access_policies(client: GraphClient) -> Dict:
    """Test ID-004: Check conditional access policy configuration."""
    try:
        policies = client.get_conditional_access_policies()
        
        enabled_policies = [p for p in policies if p.get("state") == "enabled"]
        report_only = [p for p in policies if p.get("state") == "enabledForReportingButNotEnforced"]
        
        # Check for key policy types
        mfa_policies = [p for p in enabled_policies 
                       if "mfa" in str(p.get("grantControls", {})).lower()]
        device_policies = [p for p in enabled_policies 
                         if "compliantDevice" in str(p.get("grantControls", {})) or
                            "domainJoinedDevice" in str(p.get("grantControls", {}))]
        
        status = "pass" if len(enabled_policies) >= 3 else "warning" if len(enabled_policies) >= 1 else "fail"
        
        return create_test_result(
            test_id="ID-004",
            name="Conditional Access Policies",
            description="Check conditional access policy coverage",
            status=status,
            details=f"Found {len(enabled_policies)} enabled policies, {len(report_only)} in report-only mode.",
            data={
                "totalPolicies": len(policies),
                "enabledPolicies": len(enabled_policies),
                "reportOnlyPolicies": len(report_only),
                "mfaPolicies": len(mfa_policies),
                "devicePolicies": len(device_policies),
                "policies": [{"displayName": p.get("displayName"), "state": p.get("state")} 
                            for p in policies[:20]],
            },
            recommendation="Implement comprehensive conditional access policies for Zero Trust." if status != "pass" else "",
        )
    except Exception as e:
        logger.error(f"Error testing CA policies: {e}")
        return create_test_result(
            test_id="ID-004",
            name="Conditional Access Policies",
            description="Check conditional access policy coverage",
            status="error",
            details=f"Failed to retrieve CA policies: {str(e)}. Ensure Policy.Read.All permission is granted.",
        )


def test_privileged_roles(client: GraphClient) -> Dict:
    """Test ID-005: Check privileged role assignments."""
    try:
        roles = client.get_directory_roles()
        
        # High privilege roles to monitor
        privileged_role_names = [
            "Global Administrator",
            "Privileged Role Administrator", 
            "Security Administrator",
            "Exchange Administrator",
            "SharePoint Administrator",
            "User Administrator",
            "Billing Administrator",
        ]
        
        role_assignments = []
        for role in roles:
            role_name = role.get("displayName", "")
            if any(priv in role_name for priv in privileged_role_names):
                members = client.get_directory_role_members(role.get("id"))
                role_assignments.append({
                    "role": role_name,
                    "memberCount": len(members),
                    "members": [m.get("displayName") for m in members[:5]],
                })
        
        global_admins = next((r for r in role_assignments if r["role"] == "Global Administrator"), None)
        ga_count = global_admins["memberCount"] if global_admins else 0
        
        status = "pass"
        if ga_count > 5:
            status = "fail"
        elif ga_count > 3:
            status = "warning"
        
        return create_test_result(
            test_id="ID-005",
            name="Privileged Role Assignments",
            description="Check privileged role assignments (limit Global Admins)",
            status=status,
            details=f"Found {ga_count} Global Administrators. Best practice is 2-4.",
            data={
                "globalAdminCount": ga_count,
                "roleAssignments": role_assignments,
            },
            recommendation="Reduce Global Administrator count to 2-4 accounts." if status != "pass" else "",
        )
    except Exception as e:
        logger.error(f"Error testing privileged roles: {e}")
        return create_test_result(
            test_id="ID-005",
            name="Privileged Role Assignments",
            description="Check privileged role assignments",
            status="error",
            details=f"Failed to retrieve role assignments: {str(e)}. Ensure RoleManagement.Read.Directory permission is granted.",
        )


def test_mfa_coverage(client: GraphClient) -> Dict:
    """Test ID-006: Check MFA registration coverage."""
    try:
        mfa_details = client.get_mfa_registration_details()
        
        total_users = len(mfa_details)
        mfa_registered = [u for u in mfa_details if u.get("isMfaRegistered", False)]
        mfa_capable = [u for u in mfa_details if u.get("isMfaCapable", False)]
        
        coverage_pct = (len(mfa_registered) / total_users * 100) if total_users > 0 else 0
        
        status = "pass" if coverage_pct >= 95 else "warning" if coverage_pct >= 80 else "fail"
        
        return create_test_result(
            test_id="ID-006",
            name="MFA Registration Coverage",
            description="Check percentage of users with MFA registered",
            status=status,
            details=f"MFA registration: {len(mfa_registered)}/{total_users} users ({coverage_pct:.1f}%)",
            data={
                "totalUsers": total_users,
                "mfaRegistered": len(mfa_registered),
                "mfaCapable": len(mfa_capable),
                "coveragePercent": round(coverage_pct, 1),
            },
            recommendation="Ensure all users register for MFA. Target 100% coverage." if status != "pass" else "",
        )
    except Exception as e:
        logger.error(f"Error testing MFA coverage: {e}")
        return create_test_result(
            test_id="ID-006",
            name="MFA Registration Coverage",
            description="Check percentage of users with MFA registered",
            status="error",
            details=f"Failed to retrieve MFA details: {str(e)}. Ensure UserAuthenticationMethod.Read.All permission is granted.",
        )


def test_named_locations(client: GraphClient) -> Dict:
    """Test ID-007: Check if named/trusted locations are configured."""
    try:
        locations = client.get_named_locations()
        
        trusted_locations = [loc for loc in locations if loc.get("isTrusted", False)]
        
        status = "pass" if len(trusted_locations) > 0 else "warning"
        
        return create_test_result(
            test_id="ID-007",
            name="Named Locations",
            description="Check if trusted network locations are defined",
            status=status,
            details=f"Found {len(locations)} named locations, {len(trusted_locations)} marked as trusted.",
            data={
                "totalLocations": len(locations),
                "trustedLocations": len(trusted_locations),
                "locations": [{"displayName": loc.get("displayName"), "isTrusted": loc.get("isTrusted")}
                             for loc in locations],
            },
            recommendation="Define trusted network locations for conditional access." if status != "pass" else "",
        )
    except Exception as e:
        logger.error(f"Error testing named locations: {e}")
        return create_test_result(
            test_id="ID-007",
            name="Named Locations",
            description="Check if trusted network locations are defined",
            status="error",
            details=f"Failed to retrieve named locations: {str(e)}",
        )


def test_authentication_methods(client: GraphClient) -> Dict:
    """Test ID-008: Check authentication methods policy."""
    try:
        policy = client.get_authentication_methods_policy()
        
        methods = policy.get("authenticationMethodConfigurations", [])
        enabled_methods = [m for m in methods if m.get("state") == "enabled"]
        
        # Check for secure methods
        secure_methods = ["fido2", "microsoftAuthenticator", "windowsHelloForBusiness"]
        has_secure = any(
            any(sm in m.get("id", "").lower() for sm in secure_methods)
            for m in enabled_methods
        )
        
        # Check for legacy methods that should be disabled
        legacy_methods = ["sms", "voice"]
        has_legacy = any(
            any(lm in m.get("id", "").lower() for lm in legacy_methods)
            for m in enabled_methods
        )
        
        status = "pass" if has_secure and not has_legacy else "warning" if has_secure else "fail"
        
        return create_test_result(
            test_id="ID-008",
            name="Authentication Methods Policy",
            description="Check that secure authentication methods are enabled",
            status=status,
            details=f"Found {len(enabled_methods)} enabled authentication methods. "
                    f"{'Secure methods enabled. ' if has_secure else 'No secure methods found. '}"
                    f"{'Legacy methods (SMS/Voice) should be disabled.' if has_legacy else ''}",
            data={
                "enabledMethods": [m.get("id") for m in enabled_methods],
                "hasSecureMethods": has_secure,
                "hasLegacyMethods": has_legacy,
            },
            recommendation="Enable FIDO2/Authenticator and disable SMS/Voice authentication." if status != "pass" else "",
        )
    except Exception as e:
        logger.error(f"Error testing auth methods: {e}")
        return create_test_result(
            test_id="ID-008",
            name="Authentication Methods Policy",
            description="Check authentication methods policy",
            status="error",
            details=f"Failed to retrieve authentication methods policy: {str(e)}",
        )


@router.get("/identity-tests")
async def run_identity_tests(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Run all identity security tests and return results.
    
    Required Graph API Permissions:
    - Policy.Read.All
    - IdentityRiskEvent.Read.All
    - IdentityRiskyUser.Read.All
    - RoleManagement.Read.Directory
    - UserAuthenticationMethod.Read.All
    - Directory.Read.All
    """
    client = get_graph_client()
    
    if not client.is_configured:
        raise HTTPException(
            status_code=503,
            detail="Azure credentials not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET."
        )
    
    # Run all tests
    tests = [
        test_security_defaults(client),
        test_high_risk_detections(client),
        test_risky_users(client),
        test_conditional_access_policies(client),
        test_privileged_roles(client),
        test_mfa_coverage(client),
        test_named_locations(client),
        test_authentication_methods(client),
    ]
    
    # Calculate summary
    passed = len([t for t in tests if t["status"] == "pass"])
    failed = len([t for t in tests if t["status"] == "fail"])
    warnings = len([t for t in tests if t["status"] == "warning"])
    errors = len([t for t in tests if t["status"] == "error"])
    
    return {
        "category": "Identity",
        "timestamp": datetime.utcnow().isoformat(),
        "summary": {
            "total": len(tests),
            "passed": passed,
            "failed": failed,
            "warnings": warnings,
            "errors": errors,
            "score": round((passed / len(tests)) * 100) if tests else 0,
        },
        "tests": tests,
    }
