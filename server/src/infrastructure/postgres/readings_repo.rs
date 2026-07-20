//! PostgreSQL repository for telemetry readings.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

use super::RepoError;
use crate::domain::entities::Reading;

/// A single latest reading per signal for therapy detail (DISTINCT ON result).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct TherapyDetailReading {
    pub signal_id: i64,
    pub internal_name: String,
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub display_label: Option<String>,
    pub recorded_at: Option<DateTime<Utc>>,
}

/// Aggregate statistics per signal for a therapy.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct SignalAggregate {
    pub signal_id: i64,
    pub internal_name: String,
    pub avg_value: Option<f64>,
    pub min_value: Option<f64>,
    pub max_value: Option<f64>,
    pub count: i64,
}

/// A single timeseries point for charting.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct TimeseriesPoint {
    pub signal_id: i64,
    pub internal_name: String,
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub recorded_at: Option<DateTime<Utc>>,
}

/// Repository for readings.
#[derive(Debug, Clone)]
pub struct ReadingsRepo {
    pool: PgPool,
}

impl ReadingsRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Insert a batch of readings in a single transaction.
    pub async fn insert_batch(&self, readings: &[Reading]) -> Result<(), RepoError> {
        if readings.is_empty() {
            return Ok(());
        }

        let mut tx = self.pool.begin().await?;

        for r in readings {
            sqlx::query(
                r#"
                INSERT INTO readings (machine_id, therapy_id, signal_id, recorded_at, raw_value, value, unit, display_label, phase)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                "#,
            )
            .bind(r.machine_id)
            .bind(r.therapy_id)
            .bind(r.signal_id)
            .bind(r.recorded_at)
            .bind(r.raw_value)
            .bind(r.value)
            .bind(&r.unit)
            .bind(&r.display_label)
            .bind(&r.phase)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /// Query readings for a therapy, ordered by recorded_at.
    pub async fn query_by_therapy(&self, therapy_id: i64) -> Result<Vec<Reading>, RepoError> {
        let rows = sqlx::query_as::<_, Reading>(
            "SELECT * FROM readings WHERE therapy_id = $1 ORDER BY recorded_at DESC",
        )
        .bind(therapy_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Query readings for a machine, ordered by recorded_at.
    pub async fn query_by_machine(
        &self,
        machine_id: i64,
        limit: Option<i64>,
    ) -> Result<Vec<Reading>, RepoError> {
        let limit = limit.unwrap_or(100);

        let rows = sqlx::query_as::<_, Reading>(
            "SELECT * FROM readings WHERE machine_id = $1 ORDER BY recorded_at DESC LIMIT $2",
        )
        .bind(machine_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Get the latest reading for each signal for a given therapy using DISTINCT ON.
    /// This is a single-query replacement for the legacy ~20 correlated subqueries.
    pub async fn therapy_detail(&self, therapy_id: i64) -> Result<Vec<TherapyDetailReading>, RepoError> {
        let rows = sqlx::query_as::<_, TherapyDetailReading>(
            r#"
            SELECT DISTINCT ON (r.signal_id)
                r.signal_id,
                s.internal_name,
                r.value,
                r.unit,
                r.display_label,
                r.recorded_at
            FROM readings r
            JOIN signals s ON r.signal_id = s.id
            WHERE r.therapy_id = $1
            ORDER BY r.signal_id, r.recorded_at DESC
            "#,
        )
        .bind(therapy_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Get aggregate statistics per signal for a therapy.
    /// Uses WHERE value IS NOT NULL — no CAST needed, value is already FLOAT.
    pub async fn therapy_aggregates(&self, therapy_id: i64) -> Result<Vec<SignalAggregate>, RepoError> {
        let rows = sqlx::query_as::<_, SignalAggregate>(
            r#"
            SELECT
                r.signal_id,
                s.internal_name,
                AVG(r.value) AS avg_value,
                MIN(r.value) AS min_value,
                MAX(r.value) AS max_value,
                COUNT(*) AS count
            FROM readings r
            JOIN signals s ON r.signal_id = s.id
            WHERE r.therapy_id = $1 AND r.value IS NOT NULL
            GROUP BY r.signal_id, s.internal_name
            ORDER BY s.internal_name
            "#,
        )
        .bind(therapy_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Get timeseries data for a therapy (all readings ordered by timestamp).
    pub async fn therapy_timeseries(&self, therapy_id: i64) -> Result<Vec<TimeseriesPoint>, RepoError> {
        let rows = sqlx::query_as::<_, TimeseriesPoint>(
            r#"
            SELECT
                r.signal_id,
                s.internal_name,
                r.value,
                r.unit,
                r.recorded_at
            FROM readings r
            JOIN signals s ON r.signal_id = s.id
            WHERE r.therapy_id = $1 AND r.value IS NOT NULL
            ORDER BY r.recorded_at ASC, r.signal_id
            "#,
        )
        .bind(therapy_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Get the latest reading for each signal for a machine (live dashboard summary).
    pub async fn machine_summary(&self, machine_id: i64) -> Result<Vec<TherapyDetailReading>, RepoError> {
        let rows = sqlx::query_as::<_, TherapyDetailReading>(
            r#"
            SELECT DISTINCT ON (r.signal_id)
                r.signal_id,
                s.internal_name,
                r.value,
                r.unit,
                r.display_label,
                r.recorded_at
            FROM readings r
            JOIN signals s ON r.signal_id = s.id
            WHERE r.machine_id = $1
            ORDER BY r.signal_id, r.recorded_at DESC
            "#,
        )
        .bind(machine_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }
}
