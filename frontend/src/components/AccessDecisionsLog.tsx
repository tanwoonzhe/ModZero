import React, { useEffect, useMemo, useState } from "react";
import {
  FaCheck,
  FaTimes,
  FaExclamationTriangle,
  FaShieldAlt,
  FaSyncAlt,
  FaSearch,
} from "react-icons/fa";
import api from "../api";

interface AccessDecisionRow {
  decision_id: string;
  user_id: string | null;
  user_name: string | null;
  device_id: string | null;
  resource_id: string | null;
  resource_name: string | null;
  resource_slug: string | null;
  decision: string;
  category: string;
  reason: string | null;
  score: number | null;
  threshold: number | null;
  path: string | null;
  ts: string;
}

const CAT_META: Record<string, { label: string; bg: string; text: string; Icon: any }> = {
  allow: { label: "Allow", bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", Icon: FaCheck },
  deny: { label: "Deny", bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", Icon: FaTimes },
  rate_limit: { label: "Rate-limited", bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", Icon: FaExclamationTriangle },
  proxy_failure: { label: "Proxy error", bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", Icon: FaExclamationTriangle },
  bootstrap_deny: { label: "Bootstrap deny", bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", Icon: FaShieldAlt },
};

const fmtTs = (iso: string): string => new Date(iso).toLocaleString();

const AccessDecisionsLog: React.FC = () => {
  const [rows, setRows] = useState<AccessDecisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [category, setCategory] = useState<string>("");
  const [resourceId, setResourceId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 200 };
      if (category) params.category = category;
      if (resourceId) params.resource_id = resourceId;
      if (userId) params.user_id = userId;
      if (q) params.q = q;
      const res = await api.get<AccessDecisionRow[]>("/audit/access-decisions", { params });
      setRows(res.data);
      setErr(null);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || "failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Re-load when filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, resourceId, userId]);

  const resourceChoices = useMemo(() => {
    const byId: Record<string, string> = {};
    rows.forEach((r) => {
      if (r.resource_id && r.resource_name && !byId[r.resource_id]) {
        byId[r.resource_id] = r.resource_name;
      }
    });
    return Object.entries(byId);
  }, [rows]);

  const userChoices = useMemo(() => {
    const byId: Record<string, string> = {};
    rows.forEach((r) => {
      if (r.user_id && r.user_name && !byId[r.user_id]) byId[r.user_id] = r.user_name;
    });
    return Object.entries(byId);
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { c[r.category] = (c[r.category] || 0) + 1; });
    return c;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(["allow", "deny", "rate_limit", "proxy_failure", "bootstrap_deny"] as const).map((k) => {
          const meta = CAT_META[k];
          const active = category === k;
          return (
            <button
              key={k}
              onClick={() => setCategory(active ? "" : k)}
              className={`rounded-xl border px-3 py-2 text-left transition ${
                active
                  ? "border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900"
                  : "border-gray-200 dark:border-gray-700"
              } bg-white dark:bg-gray-800`}
            >
              <div className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>
                <meta.Icon size={10} /> {meta.label}
              </div>
              <div className="text-2xl font-semibold mt-1 text-gray-900 dark:text-white">{counts[k] || 0}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
            placeholder="search reason or path"
            className="pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <select
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="">All resources</option>
          {resourceChoices.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="">All users</option>
          {userChoices.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <button
          onClick={load}
          className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 inline-flex items-center gap-2"
        >
          <FaSyncAlt size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
        {(category || resourceId || userId || q) && (
          <button
            onClick={() => { setCategory(""); setResourceId(""); setUserId(""); setQ(""); }}
            className="text-xs px-2 py-1 rounded text-gray-500 hover:text-gray-700"
          >
            clear filters
          </button>
        )}
      </div>

      {err && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 text-sm">
          {err}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Decision</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3">Path</th>
                <th className="px-4 py-3">Score / threshold</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = CAT_META[r.category] || CAT_META.deny;
                return (
                  <tr key={r.decision_id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{fmtTs(r.ts)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>
                        <meta.Icon size={10} /> {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-900 dark:text-white">{r.user_name || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-2">
                      {r.resource_name ? (
                        <div>
                          <div className="text-gray-900 dark:text-white">{r.resource_name}</div>
                          {r.resource_slug && (
                            <div className="text-xs text-gray-500 font-mono">/r/{r.resource_slug}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-300">{r.path || "—"}</td>
                    <td className="px-4 py-2 text-xs">
                      {r.score != null
                        ? (
                          <span className={r.score >= (r.threshold ?? 60) ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                            {r.score}/{r.threshold ?? "—"}
                          </span>
                        )
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 max-w-[28rem] truncate" title={r.reason || ""}>
                      {r.reason || "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    No access decisions match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AccessDecisionsLog;
