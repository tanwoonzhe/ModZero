import React, { useEffect, useState } from "react";
import api from "../api";
import { Policy } from "../types";

const PoliciesPage: React.FC = () => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState(70);
  const [desc, setDesc] = useState("");
  const [weights, setWeights] = useState<{ device_posture?: number; context?: number }>({});
  const [error, setError] = useState("");

  const fetchPolicies = async () => {
    try {
      const res = await api.get<Policy[]>("/policies");
      setPolicies(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const factor_weights: Record<string, number> = {};
      if (weights.device_posture) factor_weights["device_posture"] = weights.device_posture;
      if (weights.context) factor_weights["context"] = weights.context;
      await api.post("/policies", {
        policy_name: name,
        min_trust_threshold: threshold,
        description: desc,
        factor_weights,
      });
      setShowForm(false);
      setName("");
      setDesc("");
      setThreshold(70);
      setWeights({});
      fetchPolicies();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create policy");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Policies</h1>
      <button
        onClick={() => setShowForm(!showForm)}
        className="mb-4 px-4 py-2 bg-indigo-600 text-white rounded"
      >
        {showForm ? "Cancel" : "New Policy"}
      </button>
      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 space-y-4 p-4 border rounded bg-white dark:bg-gray-800">
          {error && <div className="text-red-500 text-sm">{error}</div>}
          <div>
            <label className="block mb-1 text-sm font-medium">Policy Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none dark:bg-gray-700 dark:border-gray-600"
              required
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Threshold</label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-full px-3 py-2 border rounded focus:outline-none dark:bg-gray-700 dark:border-gray-600"
              min={0}
              max={100}
              step={1}
              required
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Device Posture Weight</label>
            <input
              type="number"
              value={weights.device_posture || 0}
              onChange={(e) => setWeights({ ...weights, device_posture: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 border rounded focus:outline-none dark:bg-gray-700 dark:border-gray-600"
              min={0}
              max={1}
              step={0.1}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Context Weight</label>
            <input
              type="number"
              value={weights.context || 0}
              onChange={(e) => setWeights({ ...weights, context: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 border rounded focus:outline-none dark:bg-gray-700 dark:border-gray-600"
              min={0}
              max={1}
              step={0.1}
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded">Create</button>
        </form>
      )}
      {loading ? (
        <div>Loading policies...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Threshold</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Weights</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {policies.map((p) => (
                <tr key={p.policy_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{p.policy_name}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{p.min_trust_threshold}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">
                    {p.weights
                      ? Object.entries(p.weights)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">
                    {p.is_active ? (
                      <span className="text-green-600">Active</span>
                    ) : (
                      <span className="text-gray-500">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PoliciesPage;