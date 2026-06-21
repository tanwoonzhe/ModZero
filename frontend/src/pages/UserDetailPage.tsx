import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { FaArrowLeft, FaUser, FaDesktop, FaHistory, FaCheck, FaTimes, FaSpinner, FaExclamationTriangle } from "react-icons/fa";
import api from "../api";

interface UserDetails {
  user: {
    user_id: string;
    username: string;
    email: string;
    role: string;
    created_at: string | null;
    updated_at: string | null;
  };
  devices: {
    device_id: string;
    device_name: string;
    os_version: string | null;
    fingerprint: string | null;
    registered_at: string | null;
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
}

const UserDetailPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      fetchUserDetails();
    }
  }, [userId]);

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

  const { user, devices, recent_attempts, stats } = details;

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
              <dt className="text-sm text-gray-500 dark:text-gray-400">Role</dt>
              <dd className="text-sm text-gray-900 dark:text-white capitalize">{user.role}</dd>
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
        <div className="p-4">
          {devices.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">No devices registered</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OS Version</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fingerprint</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {devices.map((device) => (
                    <tr key={device.device_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FaDesktop className="text-gray-400" />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {device.device_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                        {device.os_version || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 font-mono text-xs">
                        {device.fingerprint ? device.fingerprint.substring(0, 16) + '...' : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                        {device.registered_at ? new Date(device.registered_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
