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
  DEFAULT_TENANT_LICENSES,
  DEFAULT_WEIGHT_CONFIG,
  ComputedScores,
} from '../types/zeroTrust';
import { allControls, mockControlResults } from '../data/controls.seed';
import { computeScores } from '../lib/scoring';

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
  customControls: Control[]; // User-defined controls
  disabledControlIds: Set<string>; // Controls that are disabled
  
  // Computed (cached)
  _cachedScores: ComputedScores | null;
  
  // Actions - Controls
  setControls: (controls: Control[]) => void;
  addControl: (control: Omit<Control, 'id' | 'createdAt' | 'createdBy' | 'isCustom'>) => void;
  updateControl: (controlId: string, updates: Partial<Control>) => void;
  deleteControl: (controlId: string) => void;
  toggleControlEnabled: (controlId: string) => void;
  setControlEnabled: (controlId: string, enabled: boolean) => void;
  enableAllControls: (pillar?: Pillar) => void;
  disableAllControls: (pillar?: Pillar) => void;
  
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
      controls: allControls.map(c => ({ ...c, enabled: true, isCustom: false })),
      controlResults: mockControlResults,
      tenantLicenses: DEFAULT_TENANT_LICENSES,
      weightConfig: DEFAULT_WEIGHT_CONFIG,
      auditEvents: [],
      currentUser: DEFAULT_USER,
      customControls: [],
      disabledControlIds: new Set<string>(),
      _cachedScores: null,
      
      // Actions - Controls
      setControls: (controls) => {
        set({ controls, _cachedScores: null });
      },
      
      addControl: (controlData) => {
        const state = get();
        const id = `CUSTOM-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        const newControl: Control = {
          ...controlData,
          id,
          isCustom: true,
          enabled: true,
          createdAt: new Date().toISOString(),
          createdBy: state.currentUser.email,
        };
        
        get().addAuditEvent({
          type: 'STATUS_CHANGED',
          actor: state.currentUser.email,
          details: {
            controlId: id,
            before: null,
            after: 'created',
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
              before: state.customControls[customIndex],
              after: updates,
            },
          });
          
          set({ customControls: newCustomControls, _cachedScores: null });
        }
      },
      
      deleteControl: (controlId) => {
        const state = get();
        const control = state.customControls.find(c => c.id === controlId);
        
        if (control?.isCustom) {
          get().addAuditEvent({
            type: 'STATUS_CHANGED',
            actor: state.currentUser.email,
            details: {
              controlId,
              before: 'exists',
              after: 'deleted',
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
        
        if (newDisabled.has(controlId)) {
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
      version: 3, // Increment this when control IDs change to force refresh
      partialize: (state) => ({
        // Only persist these fields
        weightConfig: state.weightConfig,
        auditEvents: state.auditEvents,
        tenantLicenses: state.tenantLicenses,
        controlResults: state.controlResults,
        customControls: state.customControls,
        disabledControlIds: Array.from(state.disabledControlIds), // Convert Set to Array for JSON
      }),
      // Merge persisted state with initial state, ensuring new controls get their mock results
      merge: (persistedState: any, currentState: ZeroTrustState) => {
        const persisted = persistedState as Partial<ZeroTrustState> & { disabledControlIds?: string[] };
        
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
          ...persisted,
          controlResults: mergedResults,
          disabledControlIds: disabledSet,
        };
      },
      // Migrate from old versions - reset controlResults when version changes
      migrate: (persistedState: any, version: number) => {
        if (version < 3) {
          // Old version - reset controlResults to use new mock data
          return {
            ...persistedState,
            controlResults: undefined, // Will be replaced with mockControlResults in merge
            customControls: [],
            disabledControlIds: [],
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
