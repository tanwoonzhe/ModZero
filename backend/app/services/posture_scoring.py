"""Device posture scoring — server-side only.

The client reports raw boolean signals. The backend, not the client,
computes the final score. Clients cannot set scores directly.

Which signals exist, their point values, whether they're enabled, and what
happens when one fails are all read from the signal_rules table (admin
editable via /api/signal-rules) — this module only supplies the fallback
defaults used if a rule row is somehow missing. See services/signal_rules.py.

Scoring denominator = sum of applicable (enabled, non-N/A) factor weights.
N/A factors (null) are excluded from both earned and denominator so they
neither reward nor penalise — only knowable signals affect the score.
"""
from __future__ import annotations

import datetime
from typing import TYPE_CHECKING, Any, Optional

from .signal_rules import resolve_rule

if TYPE_CHECKING:
    from ..models import PostureReport

# Fallback defaults — used only when a signal has no corresponding
# signal_rules row (should not happen once the table is seeded).
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

# Optional Entra-sourced device factors — only contribute when enabled and the
# device was matched in Entra/Intune. Each is N/A (None) otherwise, excluded from
# both earned points and the denominator (never rewards or penalises).
_AZURE_FACTORS: list[dict] = [
    {"factor": "entra_registered", "max": 10},
    {"factor": "intune_managed",   "max": 10},
    {"factor": "intune_encrypted", "max": 15},
]

_DEVICE_WEIGHT:   float = 0.40
_CONTEXT_WEIGHT:  float = 0.30
_IDENTITY_WEIGHT: float = 0.30


def score_posture(
    report: Any,
    azure_factors: Optional[dict] = None,
    rules: Optional[dict] = None,
) -> tuple[float, list[dict], list[dict]]:
    """Compute posture score, per-factor breakdown, and hard-fail signals.

    Returns (posture_score 0–100, breakdown list, hard_fails list).

    - rules: {signal_key: SignalRule} for module="device" (from
      signal_rules.get_signal_rules). A disabled rule excludes that signal
      entirely (no points, no denominator contribution, shown as
      "disabled by policy"). Missing rows fall back to the shipped defaults.
    - hard_fails: [{module, signal, label, failure_action}] for every FAILED
      (not N/A) signal whose rule has failure_action != reduce_score. Callers
      (posture.py) enforce these — deny_immediately_client disables the
      user's client access, deny_immediately_resources hard-denies resource
      access until the next passing check.
    - None value = signal not collected by client (e.g. Windows-only check on
      non-Windows). Treated as N/A: excluded from both earned and denominator.
    - intune_compliant = None means Intune is not configured; excluded entirely.
    """
    azure_factors = azure_factors or {}
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
    hard_fails: list[dict] = []

    for item in _FACTORS:
        factor = item["factor"]
        enabled, max_pts, failure_action = resolve_rule(rules, factor, item["max"])

        if not enabled:
            breakdown.append({
                "factor": factor, "value": None, "passed": None,
                "points": 0, "max": max_pts, "module": "device", "note": "disabled by policy",
            })
            continue

        # Intune: skip entirely when not configured
        if factor == "intune_compliant" and not intune_configured:
            breakdown.append({
                "factor": factor, "value": None, "passed": None,
                "points": 0, "max": max_pts, "module": "device", "note": "not configured",
            })
            continue

        value = overrides.get(factor, getattr(report, factor, None))

        # None = not collected (OS doesn't support this check) → N/A, skip from scoring
        if value is None:
            breakdown.append({
                "factor": factor, "value": None, "passed": None,
                "points": 0, "max": max_pts, "module": "device", "note": "not collected",
            })
            continue

        passed = bool(value)
        pts = max_pts if passed else 0
        earned += pts
        denominator += max_pts
        breakdown.append({
            "factor": factor, "value": value, "passed": passed,
            "points": pts, "max": max_pts, "module": "device",
        })
        if not passed and failure_action != "reduce_score":
            hard_fails.append({
                "module": "device", "signal": factor, "label": factor,
                "failure_action": failure_action,
            })

    # Optional Entra device factors — only included when the Entra overlay ran
    # (azure_factors is a dict, even if its values are None for an unmatched
    # device). When Entra is off, azure_factors is empty → no extra rows at all,
    # so the breakdown is identical to before.
    for item in (_AZURE_FACTORS if azure_factors else []):
        factor = item["factor"]
        enabled, max_pts, failure_action = resolve_rule(rules, factor, item["max"])

        if not enabled:
            breakdown.append({
                "factor": factor, "value": None, "passed": None,
                "points": 0, "max": max_pts, "module": "device", "source": "entra", "note": "disabled by policy",
            })
            continue

        value = azure_factors.get(factor)
        if value is None:
            breakdown.append({
                "factor": factor, "value": None, "passed": None,
                "points": 0, "max": max_pts, "module": "device", "source": "entra", "note": "not collected",
            })
            continue
        passed = bool(value)
        pts = max_pts if passed else 0
        earned += pts
        denominator += max_pts
        breakdown.append({
            "factor": factor, "value": value, "passed": passed,
            "points": pts, "max": max_pts, "module": "device", "source": "entra",
        })
        if not passed and failure_action != "reduce_score":
            hard_fails.append({
                "module": "device", "signal": factor, "label": factor,
                "failure_action": failure_action,
            })

    posture_score = round((earned / max(denominator, 1)) * 100, 1)
    return posture_score, breakdown, hard_fails


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

    The composite trust score is rounded to a whole number on purpose: it is
    the single value every surface displays (Overview, Device Check, Last
    Access Decision, access-log reason strings). Rounding once here — at the
    source — guarantees they can never disagree by a decimal (the old
    "Overview 90 vs Last Access 91" bug). Module sub-scores keep one decimal
    for the breakdown; only the headline total is integral.
    """
    return float(round(
        posture_score   * device_weight
        + context_score  * context_weight
        + identity_score * identity_weight
    ))
