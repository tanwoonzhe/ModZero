"""Context Analysis Module — 7-signal scoring.

Which signals exist, their point values, whether they're enabled, and what
happens when one fails are all read from the signal_rules table (admin
editable via /api/signal-rules) — this module only supplies the fallback
defaults below, used if a rule row is somehow missing.

  Known device                    20
  Normal access time              15
  No repeated failed login        20
  Normal IP / not blocked         15
  Known user-device pair          15
  Resource access pattern normal  10
  Backend gateway/resource online  5
  Total                          100

Caller supplies the signals; this service computes the score + breakdown.
"""
from __future__ import annotations

import datetime
from typing import Optional

from .signal_rules import resolve_rule

# ── Signal weights (fallback defaults; see signal_rules table) ─────────────────

_SIGNALS = [
    {"signal": "known_device",              "max": 20},
    {"signal": "normal_access_time",        "max": 15},
    {"signal": "no_repeated_failed_login",  "max": 20},
    {"signal": "normal_ip",                 "max": 15},
    {"signal": "known_user_device_pair",    "max": 15},
    {"signal": "resource_pattern_normal",   "max": 10},
    {"signal": "gateway_online",            "max":  5},
]

# Optional Entra (Microsoft Graph sign-in) context signals. N/A (None) unless
# resolved from the latest sign-in log → excluded from earned + denominator.
_AZURE_SIGNALS = [
    {"signal": "signin_risk_low",  "max": 15},
    {"signal": "trusted_location", "max": 10},
]

_ALLOWED_START_HOUR = 8   # 08:00
_ALLOWED_END_HOUR   = 20  # 20:00
_MAX_FAILED_ATTEMPTS = 5


# ── Public API ─────────────────────────────────────────────────────────────────

class ContextSignals:
    """Data container for context signals of a single access attempt."""

    def __init__(
        self,
        *,
        known_device: Optional[bool] = None,
        request_time: Optional[datetime.datetime] = None,
        failed_attempt_count: int = 0,
        source_ip: Optional[str] = None,
        blocked_ips: Optional[list[str]] = None,
        known_user_device_pair: Optional[bool] = None,
        resource_pattern_normal: Optional[bool] = None,
        gateway_online: Optional[bool] = None,
        # Optional Entra sign-in context (None = not collected → N/A)
        signin_risk_low: Optional[bool] = None,
        trusted_location: Optional[bool] = None,
    ) -> None:
        self.known_device = known_device
        self.request_time = request_time or datetime.datetime.now()
        self.failed_attempt_count = failed_attempt_count
        self.source_ip = source_ip
        self.blocked_ips: list[str] = blocked_ips or []
        self.known_user_device_pair = known_user_device_pair
        self.resource_pattern_normal = resource_pattern_normal
        self.gateway_online = gateway_online
        self.signin_risk_low = signin_risk_low
        self.trusted_location = trusted_location


def score_context_signals(
    signals: ContextSignals,
    *,
    allowed_start_hour: int = _ALLOWED_START_HOUR,
    allowed_end_hour: int = _ALLOWED_END_HOUR,
    max_failed_attempts: int = _MAX_FAILED_ATTEMPTS,
    require_known_device: bool = True,
    unknown_device_penalty: Optional[int] = None,
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
    require_known_device: from TrustPolicyConfig (Context Rules tab). False means
    an unrecognised device is not penalised at all — known_device is reported N/A
    instead of failed.
    unknown_device_penalty / suspicious_ip_penalty: from TrustPolicyConfig (Context
    Rules tab). When set, override the known_device / normal_ip signal's point
    value for this calculation — the dedicated Context Rules knobs for these two
    signals take precedence over their signal_rules.max_points row.
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

    signal_values = {
        "known_device":             signals.known_device if signals.known_device is not None else True,
        "normal_access_time":       normal_time,
        "no_repeated_failed_login": no_failed_login,
        "normal_ip":                normal_ip,
        "known_user_device_pair":   signals.known_user_device_pair if signals.known_user_device_pair is not None else True,
        "resource_pattern_normal":  signals.resource_pattern_normal if signals.resource_pattern_normal is not None else True,
        "gateway_online":           signals.gateway_online if signals.gateway_online is not None else True,
    }

    azure_values: dict[str, Optional[bool]] = {
        "signin_risk_low":  signals.signin_risk_low,
        "trusted_location": signals.trusted_location,
    }

    earned = 0
    denominator = 0
    breakdown: list[dict] = []
    hard_fails: list[dict] = []

    for item in _SIGNALS:
        sig = item["signal"]
        enabled, max_pts, failure_action = resolve_rule(rules, sig, item["max"])
        if sig == "known_device" and unknown_device_penalty is not None:
            max_pts = unknown_device_penalty
        if sig == "normal_ip" and suspicious_ip_penalty is not None:
            max_pts = suspicious_ip_penalty
        if not enabled:
            breakdown.append({
                "signal": sig, "passed": None, "points": 0, "max": max_pts,
                "module": "context_analysis", "note": "disabled by policy",
            })
            continue
        if sig == "known_device" and not require_known_device:
            breakdown.append({
                "signal": sig, "passed": None, "points": 0, "max": max_pts,
                "module": "context_analysis", "note": "not required by policy",
            })
            continue
        passed = bool(signal_values.get(sig, True))
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
    known_device: Optional[bool] = None,
    failed_attempt_count: int = 0,
    allowed_start_hour: int = _ALLOWED_START_HOUR,
    allowed_end_hour: int = _ALLOWED_END_HOUR,
    max_failed_attempts: int = _MAX_FAILED_ATTEMPTS,
    require_known_device: bool = True,
    unknown_device_penalty: Optional[int] = None,
    suspicious_ip_penalty: Optional[int] = None,
    blocked_ips: Optional[list[str]] = None,
    signin_risk_low: Optional[bool] = None,
    trusted_location: Optional[bool] = None,
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
        known_device=known_device,
        source_ip=source_ip,
        failed_attempt_count=failed_attempt_count,
        blocked_ips=blocked_ips,
        signin_risk_low=signin_risk_low,
        trusted_location=trusted_location,
    )
    return score_context_signals(
        signals,
        allowed_start_hour=allowed_start_hour,
        allowed_end_hour=allowed_end_hour,
        max_failed_attempts=max_failed_attempts,
        require_known_device=require_known_device,
        unknown_device_penalty=unknown_device_penalty,
        suspicious_ip_penalty=suspicious_ip_penalty,
        include_azure=include_azure,
        na_reasons=na_reasons,
        rules=rules,
    )
