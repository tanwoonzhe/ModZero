/**
 * TrustScoreCard – shows the current logged-in user/device trust score
 * for the FYP Overview page.
 *
 * Real signals consumed:
 *   - Identity baseline check results (persisted in store)
 *   - Device baseline check results (persisted in store)
 *   - Module custom test results (persisted in store)
 *   - Module weights configured in ZT Policies
 *
 * Breakdown is shown per FYP module (Device Posture / Context Analysis /
 * Trust Scoring Engine), plus the current user identity and a
 * "device identity" approximation (browser fingerprint — FYP-friendly
 * since this demo is served from a web browser, not a managed endpoint).
 */

import React, { useMemo } from 'react';
import { FaShieldAlt, FaLaptop, FaNetworkWired, FaUser, FaDesktop } from 'react-icons/fa';
import { useShallow } from 'zustand/react/shallow';
import {
  useZeroTrustStore, selectTrustScore, selectCurrentUser,
} from '../store/zeroTrustStore';

const MODULE_LABELS = {
  devicePostureScore: { label: 'Device Posture', icon: FaLaptop, color: 'text-indigo-600', weightKey: 'device_posture' as const },
  contextAnalysisScore: { label: 'Context Analysis', icon: FaNetworkWired, color: 'text-amber-600', weightKey: 'context_analysis' as const },
  trustScoringEngineScore: { label: 'Identity / Policy Score', icon: FaShieldAlt, color: 'text-emerald-600', weightKey: 'trust_scoring_engine' as const },
};

function getDeviceFingerprint(): string {
  // FYP-friendly device identity approximation: stable across reloads, different across browsers.
  // Good enough to demonstrate "this is *your* device trust score".
  const ua = navigator.userAgent || 'unknown';
  const platform = (navigator as any).platform || 'unknown';
  const lang = navigator.language || 'unknown';
  const screenSig = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
  return `${platform.split(' ')[0]}/${lang}/${screenSig}/${ua.split(' ').slice(-1)[0]}`;
}

function scoreColor(s: number): string {
  if (s >= 80) return 'text-green-600';
  if (s >= 60) return 'text-amber-600';
  return 'text-red-600';
}

const TrustScoreCard: React.FC = () => {
  const trust = useZeroTrustStore(useShallow(selectTrustScore));
  const user = useZeroTrustStore(selectCurrentUser);
  const threshold = useZeroTrustStore(s => s.accessThreshold);
  const weights = useZeroTrustStore(s => s.moduleWeights);
  const deviceId = useMemo(getDeviceFingerprint, []);

  const willAllowAccess = trust.overall >= threshold;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FaShieldAlt className="text-indigo-600" /> Access Decision Preview
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xl">
            Shows how ModZero evaluates the current user/device context for protected resource access.
            This score does <strong>not</strong> gate the admin dashboard login.
          </p>
        </div>
        <div className="text-right">
          <div className={`text-4xl font-bold ${scoreColor(trust.overall)}`}>{trust.overall}</div>
          <div className="text-xs text-gray-500">/ 100</div>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        {(Object.keys(MODULE_LABELS) as Array<keyof typeof MODULE_LABELS>).map(key => {
          const meta = MODULE_LABELS[key];
          const v = trust[key];
          const w = weights[meta.weightKey];
          const Icon = meta.icon;
          return (
            <div key={key} className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={meta.color} size={14} />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{meta.label}</span>
              </div>
              <div className={`text-2xl font-bold ${scoreColor(v)}`}>{v}</div>
              <div className="text-xs text-gray-500 mt-0.5">weight {w}</div>
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1">
            <FaUser /> Evaluated user
          </div>
          <div className="font-medium text-gray-900 dark:text-gray-100">{user.name}</div>
          <div className="text-xs text-gray-500">{user.email} · {user.role}</div>
          <div className="text-xs text-gray-500 mt-1">
            Identity sub-score: <span className={`font-semibold ${scoreColor(trust.identityScore)}`}>{trust.identityScore}</span>
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1">
            <FaDesktop /> Evaluated device / browser fingerprint
          </div>
          <div className="font-mono text-xs break-all text-gray-900 dark:text-gray-100">{deviceId}</div>
          <div className="text-xs text-gray-500 mt-1">
            Device sub-score: <span className={`font-semibold ${scoreColor(trust.deviceScore)}`}>{trust.deviceScore}</span>
          </div>
        </div>
      </div>

      <div className={`px-5 py-3 border-t border-gray-200 dark:border-gray-700 text-sm flex items-center justify-between ${
        willAllowAccess ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
      }`}>
        <span>
          Access threshold: <strong>{threshold}</strong> · Preview decision:{' '}
          <strong className={willAllowAccess ? 'text-green-700' : 'text-red-700'}>
            {willAllowAccess ? 'ALLOW' : 'DENY'}
          </strong>{' '}
          <span className="text-gray-500 text-xs">(protected resource via <code>/r/&lt;slug&gt;</code>)</span>
        </span>
        <span className="text-xs text-gray-500">
          {trust.lastUpdated ? `updated ${new Date(trust.lastUpdated).toLocaleString()}` : 'no scan yet'}
        </span>
      </div>
    </div>
  );
};

export default TrustScoreCard;
