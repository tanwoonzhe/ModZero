/**
 * Preload — exposes a small, typed surface for the onboarding and connected
 * views to talk to the main process. Renderer-side `window.modzero.*`.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("modzero", {
  // Onboarding
  getConfig: (): Promise<unknown> => ipcRenderer.invoke("modzero:get-config"),
  saveAndConnect: (payload: unknown): Promise<boolean> =>
    ipcRenderer.invoke("modzero:save-and-connect", payload),

  // Connected dashboard
  getSnapshot: (): Promise<unknown> => ipcRenderer.invoke("modzero:snapshot"),
  heartbeatNow: (): Promise<unknown> => ipcRenderer.invoke("modzero:heartbeat-now"),
  openFullDashboard: (): Promise<void> => ipcRenderer.invoke("modzero:open-full"),
  disconnect: (): Promise<void> => ipcRenderer.invoke("modzero:disconnect"),

  // Posture / device check
  collectPosture: (): Promise<unknown> => ipcRenderer.invoke("modzero:collect-posture"),
  runDeviceCheck: (): Promise<unknown> => ipcRenderer.invoke("modzero:run-device-check"),
  trustLatest: (): Promise<unknown> => ipcRenderer.invoke("modzero:trust-latest"),
  getFingerprint: (): Promise<string> => ipcRenderer.invoke("modzero:get-fingerprint"),

  // Resources / access
  listResources: (): Promise<unknown> => ipcRenderer.invoke("modzero:list-resources"),
  requestAccess: (resourceId: string): Promise<unknown> =>
    ipcRenderer.invoke("modzero:request-access", { resource_id: resourceId }),
  openAccessUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke("modzero:open-access-url", url),

  // Settings
  setBackendUrl: (url: string): Promise<unknown> =>
    ipcRenderer.invoke("modzero:set-backend-url", url),
  changePassword: (currentPassword: string, newPassword: string): Promise<unknown> =>
    ipcRenderer.invoke("modzero:change-password", { current_password: currentPassword, new_password: newPassword }),

  // Tunnel readiness + enrollment
  tunnelDetect: (): Promise<unknown> => ipcRenderer.invoke("modzero:tunnel-detect"),
  tunnelEnrollment: (args?: { device_id?: string; node_name_hint?: string }): Promise<unknown> =>
    ipcRenderer.invoke("modzero:tunnel-enrollment", args || {}),

  // Real-time push events (Socket.IO force_device_check / force_logout,
  // relayed from the main process). Returns an unsubscribe function.
  onPushEvent: (callback: (payload: unknown) => void): (() => void) => {
    const listener = (_evt: unknown, payload: unknown) => callback(payload);
    ipcRenderer.on("modzero:push-event", listener);
    return () => ipcRenderer.removeListener("modzero:push-event", listener);
  },
});

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
});
