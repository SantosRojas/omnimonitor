//! PostgreSQL repository for machines.

use sqlx::PgPool;

use super::RepoError;
use crate::domain::entities::Machine;

/// Repository for machine CRUD and auto-registration.
#[derive(Debug, Clone)]
pub struct MachineRepo {
    pool: PgPool,
}

impl MachineRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Auto-register a machine by serial number. Creates if new, updates last_seen_at if existing.
    pub async fn upsert_by_serial(
        &self,
        serial_number: &str,
        ip_address: Option<&str>,
        port: Option<i32>,
        software_version: Option<&str>,
    ) -> Result<Machine, RepoError> {
        let row = sqlx::query_as::<_, Machine>(
            r#"
            INSERT INTO machines (serial_number, ip_address, port, software_version, status, last_seen_at)
            VALUES ($1, $2, $3, $4, 'online', NOW())
            ON CONFLICT (serial_number) DO UPDATE SET
                ip_address = COALESCE($2, machines.ip_address),
                port = COALESCE($3, machines.port),
                software_version = COALESCE($4, machines.software_version),
                status = 'online',
                last_seen_at = NOW()
            RETURNING *
            "#,
        )
        .bind(serial_number)
        .bind(ip_address)
        .bind(port)
        .bind(software_version)
        .fetch_one(&self.pool)
        .await?;

        Ok(row)
    }

    /// Find a machine by serial number.
    pub async fn find_by_serial(&self, serial: &str) -> Result<Option<Machine>, RepoError> {
        let row = sqlx::query_as::<_, Machine>(
            "SELECT * FROM machines WHERE serial_number = $1",
        )
        .bind(serial)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    /// Find a machine by its primary key.
    pub async fn find_by_id(&self, id: i64) -> Result<Option<Machine>, RepoError> {
        let row = sqlx::query_as::<_, Machine>("SELECT * FROM machines WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row)
    }

    /// List all machines ordered by creation date descending.
    pub async fn list(&self) -> Result<Vec<Machine>, RepoError> {
        let rows = sqlx::query_as::<_, Machine>(
            "SELECT * FROM machines ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Update a machine's label and other mutable fields.
    pub async fn update(
        &self,
        id: i64,
        label: Option<&str>,
        ip_address: Option<&str>,
        port: Option<i32>,
    ) -> Result<Machine, RepoError> {
        let row = sqlx::query_as::<_, Machine>(
            r#"
            UPDATE machines SET
                label = COALESCE($2, label),
                ip_address = COALESCE($3, ip_address),
                port = COALESCE($4, port)
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(label)
        .bind(ip_address)
        .bind(port)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| RepoError::NotFound(format!("Machine {} not found", id)))?;

        Ok(row)
    }

    /// Set machine status to online with current timestamp.
    pub async fn set_online(&self, id: i64) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE machines SET status = 'online', last_seen_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Set machine status to offline.
    pub async fn set_offline(&self, id: i64) -> Result<(), RepoError> {
        sqlx::query("UPDATE machines SET status = 'offline' WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    /// Soft-delete a machine by setting status to 'deleted'.
    pub async fn soft_delete(&self, id: i64) -> Result<(), RepoError> {
        let affected = sqlx::query(
            "UPDATE machines SET status = 'deleted' WHERE id = $1 AND status != 'deleted'",
        )
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if affected == 0 {
            return Err(RepoError::NotFound(format!("Machine {} not found", id)));
        }

        Ok(())
    }

    /// Update last_seen_at to NOW for heartbeat.
    pub async fn touch_last_seen(&self, id: i64) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE machines SET last_seen_at = NOW(), status = 'online' WHERE id = $1",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
