import React from "react";
import { FaHistory, FaCircle } from "react-icons/fa";
import AccessDecisionsLog from "../components/AccessDecisionsLog";
import { useSocketConnection } from "../hooks/useSocket";

const LogsPage: React.FC = () => {
  const { isConnected } = useSocketConnection();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            Access Logs
            {isConnected && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <FaCircle size={6} className="animate-pulse" />
                Live
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Zero trust access decisions
          </p>
        </div>
      </div>
      <AccessDecisionsLog />
    </div>
  );
};

export default LogsPage;
