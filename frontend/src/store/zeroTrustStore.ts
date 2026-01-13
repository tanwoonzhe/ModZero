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
  TenantLicenses,
  WeightConfig,
  AuditEvent,
  Pillar,
  DEFAULT_TENANT_LICENSES,
  DEFAULT_WEIGHT_CONFIG,
} from '../types/zeroTrust';
import { allControls, mockControlResults } from '../data/controls.seed';
import { computeScores, ComputedScores } from '../lib/scoring';

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
  
  // Computed (cached)
  _cachedScores: ComputedScores | null;
  
  // Actions - Controls
  setControls: (controls: Control[]) => void;
  
  // Actions - Results
  setControlResults: (results: ControlResult[]) => void;
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
      controls: allControls,
      controlResults: mockControlResults,
      tenantLicenses: DEFAULT_TENANT_LICENSES,
      weightConfig: DEFAULT_WEIGHT_CONFIG,
      auditEvents: [],
      currentUser: DEFAULT_USER,
      _cachedScores: null,
      
      // Actions - Controls
      setControls: (controls) => {
        set({ controls, _cachedScores: null });
      },
      
      // Actions - Results
      setControlResults: (results) => {
        set({ controlResults: results, _cachedScores: null });
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
              status,
              notes,
              lastCheckedAt: now,
            },
          ];
        }
        
        set({ controlResults: newResults, _cachedScores: null });
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
      partialize: (state) => ({
        // Only persist these fields
        weightConfig: state.weightConfig,
        auditEvents: state.auditEvents,
        tenantLicenses: state.tenantLicenses,
        controlResults: state.controlResults,
      }),
    }
  )
);

// ============================================================================
// SELECTORS (for optimized re-renders)
// ============================================================================

export const selectControls = (state: ZeroTrustState) => state.controls;
export const selectControlResults = (state: ZeroTrustState) => state.controlResults;
export const selectTenantLicenses = (state: ZeroTrustState) => state.tenantLicenses;
export const selectWeightConfig = (state: ZeroTrustState) => state.weightConfig;
export const selectAuditEvents = (state: ZeroTrustState) => state.auditEvents;
export const selectCurrentUser = (state: ZeroTrustState) => state.currentUser;

export const selectControlsByPillar = (pillar: Pillar) => (state: ZeroTrustState) =>
  state.controls.filter(c => c.pillar === pillar);

export const selectControlResult = (controlId: string) => (state: ZeroTrustState) =>
  state.controlResults.find(r => r.controlId === controlId);

export const selectIsAdmin = (state: ZeroTrustState) =>
  state.currentUser.role === 'Admin';
