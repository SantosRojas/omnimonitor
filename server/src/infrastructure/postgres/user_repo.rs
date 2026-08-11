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

    /// Create a new user with a hashed password and optional email.
    ///
    /// Returns `RepoError::Conflict` if the username or email is already in
    /// use (UNIQUE constraints `users_username_key` / `users_email_key`).
    pub async fn create(
        &self,
        username: &str,
        password_hash: &str,
        role: &str,
        email: Option<&str>,
    ) -> Result<User, RepoError> {
        let result = sqlx::query_as::<_, User>(
            "INSERT INTO users (username, password_hash, role, email) VALUES ($1, $2, $3, $4) RETURNING *",
        )
        .bind(username)
        .bind(password_hash)
        .bind(role)
        .bind(email)
        .fetch_one(&self.pool)
        .await;

        match result {
            Ok(user) => Ok(user),
            Err(sqlx::Error::Database(db_err))
                if db_err.constraint() == Some("users_username_key") =>
            {
                Err(RepoError::Conflict(format!(
                    "Username '{}' already exists",
                    username
                )))
            }
            Err(sqlx::Error::Database(db_err))
                if db_err.constraint() == Some("users_email_key") =>
            {
                Err(RepoError::Conflict(format!(
                    "Email '{}' is already in use",
                    email.unwrap_or("")
                )))
            }
            Err(e) => Err(RepoError::Database(e)),
        }
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

    /// Update a user's username, role and/or email.
    /// Only provided fields are updated (COALESCE pattern).
    ///
    /// Returns `RepoError::Conflict` if the username or email is already in use.
    pub async fn update(
        &self,
        id: i64,
        username: Option<&str>,
        role: Option<&str>,
        email: Option<&str>,
    ) -> Result<User, RepoError> {
        let result = sqlx::query_as::<_, User>(
            r#"
            UPDATE users SET
                username = COALESCE($2, username),
                role     = COALESCE($3, role),
                email    = COALESCE($4, email)
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(username)
        .bind(role)
        .bind(email)
        .fetch_optional(&self.pool)
        .await;

        match result {
            Ok(Some(user)) => Ok(user),
            Ok(None) => Err(RepoError::NotFound(format!("User {} not found", id))),
            Err(sqlx::Error::Database(db_err))
                if db_err.constraint() == Some("users_username_key") =>
            {
                Err(RepoError::Conflict(format!(
                    "Username '{}' is already in use",
                    username.unwrap_or("")
                )))
            }
            Err(sqlx::Error::Database(db_err))
                if db_err.constraint() == Some("users_email_key") =>
            {
                Err(RepoError::Conflict(format!(
                    "Email '{}' is already in use",
                    email.unwrap_or("")
                )))
            }
            Err(e) => Err(RepoError::Database(e)),
        }
    }

    /// Update a user's password hash (own password change or admin reset).
    pub async fn update_password_hash(
        &self,
        id: i64,
        password_hash: &str,
    ) -> Result<(), RepoError> {
        let result = sqlx::query("UPDATE users SET password_hash = $2 WHERE id = $1")
            .bind(id)
            .bind(password_hash)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(RepoError::NotFound(format!("User {} not found", id)));
        }
        Ok(())
    }

    /// Delete a user by id.
    pub async fn delete(&self, id: i64) -> Result<(), RepoError> {
        let result = sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(RepoError::NotFound(format!("User {} not found", id)));
        }
        Ok(())
    }
}
