/**
 * Test Configuration API Service
 * 
 * Provides API calls for persisting test configurations to the backend.
 */

import api from '../api';
import { Control, ControlStatus, Pillar, GraphQueryConfig, ChecklistConfig } from '../types/zeroTrust';

// ============================================================================
// TYPES
// ============================================================================

export interface TestConfigResponse {
  testId: string;
  isEnabled: boolean;
  actionStatus: string;
  actionNotes?: string;
  weightOverride?: number;
  lastTestResult?: string;
  lastRunAt?: string;
  updatedAt?: string;
  title?: string;
  description?: string;
}

export interface CustomTestResponse extends TestConfigResponse {
  title: string;
  description?: string;
  pillar: string;
  category?: string;
  risk?: string;
  detectionMode: string;
  graphQueryConfig?: GraphQueryConfig;
  checklistConfig?: ChecklistConfig;
  lastRunData?: unknown;
  createdAt?: string;
}

export interface AllConfigsResponse {
  defaults: TestConfigResponse[];
  customs: CustomTestResponse[];
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Load all test configurations for the current user
 */
export async function loadTestConfigurations(pillar?: string): Promise<AllConfigsResponse> {
  const params = pillar ? { pillar } : {};
  const response = await api.get<AllConfigsResponse>('/test-config/', { params });
  return response.data;
}

/**
 * Update configuration for a default test
 */
export async function updateTestConfig(
  testId: string,
  update: {
    is_enabled?: boolean;
    action_status?: string;
    action_notes?: string;
    weight_override?: number;
    title?: string;
    description?: string;
  }
): Promise<TestConfigResponse> {
  const response = await api.put<TestConfigResponse>(`/test-config/${testId}`, update);
  return response.data;
}

/**
 * Bulk toggle multiple tests
 */
export async function bulkToggleTests(
  testIds: string[],
  enabled: boolean,
  pillar?: string
): Promise<{ updatedCount: number; enabled: boolean }> {
  const params = new URLSearchParams();
  testIds.forEach(id => params.append('test_ids', id));
  params.append('enabled', String(enabled));
  if (pillar) params.append('pillar', pillar);
  
  const response = await api.post('/test-config/bulk-toggle', null, { params });
  return response.data;
}

/**
 * Create a new custom test
 */
export async function createCustomTest(test: {
  title: string;
  description?: string;
  pillar: string;
  category?: string;
  risk?: string;
  detection_mode?: string;
  graph_query_config?: GraphQueryConfig;
  checklist_config?: ChecklistConfig;
}): Promise<CustomTestResponse> {
  const response = await api.post<CustomTestResponse>('/test-config/custom', test);
  return response.data;
}

/**
 * Update a custom test
 */
export async function updateCustomTest(
  testId: string,
  update: Partial<{
    title: string;
    description: string;
    category: string;
    risk: string;
    detection_mode: string;
    graph_query_config: GraphQueryConfig;
    checklist_config: ChecklistConfig;
    is_enabled: boolean;
    action_status: string;
    action_notes: string;
  }>
): Promise<CustomTestResponse> {
  const response = await api.put<CustomTestResponse>(`/test-config/custom/${testId}`, update);
  return response.data;
}

/**
 * Delete a custom test
 */
export async function deleteCustomTest(testId: string): Promise<{ deleted: boolean; testId: string }> {
  const response = await api.delete(`/test-config/custom/${testId}`);
  return response.data;
}

/**
 * Get pillar weights
 */
export async function getPillarWeights(): Promise<{ weights: Record<string, number>; total: number }> {
  const response = await api.get('/test-config/weights/pillars');
  return response.data;
}

/**
 * Update pillar weights
 */
export async function updatePillarWeights(
  weights: Record<string, number>
): Promise<{ weights: Record<string, number>; total: number }> {
  const response = await api.put('/test-config/weights/pillars', { weights });
  return response.data;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert API response to Control object
 */
export function customTestResponseToControl(response: CustomTestResponse): Control {
  // Capitalize pillar to match Pillar enum ("identity" -> "Identity")
  const capitalizedPillar = response.pillar 
    ? (response.pillar.charAt(0).toUpperCase() + response.pillar.slice(1)) as Pillar
    : 'Identity' as Pillar;
  
  return {
    id: response.testId,
    title: response.title,
    description: response.description,
    pillar: capitalizedPillar,
    minLicenses: [],
    defaultWeight: 50,
    maxPoints: 10,
    category: response.category,
    risk: response.risk ? (response.risk.charAt(0).toUpperCase() + response.risk.slice(1)) as 'High' | 'Medium' | 'Low' : undefined,
    isCustom: true,
    detectionMode: response.detectionMode as 'manual' | 'graph_query' | 'checklist',
    graphQueryConfig: response.graphQueryConfig,
    checklistConfig: response.checklistConfig,
    lastRunData: response.lastRunData,
    lastRunAt: response.lastRunAt,
    createdAt: response.createdAt,
    enabled: response.isEnabled,
  };
}

/**
 * Convert ControlStatus to API action_status string
 */
export function controlStatusToApiStatus(status: ControlStatus): string {
  const mapping: Record<ControlStatus, string> = {
    [ControlStatus.TO_ADDRESS]: 'to_address',
    [ControlStatus.PLANNED]: 'planned',
    [ControlStatus.RISK_ACCEPTED]: 'risk_accepted',
    [ControlStatus.ALTERNATE_MITIGATION]: 'alternate_mitigation',
    [ControlStatus.THIRD_PARTY]: 'third_party',
    [ControlStatus.COMPLETED]: 'completed',
    [ControlStatus.NOT_LICENSED]: 'not_licensed',
  };
  return mapping[status] || 'to_address';
}

/**
 * Convert API action_status string to ControlStatus
 */
export function apiStatusToControlStatus(status: string): ControlStatus {
  const mapping: Record<string, ControlStatus> = {
    'to_address': ControlStatus.TO_ADDRESS,
    'planned': ControlStatus.PLANNED,
    'risk_accepted': ControlStatus.RISK_ACCEPTED,
    'alternate_mitigation': ControlStatus.ALTERNATE_MITIGATION,
    'third_party': ControlStatus.THIRD_PARTY,
    'completed': ControlStatus.COMPLETED,
    'not_licensed': ControlStatus.NOT_LICENSED,
  };
  return mapping[status] || ControlStatus.TO_ADDRESS;
}
