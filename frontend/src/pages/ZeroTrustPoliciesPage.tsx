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
  
  const [activeTab, setActiveTab] = useState<'resource-policies' | 'device-profiles' | 'context-rules' | 'weights'>('resource-policies');
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
      api.get('/resources').then(r => setResources(r.data)).catch(() => {}).finally(() => setResourcesLoading(false));
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
          onClick={() => setActiveTab('device-profiles')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'device-profiles'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaLaptop className="inline mr-2" size={14} />
          Device Profiles
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
                          (r.minimum_trust_score || 0) >= 70
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            : (r.minimum_trust_score || 0) >= 40
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}>
                          {r.minimum_trust_score || 0}
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

      {/* Device Profiles Tab */}
      {activeTab === 'device-profiles' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Device Profiles</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Device posture controls and their contribution to the device posture score.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Control</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Affects Trust Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {controls.filter(c => c.pillar === Pillar.Devices).map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{c.title}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.category}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">Microsoft Graph / Intune</td>
                    <td className="px-4 py-3 text-xs text-gray-500">Yes</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="inline-flex px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 font-semibold">
                        {getEffectiveWeight(c, weightConfig)}
                      </span>
                    </td>
                  </tr>
                ))}
                {controls.filter(c => c.pillar === Pillar.Devices).length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No device controls configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Context Rules Tab */}
      {activeTab === 'context-rules' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Context Rules</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Access context controls including network, application, and data protection requirements.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Control</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pillar</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Affects Trust Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {controls.filter(c => c.pillar !== Pillar.Devices && c.pillar !== Pillar.Identity).map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{c.title}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.pillar}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.category}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">Microsoft Graph</td>
                    <td className="px-4 py-3 text-xs text-gray-500">Yes</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="inline-flex px-2 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 font-semibold">
                        {getEffectiveWeight(c, weightConfig)}
                      </span>
                    </td>
                  </tr>
                ))}
                {controls.filter(c => c.pillar !== Pillar.Devices && c.pillar !== Pillar.Identity).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No context controls configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trust Score Weights Tab */}
      {activeTab === 'weights' && (
        <div className="space-y-6">
          <FypModuleWeightsCard />
        </div>
      )}
    </div>
  );
};

export default ZeroTrustPoliciesPage;

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
  const total = moduleWeights.device_posture + moduleWeights.context_analysis + moduleWeights.trust_scoring_engine || 1;

  const modules = [
    {
      key: 'device_posture' as const,
      label: 'Device Posture',
      icon: FaLaptop,
      color: 'text-indigo-600',
      feeders: [
        `${deviceResults.length} device baseline test${deviceResults.length === 1 ? '' : 's'} (D-001..D-005)`,
        `${moduleCustomTests.filter(t => t.module === 'device_posture').length} custom test(s)`,
      ],
    },
    {
      key: 'context_analysis' as const,
      label: 'Context Analysis',
      icon: FaNetworkWired,
      color: 'text-amber-600',
      feeders: [
        `${moduleCustomTests.filter(t => t.module === 'context_analysis').length} custom test(s)`,
      ],
    },
    {
      key: 'trust_scoring_engine' as const,
      label: 'Trust Scoring Engine',
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
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <FaCog className="text-indigo-600" /> Module Weights
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Align with the three ModZero modules (Device Posture / Context Analysis / Trust Scoring
          Engine). These weights drive the Overview trust score and the protected-resource access
          decision. Each module is fed by specific Identity and Devices tests (listed below).
        </p>
      </div>
      <div className="p-6 space-y-6">
        {modules.map(m => {
          const raw = moduleWeights[m.key];
          const pct = Math.round((raw / total) * 100);
          const Icon = m.icon;
          return (
            <div key={m.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={m.color} />
                  <span className="font-medium text-gray-900 dark:text-gray-100">{m.label}</span>
                </div>
                <span className="text-sm text-gray-500 font-mono">
                  raw {raw} · <strong>{pct}%</strong> of total
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

        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">Access Threshold</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Minimum trust score required to access the protected resource via the ModZero-protected route (/r/&lt;slug&gt;).
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
