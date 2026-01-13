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
 * Control status model supporting Microsoft Secure Score status concepts
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
  /** Current status of the control */
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
  type: "WEIGHT_CHANGED" | "STATUS_CHANGED" | "LICENSE_CHANGED";
  /** Who made the change */
  actor: string;
  /** ISO timestamp */
  at: string;
  /** Change details */
  details: {
    controlId?: string;
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
