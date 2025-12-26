//! ModZero Client - System Tray Application
//! 
//! This is the main entry point for the ModZero Zero Trust Client.
//! It provides system tray functionality for device monitoring and trust score display.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod device_info;
mod api_client;

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    menu::{Menu, MenuItem},
    Manager, Runtime,
};
use std::sync::Mutex;

// Application state
pub struct AppState {
    pub trust_score: Mutex<f64>,
    pub device_id: Mutex<Option<String>>,
    pub api_url: Mutex<String>,
    pub is_registered: Mutex<bool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            trust_score: Mutex::new(0.0),
            device_id: Mutex::new(None),
            api_url: Mutex::new("http://localhost:8000/api".to_string()),
            is_registered: Mutex::new(false),
        }
    }
}

#[tauri::command]
async fn get_device_info() -> Result<device_info::DeviceInfo, String> {
    device_info::collect_device_info().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_trust_score(state: tauri::State<'_, AppState>) -> Result<f64, String> {
    let score = state.trust_score.lock().map_err(|e| e.to_string())?;
    Ok(*score)
}

#[tauri::command]
async fn set_api_url(url: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut api_url = state.api_url.lock().map_err(|e| e.to_string())?;
    *api_url = url;
    Ok(())
}

#[tauri::command]
async fn register_device(
    token: String,
    state: tauri::State<'_, AppState>
) -> Result<String, String> {
    let device_info = device_info::collect_device_info().map_err(|e| e.to_string())?;
    let api_url = state.api_url.lock().map_err(|e| e.to_string())?.clone();
    
    let client = api_client::ApiClient::new(&api_url, &token);
    let device_id = client.register_device(&device_info).await.map_err(|e| e.to_string())?;
    
    let mut did = state.device_id.lock().map_err(|e| e.to_string())?;
    *did = Some(device_id.clone());
    
    let mut registered = state.is_registered.lock().map_err(|e| e.to_string())?;
    *registered = true;
    
    Ok(device_id)
}

#[tauri::command]
async fn sync_device_status(
    token: String,
    state: tauri::State<'_, AppState>
) -> Result<f64, String> {
    let device_id = state.device_id.lock().map_err(|e| e.to_string())?.clone();
    let api_url = state.api_url.lock().map_err(|e| e.to_string())?.clone();
    
    let device_id = device_id.ok_or("Device not registered")?;
    let device_info = device_info::collect_device_info().map_err(|e| e.to_string())?;
    
    let client = api_client::ApiClient::new(&api_url, &token);
    let score = client.sync_device_status(&device_id, &device_info).await.map_err(|e| e.to_string())?;
    
    let mut trust_score = state.trust_score.lock().map_err(|e| e.to_string())?;
    *trust_score = score;
    
    Ok(score)
}

#[derive(serde::Serialize)]
struct SecurityCheck {
    name: String,
    passed: bool,
    weight: i32,
}

#[derive(serde::Serialize)]
struct TrustScoreResult {
    score: i32,
    checks: Vec<SecurityCheck>,
}

#[tauri::command]
async fn calculate_trust_score() -> Result<TrustScoreResult, String> {
    let device_info = device_info::collect_device_info().map_err(|e| e.to_string())?;
    
    let mut checks = Vec::new();
    let mut total_score = 0;
    
    // Disk encryption check (30 points)
    checks.push(SecurityCheck {
        name: "Disk Encryption".to_string(),
        passed: device_info.is_encrypted,
        weight: 30,
    });
    if device_info.is_encrypted {
        total_score += 30;
    }
    
    // Firewall check (25 points)
    checks.push(SecurityCheck {
        name: "Firewall Enabled".to_string(),
        passed: device_info.firewall_enabled,
        weight: 25,
    });
    if device_info.firewall_enabled {
        total_score += 25;
    }
    
    // Antivirus check (25 points)
    checks.push(SecurityCheck {
        name: "Antivirus Active".to_string(),
        passed: device_info.antivirus_enabled,
        weight: 25,
    });
    if device_info.antivirus_enabled {
        total_score += 25;
    }
    
    // OS is Windows 10 or later (20 points)
    let os_check = device_info.os_name.contains("Windows");
    checks.push(SecurityCheck {
        name: "Supported OS".to_string(),
        passed: os_check,
        weight: 20,
    });
    if os_check {
        total_score += 20;
    }
    
    Ok(TrustScoreResult {
        score: total_score,
        checks,
    })
}

#[tauri::command]
async fn sync_with_server(state: tauri::State<'_, AppState>) -> Result<(), String> {
    // For now, just validate the device info can be collected
    let _ = device_info::collect_device_info().map_err(|e| e.to_string())?;
    
    // Update the local trust score
    let device_info = device_info::collect_device_info().map_err(|e| e.to_string())?;
    let mut score = 0.0;
    
    if device_info.is_encrypted { score += 30.0; }
    if device_info.firewall_enabled { score += 25.0; }
    if device_info.antivirus_enabled { score += 25.0; }
    if device_info.os_name.contains("Windows") { score += 20.0; }
    
    let mut trust_score = state.trust_score.lock().map_err(|e| e.to_string())?;
    *trust_score = score;
    
    Ok(())
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_updater::UpdaterExt;
    
    match app.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    // Update available
                    println!("Update available: {}", update.version);
                    Ok(true)
                }
                Ok(None) => Ok(false),
                Err(e) => Err(e.to_string()),
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

fn create_tray_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<Menu<R>, tauri::Error> {
    let show = MenuItem::with_id(app, "show", "Show Dashboard", true, None::<&str>)?;
    let check_compliance = MenuItem::with_id(app, "check_compliance", "Check Compliance", true, None::<&str>)?;
    let sync = MenuItem::with_id(app, "sync", "Sync Status", true, None::<&str>)?;
    let separator = MenuItem::with_id(app, "sep1", "─────────────", false, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let check_updates = MenuItem::with_id(app, "check_updates", "Check for Updates", true, None::<&str>)?;
    let separator2 = MenuItem::with_id(app, "sep2", "─────────────", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    
    Menu::with_items(app, &[
        &show,
        &check_compliance,
        &sync,
        &separator,
        &settings,
        &check_updates,
        &separator2,
        &quit,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::default())
        .setup(|app| {
            // Create tray icon
            let menu = create_tray_menu(app.handle())?;
            
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("ModZero Client - Trust Score: N/A")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            // Open web dashboard
                            if let Err(e) = tauri_plugin_shell::ShellExt::shell(app)
                                .open("http://localhost:5173", None) {
                                eprintln!("Failed to open dashboard: {}", e);
                            }
                        }
                        "check_compliance" => {
                            // Show main window for compliance check
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "sync" => {
                            // Trigger sync via event
                            let _ = app.emit("sync-status", ());
                        }
                        "settings" => {
                            // Show settings in main window
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("navigate", "settings");
                            }
                        }
                        "check_updates" => {
                            let _ = app.emit("check-updates", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_device_info,
            get_trust_score,
            set_api_url,
            register_device,
            sync_device_status,
            check_for_updates,
            calculate_trust_score,
            sync_with_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
