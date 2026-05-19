"""Device posture scoring — server-side only.

The client reports raw boolean signals. The backend, not the client,
computes the final score. Clients cannot set scores directly.

Phase 1 formula
---------------
  posture_score  = (passing_factors / 5) * 100   [0–100]
  context_score  = 100.0  (placeholder — real context from network/policy later)
  total_score    = posture_score * 0.80 + context_score * 0.20
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..models import PostureReport

_FACTORS: list[str] = [
    "firewall_enabled",
    "antivirus_enabled",
    "disk_encryption_enabled",
    "os_supported",
    "intune_compliant",
]

_POINTS_PER_FACTOR: float = 20.0   # 5 factors × 20 = 100 max
_POSTURE_WEIGHT: float = 0.80
_CONTEXT_WEIGHT: float = 0.20


def score_posture(report: Any) -> tuple[float, list[dict]]:
    """Compute posture score and per-factor breakdown from a PostureReport row.

    Returns (posture_score 0–100, breakdown list).
    A None value for a factor is treated as failing (False).
    """
    passing = 0
    breakdown: list[dict] = []
    for factor in _FACTORS:
        value: bool | None = getattr(report, factor, None)
        passed = bool(value) if value is not None else False
        if passed:
            passing += 1
        breakdown.append({
            "factor": factor,
            "value": value,
            "passed": passed,
            "points": _POINTS_PER_FACTOR if passed else 0.0,
        })
    return passing * _POINTS_PER_FACTOR, breakdown


def score_context() -> float:
    """Return context score (placeholder = 100 until policy/network layer is added)."""
    return 100.0


def weighted_total(posture_score: float, context_score: float) -> float:
    """Combine posture (80%) and context (20%) into final trust score."""
    return round(posture_score * _POSTURE_WEIGHT + context_score * _CONTEXT_WEIGHT, 1)
