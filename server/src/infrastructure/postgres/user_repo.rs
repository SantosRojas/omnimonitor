//! PostgreSQL repository for users.

use sqlx::PgPool;

use super::RepoError;
use crate::domain::entities::User;

/// Repository for user authentication and management.
#[derive(Debug, Clone)]
pub struct UserRepo {
    pool: PgPool,
}

impl UserRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Create a new user with a hashed password.
    pub async fn create(
        &self,
        username: &str,
        password_hash: &str,
        role: &str,
    ) -> Result<User, RepoError> {
        let row = sqlx::query_as::<_, User>(
            "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING *",
        )
        .bind(username)
        .bind(password_hash)
        .bind(role)
        .fetch_one(&self.pool)
        .await?;

        Ok(row)
    }

    /// Find a user by username.
    pub async fn find_by_username(&self, username: &str) -> Result<Option<User>, RepoError> {
        let row = sqlx::query_as::<_, User>(
            "SELECT * FROM users WHERE username = $1",
        )
        .bind(username)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    /// Find a user by their primary key.
    pub async fn find_by_id(&self, id: i64) -> Result<Option<User>, RepoError> {
        let row = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row)
    }

    /// List all users.
    pub async fn list(&self) -> Result<Vec<User>, RepoError> {
        let rows = sqlx::query_as::<_, User>("SELECT * FROM users ORDER BY username")
            .fetch_all(&self.pool)
            .await?;

        Ok(rows)
    }
}
