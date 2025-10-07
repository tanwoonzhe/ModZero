import React, { useEffect, useState } from "react";
import api from "../api";
import { User, AzureUser, AzureUsersResponse, AzureConnectionTest } from "../types";

const UsersPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'local' | 'azure'>('local');
  const [localUsers, setLocalUsers] = useState<User[]>([]);
  const [azureUsers, setAzureUsers] = useState<AzureUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [azureLoading, setAzureLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<AzureConnectionTest | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null); // Track which user is being synced

  useEffect(() => {
    fetchLocalUsers();
  }, []);

  useEffect(() => {
    if (activeTab === 'azure') {
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

  return (
    <div>
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
            Azure AD Users
          </button>
        </div>
      </div>

      {activeTab === 'local' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Local Database Users</h2>
            <button
              onClick={fetchLocalUsers}
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {localUsers.map((user) => (
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
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
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
    </div>
  );
};

export default UsersPage;