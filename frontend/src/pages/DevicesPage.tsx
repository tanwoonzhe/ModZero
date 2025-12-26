import React, { useEffect, useState } from "react";
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
} from "react-icons/fa";
import toast from "react-hot-toast";

const DevicesPage: React.FC = () => {
  const [data, setData] = useState<DeviceAssessmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"assessment" | "devices">("assessment");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = async () => {
    try {
      const res = await api.get<DeviceAssessmentData>("/assessment/devices");
      setData(res.data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load device assessment");
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
      toast.success("Device data refreshed");
    } catch (error) {
      toast.error("Failed to refresh data");
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

  if (!data?.data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No device data available</p>
        <button
          onClick={handleRefresh}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Load Data
        </button>
      </div>
    );
  }

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
  } = data.data;

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
        <h1 className="text-2xl font-bold">Device Assessment</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            Last synced: {new Date(data.last_synced).toLocaleString()}
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