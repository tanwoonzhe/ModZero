"""Device posture scoring — server-side only.

The client reports raw boolean signals. The backend, not the client,
computes the final score. Clients cannot set scores directly.

8-factor formula (max 100 pts when all factors applicable)
-----------------------------------------------------------
  firewall_enabled          15  — Windows only; null → N/A
  antivirus_enabled         15  — Windows only; null → N/A
  disk_encryption_enabled   15  — Windows only; null → N/A
  screen_lock_enabled       10  — Windows only; null → N/A
  os_supported              10  — always reported
  client_healthy            10  — always reported
  recent_check              10  — derived from reported_at timestamp
  intune_compliant          20  — excluded when Intune not configured (null)

Scoring denominator = sum of applicable factors only.
N/A factors (null) are excluded from both earned and denominator so they
neither reward nor penalise — only knowable signals affect the score.
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

    - None value = signal not collected by client (e.g. Windows-only check on
      non-Windows). Treated as N/A: excluded from both earned and denominator.
    - intune_compliant = None means Intune is not configured; excluded entirely.
    - Denominator is the sum of applicable (non-null, non-excluded) factor weights.
      Falls back to 1 if everything is null (avoids division-by-zero).
    """
    intune_val = getattr(report, "intune_compliant", None)
    intune_configured = intune_val is not None

    # recent_check: pass if reported_at is within last 7 days
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
    denominator = 0
    breakdown: list[dict] = []

    for item in _FACTORS:
        factor = item["factor"]
        max_pts = item["max"]

        # Intune: skip entirely when not configured
        if factor == "intune_compliant" and not intune_configured:
            breakdown.append({
                "factor": factor, "value": None, "passed": None,
                "points": 0, "max": max_pts, "note": "not configured",
            })
            continue

        value = overrides.get(factor, getattr(report, factor, None))

        # None = not collected (OS doesn't support this check) → N/A, skip from scoring
        if value is None:
            breakdown.append({
                "factor": factor, "value": None, "passed": None,
                "points": 0, "max": max_pts, "note": "not collected",
            })
            continue

        passed = bool(value)
        pts = max_pts if passed else 0
        earned += pts
        denominator += max_pts
        breakdown.append({
            "factor": factor, "value": value, "passed": passed,
            "points": pts, "max": max_pts,
        })

    posture_score = round((earned / max(denominator, 1)) * 100, 1)
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
