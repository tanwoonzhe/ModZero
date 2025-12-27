import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { getDeviceInfo, DeviceInfo } from './device-info';
import { ApiClient } from './api-client';
import Store from 'electron-store';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Store for persistent settings
const store = new Store({
  defaults: {
    serverUrl: 'http://localhost:8000',
    autoStart: true,
    minimizeToTray: true,
    checkInterval: 300000, // 5 minutes
  },
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let apiClient: ApiClient;
let deviceInfo: DeviceInfo | null = null;
let checkInterval: NodeJS.Timeout | null = null;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    minWidth: 350,
    minHeight: 500,
    frame: false,
    resizable: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    // Check both common dev server ports
    mainWindow.loadURL('http://localhost:5174').catch(() => {
      mainWindow?.loadURL('http://localhost:5173');
    });
    // Don't auto-open DevTools to avoid focus issues
    // Press F12 to open manually if needed
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (store.get('minimizeToTray') && !(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Create tray icon
  const iconPath = isDev
    ? path.join(__dirname, '..', 'assets', 'tray-icon.png')
    : path.join(process.resourcesPath, 'assets', 'tray-icon.png');

  // Fallback to a basic icon if file doesn't exist
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setToolTip('ModZero Client');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open ModZero',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Check Compliance Now',
      click: () => {
        performComplianceCheck();
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow?.show();
        mainWindow?.webContents.send('navigate', '/settings');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

async function performComplianceCheck() {
  if (!deviceInfo) {
    deviceInfo = await getDeviceInfo();
  }

  try {
    const token = store.get('authToken') as string;
    if (!token) {
      showNotification('Authentication Required', 'Please login to check compliance.');
      mainWindow?.show();
      return;
    }

    const result = await apiClient.checkCompliance(deviceInfo);
    
    const statusIcon = result.compliant ? '✅' : '⚠️';
    showNotification(
      `${statusIcon} Compliance Status`,
      result.compliant 
        ? 'Your device is compliant!' 
        : `Issues found: ${result.issues?.join(', ') || 'Unknown issues'}`
    );

    // Update tray tooltip
    tray?.setToolTip(`ModZero Client - ${result.compliant ? 'Compliant' : 'Non-Compliant'}`);

    // Send to renderer
    mainWindow?.webContents.send('compliance-result', result);
  } catch (error) {
    console.error('Compliance check failed:', error);
    showNotification('Error', 'Failed to check compliance. Please try again.');
  }
}

function showNotification(title: string, body: string) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

function startPeriodicCheck() {
  const interval = store.get('checkInterval') as number;
  
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  
  checkInterval = setInterval(() => {
    performComplianceCheck();
  }, interval);
}

// IPC Handlers
function setupIPC() {
  ipcMain.handle('get-device-info', async () => {
    if (!deviceInfo) {
      deviceInfo = await getDeviceInfo();
    }
    return deviceInfo;
  });

  ipcMain.handle('check-compliance', async () => {
    await performComplianceCheck();
  });

  ipcMain.handle('get-settings', () => {
    return {
      serverUrl: store.get('serverUrl'),
      autoStart: store.get('autoStart'),
      minimizeToTray: store.get('minimizeToTray'),
      checkInterval: store.get('checkInterval'),
    };
  });

  ipcMain.handle('save-settings', (_event, settings) => {
    Object.entries(settings).forEach(([key, value]) => {
      store.set(key, value);
    });
    
    // Update API client
    apiClient = new ApiClient(store.get('serverUrl') as string);
    
    // Restart periodic check with new interval
    startPeriodicCheck();
    
    return true;
  });

  ipcMain.handle('login', async (_event, { username, password }) => {
    try {
      const result = await apiClient.login(username, password);
      store.set('authToken', result.access_token);
      return { success: true, token: result.access_token };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('logout', () => {
    (store as any).delete('authToken');
    return true;
  });

  ipcMain.handle('get-auth-status', () => {
    return {
      isAuthenticated: !!store.get('authToken'),
    };
  });

  ipcMain.handle('window-minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window-close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo;
    } catch {
      return null;
    }
  });
}

// Auto-updater setup
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    showNotification('Update Available', `Version ${info.version} is available. Downloading...`);
    mainWindow?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-downloaded', (info) => {
    showNotification('Update Ready', `Version ${info.version} is ready to install. Restart to apply.`);
    mainWindow?.webContents.send('update-downloaded', info);
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error);
  });
}

// App lifecycle
app.on('ready', async () => {
  apiClient = new ApiClient(store.get('serverUrl') as string);
  
  createWindow();
  createTray();
  setupIPC();
  setupAutoUpdater();
  
  // Initial device info fetch
  deviceInfo = await getDeviceInfo();
  
  // Start periodic compliance check
  startPeriodicCheck();
  
  // Check for updates on startup
  if (!isDev) {
    autoUpdater.checkForUpdates();
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit on Windows, keep running in tray
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  if (checkInterval) {
    clearInterval(checkInterval);
  }
});
