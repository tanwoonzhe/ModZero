from .settings import settings

def calculate_trust(posture_score: float, context_score: float) -> tuple[float, bool, dict]:
    w_p = settings.weight_posture
    w_c = settings.weight_context
    total = round(w_p * posture_score + w_c * context_score, 2)
    allowed = total >= settings.min_threshold
    breakdown = {
        "posture_weight": w_p,
        "context_weight": w_c,
        "threshold": settings.min_threshold
    }
    return total, allowed, breakdown
