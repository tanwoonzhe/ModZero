/**
 * Windows posture collection for the ModZero desktop client.
 *
 * Uses PowerShell when available (Get-MpComputerStatus / Get-NetFirewallProfile /
 * manage-bde) and falls back to safe defaults so the client still produces a
 * usable posture report on non-Windows or restricted hosts.
 */

import { execSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { app } from "electron";

export interface PostureSignals {
  device_name: string;
  os_version: string;
  fingerprint: string;
  firewall_enabled: boolean | null;
  antivirus_enabled: boolean | null;
  disk_encryption_enabled: boolean | null;
  os_supported: boolean | null;
  intune_compliant: boolean | null;
}

function runPs(command: string, timeoutMs = 5000): string | null {
  try {
    const out = execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${command.replace(/"/g, '\\"')}"`,
      { timeout: timeoutMs, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out.trim();
  } catch {
    return null;
  }
}

function detectFirewall(): boolean | null {
  if (process.platform !== "win32") return null;
  const out = runPs(
    "(Get-NetFirewallProfile -ErrorAction SilentlyContinue | Where-Object {$_.Enabled -eq $true}).Count",
  );
  if (out == null) return null;
  const n = parseInt(out, 10);
  return Number.isFinite(n) ? n > 0 : null;
}

function detectAntivirus(): boolean | null {
  if (process.platform !== "win32") return null;
  // Get-MpComputerStatus is the Windows Defender API; AMRunningMode is "Normal"
  // when AV is active. Also accept any third-party AV via Security Center WMI.
  const def = runPs(
    "(Get-MpComputerStatus -ErrorAction SilentlyContinue).AntivirusEnabled",
  );
  if (def && def.toLowerCase() === "true") return true;
  const wmi = runPs(
    "(Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntivirusProduct -ErrorAction SilentlyContinue | Measure-Object).Count",
  );
  if (wmi != null) {
    const n = parseInt(wmi, 10);
    if (Number.isFinite(n)) return n > 0;
  }
  return def ? false : null;
}

function detectDiskEncryption(): boolean | null {
  if (process.platform !== "win32") return null;
  // BitLocker status — requires admin for full detail, but the protection-status
  // field is readable in most cases. "1" means protection on.
  const out = runPs(
    "(Get-BitLockerVolume -MountPoint $env:SystemDrive -ErrorAction SilentlyContinue).ProtectionStatus",
  );
  if (out == null || out === "") return null;
  return out.trim() === "1" || out.trim().toLowerCase() === "on";
}

function detectOsSupported(): boolean {
  if (process.platform !== "win32") {
    // Non-Windows hosts are treated as "supported" for MVP — we only fail when
    // we can confirm the OS is below the supported baseline.
    return true;
  }
  // Windows 10 / 11 are 10.x; anything earlier is unsupported.
  const release = os.release(); // e.g. "10.0.22631"
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
  // Stable input: hostname + platform + machine arch. Salt with random bytes
  // so two devices with the same hostname don't collide.
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

export function collectPosture(): PostureSignals {
  return {
    device_name: os.hostname(),
    os_version: `${os.platform()} ${os.release()}`,
    fingerprint: getOrCreateFingerprint(),
    firewall_enabled: detectFirewall(),
    antivirus_enabled: detectAntivirus(),
    disk_encryption_enabled: detectDiskEncryption(),
    os_supported: detectOsSupported(),
    // No Intune signal from the client; backend may overlay Graph data later.
    intune_compliant: null,
  };
}
