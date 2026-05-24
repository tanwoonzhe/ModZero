import React, { useState, useEffect, useCallback } from "react";
import { FaNetworkWired, FaPlus, FaTrash, FaSync, FaCircle, FaCloud, FaHeartbeat, FaKey, FaCopy, FaTerminal, FaCheck, FaRoute, FaClipboardList } from "react-icons/fa";
import toast from "react-hot-toast";
import api from "../api";

// ─── Types ──────────────────────────────────────────────────────────

interface TunnelStatus {
  headscale_enabled: boolean;
  headscale_url_configured: boolean;
  headscale_user: string;
  current_data_path: string;
  headscale_reachable: boolean | null;
  last_sync_at: string | null;
  last_route_sync_at: string | null;
}

interface HeadscaleHealth {
  enabled: boolean;
  configured: boolean;
  reachable: boolean | null;
  node_count: number | null;
  error: string | null;
}

interface HeadscaleSyncResult {
  status: "ok" | "disabled" | "not_configured" | "unreachable";
  synced_nodes: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  last_sync_at: string | null;
  detail: string | null;
}

interface TunnelNode {
  id: string;
  connector_id: string;
  connector_name: string | null;
  node_name: string;
  wireguard_ip: string | null;
  headscale_node_id: string | null;
  status: string;
  last_seen_at: string | null;
  created_at: string;
}

interface TunnelRoute {
  id: string;
  connector_id: string;
  resource_id: string | null;
  subnet_or_host: string;
  route_type: string;
  enabled: boolean;
  route_status: string;
  last_synced_at: string | null;
  updated_at: string | null;
  headscale_route_id: string | null;
  created_at: string;
}

interface RouteAdvertiseResult {
  route_id: string;
  connector_id: string;
  connector_name: string | null;
  route_type: string;
  subnet_or_host: string;
  suggested_advertise_value: string;
  manual_command: string;
  warnings: string[];
}

interface RouteApproveResult {
  route_id: string;
  status: "approved" | "manual_required" | "error";
  safe_message: string;
  manual_command: string | null;
}

interface SyncRoutesResult {
  status: string;
  synced_routes: number;
  updated: number;
  skipped: number;
  errors: number;
  last_sync_at: string | null;
  detail: string | null;
}

interface ConnectorLite {
  connector_id: string;
  name: string;
}

interface BootstrapResult {
  status: "ok" | "disabled" | "not_configured";
  connector_id: string;
  connector_name: string | null;
  headscale_enabled: boolean;
  headscale_configured: boolean;
  suggested_node_name: string;
  login_server: string | null;
  join_command: string | null;
  auth_key_mode: "manual" | "headscale_api" | "disabled" | "not_configured";
  auth_key: string | null;
  expires_at: string | null;
  warnings: string[];
}

// ─── Page ────────────────────────────────────────────────────────────

const TunnelsPage: React.FC = () => {
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [nodes, setNodes] = useState<TunnelNode[]>([]);
  const [routes, setRoutes] = useState<TunnelRoute[]>([]);
  const [connectors, setConnectors] = useState<ConnectorLite[]>([]);
  const [health, setHealth] = useState<HeadscaleHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "check" | "sync" | "sync-routes">("");

  // Bootstrap modal state
  const [bootstrap, setBootstrap] = useState<BootstrapResult | null>(null);
  const [bootstrapBusyFor, setBootstrapBusyFor] = useState<string>("");

  // Route lifecycle state
  const [advertiseResult, setAdvertiseResult] = useState<RouteAdvertiseResult | null>(null);
  const [approveResult, setApproveResult] = useState<RouteApproveResult | null>(null);
  const [advertiseBusyFor, setAdvertiseBusyFor] = useState<string>("");
  const [approveBusyFor, setApproveBusyFor] = useState<string>("");

  // New-route form
  const [showForm, setShowForm] = useState(false);
  const [formConnectorId, setFormConnectorId] = useState("");
  const [formSubnet, setFormSubnet] = useState("");
  const [formRouteType, setFormRouteType] = useState<"host" | "subnet">("host");
  const [formEnabled, setFormEnabled] = useState(false);

  // Tab state — "overview" preserves the original page; "audit" is the new tunnel audit tab.
  const [activeTab, setActiveTab] = useState<"overview" | "audit">("overview");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, n, r, c] = await Promise.all([
        api.get<TunnelStatus>("/tunnels/status"),
        api.get<TunnelNode[]>("/tunnels/nodes"),
        api.get<TunnelRoute[]>("/tunnels/routes"),
        api.get<ConnectorLite[]>("/connectors").catch(() => ({ data: [] as ConnectorLite[] })),
      ]);
      setStatus(s.data);
      setNodes(n.data);
      setRoutes(r.data);
      setConnectors(Array.isArray(c.data) ? c.data : []);
    } catch (err: any) {
      toast.error(`Failed to load tunnels: ${err?.message ?? "unknown"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/tunnels/routes", {
        connector_id: formConnectorId,
        subnet_or_host: formSubnet,
        route_type: formRouteType,
        enabled: formEnabled,
      });
      toast.success("Route created");
      setShowForm(false);
      setFormSubnet("");
      setFormEnabled(false);
      reload();
    } catch (err: any) {
      toast.error(`Create failed: ${err?.response?.data?.detail ?? err?.message}`);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this route?")) return;
    try {
      await api.delete(`/tunnels/routes/${id}`);
      toast.success("Route deleted");
      reload();
    } catch (err: any) {
      toast.error(`Delete failed: ${err?.message}`);
    }
  };

  const onCheckHeadscale = async () => {
    setBusy("check");
    try {
      const { data } = await api.get<HeadscaleHealth>("/tunnels/headscale/health");
      setHealth(data);
      if (!data.enabled) toast("Headscale is disabled");
      else if (!data.configured) toast.error("Headscale URL or API key missing");
      else if (data.reachable === false) toast.error(`Unreachable${data.error ? `: ${data.error}` : ""}`);
      else if (data.reachable === true) toast.success(`Reachable — ${data.node_count ?? 0} node(s)`);
      reload();
    } catch (err: any) {
      toast.error(`Check failed: ${err?.message ?? "unknown"}`);
    } finally {
      setBusy("");
    }
  };

  const onSyncHeadscale = async () => {
    setBusy("sync");
    try {
      const { data } = await api.post<HeadscaleSyncResult>("/tunnels/headscale/sync");
      if (data.status === "disabled") toast("Headscale is disabled");
      else if (data.status === "not_configured") toast.error("Headscale URL or API key missing");
      else if (data.status === "unreachable") toast.error(`Headscale unreachable${data.detail ? ` (${data.detail})` : ""}`);
      else if (data.status === "ok") {
        const skipNote = data.skipped > 0 ? ` (${data.skipped} skipped, no matching connector)` : "";
        const errNote = data.errors > 0 ? `, ${data.errors} errors` : "";
        toast.success(`Synced ${data.updated} node(s)${skipNote}${errNote}`);
      }
      reload();
    } catch (err: any) {
      toast.error(`Sync failed: ${err?.message ?? "unknown"}`);
    } finally {
      setBusy("");
    }
  };

  const onSyncRoutes = async () => {
    setBusy("sync-routes");
    try {
      const { data } = await api.post<SyncRoutesResult>("/tunnels/headscale/sync-routes");
      if (data.status === "disabled") toast("Route sync: Headscale is disabled");
      else if (data.status === "not_configured") toast.error("Headscale URL or API key missing");
      else if (data.status === "unreachable") toast.error(`Headscale unreachable${data.detail ? ` (${data.detail})` : ""}`);
      else if (data.status === "ok") {
        toast.success(`Route sync: ${data.updated} updated, ${data.skipped} skipped`);
      }
      reload();
    } catch (err: any) {
      toast.error(`Route sync failed: ${err?.message ?? "unknown"}`);
    } finally {
      setBusy("");
    }
  };

  const onGenerateAdvertise = async (routeId: string) => {
    setAdvertiseBusyFor(routeId);
    try {
      const { data } = await api.post<RouteAdvertiseResult>(
        `/tunnels/routes/${routeId}/advertise-package`,
      );
      setAdvertiseResult(data);
    } catch (err: any) {
      toast.error(`Advertise failed: ${err?.response?.data?.detail ?? err?.message}`);
    } finally {
      setAdvertiseBusyFor("");
    }
  };

  const onApproveRoute = async (route: TunnelRoute) => {
    if (!window.confirm(`Approve route ${route.subnet_or_host}?`)) return;
    setApproveBusyFor(route.id);
    try {
      const { data } = await api.post<RouteApproveResult>(
        `/tunnels/routes/${route.id}/approve`,
      );
      setApproveResult(data);
      reload();
    } catch (err: any) {
      toast.error(`Approve failed: ${err?.response?.data?.detail ?? err?.message}`);
    } finally {
      setApproveBusyFor("");
    }
  };

  const routeStatusBadge = (s: string) => {
    if (s === "approved") return "bg-green-100 text-green-800";
    if (s === "advertised") return "bg-blue-100 text-blue-800";
    if (s === "disabled") return "bg-red-100 text-red-800";
    if (s === "unavailable") return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800"; // pending
  };

  const onBootstrap = async (connectorId: string) => {    setBootstrapBusyFor(connectorId);
    try {
      const { data } = await api.post<BootstrapResult>(
        `/tunnels/bootstrap/${connectorId}`,
        {},
      );
      setBootstrap(data);
    } catch (err: any) {
      toast.error(`Bootstrap failed: ${err?.response?.data?.detail ?? err?.message}`);
    } finally {
      setBootstrapBusyFor("");
    }
  };

  const onCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const statusColor = (s: string) => {
    if (s === "online") return "text-green-500";
    if (s === "degraded") return "text-yellow-500";
    if (s === "offline") return "text-red-500";
    return "text-gray-400";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FaNetworkWired /> Tunnels
        </h1>
        <button
          onClick={reload}
          className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 flex items-center gap-2"
        >
          <FaSync /> Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 flex gap-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === "overview"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-2 ${
            activeTab === "audit"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <FaClipboardList /> Tunnel Audit
        </button>
      </div>

      {activeTab === "audit" && <TunnelAuditTab />}

      {activeTab === "overview" && <>

      {/* Headscale status card */}
      {status && (
        <div className="border rounded p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <FaCloud /> Headscale
            </h2>
            <div className="flex gap-2">
              <button
                onClick={onCheckHeadscale}
                disabled={!status.headscale_enabled || busy !== ""}
                title={!status.headscale_enabled ? "Enable HEADSCALE_ENABLED to use sync" : ""}
                className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <FaHeartbeat /> {busy === "check" ? "Checking…" : "Check Headscale"}
              </button>
              <button
                onClick={onSyncHeadscale}
                disabled={!status.headscale_enabled || busy !== ""}
                title={!status.headscale_enabled ? "Enable HEADSCALE_ENABLED to use sync" : ""}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <FaSync /> {busy === "sync" ? "Syncing…" : "Sync Nodes"}
              </button>
              <button
                onClick={onSyncRoutes}
                disabled={!status.headscale_enabled || busy !== ""}
                title={!status.headscale_enabled ? "Enable HEADSCALE_ENABLED to sync routes" : ""}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <FaRoute /> {busy === "sync-routes" ? "Syncing…" : "Sync Routes"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div>
              <div className="text-gray-500">Enabled</div>
              <div className={status.headscale_enabled ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                {status.headscale_enabled ? "yes" : "no"}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Configured</div>
              <div className={health?.configured ? "text-green-600 font-medium" : "text-gray-600 font-medium"}>
                {health ? (health.configured ? "yes" : "no") : "—"}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Reachable</div>
              <div className={
                status.headscale_reachable === true ? "text-green-600 font-medium"
                : status.headscale_reachable === false ? "text-red-600 font-medium"
                : "text-gray-500 font-medium"
              }>
                {status.headscale_reachable === true ? "yes"
                 : status.headscale_reachable === false ? "no"
                 : "unknown"}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Node count</div>
              <div className="font-medium">{health?.node_count ?? "—"}</div>
            </div>
            <div>
              <div className="text-gray-500">Last sync</div>
              <div className="font-medium">
                {status.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : "Never"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status banner */}
      {status && !status.headscale_enabled && (
        <div className="border-l-4 border-yellow-400 bg-yellow-50 p-4 text-sm text-yellow-900">
          <strong>Headscale is disabled.</strong>{" "}
          Routes can be configured but are not enforced. Current data path:{" "}
          <code>{status.current_data_path}</code>.
        </div>
      )}
      {status && status.headscale_enabled && (
        <div className="border-l-4 border-green-400 bg-green-50 p-4 text-sm text-green-900">
          <strong>Headscale enabled.</strong> URL configured:{" "}
          {status.headscale_url_configured ? "yes" : "no"}; user:{" "}
          <code>{status.headscale_user}</code>; current data path:{" "}
          <code>{status.current_data_path}</code> (WireGuard data plane is future work).
        </div>
      )}

      {/* Nodes table */}
      <section>
        <h2 className="text-lg font-medium mb-2">Tunnel nodes</h2>
        {loading ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : nodes.length === 0 ? (
          <div className="text-gray-500 text-sm">No nodes registered.</div>
        ) : (
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Connector</th>
                <th className="p-2 text-left">Node name</th>
                <th className="p-2 text-left">WG IP</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Last seen</th>
                <th className="p-2 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <tr key={n.id} className="border-t">
                  <td className="p-2">{n.connector_name ?? n.connector_id.slice(0, 8)}</td>
                  <td className="p-2 font-mono">{n.node_name}</td>
                  <td className="p-2 font-mono">{n.wireguard_ip ?? "—"}</td>
                  <td className={`p-2 ${statusColor(n.status)}`}>
                    <FaCircle className="inline mr-1 text-xs" />
                    {n.status}
                  </td>
                  <td className="p-2 text-gray-600">
                    {n.last_seen_at ? new Date(n.last_seen_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => onBootstrap(n.connector_id)}
                      disabled={bootstrapBusyFor === n.connector_id}
                      className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
                      title="Generate manual WireGuard join command"
                    >
                      <FaKey /> {bootstrapBusyFor === n.connector_id ? "…" : "Bootstrap"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Routes table */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-medium">Tunnel routes</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            <FaPlus /> {showForm ? "Cancel" : "Add route"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={onCreate} className="border rounded p-4 mb-3 space-y-2 bg-gray-50">
            <div className="flex gap-2">
              <select
                required
                value={formConnectorId}
                onChange={(e) => setFormConnectorId(e.target.value)}
                className="border rounded p-1 text-sm flex-1"
              >
                <option value="">-- connector --</option>
                {connectors.map((c) => (
                  <option key={c.connector_id} value={c.connector_id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="10.0.0.0/24 or host.internal"
                value={formSubnet}
                onChange={(e) => setFormSubnet(e.target.value)}
                className="border rounded p-1 text-sm flex-1"
              />
              <select
                value={formRouteType}
                onChange={(e) => setFormRouteType(e.target.value as "host" | "subnet")}
                className="border rounded p-1 text-sm"
              >
                <option value="host">host</option>
                <option value="subnet">subnet</option>
              </select>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                />
                enabled
              </label>
              <button
                type="submit"
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded"
              >
                Create
              </button>
            </div>
          </form>
        )}

        {routes.length === 0 ? (
          <div className="text-gray-500 text-sm">No routes configured.</div>
        ) : (
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Connector</th>
                <th className="p-2 text-left">Subnet / host</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Enabled</th>
                <th className="p-2 text-left">Route Status</th>
                <th className="p-2 text-left">Last Synced</th>
                <th className="p-2 text-left">Created</th>
                <th className="p-2 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => {
                const c = connectors.find((x) => x.connector_id === r.connector_id);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{c?.name ?? r.connector_id.slice(0, 8)}</td>
                    <td className="p-2 font-mono">{r.subnet_or_host}</td>
                    <td className="p-2">{r.route_type}</td>
                    <td className="p-2">{r.enabled ? "yes" : "no"}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${routeStatusBadge(r.route_status)}`}>
                        {r.route_status}
                      </span>
                    </td>
                    <td className="p-2 text-gray-600">
                      {r.last_synced_at ? new Date(r.last_synced_at).toLocaleString() : "—"}
                    </td>
                    <td className="p-2 text-gray-600">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => onGenerateAdvertise(r.id)}
                          disabled={advertiseBusyFor === r.id}
                          className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
                          title="Generate tailscale advertise command"
                        >
                          <FaTerminal /> {advertiseBusyFor === r.id ? "…" : "Advertise"}
                        </button>
                        {r.route_status === "advertised" && (
                          <button
                            onClick={() => onApproveRoute(r)}
                            disabled={approveBusyFor === r.id}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                            title="Approve route in Headscale"
                          >
                            <FaCheck /> {approveBusyFor === r.id ? "…" : "Approve"}
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(r.id)}
                          className="text-red-600 hover:underline text-xs flex items-center gap-1"
                        >
                          <FaTrash /> delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Advertise command modal */}
      {advertiseResult && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setAdvertiseResult(null)}
        >
          <div
            className="bg-white rounded shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b p-4 flex items-center justify-between">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <FaTerminal /> Advertise Package
              </h3>
              <button onClick={() => setAdvertiseResult(null)} className="text-gray-500 hover:text-gray-800">
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  {advertiseResult.route_type}
                </span>
                <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800 font-mono">
                  {advertiseResult.suggested_advertise_value}
                </span>
              </div>
              {advertiseResult.warnings.length > 0 && (
                <div className="space-y-1">
                  {advertiseResult.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="border-l-4 border-yellow-400 bg-yellow-50 px-3 py-2 text-yellow-900 text-xs"
                    >
                      {w}
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-gray-500">Run on the connector host</div>
                  <button
                    onClick={() => onCopy(advertiseResult.manual_command, "Advertise command")}
                    className="px-2 py-1 text-xs border rounded hover:bg-gray-50 flex items-center gap-1"
                  >
                    <FaCopy /> Copy
                  </button>
                </div>
                <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                  {advertiseResult.manual_command}
                </pre>
              </div>
            </div>
            <div className="border-t p-3 flex justify-end">
              <button
                onClick={() => setAdvertiseResult(null)}
                className="px-4 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve result modal */}
      {approveResult && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setApproveResult(null)}
        >
          <div
            className="bg-white rounded shadow-lg w-full max-w-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b p-4 flex items-center justify-between">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <FaCheck /> Route Approval
              </h3>
              <button onClick={() => setApproveResult(null)} className="text-gray-500 hover:text-gray-800">
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <span
                  className={
                    "px-2 py-1 rounded text-xs font-medium " +
                    (approveResult.status === "approved"
                      ? "bg-green-100 text-green-800"
                      : approveResult.status === "manual_required"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-red-100 text-red-800")
                  }
                >
                  {approveResult.status}
                </span>
              </div>
              <p>{approveResult.safe_message}</p>
              {approveResult.manual_command && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-gray-500">Run on the Headscale server</div>
                    <button
                      onClick={() => onCopy(approveResult.manual_command!, "Approve command")}
                      className="px-2 py-1 text-xs border rounded hover:bg-gray-50 flex items-center gap-1"
                    >
                      <FaCopy /> Copy
                    </button>
                  </div>
                  <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                    {approveResult.manual_command}
                  </pre>
                </div>
              )}
            </div>
            <div className="border-t p-3 flex justify-end">
              <button
                onClick={() => setApproveResult(null)}
                className="px-4 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bootstrap modal */}
      {bootstrap && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setBootstrap(null)}
        >
          <div
            className="bg-white rounded shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b p-4 flex items-center justify-between">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <FaKey /> WireGuard Bootstrap
              </h3>
              <button onClick={() => setBootstrap(null)} className="text-gray-500 hover:text-gray-800">
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <span
                  className={
                    "px-2 py-1 rounded text-xs font-medium " +
                    (bootstrap.status === "ok"
                      ? "bg-green-100 text-green-800"
                      : bootstrap.status === "disabled"
                      ? "bg-gray-100 text-gray-800"
                      : "bg-yellow-100 text-yellow-800")
                  }
                >
                  status: {bootstrap.status}
                </span>
                <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  mode: {bootstrap.auth_key_mode}
                </span>
                <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                  node: {bootstrap.suggested_node_name}
                </span>
              </div>

              {bootstrap.login_server && (
                <div>
                  <div className="text-gray-500">Login server</div>
                  <div className="font-mono break-all">{bootstrap.login_server}</div>
                </div>
              )}

              {bootstrap.expires_at && (
                <div>
                  <div className="text-gray-500">Auth key expires at</div>
                  <div className="font-mono">{new Date(bootstrap.expires_at).toLocaleString()}</div>
                </div>
              )}

              {bootstrap.auth_key_mode === "headscale_api" && bootstrap.auth_key && (
                <div className="border-2 border-amber-400 bg-amber-50 rounded p-3">
                  <div className="font-medium text-amber-900 mb-1">
                    Shown once — copy now
                  </div>
                  <div className="text-amber-900 text-xs mb-2">
                    This key will not be shown again. ModZero stores only a SHA-256 hash.
                  </div>
                  <pre className="bg-white p-2 rounded text-xs font-mono break-all whitespace-pre-wrap">
                    {bootstrap.auth_key}
                  </pre>
                  <button
                    onClick={() => onCopy(bootstrap.auth_key!, "Auth key")}
                    className="mt-2 px-3 py-1 text-xs bg-amber-600 text-white rounded flex items-center gap-1"
                  >
                    <FaCopy /> Copy auth key
                  </button>
                </div>
              )}

              {bootstrap.join_command && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-gray-500">Join command (run on connector host)</div>
                    <button
                      onClick={() => onCopy(bootstrap.join_command!, "Join command")}
                      className="px-2 py-1 text-xs border rounded hover:bg-gray-50 flex items-center gap-1"
                    >
                      <FaCopy /> Copy join command
                    </button>
                  </div>
                  <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                    {bootstrap.join_command}
                  </pre>
                </div>
              )}

              {bootstrap.warnings.length > 0 && (
                <div className="space-y-1">
                  {bootstrap.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="border-l-4 border-yellow-400 bg-yellow-50 px-3 py-2 text-yellow-900 text-xs"
                    >
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t p-3 flex justify-end">
              <button
                onClick={() => setBootstrap(null)}
                className="px-4 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  );
};

// ─── Tunnel Audit Tab ───────────────────────────────────────────────

interface TunnelAuditLogRow {
  id: string;
  action: string;
  user_id: string | null;
  device_id: string | null;
  resource_id: string | null;
  connector_id: string | null;
  access_log_id: string | null;
  safe_message: string | null;
  created_at: string;
}

const AUDIT_ACTIONS = [
  "tunnel_ready_reported",
  "tunnel_required_denied",
  "http_fallback_used",
  "user_enrollment_requested",
  "session_revoked_with_tunnel",
] as const;

const AUDIT_ACTION_META: Record<string, { cls: string }> = {
  tunnel_ready_reported:        { cls: "bg-green-100 text-green-800" },
  tunnel_required_denied:       { cls: "bg-red-100 text-red-800" },
  http_fallback_used:           { cls: "bg-amber-100 text-amber-800" },
  user_enrollment_requested:    { cls: "bg-blue-100 text-blue-800" },
  session_revoked_with_tunnel:  { cls: "bg-purple-100 text-purple-800" },
};

const shortId = (v: string | null) => (v ? `${v.slice(0, 8)}…` : "—");

const TunnelAuditTab: React.FC = () => {
  const [rows, setRows] = useState<TunnelAuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterResourceId, setFilterResourceId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params: Record<string, string | number> = { limit: 100 };
      if (filterAction) params.action = filterAction;
      if (filterUserId.trim()) params.user_id = filterUserId.trim();
      if (filterResourceId.trim()) params.resource_id = filterResourceId.trim();
      const { data } = await api.get<TunnelAuditLogRow[]>("/tunnels/audit", { params });
      setRows(data);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || "Failed to load tunnel audit");
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterUserId, filterResourceId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Action</label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="border rounded p-1.5 text-sm"
          >
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">User ID</label>
          <input
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            placeholder="UUID"
            className="border rounded p-1.5 text-sm font-mono w-72"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Resource ID</label>
          <input
            value={filterResourceId}
            onChange={(e) => setFilterResourceId(e.target.value)}
            placeholder="UUID"
            className="border rounded p-1.5 text-sm font-mono w-72"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
        >
          <FaSync className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {err && (
        <div className="border-l-4 border-red-400 bg-red-50 p-3 text-sm text-red-900">
          {err}
        </div>
      )}

      {rows.length === 0 && !loading && !err ? (
        <div className="text-gray-500 text-sm p-4 border rounded bg-white">
          No tunnel audit events yet.
        </div>
      ) : (
        <table className="w-full text-sm border">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">When</th>
              <th className="p-2 text-left">Action</th>
              <th className="p-2 text-left">Resource ID</th>
              <th className="p-2 text-left">User ID</th>
              <th className="p-2 text-left">Safe message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = AUDIT_ACTION_META[r.action] || { cls: "bg-gray-100 text-gray-800" };
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2 text-gray-600 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${meta.cls}`}>
                      {r.action}
                    </span>
                  </td>
                  <td className="p-2 font-mono text-xs" title={r.resource_id || ""}>
                    {shortId(r.resource_id)}
                  </td>
                  <td className="p-2 font-mono text-xs" title={r.user_id || ""}>
                    {shortId(r.user_id)}
                  </td>
                  <td className="p-2 text-gray-700">{r.safe_message || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
};

export default TunnelsPage;
