//! PostgreSQL repository for cylinder/gauge pressure-limit configurations.

use sqlx::PgPool;

use super::RepoError;
use crate::domain::entities::CylinderConfig;

/// Default scale limits for the five pressure types.
///
/// Must stay in sync with `migrations/20250101000009_cylinder_configs.sql`.
const DEFAULT_CONFIGS: [(&str, f64, f64, f64); 5] = [
    ("arterial", -400.0, 500.0, 100.0),
    ("venous", -400.0, 300.0, 100.0),
    ("tmp", 0.0, 80.0, 20.0),
    ("filter", 0.0, 500.0, 100.0),
    ("effluent", 0.0, 500.0, 100.0),
];

/// Repository for cylinder scale configuration CRUD.
#[derive(Debug, Clone)]
pub struct CylinderConfigRepo {
    pool: PgPool,
}

impl CylinderConfigRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// List all cylinder configs ordered by pressure type.
    pub async fn list(&self) -> Result<Vec<CylinderConfig>, RepoError> {
        let rows = sqlx::query_as::<_, CylinderConfig>(
            "SELECT * FROM cylinder_configs ORDER BY pressure_type",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Insert or update a single pressure-type config.
    pub async fn upsert(
        &self,
        pressure_type: &str,
        min_value: f64,
        max_value: f64,
        step_value: f64,
    ) -> Result<CylinderConfig, RepoError> {
        let row = sqlx::query_as::<_, CylinderConfig>(
            r#"
            INSERT INTO cylinder_configs (pressure_type, min_value, max_value, step_value)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (pressure_type) DO UPDATE SET
                min_value = $2,
                max_value = $3,
                step_value = $4,
                updated_at = NOW()
            RETURNING *
            "#,
        )
        .bind(pressure_type)
        .bind(min_value)
        .bind(max_value)
        .bind(step_value)
        .fetch_one(&self.pool)
        .await?;

        Ok(row)
    }

    /// Reset all five pressure types back to their default scale limits.
    ///
    /// Returns the number of rows updated (5 on success).
    pub async fn reset(&self) -> Result<u64, RepoError> {
        let mut affected = 0u64;
        for (pressure_type, min_value, max_value, step_value) in DEFAULT_CONFIGS {
            let result = sqlx::query(
                r#"
                UPDATE cylinder_configs SET
                    min_value = $2,
                    max_value = $3,
                    step_value = $4,
                    updated_at = NOW()
                WHERE pressure_type = $1
                "#,
            )
            .bind(pressure_type)
            .bind(min_value)
            .bind(max_value)
            .bind(step_value)
            .execute(&self.pool)
            .await?;
            affected += result.rows_affected();
        }

        Ok(affected)
    }
}
