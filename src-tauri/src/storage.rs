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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_content: Option<String>, // Content before first edit (null = never edited)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>, // Timestamp of last edit (null = never edited)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>, // Timestamp of archival (null = not archived)
}

/// Query filter for listing entries
#[derive(Debug, Default, Deserialize)]
pub struct QueryFilter {
    pub category: Option<String>,
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// A memo/sticky note entry (separate from clipboard)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memo {
    pub id: i64,
    pub title: String,
    pub body: String,
    pub tags: String,
    pub pinned: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
}

/// Query filter for listing memos
#[derive(Debug, Default, Deserialize)]
pub struct MemoFilter {
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Map a SQLite row to a ClipboardEntry (shared by query and get_entry_by_id)
fn map_row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClipboardEntry> {
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
    let original_content: Option<String> = row.get(8)?;
    let updated_at: Option<String> = row.get(9)?;
    let archived_at: Option<String> = row.get(10)?;

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
        original_content,
        updated_at,
        archived_at,
    })
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
                created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                original_content TEXT,
                updated_at  TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_category ON clipboard_entries(category);
            CREATE INDEX IF NOT EXISTS idx_created_at ON clipboard_entries(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_hash ON clipboard_entries(hash);

            CREATE TABLE IF NOT EXISTS settings (
                key     TEXT PRIMARY KEY,
                value   TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS memos (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                title      TEXT    NOT NULL DEFAULT '',
                body       TEXT    NOT NULL DEFAULT '',
                tags       TEXT    NOT NULL DEFAULT '',
                pinned     INTEGER NOT NULL DEFAULT 0,
                created_at TEXT    NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_memos_updated_at ON memos(updated_at DESC);
            ",
        )?;

        // Migration: add columns to existing databases (ignore error if already present)
        let _ =
            conn.execute_batch("ALTER TABLE clipboard_entries ADD COLUMN original_content TEXT");
        let _ = conn.execute_batch("ALTER TABLE clipboard_entries ADD COLUMN updated_at TEXT");

        // Migration: add sort_order column to memos
        let _ = conn
            .execute_batch("ALTER TABLE memos ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
        // Initialize sort_order based on current ordering (newest = highest)
        let _ = conn.execute_batch(
            "UPDATE memos SET sort_order = (
                SELECT rn FROM (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY pinned DESC, created_at DESC) AS rn FROM memos
                ) ranked WHERE ranked.id = memos.id
            ) WHERE sort_order = 0",
        );

        // Migration: add archived_at column to clipboard_entries
        let _ = conn.execute_batch("ALTER TABLE clipboard_entries ADD COLUMN archived_at TEXT");

        // Migration: add archived_at column to memos
        let _ = conn.execute_batch("ALTER TABLE memos ADD COLUMN archived_at TEXT");

        Ok(())
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

        let mut sql = String::from("SELECT id, category, content_type, content, preview, hash, pinned, created_at, original_content, updated_at, archived_at FROM clipboard_entries WHERE archived_at IS NULL");
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
            .query_map(params_refs.as_slice(), map_row_to_entry)?
            .collect::<SqlResult<Vec<_>>>()?;

        Ok(entries)
    }

    /// Get a single entry by ID
    pub fn get_entry_by_id(&self, id: i64) -> Result<Option<ClipboardEntry>, StorageError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, category, content_type, content, preview, hash, pinned, created_at, original_content, updated_at, archived_at
             FROM clipboard_entries WHERE id = ?1",
        )?;

        let entry = stmt.query_row(params![id], map_row_to_entry).ok();

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

    /// Update a clipboard entry's content. Saves original content on first edit.
    pub fn update_entry(&self, id: i64, new_content: &str) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();

        // Read current entry to check if original_content is already set
        let current: Option<(String, Option<String>)> = conn
            .query_row(
                "SELECT content, original_content FROM clipboard_entries WHERE id = ?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        let (current_content, existing_original) = match current {
            Some(c) => c,
            None => return Ok(false),
        };

        // Only save original_content on first edit
        let original = existing_original.unwrap_or(current_content);
        let preview = if new_content.len() > 200 {
            new_content.chars().take(200).collect::<String>()
        } else {
            new_content.to_string()
        };
        let now = Utc::now().to_rfc3339();

        let rows = conn.execute(
            "UPDATE clipboard_entries SET content = ?1, preview = ?2, original_content = ?3, updated_at = ?4 WHERE id = ?5",
            params![new_content, preview, original, now, id],
        )?;
        Ok(rows > 0)
    }

    /// Get total count of entries, optionally filtered by category
    pub fn count(&self, category: Option<&str>) -> Result<i64, StorageError> {
        let conn = self.conn.lock().unwrap();
        let count = if let Some(cat) = category {
            conn.query_row(
                "SELECT COUNT(*) FROM clipboard_entries WHERE category = ?1 AND archived_at IS NULL",
                params![cat],
                |row| row.get(0),
            )?
        } else {
            conn.query_row(
                "SELECT COUNT(*) FROM clipboard_entries WHERE archived_at IS NULL",
                [],
                |row| row.get(0),
            )?
        };
        Ok(count)
    }

    /// Get database size in bytes (page_count * page_size)
    pub fn db_size(&self) -> Result<i64, StorageError> {
        let conn = self.conn.lock().unwrap();
        let page_count: i64 = conn.query_row("PRAGMA page_count", [], |row| row.get(0))?;
        let page_size: i64 = conn.query_row("PRAGMA page_size", [], |row| row.get(0))?;
        Ok(page_count * page_size)
    }

    /// Get clipboard entries storage size in bytes (sum of content field lengths, excluding archived)
    pub fn clipboard_storage_size(&self) -> Result<i64, StorageError> {
        let conn = self.conn.lock().unwrap();
        let size: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(LENGTH(content) + LENGTH(preview) + LENGTH(COALESCE(original_content, ''))), 0) FROM clipboard_entries WHERE archived_at IS NULL",
                [],
                |row| row.get(0),
            )?;
        Ok(size)
    }

    /// Get memos storage size in bytes (sum of title + body + tags field lengths, excluding archived)
    pub fn memo_storage_size(&self) -> Result<i64, StorageError> {
        let conn = self.conn.lock().unwrap();
        let size: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(LENGTH(title) + LENGTH(body) + LENGTH(tags)), 0) FROM memos WHERE archived_at IS NULL",
                [],
                |row| row.get(0),
            )?;
        Ok(size)
    }

    /// Clear all non-pinned entries (archive them if archive is enabled, otherwise hard delete)
    pub fn clear_unpinned(&self, archive: bool) -> Result<u64, StorageError> {
        let conn = self.conn.lock().unwrap();
        if archive {
            let rows = conn.execute(
                "UPDATE clipboard_entries SET archived_at = datetime('now') WHERE pinned = 0 AND archived_at IS NULL",
                [],
            )?;
            Ok(rows as u64)
        } else {
            let rows = conn.execute("DELETE FROM clipboard_entries WHERE pinned = 0", [])?;
            Ok(rows as u64)
        }
    }

    /// Archive a single entry by ID
    pub fn archive_entry(&self, id: i64) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute(
            "UPDATE clipboard_entries SET archived_at = datetime('now') WHERE id = ?1 AND archived_at IS NULL",
            params![id],
        )?;
        Ok(rows > 0)
    }

    /// Unarchive (restore) a single entry by ID
    pub fn unarchive_entry(&self, id: i64) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute(
            "UPDATE clipboard_entries SET archived_at = NULL WHERE id = ?1",
            params![id],
        )?;
        Ok(rows > 0)
    }

    /// Query archived entries
    pub fn query_archived(
        &self,
        filter: &QueryFilter,
    ) -> Result<Vec<ClipboardEntry>, StorageError> {
        let conn = self.conn.lock().unwrap();
        let mut sql = String::from("SELECT id, category, content_type, content, preview, hash, pinned, created_at, original_content, updated_at, archived_at FROM clipboard_entries WHERE archived_at IS NOT NULL");
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

        sql.push_str(" ORDER BY archived_at DESC");

        let limit = filter.limit.unwrap_or(50);
        sql.push_str(&format!(" LIMIT {}", limit));

        if let Some(offset) = filter.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let entries = stmt
            .query_map(params_refs.as_slice(), map_row_to_entry)?
            .collect::<SqlResult<Vec<_>>>()?;

        Ok(entries)
    }

    /// Count archived entries
    pub fn archive_count(&self) -> Result<i64, StorageError> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM clipboard_entries WHERE archived_at IS NOT NULL",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Permanently delete entries archived more than `days` days ago
    pub fn purge_old_archives(&self, days: i64) -> Result<u64, StorageError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute(
            "DELETE FROM clipboard_entries WHERE archived_at IS NOT NULL AND archived_at < datetime('now', '-' || ?1 || ' days')",
            params![days],
        )?;
        Ok(rows as u64)
    }

    /// Permanently delete a single archived entry
    pub fn permanent_delete(&self, id: i64) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM clipboard_entries WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    // ─── Memo CRUD ──────────────────────────────────────────────────

    /// Query memos with optional search filter
    pub fn get_memos(&self, filter: &MemoFilter) -> Result<Vec<Memo>, StorageError> {
        let conn = self.conn.lock().unwrap();
        let mut sql = String::from("SELECT id, title, body, tags, pinned, sort_order, created_at, updated_at, archived_at FROM memos WHERE archived_at IS NULL");
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref search) = filter.search {
            sql.push_str(" AND (title LIKE ? OR body LIKE ? OR tags LIKE ?)");
            let pattern = format!("%{}%", search);
            param_values.push(Box::new(pattern.clone()));
            param_values.push(Box::new(pattern.clone()));
            param_values.push(Box::new(pattern));
        }

        sql.push_str(" ORDER BY pinned DESC, sort_order DESC");

        let limit = filter.limit.unwrap_or(100);
        sql.push_str(&format!(" LIMIT {}", limit));

        if let Some(offset) = filter.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let memos = stmt
            .query_map(params_refs.as_slice(), |row| {
                let pinned_int: i32 = row.get(4)?;
                Ok(Memo {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    body: row.get(2)?,
                    tags: row.get(3)?,
                    pinned: pinned_int != 0,
                    sort_order: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                    archived_at: row.get(8)?,
                })
            })?
            .collect::<SqlResult<Vec<_>>>()?;

        Ok(memos)
    }

    /// Create a new memo, returns the created memo
    pub fn create_memo(&self, title: &str, body: &str, tags: &str) -> Result<Memo, StorageError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO memos (title, body, tags, sort_order) VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM memos))",
            params![title, body, tags],
        )?;
        let id = conn.last_insert_rowid();
        let memo = conn.query_row(
            "SELECT id, title, body, tags, pinned, sort_order, created_at, updated_at, archived_at FROM memos WHERE id = ?1",
            params![id],
            |row| {
                let pinned_int: i32 = row.get(4)?;
                Ok(Memo {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    body: row.get(2)?,
                    tags: row.get(3)?,
                    pinned: pinned_int != 0,
                    sort_order: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                    archived_at: row.get(8)?,
                })
            },
        )?;
        Ok(memo)
    }

    /// Update an existing memo (also refreshes updated_at)
    pub fn update_memo(
        &self,
        id: i64,
        title: &str,
        body: &str,
        tags: &str,
    ) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute(
            "UPDATE memos SET title = ?1, body = ?2, tags = ?3, updated_at = datetime('now') WHERE id = ?4",
            params![title, body, tags, id],
        )?;
        Ok(rows > 0)
    }

    /// Delete a memo by ID
    pub fn delete_memo(&self, id: i64, archive: bool) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        if archive {
            let rows = conn.execute(
                "UPDATE memos SET archived_at = datetime('now') WHERE id = ?1 AND archived_at IS NULL",
                params![id],
            )?;
            Ok(rows > 0)
        } else {
            let rows = conn.execute("DELETE FROM memos WHERE id = ?1", params![id])?;
            Ok(rows > 0)
        }
    }

    /// Toggle memo pinned status
    pub fn toggle_memo_pin(&self, id: i64) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE memos SET pinned = NOT pinned WHERE id = ?1",
            params![id],
        )?;
        let pinned: bool = conn
            .query_row(
                "SELECT pinned FROM memos WHERE id = ?1",
                params![id],
                |row| row.get::<_, i32>(0).map(|v| v != 0),
            )
            .unwrap_or(false);
        Ok(pinned)
    }

    /// Get total memo count
    pub fn memo_count(&self) -> Result<i64, StorageError> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM memos WHERE archived_at IS NULL",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Batch-update sort_order for multiple memos in a single transaction
    pub fn reorder_memos(&self, orders: &[(i64, i64)]) -> Result<(), StorageError> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        for (id, sort_order) in orders {
            tx.execute(
                "UPDATE memos SET sort_order = ?1 WHERE id = ?2",
                params![sort_order, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Archive a memo by ID
    pub fn archive_memo(&self, id: i64) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute(
            "UPDATE memos SET archived_at = datetime('now') WHERE id = ?1 AND archived_at IS NULL",
            params![id],
        )?;
        Ok(rows > 0)
    }

    /// Unarchive (restore) a memo by ID
    pub fn unarchive_memo(&self, id: i64) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute(
            "UPDATE memos SET archived_at = NULL WHERE id = ?1",
            params![id],
        )?;
        Ok(rows > 0)
    }

    /// Query archived memos
    pub fn query_archived_memos(&self, filter: &MemoFilter) -> Result<Vec<Memo>, StorageError> {
        let conn = self.conn.lock().unwrap();
        let mut sql = String::from("SELECT id, title, body, tags, pinned, sort_order, created_at, updated_at, archived_at FROM memos WHERE archived_at IS NOT NULL");
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref search) = filter.search {
            sql.push_str(" AND (title LIKE ? OR body LIKE ? OR tags LIKE ?)");
            let pattern = format!("%{}%", search);
            param_values.push(Box::new(pattern.clone()));
            param_values.push(Box::new(pattern.clone()));
            param_values.push(Box::new(pattern));
        }

        sql.push_str(" ORDER BY archived_at DESC");

        let limit = filter.limit.unwrap_or(100);
        sql.push_str(&format!(" LIMIT {}", limit));

        if let Some(offset) = filter.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let memos = stmt
            .query_map(params_refs.as_slice(), |row| {
                let pinned_int: i32 = row.get(4)?;
                Ok(Memo {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    body: row.get(2)?,
                    tags: row.get(3)?,
                    pinned: pinned_int != 0,
                    sort_order: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                    archived_at: row.get(8)?,
                })
            })?
            .collect::<SqlResult<Vec<_>>>()?;

        Ok(memos)
    }

    /// Count archived memos
    pub fn memo_archive_count(&self) -> Result<i64, StorageError> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM memos WHERE archived_at IS NOT NULL",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Permanently delete memos archived more than `days` days ago
    pub fn purge_old_memo_archives(&self, days: i64) -> Result<u64, StorageError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute(
            "DELETE FROM memos WHERE archived_at IS NOT NULL AND archived_at < datetime('now', '-' || ?1 || ' days')",
            params![days],
        )?;
        Ok(rows as u64)
    }

    /// Permanently delete a single memo (archived or not)
    pub fn permanent_delete_memo(&self, id: i64) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM memos WHERE id = ?1", params![id])?;
        Ok(rows > 0)
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
