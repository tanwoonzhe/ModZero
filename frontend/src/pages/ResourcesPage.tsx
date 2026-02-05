import React, { useEffect, useState } from "react";
import {
  FaNetworkWired,
  FaServer,
  FaCloud,
  FaDatabase,
  FaDesktop,
  FaGlobe,
  FaPlus,
  FaSearch,
  FaChevronDown,
  FaChevronRight,
  FaCircle,
  FaSyncAlt,
  FaExternalLinkAlt,
  FaEdit,
  FaTrash,
  FaTimes,
} from "react-icons/fa";
import toast from "react-hot-toast";
import api from "../api";

interface Resource {
  resource_id: string;
  name: string;
  type: string;
  connector_status: string;
  ip_address?: string;
  port?: number;
  last_seen?: string;
}

interface Network {
  network_id: string;
  name: string;
  cidr_range: string;
  connector_health: "green" | "amber" | "red";
  location?: string;
  resources: Resource[];
  last_check?: string;
}

const healthColors = {
  green: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", dot: "bg-green-500" },
  amber: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  red: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
};

const resourceIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  server: FaServer,
  cloud: FaCloud,
  database: FaDatabase,
  desktop: FaDesktop,
  default: FaGlobe,
};

const ResourcesPage: React.FC = () => {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedNetworks, setExpandedNetworks] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [showAddNetworkModal, setShowAddNetworkModal] = useState(false);
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);
  const [selectedNetworkForResource, setSelectedNetworkForResource] = useState<string | null>(null);

  // Mock data for demo
  const getMockNetworks = (): Network[] => [
    {
      network_id: "1",
      name: "Corporate HQ Network",
      cidr_range: "10.0.0.0/16",
      connector_health: "green",
      location: "New York, US",
      last_check: new Date().toISOString(),
      resources: [
        { resource_id: "r1", name: "DC-Primary", type: "server", connector_status: "online", ip_address: "10.0.1.10", port: 443 },
        { resource_id: "r2", name: "SQL-Prod", type: "database", connector_status: "online", ip_address: "10.0.2.20", port: 1433 },
        { resource_id: "r3", name: "File-Server", type: "server", connector_status: "online", ip_address: "10.0.1.30", port: 445 },
      ],
    },
    {
      network_id: "2",
      name: "Azure Cloud VNet",
      cidr_range: "172.16.0.0/12",
      connector_health: "green",
      location: "East US 2",
      last_check: new Date().toISOString(),
      resources: [
        { resource_id: "r4", name: "Azure-VM-Web", type: "cloud", connector_status: "online", ip_address: "172.16.1.50", port: 443 },
        { resource_id: "r5", name: "Azure-SQL-DB", type: "database", connector_status: "online", ip_address: "172.16.2.10", port: 1433 },
      ],
    },
    {
      network_id: "3",
      name: "Remote Office - London",
      cidr_range: "192.168.10.0/24",
      connector_health: "amber",
      location: "London, UK",
      last_check: new Date(Date.now() - 300000).toISOString(),
      resources: [
        { resource_id: "r6", name: "LON-DC-01", type: "server", connector_status: "degraded", ip_address: "192.168.10.10" },
        { resource_id: "r7", name: "LON-Workstation", type: "desktop", connector_status: "offline" },
      ],
    },
    {
      network_id: "4",
      name: "Legacy DMZ",
      cidr_range: "10.100.0.0/24",
      connector_health: "red",
      location: "On-Premises",
      last_check: new Date(Date.now() - 3600000).toISOString(),
      resources: [
        { resource_id: "r8", name: "Legacy-WebApp", type: "server", connector_status: "offline", ip_address: "10.100.0.50" },
      ],
    },
  ];

  const fetchNetworks = async () => {
    setLoadError(null);
    try {
      const res = await api.get<Network[]>("/resources");
      setNetworks(res.data);
    } catch (err: any) {
      console.error(err);
      // Use mock data for demo
      setNetworks(getMockNetworks());
      if (err.response?.status !== 404) {
        setLoadError("Using demo data - API not connected");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworks();
    // Expand all networks initially
    setExpandedNetworks(new Set(["1", "2", "3", "4"]));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchNetworks();
    setRefreshing(false);
    toast.success("Resources refreshed");
  };

  const toggleNetwork = (networkId: string) => {
    setExpandedNetworks((prev) => {
      const next = new Set(prev);
      if (next.has(networkId)) {
        next.delete(networkId);
      } else {
        next.add(networkId);
      }
      return next;
    });
  };

  const getResourceIcon = (type: string) => {
    return resourceIcons[type] || resourceIcons.default;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "text-green-500";
      case "degraded":
        return "text-amber-500";
      case "offline":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const filteredNetworks = networks.filter((net) => {
    const matchesNetwork = net.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      net.cidr_range.includes(searchTerm);
    const matchesResource = net.resources.some(
      (r) => r.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return matchesNetwork || matchesResource;
  });

  // Stats
  const totalResources = networks.reduce((acc, n) => acc + n.resources.length, 0);
  const onlineResources = networks.reduce(
    (acc, n) => acc + n.resources.filter((r) => r.connector_status === "online").length,
    0
  );
  const healthyNetworks = networks.filter((n) => n.connector_health === "green").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Resources</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage networks and protected resources
            {loadError && <span className="ml-2 text-amber-600">• {loadError}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <FaSyncAlt size={14} className={refreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button 
            onClick={() => setShowAddNetworkModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <FaPlus size={14} />
            <span>Add Network</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <FaNetworkWired className="text-indigo-600 dark:text-indigo-400" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{networks.length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Networks</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <FaServer className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalResources}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Resources</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <FaCircle className="text-green-600 dark:text-green-400" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{onlineResources}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Online Resources</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <FaGlobe className="text-emerald-600 dark:text-emerald-400" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{healthyNetworks}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Healthy Networks</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            type="text"
            placeholder="Search networks or resources..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Networks List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNetworks.map((network) => {
            const healthStyle = healthColors[network.connector_health];
            const isExpanded = expandedNetworks.has(network.network_id);
            
            return (
              <div
                key={network.network_id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {/* Network Header */}
                <div
                  className="p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750"
                  onClick={() => toggleNetwork(network.network_id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                        <FaNetworkWired className="text-gray-600 dark:text-gray-400" size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-gray-900 dark:text-white">{network.name}</h3>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1 ${healthStyle.bg} ${healthStyle.text}`}>
                            <span className={`w-2 h-2 rounded-full ${healthStyle.dot}`}></span>
                            {network.connector_health === "green" ? "Healthy" : network.connector_health === "amber" ? "Degraded" : "Offline"}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                          <span>CIDR: {network.cidr_range}</span>
                          {network.location && <span>• {network.location}</span>}
                          <span>• {network.resources.length} resources</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg">
                        <FaEdit size={14} />
                      </button>
                      <button className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg">
                        <FaTrash size={14} />
                      </button>
                      {isExpanded ? (
                        <FaChevronDown className="text-gray-400" size={14} />
                      ) : (
                        <FaChevronRight className="text-gray-400" size={14} />
                      )}
                    </div>
                  </div>
                </div>

                {/* Resources List */}
                {isExpanded && network.resources.length > 0 && (
                  <div className="border-t border-gray-100 dark:border-gray-700">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                          <tr>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resource</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP Address</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Port</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {network.resources.map((resource) => {
                            const Icon = getResourceIcon(resource.type);
                            return (
                              <tr key={resource.resource_id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                                <td className="px-5 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-3">
                                    <Icon className="text-gray-400" size={16} />
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{resource.name}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-4 whitespace-nowrap">
                                  <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">{resource.type}</span>
                                </td>
                                <td className="px-5 py-4 whitespace-nowrap">
                                  <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                                    {resource.ip_address || "-"}
                                  </span>
                                </td>
                                <td className="px-5 py-4 whitespace-nowrap">
                                  <span className="text-sm text-gray-500 dark:text-gray-400">{resource.port || "-"}</span>
                                </td>
                                <td className="px-5 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <FaCircle className={getStatusColor(resource.connector_status)} size={8} />
                                    <span className="text-sm capitalize text-gray-700 dark:text-gray-300">
                                      {resource.connector_status}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-5 py-4 whitespace-nowrap">
                                  <button className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded">
                                    <FaExternalLinkAlt size={12} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Empty Resources */}
                {isExpanded && network.resources.length === 0 && (
                  <div className="border-t border-gray-100 dark:border-gray-700 p-8 text-center">
                    <FaServer className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={32} />
                    <p className="text-sm text-gray-500 dark:text-gray-400">No resources in this network</p>
                    <button 
                      onClick={() => {
                        setSelectedNetworkForResource(network.network_id);
                        setShowAddResourceModal(true);
                      }}
                      className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      + Add Resource
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredNetworks.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <FaNetworkWired className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No networks found</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">Add your first network to start protecting resources</p>
          <button 
            onClick={() => setShowAddNetworkModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <FaPlus size={14} /> Add Network
          </button>
        </div>
      )}

      {/* Add Network Modal */}
      {showAddNetworkModal && (
        <AddNetworkModal 
          onClose={() => setShowAddNetworkModal(false)}
          onAdd={(network) => {
            setNetworks(prev => [...prev, { ...network, network_id: `${Date.now()}`, resources: [] }]);
            setShowAddNetworkModal(false);
            toast.success("Network added successfully");
          }}
        />
      )}

      {/* Add Resource Modal */}
      {showAddResourceModal && selectedNetworkForResource && (
        <AddResourceModal
          onClose={() => {
            setShowAddResourceModal(false);
            setSelectedNetworkForResource(null);
          }}
          onAdd={(resource) => {
            setNetworks(prev => prev.map(n => 
              n.network_id === selectedNetworkForResource 
                ? { ...n, resources: [...n.resources, { ...resource, resource_id: `r${Date.now()}` }] }
                : n
            ));
            // Don't close modal here - let the modal handle its own closing after batch add
          }}
          networkId={selectedNetworkForResource}
        />
      )}
    </div>
  );
};

// Add Network Modal Component
const AddNetworkModal: React.FC<{
  onClose: () => void;
  onAdd: (network: Omit<Network, 'network_id' | 'resources'>) => void;
}> = ({ onClose, onAdd }) => {
  const [name, setName] = useState("");
  const [cidrRange, setCidrRange] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      // Try to save to backend API
      await api.post('/resources/networks', {
        name,
        cidr_range: cidrRange,
        location
      });
    } catch (error) {
      console.log("API save failed, using local state");
    }
    
    onAdd({
      name,
      cidr_range: cidrRange,
      connector_health: "green",
      location,
      last_check: new Date().toISOString(),
    });
    
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add Network</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <FaTimes size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Network Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., Corporate Network"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CIDR Range *</label>
            <input
              type="text"
              value={cidrRange}
              onChange={(e) => setCidrRange(e.target.value)}
              required
              pattern="^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., 10.0.0.0/16"
            />
            <p className="text-xs text-gray-500 mt-1">Format: IP/prefix (e.g., 10.0.0.0/16)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., East US"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add Network"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Add Resource Modal Component - supports adding multiple resources
const AddResourceModal: React.FC<{
  onClose: () => void;
  onAdd: (resource: Omit<Resource, 'resource_id'>) => void;
  networkId: string;
}> = ({ onClose, onAdd, networkId }) => {
  const [resources, setResources] = useState<Array<{
    name: string;
    type: string;
    ipAddress: string;
    port: string;
  }>>([{ name: "", type: "server", ipAddress: "", port: "" }]);
  const [saving, setSaving] = useState(false);

  const addResourceRow = () => {
    setResources(prev => [...prev, { name: "", type: "server", ipAddress: "", port: "" }]);
  };

  const removeResourceRow = (index: number) => {
    if (resources.length > 1) {
      setResources(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateResource = (index: number, field: string, value: string) => {
    setResources(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      // Save each resource to API and update local state
      for (const resource of resources) {
        if (resource.name.trim()) {
          try {
            // Try to save to backend API
            await api.post(`/resources/networks/${networkId}/resources`, {
              name: resource.name,
              type: resource.type,
              ip_address: resource.ipAddress || undefined,
              port: resource.port ? parseInt(resource.port) : undefined,
            });
          } catch (error) {
            console.log("API save failed, using local state");
          }
          
          // Add to local state
          onAdd({
            name: resource.name,
            type: resource.type,
            connector_status: "online",
            ip_address: resource.ipAddress || undefined,
            port: resource.port ? parseInt(resource.port) : undefined,
          });
        }
      }
      onClose();
    } catch (error) {
      console.error("Failed to save resources:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add Resources</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <FaTimes size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-150px)]">
          <div className="space-y-4">
            {resources.map((resource, index) => (
              <div key={index} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Resource {index + 1}</span>
                  {resources.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeResourceRow(index)}
                      className="text-red-500 hover:text-red-600 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                    <input
                      type="text"
                      value={resource.name}
                      onChange={(e) => updateResource(index, 'name', e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 text-sm"
                      placeholder="e.g., Web Server 01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                    <select
                      value={resource.type}
                      onChange={(e) => updateResource(index, 'type', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 text-sm"
                    >
                      <option value="server">Server</option>
                      <option value="database">Database</option>
                      <option value="cloud">Cloud Service</option>
                      <option value="desktop">Desktop/Workstation</option>
                      <option value="default">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IP Address</label>
                    <input
                      type="text"
                      value={resource.ipAddress}
                      onChange={(e) => updateResource(index, 'ipAddress', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 text-sm"
                      placeholder="e.g., 10.0.1.50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
                    <input
                      type="number"
                      value={resource.port}
                      onChange={(e) => updateResource(index, 'port', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 text-sm"
                      placeholder="e.g., 443"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <button
            type="button"
            onClick={addResourceRow}
            className="mt-4 w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 hover:border-indigo-500 hover:text-indigo-500 transition-colors flex items-center justify-center gap-2"
          >
            <FaPlus size={12} /> Add Another Resource
          </button>
          
          <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || resources.every(r => !r.name.trim())}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : `Add ${resources.filter(r => r.name.trim()).length} Resource(s)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResourcesPage;