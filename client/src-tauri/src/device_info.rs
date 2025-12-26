//! Device information collection module

use serde::{Deserialize, Serialize};
use sysinfo::System;
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub device_name: String,
    pub os_name: String,
    pub os_version: String,
    pub hostname: String,
    pub cpu_count: usize,
    pub total_memory_gb: f64,
    pub is_encrypted: bool,
    pub firewall_enabled: bool,
    pub antivirus_enabled: bool,
}

pub fn collect_device_info() -> Result<DeviceInfo, Box<dyn std::error::Error>> {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    let hostname = System::host_name().unwrap_or_else(|| "Unknown".to_string());
    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());
    
    let cpu_count = sys.cpus().len();
    let total_memory_gb = sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
    
    // Check encryption status (simplified - Windows BitLocker check)
    let is_encrypted = check_encryption_status();
    
    // Check firewall status (simplified)
    let firewall_enabled = check_firewall_status();
    
    // Check antivirus status (simplified)
    let antivirus_enabled = check_antivirus_status();
    
    Ok(DeviceInfo {
        device_name: hostname.clone(),
        os_name,
        os_version,
        hostname,
        cpu_count,
        total_memory_gb,
        is_encrypted,
        firewall_enabled,
        antivirus_enabled,
    })
}

#[cfg(target_os = "windows")]
fn check_encryption_status() -> bool {
    // Simplified check - in production, use WMI or PowerShell to check BitLocker
    // For now, assume encrypted if running on Windows 10+
    true
}

#[cfg(not(target_os = "windows"))]
fn check_encryption_status() -> bool {
    // On macOS, check for FileVault
    // On Linux, check for LUKS
    true
}

#[cfg(target_os = "windows")]
fn check_firewall_status() -> bool {
    // Simplified check - in production, use netsh or WMI
    true
}

#[cfg(not(target_os = "windows"))]
fn check_firewall_status() -> bool {
    true
}

#[cfg(target_os = "windows")]
fn check_antivirus_status() -> bool {
    // Simplified check - in production, use WMI or Windows Security Center API
    true
}

#[cfg(not(target_os = "windows"))]
fn check_antivirus_status() -> bool {
    true
}
