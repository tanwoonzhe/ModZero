import React, { useEffect, useState } from "react";
import { FaUser, FaEnvelope, FaIdBadge, FaCalendarAlt, FaShieldAlt, FaKey } from "react-icons/fa";
import api from "../api";
import toast from "react-hot-toast";

interface UserProfile {
  user_id: string;
  username: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

const UserProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get("/users/me");
        setProfile(response.data);
      } catch (error) {
        console.error("Failed to fetch user profile:", error);
        toast.error("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
        Unable to load profile information.
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirm) {
      toast.error("New passwords do not match");
      return;
    }
    if (pwForm.newPw.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setPwLoading(true);
    try {
      await api.post("/users/me/change-password", {
        current_password: pwForm.current,
        new_password: pwForm.newPw,
      });
      toast.success("Password changed successfully");
      setPwForm({ current: "", newPw: "", confirm: "" });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to change password");
    } finally {
      setPwLoading(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case "admin":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "employee":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">My Profile</h1>

      {/* Profile Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-8">
          <div className="flex items-center">
            <div className="bg-white dark:bg-gray-800 rounded-full p-4">
              <FaUser className="w-12 h-12 text-indigo-600" />
            </div>
            <div className="ml-6">
              <h2 className="text-2xl font-bold text-white">
                {profile.username}
              </h2>
              <p className="text-indigo-100">{profile.email}</p>
              <span
                className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeColor(
                  profile.role
                )}`}
              >
                {profile.role.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Email */}
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <FaEnvelope className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {profile.email}
                </p>
              </div>
            </div>

            {/* User ID */}
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <FaIdBadge className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">User ID</p>
                <p className="font-medium text-gray-900 dark:text-gray-100 font-mono text-sm">
                  {profile.user_id}
                </p>
              </div>
            </div>

            {/* Role */}
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <FaShieldAlt className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Role</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {profile.role === "admin" ? "Administrator" : "Employee"}
                </p>
              </div>
            </div>

            {/* Created At */}
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <FaCalendarAlt className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Member Since</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatDate(profile.created_at)}
                </p>
              </div>
            </div>

            {/* Last Updated */}
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <FaCalendarAlt className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Last Updated</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatDate(profile.updated_at)}
                </p>
              </div>
            </div>
          </div>

          {/* Permissions Info */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Your Permissions
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              {profile.role === "admin" ? (
                <>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    Full access to the web dashboard and all management pages
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    Can create, edit, and remove users, and assign roles
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    Can manage devices, trust policies, and connectors / resources
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    Can view audit and access logs
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                    View the web dashboard and your own profile
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                    Request access to authorized resources and run device checks from the ModZero Client App
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                    Cannot manage users, devices, trust policies, or connectors / resources
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                    Access to resources is denied if your trust score falls below the required threshold
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <FaKey className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Change Password</h3>
        </div>
        <form onSubmit={handleChangePassword} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Current Password</label>
            <input
              type="password"
              value={pwForm.current}
              onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">New Password</label>
            <input
              type="password"
              value={pwForm.newPw}
              onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={pwForm.confirm}
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={pwLoading}
              className="px-6 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {pwLoading ? "Updating…" : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserProfilePage;
