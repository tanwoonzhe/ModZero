import React, { useEffect, useState } from "react";
import api from "../api";
import { DeviceAssessmentData, AssessmentCheck } from "../types";
import {
  FaSync,
  FaDesktop,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaLock,
  FaMobile,
  FaApple,
  FaWindows,
  FaAndroid,
  FaClock,
  FaShieldAlt,
  FaTimes,
} from "react-icons/fa";
import toast from "react-hot-toast";

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

// Mock data for demo purposes when API is unavailable
const getMockDeviceData = (): DeviceAssessmentData => ({
  data: {
    total_devices: 1924,
    devices: [
      { id: "1", name: "DESKTOP-001", os: "Windows 11", compliance: "compliant", ownership: "corporate", user: "john.doe@contoso.com" },
      { id: "2", name: "LAPTOP-002", os: "Windows 10", compliance: "compliant", ownership: "corporate", user: "jane.smith@contoso.com" },
      { id: "3", name: "MacBook-003", os: "macOS 14", compliance: "compliant", ownership: "corporate", user: "bob.wilson@contoso.com" },
      { id: "4", name: "iPhone-004", os: "iOS 17", compliance: "compliant", ownership: "personal", user: "alice.johnson@contoso.com" },
      { id: "5", name: "Pixel-005", os: "Android 14", compliance: "noncompliant", ownership: "personal", user: "charlie.brown@contoso.com" },
    ],
    os_distribution: {
      "Windows 11": 892,
      "Windows 10": 456,
      "macOS": 312,
      "iOS": 156,
      "Android": 108,
    },
    compliance_stats: {
      compliant: 1423,
      noncompliant: 264,
      unknown: 237,
    },
    compliance_rate: 74,
    ownership_stats: {
      corporate: 1687,
      personal: 237,
    },
    encryption_stats: {
      encrypted: 1756,
      not_encrypted: 168,
    },
    encryption_rate: 91,
    checks: [
      { id: "D001", name: "Device encryption is enabled", category: "Security", status: "pass", risk_level: "high", description: "BitLocker/FileVault is enabled on all corporate devices", recommendation: "Enable disk encryption on all devices" },
      { id: "D002", name: "Antivirus is up to date", category: "Security", status: "pass", risk_level: "high", description: "Windows Defender or approved AV is current", recommendation: "Keep antivirus definitions updated" },
      { id: "D003", name: "OS version is supported", category: "Compliance", status: "fail", risk_level: "medium", description: "Some devices running unsupported OS versions", recommendation: "Upgrade devices to supported OS versions" },
      { id: "D004", name: "Device is managed by Intune", category: "Management", status: "pass", risk_level: "medium", description: "Device enrollment in MDM", recommendation: "Enroll all corporate devices in Intune" },
      { id: "D005", name: "Compliance policy assigned", category: "Compliance", status: "pass", risk_level: "high", description: "Device compliance policies are assigned", recommendation: "Assign compliance policies to all device groups" },
      { id: "D006", name: "Screen lock enabled", category: "Security", status: "investigate", risk_level: "medium", description: "PIN/password lock requirement", recommendation: "Enforce screen lock on all devices" },
      { id: "D007", name: "Jailbreak/root detection", category: "Security", status: "pass", risk_level: "high", description: "No jailbroken or rooted devices detected", recommendation: "Block jailbroken/rooted devices" },
      { id: "D008", name: "App protection policies", category: "Data Protection", status: "pass", risk_level: "medium", description: "MAM policies applied to mobile apps", recommendation: "Apply app protection policies" },
      { id: "D009", name: "Remote wipe capability", category: "Management", status: "pass", risk_level: "high", description: "Devices can be remotely wiped if lost", recommendation: "Enable remote wipe capability" },
      { id: "D010", name: "Firewall enabled", category: "Security", status: "pass", risk_level: "medium", description: "Host firewall is active", recommendation: "Enable firewall on all devices" },
    ],
    sankey_data: {
      nodes: [
        { id: "all", label: "All Devices" },
        { id: "managed", label: "Managed" },
        { id: "unmanaged", label: "Unmanaged" },
        { id: "compliant", label: "Compliant" },
        { id: "noncompliant", label: "Non-compliant" },
        { id: "corporate", label: "Corporate" },
        { id: "personal", label: "Personal" },
      ],
      links: [
        { source: "all", target: "managed", value: 1687 },
        { source: "all", target: "unmanaged", value: 237 },
        { source: "managed", target: "compliant", value: 1423 },
        { source: "managed", target: "noncompliant", value: 264 },
        { source: "compliant", target: "corporate", value: 1356 },
        { source: "compliant", target: "personal", value: 67 },
        { source: "noncompliant", target: "corporate", value: 194 },
        { source: "noncompliant", target: "personal", value: 70 },
      ],
    },
  },
  last_synced: new Date().toISOString(),
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  is_cached: true,
});

// Live test result from /api/device-tests
interface LiveTestResult {
  testId: string;
  name: string;
  description: string;
  status: "pass" | "fail" | "warning" | "error" | "not_applicable";
  details: string;
  data: any;
  recommendation: string;
  timestamp: string;
}

interface LiveTestsResponse {
  category: string;
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    errors: number;
    score: number;
  };
  tests: LiveTestResult[];
}

// Map live API status to UI status
const mapLiveStatus = (status: string): string => {
  switch (status) {
    case "pass": return "Passed";
    case "fail": return "Failed";
    case "warning": return "Investigate";
    case "error": return "Failed";
    case "not_applicable": return "Skipped";
    default: return "Investigate";
  }
};

const DevicesPage: React.FC = () => {
  const [data, setData] = useState<DeviceAssessmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"inventory" | "posture" | "contribution" | "intune">("inventory");
  const [usingMockData, setUsingMockData] = useState(false);

  // Live tests state
  const [selectedLiveTest, setSelectedLiveTest] = useState<LiveTestResult | null>(null);

  // Trust score state for Device Trust Contribution tab
  const [trustScore, setTrustScore] = useState<any>(null);
  const [trustScoreLoading, setTrustScoreLoading] = useState(false);

  // Azure connection state for Intune Data tab
  const [azureStatus, setAzureStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [azureStatusLoading, setAzureStatusLoading] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get<DeviceAssessmentData>("/assessment/devices");
      setData(res.data);
      setUsingMockData(false);
    } catch (error) {
      console.error(error);
      // Use mock data as fallback
      setData(getMockDeviceData());
      setUsingMockData(true);
      toast.error("Using demo data - API unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === "contribution" && !trustScore && !trustScoreLoading) {
      setTrustScoreLoading(true);
      api.get("/trust/latest").then(r => setTrustScore(r.data)).catch(() => setTrustScore(null)).finally(() => setTrustScoreLoading(false));
    }
    if (activeTab === "intune" && !azureStatus && !azureStatusLoading) {
      setAzureStatusLoading(true);
      api.get("/azure/test-connection").then(r => setAzureStatus(r.data)).catch(() => setAzureStatus({ success: false, message: "Connection failed" })).finally(() => setAzureStatusLoading(false));
    }
  }, [activeTab]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.post("/assessment/refresh", null, {
        params: { data_type: "device_assessment" },
      });
      await fetchData();
      if (!usingMockData) {
        toast.success("Device data refreshed");
      }
    } catch (error) {
      // Use mock data on refresh failure
      setData(getMockDeviceData());
      setUsingMockData(true);
      toast.error("Using demo data - refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Use mock data if no data available
  const displayData = data?.data ? data : getMockDeviceData();

  const {
    total_devices,
    devices,
    compliance_stats,
    compliance_rate,
    ownership_stats,
    encryption_stats,
    encryption_rate,
  } = displayData.data!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Device Assessment</h1>
          {(usingMockData || !data?.data) && (
            <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
              Demo Mode
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            Last synced: {new Date(displayData.last_synced).toLocaleString()}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            <FaSync className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab("inventory")}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === "inventory"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Device Inventory ({total_devices})
          </button>
          <button
            onClick={() => setActiveTab("posture")}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === "posture"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Device Posture Checks
          </button>
          <button
            onClick={() => setActiveTab("contribution")}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === "contribution"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Device Trust Contribution
          </button>
          <button
            onClick={() => setActiveTab("intune")}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === "intune"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Intune Data
          </button>
        </nav>
      </div>

      {/* Live Test Detail Modal */}
      {selectedLiveTest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-start">
              <div>
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{selectedLiveTest.testId}</span>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1">{selectedLiveTest.name}</h2>
              </div>
              <button
                onClick={() => setSelectedLiveTest(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <FaTimes />
              </button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              {/* Status Badge */}
              <div>
                {(() => {
                  const config = getStatusConfig(mapLiveStatus(selectedLiveTest.status));
                  const Icon = config.icon;
                  return (
                    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${config.bgColor} ${config.textColor}`}>
                      <Icon size={14} />
                      {mapLiveStatus(selectedLiveTest.status)}
                    </span>
                  );
                })()}
              </div>

              {/* Description */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Description</h3>
                <p className="text-gray-700 dark:text-gray-300 text-sm">{selectedLiveTest.description}</p>
              </div>

              {/* Details */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Test Result Details</h3>
                <p className="text-gray-700 dark:text-gray-300 text-sm">{selectedLiveTest.details}</p>
              </div>

              {/* Recommendation */}
              {selectedLiveTest.recommendation && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Recommendation</h3>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">{selectedLiveTest.recommendation}</p>
                </div>
              )}

              {/* Data */}
              {selectedLiveTest.data && Object.keys(selectedLiveTest.data).length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Raw Data</h3>
                  <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-auto max-h-48 bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                    {JSON.stringify(selectedLiveTest.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "contribution" ? (
        /* Device Trust Contribution Tab */
        <div className="space-y-4">
          {trustScoreLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
            </div>
          ) : trustScore ? (
            <>
              {/* Score overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                  <div className="text-sm text-gray-500 mb-1">Device Posture Score</div>
                  <div className={`text-4xl font-bold ${trustScore.posture_score >= 80 ? 'text-green-600' : trustScore.posture_score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                    {Math.round(trustScore.posture_score)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">/ 100</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                  <div className="text-sm text-gray-500 mb-1">Final Trust Contribution</div>
                  <div className={`text-4xl font-bold ${trustScore.total_score >= 80 ? 'text-green-600' : trustScore.total_score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                    {Math.round(trustScore.posture_score * 0.4 * 10) / 10}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">/ 40 (device posture × 40% weight)</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                  <div className="text-sm text-gray-500 mb-1">Total Trust Score</div>
                  <div className={`text-4xl font-bold ${trustScore.total_score >= 80 ? 'text-green-600' : trustScore.total_score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                    {Math.round(trustScore.total_score)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">/ 100 (all modules)</div>
                </div>
              </div>
              {/* Breakdown */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Posture Score Breakdown</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Per-check contribution to Device Posture Score</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                      <tr className="text-left text-xs uppercase text-gray-500">
                        <th className="px-5 py-3">Check</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Points</th>
                        <th className="px-5 py-3">Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(trustScore.breakdown || []).map((item: any, idx: number) => (
                        <tr key={idx} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="px-5 py-3 font-medium text-gray-900 dark:text-white capitalize">
                            {item.factor?.replace(/_/g, ' ') || item.signal?.replace(/_/g, ' ')}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${item.passed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                              {item.passed ? 'Pass' : 'Fail'}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-mono text-gray-900 dark:text-white">
                            +{item.points || 0}
                          </td>
                          <td className="px-5 py-3 font-mono text-gray-400">
                            {item.max || item.points || 20}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 bg-gray-50 dark:bg-gray-900/20 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-400">
                    Device Posture Score contributes 40% to the Final Trust Score. Context Analysis contributes 30%, Identity / Policy contributes 30%.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
              <FaShieldAlt className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={36} />
              <p className="text-gray-500 dark:text-gray-400 text-sm">No trust score data available.</p>
              <p className="text-xs text-gray-400 mt-1">Register a device and submit a posture report from the ModZero Client App to see the breakdown.</p>
            </div>
          )}
        </div>
      ) : activeTab === "posture" ? (
        /* Device Posture Checks Tab */
        <>
          {/* Posture Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard icon={<FaCheckCircle />} title="Compliance Rate" value={`${compliance_rate}%`} subtitle={`${compliance_stats.compliant} compliant`} color={compliance_rate >= 80 ? "green" : compliance_rate >= 60 ? "yellow" : "red"} />
            <SummaryCard icon={<FaLock />} title="Encryption Rate" value={`${encryption_rate}%`} subtitle={`${encryption_stats.encrypted} encrypted`} color={encryption_rate >= 80 ? "green" : encryption_rate >= 60 ? "yellow" : "red"} />
            <SummaryCard icon={<FaDesktop />} title="Total Devices" value={total_devices} color="indigo" />
            <SummaryCard icon={<FaMobile />} title="Corporate Devices" value={ownership_stats.corporate} subtitle={`${((ownership_stats.corporate / Math.max(total_devices, 1)) * 100).toFixed(0)}% of total`} color="purple" />
          </div>
          {/* Posture Check Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Device Posture Checks</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Aggregated posture status across managed devices. Per-device real-time data is available via the ModZero Client app.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Result</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Affects Trust Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {[
                    { check: "Device Compliance Policy", source: "Microsoft Graph / Intune", result: compliance_rate >= 80 ? "Pass" : compliance_rate >= 50 ? "Warning" : "Fail", affects: true, weight: "High" },
                    { check: "Disk Encryption (BitLocker / FileVault)", source: "Microsoft Graph / Intune", result: encryption_rate >= 80 ? "Pass" : encryption_rate >= 50 ? "Warning" : "Fail", affects: true, weight: "High" },
                    { check: "Intune Compliant", source: "Microsoft Graph / Intune", result: compliance_stats.compliant > 0 ? "Pass" : "Not configured", affects: true, weight: "High" },
                    { check: "Firewall Enabled", source: "Local Client", result: "Simulated", affects: true, weight: "Medium" },
                    { check: "Antivirus Enabled", source: "Local Client", result: "Simulated", affects: true, weight: "Medium" },
                    { check: "Screen Lock Enabled", source: "Local Client", result: "Simulated", affects: true, weight: "Medium" },
                    { check: "OS Version Supported", source: "Local Client / Microsoft Graph", result: "Simulated", affects: true, weight: "Medium" },
                    { check: "Last Check-in (≤ 7 days)", source: "Local Client", result: "Simulated", affects: false, weight: "Low" },
                  ].map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{row.check}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{row.source}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          row.result === "Pass" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : row.result === "Warning" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                          : row.result === "Fail" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                        }`}>
                          {row.result}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{row.affects ? "Yes" : "No"}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{row.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-400">
                <strong>Simulated</strong> — firewall, antivirus, screen lock, and OS checks are reported by the ModZero Client agent running on the device. Install the ModZero Client to see real-time per-device posture data.
              </p>
            </div>
          </div>
        </>
      ) : activeTab === "inventory" ? (
        /* Device Inventory */
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Managed Devices</h3>
          {devices.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No managed devices found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OS</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Compliance</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Encrypted</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {devices.map((device: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <OSIcon os={device.operatingSystem} />
                          {device.deviceName}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {device.operatingSystem} {device.osVersion}
                      </td>
                      <td className="px-4 py-3 text-sm">{device.userPrincipalName || "—"}</td>
                      <td className="px-4 py-3">
                        <ComplianceBadge state={device.complianceState} />
                      </td>
                      <td className="px-4 py-3">
                        {device.isEncrypted ? (
                          <FaLock className="text-green-500" />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {device.lastSyncDateTime
                          ? new Date(device.lastSyncDateTime).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === "intune" ? (
        /* Intune Data Tab */
        <div className="space-y-4">
          {/* Graph Status Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Microsoft Graph / Intune Status</h3>
            {azureStatusLoading ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></div> Checking connection...</div>
            ) : azureStatus?.success ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">Graph Status: Connected</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">{azureStatus.message}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  <SummaryCard icon={<FaDesktop />} title="Total Devices" value={total_devices} color="indigo" />
                  <SummaryCard icon={<FaCheckCircle />} title="Compliant" value={compliance_stats.compliant} subtitle={`${compliance_rate}% rate`} color={compliance_rate >= 80 ? "green" : compliance_rate >= 60 ? "yellow" : "red"} />
                  <SummaryCard icon={<FaLock />} title="Encrypted" value={encryption_stats.encrypted} subtitle={`${encryption_rate}% rate`} color={encryption_rate >= 80 ? "green" : encryption_rate >= 60 ? "yellow" : "red"} />
                  <SummaryCard icon={<FaMobile />} title="Corporate" value={ownership_stats.corporate} color="purple" />
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 px-5 py-6 text-sm text-gray-500 dark:text-gray-400">
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Microsoft Graph is not configured.</p>
                <p>ModZero is currently using local client posture data only.</p>
                <p className="mt-2 text-xs">Configure AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET to enable Intune device compliance data.</p>
              </div>
            )}
          </div>

          {/* Intune Device Table (when connected) */}
          {azureStatus?.success && devices.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">Intune Managed Devices</h3>
                <p className="text-xs text-gray-500 mt-0.5">Synced from Microsoft Graph / Intune. Last sync: {new Date(displayData.last_synced).toLocaleString()}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/40">
                    <tr className="text-left text-xs uppercase text-gray-500">
                      <th className="px-4 py-3">Device Name</th>
                      <th className="px-4 py-3">OS</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">Compliance</th>
                      <th className="px-4 py-3">Encrypted</th>
                      <th className="px-4 py-3">Last Intune Sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((device: any, idx: number) => (
                      <tr key={idx} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2"><OSIcon os={device.operatingSystem} />{device.deviceName}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{device.operatingSystem} {device.osVersion}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">{device.userPrincipalName || "—"}</td>
                        <td className="px-4 py-3"><ComplianceBadge state={device.complianceState} /></td>
                        <td className="px-4 py-3">{device.isEncrypted ? <FaLock className="text-green-500" /> : <span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{device.lastSyncDateTime ? new Date(device.lastSyncDateTime).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

// Summary Card Component
const SummaryCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: number | string;
  subtitle?: string;
  color: string;
}> = ({ icon, title, value, subtitle, color }) => {
  const colorClasses: Record<string, string> = {
    indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300",
    green: "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300",
    yellow: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-300",
    red: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300",
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-semibold">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
};

// OS Icon Component
const OSIcon: React.FC<{ os: string }> = ({ os }) => {
  const osLower = (os || "").toLowerCase();
  if (osLower.includes("windows")) return <FaWindows className="text-blue-500" />;
  if (osLower.includes("mac") || osLower.includes("ios")) return <FaApple className="text-gray-500" />;
  if (osLower.includes("android")) return <FaAndroid className="text-green-500" />;
  return <FaDesktop className="text-gray-400" />;
};

// Compliance Badge Component
const ComplianceBadge: React.FC<{ state: string }> = ({ state }) => {
  const colors: Record<string, string> = {
    compliant: "bg-green-100 text-green-800",
    noncompliant: "bg-red-100 text-red-800",
    unknown: "bg-gray-100 text-gray-800",
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[state] || colors.unknown}`}>
      {state || "Unknown"}
    </span>
  );
};

export default DevicesPage;