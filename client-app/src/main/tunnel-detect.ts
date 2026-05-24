/**
 * tunnel-detect — read-only tailscale status probe.
 *
 * STRICTLY READ-ONLY. This module must NEVER run:
 *   tailscale up | set | login | logout
 *   wg set | ip route | netsh | sudo | install operations
 * Only `tailscale status --json` and `tailscale ip -4` are allowed.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export type TunnelStatus =
  | "not_installed"
  | "installed_not_joined"
  | "joined"
  | "unknown";

export interface TunnelDetectResult {
  status: TunnelStatus;
  installed: boolean;
  node_name: string | null;
  wireguard_ip: string | null;
  login_server: string | null;
  detail?: string;
}

const KNOWN_PATHS_WIN = [
  "C:\\Program Files\\Tailscale\\tailscale.exe",
  "C:\\Program Files (x86)\\Tailscale\\tailscale.exe",
];
const KNOWN_PATHS_UNIX = [
  "/usr/bin/tailscale",
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
];

function findBinary(): string | null {
  const candidates =
    process.platform === "win32" ? KNOWN_PATHS_WIN : KNOWN_PATHS_UNIX;
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  // PATH lookup — last resort. We still don't return the resolved path to caller.
  const pathEnv = process.env.PATH || "";
  const sep = process.platform === "win32" ? ";" : ":";
  const exe = process.platform === "win32" ? "tailscale.exe" : "tailscale";
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    const candidate = path.join(dir, exe);
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function tryStatusJson(bin: string): unknown | null {
  try {
    const out = execFileSync(bin, ["status", "--json"], {
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return JSON.parse(out.toString("utf-8"));
  } catch {
    return null;
  }
}

function tryIpV4(bin: string): string | null {
  try {
    const out = execFileSync(bin, ["ip", "-4"], {
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const line = out.toString("utf-8").trim().split(/\r?\n/)[0];
    return line || null;
  } catch {
    return null;
  }
}

export function detectTunnel(): TunnelDetectResult {
  const base: TunnelDetectResult = {
    status: "unknown",
    installed: false,
    node_name: null,
    wireguard_ip: null,
    login_server: null,
  };
  try {
    const bin = findBinary();
    if (!bin) return { ...base, status: "not_installed", installed: false };

    const data = tryStatusJson(bin) as Record<string, unknown> | null;
    if (!data || typeof data !== "object") {
      return { ...base, status: "installed_not_joined", installed: true };
    }
    const backendState = String((data as any).BackendState || "");
    if (backendState !== "Running") {
      return { ...base, status: "installed_not_joined", installed: true };
    }

    const self = (data as any).Self || {};
    const tailnet = (data as any).CurrentTailnet || {};
    const hostName = (self.HostName as string) || null;
    const tsIps = (self.TailscaleIPs as string[]) || [];
    let ip: string | null = tsIps.length > 0 ? tsIps[0] : null;
    const online = self.Online === true;
    const loginServer =
      (tailnet.LoginServer as string) || (tailnet.Name as string) || null;

    if (online && !ip) ip = tryIpV4(bin);

    if (online && ip) {
      return {
        status: "joined",
        installed: true,
        node_name: hostName,
        wireguard_ip: ip,
        login_server: loginServer,
      };
    }
    return {
      status: "installed_not_joined",
      installed: true,
      node_name: hostName,
      wireguard_ip: null,
      login_server: loginServer,
    };
  } catch (err) {
    const name: string =
      (err != null &&
        typeof (err as { constructor?: { name?: string } }).constructor?.name === "string"
        ? (err as { constructor: { name: string } }).constructor.name
        : null) ?? "Error";
    return { ...base, status: "unknown", detail: name };
  }
}
