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

interface WinPosture {
  firewall: boolean | null;
  antivirus: boolean | null;
  disk: boolean | null;
  lock: boolean | null;
}

// A SINGLE PowerShell script runs all four OS checks and emits one JSON object.
// This replaces the old approach of spawning up to 8 separate powershell.exe
// processes (one per check, plus fallbacks). On a cold start, paying the
// PowerShell/.NET startup cost 8× in parallel routinely blew the per-check
// timeouts and left every signal N/A on the first device check. One process =
// one cold-start cost = reliable results. Each check is wrapped so a single
// failure leaves that signal null (N/A) without aborting the rest.
const PS_POSTURE_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$o = [ordered]@{ firewall = $null; antivirus = $null; disk = $null; lock = $null }

# ── Firewall: cmdlet first, registry fallback (registry works on locked-down VMs) ──
try {
  $c = (Get-NetFirewallProfile | Where-Object { $_.Enabled -eq $true }).Count
  if ("$c" -ne '') { $o.firewall = [bool]($c -gt 0) }
} catch {}
if ($null -eq $o.firewall) {
  try {
    $k = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy'
    $on = @('DomainProfile','StandardProfile','PublicProfile') | ForEach-Object { (Get-ItemProperty "$k\\$_").EnableFirewall } | Where-Object { $_ -eq 1 }
    $o.firewall = [bool](@($on).Count -gt 0)
  } catch {}
}

# ── Antivirus: Defender status, Security Center WMI, then WinDefend service ──
try {
  $d = (Get-MpComputerStatus).AntivirusEnabled
  if ($null -ne $d) { $o.antivirus = [bool]$d }
} catch {}
if ($null -eq $o.antivirus) {
  try {
    $n = (Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntivirusProduct | Measure-Object).Count
    if ($null -ne $n) { $o.antivirus = [bool]($n -gt 0) }
  } catch {}
}
if ($null -eq $o.antivirus) {
  try { if ((Get-Service -Name WinDefend).Status -eq 'Running') { $o.antivirus = $true } } catch {}
}

# ── Disk encryption: require Protection On AND Fully Encrypted (avoids VM false +) ──
try {
  $v = Get-BitLockerVolume -MountPoint $env:SystemDrive
  if ($null -ne $v) { $o.disk = [bool]($v.ProtectionStatus -eq 'On' -and $v.VolumeStatus -eq 'FullyEncrypted') }
} catch {}
if ($null -eq $o.disk) {
  try {
    $r = (manage-bde -status $env:SystemDrive | Out-String)
    if ("$r" -ne '') {
      $o.disk = [bool](($r -match 'Conversion Status:\\s+Fully Encrypted') -and ($r -match 'Protection Status:\\s+Protection On'))
    }
  } catch {}
}

# ── Screen lock: secure screensaver OR a non-zero console-lock display timeout ──
try {
  $p = Get-ItemProperty 'HKCU:\\Control Panel\\Desktop'
  $ss = ($p.ScreenSaveActive -eq '1') -and ($p.ScreenSaverIsSecure -eq '1')
  $q = (powercfg /query SCHEME_CURRENT | Out-String)
  $cl = ($q -match '0E796B57-F373-C527-FFE5-3FFFFF4437E1') -and ($q -match 'Current AC Power Setting Index: 0x(?!00000000)[0-9a-fA-F]{8}')
  $o.lock = [bool]($ss -or $cl)
} catch {}

$o | ConvertTo-Json -Compress
`;

async function collectWindowsPosture(timeoutMs = 20000): Promise<WinPosture> {
  const empty: WinPosture = { firewall: null, antivirus: null, disk: null, lock: null };
  if (process.platform !== "win32") return empty;
  // -EncodedCommand (base64 UTF-16LE) sidesteps all quoting/escaping issues that
  // plague passing a multi-line script via -Command.
  const encoded = Buffer.from(PS_POSTURE_SCRIPT, "utf16le").toString("base64");
  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { timeout: timeoutMs, encoding: "utf-8", maxBuffer: 1024 * 1024 },
    );
    const parsed = JSON.parse((stdout || "").trim());
    const asBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
    return {
      firewall:  asBool(parsed.firewall),
      antivirus: asBool(parsed.antivirus),
      disk:      asBool(parsed.disk),
      lock:      asBool(parsed.lock),
    };
  } catch {
    return empty;
  }
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

// One PowerShell process runs all four OS checks (see PS_POSTURE_SCRIPT) and is
// never blocking — execAsync runs off the main thread. If a cold-start first run
// returns every signal null (e.g. PowerShell still warming up), retry once.
export async function collectPosture(): Promise<PostureSignals> {
  let win = await collectWindowsPosture();
  const allNull =
    win.firewall === null && win.antivirus === null &&
    win.disk === null && win.lock === null;
  if (process.platform === "win32" && allNull) {
    win = await collectWindowsPosture();
  }
  return {
    device_name:             os.hostname(),
    os_version:              `${os.platform()} ${os.release()}`,
    fingerprint:             getOrCreateFingerprint(),
    firewall_enabled:        win.firewall,
    antivirus_enabled:       win.antivirus,
    disk_encryption_enabled: win.disk,
    screen_lock_enabled:     win.lock,
    os_supported:            detectOsSupported(),
    client_healthy:          detectClientHealthy(),
    intune_compliant:        null,
  };
}
