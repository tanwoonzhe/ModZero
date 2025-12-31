import React, { useState, useMemo } from "react";
import {
  FaSync,
  FaSearch,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaClock,
  FaArrowUp,
  FaArrowRight,
  FaArrowDown,
  FaShieldAlt,
  FaEye,
  FaWrench,
  FaLock,
  FaBuilding,
  FaBolt,
  FaNetworkWired,
  FaTimes,
  FaExternalLinkAlt,
  FaChevronUp,
  FaChevronDown,
} from "react-icons/fa";
import toast from "react-hot-toast";
import { identityTests, SecurityTest, getTestStats, getUniqueSfiPillars } from "../data/securityTestsIndex";

// SFI Pillar icons configuration
const sfiPillarConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  "Accelerate response and remediation": { icon: FaBolt, color: "text-orange-600", bgColor: "bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20" },
  "Monitor and detect cyberthreats": { icon: FaEye, color: "text-purple-600", bgColor: "bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20" },
  "Protect engineering systems": { icon: FaWrench, color: "text-blue-600", bgColor: "bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20" },
  "Protect identities and secrets": { icon: FaLock, color: "text-indigo-600", bgColor: "bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20" },
  "Protect tenants and isolate production systems": { icon: FaBuilding, color: "text-green-600", bgColor: "bg-green-50 hover:bg-green-100 dark:bg-green-900/20" },
  "Protect networks": { icon: FaNetworkWired, color: "text-cyan-600", bgColor: "bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-900/20" },
};

const getSfiPillarConfig = (pillar: string) => {
  return sfiPillarConfig[pillar] || { icon: FaShieldAlt, color: "text-gray-600", bgColor: "bg-gray-50 hover:bg-gray-100 dark:bg-gray-700" };
};

const getRiskConfig = (risk: string) => {
  switch (risk) {
    case "High": return { icon: FaArrowUp, color: "text-red-600", label: "High" };
    case "Medium": return { icon: FaArrowRight, color: "text-amber-500", label: "Medium" };
    case "Low": return { icon: FaArrowDown, color: "text-green-600", label: "Low" };
    default: return { icon: FaArrowRight, color: "text-gray-500", label: risk };
  }
};

const getStatusConfig = (status: string) => {
  switch (status) {
    case "Passed": 
      return { icon: FaCheckCircle, color: "text-green-600", bgColor: "bg-green-100", textColor: "text-green-800" };
    case "Failed": 
      return { icon: FaTimesCircle, color: "text-red-600", bgColor: "bg-red-100", textColor: "text-red-800" };
    case "Investigate": 
      return { icon: FaExclamationTriangle, color: "text-amber-500", bgColor: "bg-amber-100", textColor: "text-amber-800" };
    case "Skipped":
    case "Planned":
      return { icon: FaClock, color: "text-gray-500", bgColor: "bg-gray-100", textColor: "text-gray-700" };
    default: 
      return { icon: FaClock, color: "text-blue-500", bgColor: "bg-blue-100", textColor: "text-blue-800" };
  }
};

const IdentityPage: React.FC = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSfiPillars, setSelectedSfiPillars] = useState<string[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedTest, setSelectedTest] = useState<SecurityTest | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof SecurityTest; direction: 'asc' | 'desc' } | null>(null);

  const tests = identityTests;
  const stats = useMemo(() => getTestStats(tests), [tests]);
  const uniqueSfiPillars = useMemo(() => getUniqueSfiPillars(tests), [tests]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 500));
    toast.success("Identity assessment refreshed");
    setRefreshing(false);
  };

  // Filtered tests
  const filteredTests = useMemo(() => {
    let result = tests;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(term) ||
        t.category.toLowerCase().includes(term) ||
        t.testId.includes(term)
      );
    }

    // SFI Pillar filter
    if (selectedSfiPillars.length > 0) {
      result = result.filter(t => selectedSfiPillars.includes(t.sfiPillar));
    }

    // Risk filter
    if (selectedRisks.length > 0) {
      result = result.filter(t => selectedRisks.includes(t.risk));
    }

    // Status filter (exclude Planned by default if no filters)
    if (selectedStatuses.length > 0) {
      result = result.filter(t => selectedStatuses.includes(t.status));
    } else {
      result = result.filter(t => t.status !== "Planned");
    }

    // Sort
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortConfig.key as keyof SecurityTest];
        const bVal = b[sortConfig.key as keyof SecurityTest];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [tests, searchTerm, selectedSfiPillars, selectedRisks, selectedStatuses, sortConfig]);

  const toggleFilter = (value: string, selected: string[], setSelected: React.Dispatch<React.SetStateAction<string[]>>) => {
    setSelected((prev: string[]) => prev.includes(value) ? prev.filter((v: string) => v !== value) : [...prev, value]);
  };

  const handleSort = (key: keyof SecurityTest) => {
    setSortConfig((prev: { key: keyof SecurityTest; direction: 'asc' | 'desc' } | null) => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Identity</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Zero Trust identity security assessment based on Microsoft Entra best practices
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          <FaSync className={refreshing ? "animate-spin" : ""} size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {/* Card Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Assessment results</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The results presented below are based on the security principles detailed in the{" "}
            <a
              href="https://learn.microsoft.com/en-us/entra/fundamentals/configure-security"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 font-medium underline underline-offset-4 hover:text-indigo-700"
            >
              Configuring Microsoft Entra for increased security
            </a>
            {" "}guide.
          </p>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-4">
          {/* Search and toggles */}
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="text"
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Risk Toggles */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Risk:</span>
              {["High", "Medium", "Low"].map(risk => (
                <button
                  key={risk}
                  onClick={() => toggleFilter(risk, selectedRisks, setSelectedRisks)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
                    ${selectedRisks.includes(risk)
                      ? 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/50 dark:border-indigo-600 dark:text-indigo-300'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300'
                    }`}
                >
                  {risk}
                </button>
              ))}
            </div>

            {/* Status Toggles */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Status:</span>
              {["Passed", "Failed"].map(status => (
                <button
                  key={status}
                  onClick={() => toggleFilter(status, selectedStatuses, setSelectedStatuses)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
                    ${selectedStatuses.includes(status)
                      ? 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/50 dark:border-indigo-600 dark:text-indigo-300'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300'
                    }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* SFI Pillar Filters */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-gray-500 self-center mr-2">Filter by SFI Pillar:</span>
            {uniqueSfiPillars.map((pillar: string) => {
              const config = getSfiPillarConfig(pillar);
              const Icon = config.icon;
              const isSelected = selectedSfiPillars.includes(pillar);
              return (
                <button
                  key={pillar}
                  onClick={() => toggleFilter(pillar, selectedSfiPillars, setSelectedSfiPillars)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
                    ${isSelected
                      ? `${config.bgColor} border-current ${config.color}`
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300'
                    }`}
                >
                  <Icon size={12} className={isSelected ? config.color : ''} />
                  {pillar}
                </button>
              );
            })}
          </div>

          {/* Results Count */}
          <div className="text-sm text-gray-500">
            Showing {filteredTests.length} of {tests.length} tests
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('title')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700"
                  >
                    Name
                    {sortConfig?.key === 'title' && (
                      sortConfig.direction === 'asc' ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('category')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700"
                  >
                    Category
                    {sortConfig?.key === 'category' && (
                      sortConfig.direction === 'asc' ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('risk')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700"
                  >
                    Risk
                    {sortConfig?.key === 'risk' && (
                      sortConfig.direction === 'asc' ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('status')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700"
                  >
                    Status
                    {sortConfig?.key === 'status' && (
                      sortConfig.direction === 'asc' ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredTests.map((test: SecurityTest) => {
                const riskConfig = getRiskConfig(test.risk);
                const statusConfig = getStatusConfig(test.status);
                const StatusIcon = statusConfig.icon;
                const RiskIcon = riskConfig.icon;

                return (
                  <tr
                    key={test.id}
                    onClick={() => { setSelectedTest(test); setShowDetail(true); }}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
                        {test.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {test.category}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <RiskIcon className={riskConfig.color} size={12} />
                        <span className={`text-sm ${riskConfig.color}`}>{test.risk}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                        <StatusIcon size={12} />
                        {test.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Panel */}
      {showDetail && selectedTest && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDetail(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
            {/* Panel Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 z-10">
              <div className="flex justify-between items-start">
                <div className="flex-1 pr-4">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedTest.title}</h2>
                  <p className="text-sm text-gray-500 mt-1">Test ID: {selectedTest.testId}</p>
                </div>
                <button onClick={() => setShowDetail(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <FaTimes size={18} className="text-gray-500" />
                </button>
              </div>
              
              {/* Status and Risk */}
              <div className="flex items-center gap-3 mt-4">
                {(() => {
                  const statusConfig = getStatusConfig(selectedTest.status);
                  const StatusIcon = statusConfig.icon;
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                      <StatusIcon size={14} />
                      {selectedTest.status}
                    </span>
                  );
                })()}
                {(() => {
                  const riskConfig = getRiskConfig(selectedTest.risk);
                  const RiskIcon = riskConfig.icon;
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 ${riskConfig.color}`}>
                      <RiskIcon size={14} />
                      {selectedTest.risk} Risk
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Panel Content */}
            <div className="p-6 space-y-6">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Description</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm">{selectedTest.description}</p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-5 border border-blue-100 dark:border-blue-800">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Remediation action</h3>
                <p className="text-gray-700 dark:text-gray-300 text-sm mb-3">
                  Review the test results and follow Microsoft Entra best practices for identity security.
                </p>
                <a
                  href="https://learn.microsoft.com/en-us/entra/fundamentals/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  View Entra documentation
                  <FaExternalLinkAlt size={10} />
                </a>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Category</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{selectedTest.category}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">SFI Pillar</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{selectedTest.sfiPillar || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">User Impact</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{selectedTest.userImpact}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Implementation Cost</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{selectedTest.implementationCost}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IdentityPage;
