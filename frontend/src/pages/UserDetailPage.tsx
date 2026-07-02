import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { FaArrowLeft, FaUser, FaDesktop, FaHistory, FaCheck, FaTimes, FaSpinner, FaExclamationTriangle } from "react-icons/fa";
import toast from "react-hot-toast";
import api from "../api";

interface TrustBreakdownItem {
  signal: string;
  passed: boolean | null;
  points: number;
  max: number;
  module: string;
  source?: string;
  note?: string;
}

interface LatestTrustScore {
  posture_score: number;
  context_score: number;
  identity_score: number;
  total_score: number;
  breakdown: TrustBreakdownItem[] | null;
  calculated_at: string | null;
}

interface UserDetails {
  user: {
    user_id: string;
    username: string;
    email: string;
    role: string;
    auth_provider: string;
    client_access_enabled: boolean;
    linked_entra_upn: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  devices: {
    device_id: string;
    device_name: string;
    os_version: string | null;
    fingerprint: string | null;
    registered_at: string | null;
    latest_trust_score: LatestTrustScore | null;
  }[];
  recent_attempts: {
    attempt_id: string;
    timestamp: string | null;
    result: string;
    ip_address: string | null;
    device_id: string | null;
    total_score: number | null;
    reason: string | null;
    resource_name: string | null;
  }[];
  stats: {
    total_devices: number;
    total_attempts: number;
    allowed_attempts: number;
    denied_attempts: number;
  };
  current_weights: {
    device: number;
    context: number;
    identity: number;
  };
}

const MODULE_LABELS: Record<string, string> = {
  device_posture: "Device",
  context: "Context",
  identity: "Identity",
};

const getBreakdownModule = (item: TrustBreakdownItem): string =>
  item.module === "context_analysis" ? "context" : item.module === "identity" ? "identity" : "device_posture";

const getBreakdownKey = (item: TrustBreakdownItem): string =>
  (item as any).signal ?? (item as any).factor ?? "unknown";

const formatLabel = (key: string): string =>
  key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const UserDetailPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleUpdating, setRoleUpdating] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchUserDetails();
    }
  }, [userId]);

  const updateRole = async (newRole: string) => {
    if (!userId || !details) return;
    setRoleUpdating(true);
    try {
      await api.patch(`/users/${userId}`, { role: newRole });
      toast.success(`Role updated to ${newRole}`);
      await fetchUserDetails();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to update role");
    } finally {
      setRoleUpdating(false);
    }
  };

  const fetchUserDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UserDetails>(`/users/${userId}/details`);
      setDetails(res.data);
    } catch (err: any) {
      console.error("Error fetching user details:", err);
      setError(err?.response?.data?.detail || "Failed to load user details");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <FaSpinner className="animate-spin text-4xl text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Link
          to="/users"
          className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 mb-4"
        >
          <FaArrowLeft /> Back to Employees
        </Link>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
          <FaExclamationTriangle className="text-red-500" />
          <span className="text-red-700 dark:text-red-300">{error}</span>
        </div>
      </div>
    );
  }

  if (!details) {
    return null;
  }

  const { user, devices, recent_attempts, stats, current_weights } = details;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/users"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <FaArrowLeft className="text-gray-600 dark:text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center">
                <FaUser className="text-indigo-600 dark:text-indigo-400 text-xl" />
              </div>
              {user.username}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 ml-15">{user.email}</p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
          user.role === 'admin'
            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
        }`}>
          {user.role.toUpperCase()}
        </span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">Devices</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_devices}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Attempts</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_attempts}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">Allowed</div>
          <div className="text-2xl font-bold text-green-600">{stats.allowed_attempts}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">Denied</div>
          <div className="text-2xl font-bold text-red-600">{stats.denied_attempts}</div>
        </div>
      </div>

      {/* User Info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FaUser className="text-indigo-600" />
            User Information
          </h2>
        </div>
        <div className="p-4">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">User ID</dt>
              <dd className="text-sm font-mono text-gray-900 dark:text-white">{user.user_id}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">Username</dt>
              <dd className="text-sm text-gray-900 dark:text-white">{user.username}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="text-sm text-gray-900 dark:text-white">{user.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400 mb-1">Role</dt>
              <dd className="flex items-center gap-2">
                {[{ value: "admin", label: "Admin" }, { value: "employee", label: "Employee" }].map((r) => (
                  <button
                    key={r.value}
                    disabled={roleUpdating || r.value === user.role}
                    onClick={() => updateRole(r.value)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors disabled:cursor-default ${
                      r.value === user.role
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
                {roleUpdating && <FaSpinner className="animate-spin text-gray-400" size={12} />}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">Auth Provider</dt>
              <dd className="text-sm">
                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                  user.auth_provider === 'hybrid'
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {user.auth_provider || 'local'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">Client App Access</dt>
              <dd className="text-sm">
                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                  (user.client_access_enabled ?? true)
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  {(user.client_access_enabled ?? true) ? 'Enabled' : 'Disabled (Web Only)'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">Linked Entra Account</dt>
              <dd className="text-sm text-gray-900 dark:text-white">
                {user.linked_entra_upn
                  ? <span className="font-mono text-purple-700 dark:text-purple-300">{user.linked_entra_upn}</span>
                  : <span className="text-gray-400">Not linked</span>}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">Created At</dt>
              <dd className="text-sm text-gray-900 dark:text-white">
                {user.created_at ? new Date(user.created_at).toLocaleString() : '-'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">Last Updated</dt>
              <dd className="text-sm text-gray-900 dark:text-white">
                {user.updated_at ? new Date(user.updated_at).toLocaleString() : '-'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Devices */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FaDesktop className="text-indigo-600" />
            Associated Devices ({devices.length})
          </h2>
        </div>
        {devices.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">No devices registered</p>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {devices.map((device) => {
              const trust = device.latest_trust_score;
              const scoreColor = (s: number) => s >= 80 ? 'text-green-600 dark:text-green-400' : s >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
              const deviceContrib = trust ? Math.round(trust.posture_score * current_weights.device * 10) / 10 : 0;
              const contextContrib = trust ? Math.round(trust.context_score * current_weights.context * 10) / 10 : 0;
              const identityContrib = trust ? Math.round(trust.identity_score * current_weights.identity * 10) / 10 : 0;
              return (
                <div key={device.device_id} className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <FaDesktop className="text-gray-400" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{device.device_name}</span>
                      <span className="text-xs text-gray-400">{device.os_version || 'OS unknown'}</span>
                      <span className="text-xs text-gray-400 font-mono">{device.fingerprint ? device.fingerprint.substring(0, 12) + '…' : ''}</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      Registered {device.registered_at ? new Date(device.registered_at).toLocaleDateString() : '-'}
                    </span>
                  </div>

                  {!trust ? (
                    <p className="text-sm text-gray-400 italic">No device check run yet for this device.</p>
                  ) : (
                    <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Last device check: {trust.calculated_at ? new Date(trust.calculated_at).toLocaleString() : '-'}
                        </span>
                        <span className={`text-lg font-bold ${scoreColor(trust.total_score)}`}>
                          Total Trust Score: {trust.total_score.toFixed(1)} / 100
                        </span>
                      </div>

                      {/* 3-module weighted formula */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        {[
                          { label: 'Device Posture', score: trust.posture_score, weight: current_weights.device, contrib: deviceContrib },
                          { label: 'Context', score: trust.context_score, weight: current_weights.context, contrib: contextContrib },
                          { label: 'Identity', score: trust.identity_score, weight: current_weights.identity, contrib: identityContrib },
                        ].map((m) => (
                          <div key={m.label} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <div className="text-xs text-gray-500 dark:text-gray-400">{m.label}</div>
                            <div className={`text-xl font-bold ${scoreColor(m.score)}`}>{m.score.toFixed(1)}</div>
                            <div className="text-xs text-gray-400 mt-1">
                              × {Math.round(m.weight * 100)}% weight = <span className="font-medium text-gray-600 dark:text-gray-300">{m.contrib.toFixed(1)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mb-4">
                        {deviceContrib.toFixed(1)} + {contextContrib.toFixed(1)} + {identityContrib.toFixed(1)} = {trust.total_score.toFixed(1)}
                        <span className="text-gray-400"> (weights shown are the current policy — may differ from those used at check time if since changed)</span>
                      </p>

                      {/* Per-check breakdown */}
                      {trust.breakdown && trust.breakdown.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="text-left text-gray-400 uppercase">
                                <th className="px-3 py-2">Module</th>
                                <th className="px-3 py-2">Check</th>
                                <th className="px-3 py-2">Result</th>
                                <th className="px-3 py-2">Points</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                              {trust.breakdown.map((item, idx) => {
                                const mod = getBreakdownModule(item);
                                const key = getBreakdownKey(item);
                                const isNA = item.passed === null;
                                return (
                                  <tr key={`${key}-${idx}`}>
                                    <td className="px-3 py-2 text-gray-400">{MODULE_LABELS[mod]}</td>
                                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{formatLabel(key)}</td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex px-1.5 py-0.5 rounded-full font-semibold ${
                                        isNA ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                          : item.passed ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                          : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                      }`}>
                                        {isNA ? 'N/A' : item.passed ? 'Pass' : 'Fail'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 font-mono text-gray-500">{isNA ? '—' : `+${item.points} / ${item.max}`}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Access Attempts */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FaHistory className="text-indigo-600" />
            Recent Access Attempts ({recent_attempts.length})
          </h2>
        </div>
        <div className="p-4">
          {recent_attempts.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">No access attempts recorded</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Result</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resource</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trust Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {recent_attempts.map((attempt) => (
                    <tr key={attempt.attempt_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                        {attempt.timestamp ? new Date(attempt.timestamp).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${
                          attempt.result === 'allow'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : attempt.result === 'deny'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        }`}>
                          {attempt.result === 'allow' ? <FaCheck size={10} /> : <FaTimes size={10} />}
                          {attempt.result.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                        {attempt.resource_name || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {attempt.total_score !== null ? (
                          <span className={`text-sm font-medium ${
                            attempt.total_score >= 70 ? 'text-green-600' :
                            attempt.total_score >= 40 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {attempt.total_score.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-300 max-w-xs truncate">
                        {attempt.reason || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserDetailPage;
