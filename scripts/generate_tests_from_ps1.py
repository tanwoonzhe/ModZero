#!/usr/bin/env python3
"""
Generate TypeScript test data files from zerotrustassessment PS1 files.

This script parses the Test-Assessment.*.ps1 files directly to extract test metadata,
ensuring all tests are captured even if not in TestMeta.json.

Expected output:
- 134 Identity tests
- 36 Devices tests
"""

import re
import os
from pathlib import Path
import random

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
TESTS_DIR = PROJECT_ROOT / "zerotrustassemetment" / "zerotrustassessment" / "src" / "powershell" / "tests"
OUTPUT_DIR = PROJECT_ROOT / "frontend" / "src" / "data"


def parse_zt_test_attribute(content: str) -> dict:
    """Parse the ZtTest attribute from a PS1 file content."""
    # Match the ZtTest attribute block
    pattern = r'\[ZtTest\(\s*(.*?)\s*\)\]'
    match = re.search(pattern, content, re.DOTALL)
    
    if not match:
        return {}
    
    attr_content = match.group(1)
    result = {}
    
    # Parse each attribute
    # Category = 'Something'
    attr_patterns = {
        'Category': r"Category\s*=\s*'([^']*)'",
        'ImplementationCost': r"ImplementationCost\s*=\s*'([^']*)'",
        'Pillar': r"Pillar\s*=\s*'([^']*)'",
        'RiskLevel': r"RiskLevel\s*=\s*'([^']*)'",
        'SfiPillar': r"SfiPillar\s*=\s*'([^']*)'",
        'TestId': r"TestId\s*=\s*(\d+)",
        'Title': r"Title\s*=\s*'([^']*)'",
        'UserImpact': r"UserImpact\s*=\s*'([^']*)'",
    }
    
    # TenantType can be array or single value
    tenant_match = re.search(r"TenantType\s*=\s*\(([^)]+)\)", attr_content)
    if tenant_match:
        tenant_str = tenant_match.group(1)
        tenants = re.findall(r"'([^']+)'", tenant_str)
        result['TenantType'] = tenants
    else:
        tenant_single = re.search(r"TenantType\s*=\s*'([^']*)'", attr_content)
        if tenant_single:
            result['TenantType'] = [tenant_single.group(1)]
        else:
            result['TenantType'] = ['Workforce']
    
    for key, pattern in attr_patterns.items():
        match = re.search(pattern, attr_content)
        if match:
            result[key] = match.group(1)
    
    return result


def read_test_description(test_id: str) -> str:
    """Read description from the test's markdown file."""
    md_path = TESTS_DIR / f"Test-Assessment.{test_id}.md"
    if md_path.exists():
        try:
            content = md_path.read_text(encoding='utf-8')
            # Extract description (first paragraph before **Remediation action**)
            lines = content.split('\n')
            description_lines = []
            for line in lines:
                if line.startswith('**Remediation'):
                    break
                if line.strip() and not line.startswith('<!---'):
                    description_lines.append(line.strip())
            desc = ' '.join(description_lines)[:500]
            return desc if desc else None
        except Exception as e:
            print(f"Error reading {md_path}: {e}")
    return None


def generate_random_status() -> str:
    """Generate a random status for demo purposes."""
    statuses = ["Passed"] * 60 + ["Failed"] * 20 + ["Investigate"] * 15 + ["Skipped"] * 5
    return random.choice(statuses)


def scan_all_tests() -> tuple[list, list]:
    """Scan all PS1 test files and extract test metadata."""
    identity_tests = []
    devices_tests = []
    unknown_tests = []
    
    ps1_files = list(TESTS_DIR.glob("Test-Assessment.*.ps1"))
    print(f"Found {len(ps1_files)} PS1 test files")
    
    for ps1_file in sorted(ps1_files):
        try:
            content = ps1_file.read_text(encoding='utf-8')
            meta = parse_zt_test_attribute(content)
            
            if not meta:
                print(f"Warning: Could not parse {ps1_file.name}")
                continue
            
            test_id = meta.get('TestId', ps1_file.stem.split('.')[-1])
            pillar = meta.get('Pillar', '')
            
            # Read description from MD file
            description = read_test_description(str(test_id))
            if not description:
                description = f"Security assessment check for {meta.get('Title', 'this configuration')}"
            
            test_entry = {
                'id': f"ZTA-{test_id}",
                'testId': str(test_id),
                'title': meta.get('Title', ''),
                'category': meta.get('Category', 'General'),
                'sfiPillar': meta.get('SfiPillar', ''),
                'risk': meta.get('RiskLevel', 'Medium'),
                'description': description,
                'userImpact': meta.get('UserImpact', 'Low'),
                'implementationCost': meta.get('ImplementationCost', 'Medium'),
                'status': generate_random_status() if pillar else 'Planned',  # Planned for tests with no pillar
                'tenantType': meta.get('TenantType', ['Workforce']),
            }
            
            if pillar == 'Identity':
                identity_tests.append(test_entry)
            elif pillar == 'Devices':
                devices_tests.append(test_entry)
            else:
                # Tests without a pillar (planned/future)
                unknown_tests.append(test_entry)
                
        except Exception as e:
            print(f"Error processing {ps1_file.name}: {e}")
    
    print(f"\nTest counts:")
    print(f"  Identity: {len(identity_tests)}")
    print(f"  Devices: {len(devices_tests)}")
    print(f"  Planned/Unknown: {len(unknown_tests)}")
    
    return identity_tests, devices_tests


def generate_typescript_file(tests: list, pillar: str, output_path: Path):
    """Generate a TypeScript data file for the tests."""
    
    interface = '''export interface SecurityTest {
  id: string;
  testId: string;
  title: string;
  category: string;
  sfiPillar: string;
  risk: "High" | "Medium" | "Low";
  description: string;
  userImpact: string;
  implementationCost: string;
  status: "Passed" | "Failed" | "Investigate" | "Skipped" | "Planned";
  tenantType: string[];
}
'''
    
    var_name = "identityTests" if pillar == "Identity" else "devicesTests"
    
    lines = [
        f"// Auto-generated from zerotrustassessment PS1 files",
        f"// Total {pillar} tests: {len(tests)}",
        "",
        interface,
        f"export const {var_name}: SecurityTest[] = ["
    ]
    
    for test in tests:
        # Escape description for JSON
        desc = test['description'].replace('\\', '\\\\').replace('"', '\\"').replace('\n', ' ')
        tenant_types = ', '.join(f'"{t}"' for t in test['tenantType'])
        
        lines.append(f'''  {{
    "id": "{test['id']}",
    "testId": "{test['testId']}",
    "title": "{test['title']}",
    "category": "{test['category']}",
    "sfiPillar": "{test['sfiPillar']}",
    "risk": "{test['risk']}",
    "description": "{desc}",
    "userImpact": "{test['userImpact']}",
    "implementationCost": "{test['implementationCost']}",
    "status": "{test['status']}",
    "tenantType": [{tenant_types}]
  }},''')
    
    lines.append("];")
    
    output_path.write_text('\n'.join(lines), encoding='utf-8')
    print(f"Generated {output_path} with {len(tests)} tests")


def generate_index_file():
    """Generate the index file that exports both test arrays."""
    content = '''// Auto-generated index file for security tests
export { identityTests, type SecurityTest } from './identityTests';
export { devicesTests } from './devicesTests';

import { identityTests } from './identityTests';
import { devicesTests } from './devicesTests';

// Helper functions
export const getTestsByCategory = (tests: typeof identityTests, category: string) => 
  tests.filter(t => t.category === category);

export const getTestsBySfiPillar = (tests: typeof identityTests, pillar: string) => 
  tests.filter(t => t.sfiPillar === pillar);

export const getTestsByRisk = (tests: typeof identityTests, risk: string) => 
  tests.filter(t => t.risk === risk);

export const getTestsByStatus = (tests: typeof identityTests, status: string) => 
  tests.filter(t => t.status === status);

// Get unique categories from tests
export const getUniqueCategories = (tests: typeof identityTests) => 
  Array.from(new Set(tests.map(t => t.category).filter(Boolean))).sort();

// Get unique SFI pillars from tests  
export const getUniqueSfiPillars = (tests: typeof identityTests) =>
  Array.from(new Set(tests.map(t => t.sfiPillar).filter(Boolean))).sort();

// Stats
export const getTestStats = (tests: typeof identityTests) => ({
  total: tests.length,
  passed: tests.filter(t => t.status === "Passed").length,
  failed: tests.filter(t => t.status === "Failed").length,
  investigate: tests.filter(t => t.status === "Investigate").length,
  skipped: tests.filter(t => t.status === "Skipped").length,
  planned: tests.filter(t => t.status === "Planned").length,
  highRisk: tests.filter(t => t.risk === "High").length,
  mediumRisk: tests.filter(t => t.risk === "Medium").length,
  lowRisk: tests.filter(t => t.risk === "Low").length,
});
'''
    
    output_path = OUTPUT_DIR / "securityTestsIndex.ts"
    output_path.write_text(content, encoding='utf-8')
    print(f"Generated {output_path}")


def main():
    print("Scanning PS1 test files from zerotrustassessment...")
    print(f"Source: {TESTS_DIR}")
    print(f"Output: {OUTPUT_DIR}")
    print()
    
    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Scan all tests
    identity_tests, devices_tests = scan_all_tests()
    
    # Validate counts
    expected_identity = 134
    expected_devices = 36
    
    if len(identity_tests) != expected_identity:
        print(f"\n⚠️  Warning: Expected {expected_identity} Identity tests, got {len(identity_tests)}")
    else:
        print(f"\n✅ Identity tests count matches expected: {expected_identity}")
    
    if len(devices_tests) != expected_devices:
        print(f"⚠️  Warning: Expected {expected_devices} Devices tests, got {len(devices_tests)}")
    else:
        print(f"✅ Devices tests count matches expected: {expected_devices}")
    
    # Generate files
    print("\nGenerating TypeScript files...")
    generate_typescript_file(identity_tests, "Identity", OUTPUT_DIR / "identityTests.ts")
    generate_typescript_file(devices_tests, "Devices", OUTPUT_DIR / "devicesTests.ts")
    generate_index_file()
    
    print("\n✅ Done!")


if __name__ == "__main__":
    main()
