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
    ("device", "firewall_enabled",        "local", "Firewall Enabled",             15),
    ("device", "antivirus_enabled",       "local", "Antivirus Enabled",            15),
    ("device", "av_advanced_protection",  "local", "AV Advanced Protection",       10),
    ("device", "disk_encryption_enabled", "local", "Disk Encryption Enabled",      15),
    ("device", "screen_lock_enabled",     "local", "Screen Lock Enabled",          10),
    ("device", "os_supported",            "local", "OS Recently Patched",          10),
    ("device", "client_healthy",          "local", "Client Version Supported",     10),
    ("device", "intune_compliant",        "local", "Intune Compliant",             20),
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
    # ── Context (local) ──
    ("context", "normal_access_time",       "local", "Normal Access Time",       15),
    ("context", "no_repeated_failed_login", "local", "No Repeated Failed Login", 20),
    ("context", "normal_ip",                "local", "Normal / Not Blocked IP",  15),
    ("context", "trusted_network",          "local", "Trusted Network",          15),
    ("context", "network_profile_check",    "local", "Network Profile Check",    10),
    ("context", "access_frequency_check",   "local", "Access Frequency Check",   10),
    ("context", "gateway_online",           "local", "Gateway / Connector Online", 5),
    # ── Context (entra) ──
    ("context", "signin_risk_low",             "entra", "Sign-in Risk Low",             15),
    ("context", "trusted_location",            "entra", "Trusted Location",             10),
    ("context", "latest_signin_ip_match",      "entra", "Latest Sign-in IP Match",       10),
    ("context", "signin_location_consistent",  "entra", "Sign-in Location Consistent",   10),
]
