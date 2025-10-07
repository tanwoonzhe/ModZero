import React, { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { FaTachometerAlt, FaHistory, FaUsers, FaDesktop, FaGavel, FaNetworkWired, FaFileAlt, FaCog, FaSignOutAlt } from "react-icons/fa";

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: "/", label: "Dashboard", icon: <FaTachometerAlt /> },
  { path: "/logs", label: "Access Logs", icon: <FaHistory /> },
  { path: "/users", label: "Employees", icon: <FaUsers /> },
  { path: "/devices", label: "Devices", icon: <FaDesktop /> },
  { path: "/policies", label: "Policies", icon: <FaGavel /> },
  { path: "/resources", label: "Resources", icon: <FaNetworkWired /> },
  { path: "/templates", label: "Templates", icon: <FaFileAlt /> },
  { path: "/settings", label: "Settings", icon: <FaCog /> },
];

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="w-60 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 text-2xl font-bold text-indigo-600 dark:text-indigo-400">ModZero</div>
        <nav className="flex-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-700 dark:text-white"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={handleLogout}
          className="m-4 mt-auto flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >
          <FaSignOutAlt className="mr-2" /> Logout
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