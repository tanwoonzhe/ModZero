import React, { useEffect, useState, useCallback } from "react";
import { FaKey, FaSyncAlt, FaBan, FaCheckCircle, FaClock, FaTimesCircle } from "react-icons/fa";
import toast from "react-hot-toast";
import api from "../api";

interface AccessSession {
  id: string;
  user_id: string;
  device_id: string | null;
  resource_id: string | null;
  resource_name: string | null;
  connector_id: string | null;
  access_log_id: string | null;
  status: "active" | "expired" | "revoked";
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    active: {
      cls: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
      icon: <FaCheckCircle className="inline mr-1" />,
      label: "Active",
    },
    expired: {
      cls: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
      icon: <FaClock className="inline mr-1" />,
      label: "Expired",
    },
    revoked: {
      cls: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
      icon: <FaTimesCircle className="inline mr-1" />,
      label: "Revoked",
    },
  };
  const entry = map[status] ?? map.expired;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${entry.cls}`}>
      {entry.icon}{entry.label}
    </span>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return fmt(iso);
}

function shortId(id: string | null): string {
  if (!id) return "—";
  return id.slice(0, 8) + "…";
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<AccessSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<AccessSession[]>("/access/sessions?limit=200");
      setSessions(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await api.post(`/access/sessions/${id}/revoke`);
      toast.success("Session revoked");
      await fetchSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to revoke session");
    } finally {
      setRevoking(null);
    }
  };

  const filtered = sessions.filter((s) => {
    const matchesSearch =
      !search ||
      (s.resource_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      s.id.includes(search) ||
      (s.connector_id?.includes(search) ?? false);
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const counts = {
    active: sessions.filter((s) => s.status === "active").length,
    expired: sessions.filter((s) => s.status === "expired").length,
    revoked: sessions.filter((s) => s.status === "revoked").length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FaKey className="text-2xl text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Access Sessions</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Short-lived grants created when access requests are allowed
            </p>
          </div>
        </div>
        <button
          onClick={fetchSessions}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium"
        >
          <FaSyncAlt className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Active", count: counts.active, cls: "text-green-600" },
          { label: "Expired", count: counts.expired, cls: "text-gray-500" },
          { label: "Revoked", count: counts.revoked, cls: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className={`text-2xl font-bold ${s.cls}`}>{s.count}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Search by resource or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No sessions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {["Session ID", "Resource", "Connector ID", "Status", "Created", "Expires", "Last Introspected", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{shortId(s.id)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">
                      {s.resource_name ?? <span className="text-gray-400 italic">deleted</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{shortId(s.connector_id)}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmt(s.created_at)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmt(s.expires_at)}</td>
                    <td
                      className={`px-4 py-3 text-xs whitespace-nowrap ${s.last_used_at ? "text-indigo-500 dark:text-indigo-400 font-medium" : "text-gray-400"}`}
                      title={s.last_used_at ? fmt(s.last_used_at) : "Not yet introspected"}
                    >
                      {timeAgo(s.last_used_at)}
                    </td>
                    <td className="px-4 py-3">
                      {s.status === "active" && (
                        <button
                          onClick={() => handleRevoke(s.id)}
                          disabled={revoking === s.id}
                          className="flex items-center gap-1 px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 text-xs font-medium disabled:opacity-50"
                        >
                          <FaBan className="text-xs" />
                          {revoking === s.id ? "Revoking…" : "Revoke"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
