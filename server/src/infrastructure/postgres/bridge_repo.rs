//! PostgreSQL repository for bridges.
//!
//! Bridges are RPi devices that serve as serial-to-WebSocket gateways
//! for OMNI machines. Each bridge is identified by its IP address and
//! may be authorized or deauthorized for server access.

use sqlx::PgPool;

use super::RepoError;
use crate::domain::entities::Bridge;

/// Repository for bridge CRUD and IP-based authentication.
#[derive(Debug, Clone)]
pub struct BridgeRepo {
    pool: PgPool,
}

impl BridgeRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Find a bridge by its IP address.
    pub async fn find_by_ip(&self, ip: &str) -> Result<Option<Bridge>, RepoError> {
        let row = sqlx::query_as::<_, Bridge>(
            "SELECT * FROM bridges WHERE ip_address = $1",
        )
        .bind(ip)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    /// Set bridge status to online with current timestamp.
    pub async fn set_online(&self, id: i64) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE bridges SET status = 'online', last_seen_at = NOW(), updated_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Set bridge status to offline.
    pub async fn set_offline(&self, id: i64) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE bridges SET status = 'offline', updated_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// List all bridges ordered by creation date descending.
    pub async fn list(&self) -> Result<Vec<Bridge>, RepoError> {
        let rows = sqlx::query_as::<_, Bridge>(
            "SELECT * FROM bridges ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Create a new bridge with the given IP address and optional label.
    /// Returns the created bridge.
    pub async fn create(
        &self,
        ip: &str,
        label: Option<&str>,
    ) -> Result<Bridge, RepoError> {
        let row = sqlx::query_as::<_, Bridge>(
            r#"
            INSERT INTO bridges (ip_address, label, authorized, status)
            VALUES ($1, $2, true, 'offline')
            RETURNING *
            "#,
        )
        .bind(ip)
        .bind(label)
        .fetch_one(&self.pool)
        .await?;

        Ok(row)
    }

    /// Update a bridge's label and/or authorized flag.
    /// Only provided fields are updated (COALESCE pattern).
    pub async fn update(
        &self,
        id: i64,
        label: Option<&str>,
        authorized: Option<bool>,
    ) -> Result<Bridge, RepoError> {
        let row = sqlx::query_as::<_, Bridge>(
            r#"
            UPDATE bridges SET
                label = COALESCE($2, label),
                authorized = COALESCE($3, authorized),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(label)
        .bind(authorized)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| RepoError::NotFound(format!("Bridge {} not found", id)))?;

        Ok(row)
    }

    /// Update the last_seen_at timestamp for a bridge (heartbeat).
    pub async fn touch_last_seen(&self, id: i64) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE bridges SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Delete a bridge by id.
    pub async fn delete(&self, id: i64) -> Result<(), RepoError> {
        let result = sqlx::query("DELETE FROM bridges WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(RepoError::NotFound(format!("Bridge {} not found", id)));
        }

        Ok(())
    }
}
