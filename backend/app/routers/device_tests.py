"""Device security tests router.

This module provides endpoints to run Zero Trust device security tests
against Microsoft Graph API / Intune data.
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


def test_device_compliance_policies(client: GraphClient) -> Dict:
    """Test DEV-001: Check if device compliance policies are configured."""
    try:
        policies = client.get_device_compliance_policies()
        
        # Check for different platform policies
        windows_policies = [p for p in policies if "windows" in p.get("@odata.type", "").lower()]
        ios_policies = [p for p in policies if "ios" in p.get("@odata.type", "").lower()]
        android_policies = [p for p in policies if "android" in p.get("@odata.type", "").lower()]
        macos_policies = [p for p in policies if "macos" in p.get("@odata.type", "").lower()]
        
        has_policies = len(policies) > 0
        status = "pass" if has_policies else "fail"
        
        return create_test_result(
            test_id="DEV-001",
            name="Device Compliance Policies",
            description="Check if device compliance policies are configured",
            status=status,
            details=f"Found {len(policies)} compliance policies: "
                    f"{len(windows_policies)} Windows, {len(ios_policies)} iOS, "
                    f"{len(android_policies)} Android, {len(macos_policies)} macOS.",
            data={
                "totalPolicies": len(policies),
                "windowsPolicies": len(windows_policies),
                "iosPolicies": len(ios_policies),
                "androidPolicies": len(android_policies),
                "macosPolicies": len(macos_policies),
                "policies": [{"displayName": p.get("displayName"), "type": p.get("@odata.type")}
                            for p in policies[:20]],
            },
            recommendation="Create compliance policies for all managed device platforms." if not has_policies else "",
        )
    except Exception as e:
        logger.error(f"Error testing compliance policies: {e}")
        return create_test_result(
            test_id="DEV-001",
            name="Device Compliance Policies",
            description="Check if device compliance policies are configured",
            status="error",
            details=f"Failed to retrieve compliance policies: {str(e)}. Ensure DeviceManagementConfiguration.Read.All permission is granted.",
        )


def test_device_compliance_status(client: GraphClient) -> Dict:
    """Test DEV-002: Check overall device compliance status."""
    try:
        devices = client.get_managed_devices()
        
        compliant = [d for d in devices if d.get("complianceState") == "compliant"]
        noncompliant = [d for d in devices if d.get("complianceState") == "noncompliant"]
        unknown = [d for d in devices if d.get("complianceState") not in ["compliant", "noncompliant"]]
        
        total = len(devices)
        compliance_rate = (len(compliant) / total * 100) if total > 0 else 0
        
        status = "pass" if compliance_rate >= 95 else "warning" if compliance_rate >= 80 else "fail"
        
        return create_test_result(
            test_id="DEV-002",
            name="Device Compliance Status",
            description="Check percentage of compliant devices",
            status=status,
            details=f"Device compliance: {len(compliant)}/{total} devices ({compliance_rate:.1f}% compliant). "
                    f"{len(noncompliant)} non-compliant, {len(unknown)} unknown status.",
            data={
                "totalDevices": total,
                "compliantDevices": len(compliant),
                "noncompliantDevices": len(noncompliant),
                "unknownDevices": len(unknown),
                "complianceRate": round(compliance_rate, 1),
                "noncompliantList": [{"deviceName": d.get("deviceName"), "userDisplayName": d.get("userDisplayName"),
                                      "osVersion": d.get("osVersion")}
                                    for d in noncompliant[:10]],
            },
            recommendation="Investigate and remediate non-compliant devices." if status != "pass" else "",
        )
    except Exception as e:
        logger.error(f"Error testing device compliance: {e}")
        return create_test_result(
            test_id="DEV-002",
            name="Device Compliance Status",
            description="Check percentage of compliant devices",
            status="error",
            details=f"Failed to retrieve managed devices: {str(e)}. Ensure DeviceManagementManagedDevices.Read.All permission is granted.",
        )


def test_device_encryption(client: GraphClient) -> Dict:
    """Test DEV-003: Check device encryption (BitLocker/FileVault) status."""
    try:
        devices = client.get_managed_devices()
        
        windows_devices = [d for d in devices if "windows" in d.get("operatingSystem", "").lower()]
        mac_devices = [d for d in devices if "macos" in d.get("operatingSystem", "").lower()]
        
        # Check encryption status
        encrypted_windows = [d for d in windows_devices if d.get("isEncrypted", False)]
        encrypted_mac = [d for d in mac_devices if d.get("isEncrypted", False)]
        
        total_desktop = len(windows_devices) + len(mac_devices)
        encrypted = len(encrypted_windows) + len(encrypted_mac)
        encryption_rate = (encrypted / total_desktop * 100) if total_desktop > 0 else 100
        
        status = "pass" if encryption_rate >= 95 else "warning" if encryption_rate >= 80 else "fail"
        
        return create_test_result(
            test_id="DEV-003",
            name="Device Encryption",
            description="Check BitLocker/FileVault encryption status",
            status=status if total_desktop > 0 else "not_applicable",
            details=f"Encryption: {encrypted}/{total_desktop} desktop devices ({encryption_rate:.1f}% encrypted). "
                    f"Windows: {len(encrypted_windows)}/{len(windows_devices)}, "
                    f"macOS: {len(encrypted_mac)}/{len(mac_devices)}.",
            data={
                "totalDesktopDevices": total_desktop,
                "encryptedDevices": encrypted,
                "encryptionRate": round(encryption_rate, 1),
                "windowsEncrypted": len(encrypted_windows),
                "windowsTotal": len(windows_devices),
                "macEncrypted": len(encrypted_mac),
                "macTotal": len(mac_devices),
            },
            recommendation="Enable BitLocker/FileVault on all desktop devices." if status != "pass" else "",
        )
    except Exception as e:
        logger.error(f"Error testing device encryption: {e}")
        return create_test_result(
            test_id="DEV-003",
            name="Device Encryption",
            description="Check BitLocker/FileVault encryption status",
            status="error",
            details=f"Failed to check encryption status: {str(e)}",
        )


def test_device_configurations(client: GraphClient) -> Dict:
    """Test DEV-004: Check if device configuration profiles are deployed."""
    try:
        configs = client.get_device_configurations()
        
        # Categorize configurations
        security_configs = [c for c in configs if any(
            keyword in c.get("displayName", "").lower() or keyword in c.get("@odata.type", "").lower()
            for keyword in ["security", "defender", "firewall", "bitlocker", "encryption", "password"]
        )]
        
        wifi_configs = [c for c in configs if "wifi" in c.get("@odata.type", "").lower()]
        vpn_configs = [c for c in configs if "vpn" in c.get("@odata.type", "").lower()]
        
        has_security = len(security_configs) > 0
        status = "pass" if has_security else "warning" if len(configs) > 0 else "fail"
        
        return create_test_result(
            test_id="DEV-004",
            name="Device Configuration Profiles",
            description="Check if security configuration profiles are deployed",
            status=status,
            details=f"Found {len(configs)} configuration profiles: "
                    f"{len(security_configs)} security-related, "
                    f"{len(wifi_configs)} Wi-Fi, {len(vpn_configs)} VPN.",
            data={
                "totalConfigs": len(configs),
                "securityConfigs": len(security_configs),
                "wifiConfigs": len(wifi_configs),
                "vpnConfigs": len(vpn_configs),
                "configs": [{"displayName": c.get("displayName"), "type": c.get("@odata.type")}
                           for c in configs[:20]],
            },
            recommendation="Deploy security configuration profiles (Defender, Firewall, BitLocker)." if not has_security else "",
        )
    except Exception as e:
        logger.error(f"Error testing device configs: {e}")
        return create_test_result(
            test_id="DEV-004",
            name="Device Configuration Profiles",
            description="Check if configuration profiles are deployed",
            status="error",
            details=f"Failed to retrieve device configurations: {str(e)}",
        )


def test_stale_devices(client: GraphClient) -> Dict:
    """Test DEV-005: Check for stale/inactive devices."""
    try:
        devices = client.get_managed_devices()
        
        # Check for devices not synced in 30+ days
        stale_threshold = datetime.utcnow() - timedelta(days=30)
        
        stale_devices = []
        for device in devices:
            last_sync = device.get("lastSyncDateTime")
            if last_sync:
                try:
                    sync_date = datetime.fromisoformat(last_sync.replace("Z", "+00:00"))
                    if sync_date.replace(tzinfo=None) < stale_threshold:
                        stale_devices.append(device)
                except Exception:
                    pass
        
        stale_rate = (len(stale_devices) / len(devices) * 100) if devices else 0
        status = "pass" if stale_rate < 5 else "warning" if stale_rate < 15 else "fail"
        
        return create_test_result(
            test_id="DEV-005",
            name="Stale Devices",
            description="Check for devices not synced in 30+ days",
            status=status,
            details=f"Found {len(stale_devices)}/{len(devices)} devices ({stale_rate:.1f}%) not synced in 30+ days.",
            data={
                "totalDevices": len(devices),
                "staleDevices": len(stale_devices),
                "staleRate": round(stale_rate, 1),
                "staleList": [{"deviceName": d.get("deviceName"), "lastSyncDateTime": d.get("lastSyncDateTime")}
                             for d in stale_devices[:10]],
            },
            recommendation="Review and remove stale devices from management." if status != "pass" else "",
        )
    except Exception as e:
        logger.error(f"Error testing stale devices: {e}")
        return create_test_result(
            test_id="DEV-005",
            name="Stale Devices",
            description="Check for devices not synced in 30+ days",
            status="error",
            details=f"Failed to check stale devices: {str(e)}",
        )


def test_os_versions(client: GraphClient) -> Dict:
    """Test DEV-006: Check for outdated operating system versions."""
    try:
        devices = client.get_managed_devices()
        
        # Define minimum supported versions (example thresholds)
        outdated_devices = []
        
        for device in devices:
            os_name = device.get("operatingSystem", "").lower()
            os_version = device.get("osVersion", "")
            
            is_outdated = False
            
            if "windows" in os_name:
                # Check for Windows versions older than Windows 10
                if os_version and not os_version.startswith(("10.", "11.")):
                    is_outdated = True
            elif "ios" in os_name:
                # Check for iOS versions older than 15
                try:
                    major = int(os_version.split(".")[0])
                    if major < 15:
                        is_outdated = True
                except Exception:
                    pass
            elif "android" in os_name:
                # Check for Android versions older than 11
                try:
                    major = int(os_version.split(".")[0])
                    if major < 11:
                        is_outdated = True
                except Exception:
                    pass
            
            if is_outdated:
                outdated_devices.append(device)
        
        outdated_rate = (len(outdated_devices) / len(devices) * 100) if devices else 0
        status = "pass" if outdated_rate < 5 else "warning" if outdated_rate < 20 else "fail"
        
        return create_test_result(
            test_id="DEV-006",
            name="OS Version Check",
            description="Check for outdated operating system versions",
            status=status,
            details=f"Found {len(outdated_devices)}/{len(devices)} devices ({outdated_rate:.1f}%) with outdated OS.",
            data={
                "totalDevices": len(devices),
                "outdatedDevices": len(outdated_devices),
                "outdatedRate": round(outdated_rate, 1),
                "outdatedList": [{"deviceName": d.get("deviceName"), "os": d.get("operatingSystem"),
                                 "osVersion": d.get("osVersion")}
                                for d in outdated_devices[:10]],
            },
            recommendation="Update devices to supported OS versions." if status != "pass" else "",
        )
    except Exception as e:
        logger.error(f"Error testing OS versions: {e}")
        return create_test_result(
            test_id="DEV-006",
            name="OS Version Check",
            description="Check for outdated operating system versions",
            status="error",
            details=f"Failed to check OS versions: {str(e)}",
        )


def test_enrollment_restrictions(client: GraphClient) -> Dict:
    """Test DEV-007: Check device enrollment configurations."""
    try:
        configs = client.get_device_enrollment_configurations()
        
        # Check for platform restrictions
        platform_restrictions = [c for c in configs 
                                if "platformRestrictions" in c.get("@odata.type", "").lower()]
        limit_configs = [c for c in configs 
                        if "limit" in c.get("@odata.type", "").lower()]
        
        has_restrictions = len(platform_restrictions) > 0 or len(limit_configs) > 0
        status = "pass" if has_restrictions else "warning"
        
        return create_test_result(
            test_id="DEV-007",
            name="Device Enrollment Restrictions",
            description="Check if enrollment restrictions are configured",
            status=status,
            details=f"Found {len(configs)} enrollment configurations: "
                    f"{len(platform_restrictions)} platform restrictions, "
                    f"{len(limit_configs)} device limit policies.",
            data={
                "totalConfigs": len(configs),
                "platformRestrictions": len(platform_restrictions),
                "limitConfigs": len(limit_configs),
                "configs": [{"displayName": c.get("displayName"), "type": c.get("@odata.type")}
                           for c in configs[:10]],
            },
            recommendation="Configure enrollment restrictions to control which devices can enroll." if not has_restrictions else "",
        )
    except Exception as e:
        logger.error(f"Error testing enrollment restrictions: {e}")
        return create_test_result(
            test_id="DEV-007",
            name="Device Enrollment Restrictions",
            description="Check device enrollment restrictions",
            status="error",
            details=f"Failed to retrieve enrollment configurations: {str(e)}",
        )


def test_app_protection_policies(client: GraphClient) -> Dict:
    """Test DEV-008: Check mobile app protection (MAM) policies."""
    try:
        policies = client.get_mobile_app_management_policies()
        
        ios_policies = [p for p in policies if "ios" in p.get("@odata.type", "").lower()]
        android_policies = [p for p in policies if "android" in p.get("@odata.type", "").lower()]
        
        has_policies = len(policies) > 0
        status = "pass" if has_policies else "warning"
        
        return create_test_result(
            test_id="DEV-008",
            name="App Protection Policies",
            description="Check if mobile app protection (MAM) policies are configured",
            status=status,
            details=f"Found {len(policies)} app protection policies: "
                    f"{len(ios_policies)} iOS, {len(android_policies)} Android.",
            data={
                "totalPolicies": len(policies),
                "iosPolicies": len(ios_policies),
                "androidPolicies": len(android_policies),
                "policies": [{"displayName": p.get("displayName"), "type": p.get("@odata.type")}
                            for p in policies[:10]],
            },
            recommendation="Configure app protection policies for iOS and Android." if not has_policies else "",
        )
    except Exception as e:
        logger.error(f"Error testing app protection: {e}")
        return create_test_result(
            test_id="DEV-008",
            name="App Protection Policies",
            description="Check app protection (MAM) policies",
            status="error",
            details=f"Failed to retrieve app protection policies: {str(e)}. Ensure DeviceManagementApps.Read.All permission is granted.",
        )


@router.get("/device-tests")
async def run_device_tests(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Run all device security tests and return results.
    
    Required Graph API Permissions:
    - DeviceManagementConfiguration.Read.All
    - DeviceManagementManagedDevices.Read.All
    - DeviceManagementApps.Read.All
    """
    client = get_graph_client()
    
    if not client.is_configured:
        raise HTTPException(
            status_code=503,
            detail="Azure credentials not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET."
        )
    
    # Run all tests
    tests = [
        test_device_compliance_policies(client),
        test_device_compliance_status(client),
        test_device_encryption(client),
        test_device_configurations(client),
        test_stale_devices(client),
        test_os_versions(client),
        test_enrollment_restrictions(client),
        test_app_protection_policies(client),
    ]
    
    # Calculate summary
    passed = len([t for t in tests if t["status"] == "pass"])
    failed = len([t for t in tests if t["status"] == "fail"])
    warnings = len([t for t in tests if t["status"] == "warning"])
    errors = len([t for t in tests if t["status"] == "error"])
    
    return {
        "category": "Devices",
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
