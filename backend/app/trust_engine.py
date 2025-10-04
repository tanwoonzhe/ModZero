"""
Trust score calculation.

Combines the posture and context scores using configurable weights.
A final access decision is made by comparing the resulting total
against a minimum threshold.  The function also returns a breakdown
showing the weights and threshold used.  This modular design allows
administrators to adjust the weighting via environment variables or
policy configuration.
"""

from .settings import settings


def calculate_trust(posture_score: float, context_score: float) -> tuple[float, bool, dict]:
    """Aggregate posture and context scores into a final trust score.

    Args:
        posture_score: Score from the device posture module (0–100).
        context_score: Score from the context analysis module (0–100).

    Returns:
        A tuple of (total_score, allowed, breakdown) where:
        - total_score: Weighted sum of the inputs.
        - allowed: Boolean indicating whether the score meets the threshold.
        - breakdown: Dictionary including the weights and threshold.
    """

    w_p = settings.weight_posture
    w_c = settings.weight_context
    total = round(w_p * posture_score + w_c * context_score, 2)
    allowed = total >= settings.min_threshold
    breakdown = {
        "posture_weight": w_p,
        "context_weight": w_c,
        "threshold": settings.min_threshold,
    }
    return total, allowed, breakdown