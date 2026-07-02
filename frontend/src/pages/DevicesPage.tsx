import React, { useEffect, useState } from "react";
import api from "../api";
import { DeviceAssessmentData } from "../types";
import {
  FaSync,
  FaDesktop,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaLock,
  FaApple,
  FaWindows,
  FaAndroid,
  FaClock,
  FaShieldAlt,
  FaTimes,
} from "react-icons/fa";
import toast from "react-hot-toast";

const getStatusConfig = (status: string) => {
  switch (status) {
    case "Passed": 
      return { icon: FaCheckCircle, color: "text-green-600", bgColor: "bg-green-100", textColor: "text-green-800" };
    case "Failed": 
      return { icon: FaTimesCircle, color: "text-red-600", bgColor: "bg-red-100", textColor: "text-red-800" };
    case "Investigate": 
      return { icon: FaExclamationTriangle, color: "text-amber-500", bgColor: "bg-amber-100", textColor: "text-amber-800" };
    case "Skipped":
    case "Planned":
      return { icon: FaClock, color: "text-gray-500", bgColor: "bg-gray-100", textColor: "text-gray-700" };
    default: 
      return { icon: FaClock, color: "text-blue-500", bgColor: "bg-blue-100", textColor: "text-blue-800" };
  }
};

// Live test result from /api/device-tests
interface LiveTestResult {
  testId: string;
  name: string;
  description: string;
  status: "pass" | "fail" | "warning" | "error" | "not_applicable";
  details: string;
  data: any;
  recommendation: string;
  timestamp: string;
}

interface LiveTestsResponse {
  category: string;
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    errors: number;
    score: number;
  };
  tests: LiveTestResult[];
}

// Map live API status to UI status
const mapLiveStatus = (status: string): string => {
  switch (status) {
    case "pass": return "Passed";
    case "fail": return "Failed";
    case "warning": return "Investigate";
    case "error": return "Failed";
    case "not_applicable": return "Skipped";
    default: return "Investigate";
  }
};

const DevicesPage: React.FC = () => {
  const [data, setData] = useState<DeviceAssessmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"inventory" | "posture">("inventory");

  // Per-device real posture data: deviceId → posture report from /devices/{id}/posture
  const [localDevices, setLocalDevices] = useState<any[]>([]);
  const [postureByDevice, setPostureByDevice] = useState<Record<string, any>>({});
  const [postureLoading, setPostureLoading] = useState(false);

  // Live tests state
  const [selectedLiveTest, setSelectedLiveTest] = useState<LiveTestResult | null>(null);

  const fetchData = async () => {
    try {
      const res = await api.get<DeviceAssessmentData>("/assessment/devices");
      setData(res.data);
    } catch (error) {
      console.error("Failed to fetch Intune device data:", error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocalDevicesAndPosture = async () => {
    setPostureLoading(true);
    try {
      const devRes = await api.get<any[]>("/devices");
      const devs = Array.isArray(devRes.data) ? devRes.data : [];
      setLocalDevices(devs);

      const postureMap: Record<string, any> = {};
      await Promise.allSettled(
        devs.map(async (d: any) => {
          try {
            // trust-contribution returns the full persisted DeviceTrustScore:
            // device + context + identity (incl. Entra signals) + total, not
            // just the device module that /posture alone gave us.
            const r = await api.get(`/devices/${d.device_id}/trust-contribution`);
            if (r.data?.posture_score != null) {
              postureMap[d.device_id] = r.data;
            }
          } catch {}
        })
      );
      setPostureByDevice(postureMap);
    } catch (err) {
      console.error("Failed to fetch local devices:", err);
    } finally {
      setPostureLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchLocalDevicesAndPosture();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.post("/assessment/refresh", null, { params: { data_type: "device_assessment" } });
      await Promise.all([fetchData(), fetchLocalDevicesAndPosture()]);
      toast.success("Device data refreshed");
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Intune aggregate stats (null if Intune not connected)
  const intuneData = data?.data ?? null;
  const intuneDevices: any[] = intuneData?.devices ?? [];
  const lastSynced = data?.last_synced ? new Date(data.last_synced).toLocaleString() : new Date().toLocaleString();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Device Assessment</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            Last synced: {lastSynced}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            <FaSync className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab("inventory")}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === "inventory"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Device Inventory
          </button>
          <button
            onClick={() => setActiveTab("posture")}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === "posture"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Device Posture Checks
          </button>
        </nav>
      </div>

      {/* Live Test Detail Modal */}
      {selectedLiveTest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-start">
              <div>
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{selectedLiveTest.testId}</span>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1">{selectedLiveTest.name}</h2>
              </div>
              <button
                onClick={() => setSelectedLiveTest(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <FaTimes />
              </button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              {/* Status Badge */}
              <div>
                {(() => {
                  const config = getStatusConfig(mapLiveStatus(selectedLiveTest.status));
                  const Icon = config.icon;
                  return (
                    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${config.bgColor} ${config.textColor}`}>
                      <Icon size={14} />
                      {mapLiveStatus(selectedLiveTest.status)}
                    </span>
                  );
                })()}
              </div>

              {/* Description */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Description</h3>
                <p className="text-gray-700 dark:text-gray-300 text-sm">{selectedLiveTest.description}</p>
              </div>

              {/* Details */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Test Result Details</h3>
                <p className="text-gray-700 dark:text-gray-300 text-sm">{selectedLiveTest.details}</p>
              </div>

              {/* Recommendation */}
              {selectedLiveTest.recommendation && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Recommendation</h3>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">{selectedLiveTest.recommendation}</p>
                </div>
              )}

              {/* Data */}
              {selectedLiveTest.data && Object.keys(selectedLiveTest.data).length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Raw Data</h3>
                  <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-auto max-h-48 bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                    {JSON.stringify(selectedLiveTest.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "posture" ? (
        /* Device Posture Checks Tab — real-time device + context + identity
           signals from registered devices, styled to match the Users page's
           Identity Signals tab (colored module/source pills, Pass/Fail/N/A badges). */
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow px-6 py-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Device Posture Checks</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Full per-device trust breakdown submitted by the ModZero Client App: Device Posture, Context, and Identity (including linked Entra signals) — the same three modules and weights used by the Trust Scoring Engine. Windows-only device checks (Firewall, AV, Disk Encryption, Screen Lock) show N/A on non-Windows — excluded from the score denominator, not counted as failures.
            </p>
          </div>
          {postureLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : Object.keys(postureByDevice).length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow px-6 py-10 text-center">
              <FaShieldAlt className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={36} />
              <p className="text-gray-500 text-sm font-medium">No posture reports found.</p>
              <p className="text-xs text-gray-400 mt-1">Install the ModZero Client App and run a Device Check to see data here.</p>
            </div>
          ) : (
            Object.entries(postureByDevice).map(([deviceId, trust]) => {
              const device = localDevices.find(d => d.device_id === deviceId);

              const CHECK_LABELS: Record<string, string> = {
                firewall_enabled:        "Firewall Enabled",
                antivirus_enabled:       "Antivirus Enabled",
                disk_encryption_enabled: "Disk Encryption",
                screen_lock_enabled:     "Screen Lock",
                os_supported:            "OS Version Supported",
                client_healthy:          "Client App Healthy",
                recent_check:            "Recent Check",
                intune_compliant:        "Intune Compliant",
                entra_registered:        "Entra Registered",
                intune_managed:          "Intune Managed",
                intune_encrypted:        "Intune Encrypted",
                known_device:               "Known Device",
                normal_access_time:         "Normal Access Time",
                no_repeated_failed_login:   "No Repeated Failed Login",
                normal_ip:                  "Normal IP",
                known_user_device_pair:     "Known User-Device Pair",
                resource_pattern_normal:    "Normal Resource Pattern",
                gateway_online:              "Gateway Online",
                signin_risk_low:             "Sign-in Risk Low",
                trusted_location:            "Trusted Location",
                low_failed_logins:          "Low Failed Logins",
                not_locked:                  "Not Locked",
                entra_linked:                "Entra Linked",
                password_changed_recently:  "Password Changed Recently",
                account_enabled:             "Account Enabled",
                role_valid:                  "Role Valid",
                mfa_registered:              "MFA Registered",
                identity_risk_low:           "Identity Risk Low",
                conditional_access_ok:       "Conditional Access OK",
              };
              const CHECK_DESCRIPTIONS: Record<string, string> = {
                firewall_enabled:        "Windows Firewall is enabled on at least one network profile",
                antivirus_enabled:       "Windows Defender or registered antivirus is active and up to date",
                disk_encryption_enabled: "BitLocker system drive is fully encrypted with protection on",
                screen_lock_enabled:     "Secure screensaver or console-lock timeout is configured",
                os_supported:            "Windows major version is 10 or later",
                client_healthy:          "Client fingerprint file exists and is readable",
                recent_check:            "Last posture report was submitted within 7 days",
                intune_compliant:        "Device is marked compliant by Intune",
                entra_registered:        "Device is registered in Entra ID directory",
                intune_managed:          "Device is enrolled and managed by Intune MDM",
                intune_encrypted:        "Intune reports the device disk as encrypted",
                known_device:               "This device has been seen before and is registered with ModZero",
                normal_access_time:         "Request occurred within the admin-configured allowed hours window",
                no_repeated_failed_login:   "Login attempts are within the configured failure threshold",
                normal_ip:                  "Request did not originate from a flagged/suspicious IP address",
                known_user_device_pair:     "This user has used this device before",
                resource_pattern_normal:    "Requested resource matches this user's typical access pattern",
                gateway_online:              "The connector/gateway serving this request is reachable",
                signin_risk_low:             "Entra ID Protection reports low risk for this sign-in",
                trusted_location:            "Sign-in originated from an Entra-recognized trusted network location",
                low_failed_logins:          "Fewer than the configured failed-login limit in the current window",
                not_locked:                  "Account is not currently locked out",
                entra_linked:                "Local account is linked to an Entra identity",
                password_changed_recently:  "Password was changed within the max-age policy window",
                account_enabled:             "Entra account is enabled (not disabled by an admin)",
                role_valid:                  "User belongs to the Entra group/role required by policy",
                mfa_registered:              "User has at least one MFA method registered in Entra",
                identity_risk_low:           "Entra ID Protection reports low identity risk for this user",
                conditional_access_ok:       "User satisfies all applicable Entra Conditional Access policies",
              };
              const MODULE_META: Record<string, { label: string; pill: string }> = {
                device:   { label: "Device",   pill: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" },
                context:  { label: "Context",  pill: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300" },
                identity: { label: "Identity", pill: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
              };
              const getModule = (item: any): "device" | "context" | "identity" =>
                item.module === "context_analysis" ? "context" : item.module === "identity" ? "identity" : "device";
              const getKey = (item: any): string => item.signal ?? item.factor ?? "unknown";
              const formatKey = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

              const scoreColor = (s: number | null | undefined) =>
                s == null ? "text-gray-400" : s >= 80 ? "text-green-600 dark:text-green-400" : s >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

              const breakdown: any[] = trust.breakdown || [];

              return (
                <div key={deviceId} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                  <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <FaDesktop className="text-indigo-500" size={13} />
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {device?.device_name ?? deviceId}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        · Last checked: {trust.calculated_at ? new Date(trust.calculated_at).toLocaleString() : "—"}
                      </span>
                    </div>
                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                      trust.total_score >= 80 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : trust.total_score >= 60 ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                    }`}>
                      Total Trust Score: {Math.round(trust.total_score)} / 100 (threshold {trust.threshold ?? "—"})
                    </span>
                  </div>

                  {(trust.hard_denied_client || trust.hard_denied_resources) && (
                    <div className="px-6 py-2 space-y-1 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-700">
                      {trust.hard_denied_client && (
                        <p className="text-xs text-red-700 dark:text-red-300">
                          <strong>Client login blocked:</strong> {trust.hard_deny_client_reason || "a deny_immediately_client signal failed on this check"}. Clears automatically on the next passing check — does not change this user's Client/Web-Only access setting.
                        </p>
                      )}
                      {trust.hard_denied_resources && (
                        <p className="text-xs text-red-700 dark:text-red-300">
                          <strong>Resource access blocked:</strong> {trust.hard_deny_reason || "a deny_immediately_resources signal failed on this check"}. Clears automatically on the next passing check.
                        </p>
                      )}
                    </div>
                  )}

                  {/* 3-module weighted formula, same layout as the user detail page */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                    {[
                      { key: "device",   label: "Device Posture", score: trust.posture_score,  weight: trust.posture_weight,  contrib: trust.trust_contribution },
                      { key: "context",  label: "Context",        score: trust.context_score,   weight: trust.context_weight,  contrib: trust.context_contribution },
                      { key: "identity", label: "Identity",       score: trust.identity_score,  weight: trust.identity_weight, contrib: trust.identity_contribution },
                    ].map((m) => (
                      <div key={m.key} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${MODULE_META[m.key].pill}`}>{m.label}</span>
                        </div>
                        <div className={`text-xl font-bold mt-1 ${scoreColor(m.score)}`}>{m.score != null ? m.score.toFixed(1) : "—"}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          × {m.weight != null ? Math.round(m.weight * 100) : "—"}% weight = <span className="font-medium text-gray-600 dark:text-gray-300">{m.contrib != null ? m.contrib.toFixed(1) : "—"}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Module</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Check</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {breakdown.length === 0 && (
                          <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-sm">No breakdown available for this check.</td></tr>
                        )}
                        {breakdown.map((item: any, idx: number) => {
                          const mod = getModule(item);
                          const key = getKey(item);
                          const label = CHECK_LABELS[key] ?? formatKey(key);
                          const description = CHECK_DESCRIPTIONS[key];
                          const isEntra = item.source === "entra";
                          const isNA = item.passed == null;
                          const resultLabel = isNA ? "N/A" : item.passed ? `Pass +${item.points ?? 0}` : "Fail +0";
                          const resultClass = isNA
                            ? "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                            : item.passed
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
                          const noteText = isNA
                            ? (isEntra
                                ? "N/A — requires Entra (not linked, not matched, or not configured)"
                                : item.note === "not configured"
                                  ? "Not configured (requires Intune)"
                                  : item.note || "Not collected on this platform")
                            : (item.note ?? "");
                          return (
                            <tr key={`${key}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded ${MODULE_META[mod].pill}`}>{MODULE_META[mod].label}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                                  {isEntra && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">Entra</span>
                                  )}
                                </div>
                                {description && <div className="text-xs text-gray-400 mt-0.5">{description}</div>}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${resultClass}`}>
                                  {resultLabel}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs font-mono text-gray-600 dark:text-gray-300">
                                {isNA ? "—" : `${item.points ?? 0} / ${item.max ?? "—"}`}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-400 italic">{noteText}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : activeTab === "inventory" ? (
        /* Device Inventory */
        <div className="space-y-4">
          {/* Local devices (registered with ModZero) */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Registered Devices ({localDevices.length})</h3>
            {localDevices.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No registered devices found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OS Version</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fingerprint</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Posture Score</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Check</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {localDevices.map((device: any) => {
                      const posture = postureByDevice[device.device_id];
                      const score = posture?.posture_score ?? null;
                      return (
                        <tr key={device.device_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <FaWindows className="text-blue-500" />
                              {device.device_name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">{device.os_version || "—"}</td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-400">{device.fingerprint ? device.fingerprint.slice(0, 12) + "…" : "—"}</td>
                          <td className="px-4 py-3">
                            {score != null ? (
                              <span className={`font-bold text-sm ${score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-600" : "text-red-600"}`}>{Math.round(score)} / 100</span>
                            ) : (
                              <span className="text-xs text-gray-400">No report</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {posture?.calculated_at ? new Date(posture.calculated_at).toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {device.registered_at ? new Date(device.registered_at).toLocaleString() : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Intune managed devices (if connected) */}
          {intuneDevices.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">Intune Managed Devices ({intuneDevices.length})</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OS</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Compliance</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Encrypted</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {intuneDevices.map((device: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2"><OSIcon os={device.operatingSystem} />{device.deviceName}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">{device.operatingSystem} {device.osVersion}</td>
                        <td className="px-4 py-3 text-sm">{device.userPrincipalName || "—"}</td>
                        <td className="px-4 py-3"><ComplianceBadge state={device.complianceState} /></td>
                        <td className="px-4 py-3">{device.isEncrypted ? <FaLock className="text-green-500" /> : <span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{device.lastSyncDateTime ? new Date(device.lastSyncDateTime).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

// OS Icon Component
const OSIcon: React.FC<{ os: string }> = ({ os }) => {
  const osLower = (os || "").toLowerCase();
  if (osLower.includes("windows")) return <FaWindows className="text-blue-500" />;
  if (osLower.includes("mac") || osLower.includes("ios")) return <FaApple className="text-gray-500" />;
  if (osLower.includes("android")) return <FaAndroid className="text-green-500" />;
  return <FaDesktop className="text-gray-400" />;
};

// Compliance Badge Component
const ComplianceBadge: React.FC<{ state: string }> = ({ state }) => {
  const colors: Record<string, string> = {
    compliant: "bg-green-100 text-green-800",
    noncompliant: "bg-red-100 text-red-800",
    unknown: "bg-gray-100 text-gray-800",
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[state] || colors.unknown}`}>
      {state || "Unknown"}
    </span>
  );
};

export default DevicesPage;