import * as si from 'systeminformation';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

export async function getDeviceInfo(): Promise<DeviceInfo> {
  const [cpu, mem, disk, network, osInfo] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.fsSize(),
    si.networkInterfaces(),
    si.osInfo(),
  ]);

  const networkInterfaces: NetworkInterface[] = (network as si.Systeminformation.NetworkInterfacesData[])
    .filter((iface) => !iface.internal && iface.mac !== '00:00:00:00:00:00')
    .map((iface) => ({
      name: iface.iface,
      mac: iface.mac,
      ip4: iface.ip4 || '',
      ip6: iface.ip6 || '',
    }));

  const diskInfo = Array.isArray(disk) ? disk[0] : disk;

  // Get security info
  const antivirus = await getAntivirusInfo();
  const firewallEnabled = await checkFirewall();
  const encryptionEnabled = await checkDiskEncryption();
  const lastUpdate = await getLastUpdateTime();

  return {
    hostname: os.hostname(),
    platform: osInfo.platform,
    os_version: `${osInfo.distro} ${osInfo.release}`,
    architecture: osInfo.arch,
    cpu: `${cpu.manufacturer} ${cpu.brand}`,
    memory_total: mem.total,
    memory_free: mem.free,
    disk_total: diskInfo?.size || 0,
    disk_free: (diskInfo?.size || 0) - (diskInfo?.used || 0),
    network_interfaces: networkInterfaces,
    antivirus,
    firewall_enabled: firewallEnabled,
    encryption_enabled: encryptionEnabled,
    last_update: lastUpdate,
  };
}

async function getAntivirusInfo(): Promise<string[]> {
  if (process.platform !== 'win32') return [];

  try {
    const { stdout } = await execAsync(
      'powershell -Command "Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | Select-Object displayName | ConvertTo-Json"'
    );
    const result = JSON.parse(stdout);
    if (Array.isArray(result)) {
      return result.map((av: any) => av.displayName);
    }
    return result?.displayName ? [result.displayName] : [];
  } catch {
    return ['Unknown'];
  }
}

async function checkFirewall(): Promise<boolean> {
  if (process.platform !== 'win32') return true;

  try {
    const { stdout } = await execAsync(
      'powershell -Command "(Get-NetFirewallProfile -Profile Domain,Public,Private | Select-Object Enabled | ConvertTo-Json)"'
    );
    const profiles = JSON.parse(stdout);
    if (Array.isArray(profiles)) {
      return profiles.some((p: any) => p.Enabled === true);
    }
    return profiles?.Enabled === true;
  } catch {
    return false;
  }
}

async function checkDiskEncryption(): Promise<boolean> {
  if (process.platform !== 'win32') return false;

  try {
    const { stdout } = await execAsync(
      'powershell -Command "(Get-BitLockerVolume -MountPoint C: | Select-Object ProtectionStatus | ConvertTo-Json)"'
    );
    const result = JSON.parse(stdout);
    return result?.ProtectionStatus === 1;
  } catch {
    return false;
  }
}

async function getLastUpdateTime(): Promise<string> {
  if (process.platform !== 'win32') return new Date().toISOString();

  try {
    const { stdout } = await execAsync(
      'powershell -Command "(Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1 InstalledOn).InstalledOn.ToString(\'o\')"'
    );
    return stdout.trim() || new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}
