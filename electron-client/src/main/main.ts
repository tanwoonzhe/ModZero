/**
 * Electron main process — ModZero Dashboard.
 *
 * Loads the React admin dashboard from a configurable URL (Vite dev server
 * in dev, the running web stack in production). Twingate-style tray icon
 * keeps the app reachable from the system tray; closing the window hides
 * it instead of quitting.
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from "electron";
import * as path from "path";
import * as fs from "fs";

const isDev = !app.isPackaged;

function resolveAppUrl(): string {
  if (process.env.MODZERO_URL) return process.env.MODZERO_URL;
  if (isDev) return "http://localhost:5173";
  try {
    const cfgPath = path.join(app.getPath("userData"), "config.json");
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      if (cfg && typeof cfg.url === "string") return cfg.url;
    }
  } catch {
    /* ignore — fall through to default */
  }
  return "http://localhost:5173";
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });
}

function resourcePath(relative: string): string {
  const candidates = [
    path.join(__dirname, "..", "assets", relative),
    path.join(__dirname, "..", "..", "assets", relative),
    path.join(process.resourcesPath || "", "assets", relative),
    path.join(app.getAppPath(), "assets", relative),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function createWindow(): void {
  const iconPath = resourcePath(
    process.platform === "win32" ? "icon.ico" : "icon.png",
  );

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "ModZero Dashboard",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: true,
    },
    show: false,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const targetUrl = resolveAppUrl();
  mainWindow.loadURL(targetUrl);

  mainWindow.webContents.on(
    "did-fail-load",
    (_evt, errorCode, errorDesc, validatedUrl) => {
      if (errorCode === -3) return;
      const userDataPath = path
        .join(app.getPath("userData"), "config.json")
        .replace(/\\/g, "/");
      const fallback =
        "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<!doctype html><html><head><meta charset="utf-8"><title>ModZero — not connected</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;display:flex;align-items:center;justify-content:center;height:100vh}
.card{max-width:560px;padding:32px;background:#1e293b;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
h1{color:#a5b4fc;margin-top:0;font-size:22px}
code{background:#0b1220;padding:2px 6px;border-radius:4px;color:#fbbf24;font-size:12px}
p{line-height:1.6}
button{background:#4f46e5;color:#fff;border:0;padding:10px 18px;border-radius:6px;font-size:14px;cursor:pointer;margin-top:8px}</style></head><body>
<div class="card"><h1>Cannot reach ModZero</h1>
<p>Tried <code>${validatedUrl}</code> but got <strong>${errorDesc} (${errorCode})</strong>.</p>
<p>Start the stack:<br><code>docker compose up -d</code></p>
<p>Or override the target URL via <code>MODZERO_URL</code> env var, or edit:<br><code>${userDataPath}</code> with <code>{ "url": "http://your-server:5173" }</code></p>
<button onclick="location.reload()">Retry</button></div></body></html>`,
        );
      mainWindow?.loadURL(fallback);
    },
  );

  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  const trayIconPath = resourcePath("tray-icon.png");
  let img = nativeImage.createFromPath(trayIconPath);
  if (img.isEmpty()) img = nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip("ModZero Dashboard");

  const menu = Menu.buildFromTemplate([
    { label: `ModZero  •  ${resolveAppUrl()}`, enabled: false },
    { type: "separator" },
    { label: "Open Dashboard", click: () => showWindow() },
    {
      label: "Open in Browser",
      click: () => shell.openExternal(resolveAppUrl()),
    },
    { type: "separator" },
    {
      label: "Quit ModZero",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);

  tray.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      showWindow();
    }
  });
}

ipcMain.handle("get-platform", () => process.platform);
ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on("window-close", () => mainWindow?.close());

app.whenReady().then(() => {
  createTray();
  createWindow();
});

app.on("window-all-closed", () => {
  // Stay alive in tray; quit only via tray menu.
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    showWindow();
  }
});
