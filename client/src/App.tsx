import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FaShieldAlt, FaSync, FaCheckCircle, FaTimesCircle, FaExclamationTriangle, FaLaptop, FaLock, FaFireAlt, FaBug } from "react-icons/fa";

interface DeviceInfo {
  device_name: string;
  hostname: string;
  os_name: string;
  os_version: string;
  cpu_count: number;
  total_memory: number;
  is_encrypted: boolean;
  firewall_enabled: boolean;
  antivirus_enabled: boolean;
}

interface TrustScore {
  score: number;
  checks: {
    name: string;
    passed: boolean;
    weight: number;
  }[];
}

function App() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const info = await invoke<DeviceInfo>("get_device_info");
      setDeviceInfo(info);
      
      const score = await invoke<TrustScore>("calculate_trust_score");
      setTrustScore(score);
      
      setLastSync(new Date());
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      await invoke("sync_with_server");
      await fetchData();
    } catch (err) {
      setError(err as string);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "from-green-500 to-green-600";
    if (score >= 60) return "from-yellow-500 to-yellow-600";
    return "from-red-500 to-red-600";
  };

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading device information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <FaShieldAlt className="text-white text-xl" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">ModZero Client</h1>
            <p className="text-sm text-slate-500">Zero Trust Security Agent</p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <FaSync className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <FaExclamationTriangle className="inline mr-2" />
          {error}
        </div>
      )}

      {/* Trust Score Card */}
      {trustScore && (
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-700 mb-4">Device Trust Score</h2>
          <div className="flex items-center gap-6">
            <div className={`relative w-32 h-32 rounded-full bg-gradient-to-br ${getScoreBg(trustScore.score)} p-1`}>
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                <span className={`text-4xl font-bold ${getScoreColor(trustScore.score)}`}>
                  {trustScore.score}
                </span>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {trustScore.checks.map((check, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {check.passed ? (
                      <FaCheckCircle className="text-green-500" />
                    ) : (
                      <FaTimesCircle className="text-red-500" />
                    )}
                    <span className="text-slate-700">{check.name}</span>
                  </div>
                  <span className="text-sm text-slate-500">+{check.weight} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Device Info Card */}
      {deviceInfo && (
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <FaLaptop className="text-slate-500" />
            Device Information
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Device Name</p>
              <p className="font-medium text-slate-800">{deviceInfo.device_name}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Hostname</p>
              <p className="font-medium text-slate-800">{deviceInfo.hostname}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Operating System</p>
              <p className="font-medium text-slate-800">{deviceInfo.os_name} {deviceInfo.os_version}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Memory</p>
              <p className="font-medium text-slate-800">{formatBytes(deviceInfo.total_memory)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Security Status Card */}
      {deviceInfo && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-slate-700 mb-4">Security Status</h2>
          <div className="space-y-3">
            <div className={`flex items-center justify-between p-3 rounded-lg ${deviceInfo.is_encrypted ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-3">
                <FaLock className={deviceInfo.is_encrypted ? 'text-green-500' : 'text-red-500'} />
                <span className="text-slate-700">Disk Encryption</span>
              </div>
              <span className={`px-2 py-1 rounded text-sm font-medium ${deviceInfo.is_encrypted ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {deviceInfo.is_encrypted ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className={`flex items-center justify-between p-3 rounded-lg ${deviceInfo.firewall_enabled ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-3">
                <FaFireAlt className={deviceInfo.firewall_enabled ? 'text-green-500' : 'text-red-500'} />
                <span className="text-slate-700">Firewall</span>
              </div>
              <span className={`px-2 py-1 rounded text-sm font-medium ${deviceInfo.firewall_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {deviceInfo.firewall_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className={`flex items-center justify-between p-3 rounded-lg ${deviceInfo.antivirus_enabled ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-3">
                <FaBug className={deviceInfo.antivirus_enabled ? 'text-green-500' : 'text-red-500'} />
                <span className="text-slate-700">Antivirus Protection</span>
              </div>
              <span className={`px-2 py-1 rounded text-sm font-medium ${deviceInfo.antivirus_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {deviceInfo.antivirus_enabled ? 'Active' : 'Not Detected'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 text-center text-sm text-slate-500">
        {lastSync && (
          <p>Last sync: {lastSync.toLocaleTimeString()}</p>
        )}
      </div>
    </div>
  );
}

export default App;
