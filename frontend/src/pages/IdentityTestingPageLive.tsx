/**
 * Identity Testing Page – Zero Trust Assessment Checks
 *
 * Runs 5 selected Microsoft-inspired identity security checks against
 * the tenant's Microsoft Graph API.  When Graph credentials are missing
 * the backend returns realistic mock data so the page is always demo-ready.
 *
 * Scoring: pass = 1 pt, warning = 0.5 pt, fail/error/not_available = 0 pt.
 */

import React, { useState, useCallback } from 'react';
import {
  FaShieldAlt,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaQuestionCircle,
  FaChevronDown,
  FaChevronUp,
  FaExternalLinkAlt,
  FaPlay,
  FaSpinner,
  FaBan,
  FaInfoCircle,
  FaWrench,
  FaExclamationCircle,
  FaDatabase,
  FaTag,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import api from '../api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TestStatus = 'pass' | 'warning' | 'fail' | 'not_available' | 'error';

interface Evidence {
  name: string;
  type: string;
  appId: string;
  detail: string;
}

interface TestReference {
  category: string;
  pillar: string;
  risk: string;
  user_impact: string;
  implementation_cost: string;
  description: string;
  why_it_matters: string;
  what_was_checked: string;
  remediation_action: string;
  source_endpoints: string[];
  reference_source: string;
}

interface IdentityTestResult {
  id: string;
  title: string;
  category: string;
  pillar: string;
  severity: string;
  status: TestStatus;
  score: number;
  summary: string;
  evidence: Evidence[];
  recommendation: string;
  source: string[];
  last_checked: string;
  reference?: TestReference;
}

interface Summary {
  total: number;
  passed: number;
  warnings: number;
  failed: number;
  not_available: number;
  errors: number;
  score: number;
  last_run: string;
}

/* ------------------------------------------------------------------ */
/*  Status badge config                                                */
/* ------------------------------------------------------------------ */

const STATUS_CFG: Record<TestStatus, {
  label: string;
  bg: string;
  icon: React.ComponentType<any>;
  iconColor: string;
}> = {
  pass:          { label: 'Passed',        bg: 'bg-green-100 text-green-800 border-green-200',   icon: FaCheckCircle,        iconColor: 'text-green-500' },
  fail:          { label: 'Failed',        bg: 'bg-red-100 text-red-800 border-red-200',         icon: FaTimesCircle,        iconColor: 'text-red-500' },
  warning:       { label: 'Warning',       bg: 'bg-amber-100 text-amber-800 border-amber-200',   icon: FaExclamationTriangle, iconColor: 'text-amber-500' },
  not_available: { label: 'Unavailable',   bg: 'bg-gray-100 text-gray-600 border-gray-200',      icon: FaQuestionCircle,     iconColor: 'text-gray-400' },
  error:         { label: 'Error',         bg: 'bg-gray-100 text-gray-600 border-gray-200',      icon: FaBan,                iconColor: 'text-gray-400' },
};

const SEVERITY_COLORS: Record<string, string> = {
  high:   'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-green-100 text-green-700 border-green-200',
};

const RISK_COLORS: Record<string, string> = {
  High:   'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low:    'bg-green-100 text-green-700',
};

const IMPACT_COLORS: Record<string, string> = {
  High:   'bg-orange-100 text-orange-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Low:    'bg-blue-100 text-blue-700',
};

const COST_COLORS: Record<string, string> = {
  High:   'bg-purple-100 text-purple-700',
  Medium: 'bg-indigo-100 text-indigo-700',
  Low:    'bg-teal-100 text-teal-700',
};

/* ------------------------------------------------------------------ */
/*  Small reusable sub-components                                      */
/* ------------------------------------------------------------------ */

const MetadataBadge: React.FC<{ label: string; value: string; colorMap: Record<string, string> }> = ({ label, value, colorMap }) => {
  if (!value) return null;
  const colors = colorMap[value] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${colors}`}>
      {label}: {value}
    </span>
  );
};

const DetailSection: React.FC<{
  icon: React.ComponentType<any>;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}> = ({ icon: Icon, iconColor, title, children }) => (
  <div>
    <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
      <Icon className={iconColor} size={14} />
      {title}
    </h4>
    <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed pl-6">
      {children}
    </div>
  </div>
);

/** Render markdown-ish bullet-point text as proper list items */
const MarkdownBullets: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n').filter(l => l.trim());
  const hasBullets = lines.some(l => l.trim().startsWith('- '));

  if (!hasBullets) {
    return <p className="whitespace-pre-line">{text}</p>;
  }

  return (
    <ul className="list-disc list-inside space-y-1">
      {lines.map((line, i) => {
        const cleaned = line.replace(/^\s*-\s*/, '');
        // Parse markdown links [text](url)
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const parts: React.ReactNode[] = [];
        let lastIdx = 0;
        let match: RegExpExecArray | null;

        while ((match = linkRegex.exec(cleaned)) !== null) {
          if (match.index > lastIdx) {
            parts.push(cleaned.slice(lastIdx, match.index));
          }
          parts.push(
            <a
              key={i + '-' + match.index}
              href={match[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-700 underline"
            >
              {match[1]}
            </a>
          );
          lastIdx = match.index + match[0].length;
        }
        if (lastIdx < cleaned.length) {
          parts.push(cleaned.slice(lastIdx));
        }

        return <li key={i}>{parts.length > 0 ? parts : cleaned}</li>;
      })}
    </ul>
  );
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const IdentityTestingPageLive: React.FC = () => {
  const [results, setResults] = useState<IdentityTestResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isMock, setIsMock] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());

  /* ---------- Run all checks ---------- */
  const runAllTests = useCallback(async () => {
    setIsRunning(true);
    toast.loading('Running identity security checks…', { id: 'run-all' });
    try {
      const { data } = await api.post('/identity-checks/tests/run');
      setResults(data.results);
      setSummary(data.summary);
      setIsMock(data.is_mock);
      toast.success(
        `Completed ${data.results.length} checks${data.is_mock ? ' (demo mode)' : ''}`,
        { id: 'run-all' },
      );
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to run checks', { id: 'run-all' });
    } finally {
      setIsRunning(false);
    }
  }, []);

  /* ---------- Run single check ---------- */
  const runSingleTest = useCallback(async (testId: string) => {
    setRunningTestId(testId);
    try {
      const { data } = await api.post(`/identity-checks/tests/${testId}/run`);
      const result: IdentityTestResult = data.result;
      setResults(prev => {
        const idx = prev.findIndex(r => r.id === testId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = result;
          return next;
        }
        return [...prev, result];
      });
      // Recompute local summary
      setResults(prev => {
        // rebuild summary from current results after update
        const total = prev.length;
        const passed = prev.filter(r => r.status === 'pass').length;
        const warnings = prev.filter(r => r.status === 'warning').length;
        const failed = prev.filter(r => r.status === 'fail').length;
        const not_available = prev.filter(r => r.status === 'not_available').length;
        const errors = prev.filter(r => r.status === 'error').length;
        const actual = prev.reduce((s, r) => s + r.score, 0);
        const score = total ? Math.round((actual / total) * 100) : 0;
        setSummary({ total, passed, warnings, failed, not_available, errors, score, last_run: new Date().toISOString() });
        return prev;
      });
      setIsMock(data.is_mock);
      toast.success(`Check ${testId} completed`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || `Failed to run check ${testId}`);
    } finally {
      setRunningTestId(null);
    }
  }, []);

  /* ---------- Toggle expand ---------- */
  const toggleExpand = (id: string) => {
    setExpandedTests(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <div className="space-y-6">

      {/* ---- Header ---- */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <span className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900">
              <FaShieldAlt className="text-indigo-600 dark:text-indigo-400" />
            </span>
            Identity Security Testing
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            5 Zero Trust Assessment checks • Powered by Microsoft Graph API
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isMock && results.length > 0 && (
            <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
              Demo Mode
            </span>
          )}

          <button
            onClick={runAllTests}
            disabled={isRunning}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isRunning
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isRunning ? (
              <><FaSpinner className="animate-spin" /> Running…</>
            ) : (
              <><FaPlay size={12} /> Run Identity Tests</>
            )}
          </button>
        </div>
      </div>

      {/* ---- Summary Cards ---- */}
      {summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Identity Score */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border-2 border-indigo-200 dark:border-indigo-700 col-span-1">
              <p className="text-sm text-indigo-600 font-medium">Identity Score</p>
              <p className="text-4xl font-bold text-indigo-600">{summary.score}%</p>
            </div>
            {/* Passed */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-600">Passed</p>
              <p className="text-3xl font-bold text-green-600">{summary.passed}</p>
            </div>
            {/* Warnings */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-600">Warnings</p>
              <p className="text-3xl font-bold text-amber-600">{summary.warnings}</p>
            </div>
            {/* Failed */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600">Failed</p>
              <p className="text-3xl font-bold text-red-600">{summary.failed}</p>
            </div>
            {/* Unavailable */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500">Unavailable</p>
              <p className="text-3xl font-bold text-gray-500">{summary.not_available + summary.errors}</p>
            </div>
            {/* Total */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500">Total Tests</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{summary.total}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Last run: {new Date(summary.last_run).toLocaleString()}
            {isMock && ' • Results are simulated (Graph credentials not configured)'}
          </p>
        </>
      )}

      {/* ---- Empty state ---- */}
      {results.length === 0 && !isRunning && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <FaShieldAlt className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={48} />
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            No checks executed yet
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Click <strong>Run Identity Tests</strong> to evaluate your tenant against 5 Zero Trust identity checks.
            If Azure credentials are not configured, demo data will be used.
          </p>
        </div>
      )}

      {/* ---- Test Cards ---- */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map(test => {
            const cfg = STATUS_CFG[test.status] || STATUS_CFG.error;
            const Icon = cfg.icon;
            const isExpanded = expandedTests.has(test.id);
            const isThisRunning = runningTestId === test.id;

            return (
              <div
                key={test.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {/* Row header */}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                  onClick={() => toggleExpand(test.id)}
                >
                  {/* Expand chevron */}
                  <span className="text-gray-400">
                    {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                  </span>

                  {/* Title + summary */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {test.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {test.summary}
                    </p>
                  </div>

                  {/* Severity */}
                  <span className={`hidden sm:inline-block px-2 py-0.5 text-xs font-medium rounded-full border capitalize ${SEVERITY_COLORS[test.severity] || ''}`}>
                    {test.severity}
                  </span>

                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border whitespace-nowrap ${cfg.bg}`}>
                    {isThisRunning
                      ? <FaSpinner className="animate-spin text-indigo-500" size={12} />
                      : <Icon className={cfg.iconColor} size={12} />}
                    {isThisRunning ? 'Running…' : cfg.label}
                  </span>

                  {/* Last checked */}
                  <span className="hidden md:block text-xs text-gray-400 whitespace-nowrap">
                    {new Date(test.last_checked).toLocaleTimeString()}
                  </span>

                  {/* Run single */}
                  <button
                    onClick={e => { e.stopPropagation(); runSingleTest(test.id); }}
                    disabled={isThisRunning}
                    className="px-3 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 disabled:opacity-50 whitespace-nowrap"
                  >
                    {isThisRunning ? 'Running…' : 'Run'}
                  </button>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-5 space-y-5 bg-gray-50/50 dark:bg-gray-900/30">

                    {/* Metadata badges row */}
                    <div className="flex flex-wrap gap-2">
                      <MetadataBadge label="Risk" value={test.reference?.risk || ''} colorMap={RISK_COLORS} />
                      <MetadataBadge label="User Impact" value={test.reference?.user_impact || ''} colorMap={IMPACT_COLORS} />
                      <MetadataBadge label="Impl. Cost" value={test.reference?.implementation_cost || ''} colorMap={COST_COLORS} />
                      {(test.reference?.category || test.category) && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          <FaTag size={10} /> {test.reference?.category || test.category}
                        </span>
                      )}
                      {(test.reference?.pillar || test.pillar) && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                          <FaShieldAlt size={10} /> {test.reference?.pillar || test.pillar}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                        ID: {test.id}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                        Score: {test.score} / 1
                      </span>
                    </div>

                    {/* Result summary */}
                    <DetailSection icon={FaCheckCircle} iconColor="text-blue-500" title="Result">
                      <p>{test.summary}</p>
                    </DetailSection>

                    {/* Description (from reference) */}
                    {test.reference?.description && (
                      <DetailSection icon={FaInfoCircle} iconColor="text-indigo-500" title="Description">
                        <p className="whitespace-pre-line">{test.reference.description}</p>
                      </DetailSection>
                    )}

                    {/* Why it matters */}
                    {test.reference?.why_it_matters && (
                      <DetailSection icon={FaExclamationCircle} iconColor="text-amber-500" title="Why It Matters">
                        <p>{test.reference.why_it_matters}</p>
                      </DetailSection>
                    )}

                    {/* What was checked */}
                    {test.reference?.what_was_checked && (
                      <DetailSection icon={FaDatabase} iconColor="text-cyan-500" title="What Was Checked">
                        <p>{test.reference.what_was_checked}</p>
                      </DetailSection>
                    )}

                    {/* Evidence table */}
                    {test.evidence.length > 0 && (
                      <div>
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          <FaDatabase className="text-gray-500" size={14} />
                          Evidence ({test.evidence.length})
                        </h4>
                        <div className="overflow-x-auto pl-6">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                                <th className="pb-1 pr-4">Name</th>
                                <th className="pb-1 pr-4">Type</th>
                                <th className="pb-1 pr-4">Detail</th>
                                <th className="pb-1">App ID</th>
                              </tr>
                            </thead>
                            <tbody>
                              {test.evidence.map((e, i) => (
                                <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                                  <td className="py-1.5 pr-4 font-medium text-gray-800 dark:text-gray-200">{e.name}</td>
                                  <td className="py-1.5 pr-4 text-gray-500">{e.type}</td>
                                  <td className="py-1.5 pr-4 text-gray-600 dark:text-gray-400">{e.detail}</td>
                                  <td className="py-1.5 text-gray-400 font-mono truncate max-w-[160px]">
                                    {e.appId || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Remediation action (from reference — rich with links) */}
                    {test.reference?.remediation_action && test.status !== 'pass' && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                          <FaWrench size={14} />
                          Remediation Action
                        </h4>
                        <div className="text-sm text-amber-700 dark:text-amber-300">
                          <MarkdownBullets text={test.reference.remediation_action} />
                        </div>
                      </div>
                    )}

                    {/* Fallback recommendation (if no reference remediation) */}
                    {!test.reference?.remediation_action && test.recommendation && test.status !== 'pass' && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                          <FaWrench size={14} />
                          Recommendation
                        </h4>
                        <p className="text-sm text-amber-700 dark:text-amber-300">{test.recommendation}</p>
                      </div>
                    )}

                    {/* Data source endpoints */}
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs font-medium text-gray-500">Data source:</span>
                      {test.source.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300 font-mono">
                          {s}
                        </span>
                      ))}
                    </div>

                    {/* Reference source attribution */}
                    {test.reference?.reference_source && (
                      <p className="text-xs text-gray-400 italic">
                        Reference: {test.reference.reference_source}
                      </p>
                    )}

                    {/* Portal link for applications */}
                    {test.evidence.some(e => e.appId && e.type === 'Application') && (
                      <a
                        href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                      >
                        <FaExternalLinkAlt size={10} />
                        View in Entra Portal
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default IdentityTestingPageLive;
