"""Centralized Microsoft Graph → trust-signal mapping (Entra integration).

This is the SINGLE place that turns live Microsoft Graph data into the optional
identity / device / context signals consumed by the scoring engine. It is only
invoked when the admin has enabled Entra (TrustPolicyConfig.entra_enabled) and a
Graph connection is available.

Design rules (must hold):
  * **N/A-safe**: every signal is either an explicit ``True`` / ``False`` (Graph
    returned a usable value) or ``None`` (unknown / field absent / not matched /
    Graph error). ``None`` signals are excluded from scoring entirely, so they
    never reward or penalise. With Entra OFF, none of this runs and scoring is
    identical to before.
  * **No hardcoded assumptions**: a signal becomes a concrete bool only when the
    underlying Graph field is actually present. Fields that have no reliable
    Graph source (e.g. account lockout) are simply never produced here.
  * **Explicit-negative only for the hard gate**: ``account_enabled`` is reported
    as ``False`` only when Graph explicitly returns ``accountEnabled == False``.
  * **Best-effort**: every Graph call is wrapped; this module never raises.

All Graph access goes through the existing ``azure_service`` singleton so the
HTTP/permission handling lives in one place.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional, TYPE_CHECKING

from ..azure_service import azure_service

if TYPE_CHECKING:
    from ..models import Device, User

log = logging.getLogger(__name__)


@dataclass
class AzureSignals:
    """Resolved Entra signals for one (user, device). Missing → None (N/A)."""

    # Identity
    account_enabled:        Optional[bool] = None   # hard-gate input (explicit False only)
    role_valid:             Optional[bool] = None    # reserved; left None unless resolvable
    mfa_registered:         Optional[bool] = None
    identity_risk_low:      Optional[bool] = None
    conditional_access_ok:  Optional[bool] = None

    # Device
    entra_registered:       Optional[bool] = None
    intune_managed:         Optional[bool] = None
    intune_encrypted:       Optional[bool] = None

    # Context
    signin_risk_low:        Optional[bool] = None
    trusted_location:       Optional[bool] = None

    # Diagnostics (not scored)
    matched_entra_device:   Optional[str] = None
    matched_intune_device:  Optional[str] = None
    notes:                  list[str] = field(default_factory=list)

    def identity_kwargs(self) -> dict:
        """Scored identity signals for IdentitySignals(...). account_enabled is
        intentionally excluded — it feeds the hard gate, not the score."""
        return {
            "azure_mfa_registered":        self.mfa_registered,
            "azure_identity_risk_low":     self.identity_risk_low,
            "azure_conditional_access_ok": self.conditional_access_ok,
        }

    def device_overrides(self) -> dict:
        """Extra posture factors keyed by factor name (None values are skipped upstream)."""
        return {
            "entra_registered": self.entra_registered,
            "intune_managed":   self.intune_managed,
            "intune_encrypted": self.intune_encrypted,
        }

    def context_kwargs(self) -> dict:
        return {
            "signin_risk_low":  self.signin_risk_low,
            "trusted_location": self.trusted_location,
        }


# ── helpers ────────────────────────────────────────────────────────────────────

def _user_principal(user: "User") -> Optional[str]:
    """Best identifier to match a local user against Entra (UPN / email)."""
    linked = getattr(user, "linked_entra_upn", None)
    if linked:
        return linked.lower()
    for attr in ("email", "username"):
        val = getattr(user, attr, None)
        if val and "@" in str(val):
            return str(val).lower()
    return getattr(user, "username", None)


def _match_azure_user(user: "User") -> Optional[dict]:
    """Find the Entra user record matching this local user. None on miss/error."""
    principal = _user_principal(user)
    if not principal:
        return None
    try:
        for u in azure_service.get_users(top=999):
            upn = (u.get("userPrincipalName") or "").lower()
            mail = (u.get("mail") or "").lower()
            if principal in (upn, mail):
                return u
    except Exception as exc:  # noqa: BLE001
        log.warning("Entra user match failed for %s: %s", principal, exc)
    return None


def _match_entra_device(hostname: Optional[str]) -> Optional[dict]:
    if not hostname:
        return None
    try:
        for d in azure_service.get_entra_devices(top=999):
            if (d.get("displayName") or "").lower() == hostname.lower():
                return d
    except Exception as exc:  # noqa: BLE001
        log.warning("Entra device match failed for %s: %s", hostname, exc)
    return None


def _match_intune_device(hostname: Optional[str]) -> Optional[dict]:
    if not hostname:
        return None
    try:
        for d in azure_service.get_managed_devices(top=999):
            if (d.get("deviceName") or "").lower() == hostname.lower():
                return d
    except Exception as exc:  # noqa: BLE001
        log.warning("Intune device match failed for %s: %s", hostname, exc)
    return None


def _explicit_bool(value: Any) -> Optional[bool]:
    """Return a bool only if the value is a real bool; otherwise None (unknown)."""
    return value if isinstance(value, bool) else None


# ── public entry point ─────────────────────────────────────────────────────────

def collect_azure_signals(user: "User", device: Optional["Device"]) -> AzureSignals:
    """Resolve all Entra signals for one (user, device). Never raises."""
    sig = AzureSignals()

    # ── Identity ──────────────────────────────────────────────────────────────
    azure_user = _match_azure_user(user)
    if azure_user is not None:
        sig.account_enabled = _explicit_bool(azure_user.get("accountEnabled"))
        uid = azure_user.get("id")

        # MFA registration
        try:
            if uid:
                mfa = azure_service.get_user_auth_methods(uid)
                sig.mfa_registered = _explicit_bool(mfa.get("mfa_registered"))
        except Exception as exc:  # noqa: BLE001
            log.warning("MFA lookup failed: %s", exc)

        # Identity Protection risk
        try:
            risky = azure_service.get_risky_users()
            upn = (azure_user.get("userPrincipalName") or "").lower()
            match = next(
                (r for r in risky if (r.get("userPrincipalName") or "").lower() == upn),
                None,
            )
            if match is None:
                # Risk endpoint returned a list and this user is not flagged → low risk.
                sig.identity_risk_low = True
            else:
                level = (match.get("riskLevel") or "").lower()
                sig.identity_risk_low = level in ("none", "low", "")
        except Exception as exc:  # noqa: BLE001
            log.warning("Risky-user lookup failed: %s", exc)

        # Conditional Access + sign-in risk + location from latest sign-in
        try:
            logs = azure_service.get_sign_in_logs(top=50)
            upn = (azure_user.get("userPrincipalName") or "").lower()
            latest = next(
                (lg for lg in logs if (lg.get("userPrincipalName") or "").lower() == upn),
                None,
            )
            if latest is not None:
                ca = (latest.get("conditionalAccessStatus") or "").lower()
                if ca == "success":
                    sig.conditional_access_ok = True
                elif ca == "failure":
                    sig.conditional_access_ok = False
                # "notApplied"/unknown → leave None

                risk = (latest.get("riskLevelDuringSignIn") or "").lower()
                if risk in ("none", "low", "hidden", ""):
                    sig.signin_risk_low = True
                elif risk in ("medium", "high"):
                    sig.signin_risk_low = False

                # Trusted location only if Graph explicitly marks a trusted named location.
                loc = latest.get("networkLocationDetails")
                if isinstance(loc, list) and loc:
                    types = {t for d in loc for t in (d.get("networkType") or "").split(",") if t}
                    if types:
                        sig.trusted_location = "trustedNamedLocation" in types
                # else: no named-location data → N/A (never a fail)
        except Exception as exc:  # noqa: BLE001
            log.warning("Sign-in log lookup failed: %s", exc)
    else:
        sig.notes.append("user not found in Entra")

    # ── Device ────────────────────────────────────────────────────────────────
    hostname = getattr(device, "device_name", None) if device else None
    entra_dev = _match_entra_device(hostname)
    intune_dev = _match_intune_device(hostname)

    if entra_dev is not None:
        sig.entra_registered = True
        sig.matched_entra_device = entra_dev.get("id")
    elif hostname:
        # We were able to query but found no match → explicitly not registered.
        # Only assert False when the directory was actually reachable.
        try:
            _ = azure_service.get_entra_devices(top=1)  # connectivity probe
            sig.entra_registered = False
        except Exception:
            sig.entra_registered = None

    if intune_dev is not None:
        sig.intune_managed = True
        sig.matched_intune_device = intune_dev.get("id")
        sig.intune_encrypted = _explicit_bool(intune_dev.get("isEncrypted"))
    elif hostname:
        try:
            _ = azure_service.get_managed_devices(top=1)
            sig.intune_managed = False
        except Exception:
            sig.intune_managed = None

    if hostname is None:
        sig.notes.append("no device hostname to match")

    return sig


# ── Identity hard gate ──────────────────────────────────────────────────────────
# Cached so the (per proxied request) introspect path does not call Graph every
# time. Keyed by user principal. Returns a deny reason only on an EXPLICIT Graph
# negative; unknown / unmatched / error → None (no gate).
_GATE_TTL = 120  # seconds
_gate_cache: dict = {}


def hard_gate_reason(user: "User") -> Optional[str]:
    """Return a deny reason when Graph explicitly says the account is invalid.

    * ``accountEnabled == False`` → ``"account_disabled"``.
    Anything else (unknown / not found / Graph error) → ``None`` (no gate), so a
    transient Graph problem can never lock everyone out.
    """
    principal = _user_principal(user)
    if not principal:
        return None
    now = time.time()
    hit = _gate_cache.get(principal)
    if hit is not None and (now - hit[0]) < _GATE_TTL:
        return hit[1]

    reason: Optional[str] = None
    try:
        azure_user = _match_azure_user(user)
        if azure_user is not None and azure_user.get("accountEnabled") is False:
            reason = "account_disabled"
    except Exception as exc:  # noqa: BLE001
        log.warning("Hard-gate lookup failed for %s: %s", principal, exc)
        reason = None

    _gate_cache[principal] = (now, reason)
    return reason
