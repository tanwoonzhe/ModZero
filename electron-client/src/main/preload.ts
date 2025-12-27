import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Device info
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),
  
  // Compliance
  checkCompliance: () => ipcRenderer.invoke('check-compliance'),
  onComplianceResult: (callback: (result: any) => void) => {
    ipcRenderer.on('compliance-result', (_event, result) => callback(result));
  },
  
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  
  // Authentication
  login: (username: string, password: string) => 
    ipcRenderer.invoke('login', { username, password }),
  logout: () => ipcRenderer.invoke('logout'),
  getAuthStatus: () => ipcRenderer.invoke('get-auth-status'),
  
  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  close: () => ipcRenderer.invoke('window-close'),
  
  // Navigation
  onNavigate: (callback: (path: string) => void) => {
    ipcRenderer.on('navigate', (_event, path) => callback(path));
  },
  
  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (callback: (info: any) => void) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },
});

// Type definitions for renderer
export interface ElectronAPI {
  getDeviceInfo: () => Promise<DeviceInfo>;
  checkCompliance: () => Promise<void>;
  onComplianceResult: (callback: (result: ComplianceResult) => void) => void;
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<boolean>;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<boolean>;
  getAuthStatus: () => Promise<{ isAuthenticated: boolean }>;
  minimize: () => Promise<void>;
  close: () => Promise<void>;
  onNavigate: (callback: (path: string) => void) => void;
  checkForUpdates: () => Promise<any>;
  onUpdateAvailable: (callback: (info: any) => void) => void;
  onUpdateDownloaded: (callback: (info: any) => void) => void;
}

export interface DeviceInfo {
  hostname: string;
  platform: string;
  os_version: string;
  architecture: string;
  cpu: string;
  memory_total: number;
  memory_free: number;
  disk_total: number;
  disk_free: number;
  network_interfaces: NetworkInterface[];
  antivirus: string[];
  firewall_enabled: boolean;
  encryption_enabled: boolean;
  last_update: string;
}

export interface NetworkInterface {
  name: string;
  mac: string;
  ip4: string;
  ip6: string;
}

export interface ComplianceResult {
  compliant: boolean;
  score: number;
  issues?: string[];
  recommendations?: string[];
  last_checked: string;
}

export interface Settings {
  serverUrl: string;
  autoStart: boolean;
  minimizeToTray: boolean;
  checkInterval: number;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  error?: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
