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
});

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
});
