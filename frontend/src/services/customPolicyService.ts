/**
 * Custom Policy API Service
 *
 * Provides API calls for customer-defined security policies.
 * Policies define enforcement rules, scope, and thresholds.
 * Detection logic (Graph API / Checklist / Manual) belongs in Custom Tests.
 */

import api from '../api';
import { CustomPolicy, Pillar, EnforcementMode } from '../types/zeroTrust';

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface CustomPolicyApiResponse {
  policyId: string;
  title: string;
  description?: string;
  pillar: string;
  category?: string;
  module?: string;
  scope?: string;
  enforcementMode: string;
  isEnabled: boolean;
  risk?: string;
  severity?: string;
  thresholdConfig?: Record<string, unknown>;
  lastTestResult?: string;
  lastRunAt?: string;
  lastRunData?: unknown;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomPolicyListResponse {
  policies: CustomPolicyApiResponse[];
  total: number;
}

// ============================================================================
// HELPERS
// ============================================================================

function capitalizePillar(pillar: string): Pillar {
  if (!pillar) return 'Identity' as Pillar;
  return (pillar.charAt(0).toUpperCase() + pillar.slice(1)) as Pillar;
}

function capitalizeRisk(risk?: string): 'High' | 'Medium' | 'Low' | undefined {
  if (!risk) return undefined;
  return (risk.charAt(0).toUpperCase() + risk.slice(1)) as 'High' | 'Medium' | 'Low';
}

/**
 * Convert API response to frontend CustomPolicy type
 */
export function apiResponseToCustomPolicy(r: CustomPolicyApiResponse): CustomPolicy {
  return {
    policyId: r.policyId,
    title: r.title,
    description: r.description,
    pillar: capitalizePillar(r.pillar),
    category: r.category,
    module: r.module,
    scope: r.scope,
    enforcementMode: (r.enforcementMode || 'informational') as EnforcementMode,
    isEnabled: r.isEnabled,
    risk: capitalizeRisk(r.risk),
    severity: r.severity,
    thresholdConfig: r.thresholdConfig,
    lastTestResult: r.lastTestResult,
    lastRunAt: r.lastRunAt,
    lastRunData: r.lastRunData,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * List all custom policies, optionally filtered by pillar
 */
export async function listCustomPolicies(pillar?: string): Promise<CustomPolicy[]> {
  const params = pillar ? { pillar: pillar.toLowerCase() } : {};
  const response = await api.get<CustomPolicyListResponse>('/custom-policies/', { params });
  return response.data.policies.map(apiResponseToCustomPolicy);
}

/**
 * Get a single custom policy by ID
 */
export async function getCustomPolicy(policyId: string): Promise<CustomPolicy> {
  const response = await api.get<CustomPolicyApiResponse>(`/custom-policies/${policyId}`);
  return apiResponseToCustomPolicy(response.data);
}

/**
 * Create a new custom policy
 */
export async function createCustomPolicy(data: {
  title: string;
  description?: string;
  pillar: string;
  category?: string;
  module?: string;
  scope?: string;
  enforcement_mode?: string;
  is_enabled?: boolean;
  risk?: string;
  severity?: string;
  threshold_config?: Record<string, unknown>;
}): Promise<CustomPolicy> {
  const response = await api.post<CustomPolicyApiResponse>('/custom-policies/', data);
  return apiResponseToCustomPolicy(response.data);
}

/**
 * Update an existing custom policy
 */
export async function updateCustomPolicy(
  policyId: string,
  data: Partial<{
    title: string;
    description: string;
    pillar: string;
    category: string;
    module: string;
    scope: string;
    enforcement_mode: string;
    is_enabled: boolean;
    risk: string;
    severity: string;
    threshold_config: Record<string, unknown>;
  }>
): Promise<CustomPolicy> {
  const response = await api.put<CustomPolicyApiResponse>(`/custom-policies/${policyId}`, data);
  return apiResponseToCustomPolicy(response.data);
}

/**
 * Delete a custom policy
 */
export async function deleteCustomPolicy(policyId: string): Promise<{ deleted: boolean }> {
  const response = await api.delete(`/custom-policies/${policyId}`);
  return response.data;
}
