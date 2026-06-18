use crate::classifier::Category;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::sync::Mutex;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum StorageError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// A single clipboard entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardEntry {
    pub id: i64,
    pub category: Category,
    pub content_type: String, // "text", "image/png", etc.
    pub content: String,      // Text content or base64-encoded image data
    pub preview: String,      // Short preview text for UI display
    pub hash: String,         // SHA-256 hash for deduplication
    pub pinned: bool,
    pub created_at: DateTime<Utc>,
}

/// Query filter for listing entries
#[derive(Debug, Default, Deserialize)]
pub struct QueryFilter {
    pub category: Option<String>,
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub struct Storage {
    conn: Mutex<Connection>,
}

impl Storage {
    /// Open or create the database at the given path
    pub fn new(db_path: &Path) -> Result<Self, StorageError> {
        let conn = Connection::open(db_path)?;
        let storage = Self {
            conn: Mutex::new(conn),
        };
        storage.init_tables()?;
        Ok(storage)
    }

    fn init_tables(&self) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS clipboard_entries (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                category    TEXT    NOT NULL,
                content_type TEXT   NOT NULL,
                content     TEXT    NOT NULL,
                preview     TEXT    NOT NULL DEFAULT '',
                hash        TEXT    NOT NULL UNIQUE,
                pinned      INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_category ON clipboard_entries(category);
            CREATE INDEX IF NOT EXISTS idx_created_at ON clipboard_entries(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_hash ON clipboard_entries(hash);

            CREATE TABLE IF NOT EXISTS settings (
                key     TEXT PRIMARY KEY,
                value   TEXT NOT NULL
            );
            ",
        )
    }

    /// Compute SHA-256 hash of content for deduplication
    pub fn hash_content(content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        hex::encode(hasher.finalize())
    }

    /// Insert a new clipboard entry, returns Ok(true) if inserted, Ok(false) if duplicate
    pub fn insert(&self, entry: &ClipboardEntry) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        let result = conn.execute(
            "INSERT OR IGNORE INTO clipboard_entries 
             (category, content_type, content, preview, hash, pinned, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                entry.category.to_string(),
                entry.content_type,
                entry.content,
                entry.preview,
                entry.hash,
                entry.pinned as i32,
                entry.created_at.to_rfc3339(),
            ],
        )?;
        Ok(result > 0)
    }

    /// Query entries with optional filters
    pub fn query(&self, filter: &QueryFilter) -> Result<Vec<ClipboardEntry>, StorageError> {
        let conn = self.conn.lock().unwrap();

        let mut sql = String::from("SELECT id, category, content_type, content, preview, hash, pinned, created_at FROM clipboard_entries WHERE 1=1");
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref cat) = filter.category {
            sql.push_str(" AND category = ?");
            param_values.push(Box::new(cat.clone()));
        }

        if let Some(ref search) = filter.search {
            sql.push_str(" AND (content LIKE ? OR preview LIKE ?)");
            let pattern = format!("%{}%", search);
            param_values.push(Box::new(pattern.clone()));
            param_values.push(Box::new(pattern));
        }

        sql.push_str(" ORDER BY pinned DESC, created_at DESC");

        let limit = filter.limit.unwrap_or(50);
        sql.push_str(&format!(" LIMIT {}", limit));

        if let Some(offset) = filter.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let entries = stmt
            .query_map(params_refs.as_slice(), |row| {
                let category_str: String = row.get(1)?;
                let category = match category_str.as_str() {
                    "link" => Category::Link,
                    "image" => Category::Image,
                    "code" => Category::Code,
                    "email" => Category::Email,
                    "file_path" => Category::FilePath,
                    _ => Category::Text,
                };

                let pinned_int: i32 = row.get(6)?;
                let created_str: String = row.get(7)?;

                Ok(ClipboardEntry {
                    id: row.get(0)?,
                    category,
                    content_type: row.get(2)?,
                    content: row.get(3)?,
                    preview: row.get(4)?,
                    hash: row.get(5)?,
                    pinned: pinned_int != 0,
                    created_at: DateTime::parse_from_rfc3339(&created_str)
                        .unwrap_or_else(|_| Utc::now().into())
                        .with_timezone(&Utc),
                })
            })?
            .collect::<SqlResult<Vec<_>>>()?;

        Ok(entries)
    }

    /// Get a single entry by ID
    pub fn get_entry_by_id(&self, id: i64) -> Result<Option<ClipboardEntry>, StorageError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, category, content_type, content, preview, hash, pinned, created_at 
             FROM clipboard_entries WHERE id = ?1",
        )?;

        let entry = stmt
            .query_row(params![id], |row| {
                let category_str: String = row.get(1)?;
                let category = match category_str.as_str() {
                    "link" => Category::Link,
                    "image" => Category::Image,
                    "code" => Category::Code,
                    "email" => Category::Email,
                    "file_path" => Category::FilePath,
                    _ => Category::Text,
                };

                let pinned_int: i32 = row.get(6)?;
                let created_str: String = row.get(7)?;

                Ok(ClipboardEntry {
                    id: row.get(0)?,
                    category,
                    content_type: row.get(2)?,
                    content: row.get(3)?,
                    preview: row.get(4)?,
                    hash: row.get(5)?,
                    pinned: pinned_int != 0,
                    created_at: DateTime::parse_from_rfc3339(&created_str)
                        .unwrap_or_else(|_| Utc::now().into())
                        .with_timezone(&Utc),
                })
            })
            .ok();

        Ok(entry)
    }

    /// Delete an entry by ID
    pub fn delete(&self, id: i64) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM clipboard_entries WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    /// Toggle pinned status
    pub fn toggle_pin(&self, id: i64) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE clipboard_entries SET pinned = NOT pinned WHERE id = ?1",
            params![id],
        )?;
        // Return the new pinned state
        let pinned: bool = conn
            .query_row(
                "SELECT pinned FROM clipboard_entries WHERE id = ?1",
                params![id],
                |row| row.get::<_, i32>(0).map(|v| v != 0),
            )
            .unwrap_or(false);
        Ok(pinned)
    }

    /// Get total count of entries, optionally filtered by category
    pub fn count(&self, category: Option<&str>) -> Result<i64, StorageError> {
        let conn = self.conn.lock().unwrap();
        let count = if let Some(cat) = category {
            conn.query_row(
                "SELECT COUNT(*) FROM clipboard_entries WHERE category = ?1",
                params![cat],
                |row| row.get(0),
            )?
        } else {
            conn.query_row("SELECT COUNT(*) FROM clipboard_entries", [], |row| {
                row.get(0)
            })?
        };
        Ok(count)
    }

    /// Clear all non-pinned entries
    pub fn clear_unpinned(&self) -> Result<u64, StorageError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM clipboard_entries WHERE pinned = 0", [])?;
        Ok(rows as u64)
    }

    /// Get a setting value by key; returns None if not set
    pub fn get_setting(&self, key: &str) -> Result<Option<String>, StorageError> {
        let conn = self.conn.lock().unwrap();
        let value = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get::<_, String>(0),
            )
            .ok();
        Ok(value)
    }

    /// Insert or update a setting value
    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), StorageError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}
