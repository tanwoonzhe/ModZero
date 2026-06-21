/**
 * Windows posture collection for the ModZero desktop client.
 *
 * All OS checks use async exec (non-blocking) and run in parallel via
 * Promise.all, so the Electron main process is never blocked.
 */

import { exec } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { app } from "electron";

const execAsync = promisify(exec);

export interface PostureSignals {
  device_name: string;
  os_version: string;
  fingerprint: string;
  firewall_enabled: boolean | null;
  antivirus_enabled: boolean | null;
  disk_encryption_enabled: boolean | null;
  screen_lock_enabled: boolean | null;
  os_supported: boolean | null;
  client_healthy: boolean | null;
  intune_compliant: boolean | null;
}

async function runPs(command: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '\\"')}"`,
      { timeout: timeoutMs, encoding: "utf-8" },
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

async function detectFirewall(): Promise<boolean | null> {
  if (process.platform !== "win32") return null;
  const out = await runPs(
    "(Get-NetFirewallProfile -ErrorAction SilentlyContinue | Where-Object {$_.Enabled -eq $true}).Count",
  );
  if (out == null) return null;
  const n = parseInt(out, 10);
  return Number.isFinite(n) ? n > 0 : null;
}

async function detectAntivirus(): Promise<boolean | null> {
  if (process.platform !== "win32") return null;
  // Run Windows Defender check and Security Center WMI check in parallel.
  const [def, wmi] = await Promise.all([
    runPs("(Get-MpComputerStatus -ErrorAction SilentlyContinue).AntivirusEnabled"),
    runPs(
      "(Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntivirusProduct -ErrorAction SilentlyContinue | Measure-Object).Count",
    ),
  ]);
  if (def && def.toLowerCase() === "true") return true;
  if (wmi != null) {
    const n = parseInt(wmi, 10);
    if (Number.isFinite(n)) return n > 0;
  }
  return def ? false : null;
}

async function detectDiskEncryption(): Promise<boolean | null> {
  if (process.platform !== "win32") return null;
  const ps = await runPs(
    "(Get-BitLockerVolume -MountPoint $env:SystemDrive -ErrorAction SilentlyContinue).ProtectionStatus",
  );
  if (ps != null && ps !== "") {
    return ps.trim() === "1" || ps.trim().toLowerCase() === "on";
  }
  const bde = await runPs(
    "$r = (manage-bde -status $env:SystemDrive 2>$null); if ($r -match 'Protection.*On') { 'true' } else { 'false' }",
  );
  if (bde != null && bde !== "") return bde.trim().toLowerCase() === "true";
  return null;
}

async function detectScreenLock(): Promise<boolean | null> {
  if (process.platform !== "win32") return null;
  const out = await runPs(
    "$ss = ((Get-ItemProperty 'HKCU:\\Control Panel\\Desktop' -EA SilentlyContinue).ScreenSaveActive -eq '1') -and " +
    "((Get-ItemProperty 'HKCU:\\Control Panel\\Desktop' -EA SilentlyContinue).ScreenSaverIsSecure -eq '1'); " +
    "$q = (powercfg /query SCHEME_CURRENT 2>$null | Out-String); " +
    "$cl = ($q -match '0E796B57-F373-C527-FFE5-3FFFFF4437E1') -and " +
    "($q -match 'Current AC Power Setting Index: 0x(?!00000000)[0-9a-fA-F]{8}'); " +
    "if ($ss -or $cl) { 'true' } else { 'false' }",
    8000,
  );
  if (out == null) return null;
  return out.trim().toLowerCase() === "true";
}

function detectClientHealthy(): boolean {
  try {
    return fs.existsSync(fingerprintPath());
  } catch {
    return true;
  }
}

function detectOsSupported(): boolean {
  if (process.platform !== "win32") return true;
  const release = os.release();
  const major = parseInt(release.split(".")[0] || "0", 10);
  return major >= 10;
}

function fingerprintPath(): string {
  return path.join(app.getPath("userData"), "fingerprint.txt");
}

export function getOrCreateFingerprint(): string {
  const fp = fingerprintPath();
  try {
    if (fs.existsSync(fp)) {
      const v = fs.readFileSync(fp, "utf-8").trim();
      if (v) return v;
    }
  } catch {
    /* ignore */
  }
  const seed =
    os.hostname() + "|" + os.platform() + "|" + os.arch() + "|" + crypto.randomBytes(8).toString("hex");
  const value = crypto.createHash("sha256").update(seed).digest("hex");
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, value, "utf-8");
  } catch (e) {
    console.error("Failed to persist fingerprint:", e);
  }
  return value;
}

// All four OS checks run in parallel — main thread is never blocked.
// Worst-case total time = max(individual timeouts) = 8s (screen lock),
// not the sum (previously up to ~37s of main-thread blocking).
export async function collectPosture(): Promise<PostureSignals> {
  const [firewall, antivirus, disk, screen] = await Promise.all([
    detectFirewall(),
    detectAntivirus(),
    detectDiskEncryption(),
    detectScreenLock(),
  ]);
  return {
    device_name:             os.hostname(),
    os_version:              `${os.platform()} ${os.release()}`,
    fingerprint:             getOrCreateFingerprint(),
    firewall_enabled:        firewall,
    antivirus_enabled:       antivirus,
    disk_encryption_enabled: disk,
    screen_lock_enabled:     screen,
    os_supported:            detectOsSupported(),
    client_healthy:          detectClientHealthy(),
    intune_compliant:        null,
  };
}
