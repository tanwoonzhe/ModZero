import React, { useEffect, useState } from "react";
import api from "../api";
import { IdentityAssessmentData, AssessmentCheck } from "../types";
import { ResponsiveSankey } from "@nivo/sankey";
import { ResponsivePie } from "@nivo/pie";
import {
  FaSync,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaSearch,
  FaFilter,
  FaUserShield,
  FaKey,
  FaShieldAlt,
  FaSignInAlt,
} from "react-icons/fa";
import toast from "react-hot-toast";

const IdentityPage: React.FC = () => {
  const [data, setData] = useState<IdentityAssessmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = async () => {
    try {
      const res = await api.get<IdentityAssessmentData>("/assessment/identity");
      setData(res.data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load identity assessment");
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
        params: { data_type: "identity_assessment" },
      });
      await fetchData();
      toast.success("Identity data refreshed");
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
        <p className="text-gray-500">No identity data available</p>
        <button
          onClick={handleRefresh}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Load Data
        </button>
      </div>
    );
  }

  const { auth_summary, risky_users, ca_policies, checks, sankey_data } = data.data;

  // Filter checks
  const filteredChecks = checks.filter((check) => {
    const matchesStatus = filterStatus === "all" || check.status === filterStatus;
    const matchesRisk = filterRisk === "all" || check.risk_level === filterRisk;
    const matchesSearch =
      searchTerm === "" ||
      check.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      check.category.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesRisk && matchesSearch;
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

  // Auth methods pie data
  const authMethodsPieData = [
    { id: "Phone", label: "Phone", value: auth_summary.phone_auth },
    { id: "Authenticator", label: "Authenticator App", value: auth_summary.authenticator_app },
    { id: "FIDO2", label: "FIDO2", value: auth_summary.fido2 },
    { id: "Windows Hello", label: "Windows Hello", value: auth_summary.windows_hello },
    { id: "Single Factor", label: "Password Only", value: auth_summary.single_factor },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Identity Assessment</h1>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<FaUserShield />}
          title="Total Users"
          value={auth_summary.total_users}
          color="indigo"
        />
        <SummaryCard
          icon={<FaKey />}
          title="MFA Registered"
          value={auth_summary.mfa_registered}
          subtitle={`${((auth_summary.mfa_registered / auth_summary.total_users) * 100).toFixed(0)}%`}
          color="green"
        />
        <SummaryCard
          icon={<FaShieldAlt />}
          title="Passwordless"
          value={auth_summary.passwordless}
          subtitle={`${((auth_summary.passwordless / auth_summary.total_users) * 100).toFixed(0)}%`}
          color="purple"
        />
        <SummaryCard
          icon={<FaExclamationTriangle />}
          title="Risky Users"
          value={risky_users.length}
          color={risky_users.length > 0 ? "red" : "green"}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Authentication Flow Sankey */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Authentication Methods Flow</h3>
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

        {/* Auth Methods Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Authentication Methods Distribution</h3>
          <div className="h-80">
            <ResponsivePie
              data={authMethodsPieData}
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
              colors={{ scheme: "paired" }}
              legends={[
                {
                  anchor: "bottom",
                  direction: "row",
                  justify: false,
                  translateX: 0,
                  translateY: 56,
                  itemsSpacing: 0,
                  itemWidth: 80,
                  itemHeight: 18,
                  itemTextColor: "#999",
                  symbolSize: 14,
                  symbolShape: "circle",
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Conditional Access Policies */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">
          Conditional Access Policies ({ca_policies.length})
        </h3>
        {ca_policies.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No Conditional Access policies found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Policy Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    State
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Grant Controls
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {ca_policies.slice(0, 10).map((policy: any, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 text-sm">{policy.displayName}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          policy.state === "enabled"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {policy.state}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {policy.grantControls?.builtInControls?.join(", ") || "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assessment Checks Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="text-lg font-semibold">Identity Security Checks</h3>
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
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
            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            >
              <option value="all">All Status</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="investigate">Investigate</option>
              <option value="planned">Planned</option>
            </select>
            {/* Risk Filter */}
            <select
              value={filterRisk}
              onChange={(e) => setFilterRisk(e.target.value)}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            >
              <option value="all">All Risk</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Check Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Risk
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Description
                </th>
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
    </div>
  );
};

// Summary Card Component
const SummaryCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: number;
  subtitle?: string;
  color: string;
}> = ({ icon, title, value, subtitle, color }) => {
  const colorClasses: Record<string, string> = {
    indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300",
    green: "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300",
    red: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300",
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
    planned: <FaSignInAlt className="text-blue-500 text-lg" />,
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

export default IdentityPage;
