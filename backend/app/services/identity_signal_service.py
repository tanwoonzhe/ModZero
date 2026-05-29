"""Identity Signal Module — 6-signal scoring.

Scores a user's identity based on:

  Account enabled                 25
  MFA registered                  25
  User type member (not guest)    15
  Not admin risk (no high-risk admin role) 10
  Recent successful sign-in       15
  Low failed login count          10
  Total                          100

In GRAPH_MODE=mock, signals are derived from local User record.
In GRAPH_MODE=real, signals would come from Microsoft Graph.
"""
from __future__ import annotations

import datetime
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..models import User

# ── Signal weights ─────────────────────────────────────────────────────────────

_SIGNALS = [
    {"signal": "account_enabled",        "max": 25},
    {"signal": "mfa_registered",         "max": 25},
    {"signal": "user_type_member",       "max": 15},
    {"signal": "not_admin_risk",         "max": 10},
    {"signal": "recent_successful_signin","max": 15},
    {"signal": "low_failed_login_count", "max": 10},
]


# ── Public API ─────────────────────────────────────────────────────────────────

class IdentitySignals:
    """Data container for identity signals of a single user."""

    def __init__(
        self,
        *,
        account_enabled: bool = True,
        mfa_registered: Optional[bool] = None,
        user_type: str = "member",
        is_admin: bool = False,
        recent_successful_signin: Optional[bool] = None,
        failed_login_count: int = 0,
        source: str = "local",
    ) -> None:
        self.account_enabled = account_enabled
        self.mfa_registered = mfa_registered
        self.user_type = user_type.lower()
        self.is_admin = is_admin
        self.recent_successful_signin = recent_successful_signin
        self.failed_login_count = failed_login_count
        self.source = source


def score_identity_signals(signals: IdentitySignals) -> tuple[float, list[dict]]:
    """Compute identity score (0–100) and per-signal breakdown.

    Unknown signals (None) are excluded from denominator so partial data
    doesn't unfairly penalize. A note is added to the breakdown entry.
    """
    user_type_member = signals.user_type in ("member", "employee", "admin")
    not_admin_risk   = not signals.is_admin  # Admin role = marginal risk signal
    low_failed_login = signals.failed_login_count < 5

    signal_values: dict[str, Optional[bool]] = {
        "account_enabled":         signals.account_enabled,
        "mfa_registered":          signals.mfa_registered,
        "user_type_member":        user_type_member,
        "not_admin_risk":          not_admin_risk,
        "recent_successful_signin":signals.recent_successful_signin,
        "low_failed_login_count":  low_failed_login,
    }

    earned = 0
    available_max = 0
    breakdown: list[dict] = []

    for item in _SIGNALS:
        sig    = item["signal"]
        max_pts = item["max"]
        val    = signal_values.get(sig)

        if val is None:
            breakdown.append({
                "signal": sig,
                "passed": None,
                "points": 0,
                "max":    max_pts,
                "module": "identity",
                "note":   "not configured",
            })
            continue

        passed = bool(val)
        pts    = max_pts if passed else 0
        earned += pts
        available_max += max_pts
        breakdown.append({
            "signal": sig,
            "passed": passed,
            "points": pts,
            "max":    max_pts,
            "module": "identity",
            "source": signals.source,
        })

    # Use fixed 100-pt denominator: unknown signals score 0, not excluded.
    # Zero Trust principle: unknown MFA / sign-in = not trusted.
    TOTAL_MAX = sum(item["max"] for item in _SIGNALS)  # 100
    identity_score = round((earned / TOTAL_MAX) * 100, 1)

    return identity_score, breakdown


def signals_from_local_user(user: "User") -> IdentitySignals:
    """Build IdentitySignals from a local User record (minimal data)."""
    from ..models import RoleEnum
    is_admin = getattr(user, "role", None) == RoleEnum.ADMIN
    return IdentitySignals(
        account_enabled=True,       # local users are considered active
        mfa_registered=None,        # unknown without Graph
        user_type="member",
        is_admin=is_admin,
        recent_successful_signin=None,  # unknown without Graph
        failed_login_count=0,
        source="local",
    )


def get_mock_identity_signals(user: "User") -> IdentitySignals:
    """Return mock identity signals for demo purposes (GRAPH_MODE=mock)."""
    from ..models import RoleEnum
    is_admin = getattr(user, "role", None) == RoleEnum.ADMIN
    return IdentitySignals(
        account_enabled=True,
        mfa_registered=True,      # mock: assume MFA configured
        user_type="member",
        is_admin=is_admin,
        recent_successful_signin=True,
        failed_login_count=0,
        source="mock",
    )
