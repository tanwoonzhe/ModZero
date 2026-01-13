/**
 * Zero Trust Testing Page
 * 
 * Unified testing page for Identity and Devices pillars with:
 * - Two sections: Achievable tests (licensed) and Unavailable tests (unlicensed)
 * - Two score views: Achievable Score and Full Coverage Score
 * - Weight adjustment drawer (edits same WeightConfig as Policies page)
 * - Status management (To Address, Planned, Risk Accepted, etc.)
 * - License-aware display with CTA buttons
 */

import React, { useState, useMemo } from 'react';
import {
  FaShieldAlt,
  FaSearch,
  FaSync,
  FaCog,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaClock,
  FaLock,
  FaExternalLinkAlt,
  FaTimes,
  FaChevronDown,
  FaChevronUp,
  FaFilter,
  FaArrowUp,
  FaArrowRight,
  FaArrowDown,
  FaEye,
  FaToggleOn,
  FaToggleOff,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import {
  Pillar,
  Control,
  ControlStatus,
  ControlResult,
  LicenseKey,
  STATUS_DISPLAY_NAMES,
  STATUS_COLORS,
  PILLAR_COLORS,
  LICENSE_INFO,
} from '../types/zeroTrust';
import {
  useZeroTrustStore,
  selectIsAdmin,
  selectControls,
  selectControlResults,
  selectTenantLicenses,
  selectWeightConfig,
} from '../store/zeroTrustStore';
import {
  ScoreCard,
  StatusBadge,
  LicenseChips,
  RiskIndicator,
  WeightEditorDrawer,
  UpgradeOpportunityBanner,
} from '../components/ZeroTrustComponents';
import {
  isLicensed,
  getMissingLicenses,
  getEffectiveWeight,
  categorizeControlsByLicense,
  getControlsByPillar,
} from '../lib/scoring';

// ============================================================================
// TYPES
// ============================================================================

interface ZeroTrustTestingPageProps {
  pillar: Pillar;
  title: string;
  description: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

const ZeroTrustTestingPage: React.FC<ZeroTrustTestingPageProps> = ({
  pillar,
  title,
  description,
}) => {
  const isAdmin = useZeroTrustStore(selectIsAdmin);
  const allControls = useZeroTrustStore(selectControls);
  const controlResults = useZeroTrustStore(selectControlResults);
  const tenantLicenses = useZeroTrustStore(selectTenantLicenses);
  const weightConfig = useZeroTrustStore(selectWeightConfig);
  const getScores = useZeroTrustStore(state => state.getScores);
  const updateControlStatus = useZeroTrustStore(state => state.updateControlStatus);
  
  // Local state
  const [scoreView, setScoreView] = useState<'achievable' | 'fullCoverage'>('achievable');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<ControlStatus[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<string[]>([]);
  const [showWeightDrawer, setShowWeightDrawer] = useState(false);
  const [selectedControl, setSelectedControl] = useState<Control | null>(null);
  const [expandedSection, setExpandedSection] = useState<'achievable' | 'unavailable' | 'both'>('both');
  
  // Get pillar-specific controls
  const pillarControls = useMemo(
    () => getControlsByPillar(allControls, pillar),
    [allControls, pillar]
  );
  
  // Categorize by license status
  const { licensed: licensedControls, unlicensed: unlicensedControls } = useMemo(
    () => categorizeControlsByLicense(pillarControls, tenantLicenses),
    [pillarControls, tenantLicenses]
  );
  
  // Get scores
  const scores = getScores();
  const pillarScore = scoreView === 'achievable' 
    ? scores.achievable.byPillar[pillar]
    : scores.fullCoverage.byPillar[pillar];
  
  // Create result map
  const resultMap = useMemo(() => {
    const map = new Map<string, ControlResult>();
    controlResults.forEach(r => map.set(r.controlId, r));
    return map;
  }, [controlResults]);
  
  // Filter function
  const filterControls = (controls: Control[]) => {
    return controls.filter(control => {
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
          control.title.toLowerCase().includes(term) ||
          control.id.toLowerCase().includes(term) ||
          control.category?.toLowerCase().includes(term);
        if (!matchesSearch) return false;
      }
      
      // Status filter
      if (selectedStatuses.length > 0) {
        const result = resultMap.get(control.id);
        const status = result?.status || ControlStatus.TO_ADDRESS;
        if (!selectedStatuses.includes(status)) return false;
      }
      
      // Risk filter
      if (selectedRisks.length > 0) {
        if (!control.risk || !selectedRisks.includes(control.risk)) return false;
      }
      
      return true;
    });
  };
  
  const filteredLicensed = useMemo(
    () => filterControls(licensedControls),
    [licensedControls, searchTerm, selectedStatuses, selectedRisks, resultMap]
  );
  
  const filteredUnlicensed = useMemo(
    () => filterControls(unlicensedControls),
    [unlicensedControls, searchTerm, selectedStatuses, selectedRisks, resultMap]
  );
  
  // Status change handler
  const handleStatusChange = (controlId: string, newStatus: ControlStatus) => {
    updateControlStatus(controlId, newStatus);
    toast.success(`Status updated to ${STATUS_DISPLAY_NAMES[newStatus]}`);
  };
  
  // Toggle filter
  const toggleFilter = <T,>(value: T, selected: T[], setSelected: React.Dispatch<React.SetStateAction<T[]>>) => {
    setSelected(prev => 
      prev.includes(value) 
        ? prev.filter(v => v !== value)
        : [...prev, value]
    );
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <span className={`p-2 rounded-lg ${PILLAR_COLORS[pillar].bg}`}>
              <FaShieldAlt className={PILLAR_COLORS[pillar].text} />
            </span>
            {title}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {description}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Score View Toggle */}
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setScoreView('achievable')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                scoreView === 'achievable'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Achievable
            </button>
            <button
              onClick={() => setScoreView('fullCoverage')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                scoreView === 'fullCoverage'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Full Coverage
            </button>
          </div>
          
          <button
            onClick={() => setShowWeightDrawer(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <FaCog size={14} />
            Adjust Weights
          </button>
        </div>
      </div>
      
      {/* Score Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <ScoreCard
          title={`${pillar} Score`}
          score={pillarScore.score}
          max={pillarScore.max}
          percent={pillarScore.percent}
          subtitle={scoreView === 'achievable' ? 'Licensed controls only' : 'All controls'}
          variant="primary"
        />
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Controls Passed</p>
          <p className="text-3xl font-bold text-green-600">
            {pillarScore.passedCount}
            <span className="text-lg text-gray-400 font-normal">
              /{pillarScore.controlCount}
            </span>
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Licensed Tests</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {licensedControls.length}
          </p>
          <p className="text-xs text-gray-400 mt-1">of {pillarControls.length} total</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-600 dark:text-amber-400 mb-1">Needs License</p>
          <p className="text-3xl font-bold text-amber-600">
            {unlicensedControls.length}
          </p>
          <p className="text-xs text-amber-500 mt-1">tests unavailable</p>
        </div>
      </div>
      
      {/* Upgrade Banner */}
      {unlicensedControls.length > 0 && (
        <UpgradeOpportunityBanner
          unavailableCount={unlicensedControls.length}
          upgradePoints={scores.upgradeOpportunityPoints}
          onViewDetails={() => setExpandedSection('unavailable')}
        />
      )}
      
      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Search controls..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            />
          </div>
          
          {/* Status Filters */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Status:</span>
            {[ControlStatus.TO_ADDRESS, ControlStatus.COMPLETED, ControlStatus.PLANNED].map(status => (
              <button
                key={status}
                onClick={() => toggleFilter(status, selectedStatuses, setSelectedStatuses)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  selectedStatuses.includes(status)
                    ? `${STATUS_COLORS[status].bg} ${STATUS_COLORS[status].text} border-current`
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                }`}
              >
                {STATUS_DISPLAY_NAMES[status]}
              </button>
            ))}
          </div>
          
          {/* Risk Filters */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Risk:</span>
            {['High', 'Medium', 'Low'].map(risk => (
              <button
                key={risk}
                onClick={() => toggleFilter(risk, selectedRisks, setSelectedRisks)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  selectedRisks.includes(risk)
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/50'
                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                }`}
              >
                {risk}
              </button>
            ))}
          </div>
          
          {/* Clear Filters */}
          {(selectedStatuses.length > 0 || selectedRisks.length > 0 || searchTerm) && (
            <button
              onClick={() => {
                setSelectedStatuses([]);
                setSelectedRisks([]);
                setSearchTerm('');
              }}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
      
      {/* Achievable Tests Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setExpandedSection(expandedSection === 'achievable' ? 'both' : 'achievable')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750"
        >
          <div className="flex items-center gap-3">
            <FaCheckCircle className="text-green-500" size={20} />
            <div className="text-left">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Achievable Tests
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {filteredLicensed.length} tests available with current licenses
              </p>
            </div>
          </div>
          {expandedSection === 'achievable' || expandedSection === 'both' 
            ? <FaChevronUp className="text-gray-400" /> 
            : <FaChevronDown className="text-gray-400" />
          }
        </button>
        
        {(expandedSection === 'achievable' || expandedSection === 'both') && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            <ControlTable
              controls={filteredLicensed}
              resultMap={resultMap}
              tenantLicenses={tenantLicenses}
              weightConfig={weightConfig}
              isAdmin={isAdmin}
              onStatusChange={handleStatusChange}
              onControlClick={setSelectedControl}
            />
          </div>
        )}
      </div>
      
      {/* Unavailable Tests Section */}
      {filteredUnlicensed.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-amber-200 dark:border-amber-800">
          <button
            onClick={() => setExpandedSection(expandedSection === 'unavailable' ? 'both' : 'unavailable')}
            className="w-full p-4 flex items-center justify-between hover:bg-amber-50 dark:hover:bg-amber-900/10"
          >
            <div className="flex items-center gap-3">
              <FaLock className="text-amber-500" size={20} />
              <div className="text-left">
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  Unavailable Due to Licensing
                </h2>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {filteredUnlicensed.length} tests require additional licenses
                </p>
              </div>
            </div>
            {expandedSection === 'unavailable' || expandedSection === 'both' 
              ? <FaChevronUp className="text-gray-400" /> 
              : <FaChevronDown className="text-gray-400" />
            }
          </button>
          
          {(expandedSection === 'unavailable' || expandedSection === 'both') && (
            <div className="border-t border-amber-200 dark:border-amber-800">
              <ControlTable
                controls={filteredUnlicensed}
                resultMap={resultMap}
                tenantLicenses={tenantLicenses}
                weightConfig={weightConfig}
                isAdmin={isAdmin}
                onStatusChange={handleStatusChange}
                onControlClick={setSelectedControl}
                showLicenseButton
              />
            </div>
          )}
        </div>
      )}
      
      {/* Weight Editor Drawer */}
      <WeightEditorDrawer
        isOpen={showWeightDrawer}
        onClose={() => setShowWeightDrawer(false)}
        pillarFilter={pillar}
      />
      
      {/* Control Detail Modal */}
      {selectedControl && (
        <ControlDetailModal
          control={selectedControl}
          result={resultMap.get(selectedControl.id)}
          isLicensed={isLicensed(selectedControl, tenantLicenses)}
          missingLicenses={getMissingLicenses(selectedControl, tenantLicenses)}
          onClose={() => setSelectedControl(null)}
          onStatusChange={isAdmin ? handleStatusChange : undefined}
        />
      )}
    </div>
  );
};

// ============================================================================
// CONTROL TABLE COMPONENT
// ============================================================================

interface ControlTableProps {
  controls: Control[];
  resultMap: Map<string, ControlResult>;
  tenantLicenses: any;
  weightConfig: any;
  isAdmin: boolean;
  onStatusChange: (controlId: string, status: ControlStatus) => void;
  onControlClick: (control: Control) => void;
  showLicenseButton?: boolean;
}

const ControlTable: React.FC<ControlTableProps> = ({
  controls,
  resultMap,
  tenantLicenses,
  weightConfig,
  isAdmin,
  onStatusChange,
  onControlClick,
  showLicenseButton = false,
}) => {
  if (controls.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        <FaSearch size={32} className="mx-auto mb-3 opacity-50" />
        <p>No controls match your filters</p>
      </div>
    );
  }
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-900/50">
          <tr className="text-xs text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-3 text-left">Control</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Risk</th>
            <th className="px-4 py-3 text-left">Weight</th>
            <th className="px-4 py-3 text-left">Points</th>
            <th className="px-4 py-3 text-left">{showLicenseButton ? 'Required Licenses' : 'Evidence'}</th>
            <th className="px-4 py-3 text-left">Last Checked</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {controls.map(control => {
            const result = resultMap.get(control.id);
            const licensed = isLicensed(control, tenantLicenses);
            const missingLicenses = getMissingLicenses(control, tenantLicenses);
            const effectiveWeight = getEffectiveWeight(control, weightConfig);
            const status = licensed ? (result?.status || ControlStatus.TO_ADDRESS) : ControlStatus.NOT_LICENSED;
            
            return (
              <tr
                key={control.id}
                onClick={() => onControlClick(control)}
                className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${
                  !licensed ? 'opacity-75' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {control.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {control.id} • {control.category}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={status} />
                </td>
                <td className="px-4 py-3">
                  {control.risk && <RiskIndicator risk={control.risk} />}
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {effectiveWeight}%
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {control.maxPoints} pts
                  </span>
                </td>
                <td className="px-4 py-3">
                  {showLicenseButton && missingLicenses.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <LicenseChips licenses={missingLicenses} compact />
                      <a
                        href={control.purchaseUrl || LICENSE_INFO[missingLicenses[0]]?.purchaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      >
                        Get License
                      </a>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {result?.evidence?.length || 0} items
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {result?.lastCheckedAt 
                    ? new Date(result.lastCheckedAt).toLocaleDateString()
                    : '-'
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ============================================================================
// CONTROL DETAIL MODAL
// ============================================================================

interface ControlDetailModalProps {
  control: Control;
  result?: ControlResult;
  isLicensed: boolean;
  missingLicenses: LicenseKey[];
  onClose: () => void;
  onStatusChange?: (controlId: string, status: ControlStatus) => void;
}

const ControlDetailModal: React.FC<ControlDetailModalProps> = ({
  control,
  result,
  isLicensed,
  missingLicenses,
  onClose,
  onStatusChange,
}) => {
  const currentStatus = isLicensed ? (result?.status || ControlStatus.TO_ADDRESS) : ControlStatus.NOT_LICENSED;
  
  const availableStatuses: ControlStatus[] = [
    ControlStatus.TO_ADDRESS,
    ControlStatus.PLANNED,
    ControlStatus.COMPLETED,
    ControlStatus.ALTERNATE_MITIGATION,
    ControlStatus.THIRD_PARTY,
    ControlStatus.RISK_ACCEPTED,
  ];
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-start">
          <div>
            <span className="text-xs font-mono text-gray-500">{control.id}</span>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1">
              {control.title}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge status={currentStatus} />
              {control.risk && <RiskIndicator risk={control.risk} />}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <FaTimes className="text-gray-400" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* License Warning */}
          {!isLicensed && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FaLock className="text-amber-500 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    License Required
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    This control requires additional licenses to assess.
                  </p>
                  <div className="mt-3">
                    <LicenseChips licenses={missingLicenses} showPurchaseLink />
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Description */}
          {control.description && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Description</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {control.description}
              </p>
            </div>
          )}
          
          {/* Status Selector */}
          {onStatusChange && isLicensed && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Update Status</h3>
              <div className="grid grid-cols-2 gap-2">
                {availableStatuses.map(status => (
                  <button
                    key={status}
                    onClick={() => onStatusChange(control.id, status)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      currentStatus === status
                        ? `${STATUS_COLORS[status].bg} ${STATUS_COLORS[status].text} border-current`
                        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <StatusBadge status={status} size="sm" />
                    <p className="text-xs text-gray-500 mt-1">
                      {status === ControlStatus.COMPLETED && 'Fully implemented'}
                      {status === ControlStatus.PLANNED && 'Scheduled for implementation'}
                      {status === ControlStatus.TO_ADDRESS && 'Needs attention'}
                      {status === ControlStatus.RISK_ACCEPTED && 'Risk acknowledged'}
                      {status === ControlStatus.ALTERNATE_MITIGATION && 'Alternative solution in place'}
                      {status === ControlStatus.THIRD_PARTY && 'Handled by third party'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Category</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                {control.category || 'General'}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">SFI Pillar</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                {control.sfiPillar || 'N/A'}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Max Points</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                {control.maxPoints} points
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Implementation Cost</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                {control.implementationCost || 'Medium'}
              </p>
            </div>
          </div>
          
          {/* Documentation Link */}
          {control.docsUrl && (
            <a
              href={control.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm"
            >
              <FaExternalLinkAlt size={12} />
              View Microsoft Documentation
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// EXPORTS - PAGE COMPONENTS FOR ROUTING
// ============================================================================

export const IdentityTestingPage: React.FC = () => (
  <ZeroTrustTestingPage
    pillar={Pillar.Identity}
    title="Identity Security Testing"
    description="Zero Trust identity controls based on Microsoft Entra best practices"
  />
);

export const DevicesTestingPageNew: React.FC = () => (
  <ZeroTrustTestingPage
    pillar={Pillar.Devices}
    title="Device Security Testing"
    description="Zero Trust device controls for endpoint protection and compliance"
  />
);

export default ZeroTrustTestingPage;
