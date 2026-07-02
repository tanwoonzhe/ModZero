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
  av_advanced_protection: boolean | null;
  disk_encryption_enabled: boolean | null;
  screen_lock_enabled: boolean | null;
  os_supported: boolean | null;
  client_version: string;
  intune_compliant: boolean | null;
}

interface WinPosture {
  firewall: boolean | null;
  antivirus: boolean | null;
  avAdvanced: boolean | null;
  disk: boolean | null;
  lock: boolean | null;
  osPatched: boolean | null;
}

// A SINGLE PowerShell script runs all OS checks and emits one JSON object.
// This replaces the old approach of spawning up to 8 separate powershell.exe
// processes (one per check, plus fallbacks). On a cold start, paying the
// PowerShell/.NET startup cost 8× in parallel routinely blew the per-check
// timeouts and left every signal N/A on the first device check. One process =
// one cold-start cost = reliable results. Each check is wrapped so a single
// failure leaves that signal null (N/A) without aborting the rest.
const PS_POSTURE_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$o = [ordered]@{ firewall = $null; antivirus = $null; avAdvanced = $null; disk = $null; lock = $null; osPatched = $null }

# ── Firewall: ALL THREE profiles (Domain, Private, Public) must be enabled ──
# Registry fallback works on locked-down VMs where the cmdlet is unavailable.
try {
  $profiles = @(Get-NetFirewallProfile)
  if ($profiles.Count -gt 0) {
    $enabledCount = @($profiles | Where-Object { $_.Enabled -eq $true }).Count
    $o.firewall = [bool]($enabledCount -eq $profiles.Count)
  }
} catch {}
if ($null -eq $o.firewall) {
  try {
    $k = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy'
    $vals = @('DomainProfile','StandardProfile','PublicProfile') | ForEach-Object { (Get-ItemProperty "$k\\$_").EnableFirewall }
    $o.firewall = [bool](@($vals | Where-Object { $_ -eq 1 }).Count -eq 3)
  } catch {}
}

# ── Shared Defender lookups: fetched ONCE and reused below. Get-MpPreference
# in particular is known to be slow on some systems — calling either cmdlet
# twice in this script (as an earlier version of this script did) roughly
# doubled that cost and risked pushing the whole script past its timeout,
# which fails EVERY signal below (not just the Defender ones).
$mpStatus = $null
try { $mpStatus = Get-MpComputerStatus } catch {}
$mpPref = $null
try { $mpPref = Get-MpPreference } catch {}

# ── Antivirus: Defender status, Security Center WMI, then WinDefend service ──
try {
  if ($null -ne $mpStatus.AntivirusEnabled) { $o.antivirus = [bool]$mpStatus.AntivirusEnabled }
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

# ── Antivirus Advanced Protection: Real-time protection, Cloud-delivered
# protection, Automatic sample submission, and Dev Drive protection must ALL
# be on (mirrors Windows Security's "Virus & threat protection settings"
# page). Only Defender-specific — N/A on third-party AV or if any one of the
# four properties can't be read (never guesses; unreadable = N/A, not Fail).
# Dev Drive protection is a newer Defender preference (PerformanceModeStatusForDevDrive)
# not present on all Windows builds — that sub-check safely no-ops via try/catch.
try {
  $rtp = $mpStatus.RealTimeProtectionEnabled
  $cloud = $null
  if ($null -ne $mpPref.MAPSReporting) { $cloud = [bool]($mpPref.MAPSReporting -ne 0) }
  $sample = $null
  if ($null -ne $mpPref.SubmitSamplesConsent) { $sample = [bool]($mpPref.SubmitSamplesConsent -eq 1 -or $mpPref.SubmitSamplesConsent -eq 3) }
  $devDrive = $null
  try {
    if ($null -ne $mpPref.PerformanceModeStatusForDevDrive) { $devDrive = [bool]($mpPref.PerformanceModeStatusForDevDrive -eq 0) }
  } catch {}
  if (($null -ne $rtp) -and ($null -ne $cloud) -and ($null -ne $sample) -and ($null -ne $devDrive)) {
    $o.avAdvanced = [bool]($rtp -and $cloud -and $sample -and $devDrive)
  }
} catch {}

# ── Disk encryption: require Protection On AND Fully Encrypted (avoids VM false +) ──
try {
  $v = Get-BitLockerVolume -MountPoint $env:SystemDrive
  if ($null -ne $v) { $o.disk = [bool]($v.ProtectionStatus -eq 'On' -and $v.VolumeStatus -eq 'FullyEncrypted') }
} catch {}
if ($null -eq $o.disk) {
  try {
    $r = (manage-bde -status $env:SystemDrive | Out-String)
    # manage-bde without admin rights prints an "Access denied" error, not a
    # status block — that error text still isn't empty, so checking only
    # "-ne ''" previously mis-scored it as a real (and always-false) result.
    # Require the actual status line to be present before trusting the match.
    if ($r -match 'Conversion Status:') {
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

# ── OS recently patched: most recent installed update within 90 days ──
# Win32_QuickFixEngineering is the standard source for this but is known to
# under-report on some systems (cumulative updates don't always populate
# InstalledOn) — unreadable/empty leaves this N/A rather than a false Fail.
# Measure-Object -Maximum avoids sorting the full update history (can be
# years' worth of entries) just to keep the single newest date.
try {
  $dates = Get-CimInstance -ClassName Win32_QuickFixEngineering -ErrorAction Stop |
    Where-Object { $_.InstalledOn } | Measure-Object -Property InstalledOn -Maximum
  if ($dates -and $dates.Maximum) {
    $days = (New-TimeSpan -Start $dates.Maximum -End (Get-Date)).Days
    $o.osPatched = [bool]($days -le 90)
  }
} catch {}

$o | ConvertTo-Json -Compress
`;

// Diagnostic log — collectWindowsPosture's catch previously swallowed every
// failure silently, so when it broke there was no way to tell why (timeout?
// PowerShell error? bad JSON?) without a debugger attached. Now it's written
// to a small rolling file in userData so a report of "device check shows
// all N/A" can actually be diagnosed from what the user sends back.
function logDiagnostic(line: string): void {
  try {
    const p = path.join(app.getPath("userData"), "posture-debug.log");
    const entry = `[${new Date().toISOString()}] ${line}\n`;
    fs.appendFileSync(p, entry, "utf-8");
    // Cap the file at ~200KB so it can't grow unbounded across many runs.
    const stat = fs.statSync(p);
    if (stat.size > 200_000) {
      const tail = fs.readFileSync(p, "utf-8").slice(-100_000);
      fs.writeFileSync(p, tail, "utf-8");
    }
  } catch {
    /* logging must never break posture collection */
  }
}

async function collectWindowsPosture(timeoutMs = 30000): Promise<WinPosture> {
  const empty: WinPosture = { firewall: null, antivirus: null, avAdvanced: null, disk: null, lock: null, osPatched: null };
  if (process.platform !== "win32") return empty;
  // -EncodedCommand (base64 UTF-16LE) sidesteps all quoting/escaping issues that
  // plague passing a multi-line script via -Command.
  const encoded = Buffer.from(PS_POSTURE_SCRIPT, "utf16le").toString("base64");
  const startedAt = Date.now();
  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { timeout: timeoutMs, encoding: "utf-8", maxBuffer: 1024 * 1024 },
    );
    const elapsedMs = Date.now() - startedAt;
    const parsed = JSON.parse((stdout || "").trim());
    const asBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
    logDiagnostic(`posture script OK in ${elapsedMs}ms: ${stdout.trim()}`);
    return {
      firewall:   asBool(parsed.firewall),
      antivirus:  asBool(parsed.antivirus),
      avAdvanced: asBool(parsed.avAdvanced),
      disk:       asBool(parsed.disk),
      lock:       asBool(parsed.lock),
      osPatched:  asBool(parsed.osPatched),
    };
  } catch (e: any) {
    const elapsedMs = Date.now() - startedAt;
    const killed = e?.killed ? " (killed — likely timeout)" : "";
    logDiagnostic(
      `posture script FAILED after ${elapsedMs}ms${killed}: code=${e?.code} signal=${e?.signal} ` +
      `message=${e?.message} stderr=${(e?.stderr || "").slice(0, 2000)} stdout=${(e?.stdout || "").slice(0, 2000)}`
    );
    return empty;
  }
}

function detectOsSupportedFallback(): boolean {
  // Non-Windows: no patch-recency signal available, fall back to a basic
  // major-version floor so the check isn't N/A on every non-Windows platform.
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

// One PowerShell process runs all Windows checks (see PS_POSTURE_SCRIPT) and is
// never blocking — execAsync runs off the main thread. If a cold-start first run
// returns every signal null (e.g. PowerShell still warming up), retry once.
export async function collectPosture(): Promise<PostureSignals> {
  let win = await collectWindowsPosture();
  const allNull =
    win.firewall === null && win.antivirus === null && win.avAdvanced === null &&
    win.disk === null && win.lock === null && win.osPatched === null;
  if (process.platform === "win32" && allNull) {
    logDiagnostic("first posture attempt returned all-null, retrying once");
    win = await collectWindowsPosture();
  }
  return {
    device_name:             os.hostname(),
    os_version:              `${os.platform()} ${os.release()}`,
    fingerprint:             getOrCreateFingerprint(),
    firewall_enabled:        win.firewall,
    antivirus_enabled:       win.antivirus,
    av_advanced_protection:  win.avAdvanced,
    disk_encryption_enabled: win.disk,
    screen_lock_enabled:     win.lock,
    // Only fall back to the major-version heuristic when genuinely not on
    // Windows (dev-mode testing on Mac/Linux) — NOT whenever win.osPatched
    // happens to be null, which previously masked a real collection
    // failure (PS script error/timeout) as a fake Pass instead of N/A.
    os_supported:            process.platform === "win32" ? win.osPatched : detectOsSupportedFallback(),
    client_version:          app.getVersion(),
    intune_compliant:        null,
  };
}
