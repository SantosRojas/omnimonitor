//! PostgreSQL repository for therapies.

use chrono::{DateTime, Utc};
use sqlx::PgPool;

use super::RepoError;
use crate::domain::entities::Therapy;

/// Repository for therapy CRUD and bridge-integration operations.
#[derive(Debug, Clone)]
pub struct TherapyRepo {
    pool: PgPool,
}

impl TherapyRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Create a new therapy with 'planned' status.
    pub async fn create(
        &self,
        patient_id: i64,
        machine_id: i64,
        therapy_type: Option<&str>,
        kit: Option<&str>,
        weight: Option<f64>,
    ) -> Result<Therapy, RepoError> {
        let row = sqlx::query_as::<_, Therapy>(
            r#"
            INSERT INTO therapies (patient_id, machine_id, status, therapy_type, kit, weight)
            VALUES ($1, $2, 'planned', $3, $4, $5)
            RETURNING *
            "#,
        )
        .bind(patient_id)
        .bind(machine_id)
        .bind(therapy_type)
        .bind(kit)
        .bind(weight)
        .fetch_one(&self.pool)
        .await?;

        Ok(row)
    }

    /// Find a therapy by its primary key.
    pub async fn find_by_id(&self, id: i64) -> Result<Option<Therapy>, RepoError> {
        let row = sqlx::query_as::<_, Therapy>("SELECT * FROM therapies WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row)
    }

    /// List therapies with optional filters.
    pub async fn list(
        &self,
        patient_id: Option<i64>,
        machine_id: Option<i64>,
        status: Option<&str>,
        date_from: Option<DateTime<Utc>>,
        date_to: Option<DateTime<Utc>>,
    ) -> Result<Vec<Therapy>, RepoError> {
        let rows = sqlx::query_as::<_, Therapy>(
            r#"
            SELECT * FROM therapies
            WHERE ($1::bigint IS NULL OR patient_id = $1)
              AND ($2::bigint IS NULL OR machine_id = $2)
              AND ($3::text IS NULL OR status = $3)
              AND ($4::timestamptz IS NULL OR started_at >= $4)
              AND ($5::timestamptz IS NULL OR started_at <= $5)
            ORDER BY created_at DESC
            "#,
        )
        .bind(patient_id)
        .bind(machine_id)
        .bind(status)
        .bind(date_from)
        .bind(date_to)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Update therapy status (active, completed, cancelled).
    pub async fn update_status(&self, id: i64, status: &str) -> Result<Therapy, RepoError> {
        let row = sqlx::query_as::<_, Therapy>(
            r#"
            UPDATE therapies SET
                status = $2,
                started_at = CASE WHEN $2 = 'active' AND started_at IS NULL THEN NOW() ELSE started_at END,
                ended_at = CASE WHEN $2 IN ('completed', 'cancelled') THEN NOW() ELSE ended_at END
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(status)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| RepoError::NotFound(format!("Therapy {} not found", id)))?;

        Ok(row)
    }

    /// Update therapy metadata (therapy_type, kit, weight) from bridge TherapySetup.
    pub async fn update_metadata(
        &self,
        id: i64,
        therapy_type: Option<&str>,
        kit: Option<&str>,
        weight: Option<f64>,
    ) -> Result<Therapy, RepoError> {
        let row = sqlx::query_as::<_, Therapy>(
            r#"
            UPDATE therapies SET
                therapy_type = COALESCE($2, therapy_type),
                kit = COALESCE($3, kit),
                weight = COALESCE($4, weight)
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(therapy_type)
        .bind(kit)
        .bind(weight)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| RepoError::NotFound(format!("Therapy {} not found", id)))?;

        Ok(row)
    }

    /// Find an active or planned therapy for a given machine.
    /// Used by the TherapySetup handler to find an existing session.
    pub async fn find_active_by_machine(&self, machine_id: i64) -> Result<Option<Therapy>, RepoError> {
        let row = sqlx::query_as::<_, Therapy>(
            "SELECT * FROM therapies WHERE machine_id = $1 AND status IN ('active', 'planned') ORDER BY created_at DESC LIMIT 1",
        )
        .bind(machine_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    /// List therapies for a patient.
    pub async fn list_by_patient(&self, patient_id: i64) -> Result<Vec<Therapy>, RepoError> {
        let rows = sqlx::query_as::<_, Therapy>(
            "SELECT * FROM therapies WHERE patient_id = $1 ORDER BY created_at DESC",
        )
        .bind(patient_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// List therapies for a machine.
    pub async fn list_by_machine(&self, machine_id: i64) -> Result<Vec<Therapy>, RepoError> {
        let rows = sqlx::query_as::<_, Therapy>(
            "SELECT * FROM therapies WHERE machine_id = $1 ORDER BY created_at DESC",
        )
        .bind(machine_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }
}
