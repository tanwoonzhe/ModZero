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
  
  const [activeTab, setActiveTab] = useState<'weights' | 'licenses' | 'audit'>('weights');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPillars, setExpandedPillars] = useState<Set<Pillar>>(new Set([Pillar.Identity]));
  
  // License detection state
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
      
      console.log('Raw SKUs from Azure:', skus);
      
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
        console.log(`Checking SKU: ${skuPart}`);
        
        // Direct SKU match
        Object.entries(skuMapping).forEach(([pattern, licenses]) => {
          if (skuPart === pattern.toUpperCase() || skuPart.includes(pattern.toUpperCase())) {
            console.log(`  Matched SKU pattern: ${pattern} -> ${licenses.join(', ')}`);
            licenses.forEach(lic => { detected[lic] = true; });
          }
        });
        
        // Check service plans within the SKU
        const servicePlans = sku.servicePlans || [];
        servicePlans.forEach((plan: any) => {
          const planName = (plan.servicePlanName || '').toUpperCase();
          Object.entries(servicePlanMapping).forEach(([pattern, licenses]) => {
            if (planName === pattern.toUpperCase() || planName.includes(pattern.toUpperCase())) {
              console.log(`  Matched service plan: ${planName} -> ${licenses.join(', ')}`);
              licenses.forEach(lic => { detected[lic] = true; });
            }
          });
        });
      });
      
      const detectedCount = Object.values(detected).filter(Boolean).length;
      console.log(`Detected ${detectedCount} licenses:`, detected);
      
      if (detectedCount === 0 && skus.length > 0) {
        // Show warning with raw SKU names for debugging
        const skuNames = skus.map((s: any) => s.skuPartNumber).filter(Boolean).join(', ');
        setLicenseError(`Found ${skus.length} SKUs but couldn't map them: ${skuNames || 'No SKU names available'}. You may need to configure licenses manually.`);
      }
      
      setDetectedLicenses(detected);
    } catch (error: any) {
      console.error('Failed to detect licenses:', error);
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
            Zero Trust Policies
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure scoring weights and manage licenses • {isAdmin ? 'Admin Mode' : 'View Only'}
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
          onClick={() => setActiveTab('weights')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'weights'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaCog className="inline mr-2" size={14} />
          Weights
        </button>
        <button
          onClick={() => setActiveTab('licenses')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'licenses'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaLock className="inline mr-2" size={14} />
          Licenses
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'audit'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaHistory className="inline mr-2" size={14} />
          Audit Log ({weightAuditEvents.length})
        </button>
      </div>
      
      {/* Weights Tab */}
      {activeTab === 'weights' && (
        <div className="space-y-6">
          {/* Pillar Weights Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Pillar Weights</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Distribute importance across Zero Trust pillars. Weights will be normalized to sum to 100%.
              </p>
            </div>
            <div className="p-6">
              <div className="space-y-6">
                {Object.values(Pillar).map(pillar => {
                  const colors = PILLAR_COLORS[pillar];
                  const rawWeight = weightConfig.pillarWeights[pillar];
                  const normalizedWeight = normalizedWeights[pillar];
                  const pillarScore = scores.achievable.byPillar[pillar];
                  
                  return (
                    <div key={pillar} className="flex items-center gap-6">
                      <div className="w-36 flex-shrink-0">
                        <span className={`px-3 py-1 text-sm rounded-full ${colors.bg} ${colors.text}`}>
                          {pillar}
                        </span>
                      </div>
                      <div className="flex-1">
                        <input
                          type="range"
                          min="0"
                          max={Math.min(100, 100 - rawPillarSum + rawWeight)}
                          value={rawWeight}
                          onChange={(e) => {
                            const newValue = parseInt(e.target.value);
                            const otherPillarsSum = rawPillarSum - rawWeight;
                            const maxAllowed = 100 - otherPillarsSum;
                            updatePillarWeight(pillar, Math.min(newValue, maxAllowed));
                          }}
                          disabled={!isAdmin}
                          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div className="w-20 text-right">
                        <span className="text-lg font-semibold text-gray-900 dark:text-white">
                          {rawWeight}%
                        </span>
                        {rawWeight !== Math.round(normalizedWeight) && (
                          <p className="text-xs text-gray-400">
                            → {Math.round(normalizedWeight)}%
                          </p>
                        )}
                      </div>
                      <div className="w-24 text-right text-sm text-gray-500 dark:text-gray-400">
                        {pillarScore.percent}% complete
                        <br />
                        <span className="text-xs">
                          {pillarScore.passedCount}/{pillarScore.controlCount}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${rawPillarSum === 100 ? 'text-green-600 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                    Total: {rawPillarSum}%
                  </span>
                  {rawPillarSum < 100 && (
                    <span className="flex items-center gap-1 text-xs text-amber-500">
                      <FaExclamationTriangle size={12} />
                      {100 - rawPillarSum}% remaining to allocate
                    </span>
                  )}
                  {rawPillarSum === 100 && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <FaCheck size={12} />
                      Fully allocated
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      Object.values(Pillar).forEach(p => {
                        updatePillarWeight(p, DEFAULT_PILLAR_WEIGHTS[p]);
                      });
                      toast.success('Pillar weights reset to defaults');
                    }}
                    disabled={!isAdmin}
                    className="text-sm text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                  >
                    Reset to defaults
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        // Save weights to backend API
                        await api.post('/policies/weights', {
                          pillar_weights: weightConfig.pillarWeights,
                          control_weight_overrides: weightConfig.controlWeightOverrides,
                          updated_by: isAdmin ? 'admin' : 'user'
                        });
                        toast.success('Weights saved to server successfully');
                      } catch (error: any) {
                        console.error('Failed to save weights:', error);
                        // Still saved locally via Zustand persist
                        toast.success('Weights saved locally (server unavailable)');
                      }
                    }}
                    disabled={!isAdmin}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FaSave className="inline mr-2" size={14} />
                    Save Weights
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* FYP Module Weights + Access Threshold Card */}
          <FypModuleWeightsCard />
          
          {/* Control Weights Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Control Weights</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Customize importance of individual security controls
                  </p>
                </div>
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input
                    type="text"
                    placeholder="Search controls..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  />
                </div>
              </div>
            </div>
            
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {Object.values(Pillar).map(pillar => {
                const pillarControls = controlsByPillar[pillar] || [];
                if (pillarControls.length === 0) return null;
                
                const isExpanded = expandedPillars.has(pillar);
                const colors = PILLAR_COLORS[pillar];
                
                return (
                  <div key={pillar}>
                    {/* Pillar Header */}
                    <button
                      onClick={() => togglePillar(pillar)}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 text-sm rounded-full ${colors.bg} ${colors.text}`}>
                          {pillar}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {pillarControls.length} controls
                        </span>
                      </div>
                      {isExpanded ? <FaChevronDown size={14} className="text-gray-400" /> : <FaChevronRight size={14} className="text-gray-400" />}
                    </button>
                    
                    {/* Controls List */}
                    {isExpanded && (
                      <div className="px-6 pb-4">
                        <table className="w-full">
                          <thead>
                            <tr className="text-xs text-gray-500 uppercase tracking-wider">
                              <th className="text-left py-2">Control</th>
                              <th className="text-left py-2 w-24">Default</th>
                              <th className="text-left py-2 w-48">Weight</th>
                              <th className="text-left py-2 w-20">Points</th>
                              <th className="text-left py-2 w-24">Licensed</th>
                              <th className="text-left py-2 w-20"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {pillarControls.map(control => {
                              const effectiveWeight = getEffectiveWeight(control, weightConfig);
                              const hasOverride = control.id in weightConfig.controlWeightOverrides;
                              const licensed = isLicensed(control, tenantLicenses);
                              
                              return (
                                <tr key={control.id} className={`${!licensed ? 'opacity-50' : ''}`}>
                                  <td className="py-3">
                                    <div>
                                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                                        {control.title}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {control.id}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="py-3 text-sm text-gray-500">
                                    {control.defaultWeight}%
                                  </td>
                                  <td className="py-3">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={effectiveWeight}
                                        onChange={(e) => updateControlWeight(control.id, parseInt(e.target.value))}
                                        disabled={!isAdmin}
                                        className="w-24 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                                      />
                                      <span className={`text-sm font-medium w-12 ${
                                        hasOverride ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'
                                      }`}>
                                        {effectiveWeight}%
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-3 text-sm text-gray-500">
                                    {control.maxPoints} pts
                                  </td>
                                  <td className="py-3">
                                    {licensed ? (
                                      <FaCheck className="text-green-500" size={14} />
                                    ) : (
                                      <span className="text-xs text-amber-600">
                                        <FaLock size={12} className="inline mr-1" />
                                        Required
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3">
                                    {hasOverride && isAdmin && (
                                      <button
                                        onClick={() => resetControlWeight(control.id)}
                                        className="text-gray-400 hover:text-indigo-600"
                                        title="Reset to default"
                                      >
                                        <FaUndo size={12} />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      {/* Licenses Tab */}
      {activeTab === 'licenses' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">License Configuration</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Configure which Microsoft licenses are available in your tenant
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={detectLicenses}
                  disabled={loadingLicenses}
                  className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  {loadingLicenses ? (
                    <FaSpinner className="animate-spin" size={14} />
                  ) : (
                    <FaSearch size={14} />
                  )}
                  Detect from Azure
                </button>
                {detectedLicenses && (
                  <button
                    onClick={applyDetectedLicenses}
                    disabled={!isAdmin}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <FaCheck size={14} />
                    Apply Detected
                  </button>
                )}
              </div>
            </div>
            
            {/* License detection status */}
            {licenseError && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
                <FaInfoCircle className="text-amber-500 mt-0.5" size={14} />
                <div className="text-sm text-amber-700 dark:text-amber-300">
                  <p className="font-medium">Could not auto-detect licenses</p>
                  <p className="text-xs mt-1">{licenseError}</p>
                </div>
              </div>
            )}
            
            {detectedLicenses && !licenseError && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-2">
                <FaCheck className="text-green-500 mt-0.5" size={14} />
                <div className="text-sm text-green-700 dark:text-green-300">
                  <p className="font-medium">Licenses detected from Azure</p>
                  <p className="text-xs mt-1">
                    Found {Object.values(detectedLicenses).filter(Boolean).length} licenses. Click "Apply Detected" to update.
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(LICENSE_INFO).map(([key, info]) => {
                const isEnabled = tenantLicenses.enabled[key as LicenseKey];
                const isDetected = detectedLicenses?.[key] ?? null;
                const controlsRequiring = controls.filter(c => c.minLicenses.includes(key as LicenseKey));
                
                return (
                  <div
                    key={key}
                    className={`p-4 rounded-lg border ${
                      isEnabled
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900 dark:text-white">
                            {info.displayName}
                          </h3>
                          {isEnabled && <FaCheck className="text-green-500" size={14} />}
                          {isDetected !== null && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              isDetected 
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                            }`}>
                              {isDetected ? 'Detected' : 'Not found'}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {info.description}
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          {controlsRequiring.length} controls require this license
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2">
                          {isDetected === false && (
                            <FaLock className="text-gray-400" size={12} title="Locked - license not available in tenant" />
                          )}
                          <button
                            onClick={() => toggleLicense(key)}
                            disabled={!isAdmin || isDetected === false}
                            className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              isEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                            title={isDetected === false ? 'License not available in your tenant - cannot be enabled' : (!isAdmin ? 'Admin permission required to change licenses' : '')}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                isEnabled ? 'translate-x-6' : ''
                              }`}
                            />
                          </button>
                        </div>
                        <a
                          href={info.purchaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                        >
                          Learn more <FaExternalLinkAlt size={10} />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      {/* Audit Tab */}
      {activeTab === 'audit' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Audit Log</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              History of weight and configuration changes
            </p>
          </div>
          <div className="p-6">
            <AuditLogPanel events={weightAuditEvents} maxHeight="max-h-[600px]" />
          </div>
        </div>
      )}
    </div>
  );
};

export default ZeroTrustPoliciesPage;

/* ------------------------------------------------------------------ */
/*  FYP Module Weights + Access Threshold                             */
/* ------------------------------------------------------------------ */

import { FaCog, FaLaptop, FaNetworkWired, FaShieldAlt as FaShieldAltB } from 'react-icons/fa';

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
          <FaCog className="text-indigo-600" /> FYP Module Weights
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
                Minimum trust score required to access the protected resource at localhost:2026.
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
