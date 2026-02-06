/**
 * Seed Data for Zero Trust Controls
 * 
 * This file contains realistic security controls aligned with Microsoft Zero Trust principles.
 * Controls are divided between Identity (134 tests from identityTests) and Devices (10+) pillars.
 */

import { Control, Pillar, ControlResult, ControlStatus, TestResult, LicenseKey } from '../types/zeroTrust';
import { identityTests, SecurityTest, getTestLicenseRequirements } from './identityTests';

// ============================================================================
// CONVERT IDENTITY TESTS TO CONTROLS
// ============================================================================

/**
 * Convert SecurityTest from identityTests to Control format
 */
function convertSecurityTestToControl(test: SecurityTest): Control {
  const licenses = getTestLicenseRequirements(test);
  
  // Map risk to defaultWeight and maxPoints
  const riskWeightMap: Record<string, { weight: number; points: number }> = {
    "High": { weight: 100, points: 15 },
    "Medium": { weight: 70, points: 10 },
    "Low": { weight: 40, points: 5 },
  };
  
  const { weight, points } = riskWeightMap[test.risk] || { weight: 50, points: 8 };
  
  return {
    id: test.id,
    testId: test.testId, // API identifier for running the test
    title: test.title,
    description: test.description,
    pillar: Pillar.Identity,
    minLicenses: licenses as LicenseKey[],
    defaultWeight: weight,
    maxPoints: points,
    category: test.category,
    sfiPillar: test.sfiPillar,
    risk: test.risk,
    userImpact: test.userImpact as "High" | "Medium" | "Low",
    implementationCost: test.implementationCost as "High" | "Medium" | "Low",
    docsUrl: test.docLink,
  };
}

// Convert all 134 identity tests to Controls
export const identityControls: Control[] = identityTests.map(convertSecurityTestToControl);

// ============================================================================
// DEVICE CONTROLS
// ============================================================================

export const deviceControls: Control[] = [
  {
    id: "ZT-DEVICE-0001",
    title: "Defender for Endpoint automatic enrollment",
    description: "Automatically enroll Windows devices in Microsoft Defender for Endpoint for advanced threat protection and EDR capabilities.",
    pillar: Pillar.Devices,
    minLicenses: ["MDE_P1", "INTUNE_P1"],
    defaultWeight: 95,
    maxPoints: 15,
    category: "Endpoint Security",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "High",
    userImpact: "Low",
    implementationCost: "Medium",
    docsUrl: "https://learn.microsoft.com/en-us/defender-endpoint/configure-endpoints",
    purchaseUrl: "https://www.microsoft.com/en-us/security/business/endpoint-security/microsoft-defender-endpoint",
  },
  {
    id: "ZT-DEVICE-0002",
    title: "Enable device compliance policies",
    description: "Define and enforce device compliance requirements including encryption, OS version, PIN complexity, and antivirus status.",
    pillar: Pillar.Devices,
    minLicenses: ["INTUNE_P1"],
    defaultWeight: 90,
    maxPoints: 12,
    category: "Device Compliance",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    userImpact: "Low",
    implementationCost: "Low",
    docsUrl: "https://learn.microsoft.com/en-us/mem/intune/protect/device-compliance-get-started",
  },
  {
    id: "ZT-DEVICE-0003",
    title: "Require device encryption",
    description: "Enforce BitLocker (Windows) or FileVault (macOS) encryption on all managed devices to protect data at rest.",
    pillar: Pillar.Devices,
    minLicenses: ["INTUNE_P1"],
    defaultWeight: 100,
    maxPoints: 10,
    category: "Data Protection",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    userImpact: "Low",
    implementationCost: "Low",
    docsUrl: "https://learn.microsoft.com/en-us/mem/intune/protect/encrypt-devices",
  },
  {
    id: "ZT-DEVICE-0004",
    title: "Block jailbroken or rooted devices",
    description: "Detect and block access from jailbroken iOS or rooted Android devices that may have compromised security.",
    pillar: Pillar.Devices,
    minLicenses: ["INTUNE_P1"],
    defaultWeight: 85,
    maxPoints: 8,
    category: "Mobile Security",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    userImpact: "Medium",
    implementationCost: "Low",
    docsUrl: "https://learn.microsoft.com/en-us/mem/intune/protect/compliance-policy-create-android",
  },
  {
    id: "ZT-DEVICE-0005",
    title: "Configure attack surface reduction rules",
    description: "Enable ASR rules to block common attack vectors like Office macro abuse, credential stealing, and script execution.",
    pillar: Pillar.Devices,
    minLicenses: ["MDE_P1"],
    defaultWeight: 80,
    maxPoints: 12,
    category: "Endpoint Security",
    sfiPillar: "Protect engineering systems",
    risk: "High",
    userImpact: "Low",
    implementationCost: "Medium",
    docsUrl: "https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction",
    purchaseUrl: "https://www.microsoft.com/en-us/security/business/endpoint-security/microsoft-defender-endpoint",
  },
  {
    id: "ZT-DEVICE-0006",
    title: "Enable automated investigation and remediation",
    description: "Configure Defender for Endpoint to automatically investigate and remediate threats, reducing analyst workload.",
    pillar: Pillar.Devices,
    minLicenses: ["MDE_P2"],
    defaultWeight: 75,
    maxPoints: 10,
    category: "Endpoint Security",
    sfiPillar: "Accelerate response and remediation",
    risk: "Medium",
    userImpact: "Low",
    implementationCost: "Low",
    docsUrl: "https://learn.microsoft.com/en-us/defender-endpoint/automated-investigations",
    purchaseUrl: "https://www.microsoft.com/en-us/security/business/endpoint-security/microsoft-defender-endpoint",
  },
  {
    id: "ZT-DEVICE-0007",
    title: "Deploy app protection policies",
    description: "Configure MAM policies to protect corporate data in mobile apps, including copy/paste restrictions and data encryption.",
    pillar: Pillar.Devices,
    minLicenses: ["INTUNE_P1"],
    defaultWeight: 70,
    maxPoints: 8,
    category: "App Protection",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    userImpact: "Medium",
    implementationCost: "Medium",
    docsUrl: "https://learn.microsoft.com/en-us/mem/intune/apps/app-protection-policy",
  },
  {
    id: "ZT-DEVICE-0008",
    title: "Configure Windows Update for Business",
    description: "Manage Windows updates through Intune to ensure devices receive security updates promptly while maintaining stability.",
    pillar: Pillar.Devices,
    minLicenses: ["INTUNE_P1"],
    defaultWeight: 65,
    maxPoints: 6,
    category: "Patch Management",
    sfiPillar: "Protect engineering systems",
    risk: "Medium",
    userImpact: "Low",
    implementationCost: "Low",
    docsUrl: "https://learn.microsoft.com/en-us/mem/intune/protect/windows-update-for-business-configure",
  },
  {
    id: "ZT-DEVICE-0009",
    title: "Enable remote wipe capability",
    description: "Ensure Intune can remotely wipe or retire devices when lost, stolen, or when an employee leaves the organization.",
    pillar: Pillar.Devices,
    minLicenses: ["INTUNE_P1"],
    defaultWeight: 80,
    maxPoints: 6,
    category: "Device Management",
    sfiPillar: "Accelerate response and remediation",
    risk: "Medium",
    userImpact: "Low",
    implementationCost: "Low",
    docsUrl: "https://learn.microsoft.com/en-us/mem/intune/remote-actions/devices-wipe",
  },
  {
    id: "ZT-DEVICE-0010",
    title: "Configure endpoint detection and response",
    description: "Enable full EDR capabilities in Defender for Endpoint for advanced threat hunting and forensic analysis.",
    pillar: Pillar.Devices,
    minLicenses: ["MDE_P2"],
    defaultWeight: 85,
    maxPoints: 12,
    category: "Endpoint Security",
    sfiPillar: "Monitor and detect cyberthreats",
    risk: "High",
    userImpact: "Low",
    implementationCost: "Medium",
    docsUrl: "https://learn.microsoft.com/en-us/defender-endpoint/overview-endpoint-detection-response",
    purchaseUrl: "https://www.microsoft.com/en-us/security/business/endpoint-security/microsoft-defender-endpoint",
  },
];

// ============================================================================
// ALL CONTROLS
// ============================================================================

export const allControls: Control[] = [...identityControls, ...deviceControls];

// ============================================================================
// MOCK CONTROL RESULTS
// ============================================================================

// Generate mock results for all identity controls based on their original status
const generateIdentityMockResults = (): ControlResult[] => {
  return identityTests.map((test, index) => {
    // Map SecurityTest status to TestResult (auto-detected)
    const resultMap: Record<string, TestResult> = {
      "Passed": TestResult.PASSED,
      "Failed": TestResult.FAILED,
      "Investigate": TestResult.INVESTIGATE,
      "Skipped": TestResult.NOT_RUN,
      "Planned": TestResult.NOT_RUN,
    };
    
    // Map SecurityTest status to ControlStatus (user action)
    const statusMap: Record<string, ControlStatus> = {
      "Passed": ControlStatus.COMPLETED,
      "Failed": ControlStatus.TO_ADDRESS,
      "Investigate": ControlStatus.PLANNED,
      "Skipped": ControlStatus.RISK_ACCEPTED,
      "Planned": ControlStatus.PLANNED,
    };
    
    const result = resultMap[test.status] || TestResult.NOT_RUN;
    const status = statusMap[test.status] || ControlStatus.TO_ADDRESS;
    
    return {
      controlId: test.id,
      result,
      status,
      lastCheckedAt: new Date().toISOString(),
      evidence: result === TestResult.PASSED 
        ? [{ kind: "assessment", value: `Auto-evaluated: ${test.testId}` }]
        : undefined,
    };
  });
};

// Device mock results
const deviceMockResults: ControlResult[] = [
  { controlId: "ZT-DEVICE-0001", result: TestResult.FAILED, status: ControlStatus.TO_ADDRESS, lastCheckedAt: new Date().toISOString() },
  { controlId: "ZT-DEVICE-0002", result: TestResult.PASSED, status: ControlStatus.COMPLETED, lastCheckedAt: new Date().toISOString(), evidence: [{ kind: "policy", value: "Windows-Compliance-Policy" }] },
  { controlId: "ZT-DEVICE-0003", result: TestResult.PASSED, status: ControlStatus.COMPLETED, lastCheckedAt: new Date().toISOString() },
  { controlId: "ZT-DEVICE-0004", result: TestResult.PASSED, status: ControlStatus.COMPLETED, lastCheckedAt: new Date().toISOString() },
  { controlId: "ZT-DEVICE-0005", result: TestResult.FAILED, status: ControlStatus.TO_ADDRESS, lastCheckedAt: new Date().toISOString() },
  { controlId: "ZT-DEVICE-0006", result: TestResult.INVESTIGATE, status: ControlStatus.TO_ADDRESS, lastCheckedAt: new Date().toISOString() },
  { controlId: "ZT-DEVICE-0007", result: TestResult.PASSED, status: ControlStatus.ALTERNATE_MITIGATION, lastCheckedAt: new Date().toISOString(), notes: "Using third-party MAM solution" },
  { controlId: "ZT-DEVICE-0008", result: TestResult.PASSED, status: ControlStatus.COMPLETED, lastCheckedAt: new Date().toISOString() },
  { controlId: "ZT-DEVICE-0009", result: TestResult.PASSED, status: ControlStatus.COMPLETED, lastCheckedAt: new Date().toISOString() },
  { controlId: "ZT-DEVICE-0010", result: TestResult.NOT_RUN, status: ControlStatus.TO_ADDRESS, lastCheckedAt: new Date().toISOString() },
];

export const mockControlResults: ControlResult[] = [
  ...generateIdentityMockResults(),
  ...deviceMockResults,
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export const getControlById = (id: string): Control | undefined => 
  allControls.find(c => c.id === id);

export const getControlsByPillar = (pillar: Pillar): Control[] =>
  allControls.filter(c => c.pillar === pillar);

export const getControlsByLicense = (license: string): Control[] =>
  allControls.filter(c => c.minLicenses.includes(license as any));
