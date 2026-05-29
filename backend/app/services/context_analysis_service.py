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
    ) -> None:
        self.known_device = known_device
        self.request_time = request_time or datetime.datetime.utcnow()
        self.failed_attempt_count = failed_attempt_count
        self.source_ip = source_ip
        self.blocked_ips: list[str] = blocked_ips or []
        self.known_user_device_pair = known_user_device_pair
        self.resource_pattern_normal = resource_pattern_normal
        self.gateway_online = gateway_online


def score_context_signals(signals: ContextSignals) -> tuple[float, list[dict]]:
    """Compute context score (0–100) and per-signal breakdown.

    Returns (context_score, breakdown).
    """
    # Derive boolean results
    hour = signals.request_time.hour
    normal_time = _ALLOWED_START_HOUR <= hour < _ALLOWED_END_HOUR
    no_failed_login = signals.failed_attempt_count < _MAX_FAILED_ATTEMPTS

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

    earned = 0
    breakdown: list[dict] = []
    for item in _SIGNALS:
        sig = item["signal"]
        max_pts = item["max"]
        passed = bool(signal_values.get(sig, True))
        pts = max_pts if passed else 0
        earned += pts
        breakdown.append({
            "signal": sig,
            "passed": passed,
            "points": pts,
            "max":    max_pts,
            "module": "context_analysis",
        })

    return round(earned, 1), breakdown


def score_context_default() -> float:
    """Default context score when no access-attempt signals are available."""
    # Use current time for time check; assume all other signals pass
    signals = ContextSignals()
    score, _ = score_context_signals(signals)
    return score
