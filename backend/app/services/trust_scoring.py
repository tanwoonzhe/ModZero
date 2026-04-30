"""Server-side trust scoring.

The desktop client collects raw device posture signals and submits them
in a signed PosturePayload. The backend, NOT the client, computes the
final trust score from these signals — clients can never set the score
directly. This is the single most important security boundary in the
ModZero gate flow.

Phase 1 uses a fixed weighted formula. Future work (Phase 3) replaces
this with anomaly detection / ML-based scoring.
"""
from __future__ import annotations

from typing import Any, Mapping


# Each signal contributes its weight to the score iff "good".
# The maximum possible score is the sum of all weights = 100.
_SIGNAL_WEIGHTS: dict[str, int] = {
    "disk_encrypted": 25,
    "screen_lock_enabled": 15,
    "av_present": 15,
    "os_supported": 10,      # OS not end-of-life
    "patch_recent": 15,      # last patch <= 30 days
    "dev_mode_off": 10,      # developer mode / SIP / sideload protections
    "firewall_enabled": 10,
}


def _truthy(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v > 0
    if isinstance(v, str):
        return v.strip().lower() in ("true", "yes", "on", "1", "good", "ok", "pass")
    return False


def compute_trust_score(signals: Mapping[str, Any]) -> tuple[int, dict[str, Any]]:
    """Return (score, breakdown).

    ``signals`` is a free-form dict of posture signals reported by the
    desktop client. Recognized keys are listed in ``_SIGNAL_WEIGHTS``.
    Unknown keys are ignored.

    ``breakdown`` lists each recognized signal, the value received,
    whether it counted as "good", and the weight applied. Useful for
    UI / audit display.
    """
    score = 0
    breakdown: list[dict[str, Any]] = []
    for key, weight in _SIGNAL_WEIGHTS.items():
        raw = signals.get(key) if isinstance(signals, Mapping) else None
        good = _truthy(raw)
        if good:
            score += weight
        breakdown.append({
            "signal": key,
            "value": raw,
            "good": good,
            "weight": weight,
        })
    score = max(0, min(100, int(score)))
    return score, {"breakdown": breakdown, "max": 100}
