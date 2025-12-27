import React, { useEffect, useState, useMemo } from "react";
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
import { allIdentityTests, IdentityTest } from "../data";

type SecurityCheck = IdentityTest;

// SFI Pillar icons and colors
const sfiPillarConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  "Accelerate response and remediation": { icon: FaBolt, color: "text-orange-600", bgColor: "bg-orange-50 hover:bg-orange-100" },
  "Monitor and detect cyberthreats": { icon: FaEye, color: "text-purple-600", bgColor: "bg-purple-50 hover:bg-purple-100" },
  "Protect engineering systems": { icon: FaWrench, color: "text-blue-600", bgColor: "bg-blue-50 hover:bg-blue-100" },
  "Protect identities and secrets": { icon: FaLock, color: "text-indigo-600", bgColor: "bg-indigo-50 hover:bg-indigo-100" },
  "Protect tenants and isolate production systems": { icon: FaBuilding, color: "text-green-600", bgColor: "bg-green-50 hover:bg-green-100" },
  "Protect networks": { icon: FaNetworkWired, color: "text-cyan-600", bgColor: "bg-cyan-50 hover:bg-cyan-100" },
};

const getSfiPillarConfig = (pillar: string) => {
  return sfiPillarConfig[pillar] || { icon: FaShieldAlt, color: "text-gray-600", bgColor: "bg-gray-50 hover:bg-gray-100" };
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
      return { 
        icon: FaCheckCircle, 
        color: "text-green-600", 
        bgColor: "bg-green-100", 
        textColor: "text-green-800",
        borderColor: "border-green-200"
      };
    case "Failed": 
      return { 
        icon: FaTimesCircle, 
        color: "text-red-600", 
        bgColor: "bg-red-100", 
        textColor: "text-red-800",
        borderColor: "border-red-200"
      };
    case "Investigate": 
      return { 
        icon: FaExclamationTriangle, 
        color: "text-amber-500", 
        bgColor: "bg-amber-100", 
        textColor: "text-amber-800",
        borderColor: "border-amber-200"
      };
    case "Skipped": 
      return { 
        icon: FaClock, 
        color: "text-gray-500", 
        bgColor: "bg-gray-100", 
        textColor: "text-gray-700",
        borderColor: "border-gray-200"
      };
    default: 
      return { 
        icon: FaClock, 
        color: "text-blue-500", 
        bgColor: "bg-blue-100", 
        textColor: "text-blue-800",
        borderColor: "border-blue-200"
      };
  }
};

const IdentityPage: React.FC = () => {
  const [checks, setChecks] = useState<SecurityCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSfiPillars, setSelectedSfiPillars] = useState<string[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedCheck, setSelectedCheck] = useState<SecurityCheck | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof SecurityCheck; direction: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      setTimeout(() => {
        setChecks(allIdentityTests as SecurityCheck[]);
        setLoading(false);
      }, 300);
    } catch (error) {
      console.error("Error fetching identity data:", error);
      setChecks(allIdentityTests as SecurityCheck[]);
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchData();
      toast.success("Identity assessment refreshed");
    } catch {
      toast.error("Failed to refresh data");
    } finally {
      setRefreshing(false);
    }
  };

  // Filter logic
  const filteredChecks = useMemo(() => {
    let result = checks;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(check =>
        check.title.toLowerCase().includes(term) ||
        check.category.toLowerCase().includes(term)
      );
    }

    if (selectedSfiPillars.length > 0) {
      result = result.filter(check => selectedSfiPillars.includes(check.sfiPillar));
    }

    if (selectedRisks.length > 0) {
      result = result.filter(check => selectedRisks.includes(check.risk));
    }

    if (selectedStatuses.length > 0) {
      result = result.filter(check => selectedStatuses.includes(check.status));
    }

    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [checks, searchTerm, selectedSfiPillars, selectedRisks, selectedStatuses, sortConfig]);

  const uniqueSfiPillars = useMemo(() => 
    Array.from(new Set(checks.map(c => c.sfiPillar).filter(Boolean))).sort(),
    [checks]
  );

  const uniqueRisks = ["High", "Medium", "Low"];
  const uniqueStatuses = ["Passed", "Failed", "Investigate", "Skipped"];

  // Stats
  const stats = useMemo(() => {
    const total = checks.length;
    const passed = checks.filter(c => c.status === "Passed").length;
    const failed = checks.filter(c => c.status === "Failed").length;
    const investigate = checks.filter(c => c.status === "Investigate").length;
    const highRisk = checks.filter(c => c.risk === "High").length;
    return { total, passed, failed, investigate, highRisk };
  }, [checks]);

  const toggleFilter = (
    value: string, 
    selected: string[], 
    setSelected: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setSelected(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  const clearAllFilters = () => {
    setSelectedSfiPillars([]);
    setSelectedRisks([]);
    setSelectedStatuses([]);
    setSearchTerm("");
  };

  const handleSort = (key: keyof SecurityCheck) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const hasActiveFilters = selectedSfiPillars.length > 0 || selectedRisks.length > 0 || selectedStatuses.length > 0 || searchTerm;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Identity</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Zero Trust identity security assessment
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-3xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
          <div className="text-sm text-gray-500">Total Tests</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-green-100 dark:border-green-900">
          <div className="text-3xl font-bold text-green-600">{stats.passed}</div>
          <div className="text-sm text-gray-500">Passed</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-red-100 dark:border-red-900">
          <div className="text-3xl font-bold text-red-600">{stats.failed}</div>
          <div className="text-sm text-gray-500">Failed</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-amber-100 dark:border-amber-900">
          <div className="text-3xl font-bold text-amber-500">{stats.investigate}</div>
          <div className="text-sm text-gray-500">Investigate</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-purple-100 dark:border-purple-900">
          <div className="text-3xl font-bold text-purple-600">{stats.highRisk}</div>
          <div className="text-sm text-gray-500">High Risk</div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        {/* Card Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Assessment results</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The results presented below are based on the security principles detailed in the{" "}
            <a
              href="https://learn.microsoft.com/en-us/entra/fundamentals/configure-security"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-700 hover:underline inline-flex items-center gap-1"
            >
              Configuring Microsoft Entra for increased security
              <FaExternalLinkAlt size={10} />
            </a>{" "}
            guide.
          </p>
        </div>

        <div className="p-6">
          {/* Filters Section */}
          <div className="space-y-4 mb-6">
            {/* Search & Quick Filters Row */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Search */}
              <div className="relative flex-1 min-w-[250px] max-w-md">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              {/* Risk Filter Pills */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Risk:</span>
                <div className="flex gap-1">
                  {uniqueRisks.map(risk => {
                    const isSelected = selectedRisks.includes(risk);
                    return (
                      <button
                        key={risk}
                        onClick={() => toggleFilter(risk, selectedRisks, setSelectedRisks)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                          isSelected
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                        }`}
                      >
                        {risk}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status:</span>
                <div className="flex gap-1">
                  {uniqueStatuses.map(status => {
                    const isSelected = selectedStatuses.includes(status);
                    const config = getStatusConfig(status);
                    return (
                      <button
                        key={status}
                        onClick={() => toggleFilter(status, selectedStatuses, setSelectedStatuses)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                          isSelected
                            ? `${config.bgColor} ${config.textColor} ring-1 ${config.borderColor}`
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                        }`}
                      >
                        {status}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* SFI Pillar Filters */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Filter by SFI Pillar:</span>
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {uniqueSfiPillars.map(pillar => {
                  const isSelected = selectedSfiPillars.includes(pillar);
                  const config = getSfiPillarConfig(pillar);
                  const Icon = config.icon;
                  return (
                    <button
                      key={pillar}
                      onClick={() => toggleFilter(pillar, selectedSfiPillars, setSelectedSfiPillars)}
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                        isSelected
                          ? "bg-indigo-600 text-white shadow-sm"
                          : `${config.bgColor} ${config.color} dark:bg-gray-700 dark:text-gray-300`
                      }`}
                    >
                      <Icon size={12} />
                      <span className="whitespace-nowrap">{pillar}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Results Count */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
              <span className="text-sm text-gray-500">
                Showing <span className="font-medium text-gray-900 dark:text-white">{filteredChecks.length}</span> of{" "}
                <span className="font-medium text-gray-900 dark:text-white">{checks.length}</span> tests
              </span>
            </div>
          </div>

          {/* Results Table */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort('title')}
                  >
                    <div className="flex items-center gap-2">
                      Name
                      {sortConfig?.key === 'title' && (
                        sortConfig.direction === 'asc' ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors w-28"
                    onClick={() => handleSort('risk')}
                  >
                    <div className="flex items-center gap-2">
                      Risk
                      {sortConfig?.key === 'risk' && (
                        sortConfig.direction === 'asc' ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors w-32"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-2">
                      Status
                      {sortConfig?.key === 'status' && (
                        sortConfig.direction === 'asc' ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                {filteredChecks.map((check) => {
                  const riskConfig = getRiskConfig(check.risk);
                  const statusConfig = getStatusConfig(check.status);
                  const StatusIcon = statusConfig.icon;
                  const RiskIcon = riskConfig.icon;
                  
                  return (
                    <tr
                      key={check.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-colors group"
                      onClick={() => {
                        setSelectedCheck(check);
                        setShowDetail(true);
                      }}
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 group-hover:underline">
                          {check.title}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <RiskIcon className={riskConfig.color} size={14} />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{check.risk}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                          <StatusIcon size={12} />
                          {check.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredChecks.length === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <FaSearch size={32} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium">No results found</p>
                <p className="text-sm mt-1">Try adjusting your filters or search term</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Slide-over Panel */}
      {showDetail && selectedCheck && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            onClick={() => setShowDetail(false)} 
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-2xl bg-white dark:bg-gray-800 shadow-2xl transform transition-transform">
            <div className="h-full flex flex-col">
              {/* Panel Header */}
              <div className="flex items-start justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex-1 pr-4">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white leading-tight">
                    {selectedCheck.title}
                  </h2>
                </div>
                <button
                  onClick={() => setShowDetail(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <FaTimes className="text-gray-500" />
                </button>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Metadata Pills */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Risk:</span>
                    <div className="flex items-center gap-1">
                      {React.createElement(getRiskConfig(selectedCheck.risk).icon, { 
                        className: getRiskConfig(selectedCheck.risk).color, 
                        size: 14 
                      })}
                      <span className="font-semibold">{selectedCheck.risk}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">User Impact:</span>
                    <span className="font-semibold">{selectedCheck.userImpact}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Implementation Cost:</span>
                    <span className="font-semibold">{selectedCheck.implementationCost}</span>
                  </div>
                </div>

                {/* Test Result Card */}
                <div className={`rounded-xl p-5 border ${getStatusConfig(selectedCheck.status).borderColor} ${getStatusConfig(selectedCheck.status).bgColor}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-semibold text-gray-900 dark:text-white">Test result →</span>
                    {React.createElement(getStatusConfig(selectedCheck.status).icon, { 
                      className: getStatusConfig(selectedCheck.status).color, 
                      size: 18 
                    })}
                    <span className={`px-2.5 py-0.5 text-sm font-medium rounded-full ${getStatusConfig(selectedCheck.status).bgColor} ${getStatusConfig(selectedCheck.status).textColor}`}>
                      {selectedCheck.status}
                    </span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300">{selectedCheck.testResult}</p>
                </div>

                {/* What was checked */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">What was checked</h3>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{selectedCheck.description}</p>
                </div>

                {/* Remediation Action (placeholder) */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-5 border border-blue-100 dark:border-blue-800">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Remediation action</h3>
                  <p className="text-gray-700 dark:text-gray-300 text-sm mb-3">
                    Review the test results and follow Microsoft's security recommendations.
                  </p>
                  <a
                    href="https://learn.microsoft.com/en-us/entra/fundamentals/configure-security"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    View security documentation
                    <FaExternalLinkAlt size={10} />
                  </a>
                </div>
              </div>

              {/* Panel Footer */}
              <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <FaShieldAlt size={14} />
                  <span>SFI Pillar: <span className="font-medium text-gray-700 dark:text-gray-300">{selectedCheck.sfiPillar}</span></span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
                  <span>Category: <span className="font-medium text-gray-700 dark:text-gray-300">{selectedCheck.category}</span></span>
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
