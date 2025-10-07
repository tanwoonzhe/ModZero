import React, { useEffect, useState } from "react";
import api from "../api";
import { Device } from "../types";

const DevicesPage: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await api.get<Device[]>("/devices");
        setDevices(res.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchDevices();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Devices</h1>
      {loading ? (
        <div>Loading devices...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">OS</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {devices.map((d) => (
                <tr key={d.device_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{d.device_name}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{d.user_id}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{d.os_version || "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{new Date(d.registered_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DevicesPage;