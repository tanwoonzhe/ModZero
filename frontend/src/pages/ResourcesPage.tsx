import React, { useEffect, useState } from "react";
import {
  FaGlobe, FaPlus, FaSearch, FaSyncAlt, FaTrash, FaTimes, FaPencilAlt,
  FaCheck, FaCircle, FaPlug, FaLock,
} from "react-icons/fa";
import toast from "react-hot-toast";
import api from "../api";

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
  enabled: boolean;
  connector_resource_id: string | null;
  connector_status: "online" | "degraded" | "offline" | null;
  preferred_access_mode?: "auto" | "http_proxy" | "wireguard_tunnel" | null;
  require_tunnel?: boolean | null;
  allow_http_fallback?: boolean | null;
  created_at: string;
  updated_at: string;
}


interface ConnectorResource {
  resource_id: string;
  name: string;
  network: string;
  protocol: string;
  target_host: string;
  target_port: number;
  connector_id: string | null;
}

const TYPES = ["web", "ssh", "rdp", "database", "api"];

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

const ResourcesPage: React.FC = () => {
  const [resources, setResources] = useState<ProtectedResource[]>([]);
  const [connectorResources, setConnectorResources] = useState<ConnectorResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ProtectedResource | null>(null);

  const fetchAll = async () => {
    try {
      const [resRes, crRes] = await Promise.all([
        api.get<ProtectedResource[]>("/resources"),
        api.get<ConnectorResource[]>("/admin/connectors/resources").catch(() => ({ data: [] })),
      ]);
      setResources(resRes.data);
      setConnectorResources(crRes.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to load resources");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
    toast.success("Refreshed");
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete resource "${name}"?`)) return;
    try {
      await api.delete(`/resources/${id}`);
      toast.success("Resource deleted");
      await fetchAll();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to delete");
    }
  };

  const filtered = resources.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.public_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.internal_address || "").toLowerCase().includes(search.toLowerCase()),
  );

  const enabledCount = resources.filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Protected Resources</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {resources.length} resources &bull; {enabledCount} enabled
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <FaSyncAlt size={14} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <FaPlus size={14} /> Add Resource
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            type="text"
            placeholder="Search by name, public name, or address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <FaGlobe className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No resources found</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">Add a protected resource to start enforcing access policies</p>
          <button
            onClick={() => setShowCreate(true)}
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
                {filtered.map((r) => (
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
                      {r.require_intune_compliant ? (
                        <FaLock className="text-amber-500" size={14} title="Intune compliance required" />
                      ) : (
                        <span className="text-gray-400 text-xs">No</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {r.connector_resource_id ? (
                        <div className="flex items-center gap-1.5">
                          <FaPlug size={11} className="text-indigo-400" />
                          <span className="text-xs text-gray-600 dark:text-gray-300 font-mono">
                            {connectorResources.find(c => c.resource_id === r.connector_resource_id)?.name || r.connector_resource_id.slice(0, 8) + "…"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">None</span>
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
                          onClick={() => setEditing(r)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded"
                          title="Edit"
                        >
                          <FaPencilAlt size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id, r.name)}
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

      {showCreate && (
        <ResourceFormModal
          connectorResources={connectorResources}
          onClose={() => setShowCreate(false)}
          onSaved={async () => { setShowCreate(false); await fetchAll(); toast.success("Resource created"); }}
        />
      )}
      {editing && (
        <ResourceFormModal
          initial={editing}
          connectorResources={connectorResources}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await fetchAll(); toast.success("Resource updated"); }}
        />
      )}
    </div>
  );
};

const BLANK = {
  name: "", description: "", resource_type: "web",
  internal_address: "", public_name: "",
  required_group: "", minimum_trust_score: 0,
  require_intune_compliant: false, enabled: true,
  connector_resource_id: "",
};

const ResourceFormModal: React.FC<{
  initial?: ProtectedResource;
  connectorResources: ConnectorResource[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ initial, connectorResources, onClose, onSaved }) => {
  const [form, setForm] = useState({
    ...BLANK,
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
      enabled: form.enabled,
      connector_resource_id: form.connector_resource_id || null,
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
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
              Connector Resource
            </label>
            <select
              value={form.connector_resource_id}
              onChange={(e) => set("connector_resource_id", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">None (no connector required)</option>
              {connectorResources.map((cr) => (
                <option key={cr.resource_id} value={cr.resource_id}>
                  {cr.name} — {cr.target_host}:{cr.target_port} ({cr.network})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              When set, access is denied if the connector is offline or degraded.
            </p>
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

export default ResourcesPage;
