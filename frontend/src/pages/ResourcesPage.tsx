import React, { useEffect, useState } from "react";
import api from "../api";
import { Network } from "../types";

const ResourcesPage: React.FC = () => {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNetworks = async () => {
      try {
        const res = await api.get<Network[]>("/resources");
        setNetworks(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchNetworks();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Remote Networks</h1>
      {loading ? (
        <div>Loading networks...</div>
      ) : (
        <div className="space-y-4">
          {networks.map((net) => (
            <div key={net.network_id} className="border rounded p-4 bg-white dark:bg-gray-800">
              <h2 className="text-xl font-semibold mb-2 flex justify-between items-center">
                {net.name}
                <span
                  className={`text-sm font-medium px-2 py-1 rounded ${
                    net.connector_health === "green"
                      ? "bg-green-100 text-green-800"
                      : net.connector_health === "amber"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {net.connector_health}
                </span>
              </h2>
              <p className="text-sm text-gray-500 mb-2">CIDR: {net.cidr_range}</p>
              <div className="mt-2">
                <h3 className="text-sm font-medium mb-1">Resources</h3>
                {net.resources.length > 0 ? (
                  <ul className="list-disc pl-5">
                    {net.resources.map((res) => (
                      <li key={res.resource_id}>
                        {res.name} – {res.connector_status}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No resources registered</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ResourcesPage;