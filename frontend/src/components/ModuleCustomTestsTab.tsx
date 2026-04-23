/**
 * ModuleCustomTestsTab - Custom tests grouped by the three FYP modules:
 *   Device Posture, Context Analysis, Trust Scoring Engine.
 *
 * Used on both the Identity page and the Devices Testing page.
 */

import React, { useState, useMemo } from 'react';
import {
  FaPlus, FaEdit, FaTrash, FaPlay, FaCheckCircle, FaTimesCircle,
  FaExclamationTriangle, FaClock, FaLaptop, FaNetworkWired, FaShieldAlt,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import {
  useZeroTrustStore,
  selectModuleCustomTests,
  FypModule,
  ModuleCustomTest,
  CheckType,
} from '../store/zeroTrustStore';

type Pillar = 'Identity' | 'Devices';

// Check-type presets per module. Used by the form to constrain what a
// custom test can actually check, and by the list to display a human label.
const CHECK_TYPES_BY_MODULE: Record<FypModule, { value: CheckType; label: string; wantsThreshold?: boolean }[]> = {
  device_posture: [
    { value: 'device_compliant',         label: 'Device is compliant (MDM)' },
    { value: 'av_healthy',               label: 'Endpoint AV healthy' },
    { value: 'firewall_enabled',         label: 'Firewall enabled' },
    { value: 'disk_encryption_enabled',  label: 'Disk encryption enabled' },
    { value: 'av_signatures_fresh',      label: 'AV signatures fresh (<24h)' },
    { value: 'intune_compliant',         label: 'Intune compliant' },
    { value: 'custom',                   label: 'Custom / manual' },
  ],
  context_analysis: [
    { value: 'known_location',                    label: 'Access from known/named location' },
    { value: 'trusted_network',                   label: 'Access from trusted network' },
    { value: 'unusual_network_flag',              label: 'Unusual network flagged' },
    { value: 'admin_requires_trusted_network',    label: 'Admin access requires trusted network' },
    { value: 'approved_region',                   label: 'Device seen from approved region' },
    { value: 'not_marked_risky',                  label: 'Not marked risky recently' },
    { value: 'custom',                            label: 'Custom / manual' },
  ],
  trust_scoring_engine: [
    { value: 'overall_score_above_threshold', label: 'Overall trust score above threshold', wantsThreshold: true },
    { value: 'module_score_above_threshold',  label: 'Each module score above threshold',   wantsThreshold: true },
    { value: 'device_score_above_threshold',  label: 'Device Posture score above threshold', wantsThreshold: true },
    { value: 'context_score_above_threshold', label: 'Context Analysis score above threshold', wantsThreshold: true },
    { value: 'custom',                        label: 'Custom / manual' },
  ],
};

function labelForCheckType(ct: CheckType): string {
  for (const mod of Object.values(CHECK_TYPES_BY_MODULE)) {
    const hit = mod.find(m => m.value === ct);
    if (hit) return hit.label;
  }
  return ct;
}

const MODULE_META: Record<FypModule, { label: string; icon: React.ComponentType<any>; color: string; description: string }> = {
  device_posture: {
    label: 'Device Posture',
    icon: FaLaptop,
    color: 'text-indigo-600',
    description: 'Evaluates endpoint health signals (encryption, patching, AV, firewall, compliance policies).',
  },
  context_analysis: {
    label: 'Context Analysis',
    icon: FaNetworkWired,
    color: 'text-amber-600',
    description: 'Evaluates sign-in / access context (location, time, network, user behaviour).',
  },
  trust_scoring_engine: {
    label: 'Trust Scoring Engine',
    icon: FaShieldAlt,
    color: 'text-emerald-600',
    description: 'Aggregates posture + context into a trust score that drives access decisions.',
  },
};

const STATUS_STYLE: Record<string, { bg: string; icon: React.ComponentType<any> }> = {
  pass:    { bg: 'bg-green-100 text-green-800 border-green-200', icon: FaCheckCircle },
  fail:    { bg: 'bg-red-100 text-red-800 border-red-200',       icon: FaTimesCircle },
  warning: { bg: 'bg-amber-100 text-amber-800 border-amber-200', icon: FaExclamationTriangle },
  not_run: { bg: 'bg-gray-100 text-gray-600 border-gray-200',    icon: FaClock },
};

interface Props {
  pillar: Pillar;
}

const ModuleCustomTestsTab: React.FC<Props> = ({ pillar }) => {
  const allTests = useZeroTrustStore(selectModuleCustomTests);
  const addTest = useZeroTrustStore(s => s.addModuleCustomTest);
  const updateTest = useZeroTrustStore(s => s.updateModuleCustomTest);
  const deleteTest = useZeroTrustStore(s => s.deleteModuleCustomTest);
  const runTest = useZeroTrustStore(s => s.runModuleCustomTest);

  const [activeModule, setActiveModule] = useState<FypModule>('device_posture');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ModuleCustomTest | null>(null);

  const pillarTests = useMemo(
    () => allTests.filter(t => t.pillar === pillar),
    [allTests, pillar]
  );

  const visibleTests = useMemo(
    () => pillarTests.filter(t => t.module === activeModule),
    [pillarTests, activeModule]
  );

  const countsByModule = useMemo(() => {
    const m: Record<FypModule, number> = { device_posture: 0, context_analysis: 0, trust_scoring_engine: 0 };
    pillarTests.forEach(t => { m[t.module]++; });
    return m;
  }, [pillarTests]);

  const handleSimulateRun = (t: ModuleCustomTest) => {
    // Heuristic/demo: randomise a result weighted by weight — pragmatic FYP behaviour
    const r = Math.random();
    const status: 'pass' | 'warning' | 'fail' = r > 0.6 ? 'pass' : r > 0.3 ? 'warning' : 'fail';
    runTest(t.id, status);
    toast.success(`Ran "${t.title}" → ${status}`);
  };

  const handleDelete = (t: ModuleCustomTest) => {
    if (window.confirm(`Delete custom test "${t.title}"?`)) {
      deleteTest(t.id);
      toast.success('Custom test deleted');
    }
  };

  return (
    <div className="space-y-4">
      {/* Module tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {(Object.keys(MODULE_META) as FypModule[]).map(mod => {
          const meta = MODULE_META[mod];
          const MetaIcon = meta.icon;
          const active = activeModule === mod;
          return (
            <button
              key={mod}
              onClick={() => setActiveModule(mod)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                active
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <MetaIcon className={meta.color} />
              {meta.label}
              <span className="ml-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-xs rounded-full">
                {countsByModule[mod]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Module description */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 flex items-start gap-3">
        {React.createElement(MODULE_META[activeModule].icon, { className: `${MODULE_META[activeModule].color} mt-0.5`, size: 18 })}
        <div>
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {MODULE_META[activeModule].label}
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {MODULE_META[activeModule].description}
          </p>
        </div>
      </div>

      {/* Add button */}
      <div className="flex justify-end">
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded inline-flex items-center gap-2"
        >
          <FaPlus size={11} /> Add custom test
        </button>
      </div>

      {/* Tests list */}
      {visibleTests.length === 0 ? (
        <div className="text-center text-sm text-gray-500 py-8 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          No custom tests for {MODULE_META[activeModule].label} yet.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleTests.map(t => {
            const ss = STATUS_STYLE[t.lastStatus] || STATUS_STYLE.not_run;
            const SIcon = ss.icon;
            return (
              <div key={t.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded border ${ss.bg}`}>
                        <SIcon size={10} /> {t.lastStatus}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{t.id}</span>
                      <span className="text-xs text-gray-500">weight {t.weight}/10</span>
                      {t.lastRun && <span className="text-xs text-gray-400">· last run {new Date(t.lastRun).toLocaleString()}</span>}
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t.description}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">
                        Check: {labelForCheckType(t.checkType)}
                      </span>
                      {typeof t.threshold === 'number' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 rounded">
                          threshold {t.threshold}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-1">
                      <strong className="not-italic">Why this matters for {MODULE_META[t.module].label}:</strong> {t.rationale}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => handleSimulateRun(t)}
                      className="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded inline-flex items-center gap-1"
                      title="Run this custom test"
                    >
                      <FaPlay size={9} /> Run
                    </button>
                    <button
                      onClick={() => { setEditing(t); setShowForm(true); }}
                      className="px-2 py-1 text-xs border border-gray-300 hover:bg-gray-100 rounded inline-flex items-center gap-1"
                    >
                      <FaEdit size={9} /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      className="px-2 py-1 text-xs border border-red-300 text-red-600 hover:bg-red-50 rounded inline-flex items-center gap-1"
                    >
                      <FaTrash size={9} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <ModuleTestForm
          initial={editing}
          pillar={pillar}
          defaultModule={activeModule}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={data => {
            if (editing) {
              updateTest(editing.id, data);
              toast.success('Custom test updated');
            } else {
              addTest({ ...data, lastStatus: 'not_run', lastRun: null });
              toast.success('Custom test added');
            }
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

interface FormProps {
  initial: ModuleCustomTest | null;
  pillar: Pillar;
  defaultModule: FypModule;
  onCancel: () => void;
  onSave: (data: Omit<ModuleCustomTest, 'id' | 'createdAt'>) => void;
}

const ModuleTestForm: React.FC<FormProps> = ({ initial, pillar, defaultModule, onCancel, onSave }) => {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [rationale, setRationale] = useState(initial?.rationale || '');
  const [module, setModule] = useState<FypModule>(initial?.module || defaultModule);
  const [weight, setWeight] = useState(initial?.weight || 5);
  const availableChecks = CHECK_TYPES_BY_MODULE[module];
  const [checkType, setCheckType] = useState<CheckType>(
    initial?.checkType ?? availableChecks[0].value
  );
  const [threshold, setThreshold] = useState<number>(initial?.threshold ?? 60);

  // If the user changes module, make sure the selected checkType still fits.
  React.useEffect(() => {
    const valid = CHECK_TYPES_BY_MODULE[module].some(c => c.value === checkType);
    if (!valid) setCheckType(CHECK_TYPES_BY_MODULE[module][0].value);
  }, [module]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentCheckMeta = CHECK_TYPES_BY_MODULE[module].find(c => c.value === checkType);
  const wantsThreshold = !!currentCheckMeta?.wantsThreshold;
  const canSave = title.trim().length >= 3;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {initial ? 'Edit' : 'Add'} {pillar} custom test
        </h3>

        <div>
          <label className="block text-sm font-medium mb-1">Module</label>
          <select
            value={module}
            onChange={e => setModule(e.target.value as FypModule)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-900"
          >
            <option value="device_posture">Device Posture</option>
            <option value="context_analysis">Context Analysis</option>
            <option value="trust_scoring_engine">Trust Scoring Engine</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">What does this test check?</label>
          <select
            value={checkType}
            onChange={e => setCheckType(e.target.value as CheckType)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-900"
          >
            {availableChecks.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Presets ensure each custom test maps to something concrete and testable,
            rather than a free-form description.
          </p>
        </div>

        {wantsThreshold && (
          <div>
            <label className="block text-sm font-medium mb-1">Threshold (0-100): {threshold}</label>
            <input
              type="range" min={0} max={100} value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              className="w-full"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Title *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-900"
            placeholder={pillar === 'Identity' ? 'e.g. Require compliant device before access' : 'e.g. Disk encryption enabled'}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Why this matters for the module</label>
          <textarea
            value={rationale}
            onChange={e => setRationale(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Weight (1-10): {weight}</label>
          <input
            type="range" min={1} max={10} value={weight}
            onChange={e => setWeight(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={() => canSave && onSave({
              module, pillar, title: title.trim(), description: description.trim(),
              rationale: rationale.trim(), weight, detectionMode: 'manual',
              checkType,
              ...(wantsThreshold ? { threshold } : {}),
              lastStatus: initial?.lastStatus || 'not_run', lastRun: initial?.lastRun || null,
            })}
            disabled={!canSave}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModuleCustomTestsTab;
