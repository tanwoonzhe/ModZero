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
  FaGlobe,
  FaSearch,
  FaPencilAlt,
  FaLock,
  FaBan,
  FaCheckCircle,
  FaClock,
  FaTimesCircle,
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

interface ConnectorRoute {
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

interface ProtectedResource {
  id: string;
  name: string;
  description: string | null;
  resource_type: string;
  internal_address: string | null;
  public_name: string | null;
  required_group: string | null;
  minimum_trust_score: number;
  require_intune_compliant: boolean;
  require_entra_linked: boolean;
  enabled: boolean;
  connector_resource_id: string | null;
  connector_status: "online" | "degraded" | "offline" | null;
  preferred_access_mode?: "auto" | "http_proxy" | "wireguard_tunnel" | null;
  require_tunnel?: boolean | null;
  allow_http_fallback?: boolean | null;
  created_at: string;
  updated_at: string;
}

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

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
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

function ConnectorStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>;
  const map: Record<string, { cls: string; dot: string; label: string }> = {
    online:   { cls: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",   dot: "text-green-500",  label: "Online"   },
    degraded: { cls: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400", dot: "text-yellow-500", label: "Degraded" },
    offline:  { cls: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",           dot: "text-red-500",    label: "Offline"  },
  };
  const m = map[status] ?? map.offline;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${m.cls}`}>
      <FaCircle size={6} className={m.dot} /> {m.label}
    </span>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    active:  { cls: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",  icon: <FaCheckCircle className="inline mr-1" />, label: "Active" },
    expired: { cls: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",         icon: <FaClock className="inline mr-1" />,       label: "Expired" },
    revoked: { cls: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",          icon: <FaTimesCircle className="inline mr-1" />, label: "Revoked" },
  };
  const entry = map[status] ?? map.expired;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${entry.cls}`}>
      {entry.icon}{entry.label}
    </span>
  );
}

const RESOURCE_TYPES = ["web", "ssh", "rdp", "database", "api"];

const BLANK_RESOURCE = {
  name: "", description: "", resource_type: "web",
  internal_address: "", public_name: "",
  required_group: "", minimum_trust_score: 0,
  require_intune_compliant: false, require_entra_linked: false, enabled: true,
  connector_resource_id: "",
  preferred_access_mode: "auto" as "auto" | "http_proxy" | "wireguard_tunnel",
  require_tunnel: false, allow_http_fallback: true,
};

const ACCESS_MODE_LABELS: Record<string, string> = {
  auto: "Auto (tunnel when available, else HTTP proxy)",
  http_proxy: "HTTP proxy only",
  wireguard_tunnel: "WireGuard tunnel only",
};

// ─── Resource Form Modal ─────────────────────────────────────────────

const ResourceFormModal: React.FC<{
  initial?: ProtectedResource;
  connectorRoutes: ConnectorRoute[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ initial, connectorRoutes, onClose, onSaved }) => {
  const [form, setForm] = useState({
    ...BLANK_RESOURCE,
    ...initial,
    connector_resource_id: initial?.connector_resource_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!initial;

  const set = (field: string, value: unknown) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      description: form.description || null,
      resource_type: form.resource_type,
      internal_address: form.internal_address || null,
      public_name: form.public_name || null,
      required_group: form.required_group || null,
      minimum_trust_score: Number(form.minimum_trust_score),
      require_intune_compliant: form.require_intune_compliant,
      require_entra_linked: form.require_entra_linked,
      enabled: form.enabled,
      connector_resource_id: form.connector_resource_id || null,
      preferred_access_mode: form.preferred_access_mode,
      require_tunnel: form.require_tunnel,
      allow_http_fallback: form.allow_http_fallback,
    };
    try {
      if (isEdit) {
        await api.put(`/resources/${initial!.id}`, payload);
      } else {
        await api.post("/resources", payload);
      }
      await onSaved();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {isEdit ? "Edit Resource" : "Add Resource"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <FaTimes size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
            <input
              required value={form.name} onChange={(e) => set("name", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., AlphaTechs Intranet"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <input
              value={form.description} onChange={(e) => set("description", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select
                value={form.resource_type} onChange={(e) => set("resource_type", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              >
                {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Min Trust Score</label>
              <input
                type="number" min={0} max={100} value={form.minimum_trust_score}
                onChange={(e) => set("minimum_trust_score", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Public Name</label>
            <input
              value={form.public_name} onChange={(e) => set("public_name", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., intranet.alphatechs.top"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Internal Address</label>
            <input
              value={form.internal_address} onChange={(e) => set("internal_address", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., http://alphatechs.top"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <FaPlug className="inline mr-1 text-indigo-400" size={11} />
              Connector Route
            </label>
            <select
              value={form.connector_resource_id}
              onChange={(e) => set("connector_resource_id", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">None (no connector required)</option>
              {connectorRoutes.map((cr) => (
                <option key={cr.resource_id} value={cr.resource_id}>
                  {cr.name} — {cr.target_host}:{cr.target_port} ({cr.network})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              When set, access is denied if the connector is offline or degraded.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferred Access Mode</label>
            <select
              value={form.preferred_access_mode}
              onChange={(e) => set("preferred_access_mode", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
            >
              {Object.entries(ACCESS_MODE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Controls how an allowed session reaches this resource: through the connector's HTTP proxy, a WireGuard tunnel, or whichever is ready.
            </p>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none" title="Deny access outright if a WireGuard tunnel isn't ready and fallback isn't allowed, instead of silently falling back to HTTP proxy">
              <input
                type="checkbox" checked={form.require_tunnel}
                onChange={(e) => set("require_tunnel", e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Require Tunnel</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none" title="If the tunnel isn't ready, allow falling back to the HTTP proxy instead of denying access">
              <input
                type="checkbox" checked={form.allow_http_fallback}
                onChange={(e) => set("allow_http_fallback", e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Allow HTTP Fallback</span>
            </label>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Enabled</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox" checked={form.require_intune_compliant}
                onChange={(e) => set("require_intune_compliant", e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Require Intune</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none" title="Deny access if the requesting user has no linked Entra account">
              <input
                type="checkbox" checked={form.require_entra_linked}
                onChange={(e) => set("require_entra_linked", e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Require Entra Identity</span>
            </label>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : isEdit ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Component ──────────────────────────────────────────────────────

const ConnectorsPage: React.FC = () => {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [tokens, setTokens] = useState<EnrollToken[]>([]);
  const [routes, setRoutes] = useState<ConnectorRoute[]>([]);
  const [protectedResources, setProtectedResources] = useState<ProtectedResource[]>([]);
  const [sessions, setSessions] = useState<AccessSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"connectors" | "tokens" | "routes" | "resources" | "sessions">("connectors");

  // Token creation modal
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenNetwork, setTokenNetwork] = useState("default");
  const [tokenExpiry, setTokenExpiry] = useState(10);
  const [createdToken, setCreatedToken] = useState<TokenCreateResult | null>(null);
  const [deployTab, setDeployTab] = useState<"docker" | "linux">("docker");

  // Route creation modal
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [routeForm, setRouteForm] = useState({
    name: "",
    network: "default",
    protocol: "http",
    target_host: "",
    target_port: 80,
    path_prefix: "",
    connector_id: "",
  });

  // Resource CRUD
  const [showCreateResource, setShowCreateResource] = useState(false);
  const [editingResource, setEditingResource] = useState<ProtectedResource | null>(null);
  const [resourceSearch, setResourceSearch] = useState("");

  // Sessions
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionStatusFilter, setSessionStatusFilter] = useState<string>("all");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);

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
    }

    try {
      const rRes = await api.get("/admin/connectors/resources");
      setRoutes(rRes.data);
    } catch {
      setRoutes([]);
    }

    try {
      const prRes = await api.get<ProtectedResource[]>("/resources");
      setProtectedResources(prRes.data);
    } catch {
      setProtectedResources([]);
    }

    setLoading(false);
  }, []);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await api.get<AccessSession[]>("/access/sessions?limit=200");
      setSessions(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to load sessions");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchSessions();
    const interval = setInterval(fetchData, 15000);
    const sessionInterval = setInterval(fetchSessions, 30_000);
    return () => { clearInterval(interval); clearInterval(sessionInterval); };
  }, [fetchData, fetchSessions]);

  useSocket<{ connector_id: string; status: string }>("connector_status", (data) => {
    setConnectors((prev) =>
      prev.map((c) =>
        c.connector_id === data.connector_id
          ? { ...c, status: data.status as Connector["status"] }
          : c
      )
    );
  });

  useSocket("connectors_changed", () => { fetchData(); });

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

  const handleCreateRoute = async () => {
    try {
      await api.post("/admin/connectors/resources", {
        ...routeForm,
        connector_id: routeForm.connector_id || undefined,
      });
      toast.success("Route created");
      setShowRouteModal(false);
      setRouteForm({ name: "", network: "default", protocol: "http", target_host: "", target_port: 80, path_prefix: "", connector_id: "" });
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create route");
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

  const handleDeleteResource = async (id: string, name: string) => {
    if (!confirm(`Delete resource "${name}"?`)) return;
    try {
      await api.delete(`/resources/${id}`);
      toast.success("Resource deleted");
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to delete");
    }
  };

  const handleRevokeToken = async (id: string) => {
    if (!confirm("Revoke this enrollment token? It can no longer be used to enroll a connector.")) return;
    try {
      await api.post(`/admin/connectors/tokens/${id}/revoke`);
      toast.success("Token revoked");
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to revoke token");
    }
  };

  const handleDeleteRoute = async (id: string, name: string) => {
    if (!confirm(`Delete route "${name}"? Any protected resource pinned to it will fall back to network-wide matching.`)) return;
    try {
      await api.delete(`/admin/connectors/resources/${id}`);
      toast.success("Route deleted");
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to delete route");
    }
  };

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const onlineCount = connectors.filter(c => c.status === "online").length;
  const offlineCount = connectors.filter(c => c.status === "offline").length;
  const degradedCount = connectors.filter(c => c.status === "degraded").length;

  const filteredResources = protectedResources.filter(
    (r) =>
      r.name.toLowerCase().includes(resourceSearch.toLowerCase()) ||
      (r.public_name || "").toLowerCase().includes(resourceSearch.toLowerCase()) ||
      (r.internal_address || "").toLowerCase().includes(resourceSearch.toLowerCase()),
  );

  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      !sessionSearch ||
      (s.resource_name?.toLowerCase().includes(sessionSearch.toLowerCase()) ?? false) ||
      s.id.includes(sessionSearch) ||
      (s.connector_id?.includes(sessionSearch) ?? false);
    const matchesStatus = sessionStatusFilter === "all" || s.status === sessionStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const sessionCounts = {
    active: sessions.filter((s) => s.status === "active").length,
    expired: sessions.filter((s) => s.status === "expired").length,
    revoked: sessions.filter((s) => s.status === "revoked").length,
  };

  const TAB_LABELS: { key: typeof activeTab; label: string; icon: React.ReactNode }[] = [
    { key: "connectors", label: "Connectors", icon: <FaPlug className="inline mr-1" /> },
    { key: "tokens",     label: "Tokens",     icon: <FaKey className="inline mr-1" /> },
    { key: "routes",     label: "Routes",     icon: <FaNetworkWired className="inline mr-1" /> },
    { key: "resources",  label: "Resources",  icon: <FaGlobe className="inline mr-1" /> },
    { key: "sessions",   label: "Sessions",   icon: <FaClock className="inline mr-1" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FaPlug className="text-indigo-500" /> Connectors
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage connectors, proxy routes, protected resources, and access sessions
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { fetchData(); fetchSessions(); }}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            title="Refresh"
          >
            <FaSync className={loading ? "animate-spin" : ""} />
          </button>
          {activeTab === "connectors" && (
            <button
              onClick={() => { setShowTokenModal(true); setCreatedToken(null); }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              <FaPlus /> Deploy Connector
            </button>
          )}
          {activeTab === "resources" && (
            <button
              onClick={() => setShowCreateResource(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              <FaPlus /> Add Resource
            </button>
          )}
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
        {TAB_LABELS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Connectors tab ── */}
      {activeTab === "connectors" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {connectors.length === 0 ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400">
              <FaPlug className="mx-auto text-4xl mb-4 text-gray-300 dark:text-gray-600" />
              <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No connectors deployed yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
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
                  <th className="px-4 py-3 text-left">Routes</th>
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

      {/* ── Tokens tab ── */}
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
                  <th className="px-4 py-3 text-left">Actions</th>
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
                        t.status === "revoked" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" :
                        "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{timeAgo(t.created_at)}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{new Date(t.expires_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{t.used_at ? timeAgo(t.used_at) : "-"}</td>
                    <td className="px-4 py-3">
                      {t.status === "active" ? (
                        <button
                          onClick={() => handleRevokeToken(t.token_id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                          title="Revoke token"
                        >
                          <FaBan size={12} />
                        </button>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Routes tab (connector proxy routes) ── */}
      {activeTab === "routes" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Proxy Routes</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">HTTP proxy routes registered on connectors</p>
            </div>
            <button
              onClick={() => setShowRouteModal(true)}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"
            >
              <FaPlus /> Add Route
            </button>
          </div>
          {routes.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No proxy routes configured yet. Add a route to allow connectors to proxy traffic.
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
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {routes.map(r => (
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
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteRoute(r.resource_id, r.name)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                        title="Delete route"
                      >
                        <FaTrash size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Resources tab (Protected Resources) ── */}
      {activeTab === "resources" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="text"
                placeholder="Search by name, public name, or address…"
                value={resourceSearch}
                onChange={(e) => setResourceSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {filteredResources.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <FaGlobe className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={48} />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No resources found</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">Add a protected resource to start enforcing access policies</p>
              <button
                onClick={() => setShowCreateResource(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <FaPlus size={14} /> Add Resource
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Public name / Address</th>
                      <th className="px-5 py-3">Min score</th>
                      <th className="px-5 py-3">Intune</th>
                      <th className="px-5 py-3">Connector</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredResources.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                        <td className="px-5 py-4">
                          <div className="font-medium text-gray-900 dark:text-white">{r.name}</div>
                          {r.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]" title={r.description}>
                              {r.description}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium capitalize">
                            {r.resource_type}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {r.public_name && <div className="text-gray-900 dark:text-white">{r.public_name}</div>}
                          {r.internal_address && <div className="font-mono text-xs text-gray-500 dark:text-gray-400">{r.internal_address}</div>}
                          {!r.public_name && !r.internal_address && <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-semibold text-gray-900 dark:text-white">{r.minimum_trust_score}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            {r.require_intune_compliant ? (
                              <FaLock className="text-amber-500" size={13} title="Intune compliance required" />
                            ) : null}
                            {r.require_entra_linked ? (
                              <span className="inline-flex px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 rounded font-medium" title="Entra-linked identity required">Entra</span>
                            ) : null}
                            {!r.require_intune_compliant && !r.require_entra_linked && (
                              <span className="text-gray-400 text-xs">None</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {r.connector_resource_id ? (
                            <div className="flex items-center gap-1.5">
                              <FaPlug size={11} className="text-indigo-400" />
                              <span className="text-xs text-gray-600 dark:text-gray-300 font-mono">
                                {routes.find(c => c.resource_id === r.connector_resource_id)?.name || r.connector_resource_id.slice(0, 8) + "…"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">None</span>
                          )}
                          {r.preferred_access_mode && r.preferred_access_mode !== "auto" && (
                            <div className="mt-1">
                              <span className="inline-flex px-1.5 py-0.5 text-[10px] rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium" title={ACCESS_MODE_LABELS[r.preferred_access_mode]}>
                                {r.preferred_access_mode === "wireguard_tunnel" ? "Tunnel only" : "HTTP only"}
                              </span>
                            </div>
                          )}
                          {r.require_tunnel && (
                            <div className="mt-1">
                              <span className="inline-flex px-1.5 py-0.5 text-[10px] rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium" title={r.allow_http_fallback ? "Falls back to HTTP proxy if tunnel unavailable" : "Denies access outright if tunnel unavailable"}>
                                Tunnel required{!r.allow_http_fallback ? ' (no fallback)' : ''}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {r.enabled ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                              <FaCheck size={8} /> Enabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">
                              <FaTimes size={8} /> Disabled
                            </span>
                          )}
                          {r.connector_resource_id && (
                            <div className="mt-1">
                              <ConnectorStatusBadge status={r.connector_status} />
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditingResource(r)}
                              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded"
                              title="Edit"
                            >
                              <FaPencilAlt size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteResource(r.id, r.name)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                              title="Delete"
                            >
                              <FaTrash size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sessions tab ── */}
      {activeTab === "sessions" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Active", count: sessionCounts.active, cls: "text-green-600" },
              { label: "Expired", count: sessionCounts.expired, cls: "text-gray-500" },
              { label: "Revoked", count: sessionCounts.revoked, cls: "text-red-600" },
            ].map((s) => (
              <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className={`text-2xl font-bold ${s.cls}`}>{s.count}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1 max-w-xs">
              <input
                type="text"
                placeholder="Search by resource or ID…"
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                className="w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
              />
            </div>
            <select
              value={sessionStatusFilter}
              onChange={(e) => setSessionStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
            </select>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {sessionsLoading ? (
              <div className="p-8 text-center text-gray-400">Loading…</div>
            ) : filteredSessions.length === 0 ? (
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
                    {filteredSessions.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.id.slice(0, 8)}…</td>
                        <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">
                          {s.resource_name ?? <span className="text-gray-400 italic">deleted</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.connector_id ? s.connector_id.slice(0, 8) + "…" : "—"}</td>
                        <td className="px-4 py-3"><SessionStatusBadge status={s.status} /></td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmt(s.created_at)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmt(s.expires_at)}</td>
                        <td className={`px-4 py-3 text-xs whitespace-nowrap ${s.last_used_at ? "text-indigo-500 dark:text-indigo-400 font-medium" : "text-gray-400"}`}>
                          {s.last_used_at ? timeAgo(s.last_used_at) : "—"}
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
      )}

      {/* ── Token / Deploy modal ── */}
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Remote Network</label>
                  <input
                    type="text"
                    value={tokenNetwork}
                    onChange={e => setTokenNetwork(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="default"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expiry (minutes)</label>
                  <input
                    type="number"
                    value={tokenExpiry}
                    onChange={e => setTokenExpiry(parseInt(e.target.value) || 10)}
                    min={1} max={1440}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Token is one-time use and expires after this duration.</p>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={() => setShowTokenModal(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300">Cancel</button>
                  <button onClick={handleCreateToken} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Generate Token</button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                  <button
                    onClick={() => setDeployTab("docker")}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 ${deployTab === "docker" ? "bg-white dark:bg-gray-800 text-blue-600 shadow-sm" : "text-gray-600 dark:text-gray-400"}`}
                  >
                    <FaDocker /> Docker
                  </button>
                  <button
                    onClick={() => setDeployTab("linux")}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 ${deployTab === "linux" ? "bg-white dark:bg-gray-800 text-orange-600 shadow-sm" : "text-gray-600 dark:text-gray-400"}`}
                  >
                    <FaLinux /> Linux
                  </button>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      {deployTab === "docker" ? "Docker Install Steps" : "Linux Install Steps"}
                    </span>
                    <button
                      onClick={() => copyToClipboard(deployTab === "docker" ? createdToken.docker_command : createdToken.curl_command)}
                      className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center gap-1"
                    >
                      <FaCopy /> Copy
                    </button>
                  </div>
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded px-2 py-1.5">
                    ⚠️ Run this on the <strong>resource server</strong> — not on this ModZero controller.
                  </div>
                  <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-950 rounded p-3 overflow-x-auto">
                    {deployTab === "docker" ? createdToken.docker_command : createdToken.curl_command}
                  </pre>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Important:</strong> This token can only be used once and expires at{" "}
                    <strong>{new Date(createdToken.expires_at).toLocaleString()}</strong>.
                  </p>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={() => { setShowTokenModal(false); setCreatedToken(null); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Route creation modal ── */}
      {showRouteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FaCubes className="text-indigo-500" /> Add Proxy Route
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Route Name</label>
                <input
                  type="text"
                  value={routeForm.name}
                  onChange={e => setRouteForm({ ...routeForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g. Internal Wiki"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Network</label>
                  <input type="text" value={routeForm.network} onChange={e => setRouteForm({ ...routeForm, network: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Protocol</label>
                  <select value={routeForm.protocol} onChange={e => setRouteForm({ ...routeForm, protocol: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="tcp">TCP</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Host</label>
                  <input type="text" value={routeForm.target_host} onChange={e => setRouteForm({ ...routeForm, target_host: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="e.g. 10.0.1.5" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
                  <input type="number" value={routeForm.target_port} onChange={e => setRouteForm({ ...routeForm, target_port: parseInt(e.target.value) || 80 })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Path Prefix (optional)</label>
                <input type="text" value={routeForm.path_prefix} onChange={e => setRouteForm({ ...routeForm, path_prefix: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="e.g. /wiki" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Connector (optional)</label>
                <select value={routeForm.connector_id} onChange={e => setRouteForm({ ...routeForm, connector_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="">Auto (by network)</option>
                  {connectors.map(c => (
                    <option key={c.connector_id} value={c.connector_id}>{c.name} ({c.network})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowRouteModal(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300">Cancel</button>
                <button onClick={handleCreateRoute} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700" disabled={!routeForm.name || !routeForm.target_host}>Create Route</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Resource CRUD modals ── */}
      {showCreateResource && (
        <ResourceFormModal
          connectorRoutes={routes}
          onClose={() => setShowCreateResource(false)}
          onSaved={async () => { setShowCreateResource(false); await fetchData(); toast.success("Resource created"); }}
        />
      )}
      {editingResource && (
        <ResourceFormModal
          initial={editingResource}
          connectorRoutes={routes}
          onClose={() => setEditingResource(null)}
          onSaved={async () => { setEditingResource(null); await fetchData(); toast.success("Resource updated"); }}
        />
      )}
    </div>
  );
};

export default ConnectorsPage;
