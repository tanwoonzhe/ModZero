/**
 * Electron main process — ModZero Dashboard.
 *
 * Flow:
 *   1. On launch, check user config for a saved server URL.
 *   2. If absent → show the native onboarding page.
 *   3. Onboarding probes /health, then either logs in or exchanges an
 *      enrollment token. On success, config is persisted and the native
 *      "connected" view is shown (device name, server URL, trust score,
 *      device posture, last heartbeat). A periodic heartbeat keeps
 *      everything live.
 *   4. In dev mode (electron started via `npm run dev`) the legacy
 *      behaviour of loading the Vite dev server at localhost:5173 is
 *      preserved — onboarding is bypassed.
 *
 * Tray icon (Twingate / Tailscale style) keeps the app in the system
 * tray; closing the window hides it.
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  net,
  shell,
  Tray,
} from "electron";
import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { collectPosture, getOrCreateFingerprint } from "./posture";
import { detectTunnel } from "./tunnel-detect";

const isDev = !app.isPackaged;

// ── Require administrator on Windows ────────────────────────────────────
// Posture checks (firewall, BitLocker, screen lock) need elevated access.
// If not already admin, re-launch via UAC and exit.
if (process.platform === "win32" && !isDev) {
  let isAdmin = false;
  try {
    execSync("net session", { stdio: "ignore" });
    isAdmin = true;
  } catch { /* not admin */ }

  if (!isAdmin) {
    spawn(
      "powershell",
      ["-NoProfile", "-Command", `Start-Process -FilePath '${process.execPath}' -Verb RunAs`],
      { detached: true, stdio: "ignore" },
    ).unref();
    // Delay quit so the UAC prompt has time to register before this process exits
    setTimeout(() => app.quit(), 800);
  }
}

// ── Types ───────────────────────────────────────────────────────────────
type ConnectMode = "login" | "token";
interface SavedConfig {
  url?: string;
  mode?: ConnectMode;
  accessToken?: string;
  lastUser?: string;
  identity?: string;
  enrolledAt?: number;
}
interface ConnectPayload {
  url: string;
  mode: ConnectMode;
  credential: {
    token?: string;
    user?: { username?: string; email?: string } | null;
    enrollment?: unknown;
  };
}

// ── Paths / config ──────────────────────────────────────────────────────
function configPath(): string {
  return path.join(app.getPath("userData"), "config.json");
}
function readConfig(): SavedConfig {
  try {
    const p = configPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    /* ignore */
  }
  return {};
}
function writeConfig(cfg: SavedConfig): void {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write config:", e);
  }
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

// ── Runtime state ───────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let heartbeatTimer: NodeJS.Timeout | null = null;

const session = {
  connectedSince: 0,
  lastHeartbeat: 0,
  healthy: false,
  trustScore: null as number | null,
};

// ── Single instance ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
}

// ── HTTP helper using Electron net (works without renderer) ─────────────
function httpJson(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = net.request({ method: opts.method || "GET", url });
    for (const [k, v] of Object.entries(opts.headers || {})) {
      req.setHeader(k, v);
    }
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        req.abort();
      } catch {
        /* ignore */
      }
      reject(new Error("timeout"));
    }, opts.timeoutMs || 5000);
    let chunks = "";
    req.on("response", (resp) => {
      resp.on("data", (c) => (chunks += c.toString("utf-8")));
      resp.on("end", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ status: resp.statusCode || 0, body: chunks });
      });
    });
    req.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function probeHealth(baseUrl: string): Promise<boolean> {
  for (const path of ["/health", "/api/health"]) {
    try {
      const r = await httpJson(baseUrl + path, { timeoutMs: 4000 });
      if (r.status >= 200 && r.status < 300) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

// ── Window management ──────────────────────────────────────────────────
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
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  routeStartup();
}

function routeStartup(): void {
  if (!mainWindow) return;
  if (isDev) {
    // Preserve the dev convenience: load the running Vite frontend.
    mainWindow.loadURL(process.env.MODZERO_URL || "http://localhost:5173");
    return;
  }
  const cfg = readConfig();
  if (cfg.url && cfg.accessToken) {
    // Have a saved connection — verify before showing connected view.
    probeHealth(cfg.url).then((ok) => {
      session.healthy = ok;
      session.lastHeartbeat = ok ? Date.now() : 0;
      session.connectedSince = cfg.enrolledAt || Date.now();
      showConnected();
      if (ok) startHeartbeat();
    });
  } else {
    showOnboarding();
  }
}

function showOnboarding(): void {
  if (!mainWindow) return;
  stopHeartbeat();
  mainWindow.setTitle("ModZero — Connect");
  mainWindow.loadFile(resourcePath("onboarding.html"));
}
function showConnected(): void {
  if (!mainWindow) return;
  mainWindow.setTitle("ModZero — Connected");
  mainWindow.loadFile(resourcePath("connected.html"));
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

// ── Heartbeat ───────────────────────────────────────────────────────────
function startHeartbeat(): void {
  stopHeartbeat();
  doHeartbeat();
  heartbeatTimer = setInterval(doHeartbeat, 30_000);
}
function stopHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}
async function doHeartbeat(): Promise<void> {
  const cfg = readConfig();
  if (!cfg.url) return;
  const ok = await probeHealth(cfg.url);
  session.healthy = ok;
  if (ok) {
    session.lastHeartbeat = Date.now();
    // Fetch the real latest trust score from the backend.
    // /api/trust/latest returns the most recent DeviceTrustScore for the user.
    if (cfg.accessToken) {
      try {
        const r = await httpJson(cfg.url + "/api/trust/latest", {
          headers: { Authorization: `Bearer ${cfg.accessToken}` },
          timeoutMs: 3500,
        });
        if (r.status >= 200 && r.status < 300) {
          const data = JSON.parse(r.body || "{}");
          const raw = Number(data.total_score ?? null);
          if (!Number.isNaN(raw)) {
            session.trustScore = Math.round(raw);
          }
        }
        // 404 = no device registered yet — leave trustScore as-is (null until device check runs)
      } catch {
        /* ignore */
      }
    }
  }
  if (tray) updateTrayMenu();
}

// ── Tray ───────────────────────────────────────────────────────────────
function createTray(): void {
  const trayIconPath = resourcePath("tray-icon.png");
  let img = nativeImage.createFromPath(trayIconPath);
  if (img.isEmpty()) img = nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip("ModZero Dashboard");
  updateTrayMenu();
  tray.on("click", () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else showWindow();
  });
}

function updateTrayMenu(): void {
  if (!tray) return;
  const cfg = readConfig();
  const connected = !!cfg.url && session.healthy;
  const items: Electron.MenuItemConstructorOptions[] = [
    {
      label: connected
        ? `Connected to ${cfg.url}`
        : cfg.url
          ? `Disconnected (${cfg.url})`
          : "Not configured",
      enabled: false,
    },
  ];
  if (session.trustScore != null && connected) {
    items.push({ label: `Trust score: ${session.trustScore}/100`, enabled: false });
  }
  items.push(
    { type: "separator" },
    { label: "Open Dashboard", click: () => showWindow() },
  );
  if (cfg.url && connected) {
    items.push({
      label: "Open in Browser",
      click: () => shell.openExternal(cfg.url!),
    });
  }
  if (cfg.url) {
    items.push({
      label: "Disconnect…",
      click: () => {
        writeConfig({});
        session.healthy = false;
        session.trustScore = null;
        stopHeartbeat();
        showOnboarding();
        updateTrayMenu();
      },
    });
  }
  items.push(
    { type: "separator" },
    {
      label: "Quit ModZero",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  );
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// ── IPC ────────────────────────────────────────────────────────────────
ipcMain.handle("modzero:get-config", () => readConfig());

ipcMain.handle("modzero:save-and-connect", async (_evt, payload: ConnectPayload) => {
  if (!payload || !payload.url) return false;
  const next: SavedConfig = {
    url: payload.url,
    mode: payload.mode,
    accessToken: payload.credential?.token,
    lastUser: payload.credential?.user?.username,
    identity:
      payload.credential?.user?.email ||
      payload.credential?.user?.username ||
      "Device user",
    enrolledAt: Date.now(),
  };
  writeConfig(next);
  session.connectedSince = next.enrolledAt!;
  session.healthy = true;
  session.lastHeartbeat = Date.now();
  showConnected();
  startHeartbeat();
  updateTrayMenu();
  return true;
});

ipcMain.handle("modzero:snapshot", () => {
  const cfg = readConfig();
  return {
    url: cfg.url || null,
    identity: cfg.identity || cfg.lastUser || os.userInfo().username,
    deviceName: os.hostname(),
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    appVersion: app.getVersion(),
    connectedSince: session.connectedSince || cfg.enrolledAt || null,
    lastHeartbeat: session.lastHeartbeat || null,
    healthy: session.healthy,
    trustScore: session.trustScore,
  };
});

ipcMain.handle("modzero:heartbeat-now", async () => {
  await doHeartbeat();
  return { healthy: session.healthy, lastHeartbeat: session.lastHeartbeat };
});

ipcMain.handle("modzero:open-full", () => {
  const cfg = readConfig();
  if (cfg.url) shell.openExternal(cfg.url);
});

ipcMain.handle("modzero:disconnect", () => {
  writeConfig({});
  session.healthy = false;
  session.trustScore = null;
  stopHeartbeat();
  showOnboarding();
  updateTrayMenu();
});

ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on("window-close", () => mainWindow?.close());

// ── Backend API helpers ─────────────────────────────────────────────────
function forceReauth(reason: string): void {
  const cfg = readConfig();
  delete cfg.accessToken;
  delete cfg.identity;
  delete cfg.lastUser;
  delete cfg.enrolledAt;
  writeConfig(cfg);
  session.healthy = false;
  session.trustScore = null;
  stopHeartbeat();
  if (mainWindow) showOnboarding();
  updateTrayMenu();
  console.warn("Forced re-auth:", reason);
}

function authedRequest(
  method: string,
  apiPath: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const cfg = readConfig();
  if (!cfg.url || !cfg.accessToken) {
    return Promise.resolve({ ok: false, status: 0, data: null, error: "Not connected" });
  }
  const url = cfg.url + apiPath;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.accessToken}`,
  };
  let raw: string | undefined;
  if (body !== undefined) {
    raw = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  return httpJson(url, { method, headers, body: raw, timeoutMs: 8000 })
    .then((r) => {
      let parsed: unknown = null;
      try { parsed = r.body ? JSON.parse(r.body) : null; } catch { parsed = r.body; }
      const ok = r.status >= 200 && r.status < 300;
      if (r.status === 401 || r.status === 403) {
        // Token rejected — wipe and force re-auth so the user is not stuck.
        forceReauth(`HTTP ${r.status} from ${apiPath}`);
      }
      return {
        ok,
        status: r.status,
        data: parsed,
        error: ok ? undefined : (typeof parsed === "object" && parsed && "detail" in parsed
          ? String((parsed as { detail: unknown }).detail)
          : `HTTP ${r.status}`),
      };
    })
    .catch((e) => ({ ok: false, status: 0, data: null, error: String(e?.message || e) }));
}

// ── Posture / resources / access IPC ────────────────────────────────────
ipcMain.handle("modzero:collect-posture", () => collectPosture());

ipcMain.handle("modzero:run-device-check", async () => {
  const signals = await collectPosture();
  const result = await authedRequest("POST", "/api/posture/report", signals);
  // Keep session trust score in sync so Overview reflects the new score immediately.
  if (result.ok && result.data != null) {
    const raw = Number((result.data as Record<string, unknown>).total_score ?? null);
    if (!Number.isNaN(raw)) {
      session.trustScore = Math.round(raw);
      if (tray) updateTrayMenu();
    }
  }
  return { signals, result };
});

ipcMain.handle("modzero:trust-latest", () => authedRequest("GET", "/api/trust/latest"));

ipcMain.handle("modzero:list-resources", () => authedRequest("GET", "/api/resources"));

ipcMain.handle("modzero:request-access", async (_evt, args: { resource_id: string }) => {
  if (!args || !args.resource_id) {
    return { ok: false, status: 0, data: null, error: "resource_id required" };
  }
  return authedRequest("POST", "/api/access/request", { resource_id: args.resource_id });
});

ipcMain.handle("modzero:open-access-url", async (_evt, url: string) => {
  if (url && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("modzero://"))) {
    await shell.openExternal(url);
  }
});

// ── Settings (backend URL) ──────────────────────────────────────────────
ipcMain.handle("modzero:set-backend-url", (_evt, url: string) => {
  const v = (url || "").trim().replace(/\/+$/, "");
  if (!v) return { ok: false, error: "URL required" };
  const cfg = readConfig();
  const urlChanged = cfg.url !== v;
  cfg.url = v;
  if (urlChanged) {
    // Token issued by the old server is useless on the new one — force re-login.
    delete cfg.accessToken;
    delete cfg.identity;
    delete cfg.lastUser;
    delete cfg.enrolledAt;
    writeConfig(cfg);
    session.healthy = false;
    session.trustScore = null;
    stopHeartbeat();
    showOnboarding();
    updateTrayMenu();
    return { ok: true, url: v, reauth: true };
  }
  writeConfig(cfg);
  return { ok: true, url: v };
});

ipcMain.handle("modzero:get-fingerprint", () => getOrCreateFingerprint());

ipcMain.handle(
  "modzero:change-password",
  (_evt, args: { current_password: string; new_password: string }) =>
    authedRequest("POST", "/api/users/me/change-password", args),
);

// ── Tunnel readiness + enrollment ───────────────────────────────────────
ipcMain.handle("modzero:tunnel-detect", () => detectTunnel());

ipcMain.handle(
  "modzero:tunnel-enrollment",
  async (
    _evt,
    args: { device_id?: string; node_name_hint?: string } | undefined,
  ) => {
    const body = args
      ? { device_id: args.device_id, node_name_hint: args.node_name_hint }
      : {};
    return authedRequest("POST", "/api/tunnels/user-enrollment", body);
  },
);

// ── App lifecycle ───────────────────────────────────────────────────────
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createTray();
  createWindow();
});

app.on("window-all-closed", () => {
  // Stay alive in tray.
});

app.on("before-quit", () => {
  isQuitting = true;
  stopHeartbeat();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else showWindow();
});
