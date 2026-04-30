/**
 * Zero Trust Assessment Store
 * 
 * Zustand store managing:
 * - Controls (from seed data)
 * - Control results (status, evidence)
 * - Tenant licenses
 * - Weight configuration (single source of truth for policies and testing pages)
 * - Audit events
 * - Current user context
 * 
 * Persistence: weightConfig and auditEvents are persisted to localStorage.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  Control,
  ControlResult,
  ControlStatus,
  TestResult,
  TenantLicenses,
  WeightConfig,
  AuditEvent,
  Pillar,
  CustomPolicy,
  DEFAULT_TENANT_LICENSES,
  DEFAULT_WEIGHT_CONFIG,
  ComputedScores,
} from '../types/zeroTrust';
import { allControls, mockControlResults } from '../data/controls.seed';
import { computeScores } from '../lib/scoring';
import * as testConfigService from '../services/testConfigService';
import * as customPolicyService from '../services/customPolicyService';

// ============================================================================
// USER TYPE
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'Admin' | 'Viewer' | 'Operator';
}

// Default mock user
const DEFAULT_USER: User = {
  id: 'user-1',
  email: 'admin@contoso.com',
  name: 'Admin User',
  role: 'Admin',
};

// ============================================================================
// MODULE CUSTOM TEST TYPE  (FYP three-module architecture)
// ============================================================================

export type FypModule = 'device_posture' | 'context_analysis' | 'trust_scoring_engine';

/**
 * Custom-test "check types". Each one is a small, testable predicate the
 * Run button can evaluate in a demo-friendly way.  Scoped per module so
 * the form can offer only the predicates relevant for that module.
 */
export type CheckType =
  // device_posture
  | 'device_compliant'
  | 'av_healthy'
  | 'firewall_enabled'
  | 'disk_encryption_enabled'
  | 'av_signatures_fresh'
  | 'intune_compliant'
  // context_analysis
  | 'known_location'
  | 'trusted_network'
  | 'unusual_network_flag'
  | 'admin_requires_trusted_network'
  | 'approved_region'
  | 'not_marked_risky'
  // trust_scoring_engine
  | 'overall_score_above_threshold'
  | 'module_score_above_threshold'
  | 'device_score_above_threshold'
  | 'context_score_above_threshold'
  | 'custom';

/**
 * Rich result payload produced each time a custom test is run.
 * Modelled on the built-in BaselineCheckCard so the fail/pass cards can
 * actually tell the admin *what* was checked, *what value* was detected,
 * *what value* was expected, and *what to change* to fix it.
 *
 * Because the FYP prototype does not yet ingest real posture / context
 * telemetry, every value is explicitly marked `isSimulated: true` and the
 * `source` string is a placeholder (e.g. "Intune compliance API (simulated)")
 * so the UI can distinguish simulated evidence from real evidence.
 */
export interface CustomTestResult {
  status: 'pass' | 'fail' | 'warning';
  summary: string;              // One-line result summary
  currentValue: string;         // Detected / observed state
  expectedValue: string;        // Expected / threshold
  reason: string;               // Why it passed or failed
  remediation: string;          // What the admin should change
  source: string;               // Data source (real or "(simulated)")
  isSimulated: boolean;         // true while backed by demo heuristics
  moduleContribution: number;   // 0-100 this test's contribution to its module score
  evaluatedAt: string;          // ISO timestamp
}

export interface ModuleCustomTest {
  id: string;
  module: FypModule;
  pillar: 'Identity' | 'Devices';
  title: string;
  description: string;
  rationale: string;                   // Why this test matters for the module
  checkType: CheckType;                // What the predicate semantically checks
  threshold?: number;                  // Optional 0-100 threshold (for *_score_above_threshold checks)
  detectionMode: 'manual' | 'heuristic';
  lastStatus: 'pass' | 'fail' | 'warning' | 'not_run';
  lastRun: string | null;
  lastResult?: CustomTestResult | null; // Full structured result from the most recent run
  createdAt: string;
  weight: number;                      // 1-10, contributes to module score
}

/**
 * Per-checkType evidence templates.
 *
 * These templates drive the simulated CustomTestResult produced each time
 * an admin clicks "Run" on a custom test.  They intentionally mimic the
 * shape of real posture / context telemetry so the result card matches
 * the built-in BaselineCheckCard format:
 *   status, summary, currentValue, expectedValue, reason, remediation, source.
 *
 * Everything here is flagged `isSimulated: true` on the resulting card so
 * the UI can show a clear "Simulated result – demo data" badge and not
 * mislead anyone into thinking the detected state is real.
 */
interface CheckEvidenceTemplate {
  source: string;
  expected: string;
  pass:    { currentValue: string; summary: string; reason: string; remediation: string };
  warning: { currentValue: string; summary: string; reason: string; remediation: string };
  fail:    { currentValue: string; summary: string; reason: string; remediation: string };
}

const CHECK_EVIDENCE_TEMPLATES: Record<Exclude<CheckType, 'custom'>, CheckEvidenceTemplate> = {
  // -------- device_posture --------
  device_compliant: {
    source: 'Intune / MDM compliance API (simulated)',
    expected: 'Device marked compliant by MDM at sign-in',
    pass:    { currentValue: 'complianceState = compliant, lastReported = 12 min ago',
               summary: 'Device reports compliant in MDM',
               reason:  'MDM returned compliant within the freshness window.',
               remediation: 'No action required.' },
    warning: { currentValue: 'complianceState = compliant, lastReported = 3 days ago',
               summary: 'Compliance signal is stale',
               reason:  'Device has not checked in with MDM recently — state may no longer reflect reality.',
               remediation: 'Force an MDM sync on the endpoint (Settings → Accounts → Access work or school → Sync).' },
    fail:    { currentValue: 'complianceState = noncompliant (policy: "Corp-Baseline-v3")',
               summary: 'Device is non-compliant in MDM',
               reason:  'MDM policy "Corp-Baseline-v3" marks the device as non-compliant.',
               remediation: 'Open Intune → Devices → select the device → review failed settings and remediate, then re-sync.' },
  },
  av_healthy: {
    source: 'Endpoint posture agent / Defender (simulated)',
    expected: 'AV service running AND signatures < 24h old',
    pass:    { currentValue: 'Defender: running, signatures age = 4h',
               summary: 'Endpoint AV is healthy',
               reason:  'AV service is active and signatures are within the 24h freshness window.',
               remediation: 'No action required.' },
    warning: { currentValue: 'Defender: running, signatures age = 28h',
               summary: 'AV signatures slightly stale',
               reason:  'Signatures are just over the 24h threshold.',
               remediation: 'Trigger a signature update: `Update-MpSignature` or let the scheduled task run.' },
    fail:    { currentValue: 'Defender service = stopped, signatures age = 5 days',
               summary: 'Endpoint AV is not healthy',
               reason:  'AV service is stopped and signatures are 5 days old — endpoint is effectively unprotected.',
               remediation: 'Start the AV service (`Start-Service WinDefend`) and run `Update-MpSignature`.' },
  },
  firewall_enabled: {
    source: 'Host firewall inventory (simulated)',
    expected: 'Host firewall enabled on the corporate (Domain) profile',
    pass:    { currentValue: 'Domain=on, Private=on, Public=on',
               summary: 'Host firewall is enabled on all profiles',
               reason:  'All three profiles (Domain/Private/Public) report enabled.',
               remediation: 'No action required.' },
    warning: { currentValue: 'Domain=on, Private=on, Public=off',
               summary: 'Public profile firewall disabled',
               reason:  'Public profile is off — risk when roaming on untrusted networks.',
               remediation: 'Enable Public profile: `Set-NetFirewallProfile -Profile Public -Enabled True`.' },
    fail:    { currentValue: 'Domain=off, Private=off, Public=off',
               summary: 'Host firewall is disabled',
               reason:  'Firewall is off on all profiles — device posture cannot be trusted.',
               remediation: 'Enable all profiles: `Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True`.' },
  },
  disk_encryption_enabled: {
    source: 'BitLocker / FileVault inventory (simulated)',
    expected: 'System drive fully encrypted',
    pass:    { currentValue: 'C:\\ BitLocker = FullyEncrypted (XTS-AES 256)',
               summary: 'Disk encryption is enabled',
               reason:  'System drive is fully encrypted with the approved cipher.',
               remediation: 'No action required.' },
    warning: { currentValue: 'C:\\ BitLocker = EncryptionInProgress (47%)',
               summary: 'Encryption still in progress',
               reason:  'BitLocker is encrypting the drive but has not finished — partial protection.',
               remediation: 'Leave the device powered and connected until encryption reaches 100%.' },
    fail:    { currentValue: 'C:\\ BitLocker = Off',
               summary: 'System drive is NOT encrypted',
               reason:  'BitLocker is disabled — a lost/stolen device would leak data.',
               remediation: 'Enable BitLocker via GPO / Intune or manually: `Enable-BitLocker -MountPoint "C:"`.' },
  },
  av_signatures_fresh: {
    source: 'Defender signature inventory (simulated)',
    expected: 'AV signatures < 24 hours old',
    pass:    { currentValue: 'signatures age = 3h 12m',
               summary: 'AV signatures are fresh',
               reason:  'Last update within the 24h window.',
               remediation: 'No action required.' },
    warning: { currentValue: 'signatures age = 29h',
               summary: 'Signatures marginally stale',
               reason:  'Just over 24h since last update.',
               remediation: 'Run `Update-MpSignature` or verify the signature update task is healthy.' },
    fail:    { currentValue: 'signatures age = 6 days',
               summary: 'Signatures dangerously stale',
               reason:  'Definitions are 6 days old — new threats are not being detected.',
               remediation: 'Force update: `Update-MpSignature`. If it fails, check WSUS/Defender update source.' },
  },
  intune_compliant: {
    source: 'Microsoft Graph /deviceManagement/managedDevices (simulated)',
    expected: 'managedDevice.complianceState = "compliant"',
    pass:    { currentValue: 'complianceState = compliant',
               summary: 'Intune reports device compliant',
               reason:  'Assigned compliance profile is satisfied.',
               remediation: 'No action required.' },
    warning: { currentValue: 'complianceState = inGracePeriod',
               summary: 'Device in compliance grace period',
               reason:  'Device failed policy but is inside the admin-configured grace window.',
               remediation: 'Investigate and remediate before grace period expires.' },
    fail:    { currentValue: 'complianceState = noncompliant',
               summary: 'Intune reports device non-compliant',
               reason:  'One or more compliance settings failed.',
               remediation: 'Intune admin centre → Devices → this device → "View compliance" → fix the failing settings.' },
  },
  // -------- context_analysis --------
  known_location: {
    source: 'Azure AD sign-in logs + Named Locations (simulated)',
    expected: 'Sign-in IP inside a configured named location',
    pass:    { currentValue: 'IP 10.20.1.42 matches named location "HQ Office"',
               summary: 'Access from known named location',
               reason:  'Source IP matches a configured named location.',
               remediation: 'No action required.' },
    warning: { currentValue: 'IP 203.0.113.7 matches "Home-UserX" (personal)',
               summary: 'Access from personal named location',
               reason:  'Recognised but lower-trust location.',
               remediation: 'Require step-up MFA for sensitive apps when accessed from personal locations.' },
    fail:    { currentValue: 'IP 198.51.100.22 (no named location)',
               summary: 'Access from unknown location',
               reason:  'Source IP is not inside any configured named location.',
               remediation: 'Add the IP to Named Locations if legitimate, or enforce CA policy blocking unknown locations.' },
  },
  trusted_network: {
    source: 'Device egress telemetry + trusted-ASN list (simulated)',
    expected: 'Egress ASN on the trusted corporate network list',
    pass:    { currentValue: 'ASN AS64501 (Corp-HQ) — trusted',
               summary: 'Connected from trusted network',
               reason:  'Egress ASN is on the trusted list.',
               remediation: 'No action required.' },
    warning: { currentValue: 'ASN AS15169 (Google LLC) — home/VPN',
               summary: 'Non-corporate but low-risk network',
               reason:  'Recognised consumer ASN — acceptable for low-risk resources.',
               remediation: 'Restrict high-risk apps to trusted ASNs via Conditional Access.' },
    fail:    { currentValue: 'ASN AS14061 (DigitalOcean) — untrusted',
               summary: 'Not connected from a trusted network',
               reason:  'Egress ASN is not on the trusted list.',
               remediation: 'Require the user to VPN into corporate or deny access from untrusted ASNs.' },
  },
  unusual_network_flag: {
    source: 'Sign-in behaviour analytics (simulated)',
    expected: 'No unusual-network flag in the last 24h',
    pass:    { currentValue: 'unusualNetwork = false',
               summary: 'No unusual-network flags raised',
               reason:  'Risk engine did not raise the flag on recent sign-ins.',
               remediation: 'No action required.' },
    warning: { currentValue: 'unusualNetwork = true (low confidence)',
               summary: 'Soft unusual-network flag',
               reason:  'Risk engine raised a low-confidence flag.',
               remediation: 'Monitor subsequent sign-ins; consider MFA re-challenge.' },
    fail:    { currentValue: 'unusualNetwork = true (high confidence, new ASN)',
               summary: 'Unusual-network flag raised',
               reason:  'User signed in from a network they have never used before — possible account takeover.',
               remediation: 'Force re-authentication and review recent sign-ins; rotate credentials if suspicious.' },
  },
  admin_requires_trusted_network: {
    source: 'Privileged sign-in logs (simulated)',
    expected: 'Privileged role sign-ins only from trusted networks',
    pass:    { currentValue: 'Last admin sign-in from ASN AS64501 (Corp-HQ)',
               summary: 'Admin access from trusted network',
               reason:  'Privileged sign-in originated from a trusted ASN.',
               remediation: 'No action required.' },
    warning: { currentValue: 'Last admin sign-in from home ASN (MFA satisfied)',
               summary: 'Admin access from personal network with MFA',
               reason:  'Policy allowed the sign-in because step-up MFA succeeded.',
               remediation: 'Consider restricting privileged roles to corporate networks only.' },
    fail:    { currentValue: 'Admin sign-in from ASN AS14061 (DigitalOcean), no step-up MFA',
               summary: 'Admin signed in from untrusted network without step-up',
               reason:  'Privileged role was used from an untrusted ASN and no step-up challenge was required.',
               remediation: 'Create a CA policy: require trusted network OR step-up MFA for roles tagged privileged.' },
  },
  approved_region: {
    source: 'GeoIP on last device check-in (simulated)',
    expected: 'Device last seen from an approved country/region',
    pass:    { currentValue: 'Last check-in: MY (Malaysia) — approved',
               summary: 'Device seen in approved region',
               reason:  'Last check-in country is on the approved list.',
               remediation: 'No action required.' },
    warning: { currentValue: 'Last check-in: SG (Singapore) — allowed with caution',
               summary: 'Nearby but not primary region',
               reason:  'Country is on the soft-allow list.',
               remediation: 'Validate the device is roaming legitimately.' },
    fail:    { currentValue: 'Last check-in: RU (Russia) — not approved',
               summary: 'Device seen from non-approved region',
               reason:  'Last check-in country is not on the approved list.',
               remediation: 'Investigate possible theft / compromise; block or wipe the device if unauthorised.' },
  },
  not_marked_risky: {
    source: 'Defender for Endpoint risk API (simulated)',
    expected: 'No "risky device" event in the last 7 days',
    pass:    { currentValue: 'riskLevel = none (last 7d)',
               summary: 'Device not marked risky recently',
               reason:  'MDE has not raised the device as risky in the past week.',
               remediation: 'No action required.' },
    warning: { currentValue: 'riskLevel = low (last 7d)',
               summary: 'Device had low-risk incidents',
               reason:  'MDE raised low-severity incidents recently.',
               remediation: 'Review incidents in Defender portal and close out false positives.' },
    fail:    { currentValue: 'riskLevel = high (3 days ago, still active)',
               summary: 'Device recently marked risky by MDE',
               reason:  'Active high-severity risk on the device.',
               remediation: 'Isolate the device in Defender, run AV scan, reset credentials used on it.' },
  },
  // -------- trust_scoring_engine --------
  overall_score_above_threshold: {
    source: 'Trust Scoring Engine output (simulated)',
    expected: '{threshold} / 100',  // substituted at render time
    pass:    { currentValue: '{score} / 100',
               summary: 'Overall trust score meets threshold',
               reason:  'Aggregated score across the three modules is at or above the configured threshold.',
               remediation: 'No action required.' },
    warning: { currentValue: '{score} / 100',
               summary: 'Overall trust score marginal',
               reason:  'Score is within 10 points of the threshold — access may be denied under load.',
               remediation: 'Raise the weakest module (usually posture or context) to restore headroom.' },
    fail:    { currentValue: '{score} / 100',
               summary: 'Overall trust score below threshold',
               reason:  'Aggregated trust score is below the configured policy threshold.',
               remediation: 'Resolve the failing Posture/Context custom tests, or (with caution) lower the access threshold.' },
  },
  module_score_above_threshold: {
    source: 'Per-module scoring (simulated)',
    expected: 'Every module >= {threshold}',
    pass:    { currentValue: 'device={dp}, context={ca}, engine={ts}',
               summary: 'All module scores above threshold',
               reason:  'Every FYP module is at or above the threshold.',
               remediation: 'No action required.' },
    warning: { currentValue: 'device={dp}, context={ca}, engine={ts}',
               summary: 'Weakest module within 10 points of threshold',
               reason:  'One module is close to failing the per-module gate.',
               remediation: 'Strengthen the weakest module’s custom tests.' },
    fail:    { currentValue: 'device={dp}, context={ca}, engine={ts}',
               summary: 'At least one module is below threshold',
               reason:  'Per-module gate failed — high posture cannot mask a weak context (or vice versa).',
               remediation: 'Identify the failing module in the Modules tab and fix its underlying custom tests.' },
  },
  device_score_above_threshold: {
    source: 'Device Posture module score (simulated)',
    expected: '>= {threshold}',
    pass:    { currentValue: 'device={dp}',
               summary: 'Device Posture score meets threshold',
               reason:  'Posture module is at or above the threshold.',
               remediation: 'No action required.' },
    warning: { currentValue: 'device={dp}',
               summary: 'Device Posture marginal',
               reason:  'Posture score is within 10 points of threshold.',
               remediation: 'Fix the most-failed posture checks (AV, firewall, encryption).' },
    fail:    { currentValue: 'device={dp}',
               summary: 'Device Posture score below threshold',
               reason:  'Posture module is below threshold — endpoint health insufficient.',
               remediation: 'Remediate failing posture custom tests or raise posture-module weight.' },
  },
  context_score_above_threshold: {
    source: 'Context Analysis module score (simulated)',
    expected: '>= {threshold}',
    pass:    { currentValue: 'context={ca}',
               summary: 'Context Analysis score meets threshold',
               reason:  'Context module is at or above the threshold.',
               remediation: 'No action required.' },
    warning: { currentValue: 'context={ca}',
               summary: 'Context Analysis marginal',
               reason:  'Context score is within 10 points of threshold.',
               remediation: 'Review named locations / trusted networks; enable more context signals.' },
    fail:    { currentValue: 'context={ca}',
               summary: 'Context Analysis score below threshold',
               reason:  'Context module is below threshold — sign-in environment not trusted.',
               remediation: 'Configure named locations, trusted networks, and enable the unusual-network flag.' },
  },
};

/**
 * Build a CustomTestResult for a given test + status.  Pure function,
 * deterministic given its inputs; callers randomise `status` as needed.
 *
 * `scores` carries the current module/overall scores so threshold-based
 * checks can quote the real current number.
 */
function buildCustomTestResult(
  test: ModuleCustomTest,
  status: 'pass' | 'fail' | 'warning',
  scores: { overall: number; device_posture: number; context_analysis: number; trust_scoring_engine: number },
): CustomTestResult {
  const nowIso = new Date().toISOString();

  // Manual / freeform custom tests have no backing evidence — be honest.
  if (test.checkType === 'custom') {
    return {
      status,
      summary: status === 'pass'
        ? 'Manual test marked as passed by the admin'
        : status === 'warning'
          ? 'Manual test marked as needs review'
          : 'Manual test marked as failed',
      currentValue: 'Manual / custom input — no automated evidence',
      expectedValue: test.description || 'Admin-defined condition',
      reason: 'This is a manual test; the status was set by the admin rather than evaluated from telemetry.',
      remediation: status === 'pass'
        ? 'No action required.'
        : 'Review the manual checklist and update the status after remediating.',
      source: 'Manual / custom input',
      isSimulated: true,
      moduleContribution: Math.round((test.weight / 10) * (status === 'pass' ? 100 : status === 'warning' ? 50 : 0)),
      evaluatedAt: nowIso,
    };
  }

  const tpl = CHECK_EVIDENCE_TEMPLATES[test.checkType];
  const slot = tpl[status];

  // Threshold substitution for scoring-engine checks
  const threshold = test.threshold ?? 60;
  const sub = (s: string): string => s
    .replace('{threshold}', String(threshold))
    .replace('{score}', String(scores.overall))
    .replace('{dp}', String(scores.device_posture))
    .replace('{ca}', String(scores.context_analysis))
    .replace('{ts}', String(scores.trust_scoring_engine));

  return {
    status,
    summary: sub(slot.summary),
    currentValue: sub(slot.currentValue),
    expectedValue: sub(tpl.expected),
    reason: sub(slot.reason),
    remediation: sub(slot.remediation),
    source: tpl.source,
    isSimulated: true,
    moduleContribution: Math.round((test.weight / 10) * (status === 'pass' ? 100 : status === 'warning' ? 50 : 0)),
    evaluatedAt: nowIso,
  };
}

const SEED_MODULE_TESTS: ModuleCustomTest[] = [
  // ---------- Identity pillar ----------
  // Device Posture module
  {
    id: 'mct-id-dp-1', module: 'device_posture', pillar: 'Identity',
    title: 'Require compliant device before access',
    description: 'The device requesting access must be marked compliant by MDM (e.g. Intune) before SSO issues a token.',
    rationale: 'Device compliance at sign-in is the foundation of Zero Trust on the identity side.',
    checkType: 'device_compliant',
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 8,
  },
  {
    id: 'mct-id-dp-2', module: 'device_posture', pillar: 'Identity',
    title: 'Require endpoint AV healthy',
    description: 'Endpoint anti-virus must report healthy (running, signatures current) before the identity grants access.',
    rationale: 'A sick AV agent means the endpoint cannot be trusted for sensitive identity operations.',
    checkType: 'av_healthy',
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 7,
  },
  // Context Analysis module
  {
    id: 'mct-id-ca-1', module: 'context_analysis', pillar: 'Identity',
    title: 'Block access from unknown location',
    description: 'Deny sign-in when the source IP is outside configured named locations.',
    rationale: 'Unknown-location access is a classic context signal for compromised credentials.',
    checkType: 'known_location',
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 7,
  },
  {
    id: 'mct-id-ca-2', module: 'context_analysis', pillar: 'Identity',
    title: 'Flag access from unusual network',
    description: 'Raise a warning when the user signs in from an ASN / network they have not used before.',
    rationale: 'Unusual network patterns often precede account takeover.',
    checkType: 'unusual_network_flag',
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 5,
  },
  {
    id: 'mct-id-ca-3', module: 'context_analysis', pillar: 'Identity',
    title: 'Require trusted network for admin access',
    description: 'Privileged roles must sign in from a trusted corporate network; otherwise require step-up MFA.',
    rationale: 'Privileged access should be constrained by network context, not only credentials.',
    checkType: 'admin_requires_trusted_network',
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 8,
  },
  // Trust Scoring Engine module
  {
    id: 'mct-id-ts-1', module: 'trust_scoring_engine', pillar: 'Identity',
    title: 'Deny access if overall trust score below threshold',
    description: 'Refuse identity-side access when the aggregated trust score is below the configured policy threshold.',
    rationale: 'The overall score is the final gate that consumes posture + context.',
    checkType: 'overall_score_above_threshold', threshold: 60,
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 10,
  },
  {
    id: 'mct-id-ts-2', module: 'trust_scoring_engine', pillar: 'Identity',
    title: 'Require minimum module score before accessing protected intranet',
    description: 'Each of the three FYP modules must individually score above the configured per-module threshold.',
    rationale: 'Prevents a single high-scoring module from masking a weak one.',
    checkType: 'module_score_above_threshold', threshold: 50,
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 8,
  },

  // ---------- Devices pillar ----------
  // Device Posture module
  {
    id: 'mct-dv-dp-1', module: 'device_posture', pillar: 'Devices',
    title: 'Firewall enabled',
    description: 'Host firewall active and applying the corporate profile.',
    rationale: 'A disabled firewall is a strong device-posture failure.',
    checkType: 'firewall_enabled',
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 6,
  },
  {
    id: 'mct-dv-dp-2', module: 'device_posture', pillar: 'Devices',
    title: 'Disk encryption enabled',
    description: 'BitLocker / FileVault encryption enabled on system drives.',
    rationale: 'Unencrypted endpoints leak data when lost.',
    checkType: 'disk_encryption_enabled',
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 7,
  },
  {
    id: 'mct-dv-dp-3', module: 'device_posture', pillar: 'Devices',
    title: 'AV signatures up to date',
    description: 'Defender / third-party AV signatures fresher than 24 hours.',
    rationale: 'Stale signatures are the most direct posture miss.',
    checkType: 'av_signatures_fresh',
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 6,
  },
  {
    id: 'mct-dv-dp-4', module: 'device_posture', pillar: 'Devices',
    title: 'Device is compliant in Intune',
    description: 'Intune reports the device as compliant against the assigned configuration profile.',
    rationale: 'MDM compliance is the canonical device-posture signal.',
    checkType: 'intune_compliant',
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 8,
  },
  // Context Analysis module
  {
    id: 'mct-dv-ca-1', module: 'context_analysis', pillar: 'Devices',
    title: 'Device seen from approved region',
    description: 'Device most recent check-in IP resolves to an approved country / region.',
    rationale: 'Geolocation is a cheap but useful context signal for stolen devices.',
    checkType: 'approved_region',
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 5,
  },
  {
    id: 'mct-dv-ca-2', module: 'context_analysis', pillar: 'Devices',
    title: 'Device connected from trusted network',
    description: 'Device egress IP / ASN is on the trusted corporate network list.',
    rationale: 'Trusted network context lets posture-weak devices still be accepted for low-risk tasks.',
    checkType: 'trusted_network',
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 5,
  },
  {
    id: 'mct-dv-ca-3', module: 'context_analysis', pillar: 'Devices',
    title: 'Device not marked risky recently',
    description: 'Device has not been raised as risky by Defender / MDE in the last 7 days.',
    rationale: 'Recently-risky devices must not silently regain access.',
    checkType: 'not_marked_risky',
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 6,
  },
  // Trust Scoring Engine module
  {
    id: 'mct-dv-ts-1', module: 'trust_scoring_engine', pillar: 'Devices',
    title: 'Device posture score above threshold',
    description: 'Device Posture module score must be above the configured threshold.',
    rationale: 'Per-module enforcement prevents weak posture being averaged away.',
    checkType: 'device_score_above_threshold', threshold: 60,
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 7,
  },
  {
    id: 'mct-dv-ts-2', module: 'trust_scoring_engine', pillar: 'Devices',
    title: 'Context score above threshold',
    description: 'Context Analysis module score must be above the configured threshold.',
    rationale: 'A device with strong posture but bad context should still be questioned.',
    checkType: 'context_score_above_threshold', threshold: 50,
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 6,
  },
  {
    id: 'mct-dv-ts-3', module: 'trust_scoring_engine', pillar: 'Devices',
    title: 'Overall access trust score above threshold',
    description: 'Weighted overall trust score across all three modules must be above the policy threshold.',
    rationale: 'This is the headline output of the trust scoring engine for a device.',
    checkType: 'overall_score_above_threshold', threshold: 70,
    detectionMode: 'heuristic', lastStatus: 'not_run', lastRun: null,
    createdAt: new Date().toISOString(), weight: 10,
  },
];

const DEFAULT_MODULE_WEIGHTS = {
  device_posture: 40,
  context_analysis: 30,
  trust_scoring_engine: 30,
};

const DEFAULT_ACCESS_THRESHOLD = 60;

// ============================================================================
// STORE STATE TYPE
// ============================================================================

interface ZeroTrustState {
  // Data
  controls: Control[];
  controlResults: ControlResult[];
  tenantLicenses: TenantLicenses;
  weightConfig: WeightConfig;
  auditEvents: AuditEvent[];
  currentUser: User;
  customControls: Control[]; // User-defined controls (legacy custom tests)
  disabledControlIds: Set<string>; // Controls that are disabled
  customPolicies: CustomPolicy[]; // Customer-defined policies (new dual-layer)

  // Identity check results (persisted across navigation)
  identityCheckResults: any[];
  identityCheckSummary: any | null;
  identityIsMock: boolean;

  // Device check results (persisted across navigation)
  deviceCheckResults: any[];
  deviceCheckSummary: any | null;
  deviceIsMock: boolean;

  // Module weights (the 3 FYP modules) + access threshold
  moduleWeights: { device_posture: number; context_analysis: number; trust_scoring_engine: number };
  accessThreshold: number; // 0-100, trust score required to access protected resource

  // Module-aligned custom tests (Identity page + Devices page each have 3 module tabs)
  moduleCustomTests: ModuleCustomTest[];
  
  // API sync status
  isLoading: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  
  // Computed (cached)
  _cachedScores: ComputedScores | null;
  
  // Actions - API Sync
  loadFromAPI: () => Promise<void>;
  syncToAPI: (testId: string, update: Record<string, unknown>) => Promise<void>;
  createCustomTestInAPI: (control: Control) => Promise<string | null>;
  deleteCustomTestInAPI: (testId: string) => Promise<boolean>;
  
  // Actions - Custom Policies
  loadCustomPolicies: (pillar?: string) => Promise<void>;
  addCustomPolicy: (data: Parameters<typeof customPolicyService.createCustomPolicy>[0]) => Promise<CustomPolicy | null>;
  updateCustomPolicy: (policyId: string, data: Parameters<typeof customPolicyService.updateCustomPolicy>[1]) => Promise<void>;
  removeCustomPolicy: (policyId: string) => Promise<void>;
  
  // Actions - Controls
  setControls: (controls: Control[]) => void;
  addControl: (control: Omit<Control, 'id' | 'createdAt' | 'createdBy' | 'isCustom'>) => Promise<void>;
  updateControl: (controlId: string, updates: Partial<Control>) => void;
  deleteControl: (controlId: string) => void;
  toggleControlEnabled: (controlId: string) => void;
  setControlEnabled: (controlId: string, enabled: boolean) => void;
  enableAllControls: (pillar?: Pillar) => void;
  disableAllControls: (pillar?: Pillar) => void;
  
  // Actions - Results
  setControlResults: (results: ControlResult[]) => void;
  updateControlTestResult: (controlId: string, testResult: TestResult) => void;
  updateControlStatus: (controlId: string, status: ControlStatus, notes?: string) => void;
  
  // Actions - Licenses
  setTenantLicenses: (licenses: TenantLicenses) => void;
  toggleLicense: (license: string) => void;
  
  // Actions - Weights (creates audit events)
  setWeightConfig: (config: WeightConfig) => void;
  updatePillarWeight: (pillar: Pillar, weight: number) => void;
  updateControlWeight: (controlId: string, weight: number) => void;
  resetControlWeight: (controlId: string) => void;
  resetAllWeights: () => void;
  
  // Actions - Audit
  addAuditEvent: (event: Omit<AuditEvent, 'id' | 'at'>) => void;
  clearAuditEvents: () => void;
  
  // Actions - User
  setCurrentUser: (user: User) => void;

  // Actions - Identity Checks
  setIdentityCheckState: (results: any[], summary: any, isMock: boolean) => void;

  // Actions - Device Checks
  setDeviceCheckState: (results: any[], summary: any, isMock: boolean) => void;

  // Actions - Module Weights / Threshold
  setModuleWeight: (module: 'device_posture' | 'context_analysis' | 'trust_scoring_engine', value: number) => void;
  setAccessThreshold: (value: number) => void;

  // Actions - Module Custom Tests
  addModuleCustomTest: (test: Omit<ModuleCustomTest, 'id' | 'createdAt'>) => void;
  updateModuleCustomTest: (id: string, updates: Partial<ModuleCustomTest>) => void;
  deleteModuleCustomTest: (id: string) => void;
  runModuleCustomTest: (id: string, status?: 'pass' | 'fail' | 'warning') => void;
  
  // Computed getters
  getScores: () => ComputedScores;
  invalidateScoresCache: () => void;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useZeroTrustStore = create<ZeroTrustState>()(
  persist(
    (set, get) => ({
      // Initial state
      controls: allControls.map(c => ({ ...c, enabled: true, isCustom: false })),
      controlResults: mockControlResults,
      tenantLicenses: DEFAULT_TENANT_LICENSES,
      weightConfig: DEFAULT_WEIGHT_CONFIG,
      auditEvents: [],
      currentUser: DEFAULT_USER,
      customControls: [],
      disabledControlIds: new Set<string>(),
      customPolicies: [],
      identityCheckResults: [],
      identityCheckSummary: null,
      identityIsMock: false,
      deviceCheckResults: [],
      deviceCheckSummary: null,
      deviceIsMock: false,
      moduleWeights: { ...DEFAULT_MODULE_WEIGHTS },
      accessThreshold: DEFAULT_ACCESS_THRESHOLD,
      moduleCustomTests: SEED_MODULE_TESTS,
      isLoading: false,
      lastSyncedAt: null,
      syncError: null,
      _cachedScores: null,
      
      // Actions - API Sync
      loadFromAPI: async () => {
        set({ isLoading: true, syncError: null });
        try {
          const data = await testConfigService.loadTestConfigurations();
          const state = get();
          
          // Process default test overrides
          const newDisabledIds = new Set<string>();
          const newControlResults = [...state.controlResults];
          const newControls = [...state.controls];
          
          for (const config of data.defaults) {
            if (!config.isEnabled) {
              newDisabledIds.add(config.testId);
            }
            // Update result status if different
            const resultIdx = newControlResults.findIndex(r => r.controlId === config.testId);
            if (resultIdx >= 0 && config.actionStatus) {
              newControlResults[resultIdx] = {
                ...newControlResults[resultIdx],
                status: testConfigService.apiStatusToControlStatus(config.actionStatus),
              };
            }
            // Apply title/description overrides to default controls
            if (config.title || config.description) {
              const controlIdx = newControls.findIndex(c => c.id === config.testId);
              if (controlIdx >= 0) {
                newControls[controlIdx] = {
                  ...newControls[controlIdx],
                  ...(config.title ? { title: config.title } : {}),
                  ...(config.description ? { description: config.description } : {}),
                };
              }
            }
          }
          
          // Process custom tests
          const customControls = data.customs.map(testConfigService.customTestResponseToControl);
          
          set({
            controls: newControls,
            disabledControlIds: newDisabledIds,
            controlResults: newControlResults,
            customControls,
            isLoading: false,
            lastSyncedAt: new Date().toISOString(),
          });
          
          // Also load custom policies (separate from custom tests)
          get().loadCustomPolicies();
        } catch (error) {
          console.error('[ZeroTrustStore] loadFromAPI failed:', error);
          set({ 
            isLoading: false, 
            syncError: error instanceof Error ? error.message : 'Failed to load configurations' 
          });
        }
      },
      
      syncToAPI: async (testId, update) => {
        try {
          // Check if it's a custom test
          const state = get();
          const isCustom = state.customControls.some(c => c.id === testId);
          
          if (isCustom) {
            // Use custom test update endpoint
            await testConfigService.updateCustomTest(testId, {
              title: update.title as string | undefined,
              description: update.description as string | undefined,
              category: update.category as string | undefined,
              risk: update.risk as string | undefined,
              detection_mode: update.detectionMode as string | undefined,
              graph_query_config: update.graphQueryConfig as any,
              checklist_config: update.checklistConfig as any,
              is_enabled: update.enabled as boolean | undefined,
              action_status: update.actionStatus as string | undefined,
            });
          } else {
            // Use default test update endpoint
            await testConfigService.updateTestConfig(testId, {
              is_enabled: update.is_enabled as boolean | undefined ?? update.enabled as boolean | undefined,
              action_status: update.action_status as string | undefined ?? update.actionStatus as string | undefined,
              action_notes: update.action_notes as string | undefined,
              weight_override: update.weight_override as number | undefined,
              title: update.title as string | undefined,
              description: update.description as string | undefined,
            });
          }
        } catch (error) {
          console.error('Failed to sync to API:', error);
          // Don't throw - just log. Local state is source of truth for now
        }
      },
      
      createCustomTestInAPI: async (control) => {
        try {
          const response = await testConfigService.createCustomTest({
            title: control.title,
            description: control.description,
            pillar: control.pillar,
            category: control.category,
            risk: control.risk?.toLowerCase(),
            detection_mode: control.detectionMode || 'manual',
            graph_query_config: control.graphQueryConfig,
            checklist_config: control.checklistConfig,
          });
          return response.testId;
        } catch (error) {
          console.error('Failed to create custom test in API:', error);
          return null;
        }
      },
      
      deleteCustomTestInAPI: async (testId) => {
        try {
          await testConfigService.deleteCustomTest(testId);
          return true;
        } catch (error) {
          console.error('Failed to delete custom test from API:', error);
          return false;
        }
      },
      
      // Actions - Custom Policies
      loadCustomPolicies: async (pillar) => {
        try {
          const policies = await customPolicyService.listCustomPolicies(pillar);
          set({ customPolicies: policies });
        } catch (error) {
          console.error('[ZeroTrustStore] loadCustomPolicies failed:', error);
        }
      },
      
      addCustomPolicy: async (data) => {
        try {
          const policy = await customPolicyService.createCustomPolicy(data);
          set(state => ({
            customPolicies: [policy, ...state.customPolicies],
          }));
          return policy;
        } catch (error) {
          console.error('Failed to create custom policy:', error);
          return null;
        }
      },
      
      updateCustomPolicy: async (policyId, data) => {
        try {
          const updated = await customPolicyService.updateCustomPolicy(policyId, data);
          set(state => ({
            customPolicies: state.customPolicies.map(p =>
              p.policyId === policyId ? updated : p
            ),
          }));
        } catch (error) {
          console.error('Failed to update custom policy:', error);
        }
      },
      
      removeCustomPolicy: async (policyId) => {
        try {
          await customPolicyService.deleteCustomPolicy(policyId);
          set(state => ({
            customPolicies: state.customPolicies.filter(p => p.policyId !== policyId),
          }));
        } catch (error) {
          console.error('Failed to delete custom policy:', error);
        }
      },
      
      // Actions - Controls
      setControls: (controls) => {
        set({ controls, _cachedScores: null });
      },
      
      addControl: async (controlData) => {
        const state = get();
        
        // Create in API first to get the server-generated ID
        const tempControl: Control = {
          ...controlData,
          id: 'temp-' + Date.now(),
          isCustom: true,
          enabled: true,
          createdAt: new Date().toISOString(),
          createdBy: state.currentUser.email,
        };
        
        const apiTestId = await get().createCustomTestInAPI(tempControl);
        
        if (!apiTestId) {
          console.error('Failed to create custom test in API');
          return;
        }
        
        // Use the API-generated ID
        const newControl: Control = {
          ...tempControl,
          id: apiTestId,
        };
        
        get().addAuditEvent({
          type: 'TEST_CREATED',
          actor: state.currentUser.email,
          details: {
            controlId: apiTestId,
            controlTitle: tempControl.title,
            before: null,
            after: { title: tempControl.title },
          },
        });
        
        set({
          customControls: [...state.customControls, newControl],
          _cachedScores: null,
        });
      },
      
      updateControl: (controlId, updates) => {
        const state = get();
        
        // Check if it's a custom control
        const customIndex = state.customControls.findIndex(c => c.id === controlId);
        if (customIndex >= 0) {
          const newCustomControls = [...state.customControls];
          newCustomControls[customIndex] = { ...newCustomControls[customIndex], ...updates };
          
          get().addAuditEvent({
            type: 'STATUS_CHANGED',
            actor: state.currentUser.email,
            details: {
              controlId,
              controlTitle: state.customControls[customIndex].title,
              before: state.customControls[customIndex],
              after: updates,
            },
          });
          
          set({ customControls: newCustomControls, _cachedScores: null });
          
          // Sync to API
          get().syncToAPI(controlId, updates);
          return;
        }
        
        // Check if it's a default control
        const defaultIndex = state.controls.findIndex(c => c.id === controlId);
        if (defaultIndex >= 0) {
          const newControls = [...state.controls];
          newControls[defaultIndex] = { ...newControls[defaultIndex], ...updates };
          
          get().addAuditEvent({
            type: 'STATUS_CHANGED',
            actor: state.currentUser.email,
            details: {
              controlId,
              controlTitle: state.controls[defaultIndex].title,
              before: state.controls[defaultIndex],
              after: updates,
            },
          });
          
          set({ controls: newControls, _cachedScores: null });
          
          // Sync to API
          get().syncToAPI(controlId, updates);
        }
      },
      
      deleteControl: (controlId) => {
        const state = get();
        const control = state.customControls.find(c => c.id === controlId);
        
        if (control?.isCustom) {
          // Delete from API
          get().deleteCustomTestInAPI(controlId);
          
          get().addAuditEvent({
            type: 'TEST_DELETED',
            actor: state.currentUser.email,
            details: {
              controlId,
              controlTitle: control.title,
              before: { title: control.title },
              after: null,
            },
          });
          
          set({
            customControls: state.customControls.filter(c => c.id !== controlId),
            _cachedScores: null,
          });
        }
      },
      
      toggleControlEnabled: (controlId) => {
        const state = get();
        const newDisabled = new Set(state.disabledControlIds);
        const isNowEnabled = newDisabled.has(controlId);
        
        if (isNowEnabled) {
          newDisabled.delete(controlId);
        } else {
          newDisabled.add(controlId);
        }
        
        get().addAuditEvent({
          type: 'STATUS_CHANGED',
          actor: state.currentUser.email,
          details: {
            controlId,
            before: state.disabledControlIds.has(controlId) ? 'disabled' : 'enabled',
            after: newDisabled.has(controlId) ? 'disabled' : 'enabled',
          },
        });
        
        set({ disabledControlIds: newDisabled, _cachedScores: null });
        
        // Sync to API in background
        get().syncToAPI(controlId, { is_enabled: isNowEnabled });
      },
      
      setControlEnabled: (controlId, enabled) => {
        const state = get();
        const newDisabled = new Set(state.disabledControlIds);
        
        if (enabled) {
          newDisabled.delete(controlId);
        } else {
          newDisabled.add(controlId);
        }
        
        set({ disabledControlIds: newDisabled, _cachedScores: null });
      },
      
      enableAllControls: (pillar) => {
        const state = get();
        const newDisabled = new Set(state.disabledControlIds);
        const allCtrls = [...state.controls, ...state.customControls];
        
        allCtrls
          .filter(c => !pillar || c.pillar === pillar)
          .forEach(c => newDisabled.delete(c.id));
        
        get().addAuditEvent({
          type: 'STATUS_CHANGED',
          actor: state.currentUser.email,
          details: {
            before: 'bulk',
            after: `enabled all${pillar ? ` for ${pillar}` : ''}`,
          },
        });
        
        set({ disabledControlIds: newDisabled, _cachedScores: null });
      },
      
      disableAllControls: (pillar) => {
        const state = get();
        const newDisabled = new Set(state.disabledControlIds);
        const allCtrls = [...state.controls, ...state.customControls];
        
        allCtrls
          .filter(c => !pillar || c.pillar === pillar)
          .forEach(c => newDisabled.add(c.id));
        
        get().addAuditEvent({
          type: 'STATUS_CHANGED',
          actor: state.currentUser.email,
          details: {
            before: 'bulk',
            after: `disabled all${pillar ? ` for ${pillar}` : ''}`,
          },
        });
        
        set({ disabledControlIds: newDisabled, _cachedScores: null });
      },
      
      // Actions - Results
      setControlResults: (results) => {
        set({ controlResults: results, _cachedScores: null });
      },
      
      updateControlTestResult: (controlId, testResult) => {
        const state = get();
        const now = new Date().toISOString();
        const existingIdx = state.controlResults.findIndex(r => r.controlId === controlId);
        let newResults: ControlResult[];
        
        if (existingIdx >= 0) {
          newResults = [...state.controlResults];
          newResults[existingIdx] = {
            ...newResults[existingIdx],
            result: testResult,
            lastCheckedAt: now,
          };
        } else {
          newResults = [
            ...state.controlResults,
            {
              controlId,
              result: testResult,
              status: ControlStatus.TO_ADDRESS,
              lastCheckedAt: now,
            },
          ];
        }
        
        set({ controlResults: newResults, _cachedScores: null });
        
        const control = [...state.controls, ...state.customControls].find(c => c.id === controlId);
        
        get().addAuditEvent({
          type: 'STATUS_CHANGED',
          actor: state.currentUser.email,
          details: {
            controlId,
            controlTitle: control?.title,
            before: { result: existingIdx >= 0 ? state.controlResults[existingIdx].result : 'not_run' },
            after: { result: testResult },
          },
        });
      },
      
      updateControlStatus: (controlId, status, notes) => {
        const state = get();
        const existingIndex = state.controlResults.findIndex(r => r.controlId === controlId);
        const now = new Date().toISOString();
        
        let newResults: ControlResult[];
        if (existingIndex >= 0) {
          newResults = [...state.controlResults];
          const oldStatus = newResults[existingIndex].status;
          newResults[existingIndex] = {
            ...newResults[existingIndex],
            status,
            notes: notes ?? newResults[existingIndex].notes,
            lastCheckedAt: now,
          };
          
          // Create audit event for status change
          get().addAuditEvent({
            type: 'STATUS_CHANGED',
            actor: state.currentUser.email,
            details: {
              controlId,
              before: oldStatus,
              after: status,
            },
          });
        } else {
          newResults = [
            ...state.controlResults,
            {
              controlId,
              result: TestResult.NOT_RUN,
              status,
              notes,
              lastCheckedAt: now,
            },
          ];
        }
        
        set({ controlResults: newResults, _cachedScores: null });
        
        // Sync to API in background
        get().syncToAPI(controlId, { 
          action_status: testConfigService.controlStatusToApiStatus(status),
          action_notes: notes,
        });
      },
      
      // Actions - Licenses
      setTenantLicenses: (licenses) => {
        set({ tenantLicenses: licenses, _cachedScores: null });
      },
      
      toggleLicense: (license) => {
        const state = get();
        const oldValue = state.tenantLicenses.enabled[license as keyof typeof state.tenantLicenses.enabled];
        const newLicenses = {
          enabled: {
            ...state.tenantLicenses.enabled,
            [license]: !oldValue,
          },
        };
        
        get().addAuditEvent({
          type: 'LICENSE_CHANGED',
          actor: state.currentUser.email,
          details: {
            before: { [license]: oldValue },
            after: { [license]: !oldValue },
          },
        });
        
        set({ tenantLicenses: newLicenses, _cachedScores: null });
      },
      
      // Actions - Weights
      setWeightConfig: (config) => {
        set({ weightConfig: config, _cachedScores: null });
      },
      
      updatePillarWeight: (pillar, weight) => {
        const state = get();
        const oldWeight = state.weightConfig.pillarWeights[pillar];
        
        const newConfig: WeightConfig = {
          ...state.weightConfig,
          pillarWeights: {
            ...state.weightConfig.pillarWeights,
            [pillar]: weight,
          },
          updatedAt: new Date().toISOString(),
          updatedBy: state.currentUser.email,
        };
        
        get().addAuditEvent({
          type: 'WEIGHT_CHANGED',
          actor: state.currentUser.email,
          details: {
            pillar,
            before: oldWeight,
            after: weight,
          },
        });
        
        set({ weightConfig: newConfig, _cachedScores: null });
      },
      
      updateControlWeight: (controlId, weight) => {
        const state = get();
        const control = state.controls.find(c => c.id === controlId);
        const oldWeight = state.weightConfig.controlWeightOverrides[controlId] ?? control?.defaultWeight ?? 50;
        
        const newConfig: WeightConfig = {
          ...state.weightConfig,
          controlWeightOverrides: {
            ...state.weightConfig.controlWeightOverrides,
            [controlId]: weight,
          },
          updatedAt: new Date().toISOString(),
          updatedBy: state.currentUser.email,
        };
        
        get().addAuditEvent({
          type: 'WEIGHT_CHANGED',
          actor: state.currentUser.email,
          details: {
            controlId,
            before: oldWeight,
            after: weight,
          },
        });
        
        set({ weightConfig: newConfig, _cachedScores: null });
      },
      
      resetControlWeight: (controlId) => {
        const state = get();
        if (!(controlId in state.weightConfig.controlWeightOverrides)) {
          return; // Nothing to reset
        }
        
        const oldWeight = state.weightConfig.controlWeightOverrides[controlId];
        const control = state.controls.find(c => c.id === controlId);
        
        const newOverrides = { ...state.weightConfig.controlWeightOverrides };
        delete newOverrides[controlId];
        
        const newConfig: WeightConfig = {
          ...state.weightConfig,
          controlWeightOverrides: newOverrides,
          updatedAt: new Date().toISOString(),
          updatedBy: state.currentUser.email,
        };
        
        get().addAuditEvent({
          type: 'WEIGHT_CHANGED',
          actor: state.currentUser.email,
          details: {
            controlId,
            before: oldWeight,
            after: control?.defaultWeight ?? 50,
          },
        });
        
        set({ weightConfig: newConfig, _cachedScores: null });
      },
      
      resetAllWeights: () => {
        const state = get();
        
        get().addAuditEvent({
          type: 'WEIGHT_CHANGED',
          actor: state.currentUser.email,
          details: {
            before: state.weightConfig,
            after: DEFAULT_WEIGHT_CONFIG,
          },
        });
        
        set({
          weightConfig: {
            ...DEFAULT_WEIGHT_CONFIG,
            updatedAt: new Date().toISOString(),
            updatedBy: state.currentUser.email,
          },
          _cachedScores: null,
        });
      },
      
      // Actions - Audit
      addAuditEvent: (event) => {
        const newEvent: AuditEvent = {
          ...event,
          id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          at: new Date().toISOString(),
        };
        
        set((state) => ({
          auditEvents: [newEvent, ...state.auditEvents].slice(0, 1000), // Keep last 1000 events
        }));
      },
      
      clearAuditEvents: () => {
        set({ auditEvents: [] });
      },
      
      // Actions - User
      setCurrentUser: (user) => {
        set({ currentUser: user });
      },

      // Actions - Identity Checks
      setIdentityCheckState: (results, summary, isMock) => {
        set({ identityCheckResults: results, identityCheckSummary: summary, identityIsMock: isMock });
      },

      // Actions - Device Checks
      setDeviceCheckState: (results, summary, isMock) => {
        set({ deviceCheckResults: results, deviceCheckSummary: summary, deviceIsMock: isMock });
      },

      // Actions - Module Weights / Threshold
      setModuleWeight: (module, value) => {
        set(state => ({ moduleWeights: { ...state.moduleWeights, [module]: Math.max(0, Math.min(100, value)) } }));
      },
      setAccessThreshold: (value) => {
        set({ accessThreshold: Math.max(0, Math.min(100, value)) });
      },

      // Actions - Module Custom Tests
      addModuleCustomTest: (test) => {
        const id = `mct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        set(state => ({
          moduleCustomTests: [
            ...state.moduleCustomTests,
            { ...test, id, createdAt: new Date().toISOString() },
          ],
        }));
      },
      updateModuleCustomTest: (id, updates) => {
        set(state => ({
          moduleCustomTests: state.moduleCustomTests.map(t => t.id === id ? { ...t, ...updates } : t),
        }));
      },
      deleteModuleCustomTest: (id) => {
        set(state => ({ moduleCustomTests: state.moduleCustomTests.filter(t => t.id !== id) }));
      },
      runModuleCustomTest: (id, status) => {
        set(state => {
          const test = state.moduleCustomTests.find(t => t.id === id);
          if (!test) return state;

          // Pull current module/overall scores for threshold-based checks.
          // The FYP three-module architecture doesn't 1:1 match the classic
          // five-pillar split, so we approximate: device_posture ← Devices,
          // context_analysis ← Identity, trust_scoring_engine ← overall.
          const s = state._cachedScores?.achievable;
          const overall = Math.round(s?.percent ?? 0);
          const devicesPct  = Math.round(s?.byPillar?.Devices?.percent  ?? overall);
          const identityPct = Math.round(s?.byPillar?.Identity?.percent ?? overall);
          const scores = {
            overall,
            device_posture: devicesPct,
            context_analysis: identityPct,
            trust_scoring_engine: overall,
          };

          // Resolve status DETERMINISTICALLY so the same test on the same
          // (simulated) environment always returns the same answer — the
          // previous per-click randomisation was misleading.
          let resolved: 'pass' | 'fail' | 'warning';
          if (status) {
            resolved = status;
          } else if (test.checkType === 'custom') {
            // Manual tests can only be set by the admin; keep previous
            // status (or default to 'warning' = needs review) rather than
            // inventing a pass/fail.
            resolved = (test.lastStatus === 'pass' || test.lastStatus === 'fail' || test.lastStatus === 'warning')
              ? test.lastStatus
              : 'warning';
          } else if (
            test.checkType === 'overall_score_above_threshold' ||
            test.checkType === 'module_score_above_threshold' ||
            test.checkType === 'trust_scoring_engine' as any ||
            test.checkType === 'device_score_above_threshold' ||
            test.checkType === 'context_score_above_threshold'
          ) {
            // Threshold checks: compute directly from actual scores.
            const threshold = test.threshold ?? 60;
            const actual =
              test.checkType === 'device_score_above_threshold'  ? scores.device_posture :
              test.checkType === 'context_score_above_threshold' ? scores.context_analysis :
              test.checkType === 'module_score_above_threshold'  ? scores.device_posture :
              scores.overall;
            resolved = actual >= threshold ? 'pass' : actual >= threshold - 15 ? 'warning' : 'fail';
          } else {
            // Evidence-backed simulated checks: deterministic hash of the
            // test id so the same test always returns the same simulated
            // status until the admin edits it.
            let h = 0;
            for (let i = 0; i < test.id.length; i++) h = ((h << 5) - h + test.id.charCodeAt(i)) | 0;
            const bucket = Math.abs(h) % 10;
            resolved = bucket < 5 ? 'pass' : bucket < 8 ? 'warning' : 'fail';
          }

          const result = buildCustomTestResult(test, resolved, scores);

          return {
            moduleCustomTests: state.moduleCustomTests.map(t =>
              t.id === id
                ? { ...t, lastStatus: resolved, lastRun: result.evaluatedAt, lastResult: result }
                : t
            ),
          };
        });
      },
      
      // Computed getters
      getScores: () => {
        const state = get();
        
        // Return cached scores if available
        if (state._cachedScores) {
          return state._cachedScores;
        }
        
        // Compute new scores
        const scores = computeScores(
          state.controls,
          state.controlResults,
          state.tenantLicenses,
          state.weightConfig
        );
        
        // Cache the result (mutation is ok here since it's a derived value)
        // Note: We use set to update the cache to avoid infinite loops
        setTimeout(() => {
          set({ _cachedScores: scores });
        }, 0);
        
        return scores;
      },
      
      invalidateScoresCache: () => {
        set({ _cachedScores: null });
      },
    }),
    {
      name: 'modzero-zerotrust',
      storage: createJSONStorage(() => localStorage),
      version: 4, // Bumped to force refresh of module custom test seeds (new checkType/threshold fields)
      partialize: (state) => ({
        // Only persist these fields
        weightConfig: state.weightConfig,
        auditEvents: state.auditEvents,
        tenantLicenses: state.tenantLicenses,
        controlResults: state.controlResults,
        customControls: state.customControls,
        disabledControlIds: Array.from(state.disabledControlIds), // Convert Set to Array for JSON
        identityCheckResults: state.identityCheckResults,
        identityCheckSummary: state.identityCheckSummary,
        identityIsMock: state.identityIsMock,
        deviceCheckResults: state.deviceCheckResults,
        deviceCheckSummary: state.deviceCheckSummary,
        deviceIsMock: state.deviceIsMock,
        moduleWeights: state.moduleWeights,
        accessThreshold: state.accessThreshold,
        moduleCustomTests: state.moduleCustomTests,
      }),
      // Merge persisted state with initial state, ensuring new controls get their mock results
      merge: (persistedState: any, currentState: ZeroTrustState) => {
        const persisted = persistedState as Partial<ZeroTrustState> & { disabledControlIds?: string[] };

        // Drop keys whose persisted value is undefined so currentState seed values win.
        const persistedDefined: Partial<ZeroTrustState> = {};
        for (const [k, v] of Object.entries(persisted)) {
          if (v !== undefined) (persistedDefined as any)[k] = v;
        }

        // Get persisted control results as a map for quick lookup
        const persistedResultsMap = new Map<string, ControlResult>();
        (persisted.controlResults || []).forEach(r => persistedResultsMap.set(r.controlId, r));

        // Merge: use persisted results if they exist, otherwise use mock results
        const mergedResults: ControlResult[] = mockControlResults.map(mockResult => {
          const persisted = persistedResultsMap.get(mockResult.controlId);
          return persisted || mockResult;
        });

        // Convert disabledControlIds back to Set
        const disabledSet = new Set<string>(persisted.disabledControlIds || []);

        return {
          ...currentState,
          ...persistedDefined,
          controlResults: mergedResults,
          disabledControlIds: disabledSet,
        };
      },
      // Migrate from old versions - reset controlResults when version changes
      migrate: (persistedState: any, version: number) => {
        if (version < 3) {
          return {
            ...persistedState,
            controlResults: undefined,
            customControls: [],
            disabledControlIds: [],
          };
        }
        if (version < 4) {
          // v4: module custom tests got new fields (checkType, threshold).
          // Drop the cached list so the store falls back to the fresh seed.
          return {
            ...persistedState,
            moduleCustomTests: undefined,
          };
        }
        return persistedState;
      },
    }
  )
);

// ============================================================================
// SELECTORS (for optimized re-renders)
// ============================================================================

export const selectControls = (state: ZeroTrustState) => state.controls;
export const selectCustomControls = (state: ZeroTrustState) => state.customControls;
export const selectCustomPolicies = (state: ZeroTrustState) => state.customPolicies;
export const selectDisabledControlIds = (state: ZeroTrustState) => state.disabledControlIds;
export const selectControlResults = (state: ZeroTrustState) => state.controlResults;
export const selectTenantLicenses = (state: ZeroTrustState) => state.tenantLicenses;
export const selectWeightConfig = (state: ZeroTrustState) => state.weightConfig;
export const selectAuditEvents = (state: ZeroTrustState) => state.auditEvents;
export const selectCurrentUser = (state: ZeroTrustState) => state.currentUser;

export const selectAllControls = (state: ZeroTrustState) => [
  ...state.controls,
  ...state.customControls,
];

export const selectEnabledControls = (state: ZeroTrustState) => [
  ...state.controls,
  ...state.customControls,
].filter(c => !state.disabledControlIds.has(c.id));

export const selectControlsByPillar = (pillar: Pillar) => (state: ZeroTrustState) =>
  [...state.controls, ...state.customControls].filter(c => c.pillar === pillar);

export const selectControlResult = (controlId: string) => (state: ZeroTrustState) =>
  state.controlResults.find(r => r.controlId === controlId);

export const selectIsAdmin = (state: ZeroTrustState) =>
  state.currentUser.role === 'Admin';

export const selectIsControlEnabled = (controlId: string) => (state: ZeroTrustState) =>
  !state.disabledControlIds.has(controlId);

export const selectModuleCustomTests = (state: ZeroTrustState) => state.moduleCustomTests;
export const selectModuleWeights = (state: ZeroTrustState) => state.moduleWeights;
export const selectAccessThreshold = (state: ZeroTrustState) => state.accessThreshold;
export const selectDeviceCheckResults = (state: ZeroTrustState) => state.deviceCheckResults;
export const selectDeviceCheckSummary = (state: ZeroTrustState) => state.deviceCheckSummary;
export const selectIdentityCheckResults = (state: ZeroTrustState) => state.identityCheckResults;
export const selectIdentityCheckSummary = (state: ZeroTrustState) => state.identityCheckSummary;

/**
 * Compute the overall trust score (0-100) for the current user/device
 * using the three FYP modules and their weights.
 *
 * - Device Posture: combines the 5 Devices baseline checks + 'device_posture' module custom tests.
 * - Context Analysis: aggregates 'context_analysis' module custom tests only (pre-auth signals).
 * - Trust Scoring Engine: aggregates 'trust_scoring_engine' module custom tests AND the
 *   5 Identity baseline checks (since identity risk is the TSE's main identity-side input).
 *
 * Not-run tests count as neutral (50). Warning = 50, pass = 100, fail = 0.
 */
export interface TrustScore {
  overall: number;
  devicePostureScore: number;
  contextAnalysisScore: number;
  trustScoringEngineScore: number;
  lastUpdated: string | null;
  identityScore: number;
  deviceScore: number;
}

export function selectTrustScore(state: ZeroTrustState): TrustScore {
  const statusToScore = (s: string) => s === 'pass' ? 100 : s === 'warning' ? 50 : s === 'fail' ? 0 : 50;

  const idResults: any[] = state.identityCheckResults || [];
  const dvResults: any[] = state.deviceCheckResults || [];
  const customs = state.moduleCustomTests;

  const avg = (arr: number[]) => arr.length === 0 ? 50 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  const identityScore = idResults.length
    ? Math.round(idResults.reduce((s, r) => s + statusToScore(r.status), 0) / idResults.length)
    : 50;
  const deviceScore = dvResults.length
    ? Math.round(dvResults.reduce((s, r) => s + statusToScore(r.status), 0) / dvResults.length)
    : 50;

  const dpCustom = customs.filter(t => t.module === 'device_posture').map(t => statusToScore(t.lastStatus));
  const caCustom = customs.filter(t => t.module === 'context_analysis').map(t => statusToScore(t.lastStatus));
  const tsCustom = customs.filter(t => t.module === 'trust_scoring_engine').map(t => statusToScore(t.lastStatus));

  const devicePostureScore = avg([deviceScore, ...dpCustom]);
  const contextAnalysisScore = avg(caCustom);
  const trustScoringEngineScore = avg([identityScore, ...tsCustom]);

  const w = state.moduleWeights;
  const total = w.device_posture + w.context_analysis + w.trust_scoring_engine || 1;
  const overall = Math.round(
    (devicePostureScore * w.device_posture + contextAnalysisScore * w.context_analysis + trustScoringEngineScore * w.trust_scoring_engine) / total
  );

  const lastUpdated = state.identityCheckSummary?.last_run || state.deviceCheckSummary?.last_run || null;

  return {
    overall,
    devicePostureScore,
    contextAnalysisScore,
    trustScoringEngineScore,
    lastUpdated,
    identityScore,
    deviceScore,
  };
}
