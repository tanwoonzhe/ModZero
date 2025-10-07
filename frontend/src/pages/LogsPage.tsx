import React, { useEffect, useState } from "react";
import api from "../api";
import { Attempt } from "../types";

const LogsPage: React.FC = () => {
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Access Logs</h1>
      {loading ? (
        <div>Loading logs...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {attempts.map((attempt) => (
                <tr key={attempt.attempt_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{new Date(attempt.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{attempt.user_id}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{attempt.device_id || "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        attempt.decision === "allow"
                          ? "bg-blue-100 text-blue-600"
                          : attempt.decision === "deny"
                          ? "bg-red-100 text-red-600"
                          : "bg-yellow-100 text-yellow-600"
                      }`}
                    >
                      {attempt.decision || attempt.result}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{attempt.total_score ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LogsPage;