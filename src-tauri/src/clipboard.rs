use crate::classifier::{classify_image, classify_text, Category};
use crate::storage::{ClipboardEntry, Storage};
use arboard::Clipboard;
use base64::Engine;
use chrono::Utc;
use log::{debug, error, info, warn};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;

/// State shared across the clipboard monitoring thread
pub struct ClipboardMonitor {
    running: Arc<Mutex<bool>>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl ClipboardMonitor {
    pub fn new() -> Self {
        Self {
            running: Arc::new(Mutex::new(false)),
            handle: None,
        }
    }

    /// Start the clipboard monitoring loop in a background thread
    pub fn start(&mut self, app_handle: tauri::AppHandle, storage: Arc<Storage>) {
        let running = self.running.clone();
        *running.lock().unwrap() = true;

        let handle = std::thread::Builder::new()
            .name("clipboard-monitor".into())
            .spawn(move || {
                info!("Clipboard monitor started");

                let mut clipboard = match Clipboard::new() {
                    Ok(c) => c,
                    Err(e) => {
                        error!("Failed to initialize clipboard: {}", e);
                        return;
                    }
                };

                // Track last seen content to avoid re-processing
                let mut last_text_hash = String::new();

                // Poll interval: 300ms — responsive enough for UX, low CPU usage
                let poll_interval = Duration::from_millis(300);

                while *running.lock().unwrap() {
                    std::thread::sleep(poll_interval);

                    // Try to read image first
                    if let Ok(img) = clipboard.get_image() {
                        if img.width > 0 && img.height > 0 {
                            let hash = Storage::hash_content(&format!(
                                "img_{}x{}_{}",
                                img.width,
                                img.height,
                                img.bytes.len()
                            ));

                            if hash != last_text_hash {
                                last_text_hash = hash.clone();

                                // Encode image as PNG base64
                                let img_data = encode_image_to_base64(&img);
                                if let Some(data) = img_data {
                                    let preview =
                                        format!("[Image {}x{}]", img.width, img.height);

                                    let entry = ClipboardEntry {
                                        id: 0,
                                        category: classify_image(),
                                        content_type: "image/png".to_string(),
                                        content: data,
                                        preview,
                                        hash: Storage::hash_content(
                                            &format!("img_bytes_{}", hash),
                                        ),
                                        pinned: false,
                                        created_at: Utc::now(),
                                        original_content: None,
                                        updated_at: None,
                                        archived_at: None,
                                    };

                                    match storage.insert(&entry) {
                                        Ok(true) => {
                                            debug!("Captured image: {}x{}", img.width, img.height);
                                            let _ = app_handle
                                                .emit("clipboard-changed", &entry);
                                        }
                                        Ok(false) => {} // duplicate
                                        Err(e) => {
                                            warn!("Failed to store image: {}", e);
                                        }
                                    }
                                }
                                continue;
                            }
                        }
                    }

                    // Try to read text
                    if let Ok(text) = clipboard.get_text() {
                        if text.is_empty() {
                            continue;
                        }

                        let hash = Storage::hash_content(&text);
                        if hash == last_text_hash {
                            continue;
                        }
                        last_text_hash = hash.clone();

                        let category = classify_text(&text);
                        let preview = generate_preview(&text, &category);

                        let entry = ClipboardEntry {
                            id: 0,
                            category: category.clone(),
                            content_type: "text/plain".to_string(),
                            content: text,
                            preview,
                            hash,
                            pinned: false,
                            created_at: Utc::now(),
                            original_content: None,
                            updated_at: None,
                            archived_at: None,
                        };

                        match storage.insert(&entry) {
                            Ok(true) => {
                                debug!("Captured {}: {:?}", category, entry.preview);
                                let _ = app_handle.emit("clipboard-changed", &entry);
                            }
                            Ok(false) => {} // duplicate
                            Err(e) => {
                                warn!("Failed to store entry: {}", e);
                            }
                        }
                    }
                }

                info!("Clipboard monitor stopped");
            })
            .expect("Failed to spawn clipboard monitor thread");

        self.handle = Some(handle);
    }

    /// Stop the monitoring loop
    pub fn stop(&mut self) {
        *self.running.lock().unwrap() = false;
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for ClipboardMonitor {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Generate a short preview string for UI display
fn generate_preview(text: &str, category: &Category) -> String {
    match category {
        Category::Link => text.to_string(),
        Category::Email => text.to_string(),
        Category::FilePath => text.to_string(),
        Category::Image => "[Image]".to_string(),
        Category::Code => {
            let first_line = text.lines().next().unwrap_or("");
            let char_count = first_line.chars().count();
            if char_count > 80 {
                let truncated: String = first_line.chars().take(80).collect();
                format!("{}...", truncated)
            } else {
                first_line.to_string()
            }
        }
        Category::Text => {
            let clean = text.replace('\n', " ").replace('\r', "");
            let char_count = clean.chars().count();
            if char_count > 120 {
                let truncated: String = clean.chars().take(120).collect();
                format!("{}...", truncated)
            } else {
                clean
            }
        }
    }
}

/// Encode arboard image data to base64 PNG
fn encode_image_to_base64(img: &arboard::ImageData) -> Option<String> {
    use image::{ImageBuffer, Rgba};

    let img_buffer: ImageBuffer<Rgba<u8>, _> =
        ImageBuffer::from_raw(img.width as u32, img.height as u32, img.bytes.to_vec())?;

    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    if img_buffer
        .write_to(&mut cursor, image::ImageFormat::Png)
        .is_err()
    {
        return None;
    }

    Some(base64::engine::general_purpose::STANDARD.encode(&buf))
}
