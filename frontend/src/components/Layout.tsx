import React, { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FaTachometerAlt, FaHistory, FaUsers, FaGavel, FaNetworkWired, FaCog, FaSignOutAlt, FaUserCircle, FaBars, FaChevronLeft, FaPlug, FaDesktop, FaKey } from "react-icons/fa";
import toast from "react-hot-toast";

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: "/", label: "Dashboard", icon: <FaTachometerAlt /> },
  { path: "/users", label: "Users", icon: <FaUsers /> },
  { path: "/devices", label: "Devices", icon: <FaDesktop /> },
  { path: "/resources", label: "Resources", icon: <FaNetworkWired /> },
  { path: "/zero-trust-policies", label: "Trust Policies", icon: <FaGavel /> },
  { path: "/connectors", label: "Connectors", icon: <FaPlug /> },
  { path: "/sessions", label: "Sessions", icon: <FaKey /> },
  { path: "/logs", label: "Access Logs", icon: <FaHistory /> },
  { path: "/settings", label: "Settings", icon: <FaCog /> },
];

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    toast.success("Logged out successfully");
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-60'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300`}>
        <div className="p-4 flex items-center justify-between">
          {!sidebarCollapsed && (
            <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">ModZero</span>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <FaBars size={18} /> : <FaChevronLeft size={18} />}
          </button>
        </div>
        <nav className="flex-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={sidebarCollapsed ? item.label : undefined}
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-4'} py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-700 dark:text-white"
                    : "text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                <span className={sidebarCollapsed ? '' : 'mr-3'}>{item.icon}</span>
                {!sidebarCollapsed && item.label}
              </Link>
            );
          })}
        </nav>
        {/* User Profile Link */}
        <Link
          to="/profile"
          title={sidebarCollapsed ? 'My Profile' : undefined}
          className={`mx-2 mb-2 flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-4'} py-2 text-sm font-medium rounded-lg transition-colors ${
            location.pathname === "/profile"
              ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-700 dark:text-white"
              : "text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-white"
          }`}
        >
          <FaUserCircle className={sidebarCollapsed ? '' : 'mr-2'} /> {!sidebarCollapsed && 'My Profile'}
        </Link>
        <button
          onClick={handleLogout}
          title={sidebarCollapsed ? 'Logout' : undefined}
          className={`m-2 mt-0 flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-4'} py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-white rounded-lg transition-colors`}
        >
          <FaSignOutAlt className={sidebarCollapsed ? '' : 'mr-2'} /> {!sidebarCollapsed && 'Logout'}
        </button>
      </aside>
      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {children}
      </main>
    </div>
  );
};

export default Layout;