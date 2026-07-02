"""Admin-configured SignalRule lookup, shared by the three scoring services.

Each scoring function (posture_scoring.score_posture,
identity_signal_service.score_identity_signals,
context_analysis_service.score_context_signals) accepts a
{signal_key: SignalRule} dict for its module instead of hardcoding which
signals exist, their point values, or what a failure does. This module is
the single place that reads that table so the three services don't each
need their own SQLAlchemy query.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from ..models import SignalRule


def get_signal_rules(db: Session, module: str) -> dict:
    """Return {signal_key: SignalRule} for one module (device/identity/context)."""
    from ..models import SignalRule
    rows = db.query(SignalRule).filter(SignalRule.module == module).all()
    return {r.signal_key: r for r in rows}


def resolve_rule(rules: Optional[dict], key: str, default_max: int) -> tuple:
    """Return (enabled, max_points, failure_action) for one signal.

    Falls back to (enabled=True, default_max, "reduce_score") when no rule
    row exists (e.g. a brand-new signal key not yet seeded) so scoring never
    breaks — it just behaves as if nothing was configured.
    """
    rule = (rules or {}).get(key)
    if rule is None:
        return True, default_max, "reduce_score"
    return bool(rule.enabled), int(rule.max_points), (rule.failure_action or "reduce_score")
