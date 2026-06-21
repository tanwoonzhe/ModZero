"""Device posture scoring — server-side only.

The client reports raw boolean signals. The backend, not the client,
computes the final score. Clients cannot set scores directly.

8-factor formula (100 pts total)
---------------------------------
  firewall_enabled          15
  antivirus_enabled         15
  disk_encryption_enabled   15
  screen_lock_enabled       10
  os_supported              10
  client_healthy            10
  recent_check              10
  intune_compliant          20  (0 if Intune not configured)
  Total                    105 → normalized to 100 when Intune absent

Without Intune: 85-pt scale → normalized: (pts / 85) * 100
With Intune:    100-pt scale
"""
from __future__ import annotations

import datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..models import PostureReport

_FACTORS: list[dict] = [
    {"factor": "firewall_enabled",        "max": 15},
    {"factor": "antivirus_enabled",       "max": 15},
    {"factor": "disk_encryption_enabled", "max": 15},
    {"factor": "screen_lock_enabled",     "max": 10},
    {"factor": "os_supported",            "max": 10},
    {"factor": "client_healthy",          "max": 10},
    {"factor": "recent_check",            "max": 10},
    {"factor": "intune_compliant",        "max": 20},
]

_DEVICE_WEIGHT:   float = 0.40
_CONTEXT_WEIGHT:  float = 0.30
_IDENTITY_WEIGHT: float = 0.30


def score_posture(report: Any) -> tuple[float, list[dict]]:
    """Compute posture score and per-factor breakdown from a PostureReport row.

    Returns (posture_score 0–100, breakdown list).
    - A None value is treated as False (failing).
    - If intune_compliant is None, Intune is assumed unconfigured:
      the max denominator is reduced from 105 to 85 so the scale stays 0–100.
    """
    intune_val = getattr(report, "intune_compliant", None)
    intune_configured = intune_val is not None
    denominator = 105 if intune_configured else 85

    # recent_check: pass if reported_at exists and is within last 7 days
    reported_at = getattr(report, "reported_at", None)
    if reported_at is None:
        recent = False
    else:
        if isinstance(reported_at, str):
            try:
                reported_at = datetime.datetime.fromisoformat(reported_at)
            except ValueError:
                reported_at = None
        if reported_at:
            age = datetime.datetime.utcnow() - reported_at.replace(tzinfo=None)
            recent = age.total_seconds() < 7 * 24 * 3600
        else:
            recent = False

    overrides = {"recent_check": recent}

    earned = 0
    breakdown: list[dict] = []
    for item in _FACTORS:
        factor = item["factor"]
        max_pts = item["max"]

        if factor == "intune_compliant" and not intune_configured:
            breakdown.append({"factor": factor, "value": None, "passed": False,
                               "points": 0, "max": max_pts, "note": "not configured"})
            continue

        value = overrides.get(factor, getattr(report, factor, None))
        passed = bool(value) if value is not None else False
        pts = max_pts if passed else 0
        earned += pts
        breakdown.append({"factor": factor, "value": value, "passed": passed,
                           "points": pts, "max": max_pts})

    posture_score = round((earned / denominator) * 100, 1)
    return posture_score, breakdown


def weighted_total(
    posture_score: float,
    context_score: float,
    identity_score: float = 100.0,
    *,
    device_weight: float = _DEVICE_WEIGHT,
    context_weight: float = _CONTEXT_WEIGHT,
    identity_weight: float = _IDENTITY_WEIGHT,
) -> float:
    """Combine three module scores into the final trust score.

    Weights default to the module-level constants but can be overridden
    by passing values read from the TrustPolicyConfig DB row.
    """
    return round(
        posture_score   * device_weight
        + context_score  * context_weight
        + identity_score * identity_weight,
        1,
    )
