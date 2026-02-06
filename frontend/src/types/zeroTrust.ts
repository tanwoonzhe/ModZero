/**
 * Zero Trust Assessment Types
 * 
 * This module defines the core data model for the policy-driven testing system
 * with licensing awareness and customizable scoring weights.
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum Pillar {
  Identity = "Identity",
  Devices = "Devices",
  Data = "Data",
  Apps = "Apps",
  Infrastructure = "Infrastructure",
}

/**
 * Test Result (auto-detected from assessment)
 * - PASSED: Test passed successfully
 * - FAILED: Test failed
 * - INVESTIGATE: Requires manual investigation
 * - NOT_RUN: Test has not been executed yet
 */
export enum TestResult {
  PASSED = "PASSED",
  FAILED = "FAILED",
  INVESTIGATE = "INVESTIGATE",
  NOT_RUN = "NOT_RUN",
}

/**
 * Detection mode for custom tests
 * - manual: User manually sets pass/fail status
 * - graph_query: Automatically evaluate via Microsoft Graph API
 * - checklist: Verify checklist items are completed
 */
export type DetectionMode = "manual" | "graph_query" | "checklist";

/**
 * Operator for Graph API query evaluation
 */
export type GraphQueryOperator = 
  | "exists"        // Resource exists (non-empty response)
  | "not_empty"     // Array/collection is not empty
  | "equals"        // Field equals expected value
  | "not_equals"    // Field does not equal expected value
  | "contains"      // Field contains expected value (string)
  | "count_gt"      // Array count is greater than value
  | "count_lt"      // Array count is less than value
  | "count_eq"      // Array count equals value
  | "all_match"     // All items in array match condition
  | "any_match";    // At least one item matches condition

/**
 * Common Graph API endpoints for custom tests
 */
export const GRAPH_API_ENDPOINTS = [
  { value: "/users", label: "Users", description: "All users in the directory" },
  { value: "/identity/conditionalAccess/policies", label: "Conditional Access Policies", description: "All CA policies" },
  { value: "/deviceManagement/managedDevices", label: "Managed Devices", description: "Intune managed devices" },
  { value: "/deviceManagement/deviceCompliancePolicies", label: "Device Compliance Policies", description: "Device compliance policies" },
  { value: "/directoryRoles", label: "Directory Roles", description: "Azure AD directory roles" },
  { value: "/reports/authenticationMethods/userRegistrationDetails", label: "MFA Registration Details", description: "User MFA registration status" },
  { value: "/identity/conditionalAccess/namedLocations", label: "Named Locations", description: "CA named locations" },
  { value: "/policies/authenticationMethodsPolicy", label: "Authentication Methods Policy", description: "Auth methods policy" },
  { value: "/identityProtection/riskDetections", label: "Risk Detections", description: "Identity protection risk detections" },
  { value: "/identityProtection/riskyUsers", label: "Risky Users", description: "Users flagged for risk" },
  { value: "custom", label: "Custom Endpoint", description: "Enter a custom Graph API endpoint" },
] as const;

/**
 * Configuration for Graph API query detection mode
 */
export interface GraphQueryConfig {
  /** Graph API endpoint (e.g., "/users", "/identity/conditionalAccess/policies") */
  endpoint: string;
  /** Use beta API instead of v1.0 */
  useBeta: boolean;
  /** Field to evaluate in the response (e.g., "value", "value[0].state") */
  expectedField: string;
  /** Comparison operator */
  operator: GraphQueryOperator;
  /** Expected value for comparison (if applicable) */
  value: string;
  /** Optional $filter parameter */
  filter?: string;
  /** Optional $select parameter */
  select?: string;
}

/**
 * Single item in a checklist
 */
export interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
}

/**
 * Configuration for checklist detection mode
 */
export interface ChecklistConfig {
  /** Require all items to be checked for pass */
  requireAll: boolean;
  /** Checklist items */
  items: ChecklistItem[];
}

/**
 * Action status model (user-selected) supporting Microsoft Secure Score status concepts
 * - TO_ADDRESS: Control needs attention
 * - PLANNED: Scheduled for future implementation
 * - RISK_ACCEPTED: Risk acknowledged but not mitigated (earns 0 points)
 * - ALTERNATE_MITIGATION: Resolved through alternative approach (earns full points)
 * - THIRD_PARTY: Resolved through third-party solution (earns full points)
 * - COMPLETED: Fully implemented (earns full points)
 * - NOT_LICENSED: Required license not available (excluded from achievable score)
 */
export enum ControlStatus {
  TO_ADDRESS = "TO_ADDRESS",
  PLANNED = "PLANNED",
  RISK_ACCEPTED = "RISK_ACCEPTED",
  ALTERNATE_MITIGATION = "ALTERNATE_MITIGATION",
  THIRD_PARTY = "THIRD_PARTY",
  COMPLETED = "COMPLETED",
  NOT_LICENSED = "NOT_LICENSED",
}

/**
 * License keys for Microsoft 365 / Azure services
 */
export type LicenseKey =
  | "ENTRA_P1"        // Microsoft Entra ID P1
  | "ENTRA_P2"        // Microsoft Entra ID P2
  | "INTUNE_P1"       // Microsoft Intune Plan 1
  | "MDE_P1"          // Microsoft Defender for Endpoint Plan 1
  | "MDE_P2"          // Microsoft Defender for Endpoint Plan 2
  | "ENTRA_GOVERNANCE" // Microsoft Entra ID Governance
  | "ENTRA_WORKLOAD_ID" // Microsoft Entra Workload ID
  | "M365_E3"         // Microsoft 365 E3
  | "M365_E5"         // Microsoft 365 E5
  | "DEFENDER_CLOUD"; // Microsoft Defender for Cloud

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Represents a security control that can be assessed
 */
export interface Control {
  /** Unique identifier, e.g., "ZT-IDENTITY-0001" */
  id: string;
  /** API test identifier for running default tests (e.g., "21770") */
  testId?: string;
  /** Human-readable title */
  title: string;
  /** Detailed description of the control */
  description?: string;
  /** Zero Trust pillar this control belongs to */
  pillar: Pillar;
  /** Licenses required - ALL must be satisfied for the control to be achievable */
  minLicenses: LicenseKey[];
  /** Default weight 0-100, used if no override exists */
  defaultWeight: number;
  /** Maximum points this control can contribute (independent of weight) */
  maxPoints: number;
  /** Microsoft Learn documentation URL */
  docsUrl?: string;
  /** URL to purchase required license */
  purchaseUrl?: string;
  /** Category for grouping (e.g., "MFA", "Conditional Access") */
  category?: string;
  /** SFI (Secure Future Initiative) pillar alignment */
  sfiPillar?: string;
  /** Risk level: High, Medium, Low */
  risk?: "High" | "Medium" | "Low";
  /** User impact level */
  userImpact?: "High" | "Medium" | "Low";
  /** Implementation complexity/cost */
  implementationCost?: "High" | "Medium" | "Low";
  /** Whether this control is enabled (included in assessment) */
  enabled?: boolean;
  /** Whether this is a custom (user-defined) control */
  isCustom?: boolean;
  /** When this control was created (for custom controls) */
  createdAt?: string;
  /** Who created this control (for custom controls) */
  createdBy?: string;
  /** Detection mode for custom tests */
  detectionMode?: DetectionMode;
  /** Graph API query configuration (for graph_query mode) */
  graphQueryConfig?: GraphQueryConfig;
  /** Checklist configuration (for checklist mode) */
  checklistConfig?: ChecklistConfig;
  /** Last test run data (raw API response) */
  lastRunData?: unknown;
  /** Last test run timestamp */
  lastRunAt?: string;
  /** Is the test currently running? */
  isRunning?: boolean;
}

/**
 * Tracks which licenses are enabled for a tenant
 */
export interface TenantLicenses {
  enabled: Record<LicenseKey, boolean>;
}

/**
 * Evidence collected during control assessment
 */
export interface Evidence {
  kind: string;  // e.g., "policy", "config", "log"
  value: string; // serialized evidence data
}

/**
 * Result of assessing a single control
 */
export interface ControlResult {
  /** Reference to the control ID */
  controlId: string;
  /** Auto-detected result from assessment */
  result: TestResult;
  /** User-selected action status */
  status: ControlStatus;
  /** Evidence supporting the status */
  evidence?: Evidence[];
  /** ISO timestamp of last assessment */
  lastCheckedAt: string;
  /** Additional notes or details */
  notes?: string;
}

/**
 * Weight configuration - SINGLE SOURCE OF TRUTH
 * Used by both Policies page and testing pages
 */
export interface WeightConfig {
  /** Pillar-level weights, should sum to 100 */
  pillarWeights: Record<Pillar, number>;
  /** Per-control weight overrides (controlId -> weight 0-100) */
  controlWeightOverrides: Record<string, number>;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Username/email of last modifier */
  updatedBy: string;
}

/**
 * Audit event for tracking weight changes
 */
export interface AuditEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: "WEIGHT_CHANGED" | "STATUS_CHANGED" | "LICENSE_CHANGED" | "TEST_CREATED" | "TEST_DELETED" | "TEST_RESULT_CHANGED" | "CONTROL_ENABLED" | "CONTROL_DISABLED" | "BULK_ENABLE" | "BULK_DISABLE";
  /** Who made the change */
  actor: string;
  /** ISO timestamp */
  at: string;
  /** Change details */
  details: {
    controlId?: string;
    controlTitle?: string;
    pillar?: Pillar;
    before: unknown;
    after: unknown;
  };
}

// ============================================================================
// SCORING RESULT TYPES
// ============================================================================

export interface PillarScore {
  pillar: Pillar;
  score: number;
  max: number;
  percent: number;
  controlCount: number;
  passedCount: number;
}

export interface ScoreResult {
  score: number;
  max: number;
  percent: number;
  byPillar: Record<Pillar, PillarScore>;
}

export interface ComputedScores {
  /** Score including only licensed controls */
  achievable: ScoreResult;
  /** Score including all controls */
  fullCoverage: ScoreResult;
  /** Points available if licenses are upgraded */
  upgradeOpportunityPoints: number;
  /** Number of tests unavailable due to licensing */
  unavailableTestCount: number;
}

// ============================================================================
// LICENSE INFO
// ============================================================================

export interface LicenseInfo {
  key: LicenseKey;
  displayName: string;
  description: string;
  purchaseUrl: string;
}

export const LICENSE_INFO: Record<LicenseKey, LicenseInfo> = {
  ENTRA_P1: {
    key: "ENTRA_P1",
    displayName: "Microsoft Entra ID P1",
    description: "Conditional Access, MFA, Self-Service Password Reset, and more",
    purchaseUrl: "https://www.microsoft.com/en-us/security/business/microsoft-entra-pricing",
  },
  ENTRA_P2: {
    key: "ENTRA_P2",
    displayName: "Microsoft Entra ID P2",
    description: "Identity Protection, Privileged Identity Management, Access Reviews",
    purchaseUrl: "https://www.microsoft.com/en-us/security/business/microsoft-entra-pricing",
  },
  INTUNE_P1: {
    key: "INTUNE_P1",
    displayName: "Microsoft Intune Plan 1",
    description: "Device management, app protection, compliance policies",
    purchaseUrl: "https://www.microsoft.com/en-us/security/business/microsoft-intune-pricing",
  },
  MDE_P1: {
    key: "MDE_P1",
    displayName: "Microsoft Defender for Endpoint P1",
    description: "Next-generation protection, attack surface reduction",
    purchaseUrl: "https://www.microsoft.com/en-us/security/business/endpoint-security/microsoft-defender-endpoint",
  },
  MDE_P2: {
    key: "MDE_P2",
    displayName: "Microsoft Defender for Endpoint P2",
    description: "Full EDR, automated investigation, threat analytics",
    purchaseUrl: "https://www.microsoft.com/en-us/security/business/endpoint-security/microsoft-defender-endpoint",
  },
  ENTRA_GOVERNANCE: {
    key: "ENTRA_GOVERNANCE",
    displayName: "Microsoft Entra ID Governance",
    description: "Lifecycle workflows, entitlement management, access reviews",
    purchaseUrl: "https://www.microsoft.com/en-us/security/business/identity-access/microsoft-entra-id-governance",
  },
  ENTRA_WORKLOAD_ID: {
    key: "ENTRA_WORKLOAD_ID",
    displayName: "Microsoft Entra Workload ID",
    description: "Secure workload identities and service principals",
    purchaseUrl: "https://www.microsoft.com/en-us/security/business/identity-access/microsoft-entra-workload-id",
  },
  M365_E3: {
    key: "M365_E3",
    displayName: "Microsoft 365 E3",
    description: "Office apps, Windows 11 Enterprise, Entra ID P1, Intune",
    purchaseUrl: "https://www.microsoft.com/en-us/microsoft-365/enterprise/e3",
  },
  M365_E5: {
    key: "M365_E5",
    displayName: "Microsoft 365 E5",
    description: "E3 plus Entra ID P2, Defender for Endpoint P2, advanced compliance",
    purchaseUrl: "https://www.microsoft.com/en-us/microsoft-365/enterprise/e5",
  },
  DEFENDER_CLOUD: {
    key: "DEFENDER_CLOUD",
    displayName: "Microsoft Defender for Cloud",
    description: "Cloud security posture management and workload protection",
    purchaseUrl: "https://azure.microsoft.com/en-us/products/defender-for-cloud",
  },
};

// ============================================================================
// DEFAULTS
// ============================================================================

export const DEFAULT_PILLAR_WEIGHTS: Record<Pillar, number> = {
  [Pillar.Identity]: 25,
  [Pillar.Devices]: 25,
  [Pillar.Data]: 20,
  [Pillar.Apps]: 15,
  [Pillar.Infrastructure]: 15,
};

export const DEFAULT_TENANT_LICENSES: TenantLicenses = {
  enabled: {
    ENTRA_P1: true,
    ENTRA_P2: false,
    INTUNE_P1: true,
    MDE_P1: false,
    MDE_P2: false,
    ENTRA_GOVERNANCE: false,
    ENTRA_WORKLOAD_ID: false,
    M365_E3: true,
    M365_E5: false,
    DEFENDER_CLOUD: false,
  },
};

export const DEFAULT_WEIGHT_CONFIG: WeightConfig = {
  pillarWeights: { ...DEFAULT_PILLAR_WEIGHTS },
  controlWeightOverrides: {},
  updatedAt: new Date().toISOString(),
  updatedBy: "system",
};

// ============================================================================
// DISPLAY NAME MAPPINGS
// ============================================================================

export const TEST_RESULT_DISPLAY_NAMES: Record<TestResult, string> = {
  [TestResult.PASSED]: "Passed",
  [TestResult.FAILED]: "Failed",
  [TestResult.INVESTIGATE]: "Investigate",
  [TestResult.NOT_RUN]: "Not Run",
};

export const TEST_RESULT_COLORS: Record<TestResult, { bg: string; text: string; icon: string }> = {
  [TestResult.PASSED]: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", icon: "text-green-500" },
  [TestResult.FAILED]: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", icon: "text-red-500" },
  [TestResult.INVESTIGATE]: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", icon: "text-amber-500" },
  [TestResult.NOT_RUN]: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-500 dark:text-gray-400", icon: "text-gray-400" },
};

export const STATUS_DISPLAY_NAMES: Record<ControlStatus, string> = {
  [ControlStatus.TO_ADDRESS]: "To Address",
  [ControlStatus.PLANNED]: "Planned",
  [ControlStatus.RISK_ACCEPTED]: "Risk Accepted",
  [ControlStatus.ALTERNATE_MITIGATION]: "Alternate Mitigation",
  [ControlStatus.THIRD_PARTY]: "Third Party",
  [ControlStatus.COMPLETED]: "Completed",
  [ControlStatus.NOT_LICENSED]: "Not Licensed",
};

export const STATUS_COLORS: Record<ControlStatus, { bg: string; text: string; icon: string }> = {
  [ControlStatus.TO_ADDRESS]: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", icon: "text-red-500" },
  [ControlStatus.PLANNED]: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", icon: "text-blue-500" },
  [ControlStatus.RISK_ACCEPTED]: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", icon: "text-amber-500" },
  [ControlStatus.ALTERNATE_MITIGATION]: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", icon: "text-green-500" },
  [ControlStatus.THIRD_PARTY]: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", icon: "text-purple-500" },
  [ControlStatus.COMPLETED]: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", icon: "text-green-500" },
  [ControlStatus.NOT_LICENSED]: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-500 dark:text-gray-400", icon: "text-gray-400" },
};

export const PILLAR_COLORS: Record<Pillar, { bg: string; text: string; border: string }> = {
  [Pillar.Identity]: { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-400", border: "border-indigo-300 dark:border-indigo-700" },
  [Pillar.Devices]: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", border: "border-blue-300 dark:border-blue-700" },
  [Pillar.Data]: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", border: "border-green-300 dark:border-green-700" },
  [Pillar.Apps]: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", border: "border-purple-300 dark:border-purple-700" },
  [Pillar.Infrastructure]: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", border: "border-orange-300 dark:border-orange-700" },
};
