import React, { useEffect, useState } from "react";
import {
  FaDesktop,
  FaWindows,
  FaApple,
  FaLinux,
  FaDownload,
  FaTerminal,
  FaSync,
} from "react-icons/fa";
import api from "../api";

interface PlatformInfo {
  platform: "win" | "mac" | "linux";
  label: string;
  available: boolean;
  filename: string | null;
  size_bytes: number | null;
  download_url: string | null;
}

interface ClientAppInfo {
  version: string;
  platforms: PlatformInfo[];
  source_path: string;
  dev_instructions: string[];
}

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  win: FaWindows,
  mac: FaApple,
  linux: FaLinux,
};

const fmtSize = (bytes: number | null): string => {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
};

const ClientAppDownloadCard: React.FC = () => {
  const [info, setInfo] = useState<ClientAppInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showDevSteps, setShowDevSteps] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<ClientAppInfo>("/client-app/info");
      setInfo(res.data);
      setErr(null);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) {
        setErr("unavailable");
      } else {
        setErr(e?.response?.data?.detail || e?.message || "failed");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDownload = (p: PlatformInfo) => {
    if (!p.available || !p.download_url) return;
    // Use the axios baseURL so this works in dev (proxied) and prod alike.
    const base = (api.defaults.baseURL || "").replace(/\/$/, "");
    // download_url begins with "/api/...". The axios baseURL already ends in
    // "/api", so strip it to avoid duplicating the prefix.
    const stripped = p.download_url.replace(/^\/api/, "");
    const href = `${base}${stripped}`;
    window.open(href, "_blank");
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <FaDesktop className="text-xl text-indigo-600" />
          <h2 className="text-lg font-semibold">Desktop Client</h2>
        </div>
        <button
          onClick={load}
          className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 inline-flex items-center gap-1"
          title="Refresh"
        >
          <FaSync className={loading ? "animate-spin" : ""} /> refresh
        </button>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        The ModZero desktop client runs in the system tray and is required to
        request access to protected resources (it signs the device-posture
        payload that the web console cannot mint).
      </p>

      {err && (
        <div className={`rounded text-sm px-3 py-2 mb-3 ${
          err === "unavailable"
            ? "bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400"
            : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
        }`}>
          {err === "unavailable"
            ? "Desktop client package information is unavailable on this deployment."
            : `Could not load client info: ${err}`}
        </div>
      )}

      {info && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {info.platforms.map((p) => {
            const Icon = ICONS[p.platform] || FaDesktop;
            return (
              <div
                key={p.platform}
                className={`rounded-lg border p-4 ${
                  p.available
                    ? "border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10"
                    : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Icon size={22} />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{p.label}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {p.available ? `${p.filename} · ${fmtSize(p.size_bytes)}` : "not yet packaged"}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(p)}
                  disabled={!p.available}
                  className={`w-full inline-flex items-center justify-center gap-2 text-sm font-medium px-3 py-2 rounded-md transition ${
                    p.available
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
                  }`}
                  title={
                    p.available
                      ? `Download ${p.filename}`
                      : `Run \`npm run package:${p.platform}\` in client-app/ first`
                  }
                >
                  <FaDownload size={12} /> {p.available ? "Download" : "Unavailable"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <button
          onClick={() => setShowDevSteps((v) => !v)}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-2"
        >
          <FaTerminal size={12} />
          {showDevSteps ? "Hide" : "Show"} run-from-source instructions
        </button>
        {showDevSteps && info && (
          <pre className="mt-3 bg-gray-900 text-gray-100 text-xs rounded p-3 overflow-x-auto leading-relaxed">
            {info.dev_instructions.join("\n")}
          </pre>
        )}
      </div>
    </div>
  );
};

export default ClientAppDownloadCard;
