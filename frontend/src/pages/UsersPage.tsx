import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { User, AzureUser, AzureUsersResponse, AzureConnectionTest, Device } from "../types";

const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'local' | 'azure' | 'identity'>('local');
  const [localUsers, setLocalUsers] = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [azureUsers, setAzureUsers] = useState<AzureUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [azureLoading, setAzureLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<AzureConnectionTest | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<Record<string, { lastLogin: string | null; avgScore: number | null }>>({});
  const [mfaStatus, setMfaStatus] = useState<Record<string, { mfa_registered: boolean | null; mfa_methods: string[] }>>({});
  const [mfaLoading, setMfaLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ userId: string; username: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [entraEnabled, setEntraEnabled] = useState(false);
  const [linkModal, setLinkModal] = useState<{ userId: string; username: string; currentUpn: string | null } | null>(null);
  const [linkUpn, setLinkUpn] = useState("");
  const [linking, setLinking] = useState(false);
  const [togglingAccess, setTogglingAccess] = useState<string | null>(null);
  const [addUserModal, setAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", email: "", password: "", role: "employee" });
  const [addingUser, setAddingUser] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);
  const [identitySignals, setIdentitySignals] = useState<Record<string, any>>({});
  const [identitySignalsLoading, setIdentitySignalsLoading] = useState(false);

  useEffect(() => {
    api.get("/trust-policy/active")
      .then((r) => setEntraEnabled(!!r.data.entra_enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchLocalUsers();
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const res = await api.get<Device[]>("/devices");
      setDevices(Array.isArray(res.data) ? res.data : []);
    } catch {
      setDevices([]);
    }
  };

  useEffect(() => {
    if (activeTab === 'azure' || activeTab === 'identity') {
      testAzureConnection();
    }
  }, [activeTab]);

  useEffect(() => {
    if ((activeTab === 'azure' || activeTab === 'identity') && connectionStatus?.success && azureUsers.length === 0 && !azureLoading) {
      fetchAzureUsers();
    }
  }, [activeTab, connectionStatus]);

  useEffect(() => {
    if (activeTab === 'identity' && Object.keys(mfaStatus).length === 0 && !mfaLoading) {
      fetchMfaStatus();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'identity' && localUsers.length > 0 && Object.keys(identitySignals).length === 0 && !identitySignalsLoading) {
      fetchIdentitySignals();
    }
  }, [activeTab, localUsers]);

  const fetchIdentitySignals = async () => {
    setIdentitySignalsLoading(true);
    try {
      const results: Record<string, any> = {};
      await Promise.allSettled(
        localUsers.map(async (u) => {
          try {
            const res = await api.get(`/users/${u.user_id}/identity-signals`);
            results[u.user_id] = res.data;
          } catch {
            results[u.user_id] = null;
          }
        })
      );
      setIdentitySignals(results);
    } finally {
      setIdentitySignalsLoading(false);
    }
  };

  const fetchLocalUsers = async () => {
    try {
      const res = await api.get<User[]>("/users");
      setLocalUsers(res.data);
      // Fetch per-user details for last login + avg trust score
      const details: Record<string, { lastLogin: string | null; avgScore: number | null }> = {};
      await Promise.allSettled(
        res.data.map(async (u) => {
          try {
            const d = await api.get(`/users/${u.user_id}/details`);
            const attempts: any[] = d.data.recent_attempts ?? [];
            const lastAttempt = attempts.find(a => a.result === "allow" || a.result === "ALLOW");
            const scores = attempts.map(a => a.total_score).filter(s => s != null);
            const accessLogAvg = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null;
            const deviceCheckAvg = d.data.stats?.avg_device_trust_score ?? null;
            details[u.user_id] = {
              lastLogin: lastAttempt?.timestamp ?? (attempts[0]?.timestamp ?? null),
              avgScore: accessLogAvg ?? (deviceCheckAvg != null ? Math.round(deviceCheckAvg) : null),
            };
          } catch {
            details[u.user_id] = { lastLogin: null, avgScore: null };
          }
        })
      );
      setUserDetails(details);
    } catch (error) {
      console.error("Error fetching local users:", error);
    } finally {
      setLoading(false);
    }
  };

  const testAzureConnection = async () => {
    try {
      const res = await api.get<AzureConnectionTest>("/azure/test-connection");
      setConnectionStatus(res.data);
    } catch (error) {
      console.error("Error testing Azure connection:", error);
      setConnectionStatus({
        success: false,
        message: "Failed to test connection",
        token_acquired: false,
        api_accessible: false
      });
    }
  };

  const fetchAzureUsers = async () => {
    setAzureLoading(true);
    try {
      const res = await api.get<AzureUsersResponse>("/azure/users?top=50");
      setAzureUsers(res.data.users);
    } catch (error) {
      console.error("Error fetching Azure users:", error);
      alert("Failed to fetch Azure users. Please check your Azure configuration.");
    } finally {
      setAzureLoading(false);
    }
  };

  const fetchMfaStatus = async () => {
    setMfaLoading(true);
    try {
      const res = await api.get<{ total: number; users: { azure_id: string; mfa_registered: boolean | null; mfa_methods: string[] }[] }>("/azure/users/mfa-status");
      const map: Record<string, { mfa_registered: boolean | null; mfa_methods: string[] }> = {};
      for (const u of res.data.users) {
        map[u.azure_id] = { mfa_registered: u.mfa_registered, mfa_methods: u.mfa_methods };
      }
      setMfaStatus(map);
    } catch (error) {
      console.error("Error fetching MFA status:", error);
    } finally {
      setMfaLoading(false);
    }
  };

  const deleteUser = async (userId: string) => {
    setDeleting(true);
    try {
      await api.delete(`/users/${userId}`);
      setDeleteModal(null);
      fetchLocalUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user.");
    } finally {
      setDeleting(false);
    }
  };

  const syncUserToLocal = async (azureUserId: string) => {
    setSyncing(azureUserId);
    try {
      const res = await api.post(`/azure/sync-user/${azureUserId}`);
      if (res.data.action === 'created' && res.data.temp_password) {
        alert(
          `User synced successfully!\n\n` +
          `Username: ${res.data.azure_data?.display_name || azureUserId}\n` +
          `Temporary Password: ${res.data.temp_password}\n\n` +
          `Please share this password with the user. They can use it to log in to the ModZero Client App.\n` +
          `The password will not be shown again.`
        );
      } else {
        alert(`User ${res.data.action}: ${res.data.message}`);
      }
      // Refresh local users to show the newly synced user
      fetchLocalUsers();
    } catch (error) {
      console.error("Error syncing user:", error);
      alert("Failed to sync user to local database");
    } finally {
      setSyncing(null);
    }
  };

  const syncAllUsers = async () => {
    if (!confirm("This will sync all Azure users to the local database. Continue?")) {
      return;
    }

    setAzureLoading(true);
    try {
      const res = await api.post("/azure/sync-all-users");
      alert(`Sync completed: ${res.data.message}`);
      fetchLocalUsers(); // Refresh local users
    } catch (error) {
      console.error("Error syncing all users:", error);
      alert("Failed to sync all users");
    } finally {
      setAzureLoading(false);
    }
  };

  const toggleClientAccess = async (userId: string, current: boolean) => {
    setTogglingAccess(userId);
    try {
      await api.patch(`/users/${userId}`, { client_access_enabled: !current });
      fetchLocalUsers();
    } catch {
      alert("Failed to update client access");
    } finally {
      setTogglingAccess(null);
    }
  };

  const linkEntra = async () => {
    if (!linkModal) return;
    setLinking(true);
    try {
      await api.post(`/users/${linkModal.userId}/link-entra`, { entra_upn: linkUpn.trim() });
      setLinkModal(null);
      setLinkUpn("");
      fetchLocalUsers();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Failed to link Entra account");
    } finally {
      setLinking(false);
    }
  };

  const unlinkEntra = async (userId: string, username: string) => {
    if (!confirm(`Remove Entra link from ${username}? This will remove Entra signals for this user.`)) return;
    try {
      await api.delete(`/users/${userId}/link-entra`);
      fetchLocalUsers();
    } catch {
      alert("Failed to unlink Entra account");
    }
  };

  const deviceCountFor = (userId: string) =>
    devices.filter(d => d.user_id === userId).length;

  const createUser = async () => {
    setAddingUser(true);
    setAddUserError(null);
    try {
      await api.post("/auth/register", newUser);
      setAddUserModal(false);
      setNewUser({ username: "", email: "", password: "", role: "employee" });
      fetchLocalUsers();
    } catch (err: any) {
      setAddUserError(err?.response?.data?.detail || "Failed to create user");
    } finally {
      setAddingUser(false);
    }
  };

  return (
    <div>
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-80">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Delete User</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Are you sure you want to permanently delete <strong>{deleteModal.username}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteUser(deleteModal.userId)}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => setDeleteModal(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {addUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-96">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Add User</h3>
            {addUserError && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">{addUserError}</p>
            )}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Username</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Min 8 characters"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={createUser}
                disabled={addingUser || !newUser.username.trim() || !newUser.email.trim() || newUser.password.length < 8}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {addingUser ? "Creating…" : "Create User"}
              </button>
              <button
                onClick={() => { setAddUserModal(false); setAddUserError(null); }}
                disabled={addingUser}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {linkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-96">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              {linkModal.currentUpn ? "Update Entra Link" : "Link Entra Account"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">User: <strong>{linkModal.username}</strong></p>
            {linkModal.currentUpn && (
              <p className="text-xs text-gray-400 mb-3">Current: {linkModal.currentUpn}</p>
            )}
            <input
              type="email"
              value={linkUpn}
              onChange={e => setLinkUpn(e.target.value)}
              placeholder="user@yourdomain.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-3">
              <button
                onClick={linkEntra}
                disabled={linking || !linkUpn.trim()}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {linking ? "Linking…" : "Link"}
              </button>
              <button
                onClick={() => { setLinkModal(null); setLinkUpn(""); }}
                disabled={linking}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">User Management</h1>
        
        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('local')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'local'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Local Users ({localUsers.length})
          </button>
          <button
            onClick={() => setActiveTab('azure')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'azure'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Entra Users
          </button>
          <button
            onClick={() => setActiveTab('identity')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'identity'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Identity Signals
          </button>
        </div>
      </div>

      {activeTab === 'local' && (
        <div>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Users</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{localUsers.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Admins</p>
              <p className="text-2xl font-bold text-red-600">{localUsers.filter(u => u.role === 'admin').length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">With Devices</p>
              <p className="text-2xl font-bold text-purple-600">{localUsers.filter(u => deviceCountFor(u.user_id) > 0).length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Without MFA</p>
              <p className="text-2xl font-bold text-yellow-600">—</p>
              <p className="text-xs text-gray-400">Requires Graph</p>
            </div>
          </div>

          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Local Database Users</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setAddUserModal(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Add User
              </button>
              <button
                onClick={() => { fetchLocalUsers(); fetchDevices(); }}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">Loading local users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Access</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entra</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Linked Devices</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Trust Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {localUsers.map((user) => {
                    const devCount = deviceCountFor(user.user_id);
                    return (
                      <tr key={user.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          {user.username}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                          {user.email}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full capitalize ${
                            user.role?.toLowerCase() === 'admin'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => toggleClientAccess(user.user_id, user.client_access_enabled ?? true)}
                            disabled={togglingAccess === user.user_id}
                            title="Toggle client app access"
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50 ${
                              (user.client_access_enabled ?? true)
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                            }`}
                          >
                            {(user.client_access_enabled ?? true) ? 'Client ✓' : 'Web Only'}
                          </button>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          {user.linked_entra_upn ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="inline-flex px-2 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 rounded-full max-w-[130px] truncate" title={user.linked_entra_upn}>
                                {user.linked_entra_upn}
                              </span>
                              <button
                                onClick={() => unlinkEntra(user.user_id, user.username)}
                                className="text-xs text-red-500 hover:text-red-700"
                                title="Unlink Entra"
                              >✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setLinkModal({ userId: user.user_id, username: user.username, currentUpn: null }); setLinkUpn(""); }}
                              className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400"
                            >
                              + Link
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          {devCount > 0
                            ? <span className="inline-flex items-center gap-1 text-purple-600 font-medium">{devCount} device{devCount !== 1 ? 's' : ''}</span>
                            : <span className="text-gray-400">None</span>}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {userDetails[user.user_id]?.lastLogin
                            ? new Date(userDetails[user.user_id].lastLogin!).toLocaleString()
                            : <span className="text-gray-300 dark:text-gray-600">No activity</span>}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          {userDetails[user.user_id]?.avgScore != null
                            ? <span className={`font-semibold ${userDetails[user.user_id].avgScore! >= 80 ? "text-green-600" : userDetails[user.user_id].avgScore! >= 60 ? "text-amber-600" : "text-red-600"}`}>{userDetails[user.user_id].avgScore}</span>
                            : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => navigate(`/users/${user.user_id}`)}
                              className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                            >
                              Details
                            </button>
                            <button
                              onClick={() => setDeleteModal({ userId: user.user_id, username: user.username })}
                              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {localUsers.length === 0 && (
                <div className="text-center py-8 text-gray-500">No local users found</div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'azure' && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Azure Active Directory Integration</h2>
            
            {/* Connection Status */}
            {connectionStatus && (
              <div className={`p-3 rounded-md mb-4 ${
                connectionStatus.success 
                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                  : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
              }`}>
                <div className="flex items-center">
                  <span className={`w-2 h-2 rounded-full mr-2 ${
                    connectionStatus.success ? 'bg-green-500' : 'bg-red-500'
                  }`}></span>
                  {connectionStatus.message}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3 mb-4">
              <button
                onClick={fetchAzureUsers}
                disabled={azureLoading || !connectionStatus?.success}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {azureLoading ? "Loading..." : "Fetch Azure Users"}
              </button>
              
              {azureUsers.length > 0 && (
                <button
                  onClick={syncAllUsers}
                  disabled={azureLoading}
                  className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-400"
                >
                  Sync All to Local DB
                </button>
              )}
              
              <button
                onClick={testAzureConnection}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
              >
                Test Connection
              </button>
            </div>
          </div>

          {connectionStatus?.success && (
            <>
              {azureLoading && azureUsers.length === 0 ? (
                <div className="text-center py-8">Loading Azure users...</div>
              ) : azureUsers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Display Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Title</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                      {azureUsers.map((user) => (
                        <tr key={user.azure_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                            {user.display_name}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                            {user.email}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                            {user.job_title || '-'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                            {user.department || '-'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              user.account_enabled
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}>
                              {user.account_enabled ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => syncUserToLocal(user.azure_id)}
                              disabled={syncing === user.azure_id || !user.account_enabled}
                              className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 disabled:text-gray-400 disabled:cursor-not-allowed"
                            >
                              {syncing === user.azure_id ? 'Syncing...' : 'Sync to Local'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Click "Fetch Azure Users" to load users from Azure AD
                </div>
              )}
            </>
          )}

          {connectionStatus && !connectionStatus.success && (
            <div className="text-center py-8 text-gray-500">
              <p>Azure AD connection failed. Please check your configuration:</p>
              <ul className="mt-2 text-sm">
                <li>• Verify AZURE_TENANT_ID</li>
                <li>• Verify AZURE_CLIENT_ID</li>
                <li>• Verify AZURE_CLIENT_SECRET</li>
                <li>• Ensure the Azure app has proper Microsoft Graph permissions</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {activeTab === 'identity' && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-1">Identity Signals</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Per-user identity checks that feed into the Trust Scoring Engine.
              Local signals (max 50): Recent Login(+15) + Low Failed Logins(+25) + Not Locked(+10).
              Entra signals (require Entra enabled + user linked): Account Enabled(+30) + Role Valid(+20) + MFA Registered(+25) + Identity Risk Low(+20) + CA OK(+15).
              Score = min(earned, 100) — local-only users cap at 50/100.
            </p>
          </div>

          {/* Local auth explanation banner */}
          <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-800 dark:text-amber-300">
            <strong>Local Auth note:</strong> Account Enabled, Role Valid, MFA, Risk, and CA are resolved live from Microsoft Graph — local auth alone cannot verify these. A user shows real pass/fail values here only when Entra is enabled (Settings → Azure AD Integration) <em>and</em> that user has a linked Entra account (Entra Users tab). Unlinked users cap at 50/100 (Recent Login + Low Failed Logins + Not Locked). A disabled Entra account triggers a hard gate regardless of score.
          </div>

          {/* Local users signals */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">Local</span>
              Local User Identity Signals
              {identitySignalsLoading && <span className="text-xs text-gray-400 font-normal normal-case">refreshing…</span>}
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recent Login <span className="text-gray-400 normal-case font-normal">(+15)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Low Failed Logins <span className="text-gray-400 normal-case font-normal">(+25)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Not Locked <span className="text-gray-400 normal-case font-normal">(+10)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account Enabled <span className="text-gray-400 normal-case font-normal">(+30)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role Valid <span className="text-gray-400 normal-case font-normal">(+20)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">MFA Registered <span className="text-gray-400 normal-case font-normal">(+25)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Identity Risk Low <span className="text-gray-400 normal-case font-normal">(+20)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">CA OK <span className="text-gray-400 normal-case font-normal">(+15)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Identity Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Affects Trust</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {localUsers.map((user) => {
                    const data = identitySignals[user.user_id];
                    const score = data?.identity_score;
                    const scoreColor = score == null ? 'text-gray-400' : score >= 80 ? 'text-green-600 dark:text-green-400' : score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
                    const renderCell = (signalKey: string) => {
                      if (identitySignalsLoading && !data) {
                        return <span className="text-xs text-gray-400">…</span>;
                      }
                      const item = data?.breakdown?.find((b: any) => b.signal === signalKey);
                      if (!item) {
                        return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500" title="Enable Entra in Settings → Azure AD Integration to evaluate this signal">Entra disabled</span>;
                      }
                      if (item.passed === null) {
                        const linked = !!data.linked_entra_upn;
                        const label = !linked ? 'Not linked' : data.entra_matched === false ? 'Not matched' : 'N/A';
                        const title = !linked
                          ? 'This local user has no linked Entra account (link one in the Entra Users tab)'
                          : data.entra_matched === false
                            ? 'No matching user found in the Entra directory for this UPN'
                            : (item.note || 'Not available');
                        return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400" title={title}>{label}</span>;
                      }
                      if (item.passed) {
                        return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" title={item.note || ''}>Pass +{item.points}</span>;
                      }
                      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" title={item.note || ''}>Fail +0</span>;
                    };
                    return (
                      <tr key={user.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white">{user.username}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                          {data?.linked_entra_upn && (
                            <div className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">↔ {data.linked_entra_upn}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">{renderCell('recent_login')}</td>
                        <td className="px-4 py-3">{renderCell('low_failed_logins')}</td>
                        <td className="px-4 py-3">{renderCell('not_locked')}</td>
                        <td className="px-4 py-3">{renderCell('account_enabled')}</td>
                        <td className="px-4 py-3">{renderCell('role_valid')}</td>
                        <td className="px-4 py-3">{renderCell('mfa_registered')}</td>
                        <td className="px-4 py-3">{renderCell('identity_risk_low')}</td>
                        <td className="px-4 py-3">{renderCell('conditional_access_ok')}</td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold text-base ${scoreColor}`}>{score ?? '—'}</span>
                          <span className="text-xs text-gray-400 ml-1">/ 100</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">Yes</span>
                        </td>
                      </tr>
                    );
                  })}
                  {localUsers.length === 0 && !loading && (
                    <tr><td colSpan={11} className="px-4 py-6 text-center text-gray-400">No local users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Entra (Microsoft Graph) identity signals — signal reference / definitions */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">Entra</span>
              Entra Identity Signals (Microsoft Graph)
              <span className={`px-2 py-0.5 rounded text-xs ${entraEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                {entraEnabled ? 'Active' : 'Disabled'}
              </span>
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              {entraEnabled
                ? 'These signals are evaluated live per user at scoring time and contribute to the Identity Score. Real per-user pass/fail values for linked Entra accounts are shown in the Local User Identity Signals table above.'
                : 'Enable Entra in Settings → Azure AD Integration to activate these signals. While off they are N/A and never affect the score.'}
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Signal</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max Points</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {[
                    { name: 'Account Enabled', pts: 30, note: 'Hard gate — disabled account is always denied' },
                    { name: 'Role Valid', pts: 20, note: 'User has at least one Entra group/role membership' },
                    { name: 'MFA Registered', pts: 25, note: 'Multi-factor authentication method registered in Entra (Authenticator App, FIDO2, etc.)' },
                    { name: 'Identity Risk Low', pts: 20, note: 'Entra Identity Protection risk level is none or low for this user' },
                    { name: 'Conditional Access OK', pts: 15, note: 'Sign-in passed all applicable Conditional Access policies' },
                  ].map((s) => (
                    <tr key={s.name} className={entraEnabled ? '' : 'opacity-60'}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{s.name}</div>
                        {s.note && <div className="text-xs text-gray-400 mt-0.5">{s.note}</div>}
                      </td>
                      <td className="px-4 py-3">+{s.pts}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">Microsoft Graph</span></td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${entraEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {entraEnabled ? 'Active' : 'N/A'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;