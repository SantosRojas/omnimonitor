//! PostgreSQL repository implementations.

pub mod machine_repo;
pub mod patient_repo;
pub mod readings_repo;
pub mod signal_repo;
pub mod therapy_repo;
pub mod user_repo;
pub mod equivalence_repo;
pub mod version_repo;

use thiserror::Error;

/// Unified error type for all repository operations.
#[derive(Debug, Error)]
pub enum RepoError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Conflict: {0}")]
    Conflict(String),
}
