//! PostgreSQL repository for equivalences.

use sqlx::PgPool;

use super::RepoError;
use crate::domain::entities::Equivalence;

#[derive(Debug, Clone)]
pub struct EquivalenceRepo {
    pool: PgPool,
}

impl EquivalenceRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<Equivalence>, RepoError> {
        let rows = sqlx::query_as::<_, Equivalence>(
            "SELECT * FROM equivalences ORDER BY input_value",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn create(
        &self,
        input_value: &str,
        output_value: &str,
        description: Option<&str>,
    ) -> Result<Equivalence, RepoError> {
        let row = sqlx::query_as::<_, Equivalence>(
            "INSERT INTO equivalences (input_value, output_value, description) VALUES ($1, $2, $3) RETURNING *",
        )
        .bind(input_value)
        .bind(output_value)
        .bind(description)
        .fetch_one(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn update(
        &self,
        id: i64,
        input_value: Option<&str>,
        output_value: Option<&str>,
        description: Option<&str>,
    ) -> Result<Equivalence, RepoError> {
        let row = sqlx::query_as::<_, Equivalence>(
            "UPDATE equivalences SET input_value = COALESCE($1, input_value), output_value = COALESCE($2, output_value), description = COALESCE($3, description) WHERE id = $4 RETURNING *",
        )
        .bind(input_value)
        .bind(output_value)
        .bind(description)
        .bind(id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| RepoError::NotFound(format!("Equivalence {} not found", id)))?;
        Ok(row)
    }

    /// Idempotent insert — does nothing if an equivalence with the same input_value exists.
    pub async fn try_create(
        &self,
        input_value: &str,
        output_value: &str,
        description: Option<&str>,
    ) -> Result<(), RepoError> {
        sqlx::query(
            r#"
            INSERT INTO equivalences (input_value, output_value, description)
            SELECT $1, $2, $3
            WHERE NOT EXISTS (SELECT 1 FROM equivalences WHERE input_value = $1)
            "#,
        )
        .bind(input_value)
        .bind(output_value)
        .bind(description)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete(&self, id: i64) -> Result<(), RepoError> {
        let result = sqlx::query("DELETE FROM equivalences WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(RepoError::NotFound(format!("Equivalence {} not found", id)));
        }
        Ok(())
    }
}
