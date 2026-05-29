"""Access evaluation and policy simulation endpoints.

Routes
------
  POST /api/evaluate-access      — evaluate a real access request
  POST /api/policies/simulate    — simulate a policy evaluation with a scenario
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..deps import get_current_user
from ..models import User

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class SimulateRequest(BaseModel):
    scenario: str = "typical"
    resource_id: Optional[str] = None
    weights: Optional[dict] = None   # {device_posture, context_analysis, trust_scoring_engine}
    threshold: Optional[int] = None


class EvaluateRequest(BaseModel):
    resource_id: str
    device_id: Optional[str] = None


# ── Scenario definitions ──────────────────────────────────────────────────────

_SCENARIOS: dict[str, dict] = {
    "typical": {
        "device": 88, "context": 85, "identity": 90,
        "signals": [
            {"signal": "firewall_enabled",     "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "antivirus_enabled",    "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "disk_encryption",      "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "screen_lock",          "passed": True,  "points": 10, "max": 10, "module": "device_posture"},
            {"signal": "os_supported",         "passed": True,  "points": 10, "max": 10, "module": "device_posture"},
            {"signal": "account_enabled",      "passed": True,  "points": 25, "max": 25, "module": "identity"},
            {"signal": "mfa_registered",       "passed": True,  "points": 25, "max": 25, "module": "identity"},
            {"signal": "user_type_member",     "passed": True,  "points": 15, "max": 15, "module": "identity"},
            {"signal": "known_device",         "passed": True,  "points": 20, "max": 20, "module": "context"},
            {"signal": "normal_time",          "passed": True,  "points": 15, "max": 15, "module": "context"},
            {"signal": "no_failed_login",      "passed": True,  "points": 20, "max": 20, "module": "context"},
        ],
    },
    "mfa_missing": {
        "device": 88, "context": 80, "identity": 40,
        "signals": [
            {"signal": "firewall_enabled",     "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "antivirus_enabled",    "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "disk_encryption",      "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "account_enabled",      "passed": True,  "points": 25, "max": 25, "module": "identity"},
            {"signal": "mfa_registered",       "passed": False, "points":  0, "max": 25, "module": "identity"},
            {"signal": "user_type_member",     "passed": True,  "points": 15, "max": 15, "module": "identity"},
            {"signal": "known_device",         "passed": True,  "points": 20, "max": 20, "module": "context"},
            {"signal": "normal_time",          "passed": True,  "points": 15, "max": 15, "module": "context"},
            {"signal": "no_failed_login",      "passed": True,  "points": 20, "max": 20, "module": "context"},
        ],
    },
    "unhealthy_device": {
        "device": 30, "context": 70, "identity": 85,
        "signals": [
            {"signal": "firewall_enabled",     "passed": False, "points":  0, "max": 15, "module": "device_posture"},
            {"signal": "antivirus_enabled",    "passed": False, "points":  0, "max": 15, "module": "device_posture"},
            {"signal": "disk_encryption",      "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "screen_lock",          "passed": False, "points":  0, "max": 10, "module": "device_posture"},
            {"signal": "os_supported",         "passed": True,  "points": 10, "max": 10, "module": "device_posture"},
            {"signal": "account_enabled",      "passed": True,  "points": 25, "max": 25, "module": "identity"},
            {"signal": "mfa_registered",       "passed": True,  "points": 25, "max": 25, "module": "identity"},
            {"signal": "known_device",         "passed": True,  "points": 20, "max": 20, "module": "context"},
            {"signal": "normal_time",          "passed": True,  "points": 15, "max": 15, "module": "context"},
            {"signal": "no_failed_login",      "passed": False, "points":  0, "max": 20, "module": "context"},
        ],
    },
    "off_hours": {
        "device": 85, "context": 45, "identity": 85,
        "signals": [
            {"signal": "firewall_enabled",     "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "antivirus_enabled",    "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "disk_encryption",      "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "account_enabled",      "passed": True,  "points": 25, "max": 25, "module": "identity"},
            {"signal": "mfa_registered",       "passed": True,  "points": 25, "max": 25, "module": "identity"},
            {"signal": "known_device",         "passed": True,  "points": 20, "max": 20, "module": "context"},
            {"signal": "normal_time",          "passed": False, "points":  0, "max": 15, "module": "context"},
            {"signal": "no_failed_login",      "passed": True,  "points": 20, "max": 20, "module": "context"},
            {"signal": "normal_ip",            "passed": False, "points":  0, "max": 15, "module": "context"},
        ],
    },
    "failed_logins": {
        "device": 85, "context": 55, "identity": 70,
        "signals": [
            {"signal": "firewall_enabled",     "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "antivirus_enabled",    "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "disk_encryption",      "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "account_enabled",      "passed": True,  "points": 25, "max": 25, "module": "identity"},
            {"signal": "mfa_registered",       "passed": True,  "points": 25, "max": 25, "module": "identity"},
            {"signal": "low_failed_login",     "passed": False, "points":  0, "max": 10, "module": "identity"},
            {"signal": "known_device",         "passed": True,  "points": 20, "max": 20, "module": "context"},
            {"signal": "normal_time",          "passed": True,  "points": 15, "max": 15, "module": "context"},
            {"signal": "no_failed_login",      "passed": False, "points":  0, "max": 20, "module": "context"},
        ],
    },
    "guest_user": {
        "device": 60, "context": 75, "identity": 50,
        "signals": [
            {"signal": "firewall_enabled",     "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "antivirus_enabled",    "passed": False, "points":  0, "max": 15, "module": "device_posture"},
            {"signal": "disk_encryption",      "passed": True,  "points": 15, "max": 15, "module": "device_posture"},
            {"signal": "account_enabled",      "passed": True,  "points": 25, "max": 25, "module": "identity"},
            {"signal": "mfa_registered",       "passed": False, "points":  0, "max": 25, "module": "identity"},
            {"signal": "user_type_member",     "passed": False, "points":  0, "max": 15, "module": "identity"},
            {"signal": "known_device",         "passed": False, "points":  0, "max": 20, "module": "context"},
            {"signal": "normal_time",          "passed": True,  "points": 15, "max": 15, "module": "context"},
            {"signal": "no_failed_login",      "passed": True,  "points": 20, "max": 20, "module": "context"},
            {"signal": "normal_ip",            "passed": True,  "points": 15, "max": 15, "module": "context"},
        ],
    },
}

_DEFAULT_WEIGHTS = {"device_posture": 40, "context_analysis": 30, "trust_scoring_engine": 30}
_DEFAULT_THRESHOLD = 60


# ── POST /api/policies/simulate ───────────────────────────────────────────────

@router.post("/policies/simulate")
def simulate_policy(
    payload: SimulateRequest,
    current_user: User = Depends(get_current_user),
) -> Any:
    """Simulate a policy evaluation using a named scenario.

    Returns per-module scores, final trust score, and access decision.
    This endpoint always responds — no DB writes.
    """
    scen = _SCENARIOS.get(payload.scenario, _SCENARIOS["typical"])
    weights = payload.weights or _DEFAULT_WEIGHTS
    threshold = payload.threshold if payload.threshold is not None else _DEFAULT_THRESHOLD

    w_device   = weights.get("device_posture",      40) / 100
    w_context  = weights.get("context_analysis",    30) / 100
    w_identity = weights.get("trust_scoring_engine", 30) / 100

    device_score   = scen["device"]
    context_score  = scen["context"]
    identity_score = scen["identity"]

    final = round(
        device_score   * w_device
        + context_score  * w_context
        + identity_score * w_identity,
        1,
    )

    return {
        "scenario": payload.scenario,
        "device_posture_score": device_score,
        "context_score":        context_score,
        "identity_score":       identity_score,
        "final_score":          final,
        "decision":             "ALLOW" if final >= threshold else "DENY",
        "threshold":            threshold,
        "weights":              weights,
        "breakdown":            scen["signals"],
    }


# ── POST /api/evaluate-access ─────────────────────────────────────────────────

@router.post("/evaluate-access")
def evaluate_access(
    payload: EvaluateRequest,
    current_user: User = Depends(get_current_user),
) -> Any:
    """Evaluate access for the calling user against a resource.

    Uses 'typical' scenario scores as baseline — in a production system
    this would pull live posture / context / identity signals.
    """
    scen = _SCENARIOS["typical"]
    final = round(
        scen["device"]   * 0.40
        + scen["context"]  * 0.30
        + scen["identity"] * 0.30,
        1,
    )
    return {
        "user_id":         str(current_user.user_id),
        "resource_id":     payload.resource_id,
        "device_posture_score": scen["device"],
        "context_score":        scen["context"],
        "identity_score":       scen["identity"],
        "final_score":          final,
        "decision":             "ALLOW" if final >= _DEFAULT_THRESHOLD else "DENY",
        "threshold":            _DEFAULT_THRESHOLD,
    }
