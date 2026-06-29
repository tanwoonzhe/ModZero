"""Context Analysis Module — 7-signal scoring.

Scores a single access attempt based on contextual signals:

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

# ── Signal weights ─────────────────────────────────────────────────────────────

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
    include_azure: bool = False,
    na_reasons: Optional[dict] = None,
) -> tuple[float, list[dict]]:
    """Compute context score (0–100) and per-signal breakdown.

    Returns (context_score, breakdown).
    Optional keyword overrides let the posture endpoint pass DB-stored rules.
    na_reasons: optional {signal: "not_configured"} from the Entra overlay so the UI
    can tell a benign "not configured in Entra" apart from a transient collection miss.
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

    for item in _SIGNALS:
        sig = item["signal"]
        max_pts = item["max"]
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

    # Optional Entra context signals — only present when the overlay is active.
    for item in (_AZURE_SIGNALS if include_azure else []):
        sig = item["signal"]
        max_pts = item["max"]
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

    # Percentage of applicable points → 0–100 regardless of how many Azure
    # signals applied. Base signals always apply (default pass), so with no Azure
    # signals this equals the previous raw-earned value.
    context_score = round((earned / max(denominator, 1)) * 100, 1)
    return context_score, breakdown


def score_context_default(
    *,
    source_ip: Optional[str] = None,
    known_device: Optional[bool] = None,
    failed_attempt_count: int = 0,
    allowed_start_hour: int = _ALLOWED_START_HOUR,
    allowed_end_hour: int = _ALLOWED_END_HOUR,
    max_failed_attempts: int = _MAX_FAILED_ATTEMPTS,
    signin_risk_low: Optional[bool] = None,
    trusted_location: Optional[bool] = None,
    include_azure: bool = False,
    na_reasons: Optional[dict] = None,
) -> tuple[float, list[dict]]:
    """Compute context score from basic posture-report context.

    Called during posture check (not a full resource-access attempt).
    Uses current time + caller-supplied signals; other signals default to pass.
    Optional Entra sign-in signals are included when supplied.
    Returns (score, breakdown).
    """
    signals = ContextSignals(
        known_device=known_device,
        source_ip=source_ip,
        failed_attempt_count=failed_attempt_count,
        signin_risk_low=signin_risk_low,
        trusted_location=trusted_location,
    )
    return score_context_signals(
        signals,
        allowed_start_hour=allowed_start_hour,
        allowed_end_hour=allowed_end_hour,
        max_failed_attempts=max_failed_attempts,
        include_azure=include_azure,
        na_reasons=na_reasons,
    )
