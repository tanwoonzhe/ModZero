"""Context Analysis Module — local + Entra signal scoring.

Which signals exist, their point values, whether they're enabled, and what
happens when one fails are all read from the signal_rules table (admin
editable via /api/signal-rules) — this module only supplies the fallback
defaults below, used if a rule row is somehow missing.

  Local signals
  Normal access time           15
  No repeated failed login     20
  Normal IP / not blocked      15
  Trusted network              15
  Network profile check        10
  Access frequency check       10
  Gateway / Connector online    5

  Entra signals (optional overlay, N/A unless collected)
  Sign-in risk low             15
  MFA enforced at sign-in      10
  Modern authentication used   10

(known_device was removed — Device already has a permanent 1:1 owner in
this data model, so "is this a known device" duplicated identity/enrolment
checks elsewhere without adding a real signal. known_user_device_pair and
resource_pattern_normal were removed earlier for the same reason: neither
was ever wired to real data by any caller. trusted_location,
latest_signin_ip_match and signin_location_consistent were removed because
the beta signIns fields they depended on — networkLocationDetails and a
second recent record — were empty on most real sign-ins, leaving them stuck
on "Not Configured" far more often than they resolved.)

Caller supplies the signals; this service computes the score + breakdown.
"""
from __future__ import annotations

import datetime
import ipaddress
from typing import Optional

from .signal_rules import resolve_rule

# ── Signal weights (fallback defaults; see signal_rules table) ─────────────────

_SIGNALS = [
    {"signal": "normal_access_time",        "max": 15},
    {"signal": "no_repeated_failed_login",  "max": 20},
    {"signal": "normal_ip",                 "max": 15},
    {"signal": "trusted_network",           "max": 15},
    {"signal": "network_profile_check",     "max": 10},
    {"signal": "access_frequency_check",    "max": 10},
    {"signal": "gateway_online",            "max":  5},
]

# Optional Entra (Microsoft Graph sign-in) context signals. N/A (None) unless
# resolved from the latest sign-in log → excluded from earned + denominator.
_AZURE_SIGNALS = [
    {"signal": "signin_risk_low",      "max": 15},
    {"signal": "mfa_enforced_signin",  "max": 10},
    {"signal": "modern_auth_used",     "max": 10},
]

_ALLOWED_START_HOUR = 8   # 08:00
_ALLOWED_END_HOUR   = 20  # 20:00
_MAX_FAILED_ATTEMPTS = 5
_MAX_ACCESS_FREQUENCY = 20  # access requests within the caller-defined lookback window


def _ip_in_networks(ip: str, networks: list[str]) -> Optional[bool]:
    """True if `ip` matches any entry in `networks` (single IPs or CIDR ranges)."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None
    for net in networks:
        try:
            if "/" in net:
                if addr in ipaddress.ip_network(net, strict=False):
                    return True
            elif addr == ipaddress.ip_address(net):
                return True
        except ValueError:
            continue
    return False


# ── Public API ─────────────────────────────────────────────────────────────────

class ContextSignals:
    """Data container for context signals of a single access attempt."""

    def __init__(
        self,
        *,
        request_time: Optional[datetime.datetime] = None,
        failed_attempt_count: int = 0,
        source_ip: Optional[str] = None,
        blocked_ips: Optional[list[str]] = None,
        gateway_online: Optional[bool] = None,
        trusted_networks: Optional[list[str]] = None,
        network_profile: Optional[str] = None,
        access_frequency_count: Optional[int] = None,
        # Optional Entra sign-in context (None = not collected → N/A)
        signin_risk_low: Optional[bool] = None,
        mfa_enforced_signin: Optional[bool] = None,
        modern_auth_used: Optional[bool] = None,
    ) -> None:
        self.request_time = request_time or datetime.datetime.now()
        self.failed_attempt_count = failed_attempt_count
        self.source_ip = source_ip
        self.blocked_ips: list[str] = blocked_ips or []
        self.gateway_online = gateway_online
        self.trusted_networks: list[str] = trusted_networks or []
        self.network_profile = network_profile
        self.access_frequency_count = access_frequency_count
        self.signin_risk_low = signin_risk_low
        self.mfa_enforced_signin = mfa_enforced_signin
        self.modern_auth_used = modern_auth_used


def score_context_signals(
    signals: ContextSignals,
    *,
    allowed_start_hour: int = _ALLOWED_START_HOUR,
    allowed_end_hour: int = _ALLOWED_END_HOUR,
    max_failed_attempts: int = _MAX_FAILED_ATTEMPTS,
    suspicious_ip_penalty: Optional[int] = None,
    include_azure: bool = False,
    na_reasons: Optional[dict] = None,
    rules: Optional[dict] = None,
) -> tuple[float, list[dict], list[dict]]:
    """Compute context score (0–100), per-signal breakdown, and hard-fail signals.

    Returns (context_score, breakdown, hard_fails).
    Optional keyword overrides let the posture endpoint pass DB-stored rules.
    na_reasons: optional {signal: "not_configured"} from the Entra overlay so the UI
    can tell a benign "not configured in Entra" apart from a transient collection miss.
    suspicious_ip_penalty: from TrustPolicyConfig (Context Rules tab). When set,
    overrides the normal_ip signal's point value for this calculation — the
    dedicated Context Rules knob takes precedence over its signal_rules.max_points row.
    rules: {signal_key: SignalRule} for module="context" (from
    signal_rules.get_signal_rules). A disabled rule excludes that signal
    entirely. Missing rows fall back to the shipped defaults.
    hard_fails: [{module, signal, label, failure_action}] for every FAILED
    (not N/A) signal whose rule has failure_action != reduce_score.
    """
    na_reasons = na_reasons or {}
    # Derive boolean results
    hour = signals.request_time.hour
    normal_time = allowed_start_hour <= hour < allowed_end_hour
    no_failed_login = signals.failed_attempt_count < max_failed_attempts

    normal_ip: bool
    if signals.source_ip and signals.blocked_ips:
        normal_ip = signals.source_ip not in signals.blocked_ips
    else:
        normal_ip = True  # assume ok if unknown

    signal_notes: dict[str, str] = {}
    # Signals whose N/A is "admin hasn't configured this yet" (benign, expected)
    # rather than "we couldn't collect the data" (a gap). The UI renders the
    # former as "Not Configured" and the latter as "N/A", matching how the
    # Entra signals already distinguish the two.
    signal_status: dict[str, str] = {}

    if not signals.trusted_networks:
        trusted_network: Optional[bool] = None
        signal_notes["trusted_network"] = "no trusted networks configured"
        signal_status["trusted_network"] = "not_configured"
    elif not signals.source_ip:
        trusted_network = None
        signal_notes["trusted_network"] = "source IP not available"
    else:
        trusted_network = _ip_in_networks(signals.source_ip, signals.trusted_networks)

    if signals.network_profile:
        network_profile_check: Optional[bool] = signals.network_profile != "Public"
    else:
        network_profile_check = None
        signal_notes["network_profile_check"] = "not collected"

    if signals.access_frequency_count is None:
        access_frequency_check: Optional[bool] = None
        signal_notes["access_frequency_check"] = "not collected"
    else:
        access_frequency_check = signals.access_frequency_count <= _MAX_ACCESS_FREQUENCY

    signal_values: dict[str, Optional[bool]] = {
        "normal_access_time":       normal_time,
        "no_repeated_failed_login": no_failed_login,
        "normal_ip":                normal_ip,
        "trusted_network":          trusted_network,
        "network_profile_check":    network_profile_check,
        "access_frequency_check":   access_frequency_check,
        "gateway_online":           signals.gateway_online if signals.gateway_online is not None else True,
    }

    azure_values: dict[str, Optional[bool]] = {
        "signin_risk_low":      signals.signin_risk_low,
        "mfa_enforced_signin":  signals.mfa_enforced_signin,
        "modern_auth_used":     signals.modern_auth_used,
    }

    earned = 0
    denominator = 0
    breakdown: list[dict] = []
    hard_fails: list[dict] = []

    for item in _SIGNALS:
        sig = item["signal"]
        enabled, max_pts, failure_action = resolve_rule(rules, sig, item["max"])
        if sig == "normal_ip" and suspicious_ip_penalty is not None:
            max_pts = suspicious_ip_penalty
        if not enabled:
            breakdown.append({
                "signal": sig, "passed": None, "points": 0, "max": max_pts,
                "module": "context_analysis", "note": "disabled by policy",
            })
            continue
        val = signal_values.get(sig, True)
        if val is None:
            na_entry = {
                "signal": sig, "passed": None, "points": 0, "max": max_pts,
                "module": "context_analysis", "note": signal_notes.get(sig, "not collected"),
            }
            if sig in signal_status:
                na_entry["status"] = signal_status[sig]
            breakdown.append(na_entry)
            continue
        passed = bool(val)
        pts = max_pts if passed else 0
        earned += pts
        denominator += max_pts
        breakdown.append({
            "signal": sig,
            "passed": passed,
            "points": pts,
            "max":    max_pts,
            "module": "context_analysis",
        })
        if not passed and failure_action != "reduce_score":
            hard_fails.append({
                "module": "context", "signal": sig, "label": sig,
                "failure_action": failure_action,
            })

    # Optional Entra context signals — only present when the overlay is active.
    for item in (_AZURE_SIGNALS if include_azure else []):
        sig = item["signal"]
        enabled, max_pts, failure_action = resolve_rule(rules, sig, item["max"])
        if not enabled:
            breakdown.append({
                "signal": sig, "passed": None, "points": 0, "max": max_pts,
                "module": "context_analysis", "source": "entra", "note": "disabled by policy",
            })
            continue
        val = azure_values.get(sig)
        if val is None:
            reason = na_reasons.get(sig, "not_collected")
            note = "not configured in Entra" if reason == "not_configured" else "not collected"
            breakdown.append({
                "signal": sig, "passed": None, "points": 0, "max": max_pts,
                "module": "context_analysis", "source": "entra",
                "status": reason, "note": note,
            })
            continue
        passed = bool(val)
        pts = max_pts if passed else 0
        earned += pts
        denominator += max_pts
        breakdown.append({
            "signal": sig, "passed": passed, "points": pts, "max": max_pts,
            "module": "context_analysis", "source": "entra",
        })
        if not passed and failure_action != "reduce_score":
            hard_fails.append({
                "module": "context", "signal": sig, "label": sig,
                "failure_action": failure_action,
            })

    # Percentage of applicable points → 0–100 regardless of how many Azure
    # signals applied. Base signals always apply (default pass), so with no Azure
    # signals this equals the previous raw-earned value.
    context_score = round((earned / max(denominator, 1)) * 100, 1)
    return context_score, breakdown, hard_fails


def score_context_default(
    *,
    source_ip: Optional[str] = None,
    failed_attempt_count: int = 0,
    allowed_start_hour: int = _ALLOWED_START_HOUR,
    allowed_end_hour: int = _ALLOWED_END_HOUR,
    max_failed_attempts: int = _MAX_FAILED_ATTEMPTS,
    suspicious_ip_penalty: Optional[int] = None,
    blocked_ips: Optional[list[str]] = None,
    gateway_online: Optional[bool] = None,
    trusted_networks: Optional[list[str]] = None,
    network_profile: Optional[str] = None,
    access_frequency_count: Optional[int] = None,
    signin_risk_low: Optional[bool] = None,
    mfa_enforced_signin: Optional[bool] = None,
    modern_auth_used: Optional[bool] = None,
    include_azure: bool = False,
    na_reasons: Optional[dict] = None,
    rules: Optional[dict] = None,
) -> tuple[float, list[dict], list[dict]]:
    """Compute context score from basic posture-report context.

    Called during posture check (not a full resource-access attempt).
    Uses current time + caller-supplied signals; other signals default to pass.
    Optional Entra sign-in signals are included when supplied.
    Returns (score, breakdown, hard_fails).
    """
    signals = ContextSignals(
        source_ip=source_ip,
        failed_attempt_count=failed_attempt_count,
        blocked_ips=blocked_ips,
        gateway_online=gateway_online,
        trusted_networks=trusted_networks,
        network_profile=network_profile,
        access_frequency_count=access_frequency_count,
        signin_risk_low=signin_risk_low,
        mfa_enforced_signin=mfa_enforced_signin,
        modern_auth_used=modern_auth_used,
    )
    return score_context_signals(
        signals,
        allowed_start_hour=allowed_start_hour,
        allowed_end_hour=allowed_end_hour,
        max_failed_attempts=max_failed_attempts,
        suspicious_ip_penalty=suspicious_ip_penalty,
        include_azure=include_azure,
        na_reasons=na_reasons,
        rules=rules,
    )
