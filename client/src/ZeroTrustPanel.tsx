import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * ModZero ZTNA panel.
 *
 * Wires the user-facing happy path:
 *   1. Set server URL + paste a JWT (FYP shortcut for the SSO flow).
 *   2. Enroll this device  -> server mints + returns hmac_secret (stored
 *      locally by the Rust side).
 *   3. Pick a registered Resource, optionally toggle "simulate good
 *      posture", click Request Access. The Rust command collects+signs
 *      posture, calls /api/resource-access/gate, and on allow opens the
 *      one-shot bootstrap URL in the system default browser.
 */

interface RegisteredResource {
  resource_id: string;
  name: string;
  slug: string;
  network_name: string;
  host: string;
  port: number;
  url: string;
  access_path: string;
}

interface GateOutcome {
  allowed: boolean;
  reason: string;
  score: number;
  threshold: number;
  opened_url: string | null;
}

const LS_SERVER = "modzero.serverUrl";
const LS_JWT = "modzero.jwt";

export default function ZeroTrustPanel() {
  const [serverUrl, setServerUrl] = useState<string>(
    () => localStorage.getItem(LS_SERVER) || "http://localhost:8000",
  );
  const [jwt, setJwt] = useState<string>(
    () => localStorage.getItem(LS_JWT) || "",
  );
  const [enrolledDeviceId, setEnrolledDeviceId] = useState<string | null>(null);
  const [resources, setResources] = useState<RegisteredResource[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [threshold, setThreshold] = useState<number>(60);
  const [simulateGood, setSimulateGood] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [outcome, setOutcome] = useState<GateOutcome | null>(null);

  useEffect(() => {
    invoke<string | null>("modzero_enrollment_status")
      .then(setEnrolledDeviceId)
      .catch(() => setEnrolledDeviceId(null));
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_SERVER, serverUrl);
  }, [serverUrl]);
  useEffect(() => {
    localStorage.setItem(LS_JWT, jwt);
  }, [jwt]);

  const refreshResources = async () => {
    if (!jwt) {
      setStatus("Paste a JWT first.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const r = await fetch(
        `${serverUrl.replace(/\/$/, "")}/api/resource-access/resources`,
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      const data: RegisteredResource[] = await r.json();
      setResources(data);
      if (data.length && !selectedId) setSelectedId(data[0].resource_id);
    } catch (e: any) {
      setStatus(`Resources: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const enroll = async () => {
    if (!jwt) {
      setStatus("Paste a JWT first.");
      return;
    }
    setBusy(true);
    setStatus("Enrolling device...");
    try {
      const res = await invoke<{ device_id: string; enrolled: boolean }>(
        "modzero_enroll",
        { serverUrl, jwt, deviceName: null },
      );
      setEnrolledDeviceId(res.device_id);
      setStatus(`Enrolled. device_id=${res.device_id}`);
    } catch (e: any) {
      setStatus(`Enroll failed: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const requestAccess = async () => {
    if (!selectedId) {
      setStatus("Pick a resource first.");
      return;
    }
    setBusy(true);
    setStatus("Requesting access...");
    setOutcome(null);
    try {
      const out = await invoke<GateOutcome>("modzero_request_access", {
        jwt,
        resourceId: selectedId,
        accessThreshold: threshold,
        simulateGoodPosture: simulateGood,
      });
      setOutcome(out);
      setStatus(out.allowed
        ? `Allowed (${out.score} >= ${out.threshold}). Opened browser.`
        : `Denied (${out.score} < ${out.threshold}).`);
    } catch (e: any) {
      setStatus(`Gate failed: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mt-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-3">
        Zero-Trust Resource Access
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">Server URL</span>
          <input
            className="w-full px-3 py-2 border rounded-md"
            value={serverUrl}
            onChange={e => setServerUrl(e.target.value)}
            placeholder="http://localhost:8000"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">JWT (Bearer)</span>
          <input
            className="w-full px-3 py-2 border rounded-md font-mono"
            value={jwt}
            onChange={e => setJwt(e.target.value)}
            placeholder="paste access token"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={enroll}
          disabled={busy}
          className="px-3 py-2 rounded-md bg-indigo-600 text-white disabled:opacity-50"
        >
          {enrolledDeviceId ? "Re-enroll device" : "Enroll device"}
        </button>
        <button
          onClick={refreshResources}
          disabled={busy}
          className="px-3 py-2 rounded-md bg-slate-200 text-slate-800 disabled:opacity-50"
        >
          Refresh resources
        </button>
        {enrolledDeviceId && (
          <span className="text-xs self-center text-slate-500">
            enrolled: <code>{enrolledDeviceId.slice(0, 8)}…</code>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <label className="text-sm md:col-span-2">
          <span className="block text-slate-600 mb-1">Resource</span>
          <select
            className="w-full px-3 py-2 border rounded-md"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
          >
            <option value="">-- select --</option>
            {resources.map(r => (
              <option key={r.resource_id} value={r.resource_id}>
                {r.name} ({r.network_name}) /r/{r.slug}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">
            Threshold ({threshold})
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={threshold}
            onChange={e => setThreshold(parseInt(e.target.value, 10))}
            className="w-full"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm mb-4">
        <input
          type="checkbox"
          checked={simulateGood}
          onChange={e => setSimulateGood(e.target.checked)}
        />
        <span>Simulate good posture (FYP demo affordance)</span>
      </label>

      <button
        onClick={requestAccess}
        disabled={busy || !enrolledDeviceId || !selectedId}
        className="px-4 py-2 rounded-md bg-emerald-600 text-white disabled:opacity-50"
      >
        Request access
      </button>

      {status && (
        <div className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">
          {status}
        </div>
      )}
      {outcome && (
        <div
          className={`mt-3 p-3 rounded-md text-sm border ${
            outcome.allowed
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="font-semibold mb-1">
            {outcome.allowed ? "ALLOW" : "DENY"} — score {outcome.score} /
            {" "}threshold {outcome.threshold}
          </div>
          <div>{outcome.reason}</div>
          {outcome.opened_url && (
            <div className="mt-1">
              Opened: <code>{outcome.opened_url}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
