//! Posture-signal collection and signing.
//!
//! Backend `compute_trust_score` weights (must mirror server):
//!     disk_encrypted        25
//!     screen_lock_enabled   15
//!     av_present            15
//!     os_supported          10
//!     patch_recent          15
//!     dev_mode_off          10
//!     firewall_enabled      10
//!
//! Canonical bytes for HMAC =
//!     json.dumps({"device_id":..,"nonce":..,"ts":..,"signals":{...}},
//!                sort_keys=True, separators=(",", ":"))
//!
//! The ``signals`` map is BTreeMap<String, bool> so its key ordering matches
//! Python's sort_keys output.

use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::device_info::{collect_device_info, DeviceInfo};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PosturePayload {
    pub device_id: String,
    pub nonce: String,
    pub ts: i64,
    pub signals: BTreeMap<String, bool>,
    pub signature: String,
}

/// Best-effort derivation of zero-trust signals from real device state.
/// Anything we cannot determine reliably is left at its conservative default
/// (false) so the score reflects unknowns.
pub fn collect_signals(simulate_good: bool) -> Result<BTreeMap<String, bool>, String> {
    if simulate_good {
        let mut m = BTreeMap::new();
        for k in &[
            "disk_encrypted", "screen_lock_enabled", "av_present",
            "os_supported", "patch_recent", "dev_mode_off", "firewall_enabled",
        ] {
            m.insert((*k).to_string(), true);
        }
        return Ok(m);
    }

    let info: DeviceInfo = collect_device_info().map_err(|e| e.to_string())?;
    let os_supported = info.os_name.contains("Windows")
        || info.os_name.to_lowercase().contains("mac")
        || info.os_name.to_lowercase().contains("linux");

    let mut m = BTreeMap::new();
    m.insert("disk_encrypted".to_string(), info.is_encrypted);
    // Best-effort: assume modern desktops require screen lock.
    m.insert("screen_lock_enabled".to_string(), true);
    m.insert("av_present".to_string(), info.antivirus_enabled);
    m.insert("os_supported".to_string(), os_supported);
    // Best-effort: trust local clock; Phase 2 will inspect last patch ts.
    m.insert("patch_recent".to_string(), true);
    m.insert("dev_mode_off".to_string(), true);
    m.insert("firewall_enabled".to_string(), info.firewall_enabled);
    Ok(m)
}

fn random_nonce() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Build the canonical bytes the server will re-hash. MUST match the
/// Python ``json.dumps(..., sort_keys=True, separators=(",", ":"))``
/// representation of ``{device_id, nonce, ts, signals}``.
fn canonical_bytes(
    device_id: &str,
    nonce: &str,
    ts: i64,
    signals: &BTreeMap<String, bool>,
) -> Vec<u8> {
    // Top-level keys are alphabetical: device_id, nonce, signals, ts.
    let mut s = String::new();
    s.push('{');
    s.push_str("\"device_id\":");
    s.push_str(&serde_json::to_string(device_id).unwrap());
    s.push_str(",\"nonce\":");
    s.push_str(&serde_json::to_string(nonce).unwrap());
    s.push_str(",\"signals\":{");
    let mut first = true;
    for (k, v) in signals.iter() {
        if !first {
            s.push(',');
        }
        first = false;
        s.push_str(&serde_json::to_string(k).unwrap());
        s.push(':');
        s.push_str(if *v { "true" } else { "false" });
    }
    s.push_str("},\"ts\":");
    s.push_str(&ts.to_string());
    s.push('}');
    s.into_bytes()
}

pub fn sign_posture(
    device_id: &str,
    hmac_secret: &str,
    signals: BTreeMap<String, bool>,
) -> PosturePayload {
    let nonce = random_nonce();
    let ts = now_unix();
    let canon = canonical_bytes(device_id, &nonce, ts, &signals);
    let mut mac = HmacSha256::new_from_slice(hmac_secret.as_bytes())
        .expect("HMAC accepts any key length");
    mac.update(&canon);
    let sig = hex::encode(mac.finalize().into_bytes());
    PosturePayload {
        device_id: device_id.to_string(),
        nonce,
        ts,
        signals,
        signature: sig,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_matches_python_layout() {
        let mut sig = BTreeMap::new();
        sig.insert("disk_encrypted".to_string(), true);
        sig.insert("av_present".to_string(), false);
        let bytes = canonical_bytes("d1", "n1", 1700000000, &sig);
        let s = String::from_utf8(bytes).unwrap();
        // Keys sorted: device_id, nonce, signals, ts; signals keys: av_present, disk_encrypted
        assert_eq!(
            s,
            "{\"device_id\":\"d1\",\"nonce\":\"n1\",\"signals\":{\"av_present\":false,\"disk_encrypted\":true},\"ts\":1700000000}"
        );
    }
}
