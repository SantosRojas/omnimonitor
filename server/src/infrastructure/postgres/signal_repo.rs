//! PostgreSQL repository for signals and value mappings.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

use super::RepoError;
use crate::domain::entities::Signal;

/// A value mapping entry for a signal.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ValueMappingRow {
    pub id: i64,
    pub signal_id: i64,
    pub numeric_value: Option<String>,
    pub display_name: Option<String>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub deleted_by: Option<i64>,
}

/// Repository for signals and value mappings.
#[derive(Debug, Clone)]
pub struct SignalRepo {
    pool: PgPool,
}

impl SignalRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    // ── Signals ──────────────────────────────────────

    /// Create a new signal.
    pub async fn create(
        &self,
        internal_name: &str,
        display_name: Option<&str>,
        unit: Option<&str>,
    ) -> Result<Signal, RepoError> {
        let row = sqlx::query_as::<_, Signal>(
            "INSERT INTO signals (internal_name, display_name, unit) VALUES ($1, $2, $3) RETURNING *",
        )
        .bind(internal_name)
        .bind(display_name)
        .bind(unit)
        .fetch_one(&self.pool)
        .await?;

        Ok(row)
    }

    /// List all non-deleted signals.
    pub async fn list(&self) -> Result<Vec<Signal>, RepoError> {
        let rows = sqlx::query_as::<_, Signal>(
            "SELECT * FROM signals WHERE deleted_at IS NULL ORDER BY internal_name",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Find a signal by its primary key.
    pub async fn find_by_id(&self, id: i64) -> Result<Option<Signal>, RepoError> {
        let row = sqlx::query_as::<_, Signal>(
            "SELECT * FROM signals WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    /// Find a signal by internal name.
    pub async fn find_by_name(&self, name: &str) -> Result<Option<Signal>, RepoError> {
        let row = sqlx::query_as::<_, Signal>(
            "SELECT * FROM signals WHERE internal_name = $1 AND deleted_at IS NULL",
        )
        .bind(name)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    /// Update a signal's display name and unit.
    pub async fn update(
        &self,
        id: i64,
        display_name: Option<&str>,
        unit: Option<&str>,
    ) -> Result<Signal, RepoError> {
        let row = sqlx::query_as::<_, Signal>(
            r#"
            UPDATE signals SET
                display_name = COALESCE($2, display_name),
                unit = COALESCE($3, unit)
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(display_name)
        .bind(unit)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| RepoError::NotFound(format!("Signal {} not found", id)))?;

        Ok(row)
    }

    /// Soft-delete a signal with audit trail.
    pub async fn soft_delete(&self, id: i64, deleted_by: i64) -> Result<(), RepoError> {
        let affected = sqlx::query(
            "UPDATE signals SET deleted_at = NOW(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(deleted_by)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if affected == 0 {
            return Err(RepoError::NotFound(format!("Signal {} not found", id)));
        }

        Ok(())
    }

    /// Upsert a signal by internal name.
    ///
    /// Preserves the existing `display_name` if already set (COALESCE).
    /// Use `seed.rs` refresh logic when an explicit overwrite is needed.
    pub async fn upsert_by_name(
        &self,
        internal_name: &str,
        display_name: &str,
        unit: Option<&str>,
    ) -> Result<Signal, RepoError> {
        let row = sqlx::query_as::<_, Signal>(
            r#"
            INSERT INTO signals (internal_name, display_name, unit)
            VALUES ($1, $2, $3)
            ON CONFLICT (internal_name) DO UPDATE SET
                display_name = COALESCE(signals.display_name, EXCLUDED.display_name),
                unit = COALESCE(signals.unit, EXCLUDED.unit)
            RETURNING *
            "#,
        )
        .bind(internal_name)
        .bind(display_name)
        .bind(unit)
        .fetch_one(&self.pool)
        .await?;

        Ok(row)
    }

    // ── Value Mappings ────────────────────────────────

    /// Add a value mapping (idempotent — skip if exists).
    pub async fn try_add_mapping(
        &self,
        signal_id: i64,
        numeric_value: f64,
        display_name: &str,
    ) -> Result<(), RepoError> {
        sqlx::query(
            r#"
            INSERT INTO value_mappings (signal_id, numeric_value, display_name)
            VALUES ($1, $2, $3)
            ON CONFLICT (signal_id, numeric_value) DO NOTHING
            "#,
        )
        .bind(signal_id)
        .bind(numeric_value.to_string())
        .bind(display_name)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Add a value mapping to a signal.
    pub async fn add_mapping(
        &self,
        signal_id: i64,
        numeric_value: Option<&str>,
        display_name: Option<&str>,
    ) -> Result<ValueMappingRow, RepoError> {
        let row = sqlx::query_as::<_, ValueMappingRow>(
            "INSERT INTO value_mappings (signal_id, numeric_value, display_name) VALUES ($1, $2, $3) RETURNING *",
        )
        .bind(signal_id)
        .bind(numeric_value)
        .bind(display_name)
        .fetch_one(&self.pool)
        .await?;

        Ok(row)
    }

    /// List value mappings for a signal (non-deleted).
    pub async fn list_mappings(&self, signal_id: i64) -> Result<Vec<ValueMappingRow>, RepoError> {
        let rows = sqlx::query_as::<_, ValueMappingRow>(
            "SELECT * FROM value_mappings WHERE signal_id = $1 AND deleted_at IS NULL ORDER BY id",
        )
        .bind(signal_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Soft-delete a value mapping with audit log.
    pub async fn delete_mapping(&self, mapping_id: i64, deleted_by: i64) -> Result<(), RepoError> {
        // Soft-delete the mapping
        let affected = sqlx::query(
            "UPDATE value_mappings SET deleted_at = NOW(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(mapping_id)
        .bind(deleted_by)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if affected == 0 {
            return Err(RepoError::NotFound(format!("ValueMapping {} not found", mapping_id)));
        }

        // Record audit log
        sqlx::query(
            "INSERT INTO value_mapping_audit (value_mapping_id, action, changed_by) VALUES ($1, 'deleted', $2)",
        )
        .bind(mapping_id)
        .bind(deleted_by)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Find a specific mapping by ID.
    pub async fn find_mapping(&self, mapping_id: i64) -> Result<Option<ValueMappingRow>, RepoError> {
        let row = sqlx::query_as::<_, ValueMappingRow>(
            "SELECT * FROM value_mappings WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(mapping_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }
}
