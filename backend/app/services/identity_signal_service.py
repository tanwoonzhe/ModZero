"""Identity Signal Module — scoring across local and Entra signals.

Local signals (always evaluated):
  Recent Login             15  — authenticated recently (JWT proves it)
  Low Failed Login Count   25  — no excessive failed login attempts (assumed clean for local)
  Not Locked               10  — account not locked (assumed for local)
  Local subtotal           50

Entra-only signals (only when Entra is enabled and Graph returns a value):
  Account Enabled          30  — verified against Azure AD accountEnabled field
  Role Valid               20  — user has a recognised Entra role (reserved; currently N/A)
  MFA Registered           25  — MFA method registered in Entra
  Identity Risk Low        20  — Entra Identity Protection risk level
  Conditional Access OK    15  — compliant with Conditional Access policies

Scoring:
  identity_score = min(100, earned / 100 * 100)
  Local-only users: max 50/100 = 50% (honest — only 3 signals verifiable without Graph)
  Entra-linked users: up to 100% when account_enabled + role_valid both pass from Graph
"""
from __future__ import annotations

import datetime
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..models import User

# ── Signal weights ─────────────────────────────────────────────────────────────

# Local signals — always evaluated (3 signals, max 50 pts)
_SIGNALS = [
    {"signal": "recent_login",         "max": 15},
    {"signal": "low_failed_logins",    "max": 25},
    {"signal": "not_locked",           "max": 10},
]

# Entra (Microsoft Graph) signals — only scored when Entra is enabled and Graph
# returns a usable value. account_enabled and role_valid are the "core" Entra
# identity checks (max 50 pts); mfa/risk/ca are bonus signals (max 60 pts extra).
# All are N/A (None) for local-only users — excluded from both earned pts and denominator.
_AZURE_SIGNALS = [
    {"signal": "account_enabled",       "max": 30},  # moved from local — only meaningful from Graph
    {"signal": "role_valid",            "max": 20},  # moved from local — only meaningful from Graph
    {"signal": "mfa_registered",        "max": 25},
    {"signal": "identity_risk_low",     "max": 20},
    {"signal": "conditional_access_ok", "max": 15},
]

# Fixed denominator = original 100-pt budget (sum of all 5 original signals).
# Using a fixed denominator (not just applicable signals) ensures local-only users
# score 50/100 = 50% instead of 100%, making the identity score meaningful.
TOTAL_MAX = 100


# ── Public API ─────────────────────────────────────────────────────────────────

class IdentitySignals:
    """Data container for identity signals of a single user."""

    def __init__(
        self,
        *,
        # Local signals (always available when user is authenticated)
        recent_login: Optional[bool] = None,
        failed_login_count: int = 0,
        not_locked: bool = True,
        source: str = "local",
        # Entra-only signals (None = N/A — not evaluated for local-only users)
        account_enabled: Optional[bool] = None,   # from Graph accountEnabled
        role_valid: Optional[bool] = None,         # reserved; currently always None
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


def score_identity_signals(
    signals: IdentitySignals,
    include_azure: bool = False,
    na_reasons: Optional[dict] = None,
) -> tuple[float, list[dict]]:
    """Compute identity score (0–100) and per-signal breakdown.

    Uses a fixed denominator of TOTAL_MAX (100) so local-only users score 50/100 = 50%
    instead of 100%, reflecting the honest limit of what local auth can verify.
    Entra-linked users can reach 100% once account_enabled and role_valid are confirmed
    by Graph. Extra Entra bonus signals (mfa, risk, ca) allow recovery of points if
    some signals fail, but the score is capped at 100.

    na_reasons: optional {signal: "not_configured"} from the Entra overlay so the UI
    can tell a benign "not configured in Entra" apart from a transient collection miss.
    """
    na_reasons = na_reasons or {}
    low_failed = signals.failed_login_count < 5

    signal_values: dict[str, Optional[bool]] = {
        "recent_login":      signals.recent_login,
        "low_failed_logins": low_failed,
        "not_locked":        signals.not_locked,
    }
    azure_values: dict[str, Optional[bool]] = {
        "account_enabled":       signals.account_enabled,
        "role_valid":            signals.role_valid,
        "mfa_registered":        signals.azure_mfa_registered,
        "identity_risk_low":     signals.azure_identity_risk_low,
        "conditional_access_ok": signals.azure_conditional_access_ok,
    }

    earned = 0
    breakdown: list[dict] = []

    def _emit(sig: str, max_pts: int, val: Optional[bool], source: str) -> None:
        nonlocal earned
        if val is None:
            reason = na_reasons.get(sig, "not_collected" if source == "entra" else "not_applicable")
            note = "not configured in Entra" if reason == "not_configured" else "N/A — requires Entra"
            breakdown.append({
                "signal": sig, "passed": None, "points": 0, "max": max_pts,
                "module": "identity", "source": source,
                "status": reason, "note": note,
            })
            return
        passed = bool(val)
        pts = max_pts if passed else 0
        earned += pts
        entry: dict = {
            "signal": sig, "passed": passed, "points": pts, "max": max_pts,
            "module": "identity", "source": source,
        }
        if source == "local" and sig == "not_locked" and passed:
            entry["note"] = "local auth — no lock mechanism, assumed unlocked"
        elif source == "local" and sig == "recent_login" and passed:
            entry["note"] = "local auth — verified by active JWT"
        elif source == "local" and sig == "low_failed_logins" and passed:
            entry["note"] = "local auth — no failure tracking, assumed clean"
        breakdown.append(entry)

    # Local signals (recent_login, low_failed_logins, not_locked) — always evaluated
    for item in _SIGNALS:
        _emit(item["signal"], item["max"], signal_values.get(item["signal"]), signals.source)

    # Entra signals (account_enabled, role_valid, mfa, risk, ca) — only when Entra active.
    # N/A entries are still emitted for display when include_azure=True but Graph returned None.
    for item in (_AZURE_SIGNALS if include_azure else []):
        _emit(item["signal"], item["max"], azure_values.get(item["signal"]), "entra")

    # Fixed denominator = 100 (original 5-signal budget).
    # Local users earn ≤50 pts → score ≤50%. Entra users can reach 100%.
    identity_score = round(min(100.0, earned / TOTAL_MAX * 100), 1)
    return identity_score, breakdown


def signals_from_local_user(user: "User") -> IdentitySignals:
    """Build IdentitySignals from a local ModZero User record.

    account_enabled and role_valid are intentionally left as None (N/A).
    These are now Entra-only signals — local auth cannot independently verify
    account status or role validity against a real directory. They become
    meaningful only when Entra is connected and Graph is queried.

    Local signals that can be evaluated:
    - recent_login = True  (just sent an authenticated request via JWT)
    - failed_login_count = 0  (no per-user failure tracking in local DB — assumed clean)
    - not_locked = True  (no account-lock field in local User model — assumed unlocked)
    """
    return IdentitySignals(
        recent_login=True,
        failed_login_count=0,
        not_locked=True,
        source="local",
    )


def get_mock_identity_signals(user: "User") -> IdentitySignals:
    """Mock identity signals — same as local since GRAPH_MODE=mock means no Graph."""
    return signals_from_local_user(user)
