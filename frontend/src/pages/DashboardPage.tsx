import React, { useEffect, useState } from "react";
import api from "../api";
import { Attempt } from "../types";

const DashboardPage: React.FC = () => {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAttempts = async () => {
      try {
        const res = await api.get<Attempt[]>("/attempts");
        setAttempts(res.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchAttempts();
  }, []);

  const averageTrust = () => {
    if (attempts.length === 0) return 0;
    const sum = attempts.reduce((acc, cur) => acc + (cur.total_score || 0), 0);
    return (sum / attempts.length).toFixed(2);
  };

  const criticalDenials = attempts.filter(
    (a) => a.decision === "deny" && (a.total_score || 0) < 50
  ).length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      {loading ? (
        <div>Loading metrics...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
            <div className="text-sm text-gray-500">Average Trust Score</div>
            <div className="text-3xl font-semibold">{averageTrust()}</div>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
            <div className="text-sm text-gray-500">Total Attempts</div>
            <div className="text-3xl font-semibold">{attempts.length}</div>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
            <div className="text-sm text-gray-500">Critical Denials</div>
            <div className="text-3xl font-semibold">{criticalDenials}</div>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
            <div className="text-sm text-gray-500">Placeholder</div>
            <div className="text-3xl font-semibold">0</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;