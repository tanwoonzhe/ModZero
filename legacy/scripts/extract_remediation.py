#!/usr/bin/env python3
"""
Extract remediation information from zerotrustassessment MD files
and generate testRemediations.ts for ModZero frontend.

Preserves original markdown formatting for proper rendering.
"""

import os
import json
import re

def escape_for_ts(text: str) -> str:
    """Escape text for TypeScript template literal."""
    return text.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    tests_dir = os.path.join(base_dir, 'zerotrustassemetment', 'zerotrustassessment', 'src', 'powershell', 'tests')
    meta_file = os.path.join(tests_dir, 'TestMeta.json')
    
    # Load TestMeta.json
    with open(meta_file, 'r', encoding='utf-8') as f:
        meta = json.load(f)
    
    # Process each MD file
    results = {}
    for filename in os.listdir(tests_dir):
        if filename.endswith('.md') and filename.startswith('Test-Assessment.'):
            test_id = filename.replace('Test-Assessment.', '').replace('.md', '')
            filepath = os.path.join(tests_dir, filename)
            
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Extract description (before **Remediation action**)
            desc_match = re.search(r'^(.*?)(?=\*\*Remediation action\*\*)', content, re.DOTALL)
            description = desc_match.group(1).strip() if desc_match else ''
            
            # Extract remediation section (keep markdown format)
            rem_match = re.search(r'\*\*Remediation action\*\*\s*(.*?)(?=<!--- Results --->|$)', content, re.DOTALL)
            remediation_md = rem_match.group(1).strip() if rem_match else ''
            
            # Extract links from remediation
            links = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', remediation_md)
            
            results[test_id] = {
                'description': description,
                'remediation': remediation_md,
                'links': links
            }
    
    # Generate TypeScript file using template literals to preserve formatting
    output_lines = [
        '// Auto-generated from zerotrustassessment MD files',
        '// Contains remediation information for each test',
        '// Uses markdown format - render with react-markdown or similar',
        '',
        'export interface TestRemediation {',
        '  description: string;',
        '  remediation: string;',
        '  links: Array<{ text: string; url: string }>;',
        '}',
        '',
        'export const testRemediations: Record<string, TestRemediation> = {'
    ]
    
    for test_id in sorted(results.keys(), key=lambda x: int(x)):
        data = results[test_id]
        # Escape for template literals
        desc = escape_for_ts(data['description'])
        rem = escape_for_ts(data['remediation'])
        
        links_arr = []
        for link in data['links']:
            link_text = link[0].replace('"', '\\"')
            link_url = link[1]
            links_arr.append(f'{{ text: "{link_text}", url: "{link_url}" }}')
        links_str = ', '.join(links_arr)
        
        output_lines.append(f'  "{test_id}": {{')
        output_lines.append(f'    description: `{desc}`,')
        output_lines.append(f'    remediation: `{rem}`,')
        output_lines.append(f'    links: [{links_str}]')
        output_lines.append('  },')
    
    output_lines.append('};')
    output_lines.append('')
    output_lines.append('export function getTestRemediation(testId: string): TestRemediation | undefined {')
    output_lines.append('  return testRemediations[testId];')
    output_lines.append('}')
    output_lines.append('')
    
    # Write to frontend data directory
    output_file = os.path.join(base_dir, 'frontend', 'src', 'data', 'testRemediations.ts')
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(output_lines))
    
    print(f'Generated {output_file}')
    print(f'Total tests: {len(results)}')
    
    # Print a few examples
    print('\nExamples:')
    for test_id in ['21770', '21781', '21808']:
        if test_id in results:
            data = results[test_id]
            print(f'\nTest {test_id}:')
            print(f'  Description lines: {len(data["description"].splitlines())}')
            print(f'  Remediation lines: {len(data["remediation"].splitlines())}')
            print(f'  Links: {len(data["links"])} link(s)')

if __name__ == '__main__':
    main()
