"""Device posture baseline check evaluators.

Mirrors the structure of `identity_checks.py`. Each function implements one
device security check inspired by the Microsoft Zero Trust Assessment
project (zerotrustassessment). Results share the same normalised schema
so the frontend can reuse the Identity rendering format.

When Graph/Intune credentials are missing, mock results are returned so
the page is always demo-ready (FYP-friendly).

Scoring: pass = 1.0, warning = 0.5, fail/error/not_available = 0.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ..graph_client import GraphClient

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Static reference metadata for the 5 device baseline checks.
# Modelled after Microsoft Zero Trust Assessment device tests
# (e.g. TestId 24546 "Windows automatic device enrollment is enforced").
# ---------------------------------------------------------------------------

DEVICE_TEST_REFERENCES: Dict[str, Dict[str, Any]] = {
    "D-001": {
        "category": "Device Compliance",
        "pillar": "Devices",
        "risk": "High",
        "user_impact": "Low",
        "implementation_cost": "Low",
        "description": (
            "Compliance policies define minimum security requirements for "
            "managed endpoints (encryption, password, OS version, jailbreak "
            "status, threat level) and drive Conditional Access decisions."
        ),
        "why_it_matters": (
            "Without compliance policies, Intune cannot evaluate devices as "
            "compliant or non-compliant, so Conditional Access cannot enforce "
            "\"require compliant device\" and unhealthy endpoints can reach "
            "corporate data."
        ),
        "what_was_checked": (
            "Queried Intune deviceCompliancePolicies and verified at least one "
            "policy is assigned per supported platform (Windows / macOS / iOS / "
            "Android)."
        ),
        "remediation_action": (
            "Create and assign compliance policies for every managed platform. "
            "Minimum: encryption required, OS version floor, passcode/PIN, "
            "jailbroken/rooted = block."
        ),
        "source_endpoints": ["beta/deviceManagement/deviceCompliancePolicies"],
        "reference_source": "Microsoft Zero Trust Assessment (Devices pillar, inspired by TestId 24546 family)",
    },
    "D-002": {
        "category": "Data Protection",
        "pillar": "Devices",
        "risk": "High",
        "user_impact": "Low",
        "implementation_cost": "Low",
        "description": (
            "Disk encryption (BitLocker on Windows, FileVault on macOS) "
            "protects data at rest when a device is lost or stolen. Intune can "
            "enforce encryption and escrow recovery keys to Entra ID."
        ),
        "why_it_matters": (
            "Unencrypted devices expose corporate data in a pure offline "
            "attack: anyone with physical access can mount the disk and "
            "extract files, tokens, and cached credentials."
        ),
        "what_was_checked": (
            "Inspected Intune managed devices for isEncrypted = true and "
            "confirmed a BitLocker/FileVault configuration policy exists "
            "targeting all managed users."
        ),
        "remediation_action": (
            "Deploy a BitLocker configuration profile (silent enablement, "
            "XTS-AES 256, recovery key to Entra ID) for Windows and a "
            "FileVault policy for macOS."
        ),
        "source_endpoints": ["beta/deviceManagement/managedDevices", "beta/deviceManagement/configurationPolicies"],
        "reference_source": "Microsoft Zero Trust Assessment (Devices pillar, BitLocker/FileVault best practice)",
    },
    "D-003": {
        "category": "Endpoint Security",
        "pillar": "Devices",
        "risk": "High",
        "user_impact": "Low",
        "implementation_cost": "Medium",
        "description": (
            "Microsoft Defender for Endpoint (MDE) provides EDR, attack "
            "surface reduction and threat & vulnerability management. Devices "
            "must be onboarded to MDE to feed device risk into Conditional "
            "Access."
        ),
        "why_it_matters": (
            "Without MDE onboarding, Intune has no device risk signal, so "
            "compromised endpoints cannot be isolated automatically and "
            "ransomware/lateral movement goes undetected."
        ),
        "what_was_checked": (
            "Verified the Intune ↔ Defender for Endpoint connector is enabled "
            "and that the percentage of managed devices reporting to MDE "
            "exceeds 90%."
        ),
        "remediation_action": (
            "Enable the MDE connector in Intune, push the onboarding "
            "configuration profile to all platforms, and require MDE health "
            "in device compliance policies."
        ),
        "source_endpoints": ["beta/deviceManagement/microsoftDefenderForEndpointSettings", "beta/deviceManagement/managedDevices"],
        "reference_source": "Microsoft Zero Trust Assessment (Devices pillar, Defender for Endpoint integration)",
    },
    "D-004": {
        "category": "Patch & Update Management",
        "pillar": "Devices",
        "risk": "Medium",
        "user_impact": "Low",
        "implementation_cost": "Low",
        "description": (
            "Devices must run a supported, patched operating system version. "
            "Out-of-support or unpatched OSes accumulate known CVEs that "
            "attackers exploit for initial access and privilege escalation."
        ),
        "why_it_matters": (
            "Stale OS versions are the single most common root cause of "
            "endpoint compromise. Zero Trust assumes breach — every unpatched "
            "device is effectively a pre-compromised device."
        ),
        "what_was_checked": (
            "Inspected osVersion on all managed devices and compared against "
            "the minimum supported version for each platform (Win10 22H2, "
            "Win11 23H2, macOS 13+, iOS 17+, Android 13+)."
        ),
        "remediation_action": (
            "Configure Windows Update for Business / Autopatch policies, set "
            "minimum OS version in compliance policy, and retire devices that "
            "cannot be upgraded."
        ),
        "source_endpoints": ["beta/deviceManagement/managedDevices"],
        "reference_source": "Microsoft Zero Trust Assessment (Devices pillar, OS version hygiene)",
    },
    "D-005": {
        "category": "Device Lifecycle",
        "pillar": "Devices",
        "risk": "Medium",
        "user_impact": "Low",
        "implementation_cost": "Low",
        "description": (
            "Stale devices (no check-in for 90+ days) are likely lost, "
            "stolen, or decommissioned and should be wiped and retired to "
            "remove cached tokens and long-lived refresh tokens."
        ),
        "why_it_matters": (
            "Inactive devices continue to hold valid primary refresh tokens "
            "(PRTs). An attacker recovering an old laptop can silently obtain "
            "SSO to corporate resources weeks after the user moved on."
        ),
        "what_was_checked": (
            "Counted managed devices whose lastSyncDateTime is older than 90 "
            "days. Also checked for a configured device cleanup rule in "
            "Intune."
        ),
        "remediation_action": (
            "Enable Intune device cleanup rule (auto-retire after 90 days of "
            "inactivity) and/or run a scheduled report to wipe & retire "
            "stale devices manually."
        ),
        "source_endpoints": ["beta/deviceManagement/managedDevices"],
        "reference_source": "Microsoft Zero Trust Assessment (Devices pillar, device lifecycle hygiene)",
    },
}


def _result(
    test_id: str,
    title: str,
    status: str,
    summary: str,
    evidence: List[Dict[str, Any]],
    recommendation: str,
) -> Dict[str, Any]:
    """Build a normalised test result dict with enriched reference data."""
    ref = DEVICE_TEST_REFERENCES.get(test_id, {})
    score = 1.0 if status == "pass" else (0.5 if status == "warning" else 0.0)
    return {
        "id": test_id,
        "title": title,
        "category": ref.get("category", "Devices"),
        "pillar": "Devices",
        "severity": ref.get("risk", "medium").lower(),
        "status": status,
        "score": score,
        "summary": summary,
        "evidence": evidence,
        "recommendation": recommendation,
        "source": ref.get("source_endpoints", []),
        "last_checked": _now_iso(),
        "reference": ref,
    }


# ---------------------------------------------------------------------------
# Check implementations.  These are defensive: if a Graph endpoint is not
# available in the current GraphClient they simply return "not_available".
# In practice the demo uses mock results (see get_mock_results below).
# ---------------------------------------------------------------------------

def _safe_call(client: GraphClient, method: str, *args, **kwargs):
    fn = getattr(client, method, None)
    if fn is None:
        return None
    try:
        return fn(*args, **kwargs)
    except Exception as exc:  # pragma: no cover - network/permission errors
        logger.warning("device_checks: %s failed: %s", method, exc)
        return None


def check_d001(client: GraphClient) -> Dict[str, Any]:
    """At least one Intune compliance policy is assigned per platform."""
    title = "Device compliance policies are assigned for every managed platform"
    policies = _safe_call(client, "get_compliance_policies")
    if policies is None:
        return _result(
            "D-001", title, "not_available",
            "Intune compliance policies could not be read (insufficient permissions or endpoint unavailable).",
            [], DEVICE_TEST_REFERENCES["D-001"]["remediation_action"],
        )
    platforms = {"windows", "macos", "ios", "android"}
    covered = {p.get("platformType", "").lower() for p in policies}
    missing = platforms - covered
    if not missing:
        return _result(
            "D-001", title, "pass",
            f"All {len(platforms)} managed platforms have at least one compliance policy.",
            [{"name": p.get("displayName", "policy"), "type": "CompliancePolicy",
              "appId": p.get("id", ""), "detail": p.get("platformType", "")} for p in policies[:5]],
            DEVICE_TEST_REFERENCES["D-001"]["remediation_action"],
        )
    return _result(
        "D-001", title, "fail",
        f"Missing compliance policies for: {', '.join(sorted(missing))}.",
        [{"name": "missing", "type": "Platform", "appId": "", "detail": p} for p in sorted(missing)],
        DEVICE_TEST_REFERENCES["D-001"]["remediation_action"],
    )


def check_d002(client: GraphClient) -> Dict[str, Any]:
    """Disk encryption (BitLocker/FileVault) enforced on managed devices."""
    title = "Disk encryption is enforced on all managed devices"
    devices = _safe_call(client, "get_managed_devices")
    if devices is None:
        return _result(
            "D-002", title, "not_available",
            "Managed devices could not be read.",
            [], DEVICE_TEST_REFERENCES["D-002"]["remediation_action"],
        )
    total = len(devices)
    unencrypted = [d for d in devices if not d.get("isEncrypted", False)]
    if total == 0:
        return _result("D-002", title, "not_available",
                       "No managed devices found in tenant.", [], DEVICE_TEST_REFERENCES["D-002"]["remediation_action"])
    if not unencrypted:
        return _result("D-002", title, "pass",
                       f"All {total} managed devices report disk encryption enabled.", [], DEVICE_TEST_REFERENCES["D-002"]["remediation_action"])
    status = "warning" if len(unencrypted) / total < 0.1 else "fail"
    return _result(
        "D-002", title, status,
        f"{len(unencrypted)}/{total} managed devices are not encrypted.",
        [{"name": d.get("deviceName", "?"), "type": d.get("operatingSystem", "Device"),
          "appId": d.get("id", ""), "detail": "Not encrypted"} for d in unencrypted[:5]],
        DEVICE_TEST_REFERENCES["D-002"]["remediation_action"],
    )


def check_d003(client: GraphClient) -> Dict[str, Any]:
    """Defender for Endpoint onboarding coverage > 90%."""
    title = "Devices are onboarded to Microsoft Defender for Endpoint"
    devices = _safe_call(client, "get_managed_devices")
    if devices is None:
        return _result(
            "D-003", title, "not_available",
            "Managed devices could not be read.",
            [], DEVICE_TEST_REFERENCES["D-003"]["remediation_action"],
        )
    total = len(devices)
    if total == 0:
        return _result("D-003", title, "not_available",
                       "No managed devices found.", [], DEVICE_TEST_REFERENCES["D-003"]["remediation_action"])
    onboarded = [d for d in devices if d.get("managedDeviceOwnerType") and d.get("aadRegistered")]
    coverage = len(onboarded) / total
    if coverage >= 0.9:
        return _result("D-003", title, "pass",
                       f"{len(onboarded)}/{total} ({coverage:.0%}) devices onboarded to MDE.",
                       [], DEVICE_TEST_REFERENCES["D-003"]["remediation_action"])
    status = "warning" if coverage >= 0.5 else "fail"
    return _result("D-003", title, status,
                   f"Only {len(onboarded)}/{total} ({coverage:.0%}) devices onboarded to MDE.",
                   [], DEVICE_TEST_REFERENCES["D-003"]["remediation_action"])


def check_d004(client: GraphClient) -> Dict[str, Any]:
    """Devices run a supported OS version."""
    title = "Managed devices are running a supported OS version"
    devices = _safe_call(client, "get_managed_devices")
    if devices is None:
        return _result(
            "D-004", title, "not_available",
            "Managed devices could not be read.",
            [], DEVICE_TEST_REFERENCES["D-004"]["remediation_action"],
        )
    # Very loose heuristic: flag devices where osVersion is missing or obviously old
    stale = []
    for d in devices:
        ver = (d.get("osVersion") or "").strip()
        if not ver:
            stale.append(d)
            continue
        # Flag Windows 10 builds below 19045 (22H2)
        if ver.startswith("10.0.") and len(ver.split(".")) >= 3:
            try:
                build = int(ver.split(".")[2])
                if build < 19045:
                    stale.append(d)
            except ValueError:
                pass
    total = len(devices)
    if total == 0:
        return _result("D-004", title, "not_available",
                       "No managed devices found.", [], DEVICE_TEST_REFERENCES["D-004"]["remediation_action"])
    if not stale:
        return _result("D-004", title, "pass",
                       f"All {total} managed devices are on a supported OS build.", [],
                       DEVICE_TEST_REFERENCES["D-004"]["remediation_action"])
    status = "warning" if len(stale) / total < 0.15 else "fail"
    return _result("D-004", title, status,
                   f"{len(stale)}/{total} devices are on an out-of-support OS build.",
                   [{"name": d.get("deviceName", "?"), "type": d.get("operatingSystem", "Device"),
                     "appId": d.get("id", ""), "detail": d.get("osVersion", "unknown")} for d in stale[:5]],
                   DEVICE_TEST_REFERENCES["D-004"]["remediation_action"])


def check_d005(client: GraphClient) -> Dict[str, Any]:
    """Stale / inactive devices are retired (last sync > 90 days)."""
    title = "Stale or inactive devices are retired after 90 days of inactivity"
    devices = _safe_call(client, "get_managed_devices")
    if devices is None:
        return _result(
            "D-005", title, "not_available",
            "Managed devices could not be read.",
            [], DEVICE_TEST_REFERENCES["D-005"]["remediation_action"],
        )
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    stale = []
    for d in devices:
        last = d.get("lastSyncDateTime")
        if not last:
            continue
        try:
            dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
            if dt < cutoff:
                stale.append(d)
        except ValueError:
            continue
    total = len(devices)
    if total == 0:
        return _result("D-005", title, "not_available",
                       "No managed devices found.", [], DEVICE_TEST_REFERENCES["D-005"]["remediation_action"])
    if not stale:
        return _result("D-005", title, "pass",
                       f"0 stale devices out of {total} managed devices.", [],
                       DEVICE_TEST_REFERENCES["D-005"]["remediation_action"])
    status = "warning" if len(stale) / total < 0.05 else "fail"
    return _result("D-005", title, status,
                   f"{len(stale)}/{total} devices have not checked in for 90+ days.",
                   [{"name": d.get("deviceName", "?"), "type": d.get("operatingSystem", "Device"),
                     "appId": d.get("id", ""), "detail": f"last sync {d.get('lastSyncDateTime', '?')}"} for d in stale[:5]],
                   DEVICE_TEST_REFERENCES["D-005"]["remediation_action"])


# ---------------------------------------------------------------------------
# Registry & runner
# ---------------------------------------------------------------------------

ALL_CHECKS = [
    ("D-001", check_d001),
    ("D-002", check_d002),
    ("D-003", check_d003),
    ("D-004", check_d004),
    ("D-005", check_d005),
]


def run_all_checks(client: GraphClient) -> List[Dict[str, Any]]:
    return [fn(client) for _id, fn in ALL_CHECKS]


def run_single_check(client: GraphClient, test_id: str) -> Optional[Dict[str, Any]]:
    for tid, fn in ALL_CHECKS:
        if tid == test_id:
            return fn(client)
    return None


def build_summary(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(results)
    passed = sum(1 for r in results if r["status"] == "pass")
    warnings = sum(1 for r in results if r["status"] == "warning")
    failed = sum(1 for r in results if r["status"] == "fail")
    not_available = sum(1 for r in results if r["status"] == "not_available")
    errors = sum(1 for r in results if r["status"] == "error")
    actual_score = sum(r.get("score", 0) for r in results)
    score_pct = round((actual_score / total) * 100) if total else 0
    return {
        "total": total,
        "passed": passed,
        "warnings": warnings,
        "failed": failed,
        "not_available": not_available,
        "errors": errors,
        "score": score_pct,
        "max_score": total,
        "actual_score": actual_score,
        "last_run": _now_iso(),
    }


# ---------------------------------------------------------------------------
# Mock / demo data (used when Graph is not configured)
# ---------------------------------------------------------------------------

def get_mock_results() -> List[Dict[str, Any]]:
    now = _now_iso()
    mock_raw = [
        {
            "id": "D-001",
            "title": "Device compliance policies are assigned for every managed platform",
            "status": "pass",
            "score": 1.0,
            "summary": "Compliance policies found for Windows, macOS, iOS and Android.",
            "evidence": [
                {"name": "Min Windows Compliance", "type": "CompliancePolicy",
                 "appId": "policy-win-01", "detail": "Windows 10 and later"},
                {"name": "My macOS policy", "type": "CompliancePolicy",
                 "appId": "policy-mac-01", "detail": "macOS"},
                {"name": "My iOS policy", "type": "CompliancePolicy",
                 "appId": "policy-ios-01", "detail": "iOS/iPadOS"},
                {"name": "My Android policy", "type": "CompliancePolicy",
                 "appId": "policy-and-01", "detail": "Android Enterprise"},
            ],
            "recommendation": DEVICE_TEST_REFERENCES["D-001"]["remediation_action"],
        },
        {
            "id": "D-002",
            "title": "Disk encryption is enforced on all managed devices",
            "status": "warning",
            "score": 0.5,
            "summary": "42/45 managed devices are encrypted (3 non-compliant).",
            "evidence": [
                {"name": "LAPTOP-DEV-03", "type": "Windows", "appId": "dev-03",
                 "detail": "BitLocker not enabled"},
                {"name": "MBP-ANA-11", "type": "macOS", "appId": "dev-11",
                 "detail": "FileVault disabled"},
                {"name": "LAPTOP-OPS-07", "type": "Windows", "appId": "dev-07",
                 "detail": "BitLocker suspended"},
            ],
            "recommendation": DEVICE_TEST_REFERENCES["D-002"]["remediation_action"],
        },
        {
            "id": "D-003",
            "title": "Devices are onboarded to Microsoft Defender for Endpoint",
            "status": "fail",
            "score": 0.0,
            "summary": "Only 28/45 managed devices (62%) are onboarded to MDE.",
            "evidence": [
                {"name": "MDE connector", "type": "Setting", "appId": "",
                 "detail": "Enabled but onboarding profile not assigned to all users"},
                {"name": "17 unmanaged endpoints", "type": "Device", "appId": "",
                 "detail": "No MDE sensor reporting"},
            ],
            "recommendation": DEVICE_TEST_REFERENCES["D-003"]["remediation_action"],
        },
        {
            "id": "D-004",
            "title": "Managed devices are running a supported OS version",
            "status": "warning",
            "score": 0.5,
            "summary": "5/45 devices are on out-of-support OS builds.",
            "evidence": [
                {"name": "PC-FIN-02", "type": "Windows", "appId": "dev-02",
                 "detail": "Windows 10 21H1 (out of support)"},
                {"name": "PC-FIN-05", "type": "Windows", "appId": "dev-05",
                 "detail": "Windows 10 20H2 (out of support)"},
                {"name": "iPhone-SALES-03", "type": "iOS", "appId": "dev-ios-03",
                 "detail": "iOS 15 (below minimum iOS 17)"},
            ],
            "recommendation": DEVICE_TEST_REFERENCES["D-004"]["remediation_action"],
        },
        {
            "id": "D-005",
            "title": "Stale or inactive devices are retired after 90 days of inactivity",
            "status": "fail",
            "score": 0.0,
            "summary": "8 devices have not checked in for 90+ days and are still active.",
            "evidence": [
                {"name": "LAPTOP-HR-12", "type": "Windows", "appId": "dev-12",
                 "detail": "Last sync 127 days ago"},
                {"name": "MBP-MKT-04", "type": "macOS", "appId": "dev-04",
                 "detail": "Last sync 210 days ago"},
                {"name": "iPad-EXEC-01", "type": "iOS", "appId": "dev-exec-01",
                 "detail": "Last sync 97 days ago"},
            ],
            "recommendation": DEVICE_TEST_REFERENCES["D-005"]["remediation_action"],
        },
    ]

    # Enrich with shared fields (category/pillar/severity/source/last_checked/reference)
    enriched: List[Dict[str, Any]] = []
    for r in mock_raw:
        ref = DEVICE_TEST_REFERENCES.get(r["id"], {})
        enriched.append({
            **r,
            "category": ref.get("category", "Devices"),
            "pillar": "Devices",
            "severity": ref.get("risk", "medium").lower(),
            "source": ref.get("source_endpoints", []),
            "last_checked": now,
            "reference": ref,
        })
    return enriched
