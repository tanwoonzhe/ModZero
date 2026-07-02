"""Default SignalRule seed data.

Single source of truth for the (module, signal_key, source, label,
max_points) tuples used to populate the signal_rules table on first
deploy — imported by both the Alembic migration and db.py's idempotent
startup seeding, so the two never drift apart.

These values mirror what used to be hardcoded directly in
posture_scoring.py / identity_signal_service.py / context_analysis_service.py,
so seeding this table changes nothing about existing behaviour until an
admin edits a rule via /api/signal-rules.
"""

DEFAULT_SIGNAL_RULES: list[tuple[str, str, str, str, int]] = [
    # ── Device (local) ──
    ("device", "firewall_enabled",        "local", "Firewall Enabled",         15),
    ("device", "antivirus_enabled",       "local", "Antivirus Enabled",        15),
    ("device", "disk_encryption_enabled", "local", "Disk Encryption Enabled",  15),
    ("device", "screen_lock_enabled",     "local", "Screen Lock Enabled",      10),
    ("device", "os_supported",            "local", "OS Version Supported",     10),
    ("device", "client_healthy",          "local", "Client App Healthy",       10),
    ("device", "recent_check",            "local", "Recent Posture Check",     10),
    ("device", "intune_compliant",        "local", "Intune Compliant",         20),
    # ── Device (entra) ──
    ("device", "entra_registered",  "entra", "Entra Registered",  10),
    ("device", "intune_managed",    "entra", "Intune Managed",    10),
    ("device", "intune_encrypted",  "entra", "Intune Encrypted",  15),
    # ── Identity (local) ──
    ("identity", "low_failed_logins",         "local", "Low Failed Login Count",    15),
    ("identity", "not_locked",                "local", "Account Not Locked",        10),
    ("identity", "entra_linked",              "local", "Entra Linked",              10),
    ("identity", "password_changed_recently", "local", "Password Changed Recently", 15),
    # ── Identity (entra) ──
    ("identity", "account_enabled",       "entra", "Account Enabled",       30),
    ("identity", "role_valid",            "entra", "Role Valid",            20),
    ("identity", "mfa_registered",        "entra", "MFA Registered",        25),
    ("identity", "identity_risk_low",     "entra", "Identity Risk Low",     20),
    ("identity", "conditional_access_ok", "entra", "Conditional Access OK", 15),
    # ── Context (local) ──
    ("context", "known_device",             "local", "Known Device",                   20),
    ("context", "normal_access_time",       "local", "Normal Access Time",             15),
    ("context", "no_repeated_failed_login", "local", "No Repeated Failed Login",       20),
    ("context", "normal_ip",                "local", "Normal / Not Blocked IP",        15),
    ("context", "known_user_device_pair",   "local", "Known User-Device Pair",         15),
    ("context", "resource_pattern_normal",  "local", "Resource Access Pattern Normal", 10),
    ("context", "gateway_online",           "local", "Gateway / Resource Online",       5),
    # ── Context (entra) ──
    ("context", "signin_risk_low",  "entra", "Sign-in Risk Low",  15),
    ("context", "trusted_location", "entra", "Trusted Location",  10),
]
