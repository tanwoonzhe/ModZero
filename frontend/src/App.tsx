import React from "react";
import { Route, Routes, useLocation, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import LogsPage from "./pages/LogsPage";
import UsersPage from "./pages/UsersPage";
import DevicesPage from "./pages/DevicesPage";
import PoliciesPage from "./pages/PoliciesPage";
import ResourcesPage from "./pages/ResourcesPage";
import TemplatesPage from "./pages/TemplatesPage";
import SettingsPage from "./pages/SettingsPage";

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
      {isLogin ? (
        <LoginPage />
      ) : (
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/policies" element={<PoliciesPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<DashboardPage />} />
          </Routes>
        </Layout>
      )}
    </>
  );
}

export default App;