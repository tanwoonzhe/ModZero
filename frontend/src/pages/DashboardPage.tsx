import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { OverviewAssessmentData } from "../types";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveRadialBar } from "@nivo/radial-bar";
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
  FaMobileAlt,
  FaUserShield,
  FaInfoCircle,
} from "react-icons/fa";
import toast from "react-hot-toast";

import TrustScoreCard from "../components/TrustScoreCard";
import AccessControlOverviewPanel from "../components/AccessControlOverviewPanel";

const chartColors = {
  primary: "#3b82f6",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#06b6d4",
  identity: "#3b82f6",
  devices: "#8b5cf6",
  data: "#06b6d4",
  passed: "#22c55e",
  failed: "#ef4444",
  blue: "#3b82f6",
  indigo: "#6366f1",
  purple: "#8b5cf6",
  pink: "#ec4899",
  orange: "#f97316",
  emerald: "#10b981",
  rose: "#f43f5e",
  teal: "#14b8a6",
  cyan: "#06b6d4",
};

const DashboardPage: React.FC = () => {
  const [data, setData] = useState<OverviewAssessmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get<OverviewAssessmentData>("/assessment/overview");
      setData(res.data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load assessment data");
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
      toast.success("Data refreshed successfully");
    } catch (error) {
      toast.error("Refresh failed");
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

  return (
    <div className="space-y-6 pb-12">
      {/* Core Modules Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/users" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors group">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              <FaUserShield size={18} />
            </div>
            <h2 className="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Users &amp; Identity</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage users and view per-user identity signals from Azure AD.</p>
          <div className="mt-3">
            <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Active</span>
          </div>
        </Link>
        <Link to="/devices" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:border-purple-400 dark:hover:border-purple-500 transition-colors group">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
              <FaDesktop size={18} />
            </div>
            <h2 className="font-semibold text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">Device Posture</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Device inventory, posture checks (compliance, encryption, OS), and trust score contribution.</p>
          <div className="mt-3">
            <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Active</span>
          </div>
        </Link>
        <Link to="/zero-trust-policies" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:border-green-400 dark:hover:border-green-500 transition-colors group">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
              <FaShieldAlt size={18} />
            </div>
            <h2 className="font-semibold text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">Trust Scoring Engine</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Resource policies, device profiles, context rules, and trust score weights.</p>
          <div className="mt-3">
            <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Active</span>
          </div>
        </Link>
      </div>

      {/* FYP Trust Score Card (current user + current device) */}
      <TrustScoreCard />

      {/* Live access-control state from /audit/status-overview */}
      <AccessControlOverviewPanel />

      {/* Admin context card */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <FaInfoCircle className="text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" size={16} />
          <p className="text-sm text-indigo-800 dark:text-indigo-200">
            <strong>Access requests are performed from the ModZero Client App.</strong>{' '}
            This dashboard only summarizes access-control state for administrators.
            Use the links below to manage resources, review audit logs, or adjust trust policies.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/resources"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-colors"
          >
            Resources
          </Link>
          <Link
            to="/logs"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-colors"
          >
            Access Logs
          </Link>
          <Link
            to="/zero-trust-policies"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-colors"
          >
            Trust Policies
          </Link>
        </div>
      </div>

      {/* Assessment data sections — only rendered when /assessment/overview is available */}
      {data?.data && (() => {
        const { tenant, metrics, assessment_scores } = data.data;

        const deviceCompliancePie = [
          { id: "Compliant", label: "Compliant", value: metrics.compliant_devices || 0, color: chartColors.success },
          { id: "Non-compliant", label: "Non-compliant", value: Math.max((metrics.managed_devices || 0) - (metrics.compliant_devices || 0), 0), color: chartColors.danger },
        ];

        const deviceOwnershipPie = [
          { id: "Corporate", label: "Corporate", value: Math.round((metrics.managed_devices || 0) * 0.81), color: chartColors.purple },
          { id: "Personal", label: "Personal", value: Math.round((metrics.managed_devices || 0) * 0.19), color: chartColors.cyan },
        ];

        const deviceSummaryBar = [
          { device: "Windows", count: Math.round((metrics.devices || 0) * 0.6) },
          { device: "macOS", count: Math.round((metrics.devices || 0) * 0.15) },
          { device: "iOS", count: Math.round((metrics.devices || 0) * 0.15) },
          { device: "Android", count: Math.round((metrics.devices || 0) * 0.08) },
          { device: "Linux", count: Math.round((metrics.devices || 0) * 0.02) },
        ];

        return (
          <>
            {/* Header Row - Tenant + Metrics + Assessment */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Tenant Card */}
              <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <FaBuilding className="text-indigo-600" />
                  <h2 className="font-semibold text-gray-900 dark:text-white">Tenant</h2>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-500">Name</p>
                    <p className="font-medium text-gray-900 dark:text-white">{tenant.display_name || "ModZero"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Tenant ID</p>
                    <p className="font-mono text-xs text-gray-600 dark:text-gray-400 break-all">{tenant.tenant_id || tenant.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Primary Domain</p>
                    <p className="text-sm text-indigo-600">{tenant.primary_domain}</p>
                  </div>
                </div>
              </div>

              {/* Metrics Cards */}
              <div className="lg:col-span-6 grid grid-cols-3 gap-3">
                <MetricCard icon={<FaUsers />} label="Users" value={metrics.users} color="indigo" />
                <MetricCard icon={<FaUserFriends />} label="Guests" value={metrics.guests} color="purple" />
                <MetricCard icon={<FaLayerGroup />} label="Groups" value={metrics.groups} color="pink" />
                <MetricCard icon={<FaAppStore />} label="Apps" value={metrics.apps} color="cyan" />
                <MetricCard icon={<FaDesktop />} label="Devices" value={metrics.devices} color="orange" />
                <MetricCard icon={<FaShieldAlt />} label="Managed" value={metrics.managed_devices} color="green" />
              </div>

              {/* Assessment Score Card with Radial Chart */}
              <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FaShieldAlt className="text-green-500" />
                    <h2 className="font-semibold text-gray-900 dark:text-white">Assessment</h2>
                  </div>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                    title="Refresh data"
                  >
                    <FaSync className={refreshing ? "animate-spin" : ""} size={14} />
                  </button>
                </div>
                <div className="flex gap-4">
                  <div className="flex flex-col gap-2">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Identity</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                        {assessment_scores.identity.tests_passed}/{assessment_scores.identity.total_tests}
                        <span className="text-xs text-gray-400 ml-1 font-normal">tests</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Devices</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                        {assessment_scores.devices.tests_passed}/{assessment_scores.devices.total_tests}
                        <span className="text-xs text-gray-400 ml-1 font-normal">tests</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 h-28">
                    <ResponsiveRadialBar
                      data={[
                        {
                          id: "Devices",
                          data: [{ x: "Devices", y: assessment_scores.devices.total_tests > 0
                            ? Math.round((assessment_scores.devices.tests_passed / assessment_scores.devices.total_tests) * 100)
                            : 0 }]
                        },
                        {
                          id: "Identity",
                          data: [{ x: "Identity", y: assessment_scores.identity.total_tests > 0
                            ? Math.round((assessment_scores.identity.tests_passed / assessment_scores.identity.total_tests) * 100)
                            : 0 }]
                        },
                      ]}
                      valueFormat=">-.0f"
                      maxValue={100}
                      startAngle={-90}
                      endAngle={270}
                      innerRadius={0.4}
                      padding={0.3}
                      cornerRadius={2}
                      colors={[chartColors.purple, chartColors.identity]}
                      tracksColor="rgba(0,0,0,0.1)"
                      enableRadialGrid={false}
                      enableCircularGrid={false}
                      radialAxisStart={null}
                      circularAxisOuter={null}
                      isInteractive={false}
                      motionConfig="gentle"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Last synced: {data.last_synced ? new Date(data.last_synced).toLocaleTimeString() : "Unknown"}
                </p>
              </div>
            </div>

            {/* Device Summary Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Device Summary Bar */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <FaDesktop className="text-indigo-600" />
                  <h3 className="font-semibold text-gray-900 dark:text-white">Device summary</h3>
                </div>
                <div className="h-48">
                  <ResponsiveBar
                    data={deviceSummaryBar}
                    keys={["count"]}
                    indexBy="device"
                    layout="horizontal"
                    margin={{ top: 10, right: 20, bottom: 30, left: 60 }}
                    padding={0.4}
                    colors={chartColors.primary}
                    borderRadius={4}
                    axisBottom={{ tickSize: 0 }}
                    axisLeft={{ tickSize: 0 }}
                    labelSkipWidth={30}
                    labelTextColor="#fff"
                    enableGridY={false}
                    isInteractive={true}
                  />
                </div>
                <div className="flex justify-between mt-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {metrics.devices > 0 ? Math.round((metrics.managed_devices / metrics.devices) * 100) : 0}%
                    </p>
                    <p className="text-xs text-gray-500">Managed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {100 - (metrics.devices > 0 ? Math.round((metrics.managed_devices / metrics.devices) * 100) : 0)}%
                    </p>
                    <p className="text-xs text-gray-500">Unmanaged</p>
                  </div>
                </div>
              </div>

              {/* Device Compliance Pie */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <FaCheckCircle className="text-green-600" />
                  <h3 className="font-semibold text-gray-900 dark:text-white">Device compliance</h3>
                </div>
                <div className="h-48">
                  <ResponsivePie
                    data={deviceCompliancePie}
                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    innerRadius={0.6}
                    padAngle={2}
                    cornerRadius={4}
                    colors={[chartColors.success, chartColors.danger]}
                    enableArcLabels={false}
                    enableArcLinkLabels={false}
                    isInteractive={true}
                  />
                </div>
                <div className="flex justify-around mt-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500"></span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">Compliant</span>
                    <span className="font-bold">
                      {metrics.managed_devices > 0 ? Math.round((metrics.compliant_devices / metrics.managed_devices) * 100) : 0}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">Non-compliant</span>
                    <span className="font-bold">
                      {metrics.managed_devices > 0 ? 100 - Math.round((metrics.compliant_devices / metrics.managed_devices) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Device Ownership Pie */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <FaMobileAlt className="text-purple-600" />
                  <h3 className="font-semibold text-gray-900 dark:text-white">Device ownership</h3>
                </div>
                <div className="h-48">
                  <ResponsivePie
                    data={deviceOwnershipPie}
                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    innerRadius={0.6}
                    padAngle={2}
                    cornerRadius={4}
                    colors={[chartColors.purple, chartColors.cyan]}
                    enableArcLabels={false}
                    enableArcLinkLabels={false}
                    isInteractive={true}
                  />
                </div>
                <div className="flex justify-around mt-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">Corporate</span>
                    <span className="font-bold">81%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-cyan-500"></span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">Personal</span>
                    <span className="font-bold">19%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <footer className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FaShieldAlt className="text-indigo-600" />
                    <span className="font-semibold text-gray-900 dark:text-white">Zero Trust Assessment</span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400">
                    An automated assessment tool that evaluates your Microsoft tenant's zero trust security posture.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white mb-2">Resources</p>
                  <ul className="space-y-1 text-gray-500 dark:text-gray-400">
                    <li><a href="#" className="hover:text-indigo-600">Zero Trust Assessment</a></li>
                    <li><a href="#" className="hover:text-indigo-600">Zero Trust Workshop</a></li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white mb-2">Support</p>
                  <ul className="space-y-1 text-gray-500 dark:text-gray-400">
                    <li><a href="#" className="hover:text-indigo-600">Share Feedback</a></li>
                    <li><a href="#" className="hover:text-indigo-600">Report Issues</a></li>
                  </ul>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between text-xs text-gray-400">
                <p>© 2026 ModZero. All rights reserved.</p>
                <p>Last synced: {data.last_synced ? new Date(data.last_synced).toLocaleString() : "Unknown"}</p>
              </div>
            </footer>
          </>
        );
      })()}
    </div>
  );
};

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}> = ({ icon, label, value, color }) => {
  const colorClasses: Record<string, string> = {
    indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    pink: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
    cyan: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{value.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
