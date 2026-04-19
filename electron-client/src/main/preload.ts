/**
 * Preload script — exposes a minimal electronAPI to the renderer.
 *
 * Only window management and platform info are exposed.
 * All business logic (API, Socket.IO, auth) lives in the React frontend.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
});
