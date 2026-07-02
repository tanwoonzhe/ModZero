"""Identity Signal Module — scoring across local and Entra signals.

Which signals exist, their point values, whether they're enabled, and what
happens when one fails are all read from the signal_rules table (admin
editable via /api/signal-rules) — this module only supplies the fallback
defaults used if a rule row is somehow missing. See services/signal_rules.py.

Local signals (always evaluated, backed by real per-user account data —
no hardcoded always-pass stubs):
  Low Failed Login Count      15  — User.failed_login_count < MAX_FAILED_LOGIN_ATTEMPTS
  Not Locked                  10  — User.locked_until is unset or in the past
  Entra Linked                10  — User.linked_entra_upn is set
  Password Changed Recently   15  — password changed within PASSWORD_MAX_AGE_DAYS
  Local subtotal               50

Entra-only signals (only when Entra is enabled and Graph returns a value):
  Account Enabled          30  — verified against Azure AD accountEnabled field
  Role Valid                20  — user belongs to a qualifying Entra group/role
                                  (admin-configurable; any membership by default)
  MFA Registered            25  — MFA method registered in Entra
  Identity Risk Low         20  — Entra Identity Protection risk level
  Conditional Access OK     15  — compliant with Conditional Access policies

Scoring:
  identity_score = min(100, earned / 100 * 100)
  Local-only users: max 50/100 = 50% (honest — only local-DB signals verifiable without Graph)
  Entra-linked users: up to 100% when all Entra signals pass
"""
from __future__ import annotations

import datetime
from typing import Optional, TYPE_CHECKING

from ..security import MAX_FAILED_LOGIN_ATTEMPTS, PASSWORD_MAX_AGE_DAYS
from .signal_rules import resolve_rule

if TYPE_CHECKING:
    from ..models import User

# ── Signal weights (fallback defaults; see signal_rules table) ─────────────────

_SIGNALS = [
    {"signal": "low_failed_logins",         "max": 15},
    {"signal": "not_locked",                "max": 10},
    {"signal": "entra_linked",              "max": 10},
    {"signal": "password_changed_recently", "max": 15},
]

_AZURE_SIGNALS = [
    {"signal": "account_enabled",       "max": 30},
    {"signal": "role_valid",            "max": 20},
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
        # Local signals — sourced from the real User row, always available
        failed_login_count: int = 0,
        locked: bool = False,
        entra_linked: bool = False,
        password_age_days: Optional[int] = None,
        source: str = "local",
        # Entra-only signals (None = N/A — not evaluated when Entra is off or unmatched)
        account_enabled: Optional[bool] = None,
        role_valid: Optional[bool] = None,
        azure_mfa_registered: Optional[bool] = None,
        azure_identity_risk_low: Optional[bool] = None,
        azure_conditional_access_ok: Optional[bool] = None,
    ) -> None:
        self.failed_login_count = failed_login_count
        self.locked = locked
        self.entra_linked = entra_linked
        self.password_age_days = password_age_days
        self.source = source
        self.account_enabled = account_enabled
        self.role_valid = role_valid
        self.azure_mfa_registered = azure_mfa_registered
        self.azure_identity_risk_low = azure_identity_risk_low
        self.azure_conditional_access_ok = azure_conditional_access_ok


def score_identity_signals(
    signals: IdentitySignals,
    include_azure: bool = False,
    na_reasons: Optional[dict] = None,
    rules: Optional[dict] = None,
) -> tuple[float, list[dict], list[dict]]:
    """Compute identity score (0–100), per-signal breakdown, and hard-fail signals.

    Uses a fixed denominator of TOTAL_MAX (100) so local-only users score 50/100 = 50%
    instead of 100%, reflecting the honest limit of what local auth can verify.
    Entra-linked users can reach 100% once all Entra signals are confirmed by Graph.

    rules: {signal_key: SignalRule} for module="identity" (from
    signal_rules.get_signal_rules). A disabled rule excludes that signal
    entirely. Missing rows fall back to the shipped defaults.

    na_reasons: optional {signal: "not_configured"} from the Entra overlay so the UI
    can tell a benign "not configured in Entra" apart from a transient collection miss.

    hard_fails: [{module, signal, label, failure_action}] for every FAILED
    (not N/A) signal whose rule has failure_action != reduce_score.
    """
    na_reasons = na_reasons or {}
    low_failed = signals.failed_login_count < MAX_FAILED_LOGIN_ATTEMPTS
    not_locked = not signals.locked
    password_recent: Optional[bool] = None
    if signals.password_age_days is not None:
        password_recent = signals.password_age_days <= PASSWORD_MAX_AGE_DAYS

    signal_values: dict[str, Optional[bool]] = {
        "low_failed_logins":         low_failed,
        "not_locked":                not_locked,
        "entra_linked":              signals.entra_linked,
        "password_changed_recently": password_recent,
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
    hard_fails: list[dict] = []

    def _local_note(sig: str, passed: bool) -> Optional[str]:
        if sig == "low_failed_logins":
            return f"{signals.failed_login_count} failed attempt(s) in the current window (limit {MAX_FAILED_LOGIN_ATTEMPTS})"
        if sig == "not_locked":
            return "account is currently locked" if not passed else "not currently locked"
        if sig == "entra_linked":
            return "linked to an Entra account" if passed else "no Entra account linked — link one in Users → Entra Users"
        if sig == "password_changed_recently":
            return f"password last changed {signals.password_age_days} day(s) ago (limit {PASSWORD_MAX_AGE_DAYS})"
        return None

    def _emit(sig: str, default_max: int, val: Optional[bool], source: str) -> None:
        nonlocal earned
        enabled, max_pts, failure_action = resolve_rule(rules, sig, default_max)
        if not enabled:
            breakdown.append({
                "signal": sig, "passed": None, "points": 0, "max": max_pts,
                "module": "identity", "source": source,
                "status": "disabled", "note": "disabled by policy",
            })
            return
        if val is None:
            if source == "local":
                reason = "not_collected"
                note = "password change date unknown for this account" if sig == "password_changed_recently" else "unable to determine"
            else:
                reason = na_reasons.get(sig, "not_collected")
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
        if source == "local":
            note = _local_note(sig, passed)
            if note:
                entry["note"] = note
        breakdown.append(entry)
        if not passed and failure_action != "reduce_score":
            hard_fails.append({
                "module": "identity", "signal": sig, "label": sig,
                "failure_action": failure_action,
            })

    # Local signals — always evaluated against the real User row
    for item in _SIGNALS:
        _emit(item["signal"], item["max"], signal_values.get(item["signal"]), signals.source)

    # Entra signals (account_enabled, role_valid, mfa, risk, ca) — only when Entra active.
    # N/A entries are still emitted for display when include_azure=True but Graph returned None.
    for item in (_AZURE_SIGNALS if include_azure else []):
        _emit(item["signal"], item["max"], azure_values.get(item["signal"]), "entra")

    # Fixed denominator = 100 (original 5-signal budget).
    # Local users earn ≤50 pts → score ≤50%. Entra users can reach 100%.
    identity_score = round(min(100.0, earned / TOTAL_MAX * 100), 1)
    return identity_score, breakdown, hard_fails


def signals_from_local_user(user: "User") -> IdentitySignals:
    """Build IdentitySignals from a real local ModZero User record.

    All four local signals now read genuine per-user state instead of
    hardcoded always-pass values:
    - failed_login_count comes from User.failed_login_count, incremented on
      every failed login and reset on success (see routers/auth.py).
    - locked reflects User.locked_until — set automatically after
      MAX_FAILED_LOGIN_ATTEMPTS failures, or manually by an admin.
    - entra_linked is True when the user has a linked Entra account
      (User.linked_entra_upn).
    - password_age_days is derived from User.password_changed_at.
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    locked_until = getattr(user, "locked_until", None)
    locked = False
    if locked_until is not None:
        lu = locked_until
        if lu.tzinfo is None:
            lu = lu.replace(tzinfo=datetime.timezone.utc)
        locked = lu > now

    password_changed_at = getattr(user, "password_changed_at", None)
    password_age_days: Optional[int] = None
    if password_changed_at is not None:
        pca = password_changed_at
        if pca.tzinfo is None:
            pca = pca.replace(tzinfo=datetime.timezone.utc)
        password_age_days = (now - pca).days

    return IdentitySignals(
        failed_login_count=getattr(user, "failed_login_count", 0) or 0,
        locked=locked,
        entra_linked=bool(getattr(user, "linked_entra_upn", None)),
        password_age_days=password_age_days,
        source="local",
    )


def get_mock_identity_signals(user: "User") -> IdentitySignals:
    """Mock identity signals — same as local since GRAPH_MODE=mock means no Graph."""
    return signals_from_local_user(user)
