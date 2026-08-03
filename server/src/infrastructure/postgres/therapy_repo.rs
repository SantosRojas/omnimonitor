//! PostgreSQL repository for therapies.

use chrono::{DateTime, Utc};
use sqlx::PgPool;

use super::RepoError;
use crate::domain::entities::{Therapy, TherapyListItem};

/// Repository for therapy CRUD and bridge-integration operations.
#[derive(Debug, Clone)]
pub struct TherapyRepo {
    pool: PgPool,
}

impl TherapyRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Create a new therapy with 'planned' status. The bridge sends TherapySetup
    /// when a session starts, so the therapy is born already started.
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
            INSERT INTO therapies (patient_id, machine_id, status, therapy_type, kit, weight, started_at)
            VALUES ($1, $2, 'planned', $3, $4, $5, NOW())
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

    /// Set started_at to NOW() when it is still NULL. Used to backfill sessions
    /// created before the start-time fix (bridge re-sends TherapySetup for them).
    pub async fn ensure_started(&self, id: i64) -> Result<(), RepoError> {
        sqlx::query(
            r#"
            UPDATE therapies SET started_at = NOW()
            WHERE id = $1 AND started_at IS NULL
            "#,
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
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

    /// List therapies with optional filters, joined to the patient's external identifier.
    pub async fn list_with_patient(
        &self,
        patient_id: Option<i64>,
        machine_id: Option<i64>,
        status: Option<&str>,
        date_from: Option<DateTime<Utc>>,
        date_to: Option<DateTime<Utc>>,
    ) -> Result<Vec<TherapyListItem>, RepoError> {
        let rows = sqlx::query_as::<_, TherapyListItem>(
            r#"
            SELECT t.id, t.patient_id, t.machine_id, t.started_at, t.ended_at, t.status,
                   t.therapy_type, t.kit, t.weight, t.end_weight, t.created_at,
                   p.external_id AS patient_external_id,
                   p.name AS patient_name,
                   p.age AS patient_age
            FROM therapies t
            LEFT JOIN patients p ON p.id = t.patient_id
            WHERE ($1::bigint IS NULL OR t.patient_id = $1)
              AND ($2::bigint IS NULL OR t.machine_id = $2)
              AND (
                $3::text IS NULL OR t.status = $3
                OR ($3 = 'active' AND t.status IN ('active', 'planned'))
              )
              AND ($4::timestamptz IS NULL OR t.started_at >= $4)
              AND ($5::timestamptz IS NULL OR t.started_at <= $5)
            ORDER BY t.created_at DESC
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

    /// Update therapy metadata (therapy_type, kit, weight, end_weight).
    /// Called from bridge TherapySetup or from the UI for end-of-therapy weight.
    pub async fn update_metadata(
        &self,
        id: i64,
        therapy_type: Option<&str>,
        kit: Option<&str>,
        weight: Option<f64>,
        end_weight: Option<f64>,
    ) -> Result<Therapy, RepoError> {
        let row = sqlx::query_as::<_, Therapy>(
            r#"
            UPDATE therapies SET
                therapy_type = COALESCE($2, therapy_type),
                kit = COALESCE($3, kit),
                weight = COALESCE($4, weight),
                end_weight = COALESCE($5, end_weight)
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(therapy_type)
        .bind(kit)
        .bind(weight)
        .bind(end_weight)
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
