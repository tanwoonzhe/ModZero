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

# The signIns Graph endpoint has high, variable latency on some tenants. Cache the
# latest sign-in record per UPN so a slow/timed-out fetch falls back to the last
# good one instead of dropping the context/identity sign-in signals to N/A.
_SIGNIN_TTL = 900  # seconds (15 min)
_signin_cache: dict = {}  # upn(lower) -> (fetched_at, latest_record|None)


def _latest_signin(upn: str) -> Optional[dict]:
    """Return this user's most recent sign-in record, best-effort with caching.

    Cache is checked first; on a miss, Graph is fetched synchronously with a
    30s timeout. The client-app device-check HTTP timeout is 45s so waiting up
    to 30s here is safe. Once fetched the record is cached for 15 min so every
    subsequent device check within that window is instant.

    Confirmed on at least one real tenant: this endpoint exceeded even 20s
    (server logs: "Read timed out. (read timeout=20)"), despite querying
    top=1 filtered to a single user — data volume doesn't explain it, this
    looks like an inherent characteristic of this specific beta endpoint on
    this tenant/region. 30s is a pragmatic ceiling, not a guarantee: on a
    tenant this slow, Trusted Location (the only remaining signal derived
    from this fetch — Conditional Access OK was removed entirely) may keep
    showing "Not Configured" regardless of the timeout value. A real fix
    would move this off the synchronous device-check path entirely (a
    background refresh job reading from cache only) rather than keep
    raising this number — flagged for follow-up if the timeout keeps not
    being enough.
    """
    key = upn.lower()
    now = time.time()
    hit = _signin_cache.get(key)
    if hit is not None and (now - hit[0]) < _SIGNIN_TTL:
        return hit[1]
    try:
        logs = azure_service.get_sign_in_logs(top=1, upn=upn, timeout=30)
    except Exception as exc:  # noqa: BLE001
        log.warning("Sign-in fetch failed for %s: %s", upn, exc)
        logs = []
    if logs:
        _signin_cache[key] = (now, logs[0])
        return logs[0]
    return None




@dataclass
class AzureSignals:
    """Resolved Entra signals for one (user, device). Missing → None (N/A)."""

    # Identity
    account_enabled:        Optional[bool] = None   # hard-gate input (explicit False only)
    role_valid:             Optional[bool] = None    # reserved; left None unless resolvable
    mfa_registered:         Optional[bool] = None
    identity_risk_low:      Optional[bool] = None

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

    # Per-signal reason a value is None, so the UI can distinguish
    # "not_configured" (tenant policy absent — expected, benign) from
    # "not_collected" (transient/Graph error). Keyed by scored signal name;
    # an absent key defaults to "not_collected" downstream.
    na_reasons:             dict = field(default_factory=dict)

    def identity_kwargs(self) -> dict:
        return {
            "account_enabled":             self.account_enabled,
            "role_valid":                  self.role_valid,
            "azure_mfa_registered":        self.mfa_registered,
            "azure_identity_risk_low":     self.identity_risk_low,
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

# The bulk tenant lookups (users / Entra devices / Intune devices) are unchanged
# between rapid device checks, so cache them per-process for a short TTL. The
# first posture report after a restart warms the cache (~1-2s of Graph calls);
# every subsequent check reuses it and returns near-instantly, keeping the
# client-app device check well under its request timeout.
_BULK_TTL = 300  # seconds (5 min)
_bulk_cache: dict = {}  # key -> (fetched_at, value)


_UNSET = object()


def _cached_bulk(key: str, fetch, error_default=_UNSET):
    """Return a cached bulk Graph result, refreshing it past the TTL.

    On a fetch error the stale cached value (if any) is reused rather than
    dropped, so a transient Graph hiccup doesn't blank out matched signals.

    error_default: value returned instead of a stale value when there's no
    cache yet and the fetch failed. Defaults to [] so existing `for x in
    _cached_bulk(...)` call sites keep working unchanged. Pass None
    explicitly when the caller needs to tell "fetch failed" apart from "Graph
    returned a genuinely empty list" — e.g. risky_users: a 403 (missing
    permission) must not be read the same as "confirmed zero risky users",
    or every user silently scores a false Pass on identity/sign-in risk.
    """
    default = [] if error_default is _UNSET else error_default
    now = time.time()
    hit = _bulk_cache.get(key)
    if hit is not None and (now - hit[0]) < _BULK_TTL:
        return hit[1]
    try:
        value = fetch()
    except Exception as exc:  # noqa: BLE001
        log.warning("Bulk Graph fetch '%s' failed: %s", key, exc)
        return hit[1] if hit is not None else default
    _bulk_cache[key] = (now, value)
    return value


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


def _get_user_memberships(user_id: str) -> Optional[list]:
    """Cached fetch of a user's group/directory-role memberships.

    Returns None on Graph error (permission issue, network) so callers treat
    role_valid as N/A rather than Fail. Returns [] when Graph is reachable but
    the user genuinely has no group or role memberships.
    """
    key = f"memberships:{user_id}"
    now = time.time()
    hit = _bulk_cache.get(key)
    if hit is not None and (now - hit[0]) < _BULK_TTL:
        return hit[1]
    try:
        value = azure_service.get_user_member_of(user_id)
        _bulk_cache[key] = (now, value)
        return value
    except Exception as exc:  # noqa: BLE001
        log.warning("Membership fetch failed for %s: %s", user_id, exc)
        return hit[1] if hit is not None else None  # stale or None on error


def _match_azure_user(user: "User") -> Optional[dict]:
    """Find the Entra user record matching this local user. None on miss/error."""
    principal = _user_principal(user)
    if not principal:
        return None
    try:
        for u in _cached_bulk("users", lambda: azure_service.get_users(top=999)):
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
        for d in _cached_bulk("entra_devices", lambda: azure_service.get_entra_devices(top=999)):
            if (d.get("displayName") or "").lower() == hostname.lower():
                return d
    except Exception as exc:  # noqa: BLE001
        log.warning("Entra device match failed for %s: %s", hostname, exc)
    return None


def _match_intune_device(hostname: Optional[str]) -> Optional[dict]:
    if not hostname:
        return None
    try:
        for d in _cached_bulk("managed_devices", lambda: azure_service.get_managed_devices(top=999)):
            if (d.get("deviceName") or "").lower() == hostname.lower():
                return d
    except Exception as exc:  # noqa: BLE001
        log.warning("Intune device match failed for %s: %s", hostname, exc)
    return None


def _explicit_bool(value: Any) -> Optional[bool]:
    """Return a bool only if the value is a real bool; otherwise None (unknown)."""
    return value if isinstance(value, bool) else None


# ── public entry point ─────────────────────────────────────────────────────────

def collect_azure_signals(
    user: "User",
    device: Optional["Device"],
    valid_role_ids: Optional[list] = None,
) -> AzureSignals:
    """Resolve all Entra signals for one (user, device). Never raises.

    valid_role_ids: admin-configured list of Entra group/directory-role
    object IDs (TrustPolicyConfig.valid_role_ids). When non-empty, Role
    Valid passes only if the user belongs to one of these specific
    groups/roles. When empty/None, falls back to the original behaviour —
    any group or role membership counts.
    """
    sig = AzureSignals()

    # ── Identity ──────────────────────────────────────────────────────────────
    azure_user = _match_azure_user(user)
    if azure_user is not None:
        sig.account_enabled = _explicit_bool(azure_user.get("accountEnabled"))
        uid = azure_user.get("id")

        # Role valid: by default, any Entra group or directory-role membership
        # counts (legitimate employees always have at least one). When the
        # admin has configured a specific set of qualifying groups/roles in
        # Trust Policies, only membership in one of those counts instead.
        # None on Graph error (permission issue) → N/A rather than Fail.
        try:
            if uid:
                memberships = _get_user_memberships(uid)
                if memberships is not None:
                    if valid_role_ids:
                        member_ids = {m.get("id") for m in memberships if m.get("id")}
                        sig.role_valid = bool(member_ids & set(valid_role_ids))
                    else:
                        sig.role_valid = len(memberships) > 0
        except Exception as exc:  # noqa: BLE001
            log.warning("Role-valid lookup failed: %s", exc)

        # MFA registration
        try:
            if uid:
                mfa = _cached_bulk(f"mfa:{uid}", lambda: azure_service.get_user_auth_methods(uid))
                sig.mfa_registered = _explicit_bool((mfa or {}).get("mfa_registered"))
        except Exception as exc:  # noqa: BLE001
            log.warning("MFA lookup failed: %s", exc)

        # Identity Protection risk. error_default=None (not []) is deliberate:
        # a 403 (missing IdentityRiskyUser.Read.All) must not be read the
        # same as "Graph confirmed zero risky users" — that previously
        # produced a false Pass on identity/sign-in risk for every user,
        # every time, whenever the app registration lacked this permission.
        match = None
        risky_users_available = False
        try:
            risky = _cached_bulk("risky_users", lambda: azure_service.get_risky_users(), error_default=None)
            if risky is not None:
                risky_users_available = True
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
            else:
                sig.na_reasons["identity_risk_low"] = "not_configured"
        except Exception as exc:  # noqa: BLE001
            log.warning("Risky-user lookup failed: %s", exc)

        # Sign-in risk: derived from Identity Protection riskyUsers (already cached above).
        # The signIns beta endpoint has prohibitively high latency on some tenants
        # (consistently >15s), making it unusable for a synchronous device check.
        # riskyUsers gives equivalent signal: if the user is not flagged at all →
        # their sign-ins are low-risk. riskLevelDuringSignIn from signIns would only
        # diverge when a specific session was flagged but the user's aggregate risk
        # wasn't raised — an edge case not worth a 15s+ Graph call.
        try:
            if not risky_users_available:
                sig.na_reasons["signin_risk_low"] = "not_configured"
            elif match is None:
                sig.signin_risk_low = True   # not in risky users → low risk
            else:
                level = (match.get("riskLevel") or "").lower()
                sig.signin_risk_low = level in ("none", "low", "")
        except Exception as exc:  # noqa: BLE001
            log.warning("Sign-in risk (from riskyUsers) failed: %s", exc)

        # Trusted location from latest sign-in (best-effort, short timeout).
        # Secondary signal; if signIns is unavailable it becomes Not Configured.
        # (Conditional Access OK used to be derived from this same sign-in
        # fetch too, but was removed — conditionalAccessStatus only reflects
        # ENFORCED policies, so it never resolved on a tenant running CA in
        # Report-only mode. Not worth the added complexity for one signal.)
        try:
            upn = azure_user.get("userPrincipalName") or ""
            latest = _latest_signin(upn) if upn else None
            if latest is not None:
                loc = latest.get("networkLocationDetails")
                if isinstance(loc, list) and loc:
                    types = {t for d in loc for t in (d.get("networkType") or "").split(",") if t}
                    sig.trusted_location = "trustedNamedLocation" in types if types else None
                    if not types:
                        sig.na_reasons["trusted_location"] = "not_configured"
                else:
                    sig.na_reasons["trusted_location"] = "not_configured"
            else:
                # signIns unavailable — mark as not_configured so UI shows
                # "Not Configured" rather than the error-like "N/A".
                sig.na_reasons["trusted_location"] = "not_configured"
        except Exception as exc:  # noqa: BLE001
            log.warning("Sign-in log lookup failed: %s", exc)
            sig.na_reasons["trusted_location"] = "not_configured"
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
