// Devices Security Tests - Combined Index
// Exports all device test data from parts 1-3

export { DeviceTest, devicesTestsPart1 } from './devicesTests';
export { devicesTestsPart2 } from './devicesTestsPart2';
export { devicesTestsPart3 } from './devicesTestsPart3';

import { DeviceTest, devicesTestsPart1 } from './devicesTests';
import { devicesTestsPart2 } from './devicesTestsPart2';
import { devicesTestsPart3 } from './devicesTestsPart3';

// Combined array of all Device security tests (120 tests)
export const allDevicesTests: DeviceTest[] = [
  ...devicesTestsPart1,
  ...devicesTestsPart2,
  ...devicesTestsPart3
];

// Helper function to get test by ID
export const getDeviceTestById = (id: string): DeviceTest | undefined => {
  return allDevicesTests.find(test => test.id === id);
};

// Helper function to get tests by category
export const getDeviceTestsByCategory = (category: string): DeviceTest[] => {
  return allDevicesTests.filter(test => test.category === category);
};

// Helper function to get tests by status
export const getDeviceTestsByStatus = (status: string): DeviceTest[] => {
  return allDevicesTests.filter(test => test.status === status);
};

// Helper function to get tests by risk level
export const getDeviceTestsByRisk = (risk: string): DeviceTest[] => {
  return allDevicesTests.filter(test => test.risk === risk);
};

// Get unique categories
export const getDeviceCategories = (): string[] => {
  return [...new Set(allDevicesTests.map(test => test.category))];
};

// Get stats summary
export const getDeviceTestsStats = () => {
  const total = allDevicesTests.length;
  const passed = allDevicesTests.filter(t => t.status === 'Passed').length;
  const failed = allDevicesTests.filter(t => t.status === 'Failed').length;
  const investigate = allDevicesTests.filter(t => t.status === 'Investigate').length;
  const skipped = allDevicesTests.filter(t => t.status === 'Skipped').length;
  const planned = allDevicesTests.filter(t => t.status === 'Planned').length;
  
  return {
    total,
    passed,
    failed,
    investigate,
    skipped,
    planned,
    passRate: total > 0 ? Math.round((passed / total) * 100) : 0
  };
};

// Get risk breakdown
export const getDeviceRiskBreakdown = () => {
  const high = allDevicesTests.filter(t => t.risk === 'High').length;
  const medium = allDevicesTests.filter(t => t.risk === 'Medium').length;
  const low = allDevicesTests.filter(t => t.risk === 'Low').length;
  
  return { high, medium, low };
};
