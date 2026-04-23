/**
 * IdentityPageV2 - Final consolidated Identity testing page.
 *
 * Replaces the previous IdentityPage / IdentityTestingPageLive /
 * ZeroTrustTestingPage(Identity) combination.
 *
 * Tabs:
 *   1. Baseline Checks — 5 Microsoft Zero Trust Assessment-inspired
 *      identity tests served by /api/identity-checks.
 *   2. Custom Tests    — Grouped under the 3 FYP modules
 *      (Device Posture / Context Analysis / Trust Scoring Engine).
 *
 * Counts come from the *actual rendered* check list, so they never
 * display the inflated 135-tests number any more.
 *
 * Results are persisted to localStorage via the zustand store so
 * they survive navigation.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  FaShieldAlt, FaPlay, FaSpinner, FaSync, FaInfoCircle,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../api';
import BaselineCheckCard, { BaselineResult } from '../components/BaselineCheckCard';
import ModuleCustomTestsTab from '../components/ModuleCustomTestsTab';
import { useZeroTrustStore } from '../store/zeroTrustStore';

const IdentityPageV2: React.FC = () => {
  const results = useZeroTrustStore(s => s.identityCheckResults) as BaselineResult[];
  const summary = useZeroTrustStore(s => s.identityCheckSummary);
  const isMock = useZeroTrustStore(s => s.identityIsMock);
  const setState = useZeroTrustStore(s => s.setIdentityCheckState);

  const [tab, setTab] = useState<'baseline' | 'custom'>('baseline');
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const runAll = useCallback(async () => {
    setIsRunningAll(true);
    try {
      const { data } = await api.post('/identity-checks/tests/run');
      setState(data.results, data.summary, !!data.is_mock);
      toast.success(`Ran ${data.results.length} identity checks`);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to run identity checks');
    } finally {
      setIsRunningAll(false);
    }
  }, [setState]);

  const runOne = useCallback(async (testId: string) => {
    setRunningId(testId);
    try {
      const { data } = await api.post(`/identity-checks/tests/${testId}/run`);
      const r: BaselineResult = data.result;
      const updated = results.map(x => x.id === r.id ? r : x);
      // build new summary locally
      const total = updated.length;
      const passed = updated.filter(x => x.status === 'pass').length;
      const actual = updated.reduce((s, x) => s + (x.score || 0), 0);
      setState(updated, {
        total, passed,
        warnings: updated.filter(x => x.status === 'warning').length,
        failed: updated.filter(x => x.status === 'fail').length,
        not_available: updated.filter(x => x.status === 'not_available').length,
        errors: updated.filter(x => x.status === 'error').length,
        score: total ? Math.round((actual / total) * 100) : 0,
        last_run: new Date().toISOString(),
      }, !!data.is_mock);
      toast.success(`Re-ran ${testId}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || `Failed to run ${testId}`);
    } finally {
      setRunningId(null);
    }
  }, [results, setState]);

  // If we don't have cached results on first mount, kick off an initial run
  useEffect(() => {
    if (!results || results.length === 0) {
      runAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const total = results.length;
    return {
      total,
      passed: results.filter(r => r.status === 'pass').length,
      warnings: results.filter(r => r.status === 'warning').length,
      failed: results.filter(r => r.status === 'fail').length,
      enabled: total, // every loaded check is enabled by design
      disabled: 0,
    };
  }, [results]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FaShieldAlt className="text-indigo-600" />
            Identity
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Zero Trust identity baseline (inspired by Microsoft Zero Trust Assessment) and FYP module-aligned custom tests.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isMock && (
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full inline-flex items-center gap-1">
              <FaInfoCircle size={12} /> demo data (Graph not configured)
            </span>
          )}
          <button
            onClick={runAll}
            disabled={isRunningAll}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded inline-flex items-center gap-2"
          >
            {isRunningAll ? <FaSpinner className="animate-spin" /> : <FaSync />}
            {isRunningAll ? 'Running...' : results.length === 0 ? 'Run all checks' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Counts bar — based only on actually loaded checks */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <CountCard label="Loaded" value={counts.total} color="text-gray-800" />
        <CountCard label="Passed" value={counts.passed} color="text-green-600" />
        <CountCard label="Warnings" value={counts.warnings} color="text-amber-600" />
        <CountCard label="Failed" value={counts.failed} color="text-red-600" />
        <CountCard
          label="Score"
          value={summary?.score != null ? `${summary.score}%` : '–'}
          color="text-indigo-600"
        />
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        {counts.enabled} enabled · {counts.disabled} disabled · last run{' '}
        {summary?.last_run ? new Date(summary.last_run).toLocaleString() : 'never'}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        <TabButton active={tab === 'baseline'} onClick={() => setTab('baseline')}>
          Baseline Checks <span className="ml-1 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{counts.total}</span>
        </TabButton>
        <TabButton active={tab === 'custom'} onClick={() => setTab('custom')}>
          Custom Tests
        </TabButton>
      </div>

      {tab === 'baseline' && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <div className="text-center text-gray-500 py-10">
              {isRunningAll ? 'Running checks...' : 'No results yet. Click "Run all checks" to start.'}
            </div>
          ) : (
            results.map(r => (
              <BaselineCheckCard
                key={r.id}
                result={r}
                isRunning={runningId === r.id}
                onRun={runOne}
              />
            ))
          )}
        </div>
      )}

      {tab === 'custom' && <ModuleCustomTestsTab pillar="Identity" />}
    </div>
  );
};

const CountCard: React.FC<{ label: string; value: number | string; color: string }> = ({ label, value, color }) => (
  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
    <div className="text-xs text-gray-500">{label}</div>
    <div className={`text-2xl font-bold ${color}`}>{value}</div>
  </div>
);

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
      active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
    }`}
  >
    {children}
  </button>
);

export default IdentityPageV2;
