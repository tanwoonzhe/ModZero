/**
 * Zero Trust Scoring Library
 * 
 * This module provides scoring functions for the Zero Trust assessment system.
 * 
 * SCORING LOGIC:
 * - Each control contributes: weightedMax = maxPoints * (effectiveWeight/100) * (pillarWeight/100)
 * - Achievable Score: Only includes controls where all required licenses are satisfied
 * - Full Coverage Score: Includes all controls (unlicensed = NOT_LICENSED, earns 0)
 * - Upgrade Opportunity Points: Sum of weightedMax for all unlicensed controls
 * 
 * STATUS SCORING:
 * - COMPLETED, ALTERNATE_MITIGATION, THIRD_PARTY => earn full points
 * - PLANNED, TO_ADDRESS, RISK_ACCEPTED => earn 0 points
 * - NOT_LICENSED => excluded from achievable, earns 0 in full coverage
 */

import {
  Control,
  ControlResult,
  ControlStatus,
  TenantLicenses,
  WeightConfig,
  Pillar,
  ComputedScores,
  ScoreResult,
  PillarScore,
  LicenseKey,
  DEFAULT_PILLAR_WEIGHTS,
} from '../types/zeroTrust';

// ============================================================================
// LICENSE CHECKING
// ============================================================================

/**
 * Check if a control is licensed based on tenant licenses.
 * All minLicenses must be satisfied for the control to be licensed.
 * 
 * @param control - The control to check
 * @param tenant - The tenant's license configuration
 * @returns true if all required licenses are enabled, false otherwise
 */
export function isLicensed(control: Control, tenant: TenantLicenses): boolean {
  // Controls with no license requirements are always licensed
  if (!control.minLicenses || control.minLicenses.length === 0) {
    return true;
  }
  
  // All required licenses must be enabled
  return control.minLicenses.every(license => tenant.enabled[license] === true);
}

/**
 * Get the licenses that are missing for a control.
 * 
 * @param control - The control to check
 * @param tenant - The tenant's license configuration
 * @returns Array of missing license keys
 */
export function getMissingLicenses(control: Control, tenant: TenantLicenses): LicenseKey[] {
  if (!control.minLicenses || control.minLicenses.length === 0) {
    return [];
  }
  
  return control.minLicenses.filter(license => !tenant.enabled[license]);
}

// ============================================================================
// WEIGHT FUNCTIONS
// ============================================================================

/**
 * Get the effective weight for a control.
 * Uses the override if present, otherwise falls back to defaultWeight.
 * 
 * @param control - The control to get weight for
 * @param config - The weight configuration
 * @returns Effective weight (0-100)
 */
export function getEffectiveWeight(control: Control, config: WeightConfig): number {
  if (config.controlWeightOverrides[control.id] !== undefined) {
    return config.controlWeightOverrides[control.id];
  }
  return control.defaultWeight;
}

/**
 * Normalize pillar weights so they sum to 100.
 * Handles edge cases like all zeros (distributes evenly).
 * 
 * @param pillarWeights - Raw pillar weights
 * @returns Normalized weights that sum to 100
 */
export function normalizePillarWeights(
  pillarWeights: Record<Pillar, number>
): Record<Pillar, number> {
  const pillars = Object.values(Pillar);
  const sum = pillars.reduce((acc, p) => acc + (pillarWeights[p] || 0), 0);
  
  // Handle edge case: all zeros - distribute evenly
  if (sum === 0) {
    const evenWeight = 100 / pillars.length;
    return pillars.reduce((acc, p) => {
      acc[p] = evenWeight;
      return acc;
    }, {} as Record<Pillar, number>);
  }
  
  // Normalize to 100
  const normalized = pillars.reduce((acc, p) => {
    acc[p] = ((pillarWeights[p] || 0) / sum) * 100;
    return acc;
  }, {} as Record<Pillar, number>);
  
  return normalized;
}

// ============================================================================
// STATUS SCORING
// ============================================================================

/**
 * Check if a status earns points.
 * 
 * @param status - The control status
 * @returns true if the status earns full points
 */
export function statusEarnsPoints(status: ControlStatus): boolean {
  return (
    status === ControlStatus.COMPLETED ||
    status === ControlStatus.ALTERNATE_MITIGATION ||
    status === ControlStatus.THIRD_PARTY
  );
}

/**
 * Get the effective status for a control result, considering licensing.
 * 
 * @param result - The control result
 * @param isControlLicensed - Whether the control is licensed
 * @returns Effective status
 */
export function getEffectiveStatus(
  result: ControlResult | undefined,
  isControlLicensed: boolean
): ControlStatus {
  if (!isControlLicensed) {
    return ControlStatus.NOT_LICENSED;
  }
  
  return result?.status || ControlStatus.TO_ADDRESS;
}

// ============================================================================
// SCORE COMPUTATION
// ============================================================================

/**
 * Calculate the weighted max points for a control.
 * 
 * @param control - The control
 * @param controlWeight - Effective control weight (0-100)
 * @param pillarWeight - Normalized pillar weight (0-100)
 * @returns Weighted max points
 */
export function calculateWeightedMax(
  control: Control,
  controlWeight: number,
  pillarWeight: number
): number {
  return control.maxPoints * (controlWeight / 100) * (pillarWeight / 100);
}

/**
 * Create an empty pillar score map.
 */
function createEmptyPillarScores(): Record<Pillar, PillarScore> {
  return Object.values(Pillar).reduce((acc, pillar) => {
    acc[pillar] = {
      pillar,
      score: 0,
      max: 0,
      percent: 0,
      controlCount: 0,
      passedCount: 0,
    };
    return acc;
  }, {} as Record<Pillar, PillarScore>);
}

/**
 * Compute achievable and full coverage scores.
 * 
 * @param controls - All controls to evaluate
 * @param results - Control results (status, evidence, etc.)
 * @param tenantLicenses - Tenant's license configuration
 * @param weightConfig - Weight configuration
 * @returns Computed scores including achievable, full coverage, and upgrade opportunity
 */
export function computeScores(
  controls: Control[],
  results: ControlResult[],
  tenantLicenses: TenantLicenses,
  weightConfig: WeightConfig
): ComputedScores {
  // Create a map of results by control ID for quick lookup
  const resultMap = new Map<string, ControlResult>();
  results.forEach(r => resultMap.set(r.controlId, r));
  
  // Normalize pillar weights
  const normalizedPillarWeights = normalizePillarWeights(weightConfig.pillarWeights);
  
  // Initialize scores
  const achievablePillarScores = createEmptyPillarScores();
  const fullCoveragePillarScores = createEmptyPillarScores();
  
  let achievableScore = 0;
  let achievableMax = 0;
  let fullCoverageScore = 0;
  let fullCoverageMax = 0;
  let upgradeOpportunityPoints = 0;
  let unavailableTestCount = 0;
  
  // Process each control
  for (const control of controls) {
    const controlLicensed = isLicensed(control, tenantLicenses);
    const effectiveWeight = getEffectiveWeight(control, weightConfig);
    const pillarWeight = normalizedPillarWeights[control.pillar];
    const weightedMax = calculateWeightedMax(control, effectiveWeight, pillarWeight);
    
    const result = resultMap.get(control.id);
    const effectiveStatus = getEffectiveStatus(result, controlLicensed);
    const earnsPoints = statusEarnsPoints(effectiveStatus);
    
    // Full Coverage: Always include
    fullCoverageMax += weightedMax;
    fullCoveragePillarScores[control.pillar].max += weightedMax;
    fullCoveragePillarScores[control.pillar].controlCount++;
    
    if (controlLicensed && earnsPoints) {
      fullCoverageScore += weightedMax;
      fullCoveragePillarScores[control.pillar].score += weightedMax;
      fullCoveragePillarScores[control.pillar].passedCount++;
    }
    
    // Achievable: Only include licensed controls
    if (controlLicensed) {
      achievableMax += weightedMax;
      achievablePillarScores[control.pillar].max += weightedMax;
      achievablePillarScores[control.pillar].controlCount++;
      
      if (earnsPoints) {
        achievableScore += weightedMax;
        achievablePillarScores[control.pillar].score += weightedMax;
        achievablePillarScores[control.pillar].passedCount++;
      }
    } else {
      // This control is not licensed - adds to upgrade opportunity
      upgradeOpportunityPoints += weightedMax;
      unavailableTestCount++;
    }
  }
  
  // Calculate percentages
  const calculatePercent = (score: number, max: number) => 
    max > 0 ? Math.round((score / max) * 100) : 0;
  
  // Update pillar percentages
  Object.values(Pillar).forEach(pillar => {
    achievablePillarScores[pillar].percent = calculatePercent(
      achievablePillarScores[pillar].score,
      achievablePillarScores[pillar].max
    );
    fullCoveragePillarScores[pillar].percent = calculatePercent(
      fullCoveragePillarScores[pillar].score,
      fullCoveragePillarScores[pillar].max
    );
  });
  
  return {
    achievable: {
      score: Math.round(achievableScore * 100) / 100,
      max: Math.round(achievableMax * 100) / 100,
      percent: calculatePercent(achievableScore, achievableMax),
      byPillar: achievablePillarScores,
    },
    fullCoverage: {
      score: Math.round(fullCoverageScore * 100) / 100,
      max: Math.round(fullCoverageMax * 100) / 100,
      percent: calculatePercent(fullCoverageScore, fullCoverageMax),
      byPillar: fullCoveragePillarScores,
    },
    upgradeOpportunityPoints: Math.round(upgradeOpportunityPoints * 100) / 100,
    unavailableTestCount,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get controls grouped by licensed/unlicensed status.
 */
export function categorizeControlsByLicense(
  controls: Control[],
  tenantLicenses: TenantLicenses
): {
  licensed: Control[];
  unlicensed: Control[];
} {
  const licensed: Control[] = [];
  const unlicensed: Control[] = [];
  
  for (const control of controls) {
    if (isLicensed(control, tenantLicenses)) {
      licensed.push(control);
    } else {
      unlicensed.push(control);
    }
  }
  
  return { licensed, unlicensed };
}

/**
 * Get controls filtered by pillar.
 */
export function getControlsByPillar(
  controls: Control[],
  pillar: Pillar
): Control[] {
  return controls.filter(c => c.pillar === pillar);
}

/**
 * Create a default weight config from controls.
 */
export function createDefaultWeightConfig(actor: string = 'system'): WeightConfig {
  return {
    pillarWeights: { ...DEFAULT_PILLAR_WEIGHTS },
    controlWeightOverrides: {},
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
}
