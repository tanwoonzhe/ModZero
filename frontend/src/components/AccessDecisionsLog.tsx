import React, { useEffect, useMemo, useState } from "react";
import { FaCheck, FaTimes, FaSyncAlt, FaSearch } from "react-icons/fa";
import api from "../api";

interface AccessLogRow {
  id: string;
  user_id: string;
  username: string | null;
  device_id: string | null;
  resource_id: string | null;
  resource_name: string | null;
  decision: string;
  reason: string | null;
  trust_score: number | null;
  timestamp: string;
  access_mode?: string | null;
  tunnel_ready?: boolean | null;
  tunnel_reason?: string | null;
  fallback_used?: boolean | null;
  require_tunnel_at_decision?: boolean | null;
}

const DECISION_META: Record<string, { label: string; bg: string; text: string; Icon: any }> = {
  allow: { label: "Allow", bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", Icon: FaCheck },
  deny:  { label: "Deny",  bg: "bg-red-100 dark:bg-red-900/30",   text: "text-red-700 dark:text-red-400",   Icon: FaTimes },
};

const ACCESS_MODE_META: Record<string, { label: string; cls: string }> = {
  http_proxy: { label: "HTTP",   cls: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200" },
  denied:     { label: "Denied", cls: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" },
};

const fmtTs = (iso: string) => new Date(iso).toLocaleString();

const AccessDecisionsLog: React.FC = () => {
  const [rows, setRows] = useState<AccessLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [decisionFilter, setDecisionFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<AccessLogRow[]>("/access/logs", { params: { limit: 200 } });
      setRows(res.data);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || "Failed to load access logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchesDecision = !decisionFilter || r.decision === decisionFilter;
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        (r.username || "").toLowerCase().includes(q) ||
        (r.resource_name || "").toLowerCase().includes(q) ||
        (r.reason || "").toLowerCase().includes(q);
      return matchesDecision && matchesSearch;
    });
  }, [rows, decisionFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { c[r.decision] = (c[r.decision] || 0) + 1; });
    return c;
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        {(["allow", "deny"] as const).map((k) => {
          const meta = DECISION_META[k];
          const active = decisionFilter === k;
          return (
            <button
              key={k}
              onClick={() => setDecisionFilter(active ? "" : k)}
              className={`rounded-xl border px-4 py-2 text-left transition min-w-[100px] ${
                active ? "border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900" : "border-gray-200 dark:border-gray-700"
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

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user, resource, reason…"
            className="pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <button
          onClick={load}
          className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 inline-flex items-center gap-2"
        >
          <FaSyncAlt size={12} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
        {(decisionFilter || search) && (
          <button
            onClick={() => { setDecisionFilter(""); setSearch(""); }}
            className="text-xs px-2 py-1 rounded text-gray-500 hover:text-gray-700"
          >
            clear
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
                <th className="px-4 py-3">Score / Required</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Mode</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = DECISION_META[r.decision] || DECISION_META.deny;
                return (
                  <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                      {fmtTs(r.timestamp)}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${meta.bg} ${meta.text}`}>
                        <meta.Icon size={10} /> {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-900 dark:text-white">
                      {r.username || <span className="text-gray-400 font-mono text-xs">{String(r.user_id).slice(0, 8)}…</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-900 dark:text-white">
                      {r.resource_name || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2 text-xs font-mono">
                      {r.trust_score != null ? (
                        <span className={r.trust_score >= 60 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                          {r.trust_score}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 max-w-xs truncate" title={r.reason || ""}>
                      {r.reason || "—"}
                    </td>
                    <td className="px-4 py-2">
                      {r.access_mode ? (() => {
                        const meta = ACCESS_MODE_META[r.access_mode];
                        if (!meta) return <span className="text-gray-400">—</span>;
                        return (
                          <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${meta.cls}`}>
                            {meta.label}
                          </span>
                        );
                      })() : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    No access logs match the current filters.
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
