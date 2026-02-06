import React, { useEffect } from "react";
import { Route, Routes, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import LogsPage from "./pages/LogsPage";
import UsersPage from "./pages/UsersPage";
import UserDetailPage from "./pages/UserDetailPage";
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
import IdentityTestingPageLive from "./pages/IdentityTestingPageLive";
import DevicesTestingPageLive from "./pages/DevicesTestingPageLive";
import ZeroTrustTestingPage from "./pages/ZeroTrustTestingPage";
import { useZeroTrustStore } from "./store/zeroTrustStore";
import api from "./api";

function App() {
  const location = useLocation();
  const isLogin = location.pathname === "/login";
  const loadFromAPI = useZeroTrustStore(state => state.loadFromAPI);
  const setCurrentUser = useZeroTrustStore(state => state.setCurrentUser);
  
  // Load test configurations and current user from API on mount (when logged in)
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token && !isLogin) {
      loadFromAPI();
      // Fetch actual logged-in user info
      api.get('/auth/me').then(res => {
        const u = res.data;
        setCurrentUser({
          id: u.user_id,
          email: u.email,
          name: u.username,
          role: u.role === 'admin' ? 'Admin' : u.role === 'operator' ? 'Operator' : 'Viewer',
        });
      }).catch(() => { /* ignore - will use default */ });
    }
  }, [loadFromAPI, setCurrentUser, isLogin]);

  // If user not logged in, redirect to login for protected routes
  const token = localStorage.getItem("token");
  if (!isLogin && !token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Toaster
        position="bottom-right"
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
            <Route path="/identity-testing" element={<IdentityTestingPageLive />} />
            <Route path="/devices-testing" element={<DevicesTestingPageLive />} />
            {/* Old demo testing pages - kept as backup */}
            <Route path="/identity2" element={<ZeroTrustTestingPage pillar="Identity" title="Identity Testing (Demo)" description="Zero Trust Identity assessment demo page" />} />
            <Route path="/devices2" element={<ZeroTrustTestingPage pillar="Devices" title="Devices Testing (Demo)" description="Zero Trust Devices assessment demo page" />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/:userId" element={<UserDetailPage />} />
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