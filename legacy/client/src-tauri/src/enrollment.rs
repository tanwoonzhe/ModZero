//! ModZero device-enrollment for the zero-trust resource-access flow.
//!
//! Phase 1 storage: a JSON file under the app's local-data dir, mode-0600 on
//! POSIX. The plaintext HMAC secret is stored at rest — this is the FYP
//! limitation documented in the report. Phase 2: OS keyring / Tauri stronghold.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrolledDevice {
    pub device_id: String,
    pub hmac_secret: String,
    pub server_url: String,
}

#[derive(Debug, Serialize)]
struct EnrollRequest<'a> {
    device_name: Option<&'a str>,
    os: Option<&'a str>,
    os_version: Option<&'a str>,
}

#[derive(Debug, Deserialize)]
struct EnrollResponse {
    device_id: String,
    hmac_secret: String,
}

fn enrollment_path(base: &PathBuf) -> PathBuf {
    base.join("modzero-enrollment.json")
}

pub fn load(base: &PathBuf) -> Option<EnrolledDevice> {
    let p = enrollment_path(base);
    let bytes = fs::read(&p).ok()?;
    serde_json::from_slice::<EnrolledDevice>(&bytes).ok()
}

pub fn save(base: &PathBuf, dev: &EnrolledDevice) -> std::io::Result<()> {
    fs::create_dir_all(base)?;
    let p = enrollment_path(base);
    let bytes = serde_json::to_vec_pretty(dev).map_err(std::io::Error::other)?;
    fs::write(&p, bytes)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&p, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Enroll the calling client and persist `{device_id, hmac_secret}`.
pub async fn enroll(
    base: &PathBuf,
    server_url: &str,
    jwt: &str,
    device_name: Option<&str>,
    os: Option<&str>,
    os_version: Option<&str>,
) -> Result<EnrolledDevice, String> {
    let url = format!(
        "{}/api/device-enrollments/enroll",
        server_url.trim_end_matches('/')
    );
    let body = EnrollRequest { device_name, os, os_version };

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .bearer_auth(jwt)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("enroll request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("enroll failed: HTTP {status} {txt}"));
    }
    let parsed: EnrollResponse = resp
        .json()
        .await
        .map_err(|e| format!("enroll: bad json: {e}"))?;
    let dev = EnrolledDevice {
        device_id: parsed.device_id,
        hmac_secret: parsed.hmac_secret,
        server_url: server_url.trim_end_matches('/').to_string(),
    };
    save(base, &dev).map_err(|e| format!("save enrollment: {e}"))?;
    Ok(dev)
}
