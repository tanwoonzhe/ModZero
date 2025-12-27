#!/usr/bin/env python3
"""
Generate Identity Tests TypeScript file from official Microsoft Zero Trust Assessment repo
"""

import json
import os
from pathlib import Path

# Paths
TESTS_DIR = Path(r"C:\vscode\New folder (2)\ModZero\zerotrustassemetment\zerotrustassessment\src\powershell\tests")
META_FILE = TESTS_DIR / "TestMeta.json"
OUTPUT_DIR = Path(r"C:\vscode\New folder (2)\ModZero\frontend\src\data")

# Load test metadata
with open(META_FILE, 'r', encoding='utf-8') as f:
    test_meta = json.load(f)

# Filter Identity tests only
identity_tests = {k: v for k, v in test_meta.items() if v.get('Pillar') == 'Identity'}
print(f"Found {len(identity_tests)} Identity tests")

# Read description from .md files
def get_description(test_id):
    md_file = TESTS_DIR / f"Test-Assessment.{test_id}.md"
    if md_file.exists():
        with open(md_file, 'r', encoding='utf-8') as f:
            content = f.read()
            # Remove the results placeholder and remediation section for description
            # Get content before **Remediation action**
            if '**Remediation action**' in content:
                content = content.split('**Remediation action**')[0]
            # Clean up
            content = content.strip()
            # Remove markdown formatting for cleaner text
            content = content.replace('\n\n', ' ').replace('\n', ' ')
            return content
    return "Description not available."

# Generate test statuses (demo purposes - mix of statuses)
def get_demo_status(test_id):
    """Generate demo status based on test ID for visual variety"""
    id_num = int(test_id)
    if id_num % 7 == 0:
        return "Failed"
    elif id_num % 5 == 0:
        return "Investigate"
    elif id_num % 11 == 0:
        return "Skipped"
    else:
        return "Passed"

def get_demo_result(status, title):
    """Generate demo test result based on status"""
    if status == "Passed":
        return f"All checks passed for this control."
    elif status == "Failed":
        return f"Found issues that need attention."
    elif status == "Investigate":
        return f"Manual review recommended."
    else:
        return f"Test skipped or not applicable."

# Build test data
tests_data = []
for test_id in sorted(identity_tests.keys(), key=lambda x: int(x)):
    meta = identity_tests[test_id]
    status = get_demo_status(test_id)
    
    test = {
        "id": test_id,
        "title": meta.get("Title", "Unknown"),
        "category": meta.get("Category", "Unknown"),
        "sfiPillar": meta.get("SfiPillar", ""),
        "risk": meta.get("RiskLevel", "Medium"),
        "status": status,
        "description": get_description(test_id),
        "testResult": get_demo_result(status, meta.get("Title", "")),
        "userImpact": meta.get("UserImpact", "Low"),
        "implementationCost": meta.get("ImplementationCost", "Medium")
    }
    tests_data.append(test)

print(f"Generated {len(tests_data)} test entries")

# Split into 4 parts for better maintainability
part_size = len(tests_data) // 4 + 1
parts = [
    tests_data[0:34],      # Part 1
    tests_data[34:67],     # Part 2  
    tests_data[67:100],    # Part 3
    tests_data[100:]       # Part 4
]

def escape_string(s):
    """Escape string for TypeScript"""
    return s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', ' ')

def generate_ts_part(tests, part_num, is_main=False):
    """Generate TypeScript code for a part"""
    lines = []
    
    if is_main:
        lines.append('// Identity Security Tests Data - Based on Microsoft Zero Trust Assessment')
        lines.append(f'// Total: {len(tests_data)} Identity Tests (from official Microsoft repo)')
        lines.append('')
        lines.append('export interface IdentityTest {')
        lines.append('  id: string;')
        lines.append('  title: string;')
        lines.append('  category: string;')
        lines.append('  sfiPillar: string;')
        lines.append('  risk: "High" | "Medium" | "Low";')
        lines.append('  status: "Passed" | "Failed" | "Investigate" | "Skipped" | "Planned";')
        lines.append('  description: string;')
        lines.append('  testResult: string;')
        lines.append('  userImpact: string;')
        lines.append('  implementationCost: string;')
        lines.append('}')
        lines.append('')
        lines.append(f'// Part 1: Tests ({len(tests)} tests)')
        lines.append('export const identityTestsPart1: IdentityTest[] = [')
    else:
        lines.append(f'// Identity Security Tests Data - Part {part_num}')
        lines.append(f'// Tests ({len(tests)} tests)')
        lines.append('')
        lines.append("import { IdentityTest } from './identityTests';")
        lines.append('')
        lines.append(f'export const identityTestsPart{part_num}: IdentityTest[] = [')
    
    for i, test in enumerate(tests):
        lines.append('  {')
        lines.append(f'    id: "{test["id"]}",')
        lines.append(f'    title: "{escape_string(test["title"])}",')
        lines.append(f'    category: "{escape_string(test["category"])}",')
        lines.append(f'    sfiPillar: "{escape_string(test["sfiPillar"])}",')
        lines.append(f'    risk: "{test["risk"]}",')
        lines.append(f'    status: "{test["status"]}",')
        lines.append(f'    description: "{escape_string(test["description"])}",')
        lines.append(f'    testResult: "{escape_string(test["testResult"])}",')
        lines.append(f'    userImpact: "{test["userImpact"]}",')
        lines.append(f'    implementationCost: "{test["implementationCost"]}"')
        if i < len(tests) - 1:
            lines.append('  },')
        else:
            lines.append('  }')
    
    lines.append('];')
    lines.append('')
    
    return '\n'.join(lines)

# Generate index.ts
def generate_index():
    lines = []
    lines.append('// Identity Security Tests - Combined Index')
    lines.append('// Exports all identity test data from parts 1-4')
    lines.append('')
    lines.append("export { IdentityTest, identityTestsPart1 } from './identityTests';")
    lines.append("export { identityTestsPart2 } from './identityTestsPart2';")
    lines.append("export { identityTestsPart3 } from './identityTestsPart3';")
    lines.append("export { identityTestsPart4 } from './identityTestsPart4';")
    lines.append('')
    lines.append("import { IdentityTest, identityTestsPart1 } from './identityTests';")
    lines.append("import { identityTestsPart2 } from './identityTestsPart2';")
    lines.append("import { identityTestsPart3 } from './identityTestsPart3';")
    lines.append("import { identityTestsPart4 } from './identityTestsPart4';")
    lines.append('')
    lines.append(f'// Combined array of all {len(tests_data)} Identity security tests')
    lines.append('export const allIdentityTests: IdentityTest[] = [')
    lines.append('  ...identityTestsPart1,')
    lines.append('  ...identityTestsPart2,')
    lines.append('  ...identityTestsPart3,')
    lines.append('  ...identityTestsPart4')
    lines.append('];')
    lines.append('')
    lines.append('// Helper function to get test by ID')
    lines.append('export const getIdentityTestById = (id: string): IdentityTest | undefined => {')
    lines.append('  return allIdentityTests.find(test => test.id === id);')
    lines.append('};')
    lines.append('')
    lines.append('// Helper function to get tests by category')
    lines.append('export const getIdentityTestsByCategory = (category: string): IdentityTest[] => {')
    lines.append('  return allIdentityTests.filter(test => test.category === category);')
    lines.append('};')
    lines.append('')
    lines.append('// Helper function to get tests by status')
    lines.append('export const getIdentityTestsByStatus = (status: string): IdentityTest[] => {')
    lines.append('  return allIdentityTests.filter(test => test.status === status);')
    lines.append('};')
    lines.append('')
    lines.append('// Helper function to get tests by risk level')
    lines.append('export const getIdentityTestsByRisk = (risk: string): IdentityTest[] => {')
    lines.append('  return allIdentityTests.filter(test => test.risk === risk);')
    lines.append('};')
    lines.append('')
    lines.append('// Get unique categories')
    lines.append('export const getIdentityCategories = (): string[] => {')
    lines.append('  return [...new Set(allIdentityTests.map(test => test.category))];')
    lines.append('};')
    lines.append('')
    lines.append('// Get stats summary')
    lines.append('export const getIdentityTestsStats = () => {')
    lines.append('  const total = allIdentityTests.length;')
    lines.append("  const passed = allIdentityTests.filter(t => t.status === 'Passed').length;")
    lines.append("  const failed = allIdentityTests.filter(t => t.status === 'Failed').length;")
    lines.append("  const investigate = allIdentityTests.filter(t => t.status === 'Investigate').length;")
    lines.append("  const skipped = allIdentityTests.filter(t => t.status === 'Skipped').length;")
    lines.append("  const highRisk = allIdentityTests.filter(t => t.risk === 'High').length;")
    lines.append("  const mediumRisk = allIdentityTests.filter(t => t.risk === 'Medium').length;")
    lines.append("  const lowRisk = allIdentityTests.filter(t => t.risk === 'Low').length;")
    lines.append('  return { total, passed, failed, investigate, skipped, highRisk, mediumRisk, lowRisk };')
    lines.append('};')
    lines.append('')
    return '\n'.join(lines)

# Write files
print("Writing TypeScript files...")

# Part 1 (main file with interface)
with open(OUTPUT_DIR / 'identityTests.ts', 'w', encoding='utf-8') as f:
    f.write(generate_ts_part(parts[0], 1, is_main=True))

# Parts 2-4
for i, part in enumerate(parts[1:], start=2):
    with open(OUTPUT_DIR / f'identityTestsPart{i}.ts', 'w', encoding='utf-8') as f:
        f.write(generate_ts_part(part, i))

# Index
with open(OUTPUT_DIR / 'index.ts', 'w', encoding='utf-8') as f:
    f.write(generate_index())

print("Done! Generated files:")
print(f"  - identityTests.ts ({len(parts[0])} tests)")
print(f"  - identityTestsPart2.ts ({len(parts[1])} tests)")
print(f"  - identityTestsPart3.ts ({len(parts[2])} tests)")
print(f"  - identityTestsPart4.ts ({len(parts[3])} tests)")
print(f"  - index.ts")
print(f"Total: {len(tests_data)} Identity tests")
