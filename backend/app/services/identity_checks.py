"""Identity check evaluators inspired by Microsoft Zero Trust Assessment.

Each function implements one security check against Microsoft Graph API data.
Results use a normalized schema with pass/warning/fail/not_available/error statuses.
When Graph credentials are missing, mock data is returned for demo purposes.

Scoring model:
  pass = 1.0 point, warning = 0.5 point, fail = 0 points
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from ..graph_client import GraphClient
from .identity_tests.reference_loader import get_reference_for_result

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_STATUSES = {"pass", "warning", "fail", "not_available", "error"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _result(
    test_id: str,
    title: str,
    category: str,
    severity: str,
    status: str,
    score: float,
    summary: str,
    evidence: List[Dict[str, Any]],
    recommendation: str,
    source: List[str],
    pillar: str = "Identity",
) -> Dict[str, Any]:
    """Build a normalised test result dict with enriched reference data."""
    ref = get_reference_for_result(test_id)
    return {
        "id": test_id,
        "title": title,
        "category": category,
        "pillar": pillar,
        "severity": severity,
        "status": status,
        "score": score,
        "summary": summary,
        "evidence": evidence,
        "recommendation": recommendation,
        "source": source,
        "last_checked": _now_iso(),
        "reference": ref,
    }


def _score_for(status: str) -> float:
    if status == "pass":
        return 1.0
    if status == "warning":
        return 0.5
    return 0.0


# ---------------------------------------------------------------------------
# 21772 – Applications don't have client secrets configured
# ---------------------------------------------------------------------------

def check_21772(client: GraphClient) -> Dict[str, Any]:
    """Check that applications and service principals do not use client secrets."""
    test_id = "21772"
    title = "Applications don't have client secrets configured"
    category = "Application management"
    severity = "high"
    source = ["beta/applications", "beta/servicePrincipals"]

    try:
        apps = client.get_applications(select="id,appId,displayName,passwordCredentials")
        sps = client.get_service_principals(select="id,appId,displayName,passwordCredentials")

        evidence: List[Dict[str, Any]] = []

        for app in apps:
            if app.get("passwordCredentials"):
                evidence.append({
                    "name": app.get("displayName", "Unknown"),
                    "type": "Application",
                    "appId": app.get("appId", ""),
                    "detail": f"{len(app['passwordCredentials'])} client secret(s) detected",
                })

        for sp in sps:
            if sp.get("passwordCredentials"):
                evidence.append({
                    "name": sp.get("displayName", "Unknown"),
                    "type": "ServicePrincipal",
                    "appId": sp.get("appId", ""),
                    "detail": f"{len(sp['passwordCredentials'])} client secret(s) detected",
                })

        if not evidence:
            status = "pass"
            summary = "No applications or service principals use client secrets."
        else:
            app_count = sum(1 for e in evidence if e["type"] == "Application")
            sp_count = sum(1 for e in evidence if e["type"] == "ServicePrincipal")
            status = "fail"
            summary = (
                f"{app_count} application(s) and {sp_count} service principal(s) "
                "use client secrets."
            )

        return _result(
            test_id=test_id,
            title=title,
            category=category,
            severity=severity,
            status=status,
            score=_score_for(status),
            summary=summary,
            evidence=evidence,
            recommendation=(
                "Replace client secrets with certificates, managed identities, "
                "or federated credentials."
            ),
            source=source,
        )
    except Exception as exc:
        logger.exception("check_21772 failed")
        return _result(
            test_id=test_id, title=title, category=category, severity=severity,
            status="error", score=0.0,
            summary=f"Error: {exc}",
            evidence=[], recommendation="", source=source,
        )


# ---------------------------------------------------------------------------
# 21773 – Applications don't have certificates > 180 days
# ---------------------------------------------------------------------------

def check_21773(client: GraphClient) -> Dict[str, Any]:
    """Check that application certificates don't expire more than 180 days from now."""
    test_id = "21773"
    title = "Applications don't have certificates with expiration longer than 180 days"
    category = "Application management"
    severity = "medium"
    source = ["beta/applications", "beta/servicePrincipals"]

    try:
        apps = client.get_applications(select="id,appId,displayName,keyCredentials")
        sps = client.get_service_principals(select="id,appId,displayName,keyCredentials")

        max_expiry = datetime.now(timezone.utc) + timedelta(days=180)
        evidence: List[Dict[str, Any]] = []

        def _check_creds(items: List[Dict], item_type: str):
            for item in items:
                for cred in item.get("keyCredentials") or []:
                    end_str = cred.get("endDateTime")
                    if not end_str:
                        continue
                    try:
                        end_dt = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                    except (ValueError, TypeError):
                        continue
                    if end_dt > max_expiry:
                        evidence.append({
                            "name": item.get("displayName", "Unknown"),
                            "type": item_type,
                            "appId": item.get("appId", ""),
                            "detail": f"Certificate expires {end_dt.date().isoformat()} "
                                      f"(>{180} days from now)",
                        })

        _check_creds(apps, "Application")
        _check_creds(sps, "ServicePrincipal")

        if not evidence:
            status = "pass"
            summary = (
                "No certificate credentials (keyCredentials) exceeding 180 days were found. "
                "This check applies to certificate credentials only, not client secrets (passwordCredentials)."
            )
        else:
            status = "warning"
            summary = (
                f"{len(evidence)} certificate credential(s) have expiry dates beyond 180 days. "
                "This check applies to certificate credentials only, not client secrets."
            )

        return _result(
            test_id=test_id, title=title, category=category, severity=severity,
            status=status, score=_score_for(status),
            summary=summary, evidence=evidence,
            recommendation="Use short-lived certificates (≤180 days) and implement certificate rotation. "
                           "Client secrets are evaluated separately in test 21772.",
            source=source,
        )
    except Exception as exc:
        logger.exception("check_21773 failed")
        return _result(
            test_id=test_id, title=title, category=category, severity=severity,
            status="error", score=0.0,
            summary=f"Error: {exc}",
            evidence=[], recommendation="", source=source,
        )


# ---------------------------------------------------------------------------
# 21795 – No legacy authentication sign-in activity
# ---------------------------------------------------------------------------

_LEGACY_CLIENT_APPS = {
    "Exchange ActiveSync",
    "Other clients",
    "Exchange ActiveSync (EAS)",
    "Authenticated SMTP",
    "AutoDiscover",
    "Exchange Online PowerShell",
    "Exchange Web Services",
    "IMAP4",
    "MAPI Over HTTP",
    "Offline Address Book",
    "Outlook Anywhere (RPC over HTTP)",
    "POP3",
    "Reporting Web Services",
    "Other clients; Older Office clients",
}


def check_21795(client: GraphClient) -> Dict[str, Any]:
    """Detect legacy authentication sign-in activity."""
    test_id = "21795"
    title = "No legacy authentication sign-in activity"
    category = "Monitoring"
    severity = "medium"
    source = ["beta/auditLogs/signIns"]

    try:
        sign_ins = client.get_sign_ins(top=500)

        evidence: List[Dict[str, Any]] = []
        for si in sign_ins:
            client_app = si.get("clientAppUsed", "")
            if client_app in _LEGACY_CLIENT_APPS:
                evidence.append({
                    "name": si.get("userDisplayName", "Unknown user"),
                    "type": "SignIn",
                    "appId": si.get("appId", ""),
                    "detail": f"Legacy auth via '{client_app}' at {si.get('createdDateTime', 'unknown time')}",
                })

        # Cap evidence list to avoid huge payloads
        evidence_trimmed = evidence[:50]

        if not evidence:
            status = "pass"
            summary = "No legacy authentication sign-ins detected in recent logs."
        elif len(evidence) <= 5:
            status = "warning"
            summary = f"{len(evidence)} legacy authentication sign-in(s) detected."
        else:
            status = "fail"
            summary = f"{len(evidence)} legacy authentication sign-in(s) detected."

        return _result(
            test_id=test_id, title=title, category=category, severity=severity,
            status=status, score=_score_for(status),
            summary=summary, evidence=evidence_trimmed,
            recommendation="Block legacy authentication using Conditional Access policies.",
            source=source,
        )
    except Exception as exc:
        logger.exception("check_21795 failed")
        return _result(
            test_id=test_id, title=title, category=category, severity=severity,
            status="error", score=0.0,
            summary=f"Error: {exc}",
            evidence=[], recommendation="", source=source,
        )


# ---------------------------------------------------------------------------
# 21801 – Users have strong authentication methods configured
# ---------------------------------------------------------------------------

_STRONG_METHODS = {
    "passKeyDeviceBound",
    "passKeyDeviceBoundAuthenticator",
    "windowsHelloForBusiness",
    "fido2",
}


def check_21801(client: GraphClient) -> Dict[str, Any]:
    """Evaluate whether users have strong (phishing-resistant) auth methods."""
    test_id = "21801"
    title = "Users have strong authentication methods configured"
    category = "Credential management"
    severity = "medium"
    source = ["v1.0/reports/authenticationMethods/userRegistrationDetails"]

    try:
        # Try v1.0 first, fall back to beta
        try:
            details = client.get_user_registration_details()
        except Exception:
            details = client.get_mfa_registration_details()

        if not details:
            return _result(
                test_id=test_id, title=title, category=category, severity=severity,
                status="not_available", score=0.0,
                summary="No user registration details available (license may be required).",
                evidence=[], recommendation="", source=source,
            )

        total = len(details)
        strong_users: List[Dict] = []
        weak_users: List[Dict] = []

        for user in details:
            methods = set(user.get("methodsRegistered") or [])
            user_info = {
                "name": user.get("userDisplayName", user.get("userPrincipalName", "Unknown")),
                "type": "User",
                "appId": user.get("id", ""),
            }
            if methods & _STRONG_METHODS:
                strong_users.append({**user_info, "detail": "Strong method registered"})
            else:
                weak_users.append({**user_info, "detail": "No strong method registered"})

        coverage = (len(strong_users) / total * 100) if total else 0

        if coverage >= 95:
            status = "pass"
        elif coverage >= 60:
            status = "warning"
        else:
            status = "fail"

        summary = (
            f"{len(strong_users)}/{total} users ({coverage:.0f}%) have strong "
            "authentication methods registered."
        )

        # Show weak users as evidence (capped)
        evidence = weak_users[:30]

        return _result(
            test_id=test_id, title=title, category=category, severity=severity,
            status=status, score=_score_for(status),
            summary=summary, evidence=evidence,
            recommendation=(
                "Deploy phishing-resistant methods (FIDO2, Windows Hello for Business) "
                "and require strong authentication for all users."
            ),
            source=source,
        )
    except Exception as exc:
        logger.exception("check_21801 failed")
        return _result(
            test_id=test_id, title=title, category=category, severity=severity,
            status="error", score=0.0,
            summary=f"Error: {exc}",
            evidence=[], recommendation="", source=source,
        )


# ---------------------------------------------------------------------------
# 21796 – Block legacy authentication policy is configured
# ---------------------------------------------------------------------------

def check_21796(client: GraphClient) -> Dict[str, Any]:
    """Check whether a Conditional Access policy blocks legacy authentication."""
    test_id = "21796"
    title = "Block legacy authentication policy is configured"
    category = "Access control"
    severity = "medium"
    source = ["v1.0/identity/conditionalAccess/policies"]

    try:
        policies = client.get_conditional_access_policies()

        # Look for policies that block legacy auth (same logic as MS PS1)
        block_policies = []
        for p in policies:
            grant = p.get("grantControls") or {}
            built_in = grant.get("builtInControls") or []
            client_apps = (p.get("conditions") or {}).get("clientAppTypes") or []

            if (
                "block" in built_in
                and "exchangeActiveSync" in client_apps
                and "other" in client_apps
            ):
                block_policies.append(p)

        # Check if any blocking policy targets all users and is enabled
        enabled_block = [
            p for p in block_policies
            if p.get("state") == "enabled"
            and "All" in ((p.get("conditions") or {}).get("users") or {}).get("includeUsers", [])
        ]

        evidence = [
            {
                "name": p.get("displayName", "Unnamed policy"),
                "type": "ConditionalAccessPolicy",
                "appId": p.get("id", ""),
                "detail": f"State: {p.get('state', 'unknown')}",
            }
            for p in block_policies
        ]

        if enabled_block:
            status = "pass"
            summary = (
                f"{len(enabled_block)} Conditional Access policy(ies) actively block "
                "legacy authentication for all users."
            )
        elif block_policies:
            status = "warning"
            summary = (
                "Policies to block legacy authentication exist but are not enabled "
                "or don't target all users."
            )
        else:
            status = "fail"
            summary = "No Conditional Access policy blocks legacy authentication."

        return _result(
            test_id=test_id, title=title, category=category, severity=severity,
            status=status, score=_score_for(status),
            summary=summary, evidence=evidence,
            recommendation=(
                "Create and enable a Conditional Access policy that blocks "
                "Exchange ActiveSync and Other clients for all users."
            ),
            source=source,
        )
    except Exception as exc:
        logger.exception("check_21796 failed")
        return _result(
            test_id=test_id, title=title, category=category, severity=severity,
            status="error", score=0.0,
            summary=f"Error: {exc}",
            evidence=[], recommendation="", source=source,
        )


# ---------------------------------------------------------------------------
# Registry & runner
# ---------------------------------------------------------------------------

# Ordered list of all implemented checks
ALL_CHECKS = [
    ("21772", check_21772),
    ("21773", check_21773),
    ("21795", check_21795),
    ("21801", check_21801),
    ("21796", check_21796),
]


def run_all_checks(client: GraphClient) -> List[Dict[str, Any]]:
    """Execute every registered check and return results list."""
    results = []
    for _test_id, fn in ALL_CHECKS:
        results.append(fn(client))
    return results


def run_single_check(client: GraphClient, test_id: str) -> Optional[Dict[str, Any]]:
    """Run a single check by test_id. Returns None if not found."""
    for tid, fn in ALL_CHECKS:
        if tid == test_id:
            return fn(client)
    return None


def build_summary(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compute an identity testing summary from a list of test results."""
    total = len(results)
    passed = sum(1 for r in results if r["status"] == "pass")
    warnings = sum(1 for r in results if r["status"] == "warning")
    failed = sum(1 for r in results if r["status"] == "fail")
    not_available = sum(1 for r in results if r["status"] == "not_available")
    errors = sum(1 for r in results if r["status"] == "error")

    max_score = total  # each test worth 1 point max
    actual_score = sum(r.get("score", 0) for r in results)
    score_pct = round((actual_score / max_score) * 100) if max_score else 0

    return {
        "total": total,
        "passed": passed,
        "warnings": warnings,
        "failed": failed,
        "not_available": not_available,
        "errors": errors,
        "score": score_pct,
        "max_score": max_score,
        "actual_score": actual_score,
        "last_run": _now_iso(),
    }


# ---------------------------------------------------------------------------
# Mock / demo data  (used when Graph credentials are not configured)
# ---------------------------------------------------------------------------

def get_mock_results() -> List[Dict[str, Any]]:
    """Return realistic-looking mock results for demo/presentation."""
    now = _now_iso()
    mock_raw = [
        {
            "id": "21772",
            "title": "Applications don't have client secrets configured",
            "category": "Application management",
            "pillar": "Identity",
            "severity": "high",
            "status": "fail",
            "score": 0.0,
            "summary": "3 applications and 1 service principal use client secrets.",
            "evidence": [
                {"name": "ModZero Backend App", "type": "Application",
                 "appId": "49088adf-xxxx-xxxx-xxxx-453d07535e63",
                 "detail": "1 client secret(s) detected"},
                {"name": "HR Portal", "type": "Application",
                 "appId": "aaaabbbb-cccc-dddd-eeee-ffffffffffff",
                 "detail": "2 client secret(s) detected"},
                {"name": "Legacy CRM Connector", "type": "Application",
                 "appId": "11112222-3333-4444-5555-666677778888",
                 "detail": "1 client secret(s) detected"},
                {"name": "Contoso ERP", "type": "ServicePrincipal",
                 "appId": "99990000-aaaa-bbbb-cccc-ddddeeee0001",
                 "detail": "1 client secret(s) detected"},
            ],
            "recommendation": "Replace client secrets with certificates, managed identities, or federated credentials.",
            "source": ["beta/applications", "beta/servicePrincipals"],
            "last_checked": now,
        },
        {
            "id": "21773",
            "title": "Applications don't have certificates with expiration longer than 180 days",
            "category": "Application management",
            "pillar": "Identity",
            "severity": "medium",
            "status": "warning",
            "score": 0.5,
            "summary": "2 certificate credential(s) have expiry dates beyond 180 days. This check applies to certificate credentials only, not client secrets.",
            "evidence": [
                {"name": "ModZero Backend App", "type": "Application",
                 "appId": "49088adf-xxxx-xxxx-xxxx-453d07535e63",
                 "detail": "Certificate expires 2027-06-15 (>180 days from now)"},
                {"name": "SSO Gateway", "type": "ServicePrincipal",
                 "appId": "abcdef00-1111-2222-3333-444455556666",
                 "detail": "Certificate expires 2028-01-10 (>180 days from now)"},
            ],
            "recommendation": "Use short-lived certificates (≤180 days) and implement certificate rotation. Client secrets are evaluated separately in test 21772.",
            "source": ["beta/applications", "beta/servicePrincipals"],
            "last_checked": now,
        },
        {
            "id": "21795",
            "title": "No legacy authentication sign-in activity",
            "category": "Monitoring",
            "pillar": "Identity",
            "severity": "medium",
            "status": "fail",
            "score": 0.0,
            "summary": "12 legacy authentication sign-in(s) detected.",
            "evidence": [
                {"name": "John Smith", "type": "SignIn", "appId": "",
                 "detail": "Legacy auth via 'IMAP4' at 2026-04-18T09:14:00Z"},
                {"name": "Jane Doe", "type": "SignIn", "appId": "",
                 "detail": "Legacy auth via 'POP3' at 2026-04-17T15:22:00Z"},
                {"name": "Bob Wilson", "type": "SignIn", "appId": "",
                 "detail": "Legacy auth via 'Authenticated SMTP' at 2026-04-16T11:05:00Z"},
            ],
            "recommendation": "Block legacy authentication using Conditional Access policies.",
            "source": ["beta/auditLogs/signIns"],
            "last_checked": now,
        },
        {
            "id": "21801",
            "title": "Users have strong authentication methods configured",
            "category": "Credential management",
            "pillar": "Identity",
            "severity": "medium",
            "status": "warning",
            "score": 0.5,
            "summary": "8/12 users (67%) have strong authentication methods registered.",
            "evidence": [
                {"name": "Bob Wilson", "type": "User", "appId": "",
                 "detail": "No strong method registered"},
                {"name": "Charlie Brown", "type": "User", "appId": "",
                 "detail": "No strong method registered"},
                {"name": "Diana Prince", "type": "User", "appId": "",
                 "detail": "No strong method registered"},
                {"name": "Eve Adams", "type": "User", "appId": "",
                 "detail": "No strong method registered"},
            ],
            "recommendation": "Deploy phishing-resistant methods (FIDO2, Windows Hello for Business) and require strong authentication for all users.",
            "source": ["v1.0/reports/authenticationMethods/userRegistrationDetails"],
            "last_checked": now,
        },
        {
            "id": "21796",
            "title": "Block legacy authentication policy is configured",
            "category": "Access control",
            "pillar": "Identity",
            "severity": "medium",
            "status": "pass",
            "score": 1.0,
            "summary": "1 Conditional Access policy(ies) actively block legacy authentication for all users.",
            "evidence": [
                {"name": "Block Legacy Auth - All Users", "type": "ConditionalAccessPolicy",
                 "appId": "ca-policy-001",
                 "detail": "State: enabled"},
            ],
            "recommendation": "Create and enable a Conditional Access policy that blocks Exchange ActiveSync and Other clients for all users.",
            "source": ["v1.0/identity/conditionalAccess/policies"],
            "last_checked": now,
        },
    ]

    # Enrich each mock result with reference data
    for r in mock_raw:
        r["reference"] = get_reference_for_result(r["id"])

    return mock_raw
