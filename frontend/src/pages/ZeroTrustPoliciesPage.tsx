/**
 * Zero Trust Policies Page
 * 
 * Central authority for weight configuration:
 * - Pillar weight sliders (sum normalizes to 100)
 * - Control weight table with edit capability
 * - License management
 * - Audit log for weight changes
 * 
 * RBAC: Only Admin role can edit; others view read-only.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  FaShieldAlt,
  FaShieldAlt as FaShieldAltB,
  FaCog,
  FaHistory,
  FaLock,
  FaCheck,
  FaUndo,
  FaSave,
  FaSearch,
  FaExclamationTriangle,
  FaChevronDown,
  FaChevronRight,
  FaExternalLinkAlt,
  FaSpinner,
  FaInfoCircle,
  FaLaptop,
  FaNetworkWired,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import {
  Pillar,
  Control,
  LicenseKey,
  PILLAR_COLORS,
  LICENSE_INFO,
  DEFAULT_PILLAR_WEIGHTS,
} from '../types/zeroTrust';
import {
  useZeroTrustStore,
  selectIsAdmin,
  selectWeightConfig,
  selectControls,
  selectTenantLicenses,
  selectAuditEvents,
} from '../store/zeroTrustStore';
import {
  ScoreCard,
  AuditLogPanel,
  StatusBadge,
  LicenseChips,
} from '../components/ZeroTrustComponents';
import { getEffectiveWeight, isLicensed, normalizePillarWeights } from '../lib/scoring';
import api from '../api';

const ZeroTrustPoliciesPage: React.FC = () => {
  const isAdmin = useZeroTrustStore(selectIsAdmin);
  const weightConfig = useZeroTrustStore(selectWeightConfig);
  const controls = useZeroTrustStore(selectControls);
  const tenantLicenses = useZeroTrustStore(selectTenantLicenses);
  const auditEvents = useZeroTrustStore(selectAuditEvents);
  const getScores = useZeroTrustStore(state => state.getScores);
  
  const {
    updatePillarWeight,
    updateControlWeight,
    resetControlWeight,
    resetAllWeights,
    toggleLicense,
    setTenantLicenses,
  } = useZeroTrustStore();
  
  const [activeTab, setActiveTab] = useState<'resource-policies' | 'device-rules' | 'context-rules' | 'weights' | 'simulator'>('resource-policies');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPillars, setExpandedPillars] = useState<Set<Pillar>>(new Set([Pillar.Identity]));

  // Resources state for Resource Policies tab
  const [resources, setResources] = useState<any[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  // License detection state (kept but not shown in tab)
  const [detectedLicenses, setDetectedLicenses] = useState<Record<string, boolean> | null>(null);
  const [loadingLicenses, setLoadingLicenses] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  
  const scores = getScores();
  
  // Normalized pillar weights for display
  const normalizedWeights = useMemo(
    () => normalizePillarWeights(weightConfig.pillarWeights),
    [weightConfig.pillarWeights]
  );
  
  // Filter controls by search
  const filteredControls = useMemo(() => {
    if (!searchTerm) return controls;
    const term = searchTerm.toLowerCase();
    return controls.filter(c =>
      c.title.toLowerCase().includes(term) ||
      c.id.toLowerCase().includes(term) ||
      c.category?.toLowerCase().includes(term)
    );
  }, [controls, searchTerm]);
  
  // Group controls by pillar
  const controlsByPillar = useMemo(() => {
    return filteredControls.reduce((acc, control) => {
      if (!acc[control.pillar]) {
        acc[control.pillar] = [];
      }
      acc[control.pillar].push(control);
      return acc;
    }, {} as Record<Pillar, Control[]>);
  }, [filteredControls]);
  
  // Weight audit events
  const weightAuditEvents = useMemo(
    () => auditEvents.filter(e => e.type === 'WEIGHT_CHANGED'),
    [auditEvents]
  );
  
  // Fetch resources for Resource Policies tab
  useEffect(() => {
    if (activeTab === 'resource-policies' && resources.length === 0) {
      setResourcesLoading(true);
      api.get('/resources').then(r => {
        // Deduplicate by resource_id (or name if id missing)
        const seen = new Set<string>();
        const deduped = (r.data as any[]).filter(res => {
          const key = res.resource_id || res.id || res.name;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setResources(deduped);
      }).catch(() => {}).finally(() => setResourcesLoading(false));
    }
  }, [activeTab]);

  // Fetch detected licenses from Azure on tab switch
  useEffect(() => {
    if (activeTab === 'licenses' && detectedLicenses === null && !loadingLicenses) {
      detectLicenses();
    }
  }, [activeTab]);
  
  const detectLicenses = async () => {
    setLoadingLicenses(true);
    setLicenseError(null);
    try {
      const response = await api.get('/azure/subscribed-skus');
      const skus = response.data.skus || [];
      
      // Comprehensive SKU to license mapping
      // Reference: https://learn.microsoft.com/en-us/entra/identity/users/licensing-service-plan-reference
      const skuMapping: Record<string, LicenseKey[]> = {
        // Entra ID P1 SKUs
        'AAD_PREMIUM': ['ENTRA_P1'],
        'AAD_PREMIUM_P1': ['ENTRA_P1'],
        'EMSPREMIUM': ['ENTRA_P1', 'INTUNE_P1'],  // EMS E5
        'EMS': ['ENTRA_P1', 'INTUNE_P1'],  // EMS E3
        'IDENTITY_THREAT_PROTECTION': ['ENTRA_P2'],
        
        // Entra ID P2 SKUs
        'AAD_PREMIUM_P2': ['ENTRA_P2', 'ENTRA_P1'],
        
        // Intune SKUs
        'INTUNE_A': ['INTUNE_P1'],
        'INTUNE_EDU': ['INTUNE_P1'],
        
        // Defender for Endpoint SKUs
        'WIN_DEF_ATP': ['MDE_P1'],
        'DEFENDER_ENDPOINT_P1': ['MDE_P1'],
        'DEFENDER_ENDPOINT_P2': ['MDE_P2', 'MDE_P1'],
        'MDATP_XPLAT': ['MDE_P1'],
        'ATP_ENTERPRISE': ['MDE_P1'],
        'WINDEFATP': ['MDE_P2', 'MDE_P1'],
        
        // Governance
        'AAD_GOVERNANCE': ['ENTRA_GOVERNANCE'],
        'IDENTITY_GOVERNANCE': ['ENTRA_GOVERNANCE'],
        
        // Workload ID
        'ENTRA_WORKLOAD_IDENTITIES': ['ENTRA_WORKLOAD_ID'],
        
        // M365 E3 SKUs (includes Entra P1, Intune)
        'SPE_E3': ['M365_E3', 'ENTRA_P1', 'INTUNE_P1'],
        'ENTERPRISEPACK': ['M365_E3', 'ENTRA_P1'],
        'MICROSOFT_365_E3': ['M365_E3', 'ENTRA_P1', 'INTUNE_P1'],
        'M365_E3': ['M365_E3', 'ENTRA_P1', 'INTUNE_P1'],
        'DEVELOPERPACK_E5': ['M365_E5', 'ENTRA_P2', 'INTUNE_P1', 'MDE_P2'],
        
        // M365 E5 SKUs (includes Entra P2, Intune, MDE P2)
        'SPE_E5': ['M365_E5', 'ENTRA_P2', 'ENTRA_P1', 'INTUNE_P1', 'MDE_P2', 'MDE_P1'],
        'ENTERPRISEPREMIUM': ['M365_E5', 'ENTRA_P2', 'ENTRA_P1', 'INTUNE_P1', 'MDE_P2', 'MDE_P1'],
        'MICROSOFT_365_E5': ['M365_E5', 'ENTRA_P2', 'ENTRA_P1', 'INTUNE_P1', 'MDE_P2', 'MDE_P1'],
        'M365_E5': ['M365_E5', 'ENTRA_P2', 'ENTRA_P1', 'INTUNE_P1', 'MDE_P2', 'MDE_P1'],
        'M365_E5_SUITE_COMPONENTS': ['M365_E5', 'ENTRA_P2', 'ENTRA_P1', 'INTUNE_P1'],
        
        // Business Premium (SMB)
        'SMB_BUSINESS_PREMIUM': ['ENTRA_P1', 'INTUNE_P1', 'MDE_P1'],
        'O365_BUSINESS_PREMIUM': ['ENTRA_P1'],
        'SPB': ['ENTRA_P1', 'INTUNE_P1'],
        'MICROSOFT_365_BUSINESS_PREMIUM': ['ENTRA_P1', 'INTUNE_P1', 'MDE_P1'],
        
        // Defender for Cloud
        'DEFENDER_FOR_CLOUD': ['DEFENDER_CLOUD'],
        'AZURE_DEFENDER': ['DEFENDER_CLOUD'],
        'ATA': ['DEFENDER_CLOUD'],
      };
      
      // Service plan mapping (for plans within SKUs)
      const servicePlanMapping: Record<string, LicenseKey[]> = {
        'AAD_PREMIUM': ['ENTRA_P1'],
        'AAD_PREMIUM_P2': ['ENTRA_P2', 'ENTRA_P1'],
        'INTUNE_A': ['INTUNE_P1'],
        'WINDEFATP': ['MDE_P2', 'MDE_P1'],
        'MDE_LITE': ['MDE_P1'],
        'WIN_DEF_ATP': ['MDE_P1'],
        'ADALLOM_S_STANDALONE': ['DEFENDER_CLOUD'],
      };
      
      const detected: Record<string, boolean> = {};
      Object.keys(LICENSE_INFO).forEach(key => {
        detected[key] = false;
      });
      
      // Check each SKU
      skus.forEach((sku: any) => {
        const skuPart = (sku.skuPartNumber || '').toUpperCase();

        // Direct SKU match
        Object.entries(skuMapping).forEach(([pattern, licenses]) => {
          if (skuPart === pattern.toUpperCase() || skuPart.includes(pattern.toUpperCase())) {
            licenses.forEach(lic => { detected[lic] = true; });
          }
        });

        // Check service plans within the SKU
        const servicePlans = sku.servicePlans || [];
        servicePlans.forEach((plan: any) => {
          const planName = (plan.servicePlanName || '').toUpperCase();
          Object.entries(servicePlanMapping).forEach(([pattern, licenses]) => {
            if (planName === pattern.toUpperCase() || planName.includes(pattern.toUpperCase())) {
              licenses.forEach(lic => { detected[lic] = true; });
            }
          });
        });
      });

      const detectedCount = Object.values(detected).filter(Boolean).length;
      
      if (detectedCount === 0 && skus.length > 0) {
        // Show warning with raw SKU names for debugging
        const skuNames = skus.map((s: any) => s.skuPartNumber).filter(Boolean).join(', ');
        setLicenseError(`Found ${skus.length} SKUs but couldn't map them: ${skuNames || 'No SKU names available'}. You may need to configure licenses manually.`);
      }
      
      setDetectedLicenses(detected);
    } catch (error: any) {
      setLicenseError(error.response?.data?.detail || 'Unable to detect licenses from Azure. Configure them manually.');
    } finally {
      setLoadingLicenses(false);
    }
  };
  
  const applyDetectedLicenses = () => {
    if (detectedLicenses) {
      setTenantLicenses({ enabled: detectedLicenses as Record<LicenseKey, boolean> });
      toast.success('Applied detected licenses');
    }
  };
  
  // Calculate raw pillar sum (now capped at 100% via UI)
  const rawPillarSum = Object.values(weightConfig.pillarWeights).reduce((a, b) => a + b, 0);
  
  const togglePillar = (pillar: Pillar) => {
    setExpandedPillars(prev => {
      const next = new Set(prev);
      if (next.has(pillar)) {
        next.delete(pillar);
      } else {
        next.add(pillar);
      }
      return next;
    });
  };
  
  const handleResetAll = () => {
    if (window.confirm('Reset all weights to defaults? This action will be logged.')) {
      resetAllWeights();
      toast.success('All weights reset to defaults');
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <FaShieldAlt className="text-indigo-600" />
            Trust Policies
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Resource access policies, device profiles, context rules, and trust score weights • {isAdmin ? 'Admin Mode' : 'View Only'}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={handleResetAll}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <FaUndo size={14} />
              Reset All
            </button>
          )}
        </div>
      </div>
      
      {/* Score Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <ScoreCard
          title="Achievable Score"
          score={scores.achievable.score}
          max={scores.achievable.max}
          percent={scores.achievable.percent}
          subtitle="Based on current licenses"
          variant="primary"
        />
        <ScoreCard
          title="Full Coverage Score"
          score={scores.fullCoverage.score}
          max={scores.fullCoverage.max}
          percent={scores.fullCoverage.percent}
          subtitle="All controls included"
          variant="secondary"
        />
        <ScoreCard
          title="Upgrade Opportunity"
          score={scores.upgradeOpportunityPoints}
          max={scores.fullCoverage.max - scores.achievable.max}
          percent={scores.fullCoverage.max > scores.achievable.max 
            ? Math.round((scores.upgradeOpportunityPoints / (scores.fullCoverage.max - scores.achievable.max)) * 100)
            : 0
          }
          subtitle={`${scores.unavailableTestCount} tests need licenses`}
          variant="warning"
        />
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Last Modified</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {new Date(weightConfig.updatedAt).toLocaleDateString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">by {weightConfig.updatedBy}</p>
        </div>
      </div>
      
      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('resource-policies')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'resource-policies'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaNetworkWired className="inline mr-2" size={14} />
          Resource Policies
        </button>
        <button
          onClick={() => setActiveTab('device-rules')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'device-rules'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaLaptop className="inline mr-2" size={14} />
          Device Rules
        </button>
        <button
          onClick={() => setActiveTab('context-rules')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'context-rules'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaShieldAltB className="inline mr-2" size={14} />
          Context Rules
        </button>
        <button
          onClick={() => setActiveTab('weights')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'weights'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaCog className="inline mr-2" size={14} />
          Trust Score Weights
        </button>
        <button
          onClick={() => setActiveTab('simulator')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'simulator'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaSpinner className="inline mr-2" size={14} />
          Policy Simulator
        </button>
      </div>
      
      {/* Resource Policies Tab */}
      {activeTab === 'resource-policies' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Resource Access Policies</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Each protected resource defines its own trust threshold and compliance requirements.
              The connector enforces these per-request using live trust score data.
            </p>
          </div>
          {resourcesLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : resources.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No protected resources found. Add resources in the Resources page.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resource</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min Trust Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Intune Required</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Affects Access</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {resources.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{r.name}</div>
                        <div className="text-xs text-gray-500">{r.target_host}:{r.target_port}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          (r.minimum_trust_score || 0) > 100
                            ? 'bg-gray-800 text-white dark:bg-gray-600'
                            : (r.minimum_trust_score || 0) >= 70
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            : (r.minimum_trust_score || 0) >= 40
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}>
                          {(r.minimum_trust_score || 0) > 100 ? `${r.minimum_trust_score} (deny test)` : (r.minimum_trust_score || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          r.require_intune_compliant
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {r.require_intune_compliant ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          r.enabled
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {r.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">Local / Connector</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                          Yes
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400">
              Access is denied if the device trust score is below the resource's minimum, or if Intune compliance is required but not met.
              These checks run on every proxied request via the ModZero connector.
            </p>
          </div>
        </div>
      )}

      {/* Device Rules Tab */}
      {activeTab === 'device-rules' && (
        <DeviceRulesTab />
      )}

      {/* Context Rules Tab */}
      {activeTab === 'context-rules' && (
        <ContextRulesTab />
      )}

      {/* Trust Score Weights Tab */}
      {activeTab === 'weights' && (
        <div className="space-y-6">
          <FypModuleWeightsCard />
        </div>
      )}

      {/* Policy Simulator Tab */}
      {activeTab === 'simulator' && (
        <PolicySimulatorTab resources={resources} />
      )}
    </div>
  );
};

export default ZeroTrustPoliciesPage;

/* ------------------------------------------------------------------ */
/*  Device Rules Tab                                                    */
/* ------------------------------------------------------------------ */

const DEFAULT_DEVICE_RULES = [
  { key: 'firewall_enabled',        label: 'Firewall Enabled',         source: 'Client App', weight: 15, enabled: true,  failureAction: 'reduce_score' as const },
  { key: 'antivirus_enabled',       label: 'Antivirus Enabled',        source: 'Client App', weight: 15, enabled: true,  failureAction: 'reduce_score' as const },
  { key: 'disk_encryption_enabled', label: 'Disk Encryption Enabled',  source: 'Client App', weight: 15, enabled: true,  failureAction: 'reduce_score' as const },
  { key: 'screen_lock_enabled',     label: 'Screen Lock Enabled',      source: 'Client App', weight: 10, enabled: true,  failureAction: 'reduce_score' as const },
  { key: 'os_supported',            label: 'OS Version Supported',     source: 'Client App', weight: 10, enabled: true,  failureAction: 'reduce_score' as const },
  { key: 'client_healthy',          label: 'Client App Healthy',       source: 'Client App', weight: 10, enabled: true,  failureAction: 'reduce_score' as const },
  { key: 'recent_posture_check',    label: 'Recent Posture Check',     source: 'Client App', weight: 10, enabled: true,  failureAction: 'reduce_score' as const },
  { key: 'intune_compliant',        label: 'Intune Compliant',         source: 'Microsoft Graph / Intune', weight: 20, enabled: true, failureAction: 'deny_immediately' as const },
];

type FailureAction = 'reduce_score' | 'deny_immediately';

interface DeviceRule {
  key: string;
  label: string;
  source: string;
  weight: number;
  enabled: boolean;
  failureAction: FailureAction;
}

const DEVICE_RULES_KEY = 'modzero-device-rules';

const DeviceRulesTab: React.FC = () => {
  const [rules, setRules] = useState<DeviceRule[]>(() => {
    try {
      const saved = localStorage.getItem(DEVICE_RULES_KEY);
      if (saved) return JSON.parse(saved) as DeviceRule[];
    } catch {}
    return DEFAULT_DEVICE_RULES;
  });
  const [saved, setSaved] = useState(false);

  const toggle = (key: string) =>
    setRules(r => r.map(rule => rule.key === key ? { ...rule, enabled: !rule.enabled } : rule));

  const setFailureAction = (key: string, action: FailureAction) =>
    setRules(r => r.map(rule => rule.key === key ? { ...rule, failureAction: action } : rule));

  const setWeight = (key: string, w: number) =>
    setRules(r => r.map(rule => rule.key === key ? { ...rule, weight: Math.max(0, Math.min(100, w)) } : rule));

  const handleSave = () => {
    localStorage.setItem(DEVICE_RULES_KEY, JSON.stringify(rules));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Device Rules</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure which device posture checks are required and their contribution to the Device Posture Score.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          <FaSave size={13} />
          {saved ? 'Saved!' : 'Save Rules'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Enabled</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Weight</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failure Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Affects Trust Score</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {rules.map(rule => (
              <tr key={rule.key} className={rule.enabled ? '' : 'opacity-50'}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{rule.label}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{rule.source}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggle(rule.key)}
                    className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${rule.enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full shadow mx-0.5 transition-transform ${rule.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    min={0} max={100} value={rule.weight}
                    onChange={e => setWeight(rule.key, Number(e.target.value))}
                    className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={!rule.enabled}
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={rule.failureAction}
                    onChange={e => setFailureAction(rule.key, e.target.value as FailureAction)}
                    disabled={!rule.enabled}
                    className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="reduce_score">Reduce score only</option>
                    <option value="deny_immediately">Deny immediately</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${rule.enabled ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {rule.enabled ? 'Yes' : 'Disabled'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-400">
          Total enabled weight: {rules.filter(r => r.enabled).reduce((s, r) => s + r.weight, 0)}/100 ·
          "Deny immediately" stops evaluation on failure even if other checks pass.
        </p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Context Rules Tab                                                   */
/* ------------------------------------------------------------------ */

const CONTEXT_RULES_KEY = 'modzero-context-rules';

const ContextRulesTab: React.FC = () => {
  const loadSaved = () => {
    try {
      const s = localStorage.getItem(CONTEXT_RULES_KEY);
      if (s) return JSON.parse(s);
    } catch {}
    return null;
  };
  const saved0 = loadSaved();
  const [allowedStart, setAllowedStart] = useState(saved0?.allowedStart ?? '08:00');
  const [allowedEnd, setAllowedEnd] = useState(saved0?.allowedEnd ?? '20:00');
  const [blockOutsideHours, setBlockOutsideHours] = useState(saved0?.blockOutsideHours ?? false);
  const [maxFailedAttempts, setMaxFailedAttempts] = useState(saved0?.maxFailedAttempts ?? 5);
  const [unknownDevicePenalty, setUnknownDevicePenalty] = useState(saved0?.unknownDevicePenalty ?? 20);
  const [suspiciousIpPenalty, setSuspiciousIpPenalty] = useState(saved0?.suspiciousIpPenalty ?? 15);
  const [requireKnownDevice, setRequireKnownDevice] = useState(saved0?.requireKnownDevice ?? true);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem(CONTEXT_RULES_KEY, JSON.stringify({
      allowedStart, allowedEnd, blockOutsideHours, maxFailedAttempts,
      unknownDevicePenalty, suspiciousIpPenalty, requireKnownDevice,
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const row = (label: string, desc: string, control: React.ReactNode) => (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div className="flex-1 pr-6">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Context Rules</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure time window, login attempt limits, and access context penalties that affect the Context Analysis Score.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          <FaSave size={13} />
          {saved ? 'Saved!' : 'Save Rules'}
        </button>
      </div>
      <div className="px-6 divide-y divide-gray-100 dark:divide-gray-700">
        {row(
          'Allowed Access Time Window',
          `Access requests outside this window are penalized (context score reduced for "normal_time" check).`,
          <div className="flex items-center gap-2">
            <input type="time" value={allowedStart} onChange={e => setAllowedStart(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            <span className="text-gray-400 text-sm">–</span>
            <input type="time" value={allowedEnd} onChange={e => setAllowedEnd(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
          </div>
        )}
        {row(
          'Block Outside Allowed Hours',
          'If enabled, access outside the time window is denied immediately regardless of trust score.',
          <button
            onClick={() => setBlockOutsideHours(!blockOutsideHours)}
            className={`w-10 h-5 rounded-full transition-colors ${blockOutsideHours ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className={`block w-4 h-4 bg-white rounded-full shadow mx-0.5 transition-transform ${blockOutsideHours ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        )}
        {row(
          'Max Failed Login Attempts (10-minute window)',
          'If a user exceeds this count, the "no_failed_login" check fails, reducing the context score.',
          <input type="number" min={1} max={20} value={maxFailedAttempts}
            onChange={e => setMaxFailedAttempts(Number(e.target.value))}
            className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
        )}
        {row(
          'Require Known Device',
          'If enabled, access from a device not previously registered is penalized on the "known_device" check.',
          <button
            onClick={() => setRequireKnownDevice(!requireKnownDevice)}
            className={`w-10 h-5 rounded-full transition-colors ${requireKnownDevice ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className={`block w-4 h-4 bg-white rounded-full shadow mx-0.5 transition-transform ${requireKnownDevice ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        )}
        {row(
          'Unknown Device Score Penalty',
          'Points deducted from the "known_device" signal when device is not registered.',
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={100} value={unknownDevicePenalty}
              onChange={e => setUnknownDevicePenalty(Number(e.target.value))}
              className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            <span className="text-xs text-gray-400">points</span>
          </div>
        )}
        {row(
          'Suspicious IP Score Penalty',
          'Points deducted from the "normal_ip" signal when request comes from a suspicious or blocked IP.',
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={100} value={suspiciousIpPenalty}
              onChange={e => setSuspiciousIpPenalty(Number(e.target.value))}
              className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            <span className="text-xs text-gray-400">points</span>
          </div>
        )}
      </div>
      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-400">
          Context rules affect the Context Analysis Score (default weight: 30% of final trust score).
          Penalties reduce individual signal scores; blocked access only triggers if "Block Outside Allowed Hours" is enabled.
        </p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Policy Simulator Tab                                               */
/* ------------------------------------------------------------------ */

interface SimulateResult {
  device_posture_score: number;
  context_score: number;
  identity_score: number;
  final_score: number;
  decision: 'ALLOW' | 'DENY';
  breakdown: Array<{ signal: string; passed: boolean; points: number; max: number; module: string }>;
  threshold: number;
}

const PolicySimulatorTab: React.FC<{ resources: any[] }> = ({ resources }) => {
  const moduleWeights = useZeroTrustStore(s => s.moduleWeights);
  const accessThreshold = useZeroTrustStore(s => s.accessThreshold);

  const [scenario, setScenario] = useState('typical');
  const [selectedResource, setSelectedResource] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scenarios = [
    { id: 'typical', label: 'Typical user — healthy device, normal hours' },
    { id: 'mfa_missing', label: 'MFA not registered' },
    { id: 'unhealthy_device', label: 'Unhealthy device — firewall/AV off' },
    { id: 'off_hours', label: 'Off-hours access attempt' },
    { id: 'failed_logins', label: 'Recent failed login attempts' },
    { id: 'guest_user', label: 'Guest / external user' },
  ];

  const runSimulation = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post('/policies/simulate', {
        scenario,
        resource_id: selectedResource || undefined,
        weights: moduleWeights,
        threshold: accessThreshold,
      });
      setResult(res.data);
    } catch (err: any) {
      // If endpoint doesn't exist yet, show a local mock result
      const mockScores: Record<string, { device: number; context: number; identity: number }> = {
        typical:         { device: 88, context: 85, identity: 90 },
        mfa_missing:     { device: 88, context: 80, identity: 40 },
        unhealthy_device:{ device: 30, context: 70, identity: 85 },
        off_hours:       { device: 85, context: 45, identity: 85 },
        failed_logins:   { device: 85, context: 55, identity: 70 },
        guest_user:      { device: 60, context: 75, identity: 50 },
      };
      const s = mockScores[scenario] || mockScores.typical;
      const final = Math.round(
        (s.device * moduleWeights.device_posture +
          s.context * moduleWeights.context_analysis +
          s.identity * moduleWeights.trust_scoring_engine) / 100
      );
      setResult({
        device_posture_score: s.device,
        context_score: s.context,
        identity_score: s.identity,
        final_score: final,
        decision: final >= accessThreshold ? 'ALLOW' : 'DENY',
        threshold: accessThreshold,
        breakdown: [
          { signal: 'firewall_enabled', passed: s.device >= 80, points: s.device >= 80 ? 15 : 0, max: 15, module: 'device_posture' },
          { signal: 'antivirus_enabled', passed: s.device >= 80, points: s.device >= 80 ? 15 : 0, max: 15, module: 'device_posture' },
          { signal: 'disk_encryption', passed: s.device >= 60, points: s.device >= 60 ? 15 : 0, max: 15, module: 'device_posture' },
          { signal: 'account_enabled', passed: true, points: 25, max: 25, module: 'identity' },
          { signal: 'mfa_registered', passed: scenario !== 'mfa_missing', points: scenario !== 'mfa_missing' ? 25 : 0, max: 25, module: 'identity' },
          { signal: 'normal_time', passed: scenario !== 'off_hours', points: scenario !== 'off_hours' ? 15 : 0, max: 15, module: 'context' },
          { signal: 'no_failed_login', passed: scenario !== 'failed_logins', points: scenario !== 'failed_logins' ? 20 : 0, max: 20, module: 'context' },
        ],
      });
    } finally {
      setRunning(false);
    }
  };

  const scoreColor = (s: number) => s >= 80 ? 'text-green-600' : s >= 60 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-4">
      {/* Config Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          Test Policy Simulator
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            Simulation Mode
          </span>
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Simulate an access evaluation using the current trust score weights and access threshold.
          Results show per-module scores and the final allow/deny decision.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Scenario</label>
            <select
              value={scenario}
              onChange={e => setScenario(e.target.value)}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Resource (optional)</label>
            <select
              value={selectedResource}
              onChange={e => setSelectedResource(e.target.value)}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">— Any resource —</option>
              {resources.map(r => (
                <option key={r.resource_id || r.id} value={r.resource_id || r.id}>
                  {r.name} (min {r.min_trust_score ?? 70})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={runSimulation}
              disabled={running}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
            >
              {running ? (
                <><FaSpinner className="animate-spin" size={14} /> Running...</>
              ) : (
                <><FaShieldAlt size={14} /> Run Evaluation</>
              )}
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-400">
          Current weights: Device Posture {moduleWeights.device_posture}% · Context Analysis {moduleWeights.context_analysis}% · Identity/Policy {moduleWeights.trust_scoring_engine}% · Access threshold: {accessThreshold}
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Score Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Device Posture', value: result.device_posture_score, subtitle: `× ${moduleWeights.device_posture}% weight` },
              { label: 'Context Analysis', value: result.context_score, subtitle: `× ${moduleWeights.context_analysis}% weight` },
              { label: 'Identity / Policy', value: result.identity_score, subtitle: `× ${moduleWeights.trust_scoring_engine}% weight` },
              { label: 'Final Trust Score', value: result.final_score, subtitle: `threshold: ${result.threshold}` },
            ].map(m => (
              <div key={m.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                <div className="text-xs text-gray-500 mb-1">{m.label}</div>
                <div className={`text-3xl font-bold ${scoreColor(m.value)}`}>{m.value}</div>
                <div className="text-xs text-gray-400 mt-1">{m.subtitle}</div>
              </div>
            ))}
          </div>

          {/* Decision Banner */}
          <div className={`rounded-xl px-5 py-4 flex items-center justify-between ${
            result.decision === 'ALLOW'
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700'
          }`}>
            <div>
              <span className={`text-lg font-bold ${result.decision === 'ALLOW' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                {result.decision === 'ALLOW' ? '✓ ACCESS ALLOWED' : '✕ ACCESS DENIED'}
              </span>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                Score {result.final_score} {result.decision === 'ALLOW' ? '≥' : '<'} threshold {result.threshold}
              </p>
            </div>
            <div className="text-xs text-gray-400">
              Scenario: {scenarios.find(s => s.id === scenario)?.label}
            </div>
          </div>

          {/* Signal Breakdown */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-white text-sm">Signal Breakdown</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left">Signal</th>
                  <th className="px-5 py-3 text-left">Module</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-right">Points</th>
                  <th className="px-5 py-3 text-right">Max</th>
                </tr>
              </thead>
              <tbody>
                {result.breakdown.map((b, idx) => (
                  <tr key={idx} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-white capitalize">
                      {b.signal.replace(/_/g, ' ')}
                    </td>
                    <td className="px-5 py-3 text-gray-500 capitalize">{b.module.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        b.passed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {b.passed ? 'Pass' : 'Fail'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-gray-900 dark:text-white">+{b.points}</td>
                    <td className="px-5 py-3 text-right font-mono text-gray-400">{b.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  FYP Module Weights + Access Threshold                             */
/* ------------------------------------------------------------------ */

const FypModuleWeightsCard: React.FC = () => {
  const moduleWeights = useZeroTrustStore(s => s.moduleWeights);
  const setModuleWeight = useZeroTrustStore(s => s.setModuleWeight);
  const accessThreshold = useZeroTrustStore(s => s.accessThreshold);
  const setAccessThreshold = useZeroTrustStore(s => s.setAccessThreshold);
  const identityResults = useZeroTrustStore(s => s.identityCheckResults);
  const deviceResults = useZeroTrustStore(s => s.deviceCheckResults);
  const moduleCustomTests = useZeroTrustStore(s => s.moduleCustomTests);

  const total = moduleWeights.device_posture + moduleWeights.context_analysis + moduleWeights.trust_scoring_engine;
  const totalValid = total === 100;
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!totalValid) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success('Trust score weights saved');
  };

  const modules = [
    {
      key: 'device_posture' as const,
      label: 'Device Posture Score',
      icon: FaLaptop,
      color: 'text-indigo-600',
      feeders: [
        `${deviceResults.length} device baseline test${deviceResults.length === 1 ? '' : 's'} (D-001..D-005)`,
        `${moduleCustomTests.filter(t => t.module === 'device_posture').length} custom test(s)`,
      ],
    },
    {
      key: 'context_analysis' as const,
      label: 'Context Analysis Score',
      icon: FaNetworkWired,
      color: 'text-amber-600',
      feeders: [
        `${moduleCustomTests.filter(t => t.module === 'context_analysis').length} custom test(s)`,
      ],
    },
    {
      key: 'trust_scoring_engine' as const,
      label: 'Identity / Policy Score',
      icon: FaShieldAltB,
      color: 'text-emerald-600',
      feeders: [
        `${identityResults.length} identity baseline test(s)`,
        `${moduleCustomTests.filter(t => t.module === 'trust_scoring_engine').length} custom test(s)`,
      ],
    },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FaCog className="text-indigo-600" /> Trust Score Weights
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure how Device Posture, Context Analysis, and Identity / Policy scores combine into the Final Trust Score.
            <strong> Total must equal exactly 100%.</strong>
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!totalValid}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          <FaSave size={13} />
          {saved ? 'Saved!' : 'Save Weights'}
        </button>
      </div>

      {/* Validation Banner */}
      {!totalValid && (
        <div className="mx-6 mt-4 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2.5">
          <FaExclamationTriangle className="text-red-500 flex-shrink-0" size={14} />
          <p className="text-sm text-red-700 dark:text-red-300">
            Total score weight must equal <strong>100%</strong>. Current total: <strong>{total}%</strong>.
            Adjust the sliders below until the total reaches 100%.
          </p>
        </div>
      )}

      <div className="p-6 space-y-6">
        {modules.map(m => {
          const raw = moduleWeights[m.key];
          const Icon = m.icon;
          return (
            <div key={m.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={m.color} />
                  <span className="font-medium text-gray-900 dark:text-gray-100">{m.label}</span>
                </div>
                <span className="text-sm text-gray-500 font-mono">
                  <strong className={raw > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400'}>{raw}%</strong>
                </span>
              </div>
              <input
                type="range" min={0} max={100} value={raw}
                onChange={e => setModuleWeight(m.key, Number(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Fed by: {m.feeders.join(' + ')}
              </div>
            </div>
          );
        })}

        {/* Total indicator */}
        <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${totalValid ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Weight</span>
          <span className={`text-lg font-bold ${totalValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{total}%</span>
        </div>

        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">Access Threshold</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Minimum final trust score required to allow access. Resources can override this per-resource.
              </div>
            </div>
            <span className="text-lg font-bold text-indigo-600">{accessThreshold} / 100</span>
          </div>
          <input
            type="range" min={0} max={100} value={accessThreshold}
            onChange={e => setAccessThreshold(Number(e.target.value))}
            className="w-full mt-2"
          />
        </div>
      </div>
    </div>
  );
};
