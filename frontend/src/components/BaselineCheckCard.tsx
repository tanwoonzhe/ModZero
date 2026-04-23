/**
 * BaselineCheckCard – shared rich-metadata renderer for both
 * Identity and Devices baseline checks.
 *
 * Displays the full enriched format requested by the FYP:
 *   Result, Description, Why It Matters, What Was Checked,
 *   Remediation, Data Source, Reference source.
 */

import React, { useState } from 'react';
import {
  FaCheckCircle, FaTimesCircle, FaExclamationTriangle,
  FaQuestionCircle, FaBan, FaChevronDown, FaChevronUp,
  FaInfoCircle, FaWrench, FaExclamationCircle, FaDatabase, FaTag,
  FaPlay, FaSpinner, FaExternalLinkAlt,
} from 'react-icons/fa';

export type BaselineStatus = 'pass' | 'warning' | 'fail' | 'not_available' | 'error';

export interface BaselineReference {
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

export interface BaselineEvidence {
  name: string;
  type: string;
  appId: string;
  detail: string;
}

export interface BaselineResult {
  id: string;
  title: string;
  category: string;
  pillar: string;
  severity: string;
  status: BaselineStatus;
  score: number;
  summary: string;
  evidence: BaselineEvidence[];
  recommendation: string;
  source: string[];
  last_checked: string;
  reference?: BaselineReference;
}

const STATUS_CFG: Record<BaselineStatus, { label: string; bg: string; icon: React.ComponentType<any>; iconColor: string }> = {
  pass:          { label: 'Passed',      bg: 'bg-green-100 text-green-800 border-green-200', icon: FaCheckCircle, iconColor: 'text-green-500' },
  fail:          { label: 'Failed',      bg: 'bg-red-100 text-red-800 border-red-200',       icon: FaTimesCircle, iconColor: 'text-red-500' },
  warning:       { label: 'Warning',     bg: 'bg-amber-100 text-amber-800 border-amber-200', icon: FaExclamationTriangle, iconColor: 'text-amber-500' },
  not_available: { label: 'Unavailable', bg: 'bg-gray-100 text-gray-600 border-gray-200',    icon: FaQuestionCircle, iconColor: 'text-gray-400' },
  error:         { label: 'Error',       bg: 'bg-gray-100 text-gray-600 border-gray-200',    icon: FaBan, iconColor: 'text-gray-400' },
};

const RISK_COLORS:   Record<string, string> = { High: 'bg-red-100 text-red-700', Medium: 'bg-amber-100 text-amber-700', Low: 'bg-green-100 text-green-700' };
const IMPACT_COLORS: Record<string, string> = { High: 'bg-orange-100 text-orange-700', Medium: 'bg-yellow-100 text-yellow-700', Low: 'bg-blue-100 text-blue-700' };
const COST_COLORS:   Record<string, string> = { High: 'bg-purple-100 text-purple-700', Medium: 'bg-indigo-100 text-indigo-700', Low: 'bg-teal-100 text-teal-700' };

const Badge: React.FC<{ label: string; value: string; colorMap: Record<string, string> }> = ({ label, value, colorMap }) => {
  if (!value) return null;
  const cls = colorMap[value] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${cls}`}>
      {label}: {value}
    </span>
  );
};

const Section: React.FC<{ icon: React.ComponentType<any>; iconColor: string; title: string; children: React.ReactNode }> = ({ icon: Icon, iconColor, title, children }) => (
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

const MarkdownBullets: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n').filter(l => l.trim());
  const hasBullets = lines.some(l => l.trim().startsWith('- '));
  if (!hasBullets) return <p className="whitespace-pre-line">{text}</p>;
  return (
    <ul className="list-disc list-inside space-y-1">
      {lines.map((line, i) => {
        const cleaned = line.replace(/^\s*-\s*/, '');
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const parts: React.ReactNode[] = [];
        let lastIdx = 0;
        let match: RegExpExecArray | null;
        while ((match = linkRegex.exec(cleaned)) !== null) {
          if (match.index > lastIdx) parts.push(cleaned.slice(lastIdx, match.index));
          parts.push(<a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{match[1]}</a>);
          lastIdx = match.index + match[0].length;
        }
        if (lastIdx < cleaned.length) parts.push(cleaned.slice(lastIdx));
        return <li key={i}>{parts.length ? parts : cleaned}</li>;
      })}
    </ul>
  );
};

interface Props {
  result: BaselineResult;
  isRunning: boolean;
  onRun: (id: string) => void;
}

const BaselineCheckCard: React.FC<Props> = ({ result, isRunning, onRun }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CFG[result.status];
  const Icon = cfg.icon;
  const ref = result.reference;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
      <div className="p-4 flex items-start gap-4">
        <div className={`flex-shrink-0 ${cfg.iconColor} mt-1`}>
          <Icon size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">#{result.id}</span>
            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded border ${cfg.bg}`}>{cfg.label}</span>
            {ref?.category && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
              <FaTag size={10} /> {ref.category}
            </span>}
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">{result.title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{result.summary}</p>

          {ref && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge label="Risk" value={ref.risk} colorMap={RISK_COLORS} />
              <Badge label="User Impact" value={ref.user_impact} colorMap={IMPACT_COLORS} />
              <Badge label="Cost" value={ref.implementation_cost} colorMap={COST_COLORS} />
            </div>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          <button
            onClick={() => onRun(result.id)}
            disabled={isRunning}
            className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded inline-flex items-center gap-1.5"
            title="Re-run this check"
          >
            {isRunning ? <FaSpinner className="animate-spin" /> : <FaPlay size={10} />}
            Run
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
          >
            {expanded ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4 space-y-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <strong>Result:</strong> {cfg.label} — score {(result.score ?? 0).toFixed(2)} / 1.00 ·
            last checked {new Date(result.last_checked).toLocaleString()}
          </div>

          {ref?.description && (
            <Section icon={FaInfoCircle} iconColor="text-indigo-500" title="Description">
              <MarkdownBullets text={ref.description} />
            </Section>
          )}
          {ref?.why_it_matters && (
            <Section icon={FaExclamationCircle} iconColor="text-amber-500" title="Why It Matters">
              <MarkdownBullets text={ref.why_it_matters} />
            </Section>
          )}
          {ref?.what_was_checked && (
            <Section icon={FaDatabase} iconColor="text-teal-500" title="What Was Checked">
              <MarkdownBullets text={ref.what_was_checked} />
            </Section>
          )}
          {(result.recommendation || ref?.remediation_action) && (
            <Section icon={FaWrench} iconColor="text-indigo-500" title="Remediation">
              <MarkdownBullets text={result.recommendation || ref?.remediation_action || ''} />
            </Section>
          )}

          {result.evidence && result.evidence.length > 0 && (
            <Section icon={FaTag} iconColor="text-rose-500" title={`Evidence (${result.evidence.length})`}>
              <ul className="space-y-1">
                {result.evidence.slice(0, 10).map((e, i) => (
                  <li key={i} className="text-xs font-mono bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1">
                    <span className="font-semibold text-gray-700 dark:text-gray-200">{e.name}</span>
                    <span className="text-gray-500"> · {e.type}</span>
                    <span className="text-gray-600 dark:text-gray-400"> — {e.detail}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section icon={FaDatabase} iconColor="text-gray-500" title="Data Source">
            <ul className="list-disc list-inside font-mono text-xs">
              {(result.source && result.source.length ? result.source : (ref?.source_endpoints || ['(none)'])).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </Section>

          {ref?.reference_source && (
            <Section icon={FaExternalLinkAlt} iconColor="text-gray-500" title="Reference source">
              <span className="text-xs italic">{ref.reference_source}</span>
            </Section>
          )}
        </div>
      )}
    </div>
  );
};

export default BaselineCheckCard;
