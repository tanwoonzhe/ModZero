import React, { useEffect, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import api from "../api";
import { DeviceAssessmentData, AssessmentCheck } from "../types";
import { ResponsiveSankey } from "@nivo/sankey";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveBar } from "@nivo/bar";
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
  FaSearch,
  FaClock,
  FaArrowUp,
  FaArrowRight,
  FaArrowDown,
  FaShieldAlt,
  FaEye,
  FaWrench,
  FaBuilding,
  FaBolt,
  FaNetworkWired,
  FaTimes,
  FaExternalLinkAlt,
  FaCloud,
} from "react-icons/fa";
import toast from "react-hot-toast";
import { devicesTests, SecurityTest } from "../data/devicesTests";
import { getTestRemediation } from "../data/securityTestsIndex";

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
  const [activeTab, setActiveTab] = useState<"assessment" | "devices" | "security-tests" | "live-tests">("assessment");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [usingMockData, setUsingMockData] = useState(false);
  const [selectedSfiPillars, setSelectedSfiPillars] = useState<string[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedTest, setSelectedTest] = useState<SecurityTest | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  
  // Live tests state
  const [liveTests, setLiveTests] = useState<LiveTestsResponse | null>(null);
  const [liveTestsLoading, setLiveTestsLoading] = useState(false);
  const [selectedLiveTest, setSelectedLiveTest] = useState<LiveTestResult | null>(null);

  // Fetch live device tests from Graph API
  const fetchLiveTests = async () => {
    setLiveTestsLoading(true);
    try {
      const res = await api.get<LiveTestsResponse>("/device-tests");
      setLiveTests(res.data);
      toast.success(`Live device tests completed: ${res.data.summary.score}% score`);
    } catch (error: any) {
      console.error("Failed to fetch live device tests:", error);
      if (error.response?.status === 503) {
        toast.error("Azure credentials not configured. Please set up AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET.");
      } else {
        toast.error("Failed to run live device tests");
      }
    } finally {
      setLiveTestsLoading(false);
    }
  };

  // Evaluate test status based on tenant device data
  const evaluateDeviceTestStatus = (test: SecurityTest, deviceData: DeviceAssessmentData['data'] | undefined): string => {
    if (!deviceData) return test.status;
    
    const { 
      total_devices, 
      compliance_stats, 
      compliance_rate, 
      encryption_stats, 
      encryption_rate, 
      os_distribution, 
      ownership_stats 
    } = deviceData;
    
    const totalDevices = total_devices || 1;
    const complianceRate = compliance_rate / 100;
    const encryptionRate = encryption_rate / 100;
    
    // Windows compliance policies
    if (test.title.toLowerCase().includes('compliance polic') && test.title.toLowerCase().includes('windows')) {
      return complianceRate >= 0.9 ? "Passed" : complianceRate >= 0.6 ? "Investigate" : "Failed";
    }
    
    // macOS compliance policies
    if (test.title.toLowerCase().includes('compliance polic') && test.title.toLowerCase().includes('macos')) {
      const hasMac = os_distribution && (os_distribution['macOS'] > 0 || os_distribution['Mac OS'] > 0);
      if (!hasMac) return "Skipped";
      return complianceRate >= 0.9 ? "Passed" : complianceRate >= 0.6 ? "Investigate" : "Failed";
    }
    
    // iOS/iPadOS compliance policies
    if (test.title.toLowerCase().includes('compliance polic') && (test.title.toLowerCase().includes('ios') || test.title.toLowerCase().includes('ipad'))) {
      const hasIOS = os_distribution && (os_distribution['iOS'] > 0 || os_distribution['iPadOS'] > 0);
      if (!hasIOS) return "Skipped";
      return complianceRate >= 0.85 ? "Passed" : complianceRate >= 0.5 ? "Investigate" : "Failed";
    }
    
    // Android compliance policies
    if (test.title.toLowerCase().includes('compliance polic') && test.title.toLowerCase().includes('android')) {
      const hasAndroid = os_distribution && os_distribution['Android'] > 0;
      if (!hasAndroid) return "Skipped";
      return complianceRate >= 0.85 ? "Passed" : complianceRate >= 0.5 ? "Investigate" : "Failed";
    }
    
    // BitLocker / Encryption tests
    if (test.title.toLowerCase().includes('bitlocker') || test.title.toLowerCase().includes('encryption')) {
      return encryptionRate >= 0.95 ? "Passed" : encryptionRate >= 0.7 ? "Investigate" : "Failed";
    }
    
    // Firewall tests
    if (test.title.toLowerCase().includes('firewall')) {
      // Assume firewall is part of compliance
      return complianceRate >= 0.8 ? "Passed" : "Investigate";
    }
    
    // Windows Hello for Business
    if (test.title.toLowerCase().includes('windows hello')) {
      // Check if we have Windows devices
      const hasWindows = os_distribution && (os_distribution['Windows 11'] > 0 || os_distribution['Windows 10'] > 0);
      if (!hasWindows) return "Skipped";
      return complianceRate >= 0.5 ? "Investigate" : "Planned";
    }
    
    // Windows Update policies
    if (test.title.toLowerCase().includes('update polic') || test.title.toLowerCase().includes('patch')) {
      return complianceRate >= 0.9 ? "Passed" : complianceRate >= 0.7 ? "Investigate" : "Failed";
    }
    
    // Automatic enrollment tests
    if (test.title.toLowerCase().includes('enrollment') || test.title.toLowerCase().includes('enroll')) {
      const managedRate = (ownership_stats?.corporate || 0) / Math.max(totalDevices, 1);
      return managedRate >= 0.8 ? "Passed" : managedRate >= 0.5 ? "Investigate" : "Failed";
    }
    
    // App protection policies
    if (test.title.toLowerCase().includes('app protection') || test.title.toLowerCase().includes('app polic')) {
      return complianceRate >= 0.7 ? "Passed" : complianceRate >= 0.4 ? "Investigate" : "Planned";
    }
    
    // Corporate device tests
    if (test.title.toLowerCase().includes('corporate') && test.title.toLowerCase().includes('device')) {
      const corpRate = (ownership_stats?.corporate || 0) / Math.max(totalDevices, 1);
      return corpRate >= 0.8 ? "Passed" : corpRate >= 0.5 ? "Investigate" : "Failed";
    }
    
    // Personal/BYOD device tests
    if (test.title.toLowerCase().includes('personal') || test.title.toLowerCase().includes('byod')) {
      const personalDevices = ownership_stats?.personal || 0;
      if (personalDevices === 0) return "Skipped";
      return complianceRate >= 0.7 ? "Passed" : "Investigate";
    }
    
    // Zero devices case
    if (totalDevices === 0) {
      return "Skipped";
    }
    
    // Default: use compliance rate as general indicator
    if (complianceRate >= 0.9) return test.status === "Failed" ? "Investigate" : test.status;
    
    return test.status;
  };

  // Dynamically evaluated device tests
  const evaluatedTests = useMemo(() => {
    return devicesTests.map(test => ({
      ...test,
      status: evaluateDeviceTestStatus(test, data?.data) as SecurityTest['status']
    }));
  }, [data]);

  // Test statistics
  const testStats = useMemo(() => {
    const passed = evaluatedTests.filter(t => t.status === "Passed").length;
    const failed = evaluatedTests.filter(t => t.status === "Failed").length;
    const investigate = evaluatedTests.filter(t => t.status === "Investigate").length;
    const skipped = evaluatedTests.filter(t => t.status === "Skipped" || t.status === "Planned").length;
    return { passed, failed, investigate, skipped, total: evaluatedTests.length };
  }, [evaluatedTests]);

  // Get unique SFI pillars for filtering
  const uniqueSfiPillars = useMemo(() => {
    return [...new Set(evaluatedTests.map(t => t.sfiPillar))].filter(Boolean);
  }, [evaluatedTests]);

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

  // Filter security tests based on current filters
  const filteredSecurityTests = useMemo(() => {
    let result = evaluatedTests;

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

    // Status filter (exclude Planned/Skipped by default if no filters)
    if (selectedStatuses.length > 0) {
      result = result.filter(t => selectedStatuses.includes(t.status));
    } else {
      result = result.filter(t => t.status !== "Planned" && t.status !== "Skipped");
    }

    return result;
  }, [evaluatedTests, searchTerm, selectedSfiPillars, selectedRisks, selectedStatuses]);

  const toggleFilter = (value: string, selected: string[], setSelected: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (selected.includes(value)) {
      setSelected(selected.filter(v => v !== value));
    } else {
      setSelected([...selected, value]);
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
    os_distribution,
    compliance_stats,
    compliance_rate,
    ownership_stats,
    encryption_stats,
    encryption_rate,
    checks,
    sankey_data,
  } = displayData.data!;

  // Filter checks
  const filteredChecks = checks.filter((check) => {
    const matchesStatus = filterStatus === "all" || check.status === filterStatus;
    const matchesSearch =
      searchTerm === "" ||
      check.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Prepare Sankey data
  const nivoSankeyData = {
    nodes: sankey_data.nodes.map((n) => ({ id: n.label || n.id })),
    links: sankey_data.links.map((l) => ({
      source: sankey_data.nodes.find((n) => n.id === l.source)?.label || l.source,
      target: sankey_data.nodes.find((n) => n.id === l.target)?.label || l.target,
      value: Math.max(l.value, 1),
    })),
  };

  // OS Distribution bar data
  const osBarData = Object.entries(os_distribution).map(([os, count]) => ({
    os,
    count,
  }));

  // Compliance pie data
  const compliancePieData = [
    { id: "Compliant", label: "Compliant", value: compliance_stats.compliant, color: "#22c55e" },
    { id: "Non-compliant", label: "Non-compliant", value: compliance_stats.noncompliant, color: "#ef4444" },
    { id: "Unknown", label: "Unknown", value: compliance_stats.unknown, color: "#9ca3af" },
  ].filter((d) => d.value > 0);

  // Ownership pie data
  const ownershipPieData = [
    { id: "Corporate", label: "Corporate", value: ownership_stats.corporate, color: "#6366f1" },
    { id: "Personal", label: "Personal", value: ownership_stats.personal, color: "#f59e0b" },
  ].filter((d) => d.value > 0);

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
            onClick={() => setActiveTab("assessment")}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === "assessment"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Assessment Results
          </button>
          <button
            onClick={() => setActiveTab("security-tests")}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === "security-tests"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Security Tests ({testStats.total})
          </button>
          <button
            onClick={() => { setActiveTab("live-tests"); if (!liveTests) fetchLiveTests(); }}
            className={`py-2 px-4 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === "live-tests"
                ? "border-green-600 text-green-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <FaCloud size={14} />
            Live Graph Tests
          </button>
          <button
            onClick={() => setActiveTab("devices")}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === "devices"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Device List ({total_devices})
          </button>
        </nav>
      </div>

      {/* Live Tests Tab */}
      {activeTab === "live-tests" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Real-time Intune/Device Tests</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Live security tests executed directly against Microsoft Graph API / Intune.
              </p>
            </div>
            <button
              onClick={fetchLiveTests}
              disabled={liveTestsLoading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <FaSync className={liveTestsLoading ? "animate-spin" : ""} size={14} />
              <span>{liveTestsLoading ? "Running..." : "Refresh Tests"}</span>
            </button>
          </div>

          {liveTestsLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
                <p className="text-gray-500">Running live tests against Graph API...</p>
              </div>
            </div>
          )}

          {!liveTestsLoading && liveTests && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-5 gap-4 p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{liveTests.summary.total}</p>
                  <p className="text-xs text-gray-500 uppercase">Total</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{liveTests.summary.passed}</p>
                  <p className="text-xs text-green-600 uppercase">Passed</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{liveTests.summary.failed}</p>
                  <p className="text-xs text-red-600 uppercase">Failed</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-amber-600">{liveTests.summary.warnings}</p>
                  <p className="text-xs text-amber-600 uppercase">Warnings</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{liveTests.summary.score}%</p>
                  <p className="text-xs text-blue-600 uppercase">Score</p>
                </div>
              </div>

              {/* Test Results Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Test ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {liveTests.tests.map((test) => {
                      const statusConfig = getStatusConfig(mapLiveStatus(test.status));
                      const StatusIcon = statusConfig.icon;
                      return (
                        <tr
                          key={test.testId}
                          onClick={() => setSelectedLiveTest(test)}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                        >
                          <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-400">{test.testId}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{test.name}</p>
                            <p className="text-xs text-gray-500 truncate max-w-md">{test.description}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                              <StatusIcon size={12} />
                              {mapLiveStatus(test.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-md truncate">
                            {test.details}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!liveTestsLoading && !liveTests && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <FaCloud className="mx-auto text-gray-300 mb-4" size={48} />
                <p className="text-gray-500 mb-4">Click "Run Live Tests" to execute real-time device security checks.</p>
                <button
                  onClick={fetchLiveTests}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Run Live Tests
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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

      {activeTab === "assessment" ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={<FaDesktop />}
              title="Total Devices"
              value={total_devices}
              color="indigo"
            />
            <SummaryCard
              icon={<FaCheckCircle />}
              title="Compliance Rate"
              value={`${compliance_rate}%`}
              subtitle={`${compliance_stats.compliant} compliant`}
              color={compliance_rate >= 80 ? "green" : compliance_rate >= 60 ? "yellow" : "red"}
            />
            <SummaryCard
              icon={<FaLock />}
              title="Encryption Rate"
              value={`${encryption_rate}%`}
              subtitle={`${encryption_stats.encrypted} encrypted`}
              color={encryption_rate >= 80 ? "green" : encryption_rate >= 60 ? "yellow" : "red"}
            />
            <SummaryCard
              icon={<FaMobile />}
              title="Corporate Devices"
              value={ownership_stats.corporate}
              subtitle={`${((ownership_stats.corporate / Math.max(total_devices, 1)) * 100).toFixed(0)}% of total`}
              color="purple"
            />
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Device Management Flow Sankey */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">Device Management Flow</h3>
              <div className="h-80">
                <ResponsiveSankey
                  data={nivoSankeyData}
                  margin={{ top: 20, right: 160, bottom: 20, left: 20 }}
                  align="justify"
                  colors={{ scheme: "category10" }}
                  nodeOpacity={1}
                  nodeHoverOthersOpacity={0.35}
                  nodeThickness={18}
                  nodeSpacing={24}
                  nodeBorderWidth={0}
                  nodeBorderRadius={3}
                  linkOpacity={0.5}
                  linkHoverOthersOpacity={0.1}
                  linkContract={3}
                  enableLinkGradient={true}
                  labelPosition="outside"
                  labelOrientation="horizontal"
                  labelPadding={16}
                  labelTextColor={{ from: "color", modifiers: [["darker", 1]] }}
                />
              </div>
            </div>

            {/* OS Distribution */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">OS Distribution</h3>
              <div className="h-80">
                <ResponsiveBar
                  data={osBarData}
                  keys={["count"]}
                  indexBy="os"
                  margin={{ top: 20, right: 30, bottom: 60, left: 60 }}
                  padding={0.3}
                  valueScale={{ type: "linear" }}
                  colors={{ scheme: "paired" }}
                  borderColor={{ from: "color", modifiers: [["darker", 1.6]] }}
                  axisTop={null}
                  axisRight={null}
                  axisBottom={{
                    tickSize: 5,
                    tickPadding: 5,
                    tickRotation: -45,
                  }}
                  axisLeft={{
                    tickSize: 5,
                    tickPadding: 5,
                    tickRotation: 0,
                  }}
                  labelSkipWidth={12}
                  labelSkipHeight={12}
                  animate={true}
                />
              </div>
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Compliance Status */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">Compliance Status</h3>
              <div className="h-64">
                <ResponsivePie
                  data={compliancePieData}
                  margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
                  innerRadius={0.5}
                  padAngle={0.7}
                  cornerRadius={3}
                  activeOuterRadiusOffset={8}
                  colors={{ scheme: "set2" }}
                  borderWidth={1}
                  borderColor={{ from: "color", modifiers: [["darker", 0.2]] }}
                  arcLinkLabelsSkipAngle={10}
                  arcLinkLabelsTextColor="#333"
                  arcLinkLabelsThickness={2}
                  arcLinkLabelsColor={{ from: "color" }}
                  arcLabelsSkipAngle={10}
                  legends={[
                    {
                      anchor: "bottom",
                      direction: "row",
                      translateY: 56,
                      itemWidth: 100,
                      itemHeight: 18,
                      symbolSize: 14,
                      symbolShape: "circle",
                    },
                  ]}
                />
              </div>
            </div>

            {/* Ownership Distribution */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">Device Ownership</h3>
              <div className="h-64">
                <ResponsivePie
                  data={ownershipPieData}
                  margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
                  innerRadius={0.5}
                  padAngle={0.7}
                  cornerRadius={3}
                  activeOuterRadiusOffset={8}
                  colors={{ scheme: "accent" }}
                  borderWidth={1}
                  borderColor={{ from: "color", modifiers: [["darker", 0.2]] }}
                  arcLinkLabelsSkipAngle={10}
                  arcLinkLabelsTextColor="#333"
                  arcLinkLabelsThickness={2}
                  arcLinkLabelsColor={{ from: "color" }}
                  arcLabelsSkipAngle={10}
                  legends={[
                    {
                      anchor: "bottom",
                      direction: "row",
                      translateY: 56,
                      itemWidth: 100,
                      itemHeight: 18,
                      symbolSize: 14,
                      symbolShape: "circle",
                    },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Assessment Checks Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h3 className="text-lg font-semibold">Device Security Checks</h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search checks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="all">All Status</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="investigate">Investigate</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredChecks.map((check) => (
                    <tr key={check.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3">
                        <StatusIcon status={check.status} />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{check.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{check.category}</td>
                      <td className="px-4 py-3">
                        <RiskBadge level={check.risk_level} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{check.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeTab === "security-tests" ? (
        /* Security Tests Tab */
        <>
          {/* Stats Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <FaCheckCircle className="text-green-600 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{testStats.passed}</p>
                  <p className="text-sm text-gray-500">Passed</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <FaTimesCircle className="text-red-600 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{testStats.failed}</p>
                  <p className="text-sm text-gray-500">Failed</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <FaExclamationTriangle className="text-amber-500 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-500">{testStats.investigate}</p>
                  <p className="text-sm text-gray-500">Investigate</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
                  <FaClock className="text-gray-500 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-500">{testStats.skipped}</p>
                  <p className="text-sm text-gray-500">Skipped</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search tests..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                />
              </div>

              {/* SFI Pillar Filter */}
              <div className="flex flex-wrap gap-2">
                {uniqueSfiPillars.slice(0, 4).map(pillar => {
                  const config = getSfiPillarConfig(pillar);
                  const IconComponent = config.icon;
                  const isSelected = selectedSfiPillars.includes(pillar);
                  return (
                    <button
                      key={pillar}
                      onClick={() => toggleFilter(pillar, selectedSfiPillars, setSelectedSfiPillars)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                        isSelected ? `${config.bgColor} ${config.color}` : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                      title={pillar}
                    >
                      <IconComponent className="text-sm" />
                      <span className="hidden sm:inline">{pillar.split(' ').slice(0, 2).join(' ')}...</span>
                    </button>
                  );
                })}
              </div>

              {/* Risk Filter */}
              <div className="flex gap-1">
                {["High", "Medium", "Low"].map(risk => {
                  const config = getRiskConfig(risk);
                  const isSelected = selectedRisks.includes(risk);
                  return (
                    <button
                      key={risk}
                      onClick={() => toggleFilter(risk, selectedRisks, setSelectedRisks)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        isSelected ? `bg-gray-800 text-white` : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700'
                      }`}
                    >
                      <config.icon className={config.color} />
                      {risk}
                    </button>
                  );
                })}
              </div>

              {/* Status Filter */}
              <div className="flex gap-1">
                {["Passed", "Failed", "Investigate", "Skipped"].map(status => {
                  const config = getStatusConfig(status);
                  const isSelected = selectedStatuses.includes(status);
                  return (
                    <button
                      key={status}
                      onClick={() => toggleFilter(status, selectedStatuses, setSelectedStatuses)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        isSelected ? `${config.bgColor} ${config.textColor}` : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700'
                      }`}
                    >
                      <config.icon className={`text-xs ${config.color}`} />
                      {status}
                    </button>
                  );
                })}
              </div>

              {/* Clear Filters */}
              {(selectedSfiPillars.length > 0 || selectedRisks.length > 0 || selectedStatuses.length > 0 || searchTerm) && (
                <button
                  onClick={() => {
                    setSelectedSfiPillars([]);
                    setSelectedRisks([]);
                    setSelectedStatuses([]);
                    setSearchTerm("");
                  }}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Tests List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b dark:border-gray-700">
              <p className="text-sm text-gray-500">
                Showing {filteredSecurityTests.length} of {testStats.total} tests
              </p>
            </div>
            <div className="divide-y dark:divide-gray-700 max-h-[600px] overflow-y-auto">
              {filteredSecurityTests.map((test) => {
                const statusConfig = getStatusConfig(test.status);
                const riskConfig = getRiskConfig(test.risk);
                const pillarConfig = getSfiPillarConfig(test.sfiPillar);
                const PillarIcon = pillarConfig.icon;
                const StatusIcon = statusConfig.icon;
                const RiskIcon = riskConfig.icon;
                
                return (
                  <div
                    key={test.id}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                    onClick={() => { setSelectedTest(test); setShowDetail(true); }}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${statusConfig.bgColor}`}>
                        <StatusIcon className={`text-lg ${statusConfig.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-400">{test.testId}</span>
                          <span className={`flex items-center gap-1 text-xs ${riskConfig.color}`}>
                            <RiskIcon className="text-xs" />
                            {test.risk}
                          </span>
                        </div>
                        <h4 className="font-medium text-gray-900 dark:text-white">{test.title}</h4>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${pillarConfig.bgColor} ${pillarConfig.color}`}>
                            <PillarIcon className="text-xs" />
                            {test.sfiPillar}
                          </span>
                          <span className="text-xs text-gray-500">{test.category}</span>
                        </div>
                      </div>
                      <FaExternalLinkAlt className="text-gray-400 text-sm flex-shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Test Detail Panel */}
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
                  {/* Test Result Section */}
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white">Test result</h3>
                      <span className="text-gray-500 dark:text-gray-400">→</span>
                      {(() => {
                        const statusConfig = getStatusConfig(selectedTest.status);
                        return (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                            {selectedTest.status}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 text-sm mb-4">
                      {selectedTest.status === "Passed" 
                        ? `${selectedTest.title.replace(/don''t|don't/gi, "").replace(/are |is /gi, "")} check completed successfully.`
                        : selectedTest.status === "Failed"
                        ? `${selectedTest.title.replace(/don''t|don't/gi, "").replace(/are |is /gi, "")} requires attention.`
                        : `${selectedTest.title} needs further investigation.`}
                    </p>

                    {/* Settings Table */}
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
      ) : (
        /* Device List Tab */
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
      )}
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

// Status Icon Component
const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  const icons: Record<string, React.ReactNode> = {
    pass: <FaCheckCircle className="text-green-500 text-lg" />,
    fail: <FaTimesCircle className="text-red-500 text-lg" />,
    investigate: <FaExclamationTriangle className="text-yellow-500 text-lg" />,
    skipped: <span className="text-gray-400">—</span>,
  };
  return <>{icons[status] || icons.skipped}</>;
};

// Risk Badge Component
const RiskBadge: React.FC<{ level: string }> = ({ level }) => {
  const colors: Record<string, string> = {
    high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[level] || colors.low}`}>
      {level.toUpperCase()}
    </span>
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