import React, { useState, useMemo, useEffect } from "react";
import ReactMarkdown from "react-markdown";
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
  FaCog,
} from "react-icons/fa";
import toast from "react-hot-toast";
import { identityTests, SecurityTest, getTestStats, getUniqueSfiPillars, getTestRemediation } from "../data/securityTestsIndex";

// Markdown components for styling
const markdownComponents = {
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline">
      {children}
    </a>
  ),
  ul: ({ children }: any) => <ul className="list-disc list-inside space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="text-gray-700 dark:text-gray-300">{children}</li>,
  p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  table: ({ children }: any) => <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">{children}</table>,
  thead: ({ children }: any) => <thead className="bg-gray-50 dark:bg-gray-800">{children}</thead>,
  tbody: ({ children }: any) => <tbody className="divide-y divide-gray-200 dark:divide-gray-700">{children}</tbody>,
  tr: ({ children }: any) => <tr>{children}</tr>,
  th: ({ children }: any) => <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{children}</th>,
  td: ({ children }: any) => <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{children}</td>,
};

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

interface ApiCheck {
  id: string;
  name: string;
  category: string;
  status: string;
  risk_level: string;
  description: string;
  recommendation: string;
}

interface PolicyInfo {
  name: string;
  status: string;
  targetUsers: string;
  targetResources: string;
  grantControls: string;
}

interface DetailedTestResult {
  testId: string;
  status: string;
  result: string;
  policies: PolicyInfo[];
  inactivePolicies?: PolicyInfo[];
}

interface IdentityAssessmentData {
  data: {
    total_users: number;
    auth_summary: Record<string, number>;
    risky_users: any[];
    risky_user_count: number;
    ca_policies: any[];
    ca_policy_count: number;
    recent_sign_ins: any[];
    checks: ApiCheck[];
    sankey_data: any;
    detailed_test_results?: Record<string, DetailedTestResult>;
  };
  last_synced: string;
  expires_at: string;
  is_cached: boolean;
}

const IdentityPage: React.FC = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSfiPillars, setSelectedSfiPillars] = useState<string[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedTest, setSelectedTest] = useState<SecurityTest | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof SecurityTest; direction: 'asc' | 'desc' } | null>(null);
  const [apiData, setApiData] = useState<IdentityAssessmentData | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // Fetch real assessment data from API
  const fetchAssessment = async () => {
    try {
      const res = await import("../api").then(m => m.default.get<IdentityAssessmentData>("/assessment/identity"));
      console.log("API Response:", res.data);
      console.log("Has detailed_test_results:", !!res.data?.data?.detailed_test_results);
      if (res.data?.data?.detailed_test_results) {
        console.log("Test IDs:", Object.keys(res.data.data.detailed_test_results));
      }
      setApiData(res.data);
      setLastSynced(res.data.last_synced);
    } catch (error) {
      console.error("Failed to fetch identity assessment:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessment();
  }, []);

  // Get detailed test result from API data
  const getDetailedTestResult = (testId: string): DetailedTestResult | null => {
    return apiData?.data?.detailed_test_results?.[testId] || null;
  };

  // Evaluate test status based on tenant data (with detailed results from backend)
  const evaluateTestStatus = (test: SecurityTest, data: IdentityAssessmentData['data'] | undefined): string => {
    if (!data) return test.status;
    
    // First check if we have a detailed test result from the backend (PS1 evaluation logic)
    const detailedResult = data.detailed_test_results?.[test.testId];
    if (detailedResult?.status) {
      return detailedResult.status;
    }
    
    const { total_users, auth_summary, risky_users, risky_user_count, ca_policies, ca_policy_count } = data;
    const totalUsers = total_users || 1;
    const mfaRate = (auth_summary?.mfa_registered || 0) / (auth_summary?.total_users || 1);
    const passwordlessRate = (auth_summary?.passwordless || 0) / (auth_summary?.total_users || 1);
    const phishResistantRate = ((auth_summary?.fido2 || 0) + (auth_summary?.windows_hello || 0)) / (auth_summary?.total_users || 1);
    
    // MFA related tests
    if (test.title.toLowerCase().includes('mfa') || test.title.toLowerCase().includes('multi-factor')) {
      if (test.title.toLowerCase().includes('all user') || test.title.toLowerCase().includes('require')) {
        return mfaRate >= 0.95 ? "Passed" : mfaRate >= 0.5 ? "Investigate" : "Failed";
      }
      if (test.title.toLowerCase().includes('admin') || test.title.toLowerCase().includes('privileged')) {
        return mfaRate >= 0.99 ? "Passed" : "Failed";
      }
    }
    
    // Conditional Access tests
    if (test.title.toLowerCase().includes('conditional access') || test.category?.toLowerCase() === 'conditional access') {
      const activePolicies = ca_policies?.filter((p: any) => p.state === 'enabled').length || 0;
      if (test.title.toLowerCase().includes('mfa')) {
        return activePolicies >= 1 && mfaRate > 0 ? "Passed" : "Failed";
      }
      if (test.title.toLowerCase().includes('device') || test.title.toLowerCase().includes('compliant')) {
        return activePolicies >= 2 ? "Passed" : activePolicies >= 1 ? "Investigate" : "Failed";
      }
      return activePolicies >= 1 ? "Passed" : "Investigate";
    }
    
    // Passwordless authentication tests
    if (test.title.toLowerCase().includes('passwordless') || test.title.toLowerCase().includes('password-less')) {
      return passwordlessRate >= 0.3 ? "Passed" : passwordlessRate >= 0.1 ? "Investigate" : "Planned";
    }
    
    // FIDO2 / Phish-resistant tests
    if (test.title.toLowerCase().includes('fido') || test.title.toLowerCase().includes('phish-resistant') || test.title.toLowerCase().includes('security key')) {
      return phishResistantRate >= 0.2 ? "Passed" : phishResistantRate >= 0.05 ? "Investigate" : "Planned";
    }
    
    // Windows Hello tests
    if (test.title.toLowerCase().includes('windows hello')) {
      const whfbRate = (auth_summary?.windows_hello || 0) / (auth_summary?.total_users || 1);
      return whfbRate >= 0.1 ? "Passed" : "Planned";
    }
    
    // Risk-based tests
    if (test.title.toLowerCase().includes('risk') && !test.title.toLowerCase().includes('sign-in')) {
      return risky_user_count === 0 ? "Passed" : risky_user_count <= 5 ? "Investigate" : "Failed";
    }
    
    // Legacy authentication tests
    if (test.title.toLowerCase().includes('legacy') && test.title.toLowerCase().includes('block')) {
      // Check if there's a CA policy blocking legacy auth
      const hasLegacyBlock = ca_policies?.some((p: any) => 
        p.displayName?.toLowerCase().includes('legacy') || 
        p.displayName?.toLowerCase().includes('block')
      );
      return hasLegacyBlock ? "Passed" : "Investigate";
    }
    
    // Guest user tests
    if (test.title.toLowerCase().includes('guest')) {
      return "Investigate"; // Always needs review
    }
    
    // Single factor tests (should fail if users only have single factor)
    if (test.title.toLowerCase().includes('single factor') || test.title.toLowerCase().includes('password only')) {
      const singleFactorRate = (auth_summary?.single_factor || 0) / (auth_summary?.total_users || 1);
      return singleFactorRate < 0.1 ? "Passed" : singleFactorRate < 0.3 ? "Investigate" : "Failed";
    }
    
    // For other tests, use the default status or mark as "Investigate" if we have data
    if (totalUsers > 0 && ca_policy_count !== undefined) {
      // We have real data, so mark unknown tests for investigation
      if (test.status === "Planned" || test.status === "Skipped") {
        return test.status;
      }
    }
    
    return test.status;
  };

  // Apply dynamic evaluation to all tests
  const tests = useMemo(() => {
    return identityTests.map(test => ({
      ...test,
      status: evaluateTestStatus(test, apiData?.data) as SecurityTest['status']
    }));
  }, [apiData]);

  const stats = useMemo(() => getTestStats(tests), [tests]);
  const uniqueSfiPillars = useMemo(() => getUniqueSfiPillars(tests), [tests]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const api = await import("../api").then(m => m.default);
      await api.post("/assessment/refresh", null, {
        params: { data_type: "identity_assessment" },
      });
      await fetchAssessment();
      toast.success("Identity assessment refreshed");
    } catch (error) {
      toast.error("Failed to refresh assessment");
    } finally {
      setRefreshing(false);
    }
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
      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      )}

      {!loading && (
        <>
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Identity</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Zero Trust identity security assessment based on Microsoft Entra best practices
            {lastSynced && (
              <span className="ml-2 text-xs text-indigo-600">
                • Last synced: {new Date(lastSynced).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {apiData?.data?.total_users !== undefined && (
            <span className="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
              {apiData.data.total_users} users • {apiData.data.ca_policy_count || 0} CA policies
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <FaSync className={refreshing ? "animate-spin" : ""} size={14} />
            <span>Refresh</span>
          </button>
        </div>
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
              {/* Test Result Section - Dynamic from API */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Test result</h3>
                  <span className="text-gray-500 dark:text-gray-400">→</span>
                  {(() => {
                    const detailedResult = getDetailedTestResult(selectedTest.testId);
                    const actualStatus = detailedResult?.status || selectedTest.status;
                    const statusConfig = getStatusConfig(actualStatus);
                    return (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                        {actualStatus}
                      </span>
                    );
                  })()}
                </div>
                
                {/* Detailed Test Result from API (PS1 format) */}
                {(() => {
                  const detailedResult = getDetailedTestResult(selectedTest.testId);
                  const hasDetailedResults = !!apiData?.data?.detailed_test_results;
                  const testIds = apiData?.data?.detailed_test_results ? Object.keys(apiData.data.detailed_test_results) : [];
                  
                  // Debug info - remove after testing
                  console.log("Selected test ID:", selectedTest.testId);
                  console.log("Has detailed_test_results:", hasDetailedResults);
                  console.log("Available test IDs:", testIds);
                  console.log("Detailed result for this test:", detailedResult);
                  
                  if (detailedResult?.result) {
                    return (
                      <div className="text-gray-700 dark:text-gray-300 text-sm prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown components={markdownComponents}>{detailedResult.result}</ReactMarkdown>
                      </div>
                    );
                  }
                  
                  // Show debug info in UI temporarily
                  return (
                    <>
                      {/* Debug info - visible in UI */}
                      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                        <p><strong>Debug:</strong> testId={selectedTest.testId}, hasDetailedResults={String(hasDetailedResults)}, availableIds=[{testIds.join(', ')}]</p>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 text-sm mb-4">
                        {selectedTest.status === "Passed" 
                          ? `${selectedTest.title.replace(/don''t|don't/gi, "").replace(/are |is /gi, "")} check completed successfully.`
                          : selectedTest.status === "Failed"
                          ? `${selectedTest.title.replace(/don''t|don't/gi, "").replace(/are |is /gi, "")} requires attention.`
                          : `${selectedTest.title} needs further investigation.`}
                      </p>

                      {/* Settings Table - Fallback */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Configuration settings</h4>
                        </div>
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Setting</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-gray-100 dark:border-gray-700">
                              <td className="px-4 py-3 text-sm text-indigo-600 dark:text-indigo-400">
                                {selectedTest.title}
                              </td>
                              <td className="px-4 py-3 text-sm text-right">
                                <span className={`${selectedTest.status === "Passed" ? "text-green-600" : selectedTest.status === "Failed" ? "text-red-600" : "text-amber-600"}`}>
                                  {selectedTest.status === "Passed" ? "Enabled" : selectedTest.status === "Failed" ? "Not configured" : "Needs review"}
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* What was checked */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">What was checked</h3>
                {(() => {
                  const remediation = getTestRemediation(selectedTest.testId);
                  const description = remediation?.description || selectedTest.description;
                  return (
                    <div className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown components={markdownComponents}>{description}</ReactMarkdown>
                    </div>
                  );
                })()}
              </div>

              {/* Remediation Action - Dynamic based on test ID from MD files */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-5 border border-blue-100 dark:border-blue-800">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Remediation action</h3>
                {(() => {
                  const remediation = getTestRemediation(selectedTest.testId);
                  if (remediation && remediation.remediation) {
                    return (
                      <div className="text-gray-700 dark:text-gray-300 text-sm prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown components={markdownComponents}>{remediation.remediation}</ReactMarkdown>
                      </div>
                    );
                  }
                  return (
                    <p className="text-gray-500 dark:text-gray-400 text-sm italic">
                      No specific remediation guidance available for this test.
                    </p>
                  );
                })()}
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
      </>
      )}
    </div>
  );
};

export default IdentityPage;
