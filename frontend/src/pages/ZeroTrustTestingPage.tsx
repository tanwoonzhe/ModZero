/**
 * Zero Trust Testing Page
 * 
 * Unified testing page for Identity and Devices pillars with:
 * - Two tabs: Default Tests and Custom Tests
 * - Full CRUD operations for custom tests (add, edit, delete)
 * - Enable/disable toggle for all tests
 * - Bulk actions (enable all, disable all)
 * - Status management (To Address, Planned, Risk Accepted, etc.)
 * - License-aware display with CTA buttons
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  FaShieldAlt,
  FaSearch,
  FaCheckCircle,
  FaLock,
  FaExternalLinkAlt,
  FaTimes,
  FaChevronDown,
  FaChevronUp,
  FaPlus,
  FaEdit,
  FaTrash,
  FaToggleOn,
  FaToggleOff,
  FaEllipsisV,
  FaHistory,
  FaPlay,
  FaSpinner,
} from 'react-icons/fa';
import toast from 'react-hot-toast';
import {
  Pillar,
  Control,
  ControlStatus,
  ControlResult,
  LicenseKey,
  TestResult,
  DetectionMode,
  GraphQueryConfig,
  ChecklistConfig,
  ChecklistItem,
  GRAPH_API_ENDPOINTS,
  STATUS_DISPLAY_NAMES,
  STATUS_COLORS,
  TEST_RESULT_DISPLAY_NAMES,
  TEST_RESULT_COLORS,
  PILLAR_COLORS,
  LICENSE_INFO,
} from '../types/zeroTrust';
import {
  useZeroTrustStore,
  selectIsAdmin,
  selectControls,
  selectCustomControls,
  selectDisabledControlIds,
  selectControlResults,
  selectTenantLicenses,
  selectAuditEvents,
} from '../store/zeroTrustStore';
import {
  ScoreCard,
  StatusBadge,
  LicenseChips,
  RiskIndicator,
  UpgradeOpportunityBanner,
} from '../components/ZeroTrustComponents';
import {
  isLicensed,
  getMissingLicenses,
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
// MAIN COMPONENT
// ============================================================================

const ZeroTrustTestingPage: React.FC<ZeroTrustTestingPageProps> = ({
  pillar,
  title,
  description,
}) => {
  const isAdmin = useZeroTrustStore(selectIsAdmin);
  const defaultControls = useZeroTrustStore(selectControls);
  const customControls = useZeroTrustStore(selectCustomControls);
  const disabledControlIds = useZeroTrustStore(selectDisabledControlIds);
  const controlResults = useZeroTrustStore(selectControlResults);
  const tenantLicenses = useZeroTrustStore(selectTenantLicenses);
  const auditEvents = useZeroTrustStore(selectAuditEvents);
  const getScores = useZeroTrustStore(state => state.getScores);
  const updateControlStatus = useZeroTrustStore(state => state.updateControlStatus);
  const toggleControlEnabled = useZeroTrustStore(state => state.toggleControlEnabled);
  const enableAllControls = useZeroTrustStore(state => state.enableAllControls);
  const disableAllControls = useZeroTrustStore(state => state.disableAllControls);
  const addControl = useZeroTrustStore(state => state.addControl);
  const updateControl = useZeroTrustStore(state => state.updateControl);
  const deleteControl = useZeroTrustStore(state => state.deleteControl);
  const clearAuditEvents = useZeroTrustStore(state => state.clearAuditEvents);
  
  const updateControlTestResult = useZeroTrustStore(state => state.updateControlTestResult);
  
  // Local state
  const [activeTab, setActiveTab] = useState<'default' | 'custom'>('default');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<ControlStatus[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<string[]>([]);
  const [selectedControl, setSelectedControl] = useState<Control | null>(null);
  const [achievableSectionExpanded, setAchievableSectionExpanded] = useState(true);
  const [unavailableSectionExpanded, setUnavailableSectionExpanded] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingControl, setEditingControl] = useState<Control | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  
  // Combine default and custom controls for this pillar
  const allControls = useMemo(() => {
    const defaults = defaultControls.filter(c => c.pillar === pillar);
    const customs = customControls.filter(c => c.pillar === pillar);
    return { defaults, customs };
  }, [defaultControls, customControls, pillar]);
  
  // Keep selectedControl in sync with store updates (for checklist toggles, etc.)
  useEffect(() => {
    if (selectedControl) {
      // Find updated control from either defaults or customs
      const updatedControl = 
        customControls.find(c => c.id === selectedControl.id) ||
        defaultControls.find(c => c.id === selectedControl.id);
      
      if (updatedControl && updatedControl !== selectedControl) {
        setSelectedControl(updatedControl);
      }
    }
  }, [defaultControls, customControls, selectedControl]);
  
  // Get pillar-specific controls (all combined)
  const pillarControls = useMemo(
    () => getControlsByPillar([...defaultControls, ...customControls], pillar),
    [defaultControls, customControls, pillar]
  );
  
  // Categorize by license status
  const { licensed: licensedControls, unlicensed: unlicensedControls } = useMemo(
    () => categorizeControlsByLicense(allControls.defaults, tenantLicenses),
    [allControls.defaults, tenantLicenses]
  );
  
  // Get scores
  const scores = getScores();
  const pillarScore = scores.achievable.byPillar[pillar];
  
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
  
  const filteredCustom = useMemo(
    () => filterControls(allControls.customs),
    [allControls.customs, searchTerm, selectedStatuses, selectedRisks, resultMap]
  );
  
  // Count enabled/disabled
  const enabledCount = pillarControls.filter(c => !disabledControlIds.has(c.id)).length;
  const disabledCount = pillarControls.filter(c => disabledControlIds.has(c.id)).length;
  
  // Handlers
  const handleStatusChange = (controlId: string, newStatus: ControlStatus) => {
    updateControlStatus(controlId, newStatus);
    toast.success(`Status updated to ${STATUS_DISPLAY_NAMES[newStatus]}`);
  };
  
  const handleToggleEnabled = (controlId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleControlEnabled(controlId);
    const isNowEnabled = disabledControlIds.has(controlId);
    toast.success(isNowEnabled ? 'Test enabled' : 'Test disabled');
  };
  
  const handleEnableAll = () => {
    enableAllControls(pillar);
    toast.success(`All ${pillar} tests enabled`);
    setShowBulkMenu(false);
  };
  
  const handleDisableAll = () => {
    disableAllControls(pillar);
    toast.success(`All ${pillar} tests disabled`);
    setShowBulkMenu(false);
  };
  
  const handleAddTest = async (testData: Partial<Control>) => {
    await addControl({
      title: testData.title || 'New Test',
      description: testData.description,
      pillar,
      minLicenses: [],
      defaultWeight: 50,
      maxPoints: testData.maxPoints || 10,
      category: testData.category,
      risk: testData.risk as 'High' | 'Medium' | 'Low',
      userImpact: testData.userImpact as 'High' | 'Medium' | 'Low',
      implementationCost: testData.implementationCost as 'High' | 'Medium' | 'Low',
      docsUrl: testData.docsUrl,
      detectionMode: testData.detectionMode,
      graphQueryConfig: testData.graphQueryConfig,
      checklistConfig: testData.checklistConfig,
    });
    toast.success('Custom test added');
    setShowAddModal(false);
  };
  
  const handleEditTest = (controlId: string, updates: Partial<Control>) => {
    updateControl(controlId, updates);
    toast.success('Test updated');
    setShowEditModal(false);
    setEditingControl(null);
  };
  
  // Handler to open edit modal for any test (including default)
  const handleOpenEdit = (control: Control) => {
    setEditingControl(control);
    setShowEditModal(true);
  };
  
  const handleDeleteTest = (controlId: string) => {
    deleteControl(controlId);
    toast.success('Test deleted');
    setShowDeleteConfirm(null);
  };
  
  // Run test via API (supports both default and custom tests)
  const handleRunTest = async (control: Control) => {
    // Manual custom tests: open the detail modal instead of trying to run
    if (control.isCustom && (!control.detectionMode || control.detectionMode === 'manual')) {
      setSelectedControl(control);
      toast('Open the detail view to manually set the test result', { icon: '📝' });
      return;
    }
    
    setRunningTestId(control.id);
    
    try {
      let response: Response;
      
      if (control.isCustom) {
        // Custom test - use custom-tests endpoint
        const requestBody: any = {
          testId: control.id,
          detectionMode: control.detectionMode,
        };
        
        if (control.detectionMode === 'graph_query' && control.graphQueryConfig) {
          requestBody.graphQueryConfig = control.graphQueryConfig;
        }
        
        if (control.detectionMode === 'checklist' && control.checklistConfig) {
          requestBody.checklistConfig = control.checklistConfig;
        }
        
        response = await fetch('/api/assessment/custom-tests/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify(requestBody),
        });
      } else {
        // Default test - use pillar-specific endpoint
        const testId = control.testId || control.id.replace('ZTA-', '');
        const endpoint = pillar === 'Identity' 
          ? `/api/assessment/identity/run/${testId}`
          : `/api/assessment/devices/run/${testId}`;
        
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to run test');
      }
      
      const result = await response.json();
      
      // Update control with last run data (for custom tests)
      if (control.isCustom) {
        updateControl(control.id, {
          lastRunAt: result.timestamp,
          lastRunData: result.rawData,
        });
      }
      
      // Determine test result and update the store
      const status = result.status?.toLowerCase() || result.result?.toLowerCase();
      let newTestResult: TestResult;
      if (status === 'pass' || status === 'passed') {
        newTestResult = TestResult.PASSED;
        toast.success(`Test passed: ${result.details || control.title}`);
      } else if (status === 'fail' || status === 'failed') {
        newTestResult = TestResult.FAILED;
        toast.error(`Test failed: ${result.details || control.title}`);
      } else if (status === 'warning' || status === 'investigate') {
        newTestResult = TestResult.INVESTIGATE;
        toast(`Test requires investigation: ${result.details || control.title}`, { icon: '⚠️' });
      } else {
        newTestResult = TestResult.PASSED;
        toast.success(`Test completed: ${result.details || control.title}`);
      }
      
      // Update the result in the store so the table refreshes immediately
      updateControlTestResult(control.id, newTestResult);
      
    } catch (error) {
      console.error('Error running test:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to run test');
    } finally {
      setRunningTestId(null);
    }
  };
  
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
          {/* Status Summary */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-green-600 font-medium">{enabledCount} enabled</span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-500">{disabledCount} disabled</span>
          </div>
          
          {/* Bulk Actions */}
          <div className="relative">
            <button
              onClick={() => setShowBulkMenu(!showBulkMenu)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <FaEllipsisV size={14} />
              <span>Bulk Actions</span>
            </button>
            
            {showBulkMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowBulkMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                  <button
                    onClick={handleEnableAll}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <FaToggleOn className="text-green-500" />
                    Enable All Tests
                  </button>
                  <button
                    onClick={handleDisableAll}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <FaToggleOff className="text-gray-400" />
                    Disable All Tests
                  </button>
                  <hr className="border-gray-200 dark:border-gray-700" />
                  <button
                    onClick={() => { setShowAuditLog(true); setShowBulkMenu(false); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <FaHistory className="text-indigo-500" />
                    View Audit Log
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Tab Selector */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('default')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'default'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaShieldAlt className="inline mr-2" size={14} />
          Default Tests ({allControls.defaults.length})
        </button>
        <button
          onClick={() => setActiveTab('custom')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'custom'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FaPlus className="inline mr-2" size={14} />
          Custom Tests ({allControls.customs.length})
        </button>
      </div>

      {/* Default Tests Tab Content */}
      {activeTab === 'default' && (
        <>
          {/* Score Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <ScoreCard
              title={`${pillar} Score`}
              score={pillarScore.score}
              max={pillarScore.max}
              percent={pillarScore.percent}
              subtitle="Based on enabled tests"
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
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Tests Enabled</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {enabledCount}
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
              onViewDetails={() => setUnavailableSectionExpanded(true)}
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
              onClick={() => setAchievableSectionExpanded(!achievableSectionExpanded)}
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
              {achievableSectionExpanded
                ? <FaChevronUp className="text-gray-400" /> 
                : <FaChevronDown className="text-gray-400" />
              }
            </button>
            
            {achievableSectionExpanded && (
              <div className="border-t border-gray-200 dark:border-gray-700">
                <ControlTable
                  controls={filteredLicensed}
                  resultMap={resultMap}
                  tenantLicenses={tenantLicenses}
                  disabledControlIds={disabledControlIds}
                  isAdmin={isAdmin}
                  onStatusChange={handleStatusChange}
                  onControlClick={setSelectedControl}
                  onToggleEnabled={handleToggleEnabled}
                  onEdit={handleOpenEdit}
                  onRunTest={handleRunTest}
                  runningTestId={runningTestId}
                  showActions
                />
              </div>
            )}
          </div>
          
          {/* Unavailable Tests Section */}
          {filteredUnlicensed.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-amber-200 dark:border-amber-800">
              <button
                onClick={() => setUnavailableSectionExpanded(!unavailableSectionExpanded)}
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
                {unavailableSectionExpanded
                  ? <FaChevronUp className="text-gray-400" /> 
                  : <FaChevronDown className="text-gray-400" />
                }
              </button>
              
              {unavailableSectionExpanded && (
                <div className="border-t border-amber-200 dark:border-amber-800">
                  <ControlTable
                    controls={filteredUnlicensed}
                    resultMap={resultMap}
                    tenantLicenses={tenantLicenses}
                    disabledControlIds={disabledControlIds}
                    isAdmin={isAdmin}
                    onStatusChange={handleStatusChange}
                    onControlClick={setSelectedControl}
                    onToggleEnabled={handleToggleEnabled}
                    onEdit={handleOpenEdit}
                    onRunTest={handleRunTest}
                    runningTestId={runningTestId}
                    showLicenseButton
                    showActions
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Custom Tests Tab Content */}
      {activeTab === 'custom' && (
        <div className="space-y-4">
          {/* Add Test Button */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Create custom security tests for your organization's specific requirements.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <FaPlus size={14} />
              Add Custom Test
            </button>
          </div>
          
          {/* Custom Tests List */}
          {filteredCustom.length > 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
              <ControlTable
                controls={filteredCustom}
                resultMap={resultMap}
                tenantLicenses={tenantLicenses}
                disabledControlIds={disabledControlIds}
                isAdmin={isAdmin}
                onStatusChange={handleStatusChange}
                onControlClick={setSelectedControl}
                onToggleEnabled={handleToggleEnabled}
                onEdit={handleOpenEdit}
                onDelete={(controlId) => setShowDeleteConfirm(controlId)}
                onRunTest={handleRunTest}
                runningTestId={runningTestId}
                showActions
                showDeleteButton
              />
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
              <FaShieldAlt className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Custom Tests Yet</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Create your own security tests to complement the default Microsoft Entra best practices. 
                Custom tests can be added, modified, and removed as needed.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <FaPlus className="inline mr-2" size={14} />
                Add Your First Custom Test
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Control Detail Modal */}
      {selectedControl && (
        <ControlDetailModal
          control={selectedControl}
          result={resultMap.get(selectedControl.id)}
          isLicensed={isLicensed(selectedControl, tenantLicenses)}
          missingLicenses={getMissingLicenses(selectedControl, tenantLicenses)}
          isEnabled={!disabledControlIds.has(selectedControl.id)}
          onClose={() => setSelectedControl(null)}
          onStatusChange={isAdmin ? handleStatusChange : undefined}
          onToggleEnabled={() => toggleControlEnabled(selectedControl.id)}
          onUpdateControl={(id, updates) => updateControl(id, updates)}
          onRunTest={handleRunTest}
          onSetTestResult={updateControlTestResult}
          isRunning={runningTestId === selectedControl.id}
        />
      )}
      
      {/* Add Test Modal */}
      {showAddModal && (
        <TestFormModal
          pillar={pillar}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddTest}
        />
      )}
      
      {/* Edit Test Modal */}
      {showEditModal && editingControl && (
        <TestFormModal
          pillar={pillar}
          control={editingControl}
          onClose={() => { setShowEditModal(false); setEditingControl(null); }}
          onSave={(updates) => handleEditTest(editingControl.id, updates)}
        />
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          onClose={() => setShowDeleteConfirm(null)}
          onConfirm={() => handleDeleteTest(showDeleteConfirm)}
        />
      )}
      
      {/* Audit Log Modal */}
      {showAuditLog && (
        <AuditLogModal
          events={auditEvents.filter(e => {
            const controlId = e.details?.controlId as string;
            // Include events with a matching pillar directly
            if (e.details?.pillar === pillar) return true;
            if (!controlId) return false;
            const control = [...defaultControls, ...customControls].find(c => c.id === controlId);
            return control?.pillar === pillar;
          })}
          onClose={() => setShowAuditLog(false)}
          onClearEvents={clearAuditEvents}
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
  disabledControlIds: Set<string>;
  isAdmin: boolean;
  onStatusChange: (controlId: string, status: ControlStatus) => void;
  onControlClick: (control: Control) => void;
  onToggleEnabled: (controlId: string, e: React.MouseEvent) => void;
  onEdit?: (control: Control) => void;
  onDelete?: (controlId: string) => void;
  onRunTest?: (control: Control) => Promise<void>;
  runningTestId?: string | null;
  showLicenseButton?: boolean;
  showActions?: boolean;
  showDeleteButton?: boolean;
}

const ControlTable: React.FC<ControlTableProps> = ({
  controls,
  resultMap,
  tenantLicenses,
  disabledControlIds,
  onControlClick,
  onToggleEnabled,
  onEdit,
  onDelete,
  onRunTest,
  runningTestId,
  showLicenseButton = false,
  showActions = false,
  showDeleteButton = false,
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
            <th className="px-4 py-3 text-left w-12">Enabled</th>
            <th className="px-4 py-3 text-left">Control</th>
            <th className="px-4 py-3 text-left">Result</th>
            <th className="px-4 py-3 text-left">Action</th>
            <th className="px-4 py-3 text-left">Risk</th>
            <th className="px-4 py-3 text-left">Points</th>
            <th className="px-4 py-3 text-left">{showLicenseButton ? 'Required Licenses' : 'Last Checked'}</th>
            {showActions && <th className="px-4 py-3 text-left">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {controls.map(control => {
            const result = resultMap.get(control.id);
            const licensed = isLicensed(control, tenantLicenses);
            const missingLicenses = getMissingLicenses(control, tenantLicenses);
            const isEnabled = !disabledControlIds.has(control.id);
            const testResult = result?.result || TestResult.NOT_RUN;
            const actionStatus = licensed ? (result?.status || ControlStatus.TO_ADDRESS) : ControlStatus.NOT_LICENSED;
            
            return (
              <tr
                key={control.id}
                onClick={() => onControlClick(control)}
                className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${
                  !isEnabled ? 'opacity-50' : ''
                } ${!licensed ? 'opacity-75' : ''}`}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => onToggleEnabled(control.id, e)}
                    className={`p-1 rounded transition-colors ${
                      isEnabled 
                        ? 'text-green-500 hover:text-green-600' 
                        : 'text-gray-400 hover:text-gray-500'
                    }`}
                    title={isEnabled ? 'Click to disable' : 'Click to enable'}
                  >
                    {isEnabled ? <FaToggleOn size={20} /> : <FaToggleOff size={20} />}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {control.title}
                      {control.isCustom && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                          Custom
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {control.id} • {control.category || 'General'}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${TEST_RESULT_COLORS[testResult].bg} ${TEST_RESULT_COLORS[testResult].text}`}>
                    {TEST_RESULT_DISPLAY_NAMES[testResult]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={actionStatus} />
                </td>
                <td className="px-4 py-3">
                  {control.risk && <RiskIndicator risk={control.risk} />}
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {control.maxPoints} pts
                  </span>
                </td>
                <td className="px-4 py-3">
                  {showLicenseButton && missingLicenses.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                        <LicenseChips licenses={missingLicenses} compact />
                      </div>
                      <a
                        href={control.purchaseUrl || LICENSE_INFO[missingLicenses[0]]?.purchaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 whitespace-nowrap flex-shrink-0"
                      >
                        Get License
                      </a>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {result?.lastCheckedAt 
                        ? new Date(result.lastCheckedAt).toLocaleDateString()
                        : '-'
                      }
                    </span>
                  )}
                </td>
                {showActions && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {/* Run Test Button - Available for all tests (custom with auto detection or default tests) */}
                      {onRunTest && (
                        control.isCustom 
                          ? (control.detectionMode && control.detectionMode !== 'manual') 
                          : true // Default tests can always be run
                      ) && (
                        <button
                          onClick={() => onRunTest(control)}
                          disabled={runningTestId === control.id}
                          className={`p-1.5 rounded transition-colors ${
                            runningTestId === control.id
                              ? 'text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'
                              : 'text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
                          }`}
                          title="Run Test"
                        >
                          {runningTestId === control.id ? (
                            <FaSpinner size={14} className="animate-spin" />
                          ) : (
                            <FaPlay size={12} />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => onEdit?.(control)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded"
                        title="Edit"
                      >
                        <FaEdit size={14} />
                      </button>
                      {showDeleteButton && control.isCustom && (
                        <button
                          onClick={() => onDelete?.(control.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                          title="Delete"
                        >
                          <FaTrash size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
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
  isEnabled: boolean;
  onClose: () => void;
  onStatusChange?: (controlId: string, status: ControlStatus) => void;
  onToggleEnabled: () => void;
  onUpdateControl?: (controlId: string, updates: Partial<Control>) => void;
  onRunTest?: (control: Control) => void;
  onSetTestResult?: (controlId: string, result: TestResult) => void;
  isRunning?: boolean;
}

const ControlDetailModal: React.FC<ControlDetailModalProps> = ({
  control,
  result,
  isLicensed,
  missingLicenses,
  isEnabled,
  onClose,
  onStatusChange,
  onToggleEnabled,
  onUpdateControl,
  onRunTest,
  onSetTestResult,
  isRunning,
}) => {
  const testResult = result?.result || TestResult.NOT_RUN;
  
  // Handler to toggle checklist item
  const handleToggleChecklistItem = (itemId: string) => {
    if (!control.checklistConfig || !onUpdateControl) return;
    
    const updatedItems = control.checklistConfig.items.map(item => 
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    
    onUpdateControl(control.id, {
      checklistConfig: {
        ...control.checklistConfig,
        items: updatedItems,
      },
    });
  };
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
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-500">{control.id}</span>
              {control.isCustom && (
                <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                  Custom
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1">
              {control.title}
            </h2>
            <div className="flex items-center gap-3 mt-2">
              {/* Result Badge */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Result:</span>
                <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${TEST_RESULT_COLORS[testResult].bg} ${TEST_RESULT_COLORS[testResult].text}`}>
                  {TEST_RESULT_DISPLAY_NAMES[testResult]}
                </span>
              </div>
              {/* Action Badge */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Action:</span>
                <StatusBadge status={currentStatus} />
              </div>
              {control.risk && <RiskIndicator risk={control.risk} />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Run Test Button - Available for all tests */}
            {onRunTest && isLicensed && isEnabled && (
              <button
                onClick={() => onRunTest(control)}
                disabled={isRunning}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors bg-green-50 border-green-200 text-green-700 hover:bg-green-100 disabled:opacity-50"
              >
                {isRunning ? <FaSpinner className="animate-spin" size={14} /> : <FaPlay size={14} />}
                <span className="text-sm">{isRunning ? 'Running...' : 'Run Test'}</span>
              </button>
            )}
            <button
              onClick={onToggleEnabled}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                isEnabled
                  ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {isEnabled ? <FaToggleOn size={16} /> : <FaToggleOff size={16} />}
              <span className="text-sm">{isEnabled ? 'Enabled' : 'Disabled'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <FaTimes className="text-gray-400" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Disabled Warning */}
          {!isEnabled && (
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FaToggleOff className="text-gray-400 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300">
                    Test Disabled
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    This test is currently disabled and won't be included in score calculations.
                  </p>
                </div>
              </div>
            </div>
          )}
          
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
          
          {/* Auto-detected Result Section */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <FaCheckCircle className={TEST_RESULT_COLORS[testResult].icon} size={16} />
              Test Result
            </h3>
            <div className="flex items-center gap-4">
              <span className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full ${TEST_RESULT_COLORS[testResult].bg} ${TEST_RESULT_COLORS[testResult].text}`}>
                {TEST_RESULT_DISPLAY_NAMES[testResult]}
              </span>
              <p className="text-sm text-gray-500">
                {testResult === TestResult.PASSED && 'This test passed.'}
                {testResult === TestResult.FAILED && 'This test failed and requires attention.'}
                {testResult === TestResult.INVESTIGATE && 'This test requires manual investigation.'}
                {testResult === TestResult.NOT_RUN && 'This test has not been executed yet.'}
              </p>
            </div>
            
            {/* Manual Result Setter - for manual mode custom tests or any test the user wants to override */}
            {onSetTestResult && isEnabled && isLicensed && (
              control.isCustom && (!control.detectionMode || control.detectionMode === 'manual')
            ) && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 mb-2">Manually set the result for this test:</p>
                <div className="flex gap-2">
                  {[
                    { value: TestResult.PASSED, label: 'Pass', color: 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200' },
                    { value: TestResult.FAILED, label: 'Fail', color: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200' },
                    { value: TestResult.INVESTIGATE, label: 'Investigate', color: 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200' },
                    { value: TestResult.NOT_RUN, label: 'Reset', color: 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => onSetTestResult(control.id, opt.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        testResult === opt.value ? opt.color + ' ring-2 ring-offset-1 ring-current' : opt.color + ' opacity-70'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Description */}
          {control.description && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Description</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {control.description}
              </p>
            </div>
          )}
          
          {/* Detection Mode Section - For custom tests */}
          {control.isCustom && control.detectionMode && (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <FaShieldAlt className="text-indigo-500" size={16} />
                Detection Mode
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    control.detectionMode === 'manual' ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' :
                    control.detectionMode === 'graph_query' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}>
                    {control.detectionMode === 'manual' && '📝 Manual Assessment'}
                    {control.detectionMode === 'graph_query' && '🔗 Graph API Query'}
                    {control.detectionMode === 'checklist' && '✅ Checklist'}
                  </span>
                </div>
                
                {/* Graph Query Config Details */}
                {control.detectionMode === 'graph_query' && control.graphQueryConfig && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-sm space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-xs text-gray-500">Endpoint:</span>
                        <p className="font-mono text-xs text-gray-800 dark:text-gray-200 break-all">
                          {control.graphQueryConfig.endpoint}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">API Version:</span>
                        <p className="text-xs text-gray-800 dark:text-gray-200">
                          {control.graphQueryConfig.useBeta ? 'Beta' : 'v1.0'}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Field:</span>
                        <p className="font-mono text-xs text-gray-800 dark:text-gray-200">
                          {control.graphQueryConfig.expectedField}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Operator:</span>
                        <p className="text-xs text-gray-800 dark:text-gray-200">
                          {control.graphQueryConfig.operator}
                        </p>
                      </div>
                      {control.graphQueryConfig.value && (
                        <div className="col-span-2">
                          <span className="text-xs text-gray-500">Expected Value:</span>
                          <p className="font-mono text-xs text-gray-800 dark:text-gray-200">
                            {control.graphQueryConfig.value}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Checklist Config Details - Interactive */}
                {control.detectionMode === 'checklist' && control.checklistConfig && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-sm">
                    <p className="text-xs text-gray-500 mb-2">
                      {control.checklistConfig.requireAll ? 'All items required' : 'Any item required'}
                    </p>
                    <div className="space-y-2">
                      {control.checklistConfig.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleToggleChecklistItem(item.id)}
                          disabled={!onUpdateControl}
                          className={`w-full flex items-center gap-2 text-xs text-left p-2 rounded-lg transition-colors ${
                            onUpdateControl ? 'hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer' : 'cursor-default'
                          }`}
                        >
                          <span className={`w-5 h-5 flex items-center justify-center rounded border-2 transition-colors ${
                            item.checked 
                              ? 'bg-green-500 border-green-500 text-white' 
                              : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
                          }`}>
                            {item.checked && '✓'}
                          </span>
                          <span className={`flex-1 ${item.checked ? 'text-gray-500 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                            {item.label}
                          </span>
                          {item.description && (
                            <span className="text-xs text-gray-400" title={item.description}>ℹ️</span>
                          )}
                        </button>
                      ))}
                    </div>
                    {control.checklistConfig.items.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <p className="text-xs text-gray-500">
                          {control.checklistConfig.items.filter(i => i.checked).length}/{control.checklistConfig.items.length} completed
                        </p>
                        {onRunTest && (
                          <button
                            onClick={() => onRunTest(control)}
                            disabled={isRunning}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {isRunning ? <FaSpinner className="animate-spin" size={10} /> : <FaPlay size={10} />}
                            {isRunning ? 'Running...' : 'Evaluate'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Last Run Info */}
                {control.lastRunAt && (
                  <p className="text-xs text-gray-500">
                    Last run: {new Date(control.lastRunAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* Action Status Selector (User Choice) */}
          {onStatusChange && isLicensed && isEnabled && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Update Action Status</h3>
              <p className="text-sm text-gray-500 mb-3">Choose how you want to address this control:</p>
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
// TEST FORM MODAL (Add/Edit)
// ============================================================================

interface TestFormModalProps {
  pillar: Pillar;
  control?: Control;
  onClose: () => void;
  onSave: (data: Partial<Control>) => void;
}

const TestFormModal: React.FC<TestFormModalProps> = ({
  control,
  onClose,
  onSave,
}) => {
  const isCustomTest = !control || control.isCustom;
  const [formData, setFormData] = useState<Partial<Control>>({
    title: control?.title || '',
    description: control?.description || '',
    category: control?.category || '',
    risk: control?.risk || 'Medium',
    maxPoints: control?.maxPoints || 10,
    userImpact: control?.userImpact || 'Medium',
    implementationCost: control?.implementationCost || 'Medium',
    docsUrl: control?.docsUrl || '',
    detectionMode: control?.detectionMode || 'manual',
    graphQueryConfig: control?.graphQueryConfig || {
      endpoint: '/users',
      useBeta: false,
      expectedField: 'value',
      operator: 'not_empty',
      value: '',
    },
    checklistConfig: control?.checklistConfig || {
      requireAll: true,
      items: [],
    },
  });
  
  const [testingEndpoint, setTestingEndpoint] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  // Track if user selected "custom" from dropdown
  const [useCustomEndpoint, setUseCustomEndpoint] = useState(() => {
    const endpoint = control?.graphQueryConfig?.endpoint || '/users';
    return !GRAPH_API_ENDPOINTS.some(e => e.value === endpoint);
  });
  const [customEndpoint, setCustomEndpoint] = useState(
    control?.graphQueryConfig?.endpoint && !GRAPH_API_ENDPOINTS.some(e => e.value === control.graphQueryConfig?.endpoint)
      ? control.graphQueryConfig.endpoint
      : ''
  );
  const [newChecklistItem, setNewChecklistItem] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title?.trim()) {
      toast.error('Title is required');
      return;
    }
    // For custom tests, require additional fields
    if (isCustomTest) {
      if (!formData.description?.trim()) {
        toast.error('Description is required');
        return;
      }
      if (!formData.category?.trim()) {
        toast.error('Category is required');
        return;
      }
      if (!formData.maxPoints || formData.maxPoints < 1) {
        toast.error('Max Points must be at least 1');
        return;
      }
      if (!formData.docsUrl?.trim()) {
        toast.error('Documentation URL is required');
        return;
      }
      // Validate detection mode specific requirements
      if (formData.detectionMode === 'graph_query') {
        if (!formData.graphQueryConfig?.endpoint) {
          toast.error('Graph API endpoint is required');
          return;
        }
      }
      if (formData.detectionMode === 'checklist') {
        if (!formData.checklistConfig?.items?.length) {
          toast.error('At least one checklist item is required');
          return;
        }
      }
    }
    onSave(formData);
  };
  
  const handleEndpointChange = (selectedEndpoint: string) => {
    if (selectedEndpoint === 'custom') {
      setUseCustomEndpoint(true);
      // Keep existing custom endpoint if any, otherwise clear
      setFormData({
        ...formData,
        graphQueryConfig: {
          ...formData.graphQueryConfig!,
          endpoint: customEndpoint || '',
        },
      });
    } else {
      setUseCustomEndpoint(false);
      setFormData({
        ...formData,
        graphQueryConfig: {
          ...formData.graphQueryConfig!,
          endpoint: selectedEndpoint,
        },
      });
    }
  };
  
  const handleTestEndpoint = async () => {
    if (!formData.graphQueryConfig?.endpoint) {
      toast.error('Please select an endpoint first');
      return;
    }
    
    setTestingEndpoint(true);
    setTestResult(null);
    
    try {
      const params = new URLSearchParams({
        endpoint: formData.graphQueryConfig.endpoint,
        use_beta: String(formData.graphQueryConfig.useBeta),
      });
      
      const response = await fetch(`/api/assessment/graph/test-endpoint?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      const data = await response.json();
      setTestResult(data);
      
      if (data.success) {
        toast.success('Endpoint test successful!');
      } else {
        toast.error(`Endpoint test failed: ${data.error}`);
      }
    } catch (error) {
      toast.error('Failed to test endpoint');
      setTestResult({ success: false, error: String(error) });
    } finally {
      setTestingEndpoint(false);
    }
  };
  
  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    
    const newItem: ChecklistItem = {
      id: `item-${Date.now()}`,
      label: newChecklistItem.trim(),
      checked: false,
    };
    
    setFormData({
      ...formData,
      checklistConfig: {
        ...formData.checklistConfig!,
        items: [...(formData.checklistConfig?.items || []), newItem],
      },
    });
    setNewChecklistItem('');
  };
  
  const removeChecklistItem = (itemId: string) => {
    setFormData({
      ...formData,
      checklistConfig: {
        ...formData.checklistConfig!,
        items: formData.checklistConfig?.items?.filter(i => i.id !== itemId) || [],
      },
    });
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {control ? (control.isCustom ? 'Edit Custom Test' : 'Edit Test') : 'Add Custom Test'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <FaTimes className="text-gray-400" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-150px)]">
          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="e.g., Require MFA for all admin accounts"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description {isCustomTest && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Describe what this test checks..."
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category {isCustomTest && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="e.g., MFA, Conditional Access"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Points {isCustomTest && <span className="text-red-500">*</span>}
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={formData.maxPoints}
                onChange={(e) => setFormData({ ...formData, maxPoints: parseInt(e.target.value) || 10 })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Risk Level
              </label>
              <select
                value={formData.risk}
                onChange={(e) => setFormData({ ...formData, risk: e.target.value as 'High' | 'Medium' | 'Low' })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                User Impact
              </label>
              <select
                value={formData.userImpact}
                onChange={(e) => setFormData({ ...formData, userImpact: e.target.value as 'High' | 'Medium' | 'Low' })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Impl. Cost
              </label>
              <select
                value={formData.implementationCost}
                onChange={(e) => setFormData({ ...formData, implementationCost: e.target.value as 'High' | 'Medium' | 'Low' })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Documentation URL {isCustomTest && <span className="text-red-500">*</span>}
            </label>
            <input
              type="url"
              value={formData.docsUrl}
              onChange={(e) => setFormData({ ...formData, docsUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="https://..."
            />
          </div>
          
          {/* Detection Mode - Only for custom tests */}
          {isCustomTest && (
            <>
              <hr className="border-gray-200 dark:border-gray-700 my-4" />
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Detection Mode <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Choose how this test determines pass/fail status
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'manual', label: 'Manual', desc: 'Set result manually' },
                    { value: 'graph_query', label: 'Graph API', desc: 'Auto-detect via API' },
                    { value: 'checklist', label: 'Checklist', desc: 'Verify items completed' },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, detectionMode: mode.value as DetectionMode })}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        formData.detectionMode === mode.value
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700'
                          : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <p className={`font-medium text-sm ${formData.detectionMode === mode.value ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>
                        {mode.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{mode.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Graph Query Configuration */}
              {formData.detectionMode === 'graph_query' && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-4">
                  <h4 className="font-medium text-gray-900 dark:text-white text-sm">Graph API Query Configuration</h4>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      API Endpoint
                    </label>
                    <select
                      value={useCustomEndpoint ? 'custom' : formData.graphQueryConfig?.endpoint}
                      onChange={(e) => handleEndpointChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      {GRAPH_API_ENDPOINTS.map((ep) => (
                        <option key={ep.value} value={ep.value}>
                          {ep.label} - {ep.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {useCustomEndpoint && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Custom Endpoint Path
                      </label>
                      <input
                        type="text"
                        value={customEndpoint}
                        onChange={(e) => {
                          setCustomEndpoint(e.target.value);
                          setFormData({
                            ...formData,
                            graphQueryConfig: {
                              ...formData.graphQueryConfig!,
                              endpoint: e.target.value,
                            },
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        placeholder="/path/to/resource (e.g., /groups, /applications)"
                      />
                      <p className="text-xs text-gray-400 mt-1">Enter a valid Microsoft Graph API path</p>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={formData.graphQueryConfig?.useBeta}
                        onChange={(e) => setFormData({
                          ...formData,
                          graphQueryConfig: {
                            ...formData.graphQueryConfig!,
                            useBeta: e.target.checked,
                          },
                        })}
                        className="rounded border-gray-300"
                      />
                      <span className="text-gray-700 dark:text-gray-300">Use Beta API</span>
                    </label>
                    
                    <button
                      type="button"
                      onClick={handleTestEndpoint}
                      disabled={testingEndpoint}
                      className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {testingEndpoint ? 'Testing...' : 'Test Endpoint'}
                    </button>
                  </div>
                  
                  {testResult && (
                    <div className={`p-3 rounded-lg text-xs ${testResult.success ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                      {testResult.success ? (
                        <div>
                          <p className="font-medium">✓ Endpoint accessible</p>
                          {testResult.data?.value && (
                            <p className="mt-1">Found {testResult.data._totalSample || testResult.data.value.length} items</p>
                          )}
                        </div>
                      ) : (
                        <p>✗ {testResult.error}</p>
                      )}
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Field to Evaluate
                      </label>
                      <input
                        type="text"
                        value={formData.graphQueryConfig?.expectedField}
                        onChange={(e) => setFormData({
                          ...formData,
                          graphQueryConfig: {
                            ...formData.graphQueryConfig!,
                            expectedField: e.target.value,
                          },
                        })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        placeholder="value"
                      />
                      <p className="text-xs text-gray-400 mt-1">e.g., value, value[0].state</p>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Operator
                      </label>
                      <select
                        value={formData.graphQueryConfig?.operator}
                        onChange={(e) => setFormData({
                          ...formData,
                          graphQueryConfig: {
                            ...formData.graphQueryConfig!,
                            operator: e.target.value as GraphQueryConfig['operator'],
                          },
                        })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      >
                        <option value="exists">Exists (not null)</option>
                        <option value="not_empty">Not Empty (array has items)</option>
                        <option value="equals">Equals</option>
                        <option value="not_equals">Not Equals</option>
                        <option value="contains">Contains</option>
                        <option value="count_gt">Count Greater Than</option>
                        <option value="count_lt">Count Less Than</option>
                        <option value="count_eq">Count Equals</option>
                        <option value="all_match">All Items Match</option>
                        <option value="any_match">Any Item Matches</option>
                      </select>
                    </div>
                  </div>
                  
                  {['equals', 'not_equals', 'contains', 'count_gt', 'count_lt', 'count_eq', 'all_match', 'any_match'].includes(formData.graphQueryConfig?.operator || '') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Expected Value
                      </label>
                      <input
                        type="text"
                        value={formData.graphQueryConfig?.value}
                        onChange={(e) => setFormData({
                          ...formData,
                          graphQueryConfig: {
                            ...formData.graphQueryConfig!,
                            value: e.target.value,
                          },
                        })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        placeholder={formData.graphQueryConfig?.operator?.includes('match') ? 'field:value' : 'value'}
                      />
                      {formData.graphQueryConfig?.operator?.includes('match') && (
                        <p className="text-xs text-gray-400 mt-1">Format: fieldName:expectedValue (e.g., state:enabled)</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Checklist Configuration */}
              {formData.detectionMode === 'checklist' && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-4">
                  <h4 className="font-medium text-gray-900 dark:text-white text-sm">Checklist Configuration</h4>
                  
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formData.checklistConfig?.requireAll}
                      onChange={(e) => setFormData({
                        ...formData,
                        checklistConfig: {
                          ...formData.checklistConfig!,
                          requireAll: e.target.checked,
                        },
                      })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-gray-700 dark:text-gray-300">Require all items to be checked for pass</span>
                  </label>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                      Checklist Items
                    </label>
                    
                    {formData.checklistConfig?.items?.map((item, index) => (
                      <div key={item.id} className="flex items-center gap-2 mb-2">
                        <span className="text-gray-500 text-sm w-6">{index + 1}.</span>
                        <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
                        <button
                          type="button"
                          onClick={() => removeChecklistItem(item.id)}
                          className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                        >
                          <FaTimes size={12} />
                        </button>
                      </div>
                    ))}
                    
                    <div className="flex items-center gap-2 mt-3">
                      <input
                        type="text"
                        value={newChecklistItem}
                        onChange={(e) => setNewChecklistItem(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())}
                        className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        placeholder="Add checklist item..."
                      />
                      <button
                        type="button"
                        onClick={addChecklistItem}
                        className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                      >
                        <FaPlus size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          
          {isCustomTest && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="text-red-500">*</span> Required fields for custom tests
            </p>
          )}
          
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              {control ? 'Save Changes' : 'Add Test'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// DELETE CONFIRMATION MODAL
// ============================================================================

interface DeleteConfirmModalProps {
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ onClose, onConfirm }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
            <FaTrash className="text-red-600" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Test</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">This action cannot be undone.</p>
          </div>
        </div>
        
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Are you sure you want to delete this custom test? All associated data will be permanently removed.
        </p>
        
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// AUDIT LOG MODAL
// ============================================================================

interface AuditLogModalProps {
  events: any[];
  onClose: () => void;
  onClearEvents?: () => void;
}

const AUDIT_EVENT_ICONS: Record<string, { icon: string; color: string }> = {
  STATUS_CHANGED: { icon: '🔄', color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
  WEIGHT_CHANGED: { icon: '⚖️', color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' },
  LICENSE_CHANGED: { icon: '🔑', color: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
  TEST_CREATED: { icon: '➕', color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
  TEST_DELETED: { icon: '🗑️', color: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
  TEST_RESULT_CHANGED: { icon: '📊', color: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' },
  CONTROL_ENABLED: { icon: '✅', color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
  CONTROL_DISABLED: { icon: '⛔', color: 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800' },
  BULK_ENABLE: { icon: '✅', color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
  BULK_DISABLE: { icon: '⛔', color: 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800' },
};

const formatEventType = (type: string) => {
  const typeLabels: Record<string, string> = {
    STATUS_CHANGED: 'Action Status Changed',
    WEIGHT_CHANGED: 'Weight Changed',
    LICENSE_CHANGED: 'License Changed',
    TEST_CREATED: 'Test Created',
    TEST_DELETED: 'Test Deleted',
    TEST_RESULT_CHANGED: 'Test Result Updated',
    CONTROL_ENABLED: 'Test Enabled',
    CONTROL_DISABLED: 'Test Disabled',
    BULK_ENABLE: 'Bulk Enable',
    BULK_DISABLE: 'Bulk Disable',
  };
  return typeLabels[type] || type.replace(/_/g, ' ');
};

const formatChangeDetail = (event: any): string => {
  const { details, type } = event;
  if (!details) return '';
  
  const before = details.before;
  const after = details.after;
  
  if (type === 'STATUS_CHANGED' && after?.status) {
    const fromStr = before?.status ? `from "${before.status}"` : '';
    return `${fromStr} to "${after.status}"`.trim();
  }
  if (type === 'STATUS_CHANGED' && after?.result) {
    const fromStr = before?.result ? `from "${before.result}"` : '';
    return `Result ${fromStr} to "${after.result}"`.trim();
  }
  if (type === 'WEIGHT_CHANGED') {
    return `${before} → ${after}`;
  }
  if (after?.title) return `"${after.title}"`;
  if (after?.description) return `Description updated`;
  
  return '';
};

const AuditLogModal: React.FC<AuditLogModalProps> = ({ events, onClose, onClearEvents }) => {
  const [retentionDays, setRetentionDays] = useState(30);
  const [filterType, setFilterType] = useState<string>('all');
  
  // Filter by retention
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  const filteredEvents = events.filter(e => {
    const eventDate = new Date(e.at);
    if (eventDate < cutoffDate) return false;
    if (filterType !== 'all' && e.type !== filterType) return false;
    return true;
  });
  
  const eventTypes = [...new Set(events.map(e => e.type))];
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FaHistory className="text-indigo-500" />
              Audit Log
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <FaTimes className="text-gray-400" />
            </button>
          </div>
          
          {/* Filters & Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Event Type Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Type:</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                <option value="all">All Events</option>
                {eventTypes.map(t => (
                  <option key={t} value={t}>{formatEventType(t)}</option>
                ))}
              </select>
            </div>
            
            {/* Retention */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Show last:</span>
              <select
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                <option value={1}>24 hours</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>1 year</option>
                <option value={9999}>All time</option>
              </select>
            </div>
            
            <div className="flex-1" />
            
            <span className="text-xs text-gray-400">{filteredEvents.length} events</span>
            
            {onClearEvents && (
              <button
                onClick={onClearEvents}
                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md border border-red-200 dark:border-red-800"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
        
        <div className="overflow-y-auto max-h-[calc(85vh-180px)]">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FaHistory size={32} className="mx-auto mb-3 opacity-50" />
              <p>No audit events found</p>
              <p className="text-xs mt-1">Events are recorded when you make changes to test configurations</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredEvents.slice(0, 200).map((event) => {
                const meta = AUDIT_EVENT_ICONS[event.type] || { icon: '📝', color: 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700' };
                const changeDetail = formatChangeDetail(event);
                
                return (
                  <div
                    key={event.id}
                    className="px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg mt-0.5 flex-shrink-0">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatEventType(event.type)}
                          </span>
                          {event.details?.controlId && (
                            <span className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                              {event.details.controlId}
                            </span>
                          )}
                        </div>
                        {event.details?.controlTitle && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                            {event.details.controlTitle}
                          </p>
                        )}
                        {changeDetail && (
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                            {changeDetail}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">
                            {event.actor}
                          </span>
                          <span className="text-xs text-gray-300">•</span>
                          <span className="text-xs text-gray-400">
                            {new Date(event.at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
