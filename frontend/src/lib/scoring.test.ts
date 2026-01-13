/**
 * Zero Trust Scoring Library - Unit Tests
 * 
 * Tests cover:
 * - isLicensed: Control license checking
 * - getEffectiveWeight: Weight override resolution
 * - normalizePillarWeights: Pillar weight normalization
 * - statusEarnsPoints: Status point earning logic
 * - computeScores: Full scoring computation
 * 
 * Run with: npx vitest run src/lib/scoring.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isLicensed,
  getMissingLicenses,
  getEffectiveWeight,
  normalizePillarWeights,
  statusEarnsPoints,
  getEffectiveStatus,
  calculateWeightedMax,
  computeScores,
  categorizeControlsByLicense,
  getControlsByPillar,
} from './scoring';
import {
  Control,
  ControlResult,
  ControlStatus,
  TenantLicenses,
  WeightConfig,
  Pillar,
  LicenseKey,
  DEFAULT_PILLAR_WEIGHTS,
} from '../types/zeroTrust';

// ============================================================================
// TEST DATA
// ============================================================================

const createControl = (overrides: Partial<Control> = {}): Control => ({
  id: 'test-001',
  pillar: Pillar.Identity,
  title: 'Test Control',
  description: 'A test control',
  maxPoints: 10,
  defaultWeight: 100,
  minLicenses: [],
  ...overrides,
});

const createTenantLicenses = (enabled: Partial<Record<LicenseKey, boolean>> = {}): TenantLicenses => ({
  enabled: {
    ENTRA_P1: false,
    ENTRA_P2: false,
    INTUNE_P1: false,
    MDE_P1: false,
    MDE_P2: false,
    ENTRA_GOVERNANCE: false,
    ENTRA_WORKLOAD_ID: false,
    M365_E3: false,
    M365_E5: false,
    DEFENDER_CLOUD: false,
    ...enabled,
  },
});

const createWeightConfig = (overrides: Partial<WeightConfig> = {}): WeightConfig => ({
  pillarWeights: { ...DEFAULT_PILLAR_WEIGHTS },
  controlWeightOverrides: {},
  updatedAt: new Date().toISOString(),
  updatedBy: 'test',
  ...overrides,
});

const createControlResult = (overrides: Partial<ControlResult> = {}): ControlResult => ({
  controlId: 'test-001',
  status: ControlStatus.TO_ADDRESS,
  evidence: [],
  lastCheckedAt: new Date().toISOString(),
  ...overrides,
});

// ============================================================================
// isLicensed TESTS
// ============================================================================

describe('isLicensed', () => {
  it('should return true for controls with no license requirements', () => {
    const control = createControl({ minLicenses: [] });
    const licenses = createTenantLicenses();
    
    expect(isLicensed(control, licenses)).toBe(true);
  });
  
  it('should return true when all required licenses are enabled', () => {
    const control = createControl({ minLicenses: ['M365_E5', 'ENTRA_P2'] });
    const licenses = createTenantLicenses({ M365_E5: true, ENTRA_P2: true });
    
    expect(isLicensed(control, licenses)).toBe(true);
  });
  
  it('should return false when any required license is missing', () => {
    const control = createControl({ minLicenses: ['M365_E5', 'ENTRA_P2'] });
    const licenses = createTenantLicenses({ M365_E5: true, ENTRA_P2: false });
    
    expect(isLicensed(control, licenses)).toBe(false);
  });
  
  it('should return false when all required licenses are missing', () => {
    const control = createControl({ minLicenses: ['M365_E5', 'DEFENDER_CLOUD'] });
    const licenses = createTenantLicenses();
    
    expect(isLicensed(control, licenses)).toBe(false);
  });
  
  it('should handle single license requirement', () => {
    const control = createControl({ minLicenses: ['INTUNE_P1'] });
    
    expect(isLicensed(control, createTenantLicenses({ INTUNE_P1: true }))).toBe(true);
    expect(isLicensed(control, createTenantLicenses({ INTUNE_P1: false }))).toBe(false);
  });
});

// ============================================================================
// getMissingLicenses TESTS
// ============================================================================

describe('getMissingLicenses', () => {
  it('should return empty array when no licenses required', () => {
    const control = createControl({ minLicenses: [] });
    const licenses = createTenantLicenses();
    
    expect(getMissingLicenses(control, licenses)).toEqual([]);
  });
  
  it('should return empty array when all licenses are present', () => {
    const control = createControl({ minLicenses: ['M365_E5', 'ENTRA_P2'] });
    const licenses = createTenantLicenses({ M365_E5: true, ENTRA_P2: true });
    
    expect(getMissingLicenses(control, licenses)).toEqual([]);
  });
  
  it('should return missing licenses', () => {
    const control = createControl({ minLicenses: ['M365_E5', 'ENTRA_P2', 'DEFENDER_CLOUD'] });
    const licenses = createTenantLicenses({ M365_E5: true, ENTRA_P2: false, DEFENDER_CLOUD: false });
    
    const missing = getMissingLicenses(control, licenses);
    expect(missing).toContain('ENTRA_P2');
    expect(missing).toContain('DEFENDER_CLOUD');
    expect(missing).not.toContain('M365_E5');
  });
});

// ============================================================================
// getEffectiveWeight TESTS
// ============================================================================

describe('getEffectiveWeight', () => {
  it('should return defaultWeight when no override exists', () => {
    const control = createControl({ id: 'ctrl-1', defaultWeight: 75 });
    const config = createWeightConfig({ controlWeightOverrides: {} });
    
    expect(getEffectiveWeight(control, config)).toBe(75);
  });
  
  it('should return override when it exists', () => {
    const control = createControl({ id: 'ctrl-1', defaultWeight: 75 });
    const config = createWeightConfig({ controlWeightOverrides: { 'ctrl-1': 50 } });
    
    expect(getEffectiveWeight(control, config)).toBe(50);
  });
  
  it('should return 0 when override is 0', () => {
    const control = createControl({ id: 'ctrl-1', defaultWeight: 100 });
    const config = createWeightConfig({ controlWeightOverrides: { 'ctrl-1': 0 } });
    
    expect(getEffectiveWeight(control, config)).toBe(0);
  });
  
  it('should not use override for different control ID', () => {
    const control = createControl({ id: 'ctrl-1', defaultWeight: 100 });
    const config = createWeightConfig({ controlWeightOverrides: { 'ctrl-2': 50 } });
    
    expect(getEffectiveWeight(control, config)).toBe(100);
  });
});

// ============================================================================
// normalizePillarWeights TESTS
// ============================================================================

describe('normalizePillarWeights', () => {
  it('should normalize weights to sum to 100', () => {
    const weights: Record<Pillar, number> = {
      [Pillar.Identity]: 20,
      [Pillar.Devices]: 20,
      [Pillar.Apps]: 10,
      [Pillar.Data]: 25,
      [Pillar.Infrastructure]: 25,
    };
    
    const normalized = normalizePillarWeights(weights);
    const sum = Object.values(normalized).reduce((a, b) => a + b, 0);
    
    expect(Math.round(sum)).toBe(100);
  });
  
  it('should handle already normalized weights', () => {
    const weights = { ...DEFAULT_PILLAR_WEIGHTS };
    const normalized = normalizePillarWeights(weights);
    
    Object.keys(DEFAULT_PILLAR_WEIGHTS).forEach(pillar => {
      expect(normalized[pillar as Pillar]).toBeCloseTo(DEFAULT_PILLAR_WEIGHTS[pillar as Pillar], 1);
    });
  });
  
  it('should distribute evenly when all weights are 0', () => {
    const weights: Record<Pillar, number> = {
      [Pillar.Identity]: 0,
      [Pillar.Devices]: 0,
      [Pillar.Apps]: 0,
      [Pillar.Data]: 0,
      [Pillar.Infrastructure]: 0,
    };
    
    const normalized = normalizePillarWeights(weights);
    const expectedWeight = 100 / 5;
    
    Object.values(normalized).forEach(weight => {
      expect(weight).toBeCloseTo(expectedWeight, 5);
    });
  });
  
  it('should handle case with only one non-zero weight', () => {
    const weights: Record<Pillar, number> = {
      [Pillar.Identity]: 50,
      [Pillar.Devices]: 0,
      [Pillar.Apps]: 0,
      [Pillar.Data]: 0,
      [Pillar.Infrastructure]: 0,
    };
    
    const normalized = normalizePillarWeights(weights);
    
    expect(normalized[Pillar.Identity]).toBe(100);
    expect(normalized[Pillar.Devices]).toBe(0);
  });
});

// ============================================================================
// statusEarnsPoints TESTS
// ============================================================================

describe('statusEarnsPoints', () => {
  it('should return true for COMPLETED status', () => {
    expect(statusEarnsPoints(ControlStatus.COMPLETED)).toBe(true);
  });
  
  it('should return true for ALTERNATE_MITIGATION status', () => {
    expect(statusEarnsPoints(ControlStatus.ALTERNATE_MITIGATION)).toBe(true);
  });
  
  it('should return true for THIRD_PARTY status', () => {
    expect(statusEarnsPoints(ControlStatus.THIRD_PARTY)).toBe(true);
  });
  
  it('should return false for TO_ADDRESS status', () => {
    expect(statusEarnsPoints(ControlStatus.TO_ADDRESS)).toBe(false);
  });
  
  it('should return false for PLANNED status', () => {
    expect(statusEarnsPoints(ControlStatus.PLANNED)).toBe(false);
  });
  
  it('should return false for RISK_ACCEPTED status', () => {
    expect(statusEarnsPoints(ControlStatus.RISK_ACCEPTED)).toBe(false);
  });
  
  it('should return false for NOT_LICENSED status', () => {
    expect(statusEarnsPoints(ControlStatus.NOT_LICENSED)).toBe(false);
  });
});

// ============================================================================
// getEffectiveStatus TESTS
// ============================================================================

describe('getEffectiveStatus', () => {
  it('should return NOT_LICENSED when control is not licensed', () => {
    const result = createControlResult({ status: ControlStatus.COMPLETED });
    expect(getEffectiveStatus(result, false)).toBe(ControlStatus.NOT_LICENSED);
  });
  
  it('should return result status when licensed', () => {
    const result = createControlResult({ status: ControlStatus.COMPLETED });
    expect(getEffectiveStatus(result, true)).toBe(ControlStatus.COMPLETED);
  });
  
  it('should return TO_ADDRESS when licensed but no result', () => {
    expect(getEffectiveStatus(undefined, true)).toBe(ControlStatus.TO_ADDRESS);
  });
});

// ============================================================================
// calculateWeightedMax TESTS
// ============================================================================

describe('calculateWeightedMax', () => {
  it('should calculate weighted max correctly', () => {
    const control = createControl({ maxPoints: 10 });
    // 10 points * 100% control weight * 20% pillar weight = 2
    expect(calculateWeightedMax(control, 100, 20)).toBe(2);
  });
  
  it('should handle partial control weight', () => {
    const control = createControl({ maxPoints: 10 });
    // 10 points * 50% control weight * 20% pillar weight = 1
    expect(calculateWeightedMax(control, 50, 20)).toBe(1);
  });
  
  it('should return 0 when control weight is 0', () => {
    const control = createControl({ maxPoints: 10 });
    expect(calculateWeightedMax(control, 0, 20)).toBe(0);
  });
  
  it('should return 0 when pillar weight is 0', () => {
    const control = createControl({ maxPoints: 10 });
    expect(calculateWeightedMax(control, 100, 0)).toBe(0);
  });
});

// ============================================================================
// computeScores TESTS
// ============================================================================

describe('computeScores', () => {
  it('should calculate achievable score excluding unlicensed controls', () => {
    const controls = [
      createControl({ id: 'ctrl-1', maxPoints: 10, minLicenses: [] }), // Licensed
      createControl({ id: 'ctrl-2', maxPoints: 10, minLicenses: ['M365_E5'] }), // Unlicensed
    ];
    const results = [
      createControlResult({ controlId: 'ctrl-1', status: ControlStatus.COMPLETED }),
      createControlResult({ controlId: 'ctrl-2', status: ControlStatus.COMPLETED }),
    ];
    const licenses = createTenantLicenses({ M365_E5: false });
    const weightConfig = createWeightConfig();
    
    const scores = computeScores(controls, results, licenses, weightConfig);
    
    // Achievable should only include ctrl-1 (licensed)
    expect(scores.achievable.byPillar[Pillar.Identity].controlCount).toBe(1);
    // Full coverage includes both
    expect(scores.fullCoverage.byPillar[Pillar.Identity].controlCount).toBe(2);
  });
  
  it('should calculate full coverage including all controls', () => {
    const controls = [
      createControl({ id: 'ctrl-1', maxPoints: 10, minLicenses: ['M365_E5'] }),
      createControl({ id: 'ctrl-2', maxPoints: 10, minLicenses: ['ENTRA_P2'] }),
    ];
    const results: ControlResult[] = [];
    const licenses = createTenantLicenses();
    const weightConfig = createWeightConfig();
    
    const scores = computeScores(controls, results, licenses, weightConfig);
    
    // Both controls should be in full coverage max
    expect(scores.fullCoverage.byPillar[Pillar.Identity].controlCount).toBe(2);
    // But neither is achievable (no licenses)
    expect(scores.achievable.byPillar[Pillar.Identity].controlCount).toBe(0);
  });
  
  it('should calculate upgrade opportunity points correctly', () => {
    const controls = [
      createControl({ id: 'ctrl-1', maxPoints: 10, pillar: Pillar.Identity, minLicenses: [] }),
      createControl({ id: 'ctrl-2', maxPoints: 20, pillar: Pillar.Identity, minLicenses: ['M365_E5'] }),
    ];
    const results: ControlResult[] = [];
    const licenses = createTenantLicenses({ M365_E5: false });
    const weightConfig = createWeightConfig({
      pillarWeights: {
        [Pillar.Identity]: 100,
        [Pillar.Devices]: 0,
        [Pillar.Apps]: 0,
        [Pillar.Data]: 0,
        [Pillar.Infrastructure]: 0,
      },
    });
    
    const scores = computeScores(controls, results, licenses, weightConfig);
    
    // ctrl-2 (20 points) is unlicensed, with 100% pillar weight and 100% control weight
    // upgradeOpportunity = 20 * (100/100) * (100/100) = 20
    expect(scores.upgradeOpportunityPoints).toBe(20);
    expect(scores.unavailableTestCount).toBe(1);
  });
  
  it('should give full points for COMPLETED status', () => {
    const controls = [createControl({ id: 'ctrl-1', maxPoints: 10 })];
    const results = [createControlResult({ controlId: 'ctrl-1', status: ControlStatus.COMPLETED })];
    const licenses = createTenantLicenses();
    const weightConfig = createWeightConfig({
      pillarWeights: {
        [Pillar.Identity]: 100,
        [Pillar.Devices]: 0,
        [Pillar.Apps]: 0,
        [Pillar.Data]: 0,
        [Pillar.Infrastructure]: 0,
      },
    });
    
    const scores = computeScores(controls, results, licenses, weightConfig);
    
    expect(scores.achievable.score).toBe(10);
    expect(scores.achievable.byPillar[Pillar.Identity].passedCount).toBe(1);
  });
  
  it('should give full points for ALTERNATE_MITIGATION status', () => {
    const controls = [createControl({ id: 'ctrl-1', maxPoints: 10 })];
    const results = [createControlResult({ controlId: 'ctrl-1', status: ControlStatus.ALTERNATE_MITIGATION })];
    const licenses = createTenantLicenses();
    const weightConfig = createWeightConfig({
      pillarWeights: {
        [Pillar.Identity]: 100,
        [Pillar.Devices]: 0,
        [Pillar.Apps]: 0,
        [Pillar.Data]: 0,
        [Pillar.Infrastructure]: 0,
      },
    });
    
    const scores = computeScores(controls, results, licenses, weightConfig);
    
    expect(scores.achievable.score).toBe(10);
  });
  
  it('should give full points for THIRD_PARTY status', () => {
    const controls = [createControl({ id: 'ctrl-1', maxPoints: 10 })];
    const results = [createControlResult({ controlId: 'ctrl-1', status: ControlStatus.THIRD_PARTY })];
    const licenses = createTenantLicenses();
    const weightConfig = createWeightConfig({
      pillarWeights: {
        [Pillar.Identity]: 100,
        [Pillar.Devices]: 0,
        [Pillar.Apps]: 0,
        [Pillar.Data]: 0,
        [Pillar.Infrastructure]: 0,
      },
    });
    
    const scores = computeScores(controls, results, licenses, weightConfig);
    
    expect(scores.achievable.score).toBe(10);
  });
  
  it('should give 0 points for TO_ADDRESS status', () => {
    const controls = [createControl({ id: 'ctrl-1', maxPoints: 10 })];
    const results = [createControlResult({ controlId: 'ctrl-1', status: ControlStatus.TO_ADDRESS })];
    const licenses = createTenantLicenses();
    const weightConfig = createWeightConfig();
    
    const scores = computeScores(controls, results, licenses, weightConfig);
    
    expect(scores.achievable.score).toBe(0);
    expect(scores.achievable.byPillar[Pillar.Identity].passedCount).toBe(0);
  });
  
  it('should give 0 points for RISK_ACCEPTED status', () => {
    const controls = [createControl({ id: 'ctrl-1', maxPoints: 10 })];
    const results = [createControlResult({ controlId: 'ctrl-1', status: ControlStatus.RISK_ACCEPTED })];
    const licenses = createTenantLicenses();
    const weightConfig = createWeightConfig();
    
    const scores = computeScores(controls, results, licenses, weightConfig);
    
    expect(scores.achievable.score).toBe(0);
  });
  
  it('should apply control weight overrides', () => {
    const controls = [createControl({ id: 'ctrl-1', maxPoints: 10, defaultWeight: 100 })];
    const results = [createControlResult({ controlId: 'ctrl-1', status: ControlStatus.COMPLETED })];
    const licenses = createTenantLicenses();
    const weightConfig = createWeightConfig({
      pillarWeights: {
        [Pillar.Identity]: 100,
        [Pillar.Devices]: 0,
        [Pillar.Apps]: 0,
        [Pillar.Data]: 0,
        [Pillar.Infrastructure]: 0,
      },
      controlWeightOverrides: { 'ctrl-1': 50 }, // 50% override
    });
    
    const scores = computeScores(controls, results, licenses, weightConfig);
    
    // 10 points * 50% = 5
    expect(scores.achievable.score).toBe(5);
  });
  
  it('should apply pillar weight normalization', () => {
    const controls = [
      createControl({ id: 'ctrl-1', maxPoints: 10, pillar: Pillar.Identity }),
      createControl({ id: 'ctrl-2', maxPoints: 10, pillar: Pillar.Devices }),
    ];
    const results = [
      createControlResult({ controlId: 'ctrl-1', status: ControlStatus.COMPLETED }),
      createControlResult({ controlId: 'ctrl-2', status: ControlStatus.COMPLETED }),
    ];
    const licenses = createTenantLicenses();
    const weightConfig = createWeightConfig({
      pillarWeights: {
        [Pillar.Identity]: 50, // After normalization: 50%
        [Pillar.Devices]: 50,  // After normalization: 50%
        [Pillar.Apps]: 0,
        [Pillar.Data]: 0,
        [Pillar.Infrastructure]: 0,
      },
    });
    
    const scores = computeScores(controls, results, licenses, weightConfig);
    
    // Total should be: (10 * 50%) + (10 * 50%) = 10
    expect(scores.achievable.score).toBe(10);
  });
});

// ============================================================================
// categorizeControlsByLicense TESTS
// ============================================================================

describe('categorizeControlsByLicense', () => {
  it('should separate licensed and unlicensed controls', () => {
    const controls = [
      createControl({ id: 'ctrl-1', minLicenses: [] }),
      createControl({ id: 'ctrl-2', minLicenses: ['M365_E5'] }),
      createControl({ id: 'ctrl-3', minLicenses: ['ENTRA_P2'] }),
    ];
    const licenses = createTenantLicenses({ M365_E5: true, ENTRA_P2: false });
    
    const { licensed, unlicensed } = categorizeControlsByLicense(controls, licenses);
    
    expect(licensed.map(c => c.id)).toEqual(['ctrl-1', 'ctrl-2']);
    expect(unlicensed.map(c => c.id)).toEqual(['ctrl-3']);
  });
  
  it('should return all as licensed when no license requirements', () => {
    const controls = [
      createControl({ id: 'ctrl-1', minLicenses: [] }),
      createControl({ id: 'ctrl-2', minLicenses: [] }),
    ];
    const licenses = createTenantLicenses();
    
    const { licensed, unlicensed } = categorizeControlsByLicense(controls, licenses);
    
    expect(licensed).toHaveLength(2);
    expect(unlicensed).toHaveLength(0);
  });
});

// ============================================================================
// getControlsByPillar TESTS
// ============================================================================

describe('getControlsByPillar', () => {
  it('should filter controls by pillar', () => {
    const controls = [
      createControl({ id: 'ctrl-1', pillar: Pillar.Identity }),
      createControl({ id: 'ctrl-2', pillar: Pillar.Devices }),
      createControl({ id: 'ctrl-3', pillar: Pillar.Identity }),
    ];
    
    const identityControls = getControlsByPillar(controls, Pillar.Identity);
    const deviceControls = getControlsByPillar(controls, Pillar.Devices);
    
    expect(identityControls.map(c => c.id)).toEqual(['ctrl-1', 'ctrl-3']);
    expect(deviceControls.map(c => c.id)).toEqual(['ctrl-2']);
  });
  
  it('should return empty array when no controls match', () => {
    const controls = [
      createControl({ id: 'ctrl-1', pillar: Pillar.Identity }),
    ];
    
    const dataControls = getControlsByPillar(controls, Pillar.Data);
    
    expect(dataControls).toHaveLength(0);
  });
});
