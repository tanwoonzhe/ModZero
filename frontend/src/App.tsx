import React from "react";
import { Route, Routes, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import LogsPage from "./pages/LogsPage";
import UsersPage from "./pages/UsersPage";
import DevicesPage from "./pages/DevicesPage";
import DevicesTestingPage from "./pages/DevicesTestingPage";
import PoliciesPage from "./pages/PoliciesPage";
import ResourcesPage from "./pages/ResourcesPage";
import TemplatesPage from "./pages/TemplatesPage";
import SettingsPage from "./pages/SettingsPage";
import IdentityPage from "./pages/IdentityPage";
import UserProfilePage from "./pages/UserProfilePage";
import NotFoundPage from "./pages/NotFoundPage";
import ZeroTrustPoliciesPage from "./pages/ZeroTrustPoliciesPage";
import { IdentityTestingPage, DevicesTestingPageNew } from "./pages/ZeroTrustTestingPage";

function App() {
  const location = useLocation();
  const isLogin = location.pathname === "/login";

  // If user not logged in, redirect to login for protected routes
  const token = localStorage.getItem("token");
  if (!isLogin && !token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: "#363636",
            color: "#fff",
          },
          success: {
            style: {
              background: "#22c55e",
            },
          },
          error: {
            style: {
              background: "#ef4444",
            },
          },
        }}
      />
      {isLogin ? (
        <LoginPage />
      ) : (
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/identity" element={<IdentityPage />} />
            <Route path="/identity-testing" element={<IdentityTestingPage />} />
            <Route path="/devices-testing" element={<DevicesTestingPage />} />
            <Route path="/devices-testing-new" element={<DevicesTestingPageNew />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/policies" element={<PoliciesPage />} />
            <Route path="/zero-trust-policies" element={<ZeroTrustPoliciesPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<UserProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Layout>
      )}
    </>
  );
}

export default App;