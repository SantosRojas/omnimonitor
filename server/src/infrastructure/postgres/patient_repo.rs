//! PostgreSQL repository for patients.

use sqlx::PgPool;

use super::RepoError;
use crate::domain::entities::Patient;

/// Repository for patient CRUD.
#[derive(Debug, Clone)]
pub struct PatientRepo {
    pool: PgPool,
}

impl PatientRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Create a new patient with a unique external_id.
    /// Returns `RepoError::Conflict` if the external_id already exists.
    pub async fn create(&self, external_id: &str) -> Result<Patient, RepoError> {
        let result = sqlx::query_as::<_, Patient>(
            "INSERT INTO patients (external_id) VALUES ($1) RETURNING *",
        )
        .bind(external_id)
        .fetch_one(&self.pool)
        .await;

        match result {
            Ok(patient) => Ok(patient),
            Err(sqlx::Error::Database(db_err)) if db_err.constraint() == Some("patients_external_id_key") => {
                Err(RepoError::Conflict(format!(
                    "Patient with external_id '{}' already exists",
                    external_id
                )))
            }
            Err(e) => Err(RepoError::Database(e)),
        }
    }

    /// Find a patient by external_id.
    pub async fn find_by_external_id(&self, external_id: &str) -> Result<Option<Patient>, RepoError> {
        let row = sqlx::query_as::<_, Patient>(
            "SELECT * FROM patients WHERE external_id = $1",
        )
        .bind(external_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    /// Find a patient by primary key.
    pub async fn find_by_id(&self, id: i64) -> Result<Option<Patient>, RepoError> {
        let row = sqlx::query_as::<_, Patient>("SELECT * FROM patients WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row)
    }

    /// List all patients, with optional search by external_id (partial match).
    pub async fn list(&self, search: Option<&str>) -> Result<Vec<Patient>, RepoError> {
        let rows = match search {
            Some(term) if !term.is_empty() => {
                sqlx::query_as::<_, Patient>(
                    "SELECT * FROM patients WHERE external_id ILIKE $1 ORDER BY created_at DESC",
                )
                .bind(format!("%{}%", term))
                .fetch_all(&self.pool)
                .await?
            }
            _ => {
                sqlx::query_as::<_, Patient>(
                    "SELECT * FROM patients ORDER BY created_at DESC",
                )
                .fetch_all(&self.pool)
                .await?
            }
        };

        Ok(rows)
    }

    /// Update a patient's external_id.
    pub async fn update(&self, id: i64, external_id: &str) -> Result<Patient, RepoError> {
        let result = sqlx::query_as::<_, Patient>(
            "UPDATE patients SET external_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
        )
        .bind(external_id)
        .bind(id)
        .fetch_optional(&self.pool)
        .await;

        match result {
            Ok(Some(patient)) => Ok(patient),
            Ok(None) => Err(RepoError::NotFound(format!("Patient {} not found", id))),
            Err(sqlx::Error::Database(db_err)) if db_err.constraint() == Some("patients_external_id_key") => {
                Err(RepoError::Conflict(format!(
                    "external_id '{}' is already in use",
                    external_id
                )))
            }
            Err(e) => Err(RepoError::Database(e)),
        }
    }

    /// Get the therapy count for a patient.
    pub async fn therapy_count(&self, patient_id: i64) -> Result<i64, RepoError> {
        let count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM therapies WHERE patient_id = $1",
        )
        .bind(patient_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(count.0)
    }
}
