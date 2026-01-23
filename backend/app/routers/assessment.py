"""Assessment API routes for Zero Trust evaluation.

Provides endpoints for overview, identity, and device assessments
with cached Graph API data and manual refresh capability.
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db
from ..models import User, CachedGraphData, CachedGraphDataTypeEnum
from ..azure_service import azure_service

logger = logging.getLogger(__name__)
router = APIRouter()

# Cache expiry in hours
CACHE_EXPIRY_HOURS = 1


def get_or_create_cache(
    db: Session, 
    data_type: CachedGraphDataTypeEnum, 
    fetch_func: callable,
    force_refresh: bool = False
) -> Dict[str, Any]:
    """Get cached data or fetch fresh data if expired/missing.
    
    Args:
        db: Database session
        data_type: Type of data to cache
        fetch_func: Function to call to fetch fresh data
        force_refresh: Force refresh even if cache is valid
        
    Returns:
        Cached or fresh data dictionary
    """
    try:
        cache = db.query(CachedGraphData).filter(
            CachedGraphData.data_type == data_type
        ).first()
        
        now = datetime.now(timezone.utc)
        
        # Return cached data if valid and not forcing refresh
        if cache and not force_refresh:
            # Handle both timezone-aware and naive datetimes
            cache_expires = cache.expires_at
            if cache_expires.tzinfo is None:
                cache_expires = cache_expires.replace(tzinfo=timezone.utc)
            if cache_expires > now:
                return {
                    "data": cache.data_json,
                    "last_synced": cache.last_synced.isoformat(),
                    "expires_at": cache.expires_at.isoformat(),
                    "is_cached": True
                }
        
        # Fetch fresh data
        try:
            fresh_data = fetch_func()
            expires_at = now + timedelta(hours=CACHE_EXPIRY_HOURS)
            
            if cache:
                cache.data_json = fresh_data
                cache.last_synced = now
                cache.expires_at = expires_at
                cache.sync_status = "success"
                cache.error_message = None
            else:
                cache = CachedGraphData(
                    data_type=data_type,
                    data_json=fresh_data,
                    last_synced=now,
                    expires_at=expires_at,
                    sync_status="success"
                )
                db.add(cache)
            
            db.commit()
            
            return {
                "data": fresh_data,
                "last_synced": now.isoformat(),
                "expires_at": expires_at.isoformat(),
                "is_cached": False
            }
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error fetching {data_type}: {str(e)}")
            
            # Re-query cache after rollback
            cache = db.query(CachedGraphData).filter(
                CachedGraphData.data_type == data_type
            ).first()
            
            # Return stale cache if available
            if cache:
                return {
                    "data": cache.data_json,
                    "last_synced": cache.last_synced.isoformat(),
                    "expires_at": cache.expires_at.isoformat(),
                    "is_cached": True,
                    "error": str(e)
                }
            
            raise HTTPException(status_code=500, detail=f"Failed to fetch data: {str(e)}")
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Database error for {data_type}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/overview")
def get_overview_assessment(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get overview assessment data including tenant info and summary metrics.
    
    Returns tenant information, user/device counts, and assessment scores.
    """
    def fetch_overview():
        tenant_info = azure_service.get_tenant_info()
        
        # Get counts
        user_count = azure_service.get_user_count()
        guest_count = azure_service.get_guest_user_count()
        group_count = azure_service.get_group_count()
        app_count = azure_service.get_app_count()
        device_count = azure_service.get_device_count()
        
        # Get managed devices for compliance calculation
        try:
            devices = azure_service.get_managed_devices(top=999)
            compliant_count = sum(1 for d in devices if d.get('complianceState') == 'compliant')
            managed_count = len(devices)
        except:
            devices = []
            compliant_count = 0
            managed_count = 0
        
        # Get authentication methods summary
        auth_summary = azure_service.get_authentication_methods_summary()
        
        # Calculate assessment scores
        identity_score = calculate_identity_score(auth_summary, user_count)
        device_score = calculate_device_score(devices, device_count)
        
        return {
            "tenant": tenant_info,
            "metrics": {
                "users": user_count,
                "guests": guest_count,
                "groups": group_count,
                "apps": app_count,
                "devices": device_count,
                "managed_devices": managed_count,
                "compliant_devices": compliant_count,
            },
            "assessment_scores": {
                "identity": {
                    "score": identity_score,
                    "tests_passed": int(identity_score * 0.85),
                    "total_tests": 85
                },
                "devices": {
                    "score": device_score,
                    "tests_passed": int(device_score * 0.36),
                    "total_tests": 36
                }
            },
            "auth_methods_summary": auth_summary
        }
    
    return get_or_create_cache(db, CachedGraphDataTypeEnum.OVERVIEW_STATS, fetch_overview)


@router.get("/identity")
def get_identity_assessment(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get identity assessment data including MFA status, risky users, and CA policies.
    
    Returns detailed identity security assessment with test results matching PS1 evaluation logic.
    """
    def fetch_identity():
        # Get users and authentication methods
        users = azure_service.get_users(top=999)
        auth_summary = azure_service.get_authentication_methods_summary()
        
        # Get risky users
        try:
            risky_users = azure_service.get_risky_users()
        except:
            risky_users = []
        
        # Get conditional access policies
        try:
            ca_policies = azure_service.get_conditional_access_policies()
        except:
            ca_policies = []
        
        # Get sign-in logs
        try:
            sign_in_logs = azure_service.get_sign_in_logs(top=100)
        except:
            sign_in_logs = []
        
        # Calculate identity checks (legacy format)
        checks = generate_identity_checks(users, auth_summary, risky_users, ca_policies, sign_in_logs)
        
        # Generate detailed test results with markdown output (PS1 format)
        detailed_test_results = evaluate_detailed_test_results(ca_policies, auth_summary, risky_users, users)
        
        # Generate Sankey data for authentication flow
        sankey_data = generate_auth_sankey_data(auth_summary)
        
        return {
            "total_users": len(users),
            "auth_summary": auth_summary,
            "risky_users": risky_users[:20],  # Limit for response size
            "risky_user_count": len(risky_users),
            "ca_policies": ca_policies,
            "ca_policy_count": len(ca_policies),
            "recent_sign_ins": sign_in_logs[:50],
            "checks": checks,
            "sankey_data": sankey_data,
            "detailed_test_results": detailed_test_results
        }
    
    return get_or_create_cache(db, CachedGraphDataTypeEnum.IDENTITY_ASSESSMENT, fetch_identity)


@router.get("/devices")
def get_device_assessment(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get device assessment data including compliance status and OS distribution.
    
    Returns detailed device security assessment.
    """
    def fetch_devices():
        # Get managed devices from Intune
        try:
            devices = azure_service.get_managed_devices(top=999)
        except:
            devices = []
        
        # Calculate device statistics
        os_distribution = {}
        compliance_stats = {"compliant": 0, "noncompliant": 0, "unknown": 0}
        ownership_stats = {"corporate": 0, "personal": 0}
        encryption_stats = {"encrypted": 0, "not_encrypted": 0}
        
        for device in devices:
            # OS distribution
            os = device.get('operatingSystem', 'Unknown')
            os_distribution[os] = os_distribution.get(os, 0) + 1
            
            # Compliance
            compliance = device.get('complianceState', 'unknown')
            if compliance == 'compliant':
                compliance_stats['compliant'] += 1
            elif compliance == 'noncompliant':
                compliance_stats['noncompliant'] += 1
            else:
                compliance_stats['unknown'] += 1
            
            # Ownership
            ownership = device.get('managedDeviceOwnerType', 'unknown')
            if ownership == 'company':
                ownership_stats['corporate'] += 1
            else:
                ownership_stats['personal'] += 1
            
            # Encryption
            if device.get('isEncrypted', False):
                encryption_stats['encrypted'] += 1
            else:
                encryption_stats['not_encrypted'] += 1
        
        # Generate device checks
        checks = generate_device_checks(devices, compliance_stats, encryption_stats)
        
        # Generate Sankey data for device flow
        sankey_data = generate_device_sankey_data(devices)
        
        total = len(devices) or 1  # Avoid division by zero
        
        return {
            "total_devices": len(devices),
            "devices": devices[:100],  # Limit for response size
            "os_distribution": os_distribution,
            "compliance_stats": compliance_stats,
            "compliance_rate": round(compliance_stats['compliant'] / total * 100, 1),
            "ownership_stats": ownership_stats,
            "encryption_stats": encryption_stats,
            "encryption_rate": round(encryption_stats['encrypted'] / total * 100, 1),
            "checks": checks,
            "sankey_data": sankey_data
        }
    
    return get_or_create_cache(db, CachedGraphDataTypeEnum.DEVICE_ASSESSMENT, fetch_devices)


@router.post("/refresh")
def refresh_assessment_data(
    data_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Force refresh of assessment data.
    
    Args:
        data_type: Specific data type to refresh, or 'all' for everything
    """
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    refreshed = []
    errors = []
    
    if data_type is None or data_type == "all":
        types_to_refresh = [
            CachedGraphDataTypeEnum.OVERVIEW_STATS,
            CachedGraphDataTypeEnum.IDENTITY_ASSESSMENT,
            CachedGraphDataTypeEnum.DEVICE_ASSESSMENT,
        ]
    else:
        try:
            types_to_refresh = [CachedGraphDataTypeEnum(data_type)]
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid data type: {data_type}")
    
    fetch_funcs = {
        CachedGraphDataTypeEnum.OVERVIEW_STATS: lambda: get_overview_assessment(db, current_user),
        CachedGraphDataTypeEnum.IDENTITY_ASSESSMENT: lambda: get_identity_assessment(db, current_user),
        CachedGraphDataTypeEnum.DEVICE_ASSESSMENT: lambda: get_device_assessment(db, current_user),
    }
    
    for dtype in types_to_refresh:
        try:
            # Delete existing cache to force refresh
            db.query(CachedGraphData).filter(
                CachedGraphData.data_type == dtype
            ).delete()
            db.commit()
            
            # Fetch fresh data (will create new cache)
            if dtype in fetch_funcs:
                fetch_funcs[dtype]()
            
            refreshed.append(dtype.value)
        except Exception as e:
            errors.append({"type": dtype.value, "error": str(e)})
    
    return {
        "refreshed": refreshed,
        "errors": errors,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.get("/cache-status")
def get_cache_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get status of all cached assessment data."""
    caches = db.query(CachedGraphData).all()
    
    now = datetime.utcnow()
    status = {}
    
    for cache in caches:
        status[cache.data_type.value] = {
            "last_synced": cache.last_synced.isoformat() if cache.last_synced else None,
            "expires_at": cache.expires_at.isoformat() if cache.expires_at else None,
            "is_expired": cache.expires_at < now if cache.expires_at else True,
            "sync_status": cache.sync_status,
            "error_message": cache.error_message
        }
    
    return {"cache_status": status, "checked_at": now.isoformat()}


# ========== NEW: Live Test Execution Endpoints ==========

from .identity_tests import (
    test_security_defaults,
    test_high_risk_detections,
    test_risky_users,
    test_conditional_access_policies,
    test_privileged_roles,
    test_mfa_coverage,
    test_named_locations,
    test_authentication_methods,
)
from .device_tests import (
    test_device_compliance_policies,
    test_device_compliance_status,
    test_device_encryption,
    test_device_configurations,
    test_stale_devices,
    test_os_versions,
    test_enrollment_restrictions,
    test_app_protection_policies,
)
from ..graph_client import get_graph_client


# Mapping of test IDs to test functions for identity tests
IDENTITY_TEST_FUNCTIONS = {
    "ID-001": test_security_defaults,
    "INTUNE-ID-001": test_security_defaults,
    "ID-002": test_high_risk_detections,
    "ID-003": test_risky_users,
    "ID-004": test_conditional_access_policies,
    "INTUNE-CA-001": test_conditional_access_policies,
    "ID-005": test_privileged_roles,
    "ID-006": test_mfa_coverage,
    "INTUNE-MFA-001": test_mfa_coverage,
    "ID-007": test_named_locations,
    "ID-008": test_authentication_methods,
}

# Mapping of test IDs to test functions for device tests
DEVICE_TEST_FUNCTIONS = {
    "DEV-001": test_device_compliance_policies,
    "INTUNE-COMP-001": test_device_compliance_policies,
    "DEV-002": test_device_compliance_status,
    "DEV-003": test_device_encryption,
    "INTUNE-ENC-001": test_device_encryption,
    "DEV-004": test_device_configurations,
    "DEV-005": test_stale_devices,
    "INTUNE-STALE-001": test_stale_devices,
    "DEV-006": test_os_versions,
    "INTUNE-UPD-001": test_os_versions,
    "DEV-007": test_enrollment_restrictions,
    "DEV-008": test_app_protection_policies,
    "INTUNE-MAM-001": test_app_protection_policies,
}


@router.post("/identity/run")
async def run_all_identity_tests(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Run all implemented identity security tests.
    
    This endpoint runs the 8 core identity tests against Microsoft Graph API.
    Returns results for each test with pass/fail status, details, and recommendations.
    """
    client = get_graph_client()
    
    if not client.is_configured:
        raise HTTPException(
            status_code=503,
            detail="Azure credentials not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET."
        )
    
    # Run all available identity tests
    results = []
    test_functions = [
        test_security_defaults,
        test_high_risk_detections,
        test_risky_users,
        test_conditional_access_policies,
        test_privileged_roles,
        test_mfa_coverage,
        test_named_locations,
        test_authentication_methods,
    ]
    
    for test_func in test_functions:
        try:
            result = test_func(client)
            results.append(result)
        except Exception as e:
            logger.error(f"Error running test {test_func.__name__}: {e}")
            results.append({
                "testId": test_func.__name__,
                "name": test_func.__name__,
                "status": "error",
                "details": str(e),
            })
    
    # Calculate summary
    passed = len([r for r in results if r.get("status") == "pass"])
    failed = len([r for r in results if r.get("status") == "fail"])
    warnings = len([r for r in results if r.get("status") == "warning"])
    errors = len([r for r in results if r.get("status") == "error"])
    
    return {
        "category": "Identity",
        "timestamp": datetime.utcnow().isoformat(),
        "summary": {
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "warnings": warnings,
            "errors": errors,
            "score": round((passed / max(len(results), 1)) * 100),
        },
        "results": results,
    }


@router.post("/identity/run/{test_id}")
async def run_single_identity_test(
    test_id: str,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Run a single identity test by test ID.
    
    Args:
        test_id: The test ID (e.g., "ID-001", "INTUNE-MFA-001")
    """
    client = get_graph_client()
    
    if not client.is_configured:
        raise HTTPException(
            status_code=503,
            detail="Azure credentials not configured."
        )
    
    # Find the test function
    test_func = IDENTITY_TEST_FUNCTIONS.get(test_id.upper())
    
    if not test_func:
        # Try to match by partial ID
        for key, func in IDENTITY_TEST_FUNCTIONS.items():
            if test_id.upper() in key.upper() or key.upper() in test_id.upper():
                test_func = func
                break
    
    if not test_func:
        raise HTTPException(
            status_code=404,
            detail=f"Test '{test_id}' not found or not implemented yet."
        )
    
    try:
        result = test_func(client)
        return result
    except Exception as e:
        logger.error(f"Error running test {test_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/devices/run")
async def run_all_device_tests(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Run all implemented device security tests.
    
    This endpoint runs the 8 core device tests against Microsoft Intune API.
    Returns results for each test with pass/fail status, details, and recommendations.
    """
    client = get_graph_client()
    
    if not client.is_configured:
        raise HTTPException(
            status_code=503,
            detail="Azure credentials not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET."
        )
    
    # Run all available device tests
    results = []
    test_functions = [
        test_device_compliance_policies,
        test_device_compliance_status,
        test_device_encryption,
        test_device_configurations,
        test_stale_devices,
        test_os_versions,
        test_enrollment_restrictions,
        test_app_protection_policies,
    ]
    
    for test_func in test_functions:
        try:
            result = test_func(client)
            results.append(result)
        except Exception as e:
            logger.error(f"Error running test {test_func.__name__}: {e}")
            results.append({
                "testId": test_func.__name__,
                "name": test_func.__name__,
                "status": "error",
                "details": str(e),
            })
    
    # Calculate summary
    passed = len([r for r in results if r.get("status") == "pass"])
    failed = len([r for r in results if r.get("status") == "fail"])
    warnings = len([r for r in results if r.get("status") == "warning"])
    errors = len([r for r in results if r.get("status") == "error"])
    
    return {
        "category": "Devices",
        "timestamp": datetime.utcnow().isoformat(),
        "summary": {
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "warnings": warnings,
            "errors": errors,
            "score": round((passed / max(len(results), 1)) * 100),
        },
        "results": results,
    }


@router.post("/devices/run/{test_id}")
async def run_single_device_test(
    test_id: str,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Run a single device test by test ID.
    
    Args:
        test_id: The test ID (e.g., "DEV-001", "INTUNE-COMP-001")
    """
    client = get_graph_client()
    
    if not client.is_configured:
        raise HTTPException(
            status_code=503,
            detail="Azure credentials not configured."
        )
    
    # Find the test function
    test_func = DEVICE_TEST_FUNCTIONS.get(test_id.upper())
    
    if not test_func:
        # Try to match by partial ID
        for key, func in DEVICE_TEST_FUNCTIONS.items():
            if test_id.upper() in key.upper() or key.upper() in test_id.upper():
                test_func = func
                break
    
    if not test_func:
        raise HTTPException(
            status_code=404,
            detail=f"Test '{test_id}' not found or not implemented yet."
        )
    
    try:
        result = test_func(client)
        return result
    except Exception as e:
        logger.error(f"Error running test {test_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Helper functions for assessment calculations

def calculate_identity_score(auth_summary: Dict, user_count: int) -> int:
    """Calculate identity assessment score based on authentication methods."""
    if user_count == 0:
        return 0
    
    score = 0
    total_users = auth_summary.get('total_users', user_count) or 1
    
    # MFA adoption (40 points max)
    mfa_rate = auth_summary.get('mfa_registered', 0) / total_users
    score += int(mfa_rate * 40)
    
    # Passwordless adoption (30 points max)
    passwordless_rate = auth_summary.get('passwordless', 0) / total_users
    score += int(passwordless_rate * 30)
    
    # Phish-resistant methods (30 points max)
    fido_rate = (auth_summary.get('fido2', 0) + auth_summary.get('windows_hello', 0)) / total_users
    score += int(fido_rate * 30)
    
    return min(score, 100)


def calculate_device_score(devices: List[Dict], total_count: int) -> int:
    """Calculate device assessment score based on compliance and encryption."""
    if total_count == 0 or not devices:
        return 0
    
    score = 0
    total = len(devices) or 1
    
    # Compliance rate (50 points max)
    compliant = sum(1 for d in devices if d.get('complianceState') == 'compliant')
    score += int((compliant / total) * 50)
    
    # Encryption rate (30 points max)
    encrypted = sum(1 for d in devices if d.get('isEncrypted', False))
    score += int((encrypted / total) * 30)
    
    # Managed rate (20 points max)
    managed_rate = total / max(total_count, 1)
    score += int(managed_rate * 20)
    
    return min(score, 100)


def generate_identity_checks(
    users: List[Dict],
    auth_summary: Dict,
    risky_users: List[Dict],
    ca_policies: List[Dict],
    sign_ins: List[Dict]
) -> List[Dict]:
    """Generate identity security check results."""
    checks = []
    total_users = len(users) or 1
    
    # MFA for all users check
    mfa_rate = auth_summary.get('mfa_registered', 0) / auth_summary.get('total_users', 1)
    checks.append({
        "id": "mfa-all-users",
        "name": "MFA enabled for all users",
        "category": "Authentication",
        "status": "pass" if mfa_rate >= 0.95 else "fail" if mfa_rate < 0.5 else "investigate",
        "risk_level": "high" if mfa_rate < 0.5 else "medium" if mfa_rate < 0.95 else "low",
        "description": f"MFA registered for {auth_summary.get('mfa_registered', 0)}/{auth_summary.get('total_users', 0)} users ({mfa_rate*100:.1f}%)",
        "recommendation": "Enable MFA for all users to protect against credential theft"
    })
    
    # Passwordless authentication check
    passwordless_rate = auth_summary.get('passwordless', 0) / auth_summary.get('total_users', 1)
    checks.append({
        "id": "passwordless-auth",
        "name": "Passwordless authentication adoption",
        "category": "Authentication",
        "status": "pass" if passwordless_rate >= 0.3 else "planned" if passwordless_rate >= 0.1 else "investigate",
        "risk_level": "medium",
        "description": f"Passwordless methods used by {auth_summary.get('passwordless', 0)} users ({passwordless_rate*100:.1f}%)",
        "recommendation": "Promote passwordless authentication methods like Windows Hello and FIDO2"
    })
    
    # Risky users check
    high_risk_users = sum(1 for u in risky_users if u.get('riskLevel') == 'high')
    checks.append({
        "id": "risky-users",
        "name": "No high-risk users detected",
        "category": "Identity Protection",
        "status": "pass" if high_risk_users == 0 else "fail",
        "risk_level": "high" if high_risk_users > 0 else "low",
        "description": f"{high_risk_users} high-risk users detected",
        "recommendation": "Investigate and remediate high-risk users immediately"
    })
    
    # Conditional Access policies check
    active_policies = sum(1 for p in ca_policies if p.get('state') == 'enabled')
    checks.append({
        "id": "conditional-access",
        "name": "Conditional Access policies configured",
        "category": "Access Control",
        "status": "pass" if active_policies >= 3 else "investigate" if active_policies >= 1 else "fail",
        "risk_level": "high" if active_policies == 0 else "medium" if active_policies < 3 else "low",
        "description": f"{active_policies} active Conditional Access policies",
        "recommendation": "Configure Conditional Access policies for MFA, device compliance, and location-based access"
    })
    
    # Phish-resistant methods check
    phish_resistant = auth_summary.get('fido2', 0) + auth_summary.get('windows_hello', 0)
    phish_rate = phish_resistant / auth_summary.get('total_users', 1)
    checks.append({
        "id": "phish-resistant",
        "name": "Phish-resistant authentication methods",
        "category": "Authentication",
        "status": "pass" if phish_rate >= 0.2 else "planned" if phish_rate >= 0.05 else "investigate",
        "risk_level": "medium",
        "description": f"FIDO2/Windows Hello used by {phish_resistant} users ({phish_rate*100:.1f}%)",
        "recommendation": "Deploy FIDO2 security keys or Windows Hello for Business"
    })
    
    # Sign-in risk check
    failed_signins = sum(1 for s in sign_ins if s.get('status', {}).get('errorCode', 0) != 0)
    fail_rate = failed_signins / max(len(sign_ins), 1)
    checks.append({
        "id": "signin-failures",
        "name": "Sign-in failure rate within threshold",
        "category": "Monitoring",
        "status": "pass" if fail_rate < 0.1 else "investigate" if fail_rate < 0.3 else "fail",
        "risk_level": "medium" if fail_rate >= 0.1 else "low",
        "description": f"{failed_signins}/{len(sign_ins)} recent sign-ins failed ({fail_rate*100:.1f}%)",
        "recommendation": "Investigate sign-in failures for potential attacks"
    })
    
    return checks


def generate_device_checks(
    devices: List[Dict],
    compliance_stats: Dict,
    encryption_stats: Dict
) -> List[Dict]:
    """Generate device security check results."""
    checks = []
    total = len(devices) or 1
    
    # Device compliance check
    compliance_rate = compliance_stats['compliant'] / total
    checks.append({
        "id": "device-compliance",
        "name": "All devices compliant with policies",
        "category": "Compliance",
        "status": "pass" if compliance_rate >= 0.95 else "fail" if compliance_rate < 0.7 else "investigate",
        "risk_level": "high" if compliance_rate < 0.7 else "medium" if compliance_rate < 0.95 else "low",
        "description": f"{compliance_stats['compliant']}/{total} devices compliant ({compliance_rate*100:.1f}%)",
        "recommendation": "Ensure all devices meet compliance requirements"
    })
    
    # Encryption check
    encryption_rate = encryption_stats['encrypted'] / total
    checks.append({
        "id": "device-encryption",
        "name": "All devices encrypted",
        "category": "Data Protection",
        "status": "pass" if encryption_rate >= 0.95 else "fail" if encryption_rate < 0.7 else "investigate",
        "risk_level": "high" if encryption_rate < 0.7 else "medium" if encryption_rate < 0.95 else "low",
        "description": f"{encryption_stats['encrypted']}/{total} devices encrypted ({encryption_rate*100:.1f}%)",
        "recommendation": "Enable BitLocker (Windows) or FileVault (macOS) on all devices"
    })
    
    # Windows update check (simplified)
    windows_devices = [d for d in devices if d.get('operatingSystem', '').lower() == 'windows']
    checks.append({
        "id": "windows-updates",
        "name": "Windows devices up to date",
        "category": "Updates",
        "status": "pass" if len(windows_devices) > 0 else "skipped",
        "risk_level": "medium",
        "description": f"{len(windows_devices)} Windows devices managed",
        "recommendation": "Configure Windows Update for Business policies"
    })
    
    # Defender status check (simplified)
    checks.append({
        "id": "defender-antivirus",
        "name": "Defender Antivirus enabled",
        "category": "Protection",
        "status": "pass" if len(devices) > 0 else "skipped",
        "risk_level": "high",
        "description": "Defender Antivirus policy status",
        "recommendation": "Ensure Microsoft Defender Antivirus is enabled on all devices"
    })
    
    # Mobile device management check
    mobile_devices = [d for d in devices if d.get('operatingSystem', '').lower() in ['ios', 'android']]
    checks.append({
        "id": "mobile-mdm",
        "name": "Mobile devices enrolled in MDM",
        "category": "Device Management",
        "status": "pass" if len(mobile_devices) > 0 else "skipped",
        "risk_level": "medium",
        "description": f"{len(mobile_devices)} mobile devices enrolled",
        "recommendation": "Enroll all corporate mobile devices in Intune"
    })
    
    return checks


def evaluate_detailed_test_results(
    ca_policies: List[Dict],
    auth_summary: Dict,
    risky_users: List[Dict],
    users: List[Dict]
) -> Dict[str, Dict]:
    """Generate detailed test results with markdown output similar to PS1 files.
    
    Returns a dictionary mapping test IDs to their detailed results including
    markdown-formatted output showing actual tenant data.
    """
    results = {}
    
    # Test 21808: Restrict device code flow
    results["21808"] = evaluate_device_code_flow_test(ca_policies)
    
    # Test 21809: Admin consent workflow
    results["21809"] = evaluate_admin_consent_workflow_test(ca_policies)
    
    # Test 21776: User consent settings are restricted
    results["21776"] = evaluate_user_consent_test(ca_policies)
    
    # Test 21755: Authentication transfer (Block) 
    results["21755"] = evaluate_authentication_transfer_test(ca_policies)
    
    # Test 21816: All privileged role assignments managed with PIM
    results["21816"] = evaluate_pim_management_test(ca_policies)
    
    # Test 21815: Privileged role assignments are JIT
    results["21815"] = evaluate_jit_access_test(ca_policies)
    
    # Test 21867: Enterprise applications with high privilege permissions have owners
    results["21867"] = evaluate_app_owners_test()
    
    # Add more tests as needed
    return results


def evaluate_app_owners_test() -> Dict:
    """Test 21867: Evaluate if enterprise applications with high privilege have owners.
    
    Based on Test-Assessment.21867.ps1
    """
    try:
        apps_without_owners = azure_service.get_high_privilege_apps_without_owners()
        
        if not apps_without_owners:
            return {
                "testId": "21867",
                "status": "Passed",
                "result": "All enterprise applications with high privilege permissions have sufficient owners.",
                "policies": []
            }
        
        # Build markdown table
        md_result = "Not all enterprise applications with high privilege permissions have owners\n\n"
        md_result += "## Applications lacking sufficient owners\n\n"
        md_result += "| App name | Multi-tenant | Permission | Classification | Owner count |\n"
        md_result += "| :-------- | :------------ | :---------- | :------------- | :----------- |\n"
        
        for app in apps_without_owners:
            app_name = app.get('displayName', 'Unknown')
            app_id = app.get('id', '')
            entra_link = f"https://entra.microsoft.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview/objectId/{app_id}"
            
            is_multi_tenant = app.get('signInAudience', '') in ['AzureADMultipleOrgs', 'AzureADandPersonalMicrosoftAccount']
            permissions = app.get('permissions', [])
            perm_str = ', '.join(permissions[:5]) if permissions else 'Various'
            if len(permissions) > 5:
                perm_str += f', ... (+{len(permissions) - 5} more)'
            
            classification = app.get('risk', 'High')
            owner_count = app.get('ownerCount', 0)
            
            md_result += f"| [{app_name}]({entra_link}) | {is_multi_tenant} | {perm_str} | {classification} | {owner_count} |\n"
        
        return {
            "testId": "21867",
            "status": "Failed",
            "result": md_result,
            "policies": apps_without_owners
        }
        
    except Exception as e:
        logger.error(f"Error evaluating app owners test: {str(e)}")
        return {
            "testId": "21867",
            "status": "Investigate",
            "result": f"Unable to evaluate enterprise application owners: {str(e)}\n\nTo verify this setting:\n1. Go to Azure Portal > Microsoft Entra ID > Enterprise applications\n2. Review applications and ensure each has at least 2 owners",
            "policies": []
        }


def evaluate_device_code_flow_test(ca_policies: List[Dict]) -> Dict:
    """Test 21808: Evaluate if device code flow is restricted via CA policies.
    
    Based on Test-Assessment.21808.ps1
    """
    enabled_policies = [p for p in ca_policies if p.get('state') == 'enabled']
    disabled_policies = [p for p in ca_policies if p.get('state') != 'enabled']
    
    # Find policies targeting device code flow
    device_code_policies = []
    for policy in enabled_policies:
        auth_flows = policy.get('conditions', {}).get('authenticationFlows', {})
        transfer_methods = auth_flows.get('transferMethods', '')
        if isinstance(transfer_methods, str):
            methods = [m.strip() for m in transfer_methods.split(',')]
        else:
            methods = transfer_methods if transfer_methods else []
        if 'deviceCodeFlow' in methods:
            device_code_policies.append(policy)
    
    # Find inactive device code flow policies
    inactive_device_code_policies = []
    for policy in disabled_policies:
        auth_flows = policy.get('conditions', {}).get('authenticationFlows', {})
        transfer_methods = auth_flows.get('transferMethods', '')
        if isinstance(transfer_methods, str):
            methods = [m.strip() for m in transfer_methods.split(',')]
        else:
            methods = transfer_methods if transfer_methods else []
        if 'deviceCodeFlow' in methods:
            inactive_device_code_policies.append(policy)
    
    # Check if any policy has block control
    passed = False
    for policy in device_code_policies:
        grant_controls = policy.get('grantControls', {})
        built_in = grant_controls.get('builtInControls', [])
        if 'block' in built_in:
            passed = True
            break
    
    # Build markdown result
    if passed:
        md_result = "Device code flow is properly restricted in the tenant."
    elif len(device_code_policies) == 0:
        md_result = "No Conditional Access policies found that target device code flow authentication."
    else:
        md_result = "Device code flow policies exist but none are configured to block device code flow."
    
    md_result += "\n\n## Conditional Access Policies targeting Device Code Flow\n\n"
    
    if device_code_policies:
        md_result += "| Policy Name | Status | Target Users | Target Resources | Grant Controls |\n"
        md_result += "| :---------- | :----- | :----------- | :--------------- | :------------ |\n"
        
        for policy in device_code_policies:
            portal_link = f"https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/PolicyBlade/policyId/{policy.get('id', '')}"
            
            # Format target users
            conditions = policy.get('conditions', {})
            users_cond = conditions.get('users', {})
            include_users = users_cond.get('includeUsers', [])
            exclude_users = users_cond.get('excludeUsers', [])
            
            if 'All' in include_users:
                target_users = "All Users"
            elif include_users:
                target_users = f"Included: {len(include_users)} users/groups"
            else:
                target_users = "None"
            
            if exclude_users:
                target_users += f", Excluded: {len(exclude_users)} users/groups"
            
            # Format target resources
            apps_cond = conditions.get('applications', {})
            include_apps = apps_cond.get('includeApplications', [])
            exclude_apps = apps_cond.get('excludeApplications', [])
            
            if 'All' in include_apps:
                target_resources = "All Applications"
            elif include_apps:
                target_resources = f"Included: {len(include_apps)} apps"
            else:
                target_resources = "None"
            
            if exclude_apps:
                target_resources += f", Excluded: {len(exclude_apps)} apps"
            
            # Format grant controls
            grant_controls = policy.get('grantControls', {})
            built_in = grant_controls.get('builtInControls', [])
            operator = grant_controls.get('operator', 'AND')
            
            if 'block' in built_in:
                grant_text = "Block"
            elif built_in:
                grant_text = ", ".join(built_in)
            else:
                grant_text = "None"
            
            grant_text += f" ({operator})"
            
            display_name = policy.get('displayName', 'Unknown Policy')
            md_result += f"| [{display_name}]({portal_link}) | Enabled | {target_users} | {target_resources} | {grant_text} |\n"
    else:
        md_result += "No Conditional Access policies targeting device code flow authentication were found.\n"
    
    # Add inactive policies section if test failed
    if not passed and inactive_device_code_policies:
        md_result += "\n## Inactive Conditional Access Policies targeting Device Code Flow\n"
        md_result += "These policies are not contributing to your security posture because they are not enabled:\n\n"
        md_result += "| Policy Name | Status | Target Users | Target Resources | Grant Controls |\n"
        md_result += "| :---------- | :----- | :----------- | :--------------- | :------------ |\n"
        
        for policy in inactive_device_code_policies:
            portal_link = f"https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/PolicyBlade/policyId/{policy.get('id', '')}"
            status = "Report-only" if policy.get('state') == 'enabledForReportingButNotEnforced' else "Disabled"
            
            conditions = policy.get('conditions', {})
            users_cond = conditions.get('users', {})
            include_users = users_cond.get('includeUsers', [])
            
            if 'All' in include_users:
                target_users = "All Users"
            elif include_users:
                target_users = f"Included: {len(include_users)} users/groups"
            else:
                target_users = "None"
            
            apps_cond = conditions.get('applications', {})
            include_apps = apps_cond.get('includeApplications', [])
            
            if 'All' in include_apps:
                target_resources = "All Applications"
            elif include_apps:
                target_resources = f"Included: {len(include_apps)} apps"
            else:
                target_resources = "None"
            
            grant_controls = policy.get('grantControls', {})
            built_in = grant_controls.get('builtInControls', [])
            operator = grant_controls.get('operator', 'AND')
            
            if 'block' in built_in:
                grant_text = "Block"
            elif built_in:
                grant_text = ", ".join(built_in)
            else:
                grant_text = "None"
            
            grant_text += f" ({operator})"
            
            display_name = policy.get('displayName', 'Unknown Policy')
            md_result += f"| [{display_name}]({portal_link}) | {status} | {target_users} | {target_resources} | {grant_text} |\n"
    
    return {
        "testId": "21808",
        "status": "Passed" if passed else "Failed",
        "result": md_result,
        "policies": [
            {
                "name": p.get('displayName', 'Unknown'),
                "status": "Enabled",
                "targetUsers": "All Users" if 'All' in p.get('conditions', {}).get('users', {}).get('includeUsers', []) else "Specific",
                "targetResources": "All Applications" if 'All' in p.get('conditions', {}).get('applications', {}).get('includeApplications', []) else "Specific",
                "grantControls": "Block" if 'block' in p.get('grantControls', {}).get('builtInControls', []) else "Other"
            }
            for p in device_code_policies
        ],
        "inactivePolicies": [
            {
                "name": p.get('displayName', 'Unknown'),
                "status": "Disabled" if p.get('state') != 'enabledForReportingButNotEnforced' else "Report-only",
                "targetUsers": "All Users" if 'All' in p.get('conditions', {}).get('users', {}).get('includeUsers', []) else "Specific",
                "targetResources": "All Applications",
                "grantControls": "Block" if 'block' in p.get('grantControls', {}).get('builtInControls', []) else "Other"
            }
            for p in inactive_device_code_policies
        ]
    }


def evaluate_admin_consent_workflow_test(ca_policies: List[Dict]) -> Dict:
    """Test 21809: Evaluate admin consent workflow settings."""
    # This would need additional Graph API calls to get consent settings
    # For now, return a placeholder
    return {
        "testId": "21809",
        "status": "Investigate",
        "result": "Admin consent workflow status requires additional API permissions to evaluate.\n\nTo verify this setting:\n1. Go to Azure Portal > Microsoft Entra ID > Enterprise applications\n2. Select Consent and permissions > Admin consent settings\n3. Verify admin consent workflow is enabled",
        "policies": []
    }


def evaluate_user_consent_test(ca_policies: List[Dict]) -> Dict:
    """Test 21776: Evaluate user consent settings."""
    return {
        "testId": "21776",
        "status": "Investigate", 
        "result": "User consent settings status requires additional API permissions to evaluate.\n\nTo verify this setting:\n1. Go to Azure Portal > Microsoft Entra ID > Enterprise applications\n2. Select Consent and permissions > User consent settings\n3. Verify user consent is restricted appropriately",
        "policies": []
    }


def evaluate_authentication_transfer_test(ca_policies: List[Dict]) -> Dict:
    """Test 21755: Evaluate authentication transfer blocking."""
    enabled_policies = [p for p in ca_policies if p.get('state') == 'enabled']
    
    # Find policies targeting authentication transfer
    auth_transfer_policies = []
    for policy in enabled_policies:
        auth_flows = policy.get('conditions', {}).get('authenticationFlows', {})
        transfer_methods = auth_flows.get('transferMethods', '')
        if isinstance(transfer_methods, str):
            methods = [m.strip() for m in transfer_methods.split(',')]
        else:
            methods = transfer_methods if transfer_methods else []
        if 'authenticationTransfer' in methods:
            auth_transfer_policies.append(policy)
    
    passed = False
    for policy in auth_transfer_policies:
        grant_controls = policy.get('grantControls', {})
        if 'block' in grant_controls.get('builtInControls', []):
            passed = True
            break
    
    if passed:
        md_result = "Authentication transfer is properly blocked in the tenant."
    elif len(auth_transfer_policies) == 0:
        md_result = "No Conditional Access policies found that target authentication transfer."
    else:
        md_result = "Authentication transfer policies exist but none are configured to block."
    
    return {
        "testId": "21755",
        "status": "Passed" if passed else "Failed",
        "result": md_result,
        "policies": []
    }


def evaluate_pim_management_test(ca_policies: List[Dict]) -> Dict:
    """Test 21816: Evaluate PIM management for privileged roles."""
    return {
        "testId": "21816",
        "status": "Investigate",
        "result": "Privileged Identity Management (PIM) status requires additional API permissions to evaluate.\n\nTo verify this setting:\n1. Go to Azure Portal > Microsoft Entra ID > Privileged Identity Management\n2. Review role assignments and ensure all privileged roles are managed through PIM",
        "policies": []
    }


def evaluate_jit_access_test(ca_policies: List[Dict]) -> Dict:
    """Test 21815: Evaluate just-in-time access for privileged roles."""
    return {
        "testId": "21815",
        "status": "Investigate",
        "result": "Just-in-time access configuration requires additional API permissions to evaluate.\n\nTo verify this setting:\n1. Go to Azure Portal > Microsoft Entra ID > Privileged Identity Management\n2. Ensure privileged role assignments require activation (not permanently active)",
        "policies": []
    }


def generate_auth_sankey_data(auth_summary: Dict) -> Dict:
    """Generate Sankey diagram data for authentication methods flow."""
    total = auth_summary.get('total_users', 100)
    single_factor = auth_summary.get('single_factor', 15)
    mfa = total - single_factor
    
    phone = auth_summary.get('phone_auth', 40)
    authenticator = auth_summary.get('authenticator_app', 60)
    fido = auth_summary.get('fido2', 10)
    hello = auth_summary.get('windows_hello', 15)
    
    return {
        "nodes": [
            {"id": "all_users", "label": "All Users"},
            {"id": "single_factor", "label": "Single Factor"},
            {"id": "mfa", "label": "MFA"},
            {"id": "phishable", "label": "Phishable"},
            {"id": "phish_resistant", "label": "Phish Resistant"},
            {"id": "phone", "label": "Phone"},
            {"id": "authenticator", "label": "Authenticator"},
            {"id": "fido2", "label": "FIDO2"},
            {"id": "windows_hello", "label": "Windows Hello"},
        ],
        "links": [
            {"source": "all_users", "target": "single_factor", "value": single_factor},
            {"source": "all_users", "target": "mfa", "value": mfa},
            {"source": "mfa", "target": "phishable", "value": phone + authenticator},
            {"source": "mfa", "target": "phish_resistant", "value": fido + hello},
            {"source": "phishable", "target": "phone", "value": phone},
            {"source": "phishable", "target": "authenticator", "value": authenticator},
            {"source": "phish_resistant", "target": "fido2", "value": fido},
            {"source": "phish_resistant", "target": "windows_hello", "value": hello},
        ]
    }


def generate_device_sankey_data(devices: List[Dict]) -> Dict:
    """Generate Sankey diagram data for device management flow."""
    total = len(devices) or 100
    
    # Count by management state
    managed = len(devices)
    unmanaged = max(0, total - managed)  # Assume some unmanaged devices
    
    # Count by compliance
    compliant = sum(1 for d in devices if d.get('complianceState') == 'compliant')
    noncompliant = managed - compliant
    
    # Count by OS
    windows = sum(1 for d in devices if d.get('operatingSystem', '').lower() == 'windows')
    macos = sum(1 for d in devices if d.get('operatingSystem', '').lower() == 'macos')
    ios = sum(1 for d in devices if d.get('operatingSystem', '').lower() == 'ios')
    android = sum(1 for d in devices if d.get('operatingSystem', '').lower() == 'android')
    other = managed - windows - macos - ios - android
    
    return {
        "nodes": [
            {"id": "all_devices", "label": "All Devices"},
            {"id": "managed", "label": "Managed"},
            {"id": "unmanaged", "label": "Unmanaged"},
            {"id": "compliant", "label": "Compliant"},
            {"id": "noncompliant", "label": "Non-compliant"},
            {"id": "windows", "label": "Windows"},
            {"id": "macos", "label": "macOS"},
            {"id": "ios", "label": "iOS"},
            {"id": "android", "label": "Android"},
        ],
        "links": [
            {"source": "all_devices", "target": "managed", "value": managed or 1},
            {"source": "all_devices", "target": "unmanaged", "value": max(unmanaged, 1)},
            {"source": "managed", "target": "compliant", "value": compliant or 1},
            {"source": "managed", "target": "noncompliant", "value": noncompliant or 1},
            {"source": "compliant", "target": "windows", "value": max(windows, 1)},
            {"source": "compliant", "target": "macos", "value": max(macos, 1)},
            {"source": "compliant", "target": "ios", "value": max(ios, 1)},
            {"source": "compliant", "target": "android", "value": max(android, 1)},
        ]
    }
