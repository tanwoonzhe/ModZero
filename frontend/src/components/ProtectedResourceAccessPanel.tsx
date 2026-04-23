/**
 * ProtectedResourceAccessPanel — embedded on the Overview page.
 *
 * Renders the real trust-gated access flow for the resources registered
 * under /resources. The panel fetches the list of resources from the
 * backend, lets the user pick one, then calls /resource-access/gate with
 * the chosen resource_id. The backend is the source of truth for:
 *   - which target URL to open (built from the resource's host/port)
 *   - whether the trust score passes the policy threshold
 *
 * There is no hardcoded resource target anywhere in this component.
 */

import React, { useEffect, useState } from 'react';
import {
  FaLock, FaCheckCircle, FaTimesCircle, FaExternalLinkAlt, FaShieldAlt,
  FaLaptop, FaNetworkWired, FaSync, FaSpinner, FaServer,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import { useShallow } from 'zustand/react/shallow';
import api from '../api';
import {
  useZeroTrustStore, selectTrustScore, selectCurrentUser,
} from '../store/zeroTrustStore';

interface RegisteredResource {
  resource_id: string;
  name: string;
  slug: string;
  network_name: string;
  host: string;
  port: number;
  url: string;
  access_path: string;
}

const MODULE_META = {
  devicePostureScore: { label: 'Device Posture', icon: FaLaptop, color: 'text-indigo-600' },
  contextAnalysisScore: { label: 'Context Analysis', icon: FaNetworkWired, color: 'text-amber-600' },
  trustScoringEngineScore: { label: 'Trust Scoring Engine', icon: FaShieldAlt, color: 'text-emerald-600' },
} as const;

const ProtectedResourceAccessPanel: React.FC = () => {
  const trust = useZeroTrustStore(useShallow(selectTrustScore));
  const user = useZeroTrustStore(selectCurrentUser);
  const threshold = useZeroTrustStore(s => s.accessThreshold);
  const setIdentityState = useZeroTrustStore(s => s.setIdentityCheckState);
  const setDeviceState = useZeroTrustStore(s => s.setDeviceCheckState);

  const [resources, setResources] = useState<RegisteredResource[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);
  const [decision, setDecision] = useState<'allow' | 'deny' | null>(null);
  const [reason, setReason] = useState<string>('');

  const fetchResources = async () => {
    setLoadingResources(true);
    setResourceError(null);
    try {
      const { data } = await api.get<RegisteredResource[]>('/resource-access/resources');
      setResources(data);
      setSelectedId(prev => {
        if (data.length === 0) return '';
        if (data.find(r => r.resource_id === prev)) return prev;
        return data[0].resource_id;
      });
    } catch (e: any) {
      setResourceError(e?.response?.data?.detail || 'Failed to load resources');
    } finally {
      setLoadingResources(false);
    }
  };

  useEffect(() => {
    fetchResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rescan = async () => {
    setChecking(true);
    try {
      const [idRes, dvRes] = await Promise.all([
        api.post('/identity-checks/tests/run'),
        api.post('/device-checks/tests/run'),
      ]);
      setIdentityState(idRes.data.results, idRes.data.summary, !!idRes.data.is_mock);
      setDeviceState(dvRes.data.results, dvRes.data.summary, !!dvRes.data.is_mock);
      toast.success('Trust signals refreshed');
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Rescan failed');
    } finally {
      setChecking(false);
    }
  };

  const attemptAccess = async () => {
    const latest = selectTrustScore(useZeroTrustStore.getState());
    const thr = useZeroTrustStore.getState().accessThreshold;
    setChecking(true);
    setDecision(null);
    try {
      const { data } = await api.post('/resource-access/gate', {
        trust_score: latest.overall,
        access_threshold: thr,
        device_posture_score: latest.devicePostureScore,
        context_analysis_score: latest.contextAnalysisScore,
        trust_scoring_engine_score: latest.trustScoringEngineScore,
        resource_id: selectedId || undefined,
      });
      setReason(data.reason || '');
      if (data.allowed && (data.bootstrap_url || data.portal_url)) {
        setDecision('allow');
        const friendly = data.access_url || data.bootstrap_url || data.portal_url;
        toast.success(
          `Access granted to ${data.resource_name || 'resource'} via ${friendly} (${data.score} ≥ ${data.threshold})`
        );
        // Open the one-shot bootstrap URL — it plants the HttpOnly
        // session cookie on the backend origin and 302-redirects the
        // new tab to the stable /r/<slug> product URL.
        window.open(data.bootstrap_url || data.portal_url, '_blank', 'noopener,noreferrer');
      } else {
        setDecision('deny');
        toast.error(data.reason || `Access denied (${data.score} < ${data.threshold})`);
      }
    } catch (e: any) {
      setDecision('deny');
      const msg = e?.response?.data?.detail || 'Gate check failed';
      setReason(typeof msg === 'string' ? msg : JSON.stringify(msg));
      toast.error(typeof msg === 'string' ? msg : 'Gate check failed');
    } finally {
      setChecking(false);
    }
  };

  const selected = resources.find(r => r.resource_id === selectedId);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FaLock className="text-indigo-600" /> Protected Resource Access
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-2xl">
            Attempt access to a resource registered on the <strong>Resources</strong> page.
            The access decision is made server-side by the backend gate endpoint using your
            current trust score vs the configured threshold — ModZero does not hardcode any
            target URL.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Subject</div>
          <div className="text-sm font-semibold">
            {user.name} <span className="text-xs text-gray-500">({user.role})</span>
          </div>
        </div>
      </div>

      {/* Resource selector */}
      <div className="px-5 pt-5">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
          Target resource
        </label>
        {loadingResources ? (
          <div className="text-sm text-gray-500 flex items-center gap-2"><FaSpinner className="animate-spin" /> Loading resources…</div>
        ) : resourceError ? (
          <div className="text-sm text-red-600">{resourceError}</div>
        ) : resources.length === 0 ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            No resources registered yet. Go to <strong>Resources</strong> and add a network + resource
            (e.g. a demo intranet at <code>localhost:2026</code>) so the gate has something to protect.
            <button
              onClick={fetchResources}
              className="ml-3 underline text-amber-800"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setDecision(null); }}
              className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-900 min-w-[320px]"
            >
              {resources.map(r => (
                <option key={r.resource_id} value={r.resource_id}>
                  {r.name} — {r.network_name} ({r.host}:{r.port})
                </option>
              ))}
            </select>
            {selected && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                <FaServer /> Protected route:{' '}
                <code className="text-indigo-700 dark:text-indigo-300 font-semibold">{selected.access_path}</code>
                <span className="text-gray-400">· target {selected.host}:{selected.port}</span>
              </span>
            )}
            <button
              onClick={fetchResources}
              className="text-xs underline text-gray-600 dark:text-gray-400"
            >
              Refresh
            </button>
          </div>
        )}
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        {(Object.keys(MODULE_META) as Array<keyof typeof MODULE_META>).map(k => {
          const meta = MODULE_META[k];
          const v = trust[k];
          const Icon = meta.icon;
          return (
            <div key={k} className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded p-3">
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <Icon className={meta.color} size={12} /> {meta.label}
              </div>
              <div className="text-2xl font-bold">{v}</div>
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-5 flex flex-wrap items-center gap-2">
        <div className="text-sm">
          Overall: <strong className={trust.overall >= threshold ? 'text-green-600' : 'text-red-600'}>{trust.overall}</strong>
          <span className="text-gray-500"> / {threshold} required</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={rescan}
            disabled={checking}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 inline-flex items-center gap-2"
          >
            {checking ? <FaSpinner className="animate-spin" /> : <FaSync />}
            Rescan trust signals
          </button>
          <button
            onClick={attemptAccess}
            disabled={checking || (resources.length > 0 && !selectedId)}
            className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded inline-flex items-center gap-2"
          >
            <FaExternalLinkAlt /> Attempt access
          </button>
        </div>
      </div>

      {decision === 'allow' && (
        <div className="mx-5 mb-5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
          <FaCheckCircle className="text-green-600 mt-0.5" size={20} />
          <div className="text-sm">
            <div className="font-semibold text-green-900 dark:text-green-100">Access granted</div>
            <p className="text-green-800 dark:text-green-200 mt-1">
              {reason || `Your trust score of ${trust.overall} meets the required threshold of ${threshold}.`}{' '}
              The resource has been opened in a new tab.
            </p>
          </div>
        </div>
      )}

      {decision === 'deny' && (
        <div className="mx-5 mb-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
          <FaTimesCircle className="text-red-600 mt-0.5" size={20} />
          <div className="text-sm flex-1">
            <div className="font-semibold text-red-900 dark:text-red-100">Access denied</div>
            <p className="text-red-800 dark:text-red-200 mt-1">{reason}</p>
            {(Object.keys(MODULE_META) as Array<keyof typeof MODULE_META>).some(k => trust[k] < threshold) && (
              <ul className="mt-2 list-disc list-inside text-red-800 dark:text-red-200">
                {(Object.keys(MODULE_META) as Array<keyof typeof MODULE_META>)
                  .filter(k => trust[k] < threshold)
                  .map(k => (
                    <li key={k}>{MODULE_META[k].label} score {trust[k]} is below threshold {threshold}</li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProtectedResourceAccessPanel;
