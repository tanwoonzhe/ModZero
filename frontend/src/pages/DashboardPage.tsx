import React, { useEffect, useState } from "react";
import api from "../api";
import { OverviewAssessmentData } from "../types";
import { ResponsiveSankey } from "@nivo/sankey";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveBar } from "@nivo/bar";
import {
  FaBuilding,
  FaUsers,
  FaUserFriends,
  FaLayerGroup,
  FaAppStore,
  FaDesktop,
  FaShieldAlt,
  FaSync,
  FaCheckCircle,
  FaExclamationTriangle,
} from "react-icons/fa";
import toast from "react-hot-toast";

// Mock data for demo purposes when API is unavailable
const getMockOverviewData = (): OverviewAssessmentData => ({
  data: {
    tenant: {
      id: "demo-tenant-id",
      display_name: "Contoso Corporation",
      primary_domain: "contoso.onmicrosoft.com",
      verified_domains: ["contoso.com", "contoso.onmicrosoft.com"],
    },
    metrics: {
      users: 2847,
      guests: 156,
      groups: 423,
      apps: 89,
      devices: 1924,
      managed_devices: 1687,
      compliant_devices: 1423,
    },
    assessment_scores: {
      identity: {
        score: 72,
        tests_passed: 99,
        total_tests: 138,
      },
      devices: {
        score: 84,
        tests_passed: 30,
        total_tests: 36,
      },
    },
    auth_methods_summary: {
      total_users: 2847,
      mfa_registered: 2156,
      single_factor: 691,
      passwordless: 847,
      phone_auth: 1245,
      authenticator_app: 1834,
      fido2: 234,
      windows_hello: 567,
      email_auth: 423,
      software_oath: 156,
    },
  },
  last_synced: new Date().toISOString(),
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  is_cached: true,
});

const DashboardPage: React.FC = () => {
  const [data, setData] = useState<OverviewAssessmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usingMockData, setUsingMockData] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get<OverviewAssessmentData>("/assessment/overview");
      setData(res.data);
      setUsingMockData(false);
    } catch (error) {
      console.error(error);
      // Use mock data as fallback
      setData(getMockOverviewData());
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
        params: { data_type: "overview_stats" },
      });
      await fetchData();
      if (!usingMockData) {
        toast.success("Data refreshed successfully");
      }
    } catch (error) {
      // Use mock data on refresh failure too
      setData(getMockOverviewData());
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
  const displayData = data?.data ? data : getMockOverviewData();
  const { tenant, metrics, assessment_scores, auth_methods_summary } = displayData.data!;

  // Prepare Sankey data for authentication flow
  const sankeyData = {
    nodes: [
      { id: "All Users", nodeColor: "hsl(210, 70%, 50%)" },
      { id: "Single Factor", nodeColor: "hsl(0, 70%, 50%)" },
      { id: "MFA", nodeColor: "hsl(120, 70%, 50%)" },
      { id: "Phishable", nodeColor: "hsl(45, 70%, 50%)" },
      { id: "Phish Resistant", nodeColor: "hsl(150, 70%, 50%)" },
    ],
    links: [
      { source: "All Users", target: "Single Factor", value: auth_methods_summary.single_factor || 1 },
      { source: "All Users", target: "MFA", value: auth_methods_summary.mfa_registered || 1 },
      { source: "MFA", target: "Phishable", value: (auth_methods_summary.phone_auth + auth_methods_summary.authenticator_app) || 1 },
      { source: "MFA", target: "Phish Resistant", value: (auth_methods_summary.fido2 + auth_methods_summary.windows_hello) || 1 },
    ],
  };

  // Prepare pie data for device compliance
  const complianceData = [
    { id: "Compliant", label: "Compliant", value: metrics.compliant_devices || 0, color: "hsl(120, 70%, 50%)" },
    { id: "Non-compliant", label: "Non-compliant", value: Math.max((metrics.managed_devices - metrics.compliant_devices), 0) || 1, color: "hsl(0, 70%, 50%)" },
  ];

  // Prepare bar data for metrics
  const metricsBarData = [
    { metric: "Users", value: metrics.users, color: "#6366f1" },
    { metric: "Guests", value: metrics.guests, color: "#8b5cf6" },
    { metric: "Groups", value: metrics.groups, color: "#a855f7" },
    { metric: "Apps", value: metrics.apps, color: "#d946ef" },
    { metric: "Devices", value: metrics.devices, color: "#ec4899" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Zero Trust Overview</h1>
          {(usingMockData || !data?.data) && (
            <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
              Demo Mode
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            Last synced: {new Date(displayData.last_synced).toLocaleString()}
            {displayData.is_cached && " (cached)"}
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

      {/* Tenant Info Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <FaBuilding className="text-2xl text-indigo-600" />
          <div>
            <h2 className="text-xl font-semibold">{tenant.display_name || "ModZero Tenant"}</h2>
            <p className="text-sm text-gray-500">{tenant.primary_domain || "modzero.local"}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricTile icon={<FaUsers />} label="Users" value={metrics.users} color="indigo" />
          <MetricTile icon={<FaUserFriends />} label="Guests" value={metrics.guests} color="purple" />
          <MetricTile icon={<FaLayerGroup />} label="Groups" value={metrics.groups} color="pink" />
          <MetricTile icon={<FaAppStore />} label="Apps" value={metrics.apps} color="rose" />
          <MetricTile icon={<FaDesktop />} label="Devices" value={metrics.devices} color="orange" />
          <MetricTile icon={<FaShieldAlt />} label="Managed" value={metrics.managed_devices} color="green" />
        </div>
      </div>

      {/* Assessment Scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AssessmentScoreCard
          title="Identity Assessment"
          score={assessment_scores.identity.score}
          passed={assessment_scores.identity.tests_passed}
          total={assessment_scores.identity.total_tests}
          color="indigo"
        />
        <AssessmentScoreCard
          title="Device Assessment"
          score={assessment_scores.devices.score}
          passed={assessment_scores.devices.tests_passed}
          total={assessment_scores.devices.total_tests}
          color="emerald"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Authentication Methods Sankey */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">User Authentication Methods</h3>
          <div className="h-80">
            <ResponsiveSankey
              data={sankeyData}
              margin={{ top: 20, right: 160, bottom: 20, left: 20 }}
              align="justify"
              colors={{ scheme: "category10" }}
              nodeOpacity={1}
              nodeHoverOthersOpacity={0.35}
              nodeThickness={18}
              nodeSpacing={24}
              nodeBorderWidth={0}
              nodeBorderColor={{ from: "color", modifiers: [["darker", 0.8]] }}
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

        {/* Device Compliance Pie */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Device Compliance</h3>
          <div className="h-80">
            <ResponsivePie
              data={complianceData}
              margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
              innerRadius={0.5}
              padAngle={0.7}
              cornerRadius={3}
              activeOuterRadiusOffset={8}
              borderWidth={1}
              borderColor={{ from: "color", modifiers: [["darker", 0.2]] }}
              arcLinkLabelsSkipAngle={10}
              arcLinkLabelsTextColor="#333"
              arcLinkLabelsThickness={2}
              arcLinkLabelsColor={{ from: "color" }}
              arcLabelsSkipAngle={10}
              arcLabelsTextColor={{ from: "color", modifiers: [["darker", 2]] }}
              colors={{ scheme: "set2" }}
              legends={[
                {
                  anchor: "bottom",
                  direction: "row",
                  justify: false,
                  translateX: 0,
                  translateY: 56,
                  itemsSpacing: 0,
                  itemWidth: 100,
                  itemHeight: 18,
                  itemTextColor: "#999",
                  itemDirection: "left-to-right",
                  itemOpacity: 1,
                  symbolSize: 18,
                  symbolShape: "circle",
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Metrics Bar Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Resource Summary</h3>
        <div className="h-64">
          <ResponsiveBar
            data={metricsBarData}
            keys={["value"]}
            indexBy="metric"
            margin={{ top: 20, right: 30, bottom: 50, left: 60 }}
            padding={0.3}
            valueScale={{ type: "linear" }}
            indexScale={{ type: "band", round: true }}
            colors={{ scheme: "purple_blue" }}
            borderColor={{ from: "color", modifiers: [["darker", 1.6]] }}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
            }}
            labelSkipWidth={12}
            labelSkipHeight={12}
            labelTextColor={{ from: "color", modifiers: [["darker", 1.6]] }}
            animate={true}
          />
        </div>
      </div>
    </div>
  );
};

// Metric Tile Component
const MetricTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}> = ({ icon, label, value, color }) => {
  const colorClasses: Record<string, string> = {
    indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300",
    pink: "bg-pink-100 text-pink-600 dark:bg-pink-900 dark:text-pink-300",
    rose: "bg-rose-100 text-rose-600 dark:bg-rose-900 dark:text-rose-300",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300",
    green: "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300",
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
      <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
    </div>
  );
};

// Assessment Score Card Component
const AssessmentScoreCard: React.FC<{
  title: string;
  score: number;
  passed: number;
  total: number;
  color: string;
}> = ({ title, score, passed, total, color }) => {
  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-500";
    if (s >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getScoreIcon = (s: number) => {
    if (s >= 80) return <FaCheckCircle className="text-green-500" />;
    return <FaExclamationTriangle className="text-yellow-500" />;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        {getScoreIcon(score)}
      </div>
      <div className="flex items-center gap-6">
        {/* Circular Progress */}
        <div className="relative w-24 h-24">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-gray-200 dark:text-gray-700"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={`${score * 2.51} 251`}
              strokeLinecap="round"
              className={getScoreColor(score)}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</span>
          </div>
        </div>
        <div>
          <p className="text-sm text-gray-500">Tests Passed</p>
          <p className="text-2xl font-semibold">
            {passed}/{total}
          </p>
          <p className="text-sm text-gray-400">{((passed / total) * 100).toFixed(0)}% complete</p>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;