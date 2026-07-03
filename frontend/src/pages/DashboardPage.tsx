import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveBar } from "@nivo/bar";
import {
  FaShieldAlt,
  FaDesktop,
  FaUserShield,
  FaUsers,
  FaExclamationTriangle,
  FaCheckCircle,
  FaTimesCircle,
  FaCloud,
  FaClock,
  FaCircle,
} from "react-icons/fa";

import AccessControlOverviewPanel from "../components/AccessControlOverviewPanel";
import { useSocket } from "../hooks/useSocket";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DashStats {
  totalUsers: number;
  registeredDevices: number;
  devicesAtRisk: number;
  policiesEnforced: number;
  avgTrustScore: number | null;
  graphMode: "disabled" | "mock" | "real";
}

interface AccessLog {
  id: string;
  time: string;
  user: string;
  device: string;
  resource: string;
  final_score: number;
  required_score: number;
  decision: "ALLOW" | "DENY";
  reason: string;
}

type HealthStatus = "healthy" | "warning" | "error" | "unknown";

// ── Constants ──────────────────────────────────────────────────────────────────

const HEALTH_COLORS: Record<HealthStatus, string> = {
  healthy: "text-green-500",
  warning: "text-yellow-500",
  error:   "text-red-500",
  unknown: "text-gray-400",
};

const HEALTH_BG: Record<HealthStatus, string> = {
  healthy: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
  warning: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
  error:   "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
  unknown: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700",
};

const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  error:   "Error",
  unknown: "Unknown",
};


// ── Page ───────────────────────────────────────────────────────────────────────

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashStats>({
    totalUsers: 0,
    registeredDevices: 0,
    devicesAtRisk: 0,
    policiesEnforced: 0,
    avgTrustScore: null,
    graphMode: "mock",
  });
  const [trustDist, setTrustDist] = useState<Array<{ id: string; label: string; value: number; color: string }>>([]);
  const [moduleHealth, setModuleHealth] = useState<Record<string, HealthStatus>>({
    "Device Posture": "unknown",
    "Context Analysis": "unknown",
    "Trust Scoring Engine": "unknown",
    "Graph Integration": "unknown",
  });
  const [recentLogs, setRecentLogs] = useState<AccessLog[]>([]);
  const [trendData, setTrendData] = useState<{ day: string; Allow: number; Deny: number; Review: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  // Live refresh — posture.py emits "assessment_updated" (best-effort)
  // whenever a new DeviceTrustScore is persisted, so trust scores and
  // recent decisions here stay current without a manual reload.
  useSocket("assessment_updated", () => { fetchData(); });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, devicesRes, resourcesRes, trustRes, recentDecRes, allDecRes, graphStatusRes] =
        await Promise.allSettled([
          api.get("/users"),
          api.get("/devices"),
          api.get("/resources"),
          api.get("/trust/latest"),
          api.get("/audit/access-decisions?limit=5"),
          api.get("/audit/access-decisions?limit=200"),
          api.get("/graph/status"),
        ]);

      const userList: any[]     = usersRes.status     === "fulfilled" ? (Array.isArray(usersRes.value.data)     ? usersRes.value.data     : (usersRes.value.data.users     ?? [])) : [];
      const deviceList: any[]   = devicesRes.status   === "fulfilled" ? (Array.isArray(devicesRes.value.data)   ? devicesRes.value.data   : (devicesRes.value.data.devices  ?? [])) : [];
      const resourceList: Array<{ enabled?: boolean }> = resourcesRes.status === "fulfilled" ? (Array.isArray(resourcesRes.value.data) ? resourcesRes.value.data : (resourcesRes.value.data.resources ?? [])) : [];
      const latestTrust         = trustRes.status      === "fulfilled" ? trustRes.value.data      : null;

      // Graph mode from live /graph/status
      const graphStatus         = graphStatusRes.status === "fulfilled" ? graphStatusRes.value.data : null;
      const graphMode: "disabled" | "mock" | "real" =
        graphStatus?.token_ok   ? "real"     :
        graphStatus?.configured ? "mock"     : "disabled";

      // Recent access logs
      const rawLogs: any[] = recentDecRes.status === "fulfilled" ? recentDecRes.value.data : [];
      const deviceIdToName = Object.fromEntries(deviceList.map((d: any) => [d.device_id, d.hostname ?? null]));
      setRecentLogs(rawLogs.map((l: any) => ({
        id:             l.decision_id,
        time:           new Date(l.ts).toLocaleString(),
        user:           l.user_name ?? "—",
        device:         deviceIdToName[l.device_id] ?? (l.device_id ? `${String(l.device_id).slice(0, 8)}…` : "—"),
        resource:       l.resource_name ?? "—",
        final_score:    l.score    ?? 0,
        required_score: l.threshold ?? 0,
        decision:       ((l.decision ?? "deny") as string).toUpperCase() as "ALLOW" | "DENY",
        reason:         l.reason   ?? "—",
      })));

      // Access decision trend — last 7 days from real audit data
      const allDecs: any[] = allDecRes.status === "fulfilled" ? allDecRes.value.data : [];
      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return { dateStr: d.toISOString().split("T")[0], day: d.toLocaleDateString("en-US", { weekday: "short" }) };
      });
      setTrendData(last7.map(({ dateStr, day }) => {
        const dayItems = allDecs.filter((l: any) => l.ts && String(l.ts).startsWith(dateStr));
        return {
          day,
          Allow:  dayItems.filter((l: any) => l.decision === "allow").length,
          Deny:   dayItems.filter((l: any) => l.decision === "deny").length,
          Review: dayItems.filter((l: any) => l.category === "bootstrap_deny").length,
        };
      }));

      // Fetch real posture scores for all local devices
      const postureScores: number[] = [];
      await Promise.allSettled(
        deviceList.map(async (d: any) => {
          try {
            const r = await api.get(`/devices/${d.device_id}/posture`);
            if (r.data?.posture_score != null) postureScores.push(Number(r.data.posture_score));
          } catch { /* ignore */ }
        })
      );
      const atRisk = postureScores.filter(s => s < 60).length;
      const dist = deviceList.length > 0
        ? [
            { id: "critical", label: "Critical (0–40)",  value: postureScores.filter(s => s < 40).length,            color: "#ef4444" },
            { id: "warning",  label: "Warning (41–60)",  value: postureScores.filter(s => s >= 40 && s < 60).length, color: "#f59e0b" },
            { id: "moderate", label: "Moderate (61–80)", value: postureScores.filter(s => s >= 60 && s < 80).length, color: "#3b82f6" },
            { id: "healthy",  label: "Healthy (81–100)", value: postureScores.filter(s => s >= 80).length,           color: "#22c55e" },
          ]
        : [
            { id: "critical", label: "Critical (0–40)",  value: 0, color: "#ef4444" },
            { id: "warning",  label: "Warning (41–60)",  value: 0, color: "#f59e0b" },
            { id: "moderate", label: "Moderate (61–80)", value: 0, color: "#3b82f6" },
            { id: "healthy",  label: "Healthy (81–100)", value: 1, color: "#22c55e" },
          ];

      setTrustDist(dist);
      setStats({
        totalUsers:        userList.length,
        registeredDevices: deviceList.length,
        devicesAtRisk:     atRisk,
        policiesEnforced:  resourceList.filter(r => r.enabled !== false).length,
        avgTrustScore:     latestTrust?.total_score ?? null,
        graphMode,
      });
      setModuleHealth({
        "Device Posture":       devicesRes.status  === "fulfilled" ? "healthy" : "warning",
        "Context Analysis":     "healthy",
        "Trust Scoring Engine": trustRes.status    === "fulfilled" ? "healthy" : "warning",
        "Graph Integration":    graphMode === "real" ? "healthy" : graphMode === "mock" ? "warning" : "error",
      });
    } catch (err) {
      console.error("Dashboard data fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const graphBadge = {
    disabled: { label: "Graph: Disabled", cls: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" },
    mock:     { label: "Graph: Mock",     cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
    real:     { label: "Graph: Live",     cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  }[stats.graphMode];

  return (
    <div className="space-y-6 pb-12">

      {/* Core Module Quick-Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/users" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors group">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"><FaUserShield size={18} /></div>
            <h2 className="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Users &amp; Identity</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage users and view per-user identity signals from Azure AD.</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Active</span>
            {stats.totalUsers > 0 && <span className="text-xs text-gray-400">{stats.totalUsers} users</span>}
          </div>
        </Link>

        <Link to="/devices" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:border-purple-400 dark:hover:border-purple-500 transition-colors group">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"><FaDesktop size={18} /></div>
            <h2 className="font-semibold text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">Device Posture</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Device inventory, posture checks (compliance, encryption, OS), and trust score contribution.</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Active</span>
            {stats.registeredDevices > 0 && <span className="text-xs text-gray-400">{stats.registeredDevices} devices</span>}
          </div>
        </Link>

        <Link to="/zero-trust-policies" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:border-green-400 dark:hover:border-green-500 transition-colors group">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"><FaShieldAlt size={18} /></div>
            <h2 className="font-semibold text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">Trust Policies / Trust Scoring Engine</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Resource policies, device profiles, context rules, and trust score weights.</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Active</span>
            {stats.policiesEnforced > 0 && <span className="text-xs text-gray-400">{stats.policiesEnforced} resources</span>}
          </div>
        </Link>
      </div>

      {/* ZT Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Avg Trust Score"
          value={stats.avgTrustScore !== null ? stats.avgTrustScore.toFixed(1) : "—"}
          subtext={stats.avgTrustScore === null ? "No data yet" : stats.avgTrustScore >= 80 ? "Good standing" : stats.avgTrustScore >= 60 ? "Moderate" : "At risk"}
          color={stats.avgTrustScore === null ? "gray" : stats.avgTrustScore >= 80 ? "green" : stats.avgTrustScore >= 60 ? "yellow" : "red"}
          icon={<FaShieldAlt />}
        />
        <StatCard label="Total Users"         value={String(stats.totalUsers)}        subtext="Registered accounts"   color="indigo" icon={<FaUsers />} />
        <StatCard label="Registered Devices"  value={String(stats.registeredDevices)} subtext="Client-connected"      color="purple" icon={<FaDesktop />} />
        <StatCard
          label="Devices at Risk"
          value={String(stats.devicesAtRisk)}
          subtext="Score below 60"
          color={stats.devicesAtRisk > 0 ? "red" : "green"}
          icon={<FaExclamationTriangle />}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StatCard label="Policies Enforced" value={String(stats.policiesEnforced)} subtext="Active resource policies" color="blue" icon={<FaCheckCircle />} />
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
          <div className="p-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"><FaCloud size={18} /></div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">Graph Integration</p>
            <span className={`mt-1 inline-flex px-2.5 py-1 text-sm font-semibold rounded-full ${graphBadge.cls}`}>{graphBadge.label}</span>
          </div>
        </div>
      </div>

      {/* Access Overview */}
      <AccessControlOverviewPanel />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trust Score Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FaShieldAlt className="text-indigo-500" size={13} />
            Trust Score Distribution
          </h3>
          <div className="h-44">
            <ResponsivePie
              data={trustDist}
              margin={{ top: 10, right: 120, bottom: 10, left: 20 }}
              innerRadius={0.5}
              padAngle={2}
              cornerRadius={4}
              colors={trustDist.map(d => d.color)}
              enableArcLabels={false}
              enableArcLinkLabels={true}
              arcLinkLabel={d => `${d.value}`}
              arcLinkLabelsDiagonalLength={8}
              arcLinkLabelsStraightLength={12}
              arcLinkLabelsTextColor={{ from: "color" }}
              isInteractive={true}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {trustDist.map(b => (
              <div key={b.id} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{b.label}</span>
                <span className="text-xs font-semibold ml-auto text-gray-800 dark:text-white">{b.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Access Decision Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
            <FaCheckCircle className="text-green-500" size={13} />
            Access Decision Trend
          </h3>
          <p className="text-xs text-gray-400 mb-3">Last 7 days</p>
          <div className="h-44">
            <ResponsiveBar
              data={trendData}
              keys={["Allow", "Deny", "Review"]}
              indexBy="day"
              margin={{ top: 5, right: 80, bottom: 30, left: 35 }}
              padding={0.3}
              groupMode="stacked"
              colors={["#22c55e", "#ef4444", "#f59e0b"]}
              borderRadius={2}
              axisBottom={{ tickSize: 0 }}
              axisLeft={{ tickSize: 0 }}
              labelSkipWidth={20}
              labelTextColor="#fff"
              enableGridY={false}
              isInteractive={true}
              legends={[{
                dataFrom: "keys",
                anchor: "right",
                direction: "column",
                translateX: 75,
                translateY: 0,
                itemWidth: 70,
                itemHeight: 18,
                itemTextColor: "#9ca3af",
                symbolSize: 10,
                symbolShape: "circle",
              }]}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">Live data from audit log — last 200 access decisions.</p>
        </div>
      </div>

      {/* Module Health */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <FaCircle className="text-green-400" size={10} />
          Module Health
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(moduleHealth).map(([name, status]) => (
            <div key={name} className={`rounded-lg border p-3 ${HEALTH_BG[status]}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {status === "healthy" && <FaCheckCircle      className={HEALTH_COLORS[status]} size={12} />}
                {status === "warning" && <FaExclamationTriangle className={HEALTH_COLORS[status]} size={12} />}
                {status === "error"   && <FaTimesCircle      className={HEALTH_COLORS[status]} size={12} />}
                {status === "unknown" && <FaCircle           className={HEALTH_COLORS[status]} size={12} />}
                <span className={`text-xs font-semibold ${HEALTH_COLORS[status]}`}>{HEALTH_LABEL[status]}</span>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">{name}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Latest Access Logs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FaClock className="text-indigo-500" size={13} />
            Latest Access Logs
          </h3>
          <Link to="/logs" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">View all →</Link>
        </div>
        {recentLogs.length === 0
          ? <p className="text-sm text-gray-400 py-4 text-center">No access decisions recorded yet.</p>
          : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="pb-2 pr-3 font-medium">Time</th>
                <th className="pb-2 pr-3 font-medium">User</th>
                <th className="pb-2 pr-3 font-medium">Device</th>
                <th className="pb-2 pr-3 font-medium">Resource</th>
                <th className="pb-2 pr-3 font-medium text-right">Score</th>
                <th className="pb-2 pr-3 font-medium text-right">Required</th>
                <th className="pb-2 pr-3 font-medium">Decision</th>
                <th className="pb-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {recentLogs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">{log.time}</td>
                  <td className="py-2 pr-3 font-medium text-gray-800 dark:text-white">{log.user}</td>
                  <td className="py-2 pr-3 text-xs font-mono text-gray-500 dark:text-gray-400">{log.device}</td>
                  <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{log.resource}</td>
                  <td className="py-2 pr-3 font-semibold text-gray-900 dark:text-white text-right">{log.final_score.toFixed(1)}</td>
                  <td className="py-2 pr-3 text-gray-500 text-right">{log.required_score}</td>
                  <td className="py-2 pr-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-bold rounded-full ${
                      log.decision === "ALLOW"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}>{log.decision}</span>
                  </td>
                  <td className="py-2 text-xs text-gray-400 font-mono">{log.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          )}
      </div>


    </div>
  );
};

// ── StatCard ───────────────────────────────────────────────────────────────────

const COLOR_CLASSES: Record<string, string> = {
  green:  "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  red:    "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  yellow: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  blue:   "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  gray:   "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
};

const StatCard: React.FC<{
  label: string;
  value: string;
  subtext: string;
  color: keyof typeof COLOR_CLASSES;
  icon: React.ReactNode;
}> = ({ label, value, subtext, color, icon }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
    <div className="flex items-center gap-3">
      <div className={`p-2.5 rounded-lg flex-shrink-0 ${COLOR_CLASSES[color]}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
        <p className="text-xs text-gray-400">{subtext}</p>
      </div>
    </div>
  </div>
);

export default DashboardPage;
