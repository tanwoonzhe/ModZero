import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import toast from "react-hot-toast";
import { FaShieldAlt, FaUser, FaLock } from "react-icons/fa";

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("username", username);
      params.append("password", password);
      const res = await api.post("/auth/login", params, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      localStorage.setItem("token", res.data.access_token);
      toast.success("Login successful!");
      navigate("/", { replace: true });
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || "Invalid username or password";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center mb-4">
            <FaShieldAlt className="text-3xl text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">ModZero</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Zero Trust Security Platform</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg text-center">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="username">
              Username or Email
            </label>
            <div className="relative">
              <FaUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white caret-gray-900 dark:caret-white placeholder-gray-400 transition-all"
                required
              />
            </div>
          </div>
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white caret-gray-900 dark:caret-white placeholder-gray-400 transition-all"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          Protected by Zero Trust Architecture
        </p>
      </div>
    </div>
  );
};

export default LoginPage;