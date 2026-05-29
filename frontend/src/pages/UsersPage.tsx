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

  const syncUserToLocal = async (azureUserId: string) => {
    setSyncing(azureUserId);
    try {
      const res = await api.post(`/azure/sync-user/${azureUserId}`);
      alert(`User ${res.data.action}: ${res.data.message}`);
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
            onClick={() => { setActiveTab('identity'); if (azureUsers.length === 0 && connectionStatus?.success) fetchAzureUsers(); }}
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
              <p className="text-2xl font-bold text-red-600">{localUsers.filter(u => u.role === 'ADMIN').length}</p>
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
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-400">—</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-400">—</td>
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
                              onClick={() => navigate(`/access-logs?user=${user.username}`)}
                              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                              Logs
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
              Identity / Policy Score = account_enabled(25) + mfa_registered(25) + user_type(15) + admin_risk(10) + recent_signin(15) + failed_login(10).
            </p>
          </div>

          {/* Local users signals (always available) */}
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account Enabled</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">MFA Registered</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failed Logins</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Identity Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Affects Trust</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {localUsers.map((user) => {
                    const isAdmin = user.role === 'ADMIN';
                    // Score: account_enabled(25) + user_type_member(15) + not_admin_risk(10) + low_failed_login(10) = 60 max (mfa/signin unknown)
                    const score = 25 + 15 + (isAdmin ? 0 : 10) + 10;
                    const maxAvailable = 60; // mfa + recent_signin not available locally
                    const identityScore = Math.round((score / maxAvailable) * 100);
                    return (
                      <tr key={user.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white">{user.username}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Pass +25</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">Not configured</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">Member +15</span>
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin
                            ? <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200">Yes +0</span>
                            : <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">No +10</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">0 +10</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold text-base ${identityScore >= 80 ? 'text-green-600 dark:text-green-400' : identityScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                            {identityScore}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">/ 100</span>
                          <div className="text-xs text-gray-400">partial (4/6 signals)</div>
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

          {/* Azure/Entra users signals */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">Entra</span>
              Entra / Azure AD Identity Signals
              {!connectionStatus?.success && (
                <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">Graph Not Configured</span>
              )}
            </h3>
            {!connectionStatus?.success ? (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                <p>Microsoft Graph is not configured. ModZero is currently using local user identity signals only.</p>
                <p className="mt-1 text-xs">Configure AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET to enable Entra identity signals.</p>
                <button onClick={testAzureConnection} className="mt-3 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 text-sm">
                  Test Connection
                </button>
              </div>
            ) : azureUsers.length === 0 ? (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-5 py-6 text-center text-sm text-gray-500">
                <p>Connected to Microsoft Graph.</p>
                <button onClick={fetchAzureUsers} disabled={azureLoading} className="mt-3 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm disabled:opacity-50">
                  {azureLoading ? 'Loading...' : 'Load Entra Users'}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account Enabled</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">MFA Registered</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin Role</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failed Logins</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Identity Score</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Affects Trust</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {azureUsers.map((user) => {
                      const isGuest = user.userType === 'Guest';
                      const isEnabled = user.account_enabled;
                      // Score: account_enabled(25) + user_type_member(15) = 40 max (mfa/admin/signin not available without extra permissions)
                      const score = (isEnabled ? 25 : 0) + (isGuest ? 0 : 15);
                      const identityScore = Math.round((score / 40) * 100);
                      return (
                        <tr key={user.azure_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900 dark:text-white">{user.display_name}</div>
                            <div className="text-xs text-gray-500">{user.email}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${isEnabled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                              {isEnabled ? 'Pass +25' : 'Fail +0'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" title="Requires UserAuthenticationMethod.Read.All permission">
                              Not configured
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${isGuest ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'}`}>
                              {isGuest ? 'Guest +0' : 'Member +15'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" title="Requires RoleManagement.Read.All permission">
                              Not configured
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">Not configured</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-semibold text-base ${identityScore >= 80 ? 'text-green-600 dark:text-green-400' : identityScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                              {identityScore}
                            </span>
                            <span className="text-xs text-gray-400 ml-1">/ 100</span>
                            <div className="text-xs text-gray-400">partial (2/6 signals)</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">Yes</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 px-2">
                  MFA registration, admin role, and sign-in signals require additional Microsoft Graph permissions (UserAuthenticationMethod.Read.All, RoleManagement.Read.All, AuditLog.Read.All).
                  Scores shown are based on available signals only.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;