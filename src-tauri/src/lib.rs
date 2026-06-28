mod autostart;
mod classifier;
mod clipboard;
mod storage;

use clipboard::ClipboardMonitor;
use log::info;
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use storage::{ClipboardEntry, QueryFilter, Storage, Memo, MemoFilter};
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

fn tray_menu_labels(language: &str) -> (&'static str, &'static str) {
    match language {
        "zh-CN" => ("设置", "退出"),
        _ => ("Settings", "Quit"),
    }
}

fn update_tray_menu(app: &tauri::AppHandle, language: &str) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let (settings_label, quit_label) = tray_menu_labels(language);
        let settings_item = MenuItemBuilder::with_id("settings", settings_label).build(app)?;
        let quit_item = MenuItemBuilder::with_id("quit", quit_label).build(app)?;
        let menu = MenuBuilder::new(app)
            .item(&settings_item)
            .separator()
            .item(&quit_item)
            .build()?;
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}

// ─── Shortcut Helpers ────────────────────────────────────────────────

/// Register a global shortcut that toggles the main window visibility.
fn register_toggle_shortcut(
    app: &tauri::AppHandle,
    shortcut: &str,
) -> Result<(), tauri_plugin_global_shortcut::Error> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = app.emit("window-shown", "shortcut");
                    }
                }
            }
        })
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
fn delete_entry(state: tauri::State<'_, AppState>, id: i64, archive: Option<bool>) -> Result<bool, String> {
    if archive.unwrap_or(false) {
        state.storage.archive_entry(id).map_err(|e| e.to_string())
    } else {
        state.storage.delete(id).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn toggle_pin(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    state.storage.toggle_pin(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_entry(state: tauri::State<'_, AppState>, id: i64, content: String) -> Result<bool, String> {
    state.storage.update_entry(id, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_stats(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let total = state.storage.count(None).map_err(|e| e.to_string())?;
    let text = state.storage.count(Some("text")).map_err(|e| e.to_string())?;
    let link = state.storage.count(Some("link")).map_err(|e| e.to_string())?;
    let image = state.storage.count(Some("image")).map_err(|e| e.to_string())?;
    let code = state.storage.count(Some("code")).map_err(|e| e.to_string())?;
    let email = state.storage.count(Some("email")).map_err(|e| e.to_string())?;
    let file_path = state.storage.count(Some("file_path")).map_err(|e| e.to_string())?;
    let db_size = state.storage.db_size().map_err(|e| e.to_string())?;
    let archive = state.storage.archive_count().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "total": total,
        "text": text,
        "link": link,
        "image": image,
        "code": code,
        "email": email,
        "file_path": file_path,
        "dbSize": db_size,
        "archive": archive,
    }))
}

#[tauri::command]
fn clear_unpinned(state: tauri::State<'_, AppState>, archive: Option<bool>) -> Result<u64, String> {
    state.storage.clear_unpinned(archive.unwrap_or(false)).map_err(|e| e.to_string())
}

// ─── Archive Commands ──────────────────────────────────────────

#[tauri::command]
fn archive_entry(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    state.storage.archive_entry(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn unarchive_entry(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    state.storage.unarchive_entry(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_archived_entries(
    state: tauri::State<'_, AppState>,
    filter: Option<QueryFilter>,
) -> Result<Vec<ClipboardEntry>, String> {
    state
        .storage
        .query_archived(&filter.unwrap_or_default())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn archive_count(state: tauri::State<'_, AppState>) -> Result<i64, String> {
    state.storage.archive_count().map_err(|e| e.to_string())
}

#[tauri::command]
fn permanent_delete(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    state.storage.permanent_delete(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn purge_old_archives(state: tauri::State<'_, AppState>, days: i64) -> Result<u64, String> {
    state.storage.purge_old_archives(days).map_err(|e| e.to_string())
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
fn set_setting(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    state.storage.set_setting(&key, &value).map_err(|e| e.to_string())?;
    if key == "language" {
        update_tray_menu(&app, &value).map_err(|e| e.to_string())?;
    }
    Ok(())
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
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let old_shortcut = state.current_shortcut.lock().unwrap().clone();

    // Validate the new shortcut by trying to register it first
    if new_shortcut != old_shortcut {
        // Unregister old shortcut
        let _ = app.global_shortcut().unregister(old_shortcut.as_str());

        // Register new shortcut
        register_toggle_shortcut(&app, new_shortcut.as_str())
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

/// Set window always-on-top at runtime
#[tauri::command]
fn set_always_on_top(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(enabled).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── Window Position & Paste Commands ─────────────────────────

#[derive(Serialize)]
pub struct CursorPosition {
    pub x: i32,
    pub y: i32,
}

#[tauri::command]
fn get_cursor_position() -> Result<CursorPosition, String> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let mut point = windows::Win32::Foundation::POINT { x: 0, y: 0 };
        unsafe {
            GetCursorPos(&mut point).map_err(|e| format!("GetCursorPos failed: {}", e))?;
        }
        Ok(CursorPosition { x: point.x, y: point.y })
    }
    #[cfg(not(windows))]
    {
        Err("Cursor position not supported on this platform".to_string())
    }
}

#[tauri::command]
fn paste_to_active_window(app: tauri::AppHandle, state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    // Copy content to clipboard first
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
    } else {
        return Ok(false);
    }

    // Hide the window
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    // Wait for focus to return to previous window, then simulate Ctrl+V
    std::thread::sleep(std::time::Duration::from_millis(150));

    #[cfg(windows)]
    {
        use enigo::{Enigo, Keyboard, Settings};
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Enigo init failed: {:?}", e))?;
        enigo.key(enigo::Key::Control, enigo::Direction::Press).map_err(|e| format!("Key press failed: {:?}", e))?;
        enigo.key(enigo::Key::Unicode('v'), enigo::Direction::Click).map_err(|e| format!("Key click failed: {:?}", e))?;
        enigo.key(enigo::Key::Control, enigo::Direction::Release).map_err(|e| format!("Key release failed: {:?}", e))?;
    }

    Ok(true)
}

// ─── Memo Commands ──────────────────────────────────────────────

#[tauri::command]
fn get_memos(
    state: tauri::State<'_, AppState>,
    filter: Option<MemoFilter>,
) -> Result<Vec<Memo>, String> {
    state
        .storage
        .get_memos(&filter.unwrap_or_default())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_memo(
    state: tauri::State<'_, AppState>,
    title: String,
    body: String,
    tags: String,
) -> Result<Memo, String> {
    state
        .storage
        .create_memo(&title, &body, &tags)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_memo(
    state: tauri::State<'_, AppState>,
    id: i64,
    title: String,
    body: String,
    tags: String,
) -> Result<bool, String> {
    state
        .storage
        .update_memo(id, &title, &body, &tags)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_memo(state: tauri::State<'_, AppState>, id: i64, archive: Option<bool>) -> Result<bool, String> {
    state.storage.delete_memo(id, archive.unwrap_or(false)).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_memo_pin(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    state.storage.toggle_memo_pin(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn memo_count(state: tauri::State<'_, AppState>) -> Result<i64, String> {
    state.storage.memo_count().map_err(|e| e.to_string())
}

#[derive(Deserialize)]
struct ReorderItem {
    id: i64,
    sort_order: i64,
}

#[tauri::command]
fn reorder_memos(
    state: tauri::State<'_, AppState>,
    orders: Vec<ReorderItem>,
) -> Result<(), String> {
    let pairs: Vec<(i64, i64)> = orders.iter().map(|r| (r.id, r.sort_order)).collect();
    state.storage.reorder_memos(&pairs).map_err(|e| e.to_string())
}

// ─── Memo Archive Commands ──────────────────────────────────────

#[tauri::command]
fn archive_memo(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    state.storage.archive_memo(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn unarchive_memo(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    state.storage.unarchive_memo(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_archived_memos(
    state: tauri::State<'_, AppState>,
    filter: Option<MemoFilter>,
) -> Result<Vec<Memo>, String> {
    state
        .storage
        .query_archived_memos(&filter.unwrap_or_default())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn memo_archive_count(state: tauri::State<'_, AppState>) -> Result<i64, String> {
    state.storage.memo_archive_count().map_err(|e| e.to_string())
}

#[tauri::command]
fn permanent_delete_memo(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    state.storage.permanent_delete_memo(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn purge_old_memo_archives(state: tauri::State<'_, AppState>, days: i64) -> Result<u64, String> {
    state.storage.purge_old_memo_archives(days).map_err(|e| e.to_string())
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
            let default_shortcut = "Shift+V".to_string();
            let saved_shortcut = storage.get_setting("shortcut").ok().flatten();
            let shortcut = saved_shortcut.unwrap_or(default_shortcut.clone());
            info!("Global shortcut: {}", shortcut);

            // Read always-on-top setting before moving storage
            let always_on_top = storage.get_setting("always_on_top").ok().flatten()
                .map(|v| v == "true")
                .unwrap_or(true);
            let saved_language = storage
                .get_setting("language")
                .ok()
                .flatten()
                .unwrap_or_else(|| "en".to_string());

            app.manage(AppState {
                storage,
                monitor: std::sync::Mutex::new(monitor),
                current_shortcut: std::sync::Mutex::new(shortcut.clone()),
            });

            // Register global shortcut to show/hide window
            let _ = register_toggle_shortcut(&app.handle(), shortcut.as_str());

            // Apply always-on-top setting (default: true, tauri.conf.json also sets true)
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(always_on_top);
            }

            // Set up system tray menu and click handler
            let handle = app.handle().clone();
            if let Some(tray) = app.tray_by_id("main-tray") {
                update_tray_menu(&handle, &saved_language)?;

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
                                let _ = handle2.emit("window-shown", "tray");
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
            update_entry,
            get_stats,
            clear_unpinned,
            archive_entry,
            unarchive_entry,
            get_archived_entries,
            archive_count,
            permanent_delete,
            purge_old_archives,
            copy_to_clipboard,
            get_setting,
            set_setting,
            get_autostart_enabled,
            set_autostart_enabled,
            get_shortcut,
            set_shortcut,
            get_memos,
            create_memo,
            update_memo,
            delete_memo,
            toggle_memo_pin,
            memo_count,
            reorder_memos,
            archive_memo,
            unarchive_memo,
            get_archived_memos,
            memo_archive_count,
            permanent_delete_memo,
            purge_old_memo_archives,
            set_always_on_top,
            get_cursor_position,
            paste_to_active_window,
            check_update,
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running tauri application");
}
