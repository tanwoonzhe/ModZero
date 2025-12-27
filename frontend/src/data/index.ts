// Identity Security Tests - Combined Index
// Exports all identity test data from parts 1-4

export { IdentityTest, identityTestsPart1 } from './identityTests';
export { identityTestsPart2 } from './identityTestsPart2';
export { identityTestsPart3 } from './identityTestsPart3';
export { identityTestsPart4 } from './identityTestsPart4';

import { IdentityTest, identityTestsPart1 } from './identityTests';
import { identityTestsPart2 } from './identityTestsPart2';
import { identityTestsPart3 } from './identityTestsPart3';
import { identityTestsPart4 } from './identityTestsPart4';

// Combined array of all 133 Identity security tests
export const allIdentityTests: IdentityTest[] = [
  ...identityTestsPart1,
  ...identityTestsPart2,
  ...identityTestsPart3,
  ...identityTestsPart4
];

// Helper function to get test by ID
export const getIdentityTestById = (id: string): IdentityTest | undefined => {
  return allIdentityTests.find(test => test.id === id);
};

// Helper function to get tests by category
export const getIdentityTestsByCategory = (category: string): IdentityTest[] => {
  return allIdentityTests.filter(test => test.category === category);
};

// Helper function to get tests by status
export const getIdentityTestsByStatus = (status: string): IdentityTest[] => {
  return allIdentityTests.filter(test => test.status === status);
};

// Helper function to get tests by risk level
export const getIdentityTestsByRisk = (risk: string): IdentityTest[] => {
  return allIdentityTests.filter(test => test.risk === risk);
};

// Get unique categories
export const getIdentityCategories = (): string[] => {
  return [...new Set(allIdentityTests.map(test => test.category))];
};

// Get stats summary
export const getIdentityTestsStats = () => {
  const total = allIdentityTests.length;
  const passed = allIdentityTests.filter(t => t.status === 'Passed').length;
  const failed = allIdentityTests.filter(t => t.status === 'Failed').length;
  const investigate = allIdentityTests.filter(t => t.status === 'Investigate').length;
  const skipped = allIdentityTests.filter(t => t.status === 'Skipped').length;
  const highRisk = allIdentityTests.filter(t => t.risk === 'High').length;
  const mediumRisk = allIdentityTests.filter(t => t.risk === 'Medium').length;
  const lowRisk = allIdentityTests.filter(t => t.risk === 'Low').length;
  return { total, passed, failed, investigate, skipped, highRisk, mediumRisk, lowRisk };
};
