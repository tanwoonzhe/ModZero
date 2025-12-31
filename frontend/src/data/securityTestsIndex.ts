// Auto-generated index file for security tests
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
