import React, { useEffect, useState } from "react";
import {
  FaHistory,
  FaSearch,
  FaFilter,
  FaDownload,
  FaSyncAlt,
  FaCheck,
  FaTimes,
  FaExclamationTriangle,
  FaUser,
  FaDesktop,
  FaMapMarkerAlt,
  FaClock,
  FaChevronLeft,
  FaChevronRight,
  FaShieldAlt,
  FaEye,
} from "react-icons/fa";
import toast from "react-hot-toast";
import api from "../api";

interface Attempt {
  attempt_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  device_id?: string;
  device_name?: string;
  timestamp: string;
  decision: "allow" | "deny" | "mfa_required" | "block" | "review";
  result?: string;
  total_score?: number;
  ip_address?: string;
  location?: string;
  resource?: string;
  reason?: string;
  risk_level?: "low" | "medium" | "high" | "critical";
}

// Response from backend API
interface AttemptApiResponse {
  attempt_id: string;
  user_id: string;
  device_id?: string;
  ip_address?: string;
  geo_location?: { city?: string; country?: string };
  timestamp: string;
  result: string;
  reason?: string;
  total_score?: number;
  decision?: string;
}

const decisionConfig = {
  allow: { icon: FaCheck, bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "Allowed" },
  deny: { icon: FaTimes, bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Denied" },
  mfa_required: { icon: FaShieldAlt, bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "MFA Required" },
  review: { icon: FaEye, bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "Review" },
  block: { icon: FaTimes, bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Blocked" },
};

const riskColors = {
  low: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const LogsPage: React.FC = () => {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("24h");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAttempt, setSelectedAttempt] = useState<Attempt | null>(null);
  const itemsPerPage = 20;

  const mapDecision = (result: string): Attempt["decision"] => {
    if (result === "allow" || result === "deny" || result === "review" || result === "mfa_required" || result === "block") {
      return result as Attempt["decision"];
    }
    return "deny";
  };

  const calculateRiskLevel = (score: number | undefined): Attempt["risk_level"] => {
    if (!score) return "medium";
    if (score >= 80) return "low";
    if (score >= 60) return "medium";
    if (score >= 40) return "high";
    return "critical";
  };

  const fetchAttempts = async () => {
    try {
      const res = await api.get<AttemptApiResponse[]>("/attempts");
      // Transform backend response to frontend Attempt format
      const transformedAttempts: Attempt[] = res.data.map((item) => ({
        attempt_id: item.attempt_id,
        user_id: item.user_id,
        device_id: item.device_id,
        ip_address: item.ip_address,
        location: item.geo_location 
          ? [item.geo_location.city, item.geo_location.country].filter(Boolean).join(", ") 
          : undefined,
        timestamp: item.timestamp,
        decision: mapDecision(item.decision || item.result),
        result: item.result,
        total_score: item.total_score,
        reason: item.reason,
        risk_level: calculateRiskLevel(item.total_score),
      }));
      setAttempts(transformedAttempts);
    } catch (error) {
      console.error(error);
      // Mock data for demo
      const mockAttempts: Attempt[] = Array.from({ length: 50 }, (_, i) => {
        const decisions: Array<"allow" | "deny" | "mfa_required" | "block" | "review"> = ["allow", "allow", "allow", "deny", "mfa_required", "review"];
        const risks: Array<"low" | "medium" | "high" | "critical"> = ["low", "low", "low", "medium", "high", "critical"];
        const locations = ["New York, US", "London, UK", "Tokyo, JP", "Sydney, AU", "Berlin, DE", "Unknown"];
        const resources = ["SharePoint", "Exchange Online", "Azure Portal", "Teams", "OneDrive", "Power BI"];
        const userNames = ["John Smith", "Jane Doe", "Bob Wilson", "Alice Johnson", "Mike Brown", "Sarah Davis"];
        
        const decision = decisions[Math.floor(Math.random() * decisions.length)];
        const risk = decision === "allow" ? risks[Math.floor(Math.random() * 3)] : risks[Math.floor(Math.random() * 3) + 1];
        
        return {
          attempt_id: `att-${i + 1}`,
          user_id: `user-${(i % 6) + 1}`,
          user_name: userNames[i % 6],
          user_email: `${userNames[i % 6].toLowerCase().replace(" ", ".")}@contoso.com`,
          device_id: i % 3 === 0 ? undefined : `device-${(i % 10) + 1}`,
          device_name: i % 3 === 0 ? undefined : `DESKTOP-${String.fromCharCode(65 + (i % 10))}${i}`,
          timestamp: new Date(Date.now() - i * 600000 - Math.random() * 300000).toISOString(),
          decision,
          total_score: Math.floor(Math.random() * 100),
          ip_address: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          location: locations[Math.floor(Math.random() * locations.length)],
          resource: resources[Math.floor(Math.random() * resources.length)],
          risk_level: risk,
          reason: decision === "deny" ? "Policy violation detected" : decision === "mfa_required" ? "Unrecognized device" : undefined,
        };
      });
      setAttempts(mockAttempts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttempts();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAttempts();
    setRefreshing(false);
    toast.success("Logs refreshed");
  };

  const handleExport = () => {
    toast.success("Exporting logs to CSV...");
    // Implementation would go here
  };

  // Filter attempts
  const filteredAttempts = attempts.filter((attempt) => {
    const matchesSearch =
      attempt.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      attempt.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      attempt.device_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      attempt.ip_address?.includes(searchTerm) ||
      attempt.resource?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDecision = decisionFilter === "all" || attempt.decision === decisionFilter;
    
    let matchesDate = true;
    if (dateFilter !== "all") {
      const now = new Date();
      const attemptDate = new Date(attempt.timestamp);
      const hoursDiff = (now.getTime() - attemptDate.getTime()) / (1000 * 60 * 60);
      if (dateFilter === "1h") matchesDate = hoursDiff <= 1;
      else if (dateFilter === "24h") matchesDate = hoursDiff <= 24;
      else if (dateFilter === "7d") matchesDate = hoursDiff <= 168;
      else if (dateFilter === "30d") matchesDate = hoursDiff <= 720;
    }
    
    return matchesSearch && matchesDecision && matchesDate;
  });

  // Pagination
  const totalPages = Math.ceil(filteredAttempts.length / itemsPerPage);
  const paginatedAttempts = filteredAttempts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Stats
  const totalToday = attempts.filter((a) => {
    const today = new Date();
    const attemptDate = new Date(a.timestamp);
    return attemptDate.toDateString() === today.toDateString();
  }).length;
  const allowedCount = attempts.filter((a) => a.decision === "allow").length;
  const deniedCount = attempts.filter((a) => a.decision === "deny" || a.decision === "block").length;
  const reviewCount = attempts.filter((a) => a.decision === "review" || a.decision === "mfa_required").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Access Logs</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Monitor authentication and access attempts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <FaSyncAlt size={14} className={refreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <FaDownload size={14} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <FaHistory className="text-indigo-600 dark:text-indigo-400" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalToday}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Today's Attempts</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <FaCheck className="text-green-600 dark:text-green-400" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{allowedCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Allowed</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <FaTimes className="text-red-600 dark:text-red-400" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{deniedCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Denied/Blocked</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <FaShieldAlt className="text-amber-600 dark:text-amber-400" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{reviewCount}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Under Review</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[250px]">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Search by user, device, IP, or resource..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Decision Filter */}
          <div className="flex items-center gap-2">
            <FaFilter className="text-gray-400" size={14} />
            <select
              value={decisionFilter}
              onChange={(e) => setDecisionFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              <option value="all">All Decisions</option>
              <option value="allow">Allowed</option>
              <option value="deny">Denied</option>
              <option value="mfa_required">MFA Required</option>
              <option value="block">Blocked</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <FaClock className="text-gray-400" size={14} />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resource</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Decision</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {paginatedAttempts.map((attempt) => {
                  const config = decisionConfig[attempt.decision] || decisionConfig.allow;
                  const DecisionIcon = config.icon;
                  
                  return (
                    <tr key={attempt.attempt_id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FaClock className="text-gray-400" size={12} />
                          <div>
                            <p className="text-sm text-gray-900 dark:text-white">
                              {new Date(attempt.timestamp).toLocaleTimeString()}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(attempt.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                            <FaUser className="text-indigo-600 dark:text-indigo-400" size={12} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {attempt.user_name || attempt.user_id}
                            </p>
                            {attempt.user_email && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">{attempt.user_email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {attempt.device_name ? (
                          <div className="flex items-center gap-2">
                            <FaDesktop className="text-gray-400" size={12} />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{attempt.device_name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-700 dark:text-gray-300">{attempt.resource || "—"}</span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FaMapMarkerAlt className="text-gray-400" size={12} />
                          <div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">{attempt.location || "Unknown"}</p>
                            {attempt.ip_address && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{attempt.ip_address}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${config.bg} ${config.text}`}>
                          <DecisionIcon size={10} />
                          {config.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {attempt.risk_level ? (
                          <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${riskColors[attempt.risk_level]}`}>
                            {attempt.risk_level}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedAttempt(attempt)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded"
                        >
                          <FaEye size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredAttempts.length)} of {filteredAttempts.length} results
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FaChevronLeft size={12} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-sm ${
                        currentPage === pageNum
                          ? "bg-indigo-600 text-white"
                          : "border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FaChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredAttempts.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <FaHistory className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No logs found</h3>
          <p className="text-gray-500 dark:text-gray-400">Try adjusting your search or filter criteria</p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedAttempt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedAttempt(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900 dark:text-white">Access Attempt Details</h3>
              <button onClick={() => setSelectedAttempt(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <FaTimes size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">User</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedAttempt.user_name || selectedAttempt.user_id}</p>
                  {selectedAttempt.user_email && (
                    <p className="text-xs text-gray-500">{selectedAttempt.user_email}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Device</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedAttempt.device_name || "Unknown"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Timestamp</label>
                  <p className="text-sm text-gray-900 dark:text-white">{new Date(selectedAttempt.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Decision</label>
                  <p className="text-sm">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${decisionConfig[selectedAttempt.decision].bg} ${decisionConfig[selectedAttempt.decision].text}`}>
                      {decisionConfig[selectedAttempt.decision].label}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Resource</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedAttempt.resource || "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Location</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedAttempt.location || "Unknown"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">IP Address</label>
                  <p className="text-sm font-mono text-gray-900 dark:text-white">{selectedAttempt.ip_address || "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Risk Score</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedAttempt.total_score ?? "—"}</p>
                </div>
              </div>
              {selectedAttempt.reason && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <label className="text-xs font-medium text-amber-700 dark:text-amber-400 uppercase">Reason</label>
                  <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">{selectedAttempt.reason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogsPage;