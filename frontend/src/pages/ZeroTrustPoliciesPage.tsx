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

import React, { useState, useEffect } from 'react';
import {
  FaShieldAlt,
  FaShieldAlt as FaShieldAltB,
  FaCog,
  FaUndo,
  FaSave,
  FaExclamationTriangle,
  FaLaptop,
  FaNetworkWired,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import {
  useZeroTrustStore,
  selectIsAdmin,
  selectWeightConfig,
} from '../store/zeroTrustStore';
import api from '../api';

type FailureAction = 'reduce_score' | 'deny_immediately';

/* ------------------------------------------------------------------ */
/*  Entra (Microsoft Graph) signals — editable per-module card          */
/* ------------------------------------------------------------------ */

interface EntraSignalRule {
  key: string;
  label: string;
  description?: string;
  pts: number;
  enabled: boolean;
  failureAction: FailureAction;
}

type EntraModule = 'identity' | 'device' | 'context';

const DEFAULT_ENTRA_SIGNALS: Record<EntraModule, EntraSignalRule[]> = {
  identity: [
    { key: 'account_enabled',       label: 'Account Enabled',         description: 'Entra account is active — a disabled account is always denied access regardless of score', pts: 30, enabled: true,  failureAction: 'deny_access' },
    { key: 'role_valid',            label: 'Role Valid',              description: 'User belongs to at least one Entra group or directory role (legitimate employees always do)', pts: 20, enabled: true,  failureAction: 'reduce_score' },
    { key: 'mfa_registered',        label: 'MFA Registered',          description: 'Multi-factor authentication method registered in Entra (Authenticator App, FIDO2, etc.)', pts: 25, enabled: true,  failureAction: 'reduce_score' },
    { key: 'identity_risk_low',     label: 'Identity Risk Low',       description: 'Entra Identity Protection risk level is none or low for this user', pts: 20, enabled: true,  failureAction: 'reduce_score' },
    { key: 'conditional_access_ok', label: 'Conditional Access OK',   description: 'Sign-in passed all applicable Conditional Access policies in this tenant', pts: 15, enabled: true,  failureAction: 'reduce_score' },
  ],
  device: [
    { key: 'entra_registered',  label: 'Entra Registered',   description: 'Device is registered in the Entra ID directory', pts: 10, enabled: true,  failureAction: 'reduce_score' },
    { key: 'intune_managed',    label: 'Intune Managed',      description: 'Device is enrolled and actively managed by Intune MDM', pts: 10, enabled: true,  failureAction: 'reduce_score' },
    { key: 'intune_encrypted',  label: 'Intune Encrypted',    description: 'Intune reports the device disk as encrypted', pts: 15, enabled: true,  failureAction: 'reduce_score' },
  ],
  context: [
    { key: 'signin_risk_low',   label: 'Sign-in Risk Low',    description: 'User is not flagged by Entra Identity Protection as a risky sign-in', pts: 15, enabled: true,  failureAction: 'reduce_score' },
    { key: 'trusted_location',  label: 'Trusted Location',    description: 'Sign-in originated from a Named Location configured as trusted in this tenant', pts: 10, enabled: true,  failureAction: 'reduce_score' },
  ],
};

const ENTRA_RULES_KEY = (module: EntraModule) => `modzero-entra-signals-${module}`;

const EntraSignalsCard: React.FC<{ module: EntraModule }> = ({ module }) => {
  const [globalEnabled, setGlobalEnabled] = useState<boolean | null>(null);
  const [rules, setRules] = useState<EntraSignalRule[]>(() => {
    try {
      const saved = localStorage.getItem(ENTRA_RULES_KEY(module));
      if (saved) {
        const parsed = JSON.parse(saved) as EntraSignalRule[];
        return DEFAULT_ENTRA_SIGNALS[module].map(def => {
          const s = parsed.find(r => r.key === def.key);
          return s ? { ...def, pts: s.pts, enabled: s.enabled, failureAction: s.failureAction } : def;
        });
      }
    } catch {}
    return DEFAULT_ENTRA_SIGNALS[module];
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/trust-policy/active')
      .then(r => setGlobalEnabled(!!r.data.entra_enabled))
      .catch(() => setGlobalEnabled(false));
  }, []);

  const toggle = (key: string) =>
    setRules(r => r.map(rule => rule.key === key ? { ...rule, enabled: !rule.enabled } : rule));
  const setPts = (key: string, pts: number) =>
    setRules(r => r.map(rule => rule.key === key ? { ...rule, pts: Math.max(0, Math.min(100, pts)) } : rule));
  const setFailureAction = (key: string, action: FailureAction) =>
    setRules(r => r.map(rule => rule.key === key ? { ...rule, failureAction: action } : rule));

  const handleSave = () => {
    localStorage.setItem(ENTRA_RULES_KEY(module), JSON.stringify(rules));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mt-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            Entra Identity Signals (Microsoft Graph)
            <span className={`px-2 py-0.5 rounded text-xs ${globalEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
              {globalEnabled === null ? '…' : globalEnabled ? 'Active' : 'Disabled'}
            </span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {globalEnabled
              ? 'Live signals contributing to the score while Entra is enabled. Evaluated per posture report; results show in the client app Device Check breakdown.'
              : 'Unlocked by the global toggle in Settings → Azure AD Integration. While off, all signals are N/A and never affect the score.'}
          </p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          <FaSave size={13} />
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Signal</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Enabled</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Max Points</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failure Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {rules.map(s => (
              <tr key={s.key} className={(!globalEnabled || !s.enabled) ? 'opacity-50' : ''}>
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{s.label}</div>
                  {s.description && <div className="text-xs text-gray-400 mt-0.5">{s.description}</div>}
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className="inline-flex px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Microsoft Graph</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggle(s.key)}
                    className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${s.enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full shadow mx-0.5 transition-transform ${s.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    min={0} max={100} value={s.pts}
                    onChange={e => setPts(s.key, Number(e.target.value))}
                    disabled={!s.enabled}
                    className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={s.failureAction}
                    onChange={e => setFailureAction(s.key, e.target.value as FailureAction)}
                    disabled={!s.enabled}
                    className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="reduce_score">Reduce score only</option>
                    <option value="deny_immediately">Deny immediately</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${globalEnabled && s.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {globalEnabled && s.enabled ? 'Active' : 'N/A'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-400">
          Changes saved here are UI display only — actual backend weights are in <code className="font-mono">azure_signal_service.py</code>.
        </p>
      </div>
    </div>
  );
};

const ZeroTrustPoliciesPage: React.FC = () => {
  const isAdmin = useZeroTrustStore(selectIsAdmin);
  const weightConfig = useZeroTrustStore(selectWeightConfig);

  const { resetAllWeights } = useZeroTrustStore();

  const [activeTab, setActiveTab] = useState<'resource-policies' | 'device-rules' | 'identity-rules' | 'context-rules' | 'weights'>('resource-policies');

  // Resources state for Resource Policies tab
  const [resources, setResources] = useState<any[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  // Live policy summary from backend
  const [policyConfig, setPolicyConfig] = useState<{
    device_weight: number; context_weight: number; identity_weight: number;
    default_threshold: number; updated_at?: string;
  } | null>(null);
  const [policyLoading, setPolicyLoading] = useState(true);


  useEffect(() => {
    api.get('/trust-policy/active')
      .then(r => setPolicyConfig(r.data))
      .catch(() => {})
      .finally(() => setPolicyLoading(false));
  }, []);
  
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
      
      {/* Live Policy Summary — fetched from backend TrustPolicyConfig */}
      {policyLoading ? (
        <div className="h-24 flex items-center justify-center text-sm text-gray-400">Loading policy config…</div>
      ) : policyConfig ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-1">Access Threshold</p>
            <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{policyConfig.default_threshold}</p>
            <p className="text-xs text-gray-400 mt-1">min trust score to allow access</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-2">Module Weights</p>
            <div className="space-y-1.5">
              {[
                { label: "Device", pct: Math.round(policyConfig.device_weight * 100), color: "bg-indigo-500" },
                { label: "Context", pct: Math.round(policyConfig.context_weight * 100), color: "bg-amber-500" },
                { label: "Identity", pct: Math.round(policyConfig.identity_weight * 100), color: "bg-emerald-500" },
              ].map(m => (
                <div key={m.label} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-14">{m.label}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                    <div className={`${m.color} h-2 rounded-full`} style={{ width: `${m.pct}%` }} />
                  </div>
                  <span className="text-xs font-mono text-gray-700 dark:text-gray-300 w-8 text-right">{m.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-1">Max Possible Score</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">100</p>
            <p className="text-xs text-gray-400 mt-1">all signals passing, all weights at 100%</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-1">Last Modified</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {policyConfig.updated_at ? new Date(policyConfig.updated_at).toLocaleDateString() : new Date(weightConfig.updatedAt).toLocaleDateString()}
            </p>
            <p className="text-xs text-gray-400 mt-1">by {weightConfig.updatedBy}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="col-span-4 text-center text-sm text-gray-400 py-4">Could not load policy config from backend.</div>
        </div>
      )}
      
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
          onClick={() => setActiveTab('identity-rules')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'identity-rules'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaShieldAlt className="inline mr-2" size={14} />
          Identity Rules
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
        <><DeviceRulesTab /><EntraSignalsCard module="device" /></>
      )}

      {/* Identity Rules Tab */}
      {activeTab === 'identity-rules' && (
        <><IdentityRulesTab /><EntraSignalsCard module="identity" /></>
      )}

      {/* Context Rules Tab */}
      {activeTab === 'context-rules' && (
        <><ContextRulesTab /><EntraSignalsCard module="context" /></>
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
/*  Device Rules Tab                                                    */
/* ------------------------------------------------------------------ */
/*  Identity Rules Tab                                                  */
/* ------------------------------------------------------------------ */

const DEFAULT_IDENTITY_RULES = [
  {
    key:           'recent_login',
    label:         'Recent Login',
    source:        'Local Auth',
    maxPoints:     15,
    enabled:       true,
    failureAction: 'reduce_score' as const,
    description:   'User authenticated recently. Implied by the active JWT — always pass for local auth.',
  },
  {
    key:           'low_failed_logins',
    label:         'Low Failed Login Count',
    source:        'Local Auth',
    maxPoints:     25,
    enabled:       true,
    failureAction: 'reduce_score' as const,
    description:   'No excessive failed logins (threshold: 5). Local DB has no failed-login tracking — assumed clean. Real failures tracked via Entra sign-in logs.',
  },
  {
    key:           'not_locked',
    label:         'Account Not Locked',
    source:        'Local Auth',
    maxPoints:     10,
    enabled:       true,
    failureAction: 'deny_immediately' as const,
    description:   'Account is not locked out. Local DB has no lock field — assumed unlocked. Azure AD lockout state evaluated via Entra when enabled.',
  },
  {
    key:           'account_enabled',
    label:         'Account Enabled',
    source:        'Microsoft Graph',
    maxPoints:     30,
    enabled:       true,
    failureAction: 'deny_immediately' as const,
    description:   'Account is active in Azure AD (accountEnabled field). N/A for local-only users — only scored when Entra is connected. Disabled accounts are also hard-gated.',
  },
  {
    key:           'role_valid',
    label:         'Role Valid',
    source:        'Microsoft Graph',
    maxPoints:     20,
    enabled:       true,
    failureAction: 'deny_immediately' as const,
    description:   'User has a recognised Entra role. N/A for local-only users — only scored when Entra is connected (currently reserved).',
  },
];

const IDENTITY_RULES_KEY = 'modzero-identity-rules';

interface IdentityRule {
  key: string;
  label: string;
  source: string;
  maxPoints: number;
  enabled: boolean;
  failureAction: FailureAction;
  description: string;
}

const IdentityRulesTab: React.FC = () => {
  const [rules, setRules] = useState<IdentityRule[]>(() => {
    try {
      const saved = localStorage.getItem(IDENTITY_RULES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as IdentityRule[];
        return DEFAULT_IDENTITY_RULES.map(def => {
          const s = parsed.find(r => r.key === def.key);
          return s ? { ...def, maxPoints: s.maxPoints, enabled: s.enabled, failureAction: s.failureAction ?? def.failureAction } : def;
        });
      }
    } catch {}
    return DEFAULT_IDENTITY_RULES;
  });
  const [saved, setSaved] = useState(false);

  const toggle = (key: string) =>
    setRules(r => r.map(rule => rule.key === key ? { ...rule, enabled: !rule.enabled } : rule));

  const setPoints = (key: string, pts: number) =>
    setRules(r => r.map(rule => rule.key === key ? { ...rule, maxPoints: Math.max(0, Math.min(100, pts)) } : rule));

  const setFailureActionIdentity = (key: string, action: FailureAction) =>
    setRules(r => r.map(rule => rule.key === key ? { ...rule, failureAction: action } : rule));

  const handleSave = () => {
    localStorage.setItem(IDENTITY_RULES_KEY, JSON.stringify(rules));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const total = rules.filter(r => r.enabled).reduce((s, r) => s + r.maxPoints, 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Identity Rules</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Identity signals evaluated server-side on every posture report. Fixed denominator = 100.
            Local-only users score up to 50/100 (50%). Entra-linked users can reach 100/100.
            Account Enabled and Role Valid are Entra-only — N/A for local auth, scored when Graph confirms them.
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Signal</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Enabled</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Max Points</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failure Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Affects Trust</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {rules.map(sig => (
              <tr key={sig.key} className={sig.enabled ? '' : 'opacity-50'}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{sig.label}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  <span className="inline-flex px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {sig.source}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-xs">{sig.description}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggle(sig.key)}
                    className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${sig.enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full shadow mx-0.5 transition-transform ${sig.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    min={0} max={100} value={sig.maxPoints}
                    onChange={e => setPoints(sig.key, Number(e.target.value))}
                    disabled={!sig.enabled}
                    className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={sig.failureAction}
                    onChange={e => setFailureActionIdentity(sig.key, e.target.value as FailureAction)}
                    disabled={!sig.enabled}
                    className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="reduce_score">Reduce score only</option>
                    <option value="deny_immediately">Deny immediately</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${sig.enabled ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {sig.enabled ? 'Yes' : 'Disabled'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Total enabled points: <strong>{total}</strong>/100 · Local-only users score up to 50 (Account Enabled + Role Valid require Entra).
          Source: <code className="font-mono">identity_signal_service.py</code>.
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Changes saved here are UI display only — backend weights are in <code className="font-mono">identity_signal_service.py</code>.
        </p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const DEFAULT_DEVICE_RULES = [
  { key: 'firewall_enabled',        label: 'Firewall Enabled',         description: 'Windows Firewall is enabled on at least one network profile',            source: 'Client App',               weight: 15, enabled: true,  failureAction: 'reduce_score'    as const },
  { key: 'antivirus_enabled',       label: 'Antivirus Enabled',        description: 'Windows Defender or registered antivirus is active and up to date',      source: 'Client App',               weight: 15, enabled: true,  failureAction: 'reduce_score'    as const },
  { key: 'disk_encryption_enabled', label: 'Disk Encryption Enabled',  description: 'BitLocker system drive is fully encrypted with protection on',           source: 'Client App',               weight: 15, enabled: true,  failureAction: 'reduce_score'    as const },
  { key: 'screen_lock_enabled',     label: 'Screen Lock Enabled',      description: 'Secure screensaver or console-lock timeout is configured',               source: 'Client App',               weight: 10, enabled: true,  failureAction: 'reduce_score'    as const },
  { key: 'os_supported',            label: 'OS Version Supported',     description: 'Windows major version is 10 or later',                                   source: 'Client App',               weight: 10, enabled: true,  failureAction: 'reduce_score'    as const },
  { key: 'client_healthy',          label: 'Client App Healthy',       description: 'Client fingerprint file exists and is readable',                         source: 'Client App',               weight: 10, enabled: true,  failureAction: 'reduce_score'    as const },
  { key: 'recent_posture_check',    label: 'Recent Posture Check',     description: 'Last posture report was submitted within 7 days',                        source: 'Client App',               weight: 10, enabled: true,  failureAction: 'reduce_score'    as const },
  { key: 'intune_compliant',        label: 'Intune Compliant',         description: 'Device is marked compliant by Intune — non-compliance triggers immediate denial', source: 'Microsoft Graph / Intune', weight: 20, enabled: true,  failureAction: 'deny_immediately' as const },
];

interface DeviceRule {
  key: string;
  label: string;
  description?: string;
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
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{rule.label}</div>
                  {rule.description && <div className="text-xs text-gray-400 mt-0.5">{rule.description}</div>}
                </td>
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
      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Total enabled weight: {rules.filter(r => r.enabled).reduce((s, r) => s + r.weight, 0)}/100 ·
          "Deny immediately" stops evaluation on failure even if other checks pass.
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Changes saved here are UI display only — actual backend weights are in <code className="font-mono">posture_scoring.py</code>.
        </p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Context Rules Tab                                                   */
/* ------------------------------------------------------------------ */

const ContextRulesTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [allowedStartHour, setAllowedStartHour] = useState(8);
  const [allowedEndHour, setAllowedEndHour]     = useState(20);
  const [blockOutsideHours, setBlockOutsideHours]       = useState(false);
  const [maxFailedAttempts, setMaxFailedAttempts]       = useState(5);
  const [unknownDevicePenalty, setUnknownDevicePenalty] = useState(20);
  const [suspiciousIpPenalty, setSuspiciousIpPenalty]   = useState(15);
  const [requireKnownDevice, setRequireKnownDevice]     = useState(true);

  useEffect(() => {
    api.get('/trust-policy/active')
      .then(r => {
        const d = r.data;
        setAllowedStartHour(d.allowed_start_hour ?? 8);
        setAllowedEndHour(d.allowed_end_hour ?? 20);
        setBlockOutsideHours(d.block_outside_hours ?? false);
        setMaxFailedAttempts(d.max_failed_attempts ?? 5);
        setUnknownDevicePenalty(d.unknown_device_penalty ?? 20);
        setSuspiciousIpPenalty(d.suspicious_ip_penalty ?? 15);
        setRequireKnownDevice(d.require_known_device ?? true);
      })
      .catch(() => setError('Failed to load context rules from backend.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/trust-policy/active', {
        allowed_start_hour: allowedStartHour,
        allowed_end_hour: allowedEndHour,
        block_outside_hours: blockOutsideHours,
        max_failed_attempts: maxFailedAttempts,
        unknown_device_penalty: unknownDevicePenalty,
        suspicious_ip_penalty: suspiciousIpPenalty,
        require_known_device: requireKnownDevice,
      });
      setSavedOk(true);
      toast.success('Context rules saved to backend');
      setTimeout(() => setSavedOk(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Save failed.');
    } finally {
      setSaving(false);
    }
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

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Context Rules</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Time window, login attempt limits, and access context penalties — stored in the backend and used by every trust score calculation.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
        >
          <FaSave size={13} />
          {saving ? 'Saving…' : savedOk ? 'Saved!' : 'Save Rules'}
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-3 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="px-6 divide-y divide-gray-100 dark:divide-gray-700">
        {row(
          'Allowed Access Start Hour (0–23)',
          'Context score "normal_access_time" check passes only when the request hour is within this range.',
          <input type="number" min={0} max={23} value={allowedStartHour}
            onChange={e => setAllowedStartHour(Number(e.target.value))}
            className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
        )}
        {row(
          'Allowed Access End Hour (0–23)',
          `Access at or after this hour (local server time) is considered outside working hours.`,
          <input type="number" min={0} max={23} value={allowedEndHour}
            onChange={e => setAllowedEndHour(Number(e.target.value))}
            className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
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
          'Max Failed Login Attempts',
          'If a user exceeds this count, the "no_repeated_failed_login" check fails, reducing the context score.',
          <input type="number" min={1} max={20} value={maxFailedAttempts}
            onChange={e => setMaxFailedAttempts(Number(e.target.value))}
            className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
        )}
        {row(
          'Require Known Device',
          'If enabled, access from a device not previously registered penalizes the "known_device" check.',
          <button
            onClick={() => setRequireKnownDevice(!requireKnownDevice)}
            className={`w-10 h-5 rounded-full transition-colors ${requireKnownDevice ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className={`block w-4 h-4 bg-white rounded-full shadow mx-0.5 transition-transform ${requireKnownDevice ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        )}
        {row(
          'Unknown Device Score Penalty',
          'Points deducted from the "known_device" signal when the device is not registered.',
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={100} value={unknownDevicePenalty}
              onChange={e => setUnknownDevicePenalty(Number(e.target.value))}
              className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            <span className="text-xs text-gray-400">pts</span>
          </div>
        )}
        {row(
          'Suspicious IP Score Penalty',
          'Points deducted from the "normal_ip" signal when the request comes from a blocked IP.',
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={100} value={suspiciousIpPenalty}
              onChange={e => setSuspiciousIpPenalty(Number(e.target.value))}
              className="w-16 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            <span className="text-xs text-gray-400">pts</span>
          </div>
        )}
      </div>
      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-400">
          These rules are stored in the backend database and applied by every trust score calculation (client app device check, resource access gate, dashboard).
          Source: <code>TrustPolicyConfig</code> via <code>PATCH /api/trust-policy/active</code>.
        </p>
      </div>
    </div>
  );
};
/* ------------------------------------------------------------------ */
/*  FYP Module Weights + Access Threshold                             */
/* ------------------------------------------------------------------ */

const FypModuleWeightsCard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Weights stored as percentages (0-100) in UI; API uses 0.0-1.0
  const [devicePct, setDevicePct]     = useState(40);
  const [contextPct, setContextPct]   = useState(30);
  const [identityPct, setIdentityPct] = useState(30);
  const [threshold, setThreshold]     = useState(60);

  useEffect(() => {
    api.get('/trust-policy/active')
      .then(r => {
        const d = r.data;
        setDevicePct(Math.round((d.device_weight ?? 0.4) * 100));
        setContextPct(Math.round((d.context_weight ?? 0.3) * 100));
        setIdentityPct(Math.round((d.identity_weight ?? 0.3) * 100));
        setThreshold(d.default_threshold ?? 60);
      })
      .catch(() => setError('Failed to load weights from backend.'))
      .finally(() => setLoading(false));
  }, []);

  const total = devicePct + contextPct + identityPct;
  const totalValid = total === 100;

  const handleSave = async () => {
    if (!totalValid) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch('/trust-policy/active', {
        device_weight:   devicePct / 100,
        context_weight:  contextPct / 100,
        identity_weight: identityPct / 100,
        default_threshold: threshold,
      });
      setSavedOk(true);
      toast.success('Trust score weights saved to backend');
      setTimeout(() => setSavedOk(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const modules = [
    {
      pct: devicePct, setPct: setDevicePct,
      label: 'Device Posture Score',
      icon: FaLaptop, color: 'text-indigo-600',
      desc: 'Firewall, AV, disk encryption, screen lock, OS version, client health, Intune compliance.',
    },
    {
      pct: contextPct, setPct: setContextPct,
      label: 'Context Analysis Score',
      icon: FaNetworkWired, color: 'text-amber-600',
      desc: 'Known device, access time window, failed login count, source IP, user-device pair.',
    },
    {
      pct: identityPct, setPct: setIdentityPct,
      label: 'Identity Score',
      icon: FaShieldAltB, color: 'text-emerald-600',
      desc: 'Account enabled, MFA registered, admin role, guest status, last sign-in recency.',
    },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FaCog className="text-indigo-600" /> Trust Score Weights
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            These weights are stored in the backend and used by every trust score calculation — client app device check,
            resource access gate, and dashboard. <strong>Total must equal exactly 100%.</strong>
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!totalValid || saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          <FaSave size={13} />
          {saving ? 'Saving…' : savedOk ? 'Saved!' : 'Save Weights'}
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {!totalValid && (
        <div className="mx-6 mt-4 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2.5">
          <FaExclamationTriangle className="text-red-500 flex-shrink-0" size={14} />
          <p className="text-sm text-red-700 dark:text-red-300">
            Weights must sum to <strong>100%</strong>. Current total: <strong>{total}%</strong>.
          </p>
        </div>
      )}

      <div className="p-6 space-y-6">
        {modules.map(m => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={m.color} />
                  <span className="font-medium text-gray-900 dark:text-gray-100">{m.label}</span>
                </div>
                <span className="text-sm font-mono font-bold text-gray-900 dark:text-white">{m.pct}%</span>
              </div>
              <input
                type="range" min={0} max={100} value={m.pct}
                onChange={e => m.setPct(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400">{m.desc}</div>
            </div>
          );
        })}

        <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${
          totalValid
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Weight</span>
          <span className={`text-lg font-bold ${totalValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {total}%
          </span>
        </div>

        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">Access Threshold</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Minimum final trust score required to allow access. Resources can set a higher per-resource threshold.
              </div>
            </div>
            <span className="text-lg font-bold text-indigo-600">{threshold} / 100</span>
          </div>
          <input
            type="range" min={0} max={100} value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="text-xs text-gray-400 pt-1">
          Source: backend <code>TrustPolicyConfig</code> via <code>GET/PATCH /api/trust-policy/active</code>.
          Changes take effect on the next trust score calculation.
        </div>
      </div>
    </div>
  );
};
