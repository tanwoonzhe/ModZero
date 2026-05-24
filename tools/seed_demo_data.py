"""
ModZero Demo Seed Script
=========================
Resets test data and prepares a clean demo environment for FYP presentation.

Uses raw SQL via psycopg2 — no backend model imports required.
Runs directly on the host machine against the Docker-hosted PostgreSQL.

Usage:
  pip install psycopg2-binary python-dotenv
  python tools/seed_demo_data.py

What it does:
  1. Deletes all ProtectedResources, ConnectorResources, Connectors,
     EnrollTokens, and AccessRequestLogs.
  2. Creates a ConnectorResource for AlphaTechs Intranet.
  3. Creates one EnrollmentToken for alphatechs-net (24h expiry).
  4. Creates three ProtectedResources:
       - AlphaTechs Intranet   (min score  60, enabled, linked connector)
       - Finance Portal        (min score 101, enabled, no connector)
       - Disabled HR Archive   (min score   0, disabled)
  5. Prints next demo steps with the enrollment token ready to paste.
"""

from __future__ import annotations

import hashlib
import os
import secrets
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── Optional: load .env from repo root ───────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("[ERROR] psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

# ── DB connection — patch Docker hostname/port for host-side runs ─────────────
# Inside Docker: host=db port=5432. From host machine: host=localhost port=5433.
_DSN = (
    os.environ.get("DATABASE_URL", "postgresql+psycopg2://postgres:012202twz@db:5432/modzero")
    .replace("postgresql+psycopg2://", "")
    .replace("@db:5432", "@localhost:5433")
    .replace("@db:", "@localhost:")  # fallback if port was omitted
)
# Parse into psycopg2 kwargs
_user, _rest = _DSN.split(":", 1)
_password, _rest = _rest.split("@", 1)
_host_port, _dbname = _rest.rsplit("/", 1)
_host, _port = (_host_port.rsplit(":", 1) if ":" in _host_port else (_host_port, "5432"))

try:
    conn = psycopg2.connect(
        host=_host, port=int(_port), dbname=_dbname,
        user=_user, password=_password,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    conn.autocommit = False
except Exception as exc:
    print(f"[ERROR] Could not connect to database: {exc}")
    sys.exit(1)

cur = conn.cursor()


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _ok(msg: str) -> None:
    print(f"  [OK]  {msg}")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Step 1: Clean ─────────────────────────────────────────────────────────────

def clean() -> None:
    print("\n[1/4] Cleaning test data...")

    # Nullify resource_id on logs (FK — must clear before deleting resources)
    cur.execute("UPDATE access_request_logs SET resource_id = NULL WHERE resource_id IS NOT NULL")
    _ok(f"Cleared resource_id on {cur.rowcount} access log(s)")

    cur.execute("DELETE FROM access_request_logs")
    _ok(f"Deleted {cur.rowcount} access request log(s)")

    # Clear connector_resource_id FK on protected_resources before deleting connector_resources
    cur.execute("UPDATE protected_resources SET connector_resource_id = NULL WHERE connector_resource_id IS NOT NULL")
    cur.execute("DELETE FROM protected_resources")
    _ok(f"Deleted {cur.rowcount} protected resource(s)")

    cur.execute("DELETE FROM policy_bindings")
    cur.execute("DELETE FROM connector_resources")
    _ok(f"Deleted {cur.rowcount} connector resource(s)")

    cur.execute("DELETE FROM connectors")
    _ok(f"Deleted {cur.rowcount} connector(s)")

    cur.execute("DELETE FROM enroll_tokens")
    _ok(f"Deleted {cur.rowcount} enrollment token(s)")

    conn.commit()


# ── Step 2: Connector resource ────────────────────────────────────────────────

def create_connector_resource() -> str:
    print("\n[2/4] Creating connector resource...")
    cr_id = str(uuid.uuid4())
    now = _now()
    cur.execute(
        """
        INSERT INTO connector_resources
          (resource_id, connector_id, network, name, protocol,
           target_host, target_port, path_prefix, is_active, created_at, updated_at)
        VALUES (%s, NULL, %s, %s, %s, %s, %s, %s, TRUE, %s, %s)
        """,
        (cr_id, "alphatechs-net", "alphatechs-intranet", "HTTP",
         "alphatechs.top", 80, "", now, now),  # protocol enum is uppercase in DB
    )
    conn.commit()
    _ok(f"ConnectorResource 'alphatechs-intranet'  id={cr_id}")
    return cr_id


# ── Step 3: Enrollment token ──────────────────────────────────────────────────

def create_enroll_token(network: str) -> str:
    print("\n[3/4] Creating enrollment token...")
    cur.execute("SELECT user_id FROM users WHERE username = 'admin' LIMIT 1")
    row = cur.fetchone()
    if not row:
        print("  [ERROR] Admin user not found.")
        sys.exit(1)
    admin_id = row["user_id"]

    token_plain = secrets.token_urlsafe(32)
    token_id = str(uuid.uuid4())
    now = _now()
    cur.execute(
        """
        INSERT INTO enroll_tokens
          (token_id, token_hash, network, status, created_by, expires_at, created_at)
        VALUES (%s, %s, %s, 'ACTIVE', %s, %s, %s)
        """,
        (token_id, _sha256(token_plain), network, admin_id,
         now + timedelta(hours=24), now),
    )
    conn.commit()
    _ok(f"EnrollToken  id={token_id}  network={network}  expires=24h")
    _ok(f"Plaintext token (shown once): {token_plain}")
    return token_plain

# ── Step 4: Protected resources ───────────────────────────────────────────────

def create_protected_resources(cr_id: str) -> None:
    print("\n[4/4] Creating demo protected resources...")
    now = _now()
    resources = [
        {
            "name": "AlphaTechs Intranet",
            "description": "Internal company intranet — requires active connector.",
            "resource_type": "web",
            "internal_address": "http://alphatechs.top",
            "public_name": "alphatechs-intranet",
            "minimum_trust_score": 60.0,
            "require_intune_compliant": False,
            "enabled": True,
            "connector_resource_id": cr_id,
        },
        {
            "name": "Finance Portal",
            "description": "Finance team portal — minimum trust score set above maximum (101) to demonstrate trust score denial.",
            "resource_type": "web",
            "internal_address": "http://finance.internal",
            "public_name": "finance-portal",
            "minimum_trust_score": 101.0,
            "require_intune_compliant": False,
            "enabled": True,
            "connector_resource_id": None,
        },
        {
            "name": "Disabled HR Archive",
            "description": "Legacy HR archive — decommissioned, access blocked.",
            "resource_type": "web",
            "internal_address": "http://hr-archive.internal",
            "public_name": "hr-archive",
            "minimum_trust_score": 0.0,
            "require_intune_compliant": False,
            "enabled": False,
            "connector_resource_id": None,
        },
    ]

    for r in resources:
        rid = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO protected_resources
              (id, name, description, resource_type, internal_address, public_name,
               required_group, minimum_trust_score, require_intune_compliant, enabled,
               connector_resource_id, created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,NULL,%s,%s,%s,%s,%s,%s)
            """,
            (rid, r["name"], r["description"], r["resource_type"],
             r["internal_address"], r["public_name"],
             r["minimum_trust_score"], r["require_intune_compliant"],
             r["enabled"], r["connector_resource_id"], now, now),
        )
        status = "ENABLED " if r["enabled"] else "DISABLED"
        conn_note = f"connector={cr_id[:8]}..." if r["connector_resource_id"] else "no connector"
        _ok(f"[{status}] '{r['name']}'  min={r['minimum_trust_score']}  {conn_note}  id={rid[:8]}...")

    conn.commit()


# ── Next steps ────────────────────────────────────────────────────────────────

def _print_next_steps(network: str, token: str) -> None:
    print("\n" + "=" * 65)
    print("  DEMO READY - Next Steps")
    print("=" * 65)
    print(f"""
1. Start the connector simulator (separate terminal, keep running):

   cd tools
   python connector_sim.py \\
     --token {token} \\
     --name alphatechs-connector \\
     --network {network} \\
     --interval 10

2. Open the Electron client app and log in:

   cd client-app && npm start

3. Submit a posture report from the client app so a trust score
   is recorded for your device.

4. Run the four verified access decision test cases:

   TEST A - Score meets minimum + connector online:
     Request access to: AlphaTechs Intranet  (min score 60)
     Connector simulator must be running.
     Expected: ALLOW

   TEST B - Score meets minimum + connector offline:
     Stop the simulator (Ctrl+C), wait ~60 s, then request access
     to: AlphaTechs Intranet  (min score 60)
     Expected: DENY  reason=Connector is offline

   TEST C - Trust score below required minimum:
     Request access to: Finance Portal  (min score 101)
     No connector check applies. Score will always be below 101.
     Expected: DENY  reason=Trust score X.X below required 101.0

   TEST D - Resource disabled:
     Request access to: Disabled HR Archive  (disabled)
     Expected: DENY  reason=Resource is disabled

5. View access decision logs in the admin dashboard:
   Admin dashboard  ->  Access Logs tab
   or: GET http://localhost:8000/api/access/logs
""")
    print("=" * 65)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    clean()
    cr_id = create_connector_resource()
    token = create_enroll_token("alphatechs-net")
    create_protected_resources(cr_id)
    _print_next_steps("alphatechs-net", token)
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
