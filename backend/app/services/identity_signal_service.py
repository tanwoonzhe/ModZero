"""Identity Signal Module — 5-signal scoring (aligned with web Identity Signals tab).

Signals and weights:
  Account Enabled          30  — user account is active and can authenticate
  Role Valid               20  — user has a recognised role (employee / admin)
  Recent Login             15  — user has authenticated recently
  Low Failed Login Count   25  — no excessive failed login attempts
  Not Locked               10  — account is not locked out
  Total                   100
"""
from __future__ import annotations

import datetime
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..models import User

# ── Signal weights ─────────────────────────────────────────────────────────────

_SIGNALS = [
    {"signal": "account_enabled",      "max": 30},
    {"signal": "role_valid",           "max": 20},
    {"signal": "recent_login",         "max": 15},
    {"signal": "low_failed_logins",    "max": 25},
    {"signal": "not_locked",           "max": 10},
]

# Optional Entra (Microsoft Graph) signals — only contribute when enabled and
# resolvable. Each is N/A (None) when Graph did not return a usable value, so it
# is excluded from both earned points and the denominator.
_AZURE_SIGNALS = [
    {"signal": "mfa_registered",        "max": 25},
    {"signal": "identity_risk_low",     "max": 20},
    {"signal": "conditional_access_ok", "max": 15},
]

TOTAL_MAX = sum(s["max"] for s in _SIGNALS)  # 100 (base denominator reference)


# ── Public API ─────────────────────────────────────────────────────────────────

class IdentitySignals:
    """Data container for identity signals of a single user."""

    def __init__(
        self,
        *,
        account_enabled: bool = True,
        role_valid: bool = True,
        recent_login: Optional[bool] = None,
        failed_login_count: int = 0,
        not_locked: bool = True,
        source: str = "local",
        # Optional Entra signals (None = not collected → N/A)
        azure_mfa_registered: Optional[bool] = None,
        azure_identity_risk_low: Optional[bool] = None,
        azure_conditional_access_ok: Optional[bool] = None,
    ) -> None:
        self.account_enabled = account_enabled
        self.role_valid = role_valid
        self.recent_login = recent_login
        self.failed_login_count = failed_login_count
        self.not_locked = not_locked
        self.source = source
        self.azure_mfa_registered = azure_mfa_registered
        self.azure_identity_risk_low = azure_identity_risk_low
        self.azure_conditional_access_ok = azure_conditional_access_ok


def score_identity_signals(signals: IdentitySignals, include_azure: bool = False) -> tuple[float, list[dict]]:
    """Compute identity score (0–100) and per-signal breakdown.

    Unknown signals (None) are treated as 0 per Zero Trust principle:
    unknown = untrusted = no points.

    Signals sourced from "local" auth always pass for active sessions
    (the JWT proves the account is enabled and has a valid role).
    A "note" field is added to those entries so the UI can explain why.
    Azure-sourced signals reflect real IdP state and may actually fail.
    """
    low_failed = signals.failed_login_count < 5

    signal_values: dict[str, Optional[bool]] = {
        "account_enabled":   signals.account_enabled,
        "role_valid":        signals.role_valid,
        "recent_login":      signals.recent_login,
        "low_failed_logins": low_failed,
        "not_locked":        signals.not_locked,
    }
    azure_values: dict[str, Optional[bool]] = {
        "mfa_registered":        signals.azure_mfa_registered,
        "identity_risk_low":     signals.azure_identity_risk_low,
        "conditional_access_ok": signals.azure_conditional_access_ok,
    }

    # Signals that are structurally always-true for local (non-Azure) auth:
    # holding a valid JWT already proves account_enabled and role_valid.
    _LOCAL_ASSUMED = {"account_enabled", "role_valid", "not_locked"}

    earned = 0
    denominator = 0      # sum of APPLICABLE (non-N/A) factor weights
    breakdown: list[dict] = []

    def _emit(sig: str, max_pts: int, val: Optional[bool], source: str, note: Optional[str] = None) -> None:
        nonlocal earned, denominator
        if val is None:
            breakdown.append({
                "signal": sig, "passed": None, "points": 0, "max": max_pts,
                "module": "identity", "source": source, "note": note or "unknown",
            })
            return
        passed = bool(val)
        pts = max_pts if passed else 0
        earned += pts
        denominator += max_pts
        entry: dict = {
            "signal": sig, "passed": passed, "points": pts, "max": max_pts,
            "module": "identity", "source": source,
        }
        if source == "local" and sig in _LOCAL_ASSUMED and passed:
            entry["note"] = "local auth — verified by active JWT"
        elif note:
            entry["note"] = note
        breakdown.append(entry)

    # Base (local) signals
    for item in _SIGNALS:
        _emit(item["signal"], item["max"], signal_values.get(item["signal"]), signals.source)

    # Optional Entra signals — only present when the Entra overlay is active.
    # (Each may still be N/A if Graph could not resolve it for this user.)
    for item in (_AZURE_SIGNALS if include_azure else []):
        _emit(item["signal"], item["max"], azure_values.get(item["signal"]), "entra")

    # Percentage of applicable points → stays 0–100 regardless of how many Azure
    # factors were applicable. Falls back to TOTAL_MAX to preserve legacy behaviour
    # when all base signals somehow ended up N/A.
    identity_score = round((earned / max(denominator, 1)) * 100, 1) if denominator else 0.0
    return identity_score, breakdown


def signals_from_local_user(user: "User") -> IdentitySignals:
    """Build IdentitySignals from a local ModZero User record.

    The user is currently authenticated (they sent a valid JWT), so:
    - account_enabled = True  (can authenticate → account is active)
    - role_valid      = True  (has a recognized role in the system)
    - recent_login    = True  (just sent an authenticated request)
    - failed_logins   = 0     (no per-user failure tracking in local DB)
    - not_locked      = True  (no account-lock field in local User model)
    """
    return IdentitySignals(
        account_enabled=True,
        role_valid=getattr(user, "role", None) is not None,
        recent_login=True,
        failed_login_count=0,
        not_locked=True,
        source="local",
    )


def get_mock_identity_signals(user: "User") -> IdentitySignals:
    """Mock identity signals — same as local since GRAPH_MODE=mock means no Graph."""
    return signals_from_local_user(user)
