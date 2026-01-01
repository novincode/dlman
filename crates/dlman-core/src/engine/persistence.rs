//! SQLite-based persistence layer for downloads
//!
//! Stores downloads and segments in a relational database for atomic, transactional updates.

use crate::error::DlmanError;
use dlman_types::{Download, DownloadStatus, Segment};
use sqlx::{sqlite::{SqliteConnectOptions, SqlitePool}, Row, SqlitePool as Pool};
use std::path::Path;
use uuid::Uuid;

/// Database connection pool for download persistence
#[derive(Clone, Debug)]
pub struct DownloadDatabase {
    pool: Pool,
}

impl DownloadDatabase {
    /// Create a new database connection
    pub async fn new<P: AsRef<Path>>(db_path: P) -> Result<Self, DlmanError> {
        let path = db_path.as_ref();
        
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        
        // Create connection options with create_if_missing
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true);
        
        let pool = SqlitePool::connect_with(options).await?;
        
        // Create tables
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS downloads (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                final_url TEXT,
                filename TEXT NOT NULL,
                destination TEXT NOT NULL,
                size INTEGER,
                downloaded INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                queue_id TEXT NOT NULL,
                category_id TEXT,
                color TEXT,
                error TEXT,
                speed_limit INTEGER,
                created_at TEXT NOT NULL,
                completed_at TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0,
                etag TEXT,
                last_modified TEXT,
                supports_range INTEGER NOT NULL DEFAULT 0
            );
            
            CREATE TABLE IF NOT EXISTS segments (
                download_id TEXT NOT NULL,
                segment_index INTEGER NOT NULL,
                start_byte INTEGER NOT NULL,
                end_byte INTEGER NOT NULL,
                downloaded_bytes INTEGER NOT NULL DEFAULT 0,
                complete INTEGER NOT NULL DEFAULT 0,
                temp_file_path TEXT,
                PRIMARY KEY (download_id, segment_index),
                FOREIGN KEY (download_id) REFERENCES downloads(id) ON DELETE CASCADE
            );
            
            CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
            CREATE INDEX IF NOT EXISTS idx_downloads_queue ON downloads(queue_id);
            CREATE INDEX IF NOT EXISTS idx_segments_download ON segments(download_id);
            "#,
        )
        .execute(&pool)
        .await?;
        
        Ok(Self { pool })
    }
    
    /// Save or update a download
    pub async fn upsert_download(&self, download: &Download) -> Result<(), DlmanError> {
        let mut tx = self.pool.begin().await?;
        
        // Upsert download
        sqlx::query(
            r#"
            INSERT INTO downloads (
                id, url, final_url, filename, destination, size, downloaded,
                status, queue_id, category_id, color, error, speed_limit,
                created_at, completed_at, retry_count, etag, last_modified, supports_range
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                url = excluded.url,
                final_url = excluded.final_url,
                filename = excluded.filename,
                destination = excluded.destination,
                size = excluded.size,
                downloaded = excluded.downloaded,
                status = excluded.status,
                queue_id = excluded.queue_id,
                category_id = excluded.category_id,
                color = excluded.color,
                error = excluded.error,
                speed_limit = excluded.speed_limit,
                completed_at = excluded.completed_at,
                retry_count = excluded.retry_count,
                etag = excluded.etag,
                last_modified = excluded.last_modified,
                supports_range = excluded.supports_range
            "#,
        )
        .bind(download.id.to_string())
        .bind(&download.url)
        .bind(download.final_url.as_ref())
        .bind(&download.filename)
        .bind(download.destination.to_string_lossy().to_string())
        .bind(download.size.map(|s| s as i64))
        .bind(download.downloaded as i64)
        .bind(format!("{:?}", download.status).to_lowercase())
        .bind(download.queue_id.to_string())
        .bind(download.category_id.map(|id| id.to_string()))
        .bind(download.color.as_ref())
        .bind(download.error.as_ref())
        .bind(download.speed_limit.map(|s| s as i64))
        .bind(download.created_at.to_rfc3339())
        .bind(download.completed_at.map(|d| d.to_rfc3339()))
        .bind(download.retry_count as i64)
        .bind(None::<String>) // etag - will add later
        .bind(None::<String>) // last_modified - will add later
        .bind(0i64) // supports_range - will add later
        .execute(&mut *tx)
        .await?;
        
        // Delete old segments
        sqlx::query("DELETE FROM segments WHERE download_id = ?")
            .bind(download.id.to_string())
            .execute(&mut *tx)
            .await?;
        
        // Insert new segments
        for segment in &download.segments {
            sqlx::query(
                r#"
                INSERT INTO segments (
                    download_id, segment_index, start_byte, end_byte,
                    downloaded_bytes, complete, temp_file_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(download.id.to_string())
            .bind(segment.index as i64)
            .bind(segment.start as i64)
            .bind(segment.end as i64)
            .bind(segment.downloaded as i64)
            .bind(if segment.complete { 1i64 } else { 0i64 })
            .bind(None::<String>) // temp_file_path - will add later
            .execute(&mut *tx)
            .await?;
        }
        
        tx.commit().await?;
        Ok(())
    }
    
    /// Load a download by ID
    pub async fn load_download(&self, id: Uuid) -> Result<Option<Download>, DlmanError> {
        let row = sqlx::query(
            "SELECT * FROM downloads WHERE id = ?"
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await?;
        
        let Some(row) = row else {
            return Ok(None);
        };
        
        // Load segments
        let segments = self.load_segments(id).await?;
        
        Ok(Some(row_to_download(row, segments)?))
    }
    
    /// Load all downloads (optimized with single segments query)
    pub async fn load_all_downloads(&self) -> Result<Vec<Download>, DlmanError> {
        // Load all downloads
        let download_rows = sqlx::query("SELECT * FROM downloads ORDER BY created_at DESC")
            .fetch_all(&self.pool)
            .await?;
        
        // Load all segments in one query
        let segment_rows = sqlx::query("SELECT * FROM segments ORDER BY download_id, segment_index")
            .fetch_all(&self.pool)
            .await?;
        
        // Group segments by download_id
        let mut segments_map: std::collections::HashMap<String, Vec<Segment>> = std::collections::HashMap::new();
        for row in segment_rows {
            let download_id: String = row.get("download_id");
            let segment = Segment {
                index: row.get::<i64, _>("segment_index") as u32,
                start: row.get::<i64, _>("start_byte") as u64,
                end: row.get::<i64, _>("end_byte") as u64,
                downloaded: row.get::<i64, _>("downloaded_bytes") as u64,
                complete: row.get::<i64, _>("complete") != 0,
            };
            segments_map.entry(download_id).or_default().push(segment);
        }
        
        // Build downloads with their segments
        let mut downloads = Vec::new();
        for row in download_rows {
            let id: String = row.get("id");
            let segments = segments_map.remove(&id).unwrap_or_default();
            downloads.push(row_to_download(row, segments)?);
        }
        
        Ok(downloads)
    }
    
    /// Load segments for a download
    async fn load_segments(&self, download_id: Uuid) -> Result<Vec<Segment>, DlmanError> {
        let rows = sqlx::query(
            "SELECT * FROM segments WHERE download_id = ? ORDER BY segment_index"
        )
        .bind(download_id.to_string())
        .fetch_all(&self.pool)
        .await?;
        
        let segments = rows
            .into_iter()
            .map(|row| {
                Ok(Segment {
                    index: row.get::<i64, _>("segment_index") as u32,
                    start: row.get::<i64, _>("start_byte") as u64,
                    end: row.get::<i64, _>("end_byte") as u64,
                    downloaded: row.get::<i64, _>("downloaded_bytes") as u64,
                    complete: row.get::<i64, _>("complete") != 0,
                })
            })
            .collect::<Result<Vec<_>, DlmanError>>()?;
        
        Ok(segments)
    }
    
    /// Update segment progress
    pub async fn update_segment_progress(
        &self,
        download_id: Uuid,
        segment_index: u32,
        downloaded_bytes: u64,
        complete: bool,
    ) -> Result<(), DlmanError> {
        sqlx::query(
            r#"
            UPDATE segments
            SET downloaded_bytes = ?, complete = ?
            WHERE download_id = ? AND segment_index = ?
            "#,
        )
        .bind(downloaded_bytes as i64)
        .bind(if complete { 1i64 } else { 0i64 })
        .bind(download_id.to_string())
        .bind(segment_index as i64)
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }
    
    /// Update download progress (sum of all segments)
    pub async fn update_download_progress(
        &self,
        download_id: Uuid,
        total_downloaded: u64,
    ) -> Result<(), DlmanError> {
        sqlx::query("UPDATE downloads SET downloaded = ? WHERE id = ?")
            .bind(total_downloaded as i64)
            .bind(download_id.to_string())
            .execute(&self.pool)
            .await?;
        
        Ok(())
    }
    
    /// Update download status
    pub async fn update_download_status(
        &self,
        download_id: Uuid,
        status: DownloadStatus,
        error: Option<String>,
    ) -> Result<(), DlmanError> {
        sqlx::query(
            r#"
            UPDATE downloads
            SET status = ?, error = ?, completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
            WHERE id = ?
            "#,
        )
        .bind(format!("{:?}", status).to_lowercase())
        .bind(error)
        .bind(format!("{:?}", status).to_lowercase())
        .bind(download_id.to_string())
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }
    
    /// Delete a download and its segments
    pub async fn delete_download(&self, download_id: Uuid) -> Result<(), DlmanError> {
        sqlx::query("DELETE FROM downloads WHERE id = ?")
            .bind(download_id.to_string())
            .execute(&self.pool)
            .await?;
        
        Ok(())
    }
    
    /// Get downloads by queue ID (optimized with single segments query)
    pub async fn get_downloads_by_queue(&self, queue_id: Uuid) -> Result<Vec<Download>, DlmanError> {
        // Load downloads for this queue
        let download_rows = sqlx::query(
            "SELECT * FROM downloads WHERE queue_id = ? ORDER BY created_at DESC"
        )
        .bind(queue_id.to_string())
        .fetch_all(&self.pool)
        .await?;
        
        if download_rows.is_empty() {
            return Ok(Vec::new());
        }
        
        // Collect download IDs
        let download_ids: Vec<String> = download_rows
            .iter()
            .map(|row| row.get::<String, _>("id"))
            .collect();
        
        // Load all segments for these downloads in one query
        // Build placeholders for IN clause
        let placeholders = download_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT * FROM segments WHERE download_id IN ({}) ORDER BY download_id, segment_index",
            placeholders
        );
        
        let mut segment_query = sqlx::query(&query);
        for id in &download_ids {
            segment_query = segment_query.bind(id);
        }
        let segment_rows = segment_query.fetch_all(&self.pool).await?;
        
        // Group segments by download_id
        let mut segments_map: std::collections::HashMap<String, Vec<Segment>> = std::collections::HashMap::new();
        for row in segment_rows {
            let download_id: String = row.get("download_id");
            let segment = Segment {
                index: row.get::<i64, _>("segment_index") as u32,
                start: row.get::<i64, _>("start_byte") as u64,
                end: row.get::<i64, _>("end_byte") as u64,
                downloaded: row.get::<i64, _>("downloaded_bytes") as u64,
                complete: row.get::<i64, _>("complete") != 0,
            };
            segments_map.entry(download_id).or_default().push(segment);
        }
        
        // Build downloads with their segments
        let mut downloads = Vec::new();
        for row in download_rows {
            let id: String = row.get("id");
            let segments = segments_map.remove(&id).unwrap_or_default();
            downloads.push(row_to_download(row, segments)?);
        }
        
        Ok(downloads)
    }
}

/// Convert a database row to a Download struct
fn row_to_download(row: sqlx::sqlite::SqliteRow, segments: Vec<Segment>) -> Result<Download, DlmanError> {
    use chrono::{DateTime, Utc};
    use std::path::PathBuf;
    
    let status_str: String = row.get("status");
    let status = match status_str.as_str() {
        "pending" => DownloadStatus::Pending,
        "downloading" => DownloadStatus::Downloading,
        "paused" => DownloadStatus::Paused,
        "completed" => DownloadStatus::Completed,
        "failed" => DownloadStatus::Failed,
        "queued" => DownloadStatus::Queued,
        "cancelled" => DownloadStatus::Cancelled,
        "deleted" => DownloadStatus::Deleted,
        _ => DownloadStatus::Pending,
    };
    
    Ok(Download {
        id: Uuid::parse_str(row.get::<String, _>("id").as_str())
            .map_err(|e| DlmanError::Unknown(e.to_string()))?,
        url: row.get("url"),
        final_url: row.get("final_url"),
        filename: row.get("filename"),
        destination: PathBuf::from(row.get::<String, _>("destination")),
        size: row.get::<Option<i64>, _>("size").map(|s| s as u64),
        downloaded: row.get::<i64, _>("downloaded") as u64,
        status,
        segments,
        queue_id: Uuid::parse_str(row.get::<String, _>("queue_id").as_str())
            .map_err(|e| DlmanError::Unknown(e.to_string()))?,
        category_id: row.get::<Option<String>, _>("category_id")
            .and_then(|s| Uuid::parse_str(&s).ok()),
        color: row.get("color"),
        error: row.get("error"),
        speed_limit: row.get::<Option<i64>, _>("speed_limit").map(|s| s as u64),
        created_at: DateTime::parse_from_rfc3339(row.get::<String, _>("created_at").as_str())
            .map_err(|e| DlmanError::Unknown(e.to_string()))?
            .with_timezone(&Utc),
        completed_at: row.get::<Option<String>, _>("completed_at")
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc)),
        retry_count: row.get::<i64, _>("retry_count") as u32,
    })
}
