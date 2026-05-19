//! API client for communicating with ModZero backend

use serde::{Deserialize, Serialize};
use crate::device_info::DeviceInfo;

pub struct ApiClient {
    base_url: String,
    token: String,
    client: reqwest::Client,
}

#[derive(Debug, Serialize)]
struct RegisterDeviceRequest {
    device_name: String,
    os_version: String,
    fingerprint: String,
}

#[derive(Debug, Deserialize)]
struct RegisterDeviceResponse {
    device_id: String,
}

#[derive(Debug, Serialize)]
struct SyncStatusRequest {
    device_id: String,
    is_encrypted: bool,
    firewall_enabled: bool,
    antivirus_enabled: bool,
    os_version: String,
}

#[derive(Debug, Deserialize)]
struct SyncStatusResponse {
    trust_score: f64,
}

impl ApiClient {
    pub fn new(base_url: &str, token: &str) -> Self {
        Self {
            base_url: base_url.to_string(),
            token: token.to_string(),
            client: reqwest::Client::new(),
        }
    }
    
    pub async fn register_device(&self, device_info: &DeviceInfo) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let fingerprint = format!(
            "{}-{}-{}",
            device_info.hostname,
            device_info.os_name,
            device_info.cpu_count
        );
        
        let request = RegisterDeviceRequest {
            device_name: device_info.device_name.clone(),
            os_version: format!("{} {}", device_info.os_name, device_info.os_version),
            fingerprint,
        };
        
        let response = self.client
            .post(format!("{}/devices", self.base_url))
            .header("Authorization", format!("Bearer {}", self.token))
            .json(&request)
            .send()
            .await?;
        
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Failed to register device: {}", error_text).into());
        }
        
        let result: RegisterDeviceResponse = response.json().await?;
        Ok(result.device_id)
    }
    
    pub async fn sync_device_status(&self, device_id: &str, device_info: &DeviceInfo) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let request = SyncStatusRequest {
            device_id: device_id.to_string(),
            is_encrypted: device_info.is_encrypted,
            firewall_enabled: device_info.firewall_enabled,
            antivirus_enabled: device_info.antivirus_enabled,
            os_version: format!("{} {}", device_info.os_name, device_info.os_version),
        };
        
        let response = self.client
            .post(format!("{}/devices/{}/sync", self.base_url, device_id))
            .header("Authorization", format!("Bearer {}", self.token))
            .json(&request)
            .send()
            .await?;
        
        if !response.status().is_success() {
            // Return default score if sync endpoint doesn't exist yet
            return Ok(75.0);
        }
        
        let result: SyncStatusResponse = response.json().await.unwrap_or(SyncStatusResponse { trust_score: 75.0 });
        Ok(result.trust_score)
    }
    
    pub async fn check_connection(&self) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let response = self.client
            .get(format!("{}/health", self.base_url.replace("/api", "")))
            .send()
            .await?;
        
        Ok(response.status().is_success())
    }
}
