#!/usr/bin/env python3
"""
Generate TypeScript test data files from zerotrustassessment TestMeta.json

This script parses the TestMeta.json file and generates TypeScript data files
for Identity and Devices tests that can be used in the ModZero frontend.
"""

import json
import os
from pathlib import Path
import random

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
TEST_META_PATH = PROJECT_ROOT / "zerotrustassemetment" / "zerotrustassessment" / "src" / "powershell" / "tests" / "TestMeta.json"
TESTS_MD_DIR = PROJECT_ROOT / "zerotrustassemetment" / "zerotrustassessment" / "src" / "powershell" / "tests"
OUTPUT_DIR = PROJECT_ROOT / "frontend" / "src" / "data"

def read_test_description(test_id: str) -> str:
    """Read description from the test's markdown file."""
    md_path = TESTS_MD_DIR / f"Test-Assessment.{test_id}.md"
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
            return ' '.join(description_lines)[:500]  # Limit length
        except Exception as e:
            print(f"Error reading {md_path}: {e}")
    return ""

def generate_random_status() -> str:
    """Generate a random status for demo purposes."""
    # Weighted towards Passed
    statuses = ["Passed"] * 60 + ["Failed"] * 20 + ["Investigate"] * 15 + ["Skipped"] * 5
    return random.choice(statuses)

def parse_test_meta() -> tuple[list, list]:
    """Parse TestMeta.json and return Identity and Devices tests."""
    with open(TEST_META_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    identity_tests = []
    devices_tests = []
    
    for test_id, meta in data.items():
        pillar = meta.get('Pillar', '')
        
        # Read description from MD file
        description = read_test_description(test_id)
        if not description:
            description = f"Security assessment check for {meta.get('Title', 'this configuration')}"
        
        test_entry = {
            'id': f"ZTA-{test_id}",
            'testId': meta.get('TestId', test_id),
            'title': meta.get('Title', ''),
            'category': meta.get('Category', 'General'),
            'sfiPillar': meta.get('SfiPillar', ''),
            'risk': meta.get('RiskLevel', 'Medium'),
            'description': description,
            'userImpact': meta.get('UserImpact', 'Low'),
            'implementationCost': meta.get('ImplementationCost', 'Medium'),
            'status': generate_random_status(),
            'tenantType': meta.get('TenantType', ['Workforce']),
        }
        
        if pillar == 'Identity':
            identity_tests.append(test_entry)
        elif pillar == 'Devices':
            devices_tests.append(test_entry)
    
    return identity_tests, devices_tests

def generate_typescript_file(tests: list, pillar: str, output_path: Path):
    """Generate a TypeScript data file for the tests."""
    
    # Define the interface
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
    
    # Generate the tests array
    tests_json = json.dumps(tests, indent=2, ensure_ascii=False)
    
    content = f'''// Auto-generated from zerotrustassessment TestMeta.json
// Pillar: {pillar}
// Generated tests: {len(tests)}

{interface}

export const {pillar.lower()}Tests: SecurityTest[] = {tests_json};

export default {pillar.lower()}Tests;
'''
    
    output_path.write_text(content, encoding='utf-8')
    print(f"Generated {output_path} with {len(tests)} tests")

def generate_index_file():
    """Generate an index file that exports both test sets."""
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

export { identityTests, devicesTests };
'''
    
    output_path = OUTPUT_DIR / "securityTestsIndex.ts"
    output_path.write_text(content, encoding='utf-8')
    print(f"Generated {output_path}")

def main():
    print(f"Reading TestMeta.json from: {TEST_META_PATH}")
    
    if not TEST_META_PATH.exists():
        print(f"ERROR: TestMeta.json not found at {TEST_META_PATH}")
        return
    
    identity_tests, devices_tests = parse_test_meta()
    
    print(f"\nFound {len(identity_tests)} Identity tests")
    print(f"Found {len(devices_tests)} Devices tests")
    
    # Create output directory if needed
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Generate TypeScript files
    generate_typescript_file(identity_tests, "Identity", OUTPUT_DIR / "identityTests.ts")
    generate_typescript_file(devices_tests, "Devices", OUTPUT_DIR / "devicesTests.ts")
    generate_index_file()
    
    print("\nDone!")

if __name__ == "__main__":
    main()
