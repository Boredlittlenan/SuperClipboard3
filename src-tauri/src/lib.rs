mod autostart;
mod classifier;
mod clipboard;
mod storage;

use clipboard::ClipboardMonitor;
use log::info;
use serde::Serialize;
use std::sync::Arc;
use storage::{ClipboardEntry, QueryFilter, Storage};
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::Emitter;

/// Current application version
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// GitHub repository owner/name for update checks
const GITHUB_REPO: &str = "Boredlittlenan/SuperClipboard3";

#[derive(Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub download_url: String,
    pub has_update: bool,
}

/// Tauri-managed application state
pub struct AppState {
    storage: Arc<Storage>,
    monitor: std::sync::Mutex<ClipboardMonitor>,
    current_shortcut: std::sync::Mutex<String>,
}

// ─── Tauri Commands ──────────────────────────────────────────────────

#[tauri::command]
fn get_entries(
    state: tauri::State<'_, AppState>,
    filter: Option<QueryFilter>,
) -> Result<Vec<ClipboardEntry>, String> {
    state
        .storage
        .query(&filter.unwrap_or_default())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_entry(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    state.storage.delete(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_pin(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    state.storage.toggle_pin(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_stats(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let total = state.storage.count(None).map_err(|e| e.to_string())?;
    let text = state.storage.count(Some("text")).map_err(|e| e.to_string())?;
    let link = state.storage.count(Some("link")).map_err(|e| e.to_string())?;
    let image = state.storage.count(Some("image")).map_err(|e| e.to_string())?;
    let code = state.storage.count(Some("code")).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "total": total,
        "text": text,
        "link": link,
        "image": image,
        "code": code,
    }))
}

#[tauri::command]
fn clear_unpinned(state: tauri::State<'_, AppState>) -> Result<u64, String> {
    state.storage.clear_unpinned().map_err(|e| e.to_string())
}

/// Copy a stored entry back to the system clipboard
#[tauri::command]
fn copy_to_clipboard(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    let entry = state
        .storage
        .get_entry_by_id(id)
        .map_err(|e| e.to_string())?;

    if let Some(entry) = entry {
        let mut clip = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        match entry.category {
            classifier::Category::Image => {
                use base64::Engine;
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(&entry.content)
                    .map_err(|e| e.to_string())?;
                let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
                let rgba = img.to_rgba8();
                let (w, h) = rgba.dimensions();
                let img_data = arboard::ImageData {
                    width: w as usize,
                    height: h as usize,
                    bytes: rgba.into_raw().into(),
                };
                clip.set_image(img_data).map_err(|e| e.to_string())?;
            }
            _ => {
                clip.set_text(&entry.content).map_err(|e| e.to_string())?;
            }
        }
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Get a user setting value by key
#[tauri::command]
fn get_setting(state: tauri::State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    state.storage.get_setting(&key).map_err(|e| e.to_string())
}

/// Set a user setting value
#[tauri::command]
fn set_setting(state: tauri::State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    state.storage.set_setting(&key, &value).map_err(|e| e.to_string())
}

/// Check if auto-start on boot is enabled
#[tauri::command]
fn get_autostart_enabled() -> bool {
    autostart::is_enabled()
}

/// Enable or disable auto-start on boot
#[tauri::command]
fn set_autostart_enabled(enabled: bool) -> Result<bool, String> {
    if enabled {
        autostart::enable()?;
    } else {
        autostart::disable()?;
    }
    Ok(enabled)
}

/// Get the current global shortcut string
#[tauri::command]
fn get_shortcut(state: tauri::State<'_, AppState>) -> String {
    state.current_shortcut.lock().unwrap().clone()
}

/// Update the global shortcut at runtime
#[tauri::command]
fn set_shortcut(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    new_shortcut: String,
) -> Result<String, String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let old_shortcut = state.current_shortcut.lock().unwrap().clone();

    // Validate the new shortcut by trying to register it first
    if new_shortcut != old_shortcut {
        // Unregister old shortcut
        let _ = app.global_shortcut().unregister(old_shortcut.as_str());

        // Register new shortcut
        app.global_shortcut()
            .on_shortcut(new_shortcut.as_str(), |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            })
            .map_err(|e| format!("Failed to register shortcut: {}", e))?;

        // Update state
        *state.current_shortcut.lock().unwrap() = new_shortcut.clone();

        // Persist to SQLite
        state
            .storage
            .set_setting("shortcut", &new_shortcut)
            .map_err(|e| e.to_string())?;
    }

    Ok(new_shortcut)
}

/// Open a URL in the system default browser
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("Failed to open URL: {}", e))
}

/// Check for updates from GitHub Releases
#[tauri::command]
async fn check_update() -> Result<UpdateInfo, String> {
    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        GITHUB_REPO
    );

    let client = reqwest::Client::builder()
        .user_agent("SuperClipboard3")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let resp: serde_json::Value = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let tag = resp
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("v0.0.0");

    // Strip leading 'v' or 'V' if present
    let latest = tag.strip_prefix('v').or_else(|| tag.strip_prefix('V')).unwrap_or(tag);
    let current = APP_VERSION;

    let has_update = compare_versions(latest, current);

    let download_url = resp
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or(&format!(
            "https://github.com/{}/releases/latest",
            GITHUB_REPO
        ))
        .to_string();

    Ok(UpdateInfo {
        current_version: current.to_string(),
        latest_version: latest.to_string(),
        download_url,
        has_update,
    })
}

/// Compare two semver strings: returns true if `latest` > `current`
fn compare_versions(latest: &str, current: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> {
        s.split('.')
            .filter_map(|p| p.parse::<u64>().ok())
            .collect()
    };
    let a = parse(latest);
    let b = parse(current);
    for i in 0..3 {
        let va = a.get(i).copied().unwrap_or(0);
        let vb = b.get(i).copied().unwrap_or(0);
        if va > vb {
            return true;
        }
        if va < vb {
            return false;
        }
    }
    false
}

// ─── App Setup ───────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Initialize storage in app data directory
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");

            let db_path = app_dir.join("clipboard.db");
            info!("Database path: {:?}", db_path);

            let storage = Arc::new(Storage::new(&db_path).expect("Failed to initialize storage"));

            // Start clipboard monitor
            let mut monitor = ClipboardMonitor::new();
            monitor.start(app.handle().clone(), storage.clone());

            // Read saved shortcut or use default
            let default_shortcut = "Ctrl+Shift+V".to_string();
            let saved_shortcut = storage.get_setting("shortcut").ok().flatten();
            let shortcut = saved_shortcut.unwrap_or(default_shortcut.clone());
            info!("Global shortcut: {}", shortcut);

            app.manage(AppState {
                storage,
                monitor: std::sync::Mutex::new(monitor),
                current_shortcut: std::sync::Mutex::new(shortcut.clone()),
            });

            // Register global shortcut to show/hide window
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
            let _ = app.global_shortcut().on_shortcut(shortcut.as_str(), |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            });

            // Set up system tray menu and click handler
            let handle = app.handle().clone();
            if let Some(tray) = app.tray_by_id("main-tray") {
                // Build tray context menu
                let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
                let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
                let menu = MenuBuilder::new(app)
                    .item(&settings_item)
                    .separator()
                    .item(&quit_item)
                    .build()?;
                tray.set_menu(Some(menu))?;

                // Handle menu item clicks
                tray.on_menu_event(move |app_handle, event| {
                    match event.id().as_ref() {
                        "settings" => {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                // Emit event to frontend to open settings panel
                                let _ = app_handle.emit("open-settings", ());
                            }
                        }
                        "quit" => {
                            app_handle.exit(0);
                        }
                        _ => {}
                    }
                });

                // Left-click: show/hide window
                let handle2 = handle.clone();
                tray.on_tray_icon_event(move |_tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = handle2.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_entries,
            delete_entry,
            toggle_pin,
            get_stats,
            clear_unpinned,
            copy_to_clipboard,
            get_setting,
            set_setting,
            get_autostart_enabled,
            set_autostart_enabled,
            get_shortcut,
            set_shortcut,
            check_update,
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running tauri application");
}
