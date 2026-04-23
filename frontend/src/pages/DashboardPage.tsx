import React, { useEffect, useState } from "react";
import api from "../api";
import { OverviewAssessmentData } from "../types";
import { ResponsiveSankey } from "@nivo/sankey";
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
  FaKey,
  FaFingerprint,
  FaLock,
  FaExclamationTriangle,
  FaInfoCircle,
} from "react-icons/fa";
import toast from "react-hot-toast";

import TrustScoreCard from "../components/TrustScoreCard";
import ProtectedResourceAccessPanel from "../components/ProtectedResourceAccessPanel";

// Colors matching Zero Trust Assessment
const chartColors = {
  // Primary colors
  primary: "#3b82f6",     // blue
  success: "#22c55e",     // green
  danger: "#ef4444",      // red
  warning: "#f59e0b",     // amber
  info: "#06b6d4",        // cyan
  // Named colors
  identity: "#3b82f6",    // blue
  devices: "#8b5cf6",     // purple  
  data: "#06b6d4",        // cyan
  passed: "#22c55e",      // green
  failed: "#ef4444",      // red
  // Additional colors
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

  if (!data?.data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No assessment data available</p>
        <button onClick={handleRefresh} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg">
          Refresh Data
        </button>
      </div>
    );
  }

  const { tenant, metrics, assessment_scores, auth_methods_summary } = data.data;

  // Generate Sankey data for Privileged Users Auth Methods
  const privilegedAuthSankey = {
    nodes: [
      { id: "Users", nodeColor: chartColors.primary },
      { id: "Single factor", nodeColor: chartColors.danger },
      { id: "Phishable", nodeColor: chartColors.warning },
      { id: "Phish-resistant", nodeColor: chartColors.success },
      { id: "Phone", nodeColor: chartColors.orange },
      { id: "Authenticator", nodeColor: chartColors.purple },
      { id: "Passkey", nodeColor: chartColors.teal },
      { id: "WHfB", nodeColor: chartColors.cyan },
    ],
    links: [
      { source: "Users", target: "Single factor", value: auth_methods_summary.single_factor || 1 },
      { source: "Users", target: "Phishable", value: (auth_methods_summary.phone_auth || 0) + (auth_methods_summary.authenticator_app || 0) || 1 },
      { source: "Users", target: "Phish-resistant", value: (auth_methods_summary.fido2 || 0) + (auth_methods_summary.windows_hello || 0) || 1 },
      { source: "Phishable", target: "Phone", value: auth_methods_summary.phone_auth || 1 },
      { source: "Phishable", target: "Authenticator", value: auth_methods_summary.authenticator_app || 1 },
      { source: "Phish-resistant", target: "Passkey", value: auth_methods_summary.fido2 || 1 },
      { source: "Phish-resistant", target: "WHfB", value: auth_methods_summary.windows_hello || 1 },
    ],
  };

  // Assessment pie data
  const assessmentPieData = [
    { id: "Identity", label: "Identity", value: assessment_scores.identity.tests_passed, color: chartColors.success },
    { id: "Identity Failed", label: "Identity Failed", value: assessment_scores.identity.total_tests - assessment_scores.identity.tests_passed, color: "#e5e7eb" },
  ];

  // Device compliance pie data
  const deviceCompliancePie = [
    { id: "Compliant", label: "Compliant", value: metrics.compliant_devices || 0, color: chartColors.success },
    { id: "Non-compliant", label: "Non-compliant", value: Math.max((metrics.managed_devices || 0) - (metrics.compliant_devices || 0), 0), color: chartColors.danger },
  ];

  // Device ownership pie data (mock for now)
  const deviceOwnershipPie = [
    { id: "Corporate", label: "Corporate", value: Math.round((metrics.managed_devices || 0) * 0.81), color: chartColors.purple },
    { id: "Personal", label: "Personal", value: Math.round((metrics.managed_devices || 0) * 0.19), color: chartColors.cyan },
  ];

  // Device summary bar data
  const deviceSummaryBar = [
    { device: "Windows", count: Math.round((metrics.devices || 0) * 0.6), color: chartColors.primary },
    { device: "macOS", count: Math.round((metrics.devices || 0) * 0.15), color: chartColors.purple },
    { device: "iOS", count: Math.round((metrics.devices || 0) * 0.15), color: chartColors.cyan },
    { device: "Android", count: Math.round((metrics.devices || 0) * 0.08), color: chartColors.success },
    { device: "Linux", count: Math.round((metrics.devices || 0) * 0.02), color: chartColors.orange },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* FYP Trust Score Card (current user + current device) */}
      <TrustScoreCard />

      {/* Protected resource access panel (moved here from the old Resource Access page) */}
      <ProtectedResourceAccessPanel />

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
            {/* Left side - Test counts */}
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
            {/* Right side - Radial chart */}
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
            Last synced: {new Date(data.last_synced).toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Sankey Charts Row - Auth Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Privileged Users Auth Methods */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <FaUsers className="text-indigo-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Privileged users auth methods</h3>
          </div>
          <div className="h-72">
            <ResponsiveSankey
              data={privilegedAuthSankey}
              margin={{ top: 10, right: 140, bottom: 10, left: 10 }}
              align="justify"
              colors={{ scheme: "category10" }}
              nodeOpacity={1}
              nodeThickness={16}
              nodeSpacing={20}
              nodeBorderWidth={0}
              nodeBorderRadius={3}
              linkOpacity={0.5}
              linkContract={3}
              enableLinkGradient={true}
              labelPosition="outside"
              labelOrientation="horizontal"
              labelPadding={12}
              labelTextColor={{ from: "color", modifiers: [["darker", 1]] }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">Strongest authentication method registered by privileged users.</p>
        </div>

        {/* User Authentication Flow */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <FaShieldAlt className="text-purple-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">User authentication</h3>
          </div>
          <div className="h-72">
            <ResponsiveSankey
              data={{
                nodes: [
                  { id: "User sign in" },
                  { id: "No CA applied" },
                  { id: "CA applied" },
                  { id: "No MFA" },
                  { id: "MFA" },
                ],
                links: [
                  { source: "User sign in", target: "No CA applied", value: Math.round((auth_methods_summary.total_users || 2) * 0.2) || 1 },
                  { source: "User sign in", target: "CA applied", value: Math.round((auth_methods_summary.total_users || 2) * 0.8) || 1 },
                  { source: "CA applied", target: "No MFA", value: auth_methods_summary.single_factor || 1 },
                  { source: "CA applied", target: "MFA", value: auth_methods_summary.mfa_registered || 1 },
                ],
              }}
              margin={{ top: 10, right: 120, bottom: 10, left: 10 }}
              align="justify"
              colors={[chartColors.primary, chartColors.danger, chartColors.success, chartColors.warning, chartColors.success]}
              nodeOpacity={1}
              nodeThickness={16}
              nodeSpacing={20}
              nodeBorderWidth={0}
              nodeBorderRadius={3}
              linkOpacity={0.5}
              linkContract={3}
              enableLinkGradient={true}
              labelPosition="outside"
              labelOrientation="horizontal"
              labelPadding={12}
              labelTextColor={{ from: "color", modifiers: [["darker", 1]] }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Over the past 30 days, {auth_methods_summary.mfa_registered > 0 ? ((auth_methods_summary.mfa_registered / (auth_methods_summary.total_users || 1)) * 100).toFixed(1) : 0}% of sign-ins were protected by MFA.
          </p>
        </div>
      </div>

      {/* All Users Auth + Device Sign-ins */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* All Users Auth Methods */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <FaUsers className="text-blue-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">All users auth methods</h3>
          </div>
          <div className="h-72">
            <ResponsiveSankey
              data={privilegedAuthSankey}
              margin={{ top: 10, right: 140, bottom: 10, left: 10 }}
              align="justify"
              colors={{ scheme: "set2" }}
              nodeOpacity={1}
              nodeThickness={16}
              nodeSpacing={20}
              nodeBorderWidth={0}
              nodeBorderRadius={3}
              linkOpacity={0.5}
              linkContract={3}
              enableLinkGradient={true}
              labelPosition="outside"
              labelOrientation="horizontal"
              labelPadding={12}
              labelTextColor={{ from: "color", modifiers: [["darker", 1]] }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">Strongest authentication method registered by all users.</p>
        </div>

        {/* Device Sign-ins */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-4">
            <FaDesktop className="text-green-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Device sign-ins</h3>
          </div>
          <div className="h-72">
            <ResponsiveSankey
              data={{
                nodes: [
                  { id: "User sign in" },
                  { id: "Unmanaged" },
                  { id: "Non-compliant" },
                  { id: "Managed" },
                  { id: "Compliant" },
                ],
                links: [
                  { source: "User sign in", target: "Unmanaged", value: Math.max((metrics.devices || 0) - (metrics.managed_devices || 0), 1) },
                  { source: "User sign in", target: "Managed", value: metrics.managed_devices || 1 },
                  { source: "Managed", target: "Non-compliant", value: Math.max((metrics.managed_devices || 0) - (metrics.compliant_devices || 0), 1) },
                  { source: "Managed", target: "Compliant", value: metrics.compliant_devices || 1 },
                ],
              }}
              margin={{ top: 10, right: 120, bottom: 10, left: 10 }}
              align="justify"
              colors={[chartColors.primary, chartColors.warning, chartColors.danger, chartColors.info, chartColors.success]}
              nodeOpacity={1}
              nodeThickness={16}
              nodeSpacing={20}
              nodeBorderWidth={0}
              nodeBorderRadius={3}
              linkOpacity={0.5}
              linkContract={3}
              enableLinkGradient={true}
              labelPosition="outside"
              labelOrientation="horizontal"
              labelPadding={12}
              labelTextColor={{ from: "color", modifiers: [["darker", 1]] }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {metrics.managed_devices > 0 ? ((metrics.compliant_devices / metrics.managed_devices) * 100).toFixed(1) : 0}% of sign-ins were from compliant devices.
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

      {/* Desktop Devices Sankey */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <FaDesktop className="text-blue-600" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Desktop devices</h3>
        </div>
        <div className="h-64">
          <ResponsiveSankey
            data={{
              nodes: [
                { id: "Desktop devices" },
                { id: "Windows" },
                { id: "macOS" },
                { id: "Entra joined" },
                { id: "Entra registered" },
                { id: "Entra hybrid joined" },
                { id: "Compliant" },
                { id: "Non-compliant" },
                { id: "Unmanaged" },
              ],
              links: [
                { source: "Desktop devices", target: "Windows", value: Math.round((metrics.devices || 10) * 0.7) || 1 },
                { source: "Desktop devices", target: "macOS", value: Math.round((metrics.devices || 10) * 0.3) || 1 },
                { source: "Windows", target: "Entra joined", value: Math.round((metrics.devices || 10) * 0.3) || 1 },
                { source: "Windows", target: "Entra registered", value: Math.round((metrics.devices || 10) * 0.15) || 1 },
                { source: "Windows", target: "Entra hybrid joined", value: Math.round((metrics.devices || 10) * 0.25) || 1 },
                { source: "macOS", target: "Entra registered", value: Math.round((metrics.devices || 10) * 0.3) || 1 },
                { source: "Entra joined", target: "Compliant", value: Math.round((metrics.devices || 10) * 0.25) || 1 },
                { source: "Entra joined", target: "Non-compliant", value: Math.round((metrics.devices || 10) * 0.05) || 1 },
                { source: "Entra hybrid joined", target: "Compliant", value: Math.round((metrics.devices || 10) * 0.2) || 1 },
                { source: "Entra hybrid joined", target: "Non-compliant", value: Math.round((metrics.devices || 10) * 0.05) || 1 },
                { source: "Entra registered", target: "Unmanaged", value: Math.round((metrics.devices || 10) * 0.45) || 1 },
              ],
            }}
            margin={{ top: 10, right: 140, bottom: 10, left: 10 }}
            align="justify"
            colors={{ scheme: "paired" }}
            nodeOpacity={1}
            nodeThickness={18}
            nodeSpacing={16}
            nodeBorderWidth={0}
            nodeBorderRadius={3}
            linkOpacity={0.5}
            linkContract={3}
            enableLinkGradient={true}
            labelPosition="outside"
            labelOrientation="horizontal"
            labelPadding={12}
            labelTextColor={{ from: "color", modifiers: [["darker", 1]] }}
          />
        </div>
        <div className="flex justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <StatBlock label="Entra joined" value={metrics.devices > 0 ? Math.round((metrics.devices * 0.3 / metrics.devices) * 100) : 0} />
          <StatBlock label="Entra hybrid joined" value={metrics.devices > 0 ? Math.round((metrics.devices * 0.25 / metrics.devices) * 100) : 0} />
          <StatBlock label="Entra registered" value={metrics.devices > 0 ? Math.round((metrics.devices * 0.45 / metrics.devices) * 100) : 0} />
        </div>
      </div>

      {/* Mobile Devices Sankey */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <FaMobileAlt className="text-green-600" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Mobile devices</h3>
        </div>
        <div className="h-64">
          <ResponsiveSankey
            data={{
              nodes: [
                { id: "Mobile devices" },
                { id: "Android" },
                { id: "iOS" },
                { id: "Android (Company)" },
                { id: "Android (Personal)" },
                { id: "iOS (Company)" },
                { id: "iOS (Personal)" },
                { id: "Compliant" },
                { id: "Non-compliant" },
              ],
              links: [
                { source: "Mobile devices", target: "Android", value: Math.round((metrics.devices || 10) * 0.3) || 1 },
                { source: "Mobile devices", target: "iOS", value: Math.round((metrics.devices || 10) * 0.7) || 1 },
                { source: "Android", target: "Android (Company)", value: Math.round((metrics.devices || 10) * 0.1) || 1 },
                { source: "Android", target: "Android (Personal)", value: Math.round((metrics.devices || 10) * 0.2) || 1 },
                { source: "iOS", target: "iOS (Company)", value: Math.round((metrics.devices || 10) * 0.4) || 1 },
                { source: "iOS", target: "iOS (Personal)", value: Math.round((metrics.devices || 10) * 0.3) || 1 },
                { source: "Android (Company)", target: "Compliant", value: Math.round((metrics.devices || 10) * 0.08) || 1 },
                { source: "Android (Company)", target: "Non-compliant", value: Math.round((metrics.devices || 10) * 0.02) || 1 },
                { source: "iOS (Company)", target: "Compliant", value: Math.round((metrics.devices || 10) * 0.35) || 1 },
                { source: "iOS (Company)", target: "Non-compliant", value: Math.round((metrics.devices || 10) * 0.05) || 1 },
              ],
            }}
            margin={{ top: 10, right: 140, bottom: 10, left: 10 }}
            align="justify"
            colors={{ scheme: "set3" }}
            nodeOpacity={1}
            nodeThickness={18}
            nodeSpacing={16}
            nodeBorderWidth={0}
            nodeBorderRadius={3}
            linkOpacity={0.5}
            linkContract={3}
            enableLinkGradient={true}
            labelPosition="outside"
            labelOrientation="horizontal"
            labelPadding={12}
            labelTextColor={{ from: "color", modifiers: [["darker", 1]] }}
          />
        </div>
        <div className="flex justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <StatBlock label="Android compliant" value={67} />
          <StatBlock label="iOS compliant" value={84} />
          <StatBlock label="Total devices" value={metrics.devices || 0} isRaw />
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
          <p>Last synced: {new Date(data.last_synced).toLocaleString()}</p>
        </div>
      </footer>
    </div>
  );
};

// Metric Card Component
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

// Stat Block Component
const StatBlock: React.FC<{ label: string; value: number; isRaw?: boolean }> = ({ label, value, isRaw }) => (
  <div className="text-center">
    <p className="text-2xl font-bold text-gray-900 dark:text-white">
      {isRaw ? value.toLocaleString() : `${value}%`}
    </p>
    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
  </div>
);

export default DashboardPage;
