import React, { useEffect, useState } from "react";
import {
  FaShieldAlt,
  FaServer,
  FaPlug,
  FaCheckCircle,
  FaTimesCircle,
  FaSyncAlt,
} from "react-icons/fa";
import api from "../api";

// Types match backend AccessDecisionOut / StatusOverviewOut
interface ResourceStatus {
  resource_id: string;
  name: string;
  slug: string | null;
  network_name: string | null;
  target: string | null;
  last_decision: string | null;
  last_decision_at: string | null;
  last_score: number | null;
  last_threshold: number | null;
}

interface ConnectorStatus {
  connector_id: string;
  name: string;
  status: string;
  last_heartbeat: string | null;
  online: boolean;
}

interface StatusOverview {
  generated_at: string;
  resources: ResourceStatus[];
  connectors: ConnectorStatus[];
  last_allow_at: string | null;
  last_deny_at: string | null;
  decisions_last_24h: Record<string, number>;
}

const fmtAgo = (iso: string | null): string => {
  if (!iso) return "never";
  const ts = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const Tile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "ok" | "warn" | "bad" | "neutral";
}> = ({ icon, label, value, hint, tone = "neutral" }) => {
  const toneRing = {
    ok: "border-green-300 dark:border-green-700",
    warn: "border-amber-300 dark:border-amber-700",
    bad: "border-red-300 dark:border-red-700",
    neutral: "border-gray-200 dark:border-gray-700",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 bg-white dark:bg-gray-800 ${toneRing}`}>
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-lg font-semibold text-gray-900 dark:text-white">{value}</div>
      {hint && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</div>
      )}
    </div>
  );
};

const AccessControlOverviewPanel: React.FC = () => {
  const [data, setData] = useState<StatusOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get<StatusOverview>("/audit/status-overview");
      setData(res.data);
      setErr(null);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || "failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 text-sm text-gray-500">
        Loading access-control state…
      </div>
    );
  }
  if (err) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 p-4 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
        Could not load access-control state: {err}
      </div>
    );
  }
  if (!data) return null;

  const counts = data.decisions_last_24h || {};
  const allowsToday = counts.allow ?? 0;
  const deniesToday = (counts.deny ?? 0) + (counts.bootstrap_deny ?? 0);
  const rateLimited = counts.rate_limit ?? 0;
  const proxyFailures = counts.proxy_failure ?? 0;

  const onlineConnectors = data.connectors.filter((c) => c.online).length;
  const totalConnectors = data.connectors.length;
  const connectorTone = totalConnectors === 0 ? "warn" : onlineConnectors === totalConnectors ? "ok" : "bad";
  // Pick a representative connector for the hint: prefer an online one, then
  // the freshest heartbeat. Avoids highlighting a stale legacy row when a
  // healthy connector is also registered.
  const featuredConnector = [...data.connectors].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return (b.last_heartbeat || "").localeCompare(a.last_heartbeat || "");
  })[0];

  const protectedCount = data.resources.filter((r) => r.slug).length;
  // Latest snapshot across all resources for the headline trust score.
  const latestSnap = data.resources
    .filter((r) => r.last_score !== null && r.last_decision_at)
    .sort((a, b) => (b.last_decision_at || "").localeCompare(a.last_decision_at || ""))[0];

  const lastAllow = data.last_allow_at;
  const lastDeny = data.last_deny_at;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FaShieldAlt className="text-indigo-600" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Access-Control State</h3>
        </div>
        <button
          onClick={load}
          className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 flex items-center gap-1"
          title="Refresh"
        >
          <FaSyncAlt /> refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <Tile
          icon={<FaShieldAlt />}
          label="Latest trust score"
          tone={
            latestSnap?.last_score == null
              ? "neutral"
              : latestSnap.last_score >= (latestSnap.last_threshold ?? 60)
              ? "ok"
              : "bad"
          }
          value={latestSnap?.last_score != null ? `${latestSnap.last_score}/100` : "—"}
          hint={
            latestSnap
              ? `${latestSnap.name} (≥ ${latestSnap.last_threshold ?? 60})`
              : "no posture submitted yet"
          }
        />
        <Tile
          icon={<FaCheckCircle />}
          label="Last access decision"
          tone={lastAllow && (!lastDeny || lastAllow >= lastDeny) ? "ok" : "bad"}
          value={
            lastAllow && (!lastDeny || lastAllow >= lastDeny)
              ? "ALLOW"
              : lastDeny
              ? "DENY"
              : "—"
          }
          hint={
            lastAllow && (!lastDeny || lastAllow >= lastDeny)
              ? `allowed ${fmtAgo(lastAllow)}`
              : lastDeny
              ? `denied ${fmtAgo(lastDeny)}`
              : "no decisions yet"
          }
        />
        <Tile
          icon={<FaServer />}
          label="Protected resources"
          tone={protectedCount > 0 ? "ok" : "warn"}
          value={`${protectedCount}`}
          hint={
            protectedCount > 0
              ? data.resources
                  .filter((r) => r.slug)
                  .map((r) => r.slug)
                  .join(", ")
              : "none registered"
          }
        />
        <Tile
          icon={<FaPlug />}
          label="Connectors"
          tone={connectorTone as any}
          value={`${onlineConnectors}/${totalConnectors} online`}
          hint={
            featuredConnector
              ? `${featuredConnector.name} ${
                  featuredConnector.online ? "✓" : "✗"
                } heartbeat ${fmtAgo(featuredConnector.last_heartbeat)}`
              : "no connectors"
          }
        />
        <Tile
          icon={<FaCheckCircle />}
          label="Last successful access"
          tone={lastAllow ? "ok" : "neutral"}
          value={fmtAgo(lastAllow)}
          hint={lastAllow ? new Date(lastAllow).toLocaleString() : "—"}
        />
        <Tile
          icon={<FaTimesCircle />}
          label="24h totals"
          tone={proxyFailures > 0 ? "bad" : rateLimited > 0 ? "warn" : "neutral"}
          value={`${allowsToday} allow · ${deniesToday} deny`}
          hint={`rate-limited ${rateLimited} · proxy errors ${proxyFailures}`}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="py-2 pr-4">Resource</th>
              <th className="py-2 pr-4">Slug</th>
              <th className="py-2 pr-4">Target</th>
              <th className="py-2 pr-4">Latest score</th>
              <th className="py-2 pr-4">Last decision</th>
            </tr>
          </thead>
          <tbody>
            {data.resources.map((r) => (
              <tr key={r.resource_id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 pr-4 text-gray-900 dark:text-white">{r.name}</td>
                <td className="py-2 pr-4 font-mono text-xs text-gray-600 dark:text-gray-300">
                  {r.slug ? `/r/${r.slug}` : "—"}
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                  {r.target || "—"}
                </td>
                <td className="py-2 pr-4">
                  {r.last_score != null ? (
                    <span
                      className={
                        r.last_score >= (r.last_threshold ?? 60)
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }
                    >
                      {r.last_score}/{r.last_threshold ?? 100}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {r.last_decision ? (
                    <span
                      className={
                        r.last_decision === "allow"
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }
                    >
                      {r.last_decision.toUpperCase()} · {fmtAgo(r.last_decision_at)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {data.resources.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-gray-500 text-sm">
                  No protected resources registered.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccessControlOverviewPanel;
