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
  const [roleModal, setRoleModal] = useState<{ userId: string; current: string } | null>(null);
  const [roleUpdating, setRoleUpdating] = useState(false);
  const [userDetails, setUserDetails] = useState<Record<string, { lastLogin: string | null; avgScore: number | null }>>({});
  const [mfaStatus, setMfaStatus] = useState<Record<string, { mfa_registered: boolean | null; mfa_methods: string[] }>>({});
  const [mfaLoading, setMfaLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ userId: string; username: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [entraEnabled, setEntraEnabled] = useState(false);

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
            details[u.user_id] = {
              lastLogin: lastAttempt?.timestamp ?? (attempts[0]?.timestamp ?? null),
              avgScore: scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null,
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

  const assignRole = async (userId: string, newRole: string) => {
    setRoleUpdating(true);
    try {
      await api.patch(`/users/${userId}`, { role: newRole });
      await fetchLocalUsers();
      setRoleModal(null);
    } catch {
      alert("Failed to update role");
    } finally {
      setRoleUpdating(false);
    }
  };

  const deviceCountFor = (userId: string) =>
    devices.filter(d => d.user_id === userId).length;

  return (
    <div>
      {/* Role Assignment Modal */}
      {roleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-80">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Assign Role</h3>
            <p className="text-sm text-gray-500 mb-4">Current role: <strong>{roleModal.current}</strong></p>
            <div className="flex flex-col gap-2">
              {["ADMIN", "EMPLOYEE"].map(r => (
                <button
                  key={r}
                  disabled={roleUpdating || r === roleModal.current}
                  onClick={() => assignRole(roleModal.userId, r)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {r === roleModal.current ? `${r} (current)` : `Set as ${r}`}
                </button>
              ))}
            </div>
            <button
              onClick={() => setRoleModal(null)}
              className="mt-4 w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
            onClick={() => { setActiveTab('identity'); if (azureUsers.length === 0 && connectionStatus?.success) fetchAzureUsers(); if (Object.keys(mfaStatus).length === 0) fetchMfaStatus(); }}
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
            <button
              onClick={() => { fetchLocalUsers(); fetchDevices(); }}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
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
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.role === 'ADMIN'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          }`}>
                            {user.role}
                          </span>
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
                              onClick={() => setRoleModal({ userId: user.user_id, current: user.role })}
                              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                              Role
                            </button>
                            <button
                              onClick={() => navigate(`/logs?user=${user.username}`)}
                              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                              Logs
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
              Identity Score = Account Enabled(+30) + Role Valid(+20) + Recent Login(+15) + Low Failed Logins(+25) + Not Locked(+10) = 100 pts.
            </p>
          </div>

          {/* Local auth explanation banner */}
          <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-800 dark:text-amber-300">
            <strong>Local Auth note:</strong> For local users, all five signals are structurally always-pass because holding a valid JWT already proves account_enabled, role_valid, recent_login, not_locked, and no failed-login tracking exists (assumed clean). These signals become meaningful when Azure AD (Entra) is integrated — a disabled Azure account is denied outright (hard gate), and the extra Entra signals below contribute to the identity score.
          </div>

          {/* Local users signals */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">Local</span>
              Local User Identity Signals
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account Enabled <span className="text-gray-400 normal-case font-normal">(+30)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role Valid <span className="text-gray-400 normal-case font-normal">(+20)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recent Login <span className="text-gray-400 normal-case font-normal">(+15)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failed Logins <span className="text-gray-400 normal-case font-normal">(+25)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Not Locked <span className="text-gray-400 normal-case font-normal">(+10)</span></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Identity Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Affects Trust</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {localUsers.map((user) => {
                    // Backend identity_signal_service.py: for local auth all signals are True
                    // because a valid JWT proves account_enabled + role_valid + recent_login,
                    // and there is no failed-login or lock tracking (assumed clean).
                    // role is non-nullable (ADMIN or EMPLOYEE), so role_valid is always True.
                    const roleValid = user.role != null;
                    // recent_login: backend always sets True for JWT holders (active session proves it)
                    // DO NOT use access-log history here — that's a different metric.
                    const identityScore = 30 + (roleValid ? 20 : 0) + 15 + 25 + 10;
                    return (
                      <tr key={user.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white">{user.username}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" title="Verified by valid JWT">Pass +30</span>
                        </td>
                        <td className="px-4 py-3">
                          {roleValid
                            ? <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">{user.role} +20</span>
                            : <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200">No role +0</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" title="Active JWT proves recent authentication">Pass +15</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" title="No failed-login tracking in local DB — assumed clean">Clean +25</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" title="No account-lock field in local DB — assumed unlocked">Pass +10</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold text-base ${identityScore >= 80 ? 'text-green-600 dark:text-green-400' : identityScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                            {identityScore}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">/ 100</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">Yes</span>
                        </td>
                      </tr>
                    );
                  })}
                  {localUsers.length === 0 && !loading && (
                    <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">No local users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Entra (Microsoft Graph) identity signals — gated by the single Settings toggle */}
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
                ? 'These signals are evaluated live per user at scoring time and contribute to the Identity Score. Per-evaluation results appear in the client app Device Check breakdown.'
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
                    { name: 'MFA Registered', pts: 25 },
                    { name: 'Identity Risk Low', pts: 20 },
                    { name: 'Conditional Access OK', pts: 15 },
                  ].map((s) => (
                    <tr key={s.name} className={entraEnabled ? '' : 'opacity-60'}>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.name}</td>
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