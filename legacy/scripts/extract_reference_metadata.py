#!/usr/bin/env python3
"""Extract reference metadata from local zerotrustassessment folder.

Reads TestMeta.json, Test-Assessment.<id>.md, and Test-Assessment.<id>.ps1
to build a normalised reference data file for ModZero's identity testing.

Usage:
    python scripts/extract_reference_metadata.py

Output:
    backend/app/services/identity_tests/test_reference_data.json
"""

import json
import os
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

TESTS_DIR = (
    PROJECT_ROOT
    / "zerotrustassemetment"
    / "zerotrustassessment"
    / "src"
    / "powershell"
    / "tests"
)

OUTPUT_DIR = PROJECT_ROOT / "backend" / "app" / "services" / "identity_tests"
OUTPUT_FILE = OUTPUT_DIR / "test_reference_data.json"


# ---------------------------------------------------------------------------
# Markdown parser
# ---------------------------------------------------------------------------

def parse_markdown(md_text: str) -> dict:
    """Parse a Test-Assessment markdown file into sections.

    The markdown files typically have:
    - Description paragraphs (before the first ** heading)
    - **Remediation action** section with bullet points
    - <!--- Results ---> marker (ignored)
    """
    result = {
        "description": "",
        "remediation_action": "",
    }

    # Remove the results placeholder
    md_text = re.sub(r"<!---\s*Results\s*--->.*", "", md_text, flags=re.DOTALL).strip()

    # Split on **Remediation action**
    parts = re.split(r"\*\*Remediation action\*\*\s*", md_text, maxsplit=1)

    if len(parts) >= 1:
        result["description"] = parts[0].strip()

    if len(parts) >= 2:
        result["remediation_action"] = parts[1].strip()

    return result


# ---------------------------------------------------------------------------
# PowerShell endpoint extractor
# ---------------------------------------------------------------------------

def extract_graph_endpoints(ps1_text: str) -> list:
    """Extract Graph API endpoint references from PowerShell test files.

    Looks for table references (e.g., 'from Application', 'from ServicePrincipal')
    and any Graph API URL patterns.
    """
    endpoints = set()

    # Look for SQL-like table references that map to Graph entities
    table_matches = re.findall(r"from\s+(\w+)", ps1_text, re.IGNORECASE)
    entity_map = {
        "application": "beta/applications",
        "serviceprincipal": "beta/servicePrincipals",
        "user": "v1.0/users",
        "conditionalaccesspolicy": "v1.0/identity/conditionalAccess/policies",
        "authenticationmethodsregistered": "v1.0/reports/authenticationMethods/userRegistrationDetails",
        "signins": "beta/auditLogs/signIns",
        "signin": "beta/auditLogs/signIns",
        "directoryrole": "v1.0/directoryRoles",
        "group": "v1.0/groups",
    }

    for table in table_matches:
        key = table.lower()
        if key in entity_map:
            endpoints.add(entity_map[key])

    # Also look for explicit Graph URLs
    url_matches = re.findall(r"(?:beta|v1\.0)/[\w/]+", ps1_text)
    for url in url_matches:
        endpoints.add(url)

    return sorted(endpoints)


# ---------------------------------------------------------------------------
# Main extraction
# ---------------------------------------------------------------------------

def main():
    if not TESTS_DIR.exists():
        print(f"ERROR: Tests directory not found: {TESTS_DIR}")
        sys.exit(1)

    # Load TestMeta.json
    meta_path = TESTS_DIR / "TestMeta.json"
    if not meta_path.exists():
        print(f"ERROR: TestMeta.json not found: {meta_path}")
        sys.exit(1)

    with open(meta_path, "r", encoding="utf-8") as f:
        test_meta = json.load(f)

    print(f"Loaded TestMeta.json: {len(test_meta)} tests")

    # Build reference data for each test
    reference_data = {}
    md_loaded = 0
    ps1_loaded = 0

    for test_id, meta in test_meta.items():
        entry = {
            "id": test_id,
            "title": meta.get("Title", ""),
            "category": meta.get("Category", ""),
            "pillar": meta.get("Pillar", ""),
            "risk": meta.get("RiskLevel", ""),
            "user_impact": meta.get("UserImpact", ""),
            "implementation_cost": meta.get("ImplementationCost", ""),
            "sfi_pillar": meta.get("SfiPillar", ""),
            "tenant_type": meta.get("TenantType", []),
            # Content from markdown
            "description": "",
            "remediation_action": "",
            # Content from ps1
            "source_endpoints": [],
            # Metadata about extraction
            "_md_loaded": False,
            "_ps1_loaded": False,
        }

        # Try loading markdown
        md_path = TESTS_DIR / f"Test-Assessment.{test_id}.md"
        if md_path.exists():
            try:
                md_text = md_path.read_text(encoding="utf-8")
                parsed = parse_markdown(md_text)
                entry["description"] = parsed["description"]
                entry["remediation_action"] = parsed["remediation_action"]
                entry["_md_loaded"] = True
                md_loaded += 1
            except Exception as e:
                print(f"  WARNING: Failed to parse {md_path.name}: {e}")

        # Try extracting endpoints from ps1
        ps1_path = TESTS_DIR / f"Test-Assessment.{test_id}.ps1"
        if ps1_path.exists():
            try:
                ps1_text = ps1_path.read_text(encoding="utf-8")
                entry["source_endpoints"] = extract_graph_endpoints(ps1_text)
                entry["_ps1_loaded"] = True
                ps1_loaded += 1
            except Exception as e:
                print(f"  WARNING: Failed to parse {ps1_path.name}: {e}")

        reference_data[test_id] = entry

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Write output
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(reference_data, f, indent=2, ensure_ascii=False)

    print(f"\nExtraction complete:")
    print(f"  Total tests: {len(reference_data)}")
    print(f"  Markdown loaded: {md_loaded}")
    print(f"  PS1 parsed: {ps1_loaded}")
    print(f"  Output: {OUTPUT_FILE}")

    # Show details for the 5 implemented tests
    implemented = ["21772", "21773", "21795", "21801", "21796"]
    print(f"\nImplemented tests detail:")
    for tid in implemented:
        if tid in reference_data:
            r = reference_data[tid]
            desc_preview = r["description"][:80] + "..." if len(r["description"]) > 80 else r["description"]
            print(f"  {tid}: md={r['_md_loaded']} ps1={r['_ps1_loaded']} | {desc_preview}")


if __name__ == "__main__":
    main()
