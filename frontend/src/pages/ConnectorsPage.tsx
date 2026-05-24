import React, { useState, useEffect, useCallback } from "react";
import {
  FaPlug,
  FaPlus,
  FaCopy,
  FaTrash,
  FaSync,
  FaCubes,
  FaCheck,
  FaTimes,
  FaCircle,
  FaDocker,
  FaLinux,
  FaNetworkWired,
  FaKey,
} from "react-icons/fa";
import toast from "react-hot-toast";
import api from "../api";
import { useSocket } from "../hooks/useSocket";

// ─── Types ──────────────────────────────────────────────────────────

interface Connector {
  connector_id: string;
  name: string;
  network: string;
  hostname: string | null;
  ip_address: string | null;
  version: string | null;
  status: "online" | "offline" | "degraded";
  labels: Record<string, string>;
  uptime: number;
  last_heartbeat: string | null;
  deployed_by: string;
  created_at: string;
  updated_at: string;
  resources_count: number;
}

interface EnrollToken {
  token_id: string;
  network: string;
  status: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

interface ConnectorResource {
  resource_id: string;
  connector_id: string | null;
  network: string;
  name: string;
  protocol: string;
  target_host: string;
  target_port: number;
  path_prefix: string;
  is_active: boolean;
  created_at: string;
}

interface TokenCreateResult {
  token_id: string;
  token: string;
  network: string;
  expires_at: string;
  docker_command: string;
  curl_command: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 10) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function statusColor(status: string): string {
  switch (status) {
    case "online": return "text-green-500";
    case "degraded": return "text-yellow-500";
    case "offline": return "text-red-500";
    default: return "text-gray-400";
  }
}

function statusBg(status: string): string {
  switch (status) {
    case "online": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "degraded": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "offline": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  }
}

// ─── Component ──────────────────────────────────────────────────────

const ConnectorsPage: React.FC = () => {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [tokens, setTokens] = useState<EnrollToken[]>([]);
  const [resources, setResources] = useState<ConnectorResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"connectors" | "tokens" | "resources">("connectors");

  // Token creation modal
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenNetwork, setTokenNetwork] = useState("default");
  const [tokenExpiry, setTokenExpiry] = useState(10);
  const [createdToken, setCreatedToken] = useState<TokenCreateResult | null>(null);
  const [deployTab, setDeployTab] = useState<"docker" | "linux">("docker");

  // Resource creation modal
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [resourceForm, setResourceForm] = useState({
    name: "",
    network: "default",
    protocol: "http",
    target_host: "",
    target_port: 80,
    path_prefix: "",
    connector_id: "",
  });

  const [usingDemoData] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch each data source independently so one failure doesn't block others
    try {
      const cRes = await api.get("/connectors");
      setConnectors(cRes.data);
    } catch {
      setConnectors([]);
      toast.error("Failed to load connectors");
    }

    try {
      const tRes = await api.get("/admin/connectors/tokens");
      setTokens(tRes.data);
    } catch {
      setTokens([]);
      toast.error("Failed to load enroll tokens");
    }

    try {
      const rRes = await api.get("/admin/connectors/resources");
      setResources(rRes.data);
    } catch {
      setResources([]);
      toast.error("Failed to load connector resources");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 15s
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Real-time connector status updates via Socket.IO
  useSocket<{ connector_id: string; status: string }>("connector_status", (data) => {
    setConnectors((prev) =>
      prev.map((c) =>
        c.connector_id === data.connector_id
          ? { ...c, status: data.status as Connector["status"] }
          : c
      )
    );
  });

  useSocket("connectors_changed", () => {
    fetchData();
  });

  const handleCreateToken = async () => {
    try {
      const res = await api.post("/admin/connectors/tokens", {
        network: tokenNetwork,
        expires_minutes: tokenExpiry,
      });
      setCreatedToken(res.data);
      toast.success("Enrollment token created");
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create token");
    }
  };

  const handleCreateResource = async () => {
    try {
      await api.post("/admin/connectors/resources", {
        ...resourceForm,
        connector_id: resourceForm.connector_id || undefined,
      });
      toast.success("Resource created");
      setShowResourceModal(false);
      setResourceForm({ name: "", network: "default", protocol: "http", target_host: "", target_port: 80, path_prefix: "", connector_id: "" });
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create resource");
    }
  };

  const handleDeleteConnector = async (id: string) => {
    if (!confirm("Delete this connector? This cannot be undone.")) return;
    try {
      await api.delete(`/admin/connectors/${id}`);
      toast.success("Connector deleted");
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to delete connector");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  // ─── Summary stats ────────────────────────────────────────────────

  const onlineCount = connectors.filter(c => c.status === "online").length;
  const offlineCount = connectors.filter(c => c.status === "offline").length;
  const degradedCount = connectors.filter(c => c.status === "degraded").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FaPlug className="text-indigo-500" /> Connectors
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage zero-trust connectors that proxy traffic to your internal resources
            {usingDemoData && <span className="ml-2 text-amber-600">• Using demo data</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            title="Refresh"
          >
            <FaSync className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => { setShowTokenModal(true); setCreatedToken(null); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <FaPlus /> Deploy Connector
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <FaPlug className="text-indigo-600 dark:text-indigo-400" size={18} />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{connectors.length}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Total Connectors</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <FaCircle className="text-green-500" size={18} />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{onlineCount}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Online</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <FaCircle className="text-yellow-500" size={18} />
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-500">{degradedCount}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Degraded</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <FaCircle className="text-red-500" size={18} />
            </div>
            <div>
              <div className="text-2xl font-bold text-red-500">{offlineCount}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Offline</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <FaNetworkWired className="text-blue-600 dark:text-blue-400" size={18} />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{new Set(connectors.map(c => c.network)).size}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Networks</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-1 w-fit">
        {(["connectors", "tokens", "resources"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? "bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            {tab === "connectors" && <FaPlug className="inline mr-1" />}
            {tab === "tokens" && <FaKey className="inline mr-1" />}
            {tab === "resources" && <FaCubes className="inline mr-1" />}
            {tab}
          </button>
        ))}
      </div>

      {/* Connectors tab */}
      {activeTab === "connectors" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {connectors.length === 0 ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400">
              <FaPlug className="mx-auto text-4xl mb-4 text-gray-300 dark:text-gray-600" />
              <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No connectors deployed yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 max-w-md mx-auto">
                Connectors are lightweight agents that run inside your remote networks to provide secure access to internal resources.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-6 max-w-md mx-auto">
                Deploy a connector using Docker or Linux to start protecting resources behind your network perimeter.
              </p>
              <button
                onClick={() => { setShowTokenModal(true); setCreatedToken(null); }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <FaPlus size={14} /> Deploy Your First Connector
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Network</th>
                  <th className="px-4 py-3 text-left">Hostname / IP</th>
                  <th className="px-4 py-3 text-left">Version</th>
                  <th className="px-4 py-3 text-left">Uptime</th>
                  <th className="px-4 py-3 text-left">Last Heartbeat</th>
                  <th className="px-4 py-3 text-left">Resources</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {connectors.map(c => (
                  <tr key={c.connector_id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${statusBg(c.status)}`}>
                        <FaCircle className={`text-[8px] ${statusColor(c.status)}`} />
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{c.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
                        <FaNetworkWired className="text-xs" /> {c.network}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-xs">
                      {c.hostname || "-"}{c.ip_address ? ` (${c.ip_address})` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono">{c.version || "-"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatUptime(c.uptime)}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{timeAgo(c.last_heartbeat)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.resources_count}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteConnector(c.connector_id)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                        title="Delete connector"
                      >
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tokens tab */}
      {activeTab === "tokens" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 className="font-medium text-gray-900 dark:text-white">Enrollment Tokens</h3>
            <button
              onClick={() => { setShowTokenModal(true); setCreatedToken(null); }}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"
            >
              <FaPlus /> New Token
            </button>
          </div>
          {tokens.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">No enrollment tokens created yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Token ID</th>
                  <th className="px-4 py-3 text-left">Network</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-left">Expires</th>
                  <th className="px-4 py-3 text-left">Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {tokens.map(t => (
                  <tr key={t.token_id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{t.token_id.slice(0, 8)}...</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{t.network}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                        t.status === "used" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                        "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{timeAgo(t.created_at)}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{new Date(t.expires_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{t.used_at ? timeAgo(t.used_at) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Resources tab */}
      {activeTab === "resources" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 className="font-medium text-gray-900 dark:text-white">Connector Resources</h3>
            <button
              onClick={() => setShowResourceModal(true)}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"
            >
              <FaPlus /> Add Resource
            </button>
          </div>
          {resources.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No resources configured yet. Add a resource to allow connectors to proxy traffic.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Network</th>
                  <th className="px-4 py-3 text-left">Protocol</th>
                  <th className="px-4 py-3 text-left">Target</th>
                  <th className="px-4 py-3 text-left">Path Prefix</th>
                  <th className="px-4 py-3 text-left">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {resources.map(r => (
                  <tr key={r.resource_id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.network}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs font-mono">
                        {r.protocol}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{r.target_host}:{r.target_port}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{r.path_prefix || "/"}</td>
                    <td className="px-4 py-3">
                      {r.is_active ? <FaCheck className="text-green-500" /> : <FaTimes className="text-red-500" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Token creation / Deploy modal */}
      {showTokenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FaPlug className="text-indigo-500" />
                {createdToken ? "Deploy Connector" : "Generate Enrollment Token"}
              </h2>
            </div>

            {!createdToken ? (
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Remote Network
                  </label>
                  <input
                    type="text"
                    value={tokenNetwork}
                    onChange={e => setTokenNetwork(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="default"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Expiry (minutes)
                  </label>
                  <input
                    type="number"
                    value={tokenExpiry}
                    onChange={e => setTokenExpiry(parseInt(e.target.value) || 10)}
                    min={1}
                    max={1440}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Token is one-time use and expires after this duration.</p>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={() => setShowTokenModal(false)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateToken}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Generate Token
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {/* Deploy method tabs */}
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                  <button
                    onClick={() => setDeployTab("docker")}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 ${
                      deployTab === "docker"
                        ? "bg-white dark:bg-gray-800 text-blue-600 shadow-sm"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    <FaDocker /> Docker
                  </button>
                  <button
                    onClick={() => setDeployTab("linux")}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 ${
                      deployTab === "linux"
                        ? "bg-white dark:bg-gray-800 text-orange-600 shadow-sm"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    <FaLinux /> Linux
                  </button>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      {deployTab === "docker" ? "Docker Run Command" : "curl | bash Command"}
                    </span>
                    <button
                      onClick={() => copyToClipboard(deployTab === "docker" ? createdToken.docker_command : createdToken.curl_command)}
                      className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center gap-1"
                    >
                      <FaCopy /> Copy
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-950 rounded p-3 overflow-x-auto">
                    {deployTab === "docker" ? createdToken.docker_command : createdToken.curl_command}
                  </pre>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Important:</strong> This token can only be used once and expires at{" "}
                    <strong>{new Date(createdToken.expires_at).toLocaleString()}</strong>.
                    Copy the command now — the token will not be shown again.
                  </p>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={() => { setShowTokenModal(false); setCreatedToken(null); }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resource creation modal */}
      {showResourceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FaCubes className="text-indigo-500" /> Add Resource
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Resource Name</label>
                <input
                  type="text"
                  value={resourceForm.name}
                  onChange={e => setResourceForm({ ...resourceForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g. Internal Wiki"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Network</label>
                  <input
                    type="text"
                    value={resourceForm.network}
                    onChange={e => setResourceForm({ ...resourceForm, network: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Protocol</label>
                  <select
                    value={resourceForm.protocol}
                    onChange={e => setResourceForm({ ...resourceForm, protocol: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="tcp">TCP (placeholder)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Host</label>
                  <input
                    type="text"
                    value={resourceForm.target_host}
                    onChange={e => setResourceForm({ ...resourceForm, target_host: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g. intranet or 10.0.1.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
                  <input
                    type="number"
                    value={resourceForm.target_port}
                    onChange={e => setResourceForm({ ...resourceForm, target_port: parseInt(e.target.value) || 80 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Path Prefix (optional)</label>
                <input
                  type="text"
                  value={resourceForm.path_prefix}
                  onChange={e => setResourceForm({ ...resourceForm, path_prefix: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g. /wiki"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Connector ID (optional, or assign by network)</label>
                <select
                  value={resourceForm.connector_id}
                  onChange={e => setResourceForm({ ...resourceForm, connector_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Auto (by network)</option>
                  {connectors.map(c => (
                    <option key={c.connector_id} value={c.connector_id}>{c.name} ({c.network})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setShowResourceModal(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateResource}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  disabled={!resourceForm.name || !resourceForm.target_host}
                >
                  Create Resource
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectorsPage;
