import React, { useEffect, useState } from "react";
import api from "../api";
import { AzureConnectionTest } from "../types";
import {
  FaCog,
  FaCloud,
  FaCheckCircle,
  FaTimesCircle,
  FaSync,
  FaDatabase,
  FaShieldAlt,
  FaMoon,
  FaSun,
} from "react-icons/fa";
import toast from "react-hot-toast";
import ClientAppDownloadCard from "../components/ClientAppDownloadCard";

const SettingsPage: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<AzureConnectionTest | null>(null);
  const [testing, setTesting] = useState(false);
  const [darkMode, setDarkMode] = useState(
    document.documentElement.classList.contains("dark")
  );
  const [cacheStatus, setCacheStatus] = useState<any>(null);
  const [cacheUnavailable, setCacheUnavailable] = useState(false);

  // Entra integration toggle (persisted in TrustPolicyConfig)
  const [entraEnabled, setEntraEnabled] = useState(false);
  const [azureConnected, setAzureConnected] = useState<boolean | null>(null);
  const [entraSaving, setEntraSaving] = useState(false);

  useEffect(() => {
    fetchCacheStatus();
    fetchEntraStatus();
  }, []);

  const fetchEntraStatus = async () => {
    try {
      const res = await api.get("/trust-policy/active");
      setEntraEnabled(!!res.data.entra_enabled);
      setAzureConnected(res.data.azure_connected ?? null);
    } catch {
      /* admin-only endpoint; ignore for non-admins */
    }
  };

  const toggleEntra = async () => {
    const next = !entraEnabled;
    setEntraSaving(true);
    try {
      const res = await api.patch("/trust-policy/active", { entra_enabled: next });
      setEntraEnabled(!!res.data.entra_enabled);
      setAzureConnected(res.data.azure_connected ?? azureConnected);
      toast.success(next ? "Entra signals enabled" : "Entra signals disabled");
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      toast.error(detail || "Could not update Entra setting");
    } finally {
      setEntraSaving(false);
    }
  };

  const fetchCacheStatus = async () => {
    try {
      const res = await api.get("/assessment/cache-status");
      setCacheStatus(res.data);
      setCacheUnavailable(false);
    } catch (error) {
      setCacheUnavailable(true);
    }
  };

  const testAzureConnection = async () => {
    setTesting(true);
    try {
      const res = await api.get<AzureConnectionTest>("/azure/test-connection");
      setConnectionStatus(res.data);
      setAzureConnected(res.data.success);
      if (res.data.success) {
        toast.success("Azure connection successful");
      } else {
        toast.error(res.data.message || "Connection failed");
      }
    } catch (error) {
      toast.error("Failed to test connection");
      setConnectionStatus({
        success: false,
        message: "Connection test failed",
        token_acquired: false,
        api_accessible: false,
      });
    } finally {
      setTesting(false);
    }
  };

  const clearCache = async () => {
    try {
      await api.post("/assessment/refresh", null, { params: { data_type: "all" } });
      await fetchCacheStatus();
      toast.success("Cache cleared and refreshed");
    } catch (error) {
      toast.error("Failed to clear cache");
    }
  };

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
    toast.success(`${newMode ? "Dark" : "Light"} mode enabled`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Desktop Client download */}
      <ClientAppDownloadCard />

      {/* Appearance Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <FaCog className="text-xl text-indigo-600" />
          <h2 className="text-lg font-semibold">Appearance</h2>
        </div>
        <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="font-medium">Dark Mode</p>
            <p className="text-sm text-gray-500">Toggle dark mode for the interface</p>
          </div>
          <button
            onClick={toggleDarkMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              darkMode ? "bg-indigo-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                darkMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
            {darkMode ? (
              <FaMoon className="absolute right-1 text-xs text-white" />
            ) : (
              <FaSun className="absolute left-1 text-xs text-yellow-500" />
            )}
          </button>
        </div>
      </div>

      {/* Azure Integration Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <FaCloud className="text-xl text-blue-500" />
          <h2 className="text-lg font-semibold">Azure AD Integration</h2>
        </div>

        <div className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
            <div>
              <p className="font-medium">Connection Status</p>
              <p className="text-sm text-gray-500">Test your Azure AD connection</p>
            </div>
            <div className="flex items-center gap-3">
              {connectionStatus && (
                <span
                  className={`flex items-center gap-1 text-sm ${
                    connectionStatus.success ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {connectionStatus.success ? (
                    <>
                      <FaCheckCircle /> Connected
                    </>
                  ) : (
                    <>
                      <FaTimesCircle /> Disconnected
                    </>
                  )}
                </span>
              )}
              <button
                onClick={testAzureConnection}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <FaSync className={testing ? "animate-spin" : ""} />
                Test Connection
              </button>
            </div>
          </div>

          {/* Connection Details */}
          {connectionStatus && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <h4 className="text-sm font-medium mb-2">Connection Details</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      connectionStatus.token_acquired ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  Token Acquired: {connectionStatus.token_acquired ? "Yes" : "No"}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      connectionStatus.api_accessible ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  API Accessible: {connectionStatus.api_accessible ? "Yes" : "No"}
                </div>
              </div>
              {connectionStatus.message && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {connectionStatus.message}
                </p>
              )}
            </div>
          )}

          {/* Entra signals toggle */}
          <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="pr-4">
              <p className="font-medium">Enable Entra Identity &amp; Device Signals</p>
              <p className="text-sm text-gray-500">
                Overlays live Microsoft Graph signals onto the trust score and enforces the
                identity hard gate. Requires a working connection — run Test Connection first.
              </p>
            </div>
            <button
              onClick={toggleEntra}
              disabled={entraSaving || (!entraEnabled && azureConnected === false)}
              title={!entraEnabled && azureConnected === false ? "Test Connection must succeed first" : ""}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                entraEnabled ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  entraEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Unlocked tests */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-300 mb-2">
              {entraEnabled ? (
                <><strong>Entra signals are active.</strong> These additional tests now contribute to the trust score:</>
              ) : (
                <><strong>When enabled,</strong> these additional tests are unlocked (N/A while off, never penalising):</>
              )}
            </p>
            <ul className="text-sm text-blue-800 dark:text-blue-300 grid sm:grid-cols-3 gap-x-6 gap-y-1 list-disc list-inside">
              <li>Identity: MFA Registered</li>
              <li>Identity: Identity Risk Low</li>
              <li>Identity: Conditional Access OK</li>
              <li>Device: Entra Registered</li>
              <li>Device: Intune Managed</li>
              <li>Device: Intune Encrypted</li>
              <li>Context: Sign-in Risk Low</li>
              <li>Context: Trusted Location</li>
            </ul>
            <p className="text-xs text-blue-700/80 dark:text-blue-300/70 mt-2">
              Credentials come from <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET</code>.
              A disabled Entra account is denied outright regardless of score.
            </p>
          </div>
        </div>
      </div>

      {/* Data Cache Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <FaDatabase className="text-xl text-green-500" />
          <h2 className="text-lg font-semibold">Data Cache</h2>
        </div>

        {cacheUnavailable ? (
          <p className="text-sm text-gray-500">Cache status unavailable on this deployment.</p>
        ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
            <div>
              <p className="font-medium">Assessment Data Cache</p>
              <p className="text-sm text-gray-500">
                Cached data expires after 1 hour. Clear cache to fetch fresh data.
              </p>
            </div>
            <button
              onClick={clearCache}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              <FaSync />
              Clear & Refresh
            </button>
          </div>

          {/* Cache Status */}
          {cacheStatus?.cache_status && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Data Type
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Last Synced
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {Object.entries(cacheStatus.cache_status).map(([key, value]: [string, any]) => (
                    <tr key={key}>
                      <td className="px-4 py-2 text-sm font-medium">{key}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {value.last_synced
                          ? new Date(value.last_synced).toLocaleString()
                          : "Never"}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            value.is_expired
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {value.is_expired ? "Expired" : "Valid"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Security Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <FaShieldAlt className="text-xl text-purple-500" />
          <h2 className="text-lg font-semibold">Security</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
            <div>
              <p className="font-medium">Session Timeout</p>
              <p className="text-sm text-gray-500">
                Login sessions expire 8 hours after sign-in
              </p>
            </div>
            <span className="text-sm text-gray-500">480 minutes</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">Environment</p>
              <p className="text-sm text-gray-500">Current deployment environment</p>
            </div>
            <span className={`px-3 py-1 rounded text-sm ${
              (import.meta as any).env.PROD
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {(import.meta as any).env.PROD ? 'Production' : 'Development'}
            </span>
          </div>
          <div className="pt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <strong>Note:</strong> Admin console access uses admin authentication only.
              Client device posture enforcement for the admin console can be enabled as a future enhancement.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};

export default SettingsPage;