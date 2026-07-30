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

/// A bucketed timeseries point with AVG/MIN/MAX for downsampled charts.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct BucketedTimeseriesPoint {
    pub signal_id: i64,
    pub internal_name: String,
    pub avg_value: Option<f64>,
    pub min_value: Option<f64>,
    pub max_value: Option<f64>,
    pub unit: Option<String>,
    pub bucket: Option<DateTime<Utc>>,
}

/// Repository for readings.
#[derive(Debug, Clone)]
pub struct ReadingsRepo {
    pool: PgPool,     // escritura (inserts)
    read_pool: PgPool, // lecturas pesadas (SELECT)
}

impl ReadingsRepo {
    pub fn new(pool: PgPool) -> Self {
        Self {
            read_pool: pool.clone(),
            pool,
        }
    }

    /// Create with separate read pool for read/write isolation.
    pub fn new_with_read_pool(pool: PgPool, read_pool: PgPool) -> Self {
        Self { pool, read_pool }
    }

    /// Insert a batch of readings using a single multi-row INSERT.
    ///
    /// Postgres executes `INSERT INTO readings (...) VALUES ($1,$2,...), ($N,$N+1,...), ...`
    /// in one round-trip instead of N individual queries.  This is 10-50× faster
    /// for typical batch sizes (50–200 readings).
    pub async fn insert_batch(&self, readings: &[Reading]) -> Result<(), RepoError> {
        if readings.is_empty() {
            return Ok(());
        }

        let mut tx = self.pool.begin().await?;

        // Build a single multi-row INSERT:  VALUES ($1,$2,...,$8), ($9,$10,...,$16), ...
        let ncols = 8usize;
        let rows: Vec<String> = (0..readings.len())
            .map(|i| {
                let base = i * ncols + 1;
                format!(
                    "(${},${},${},${},${},${},${},${})",
                    base, base + 1, base + 2, base + 3, base + 4, base + 5, base + 6, base + 7,
                )
            })
            .collect();

        let sql = format!(
            "INSERT INTO readings (machine_id, therapy_id, signal_id, recorded_at, raw_value, value, unit, display_label) VALUES {}",
            rows.join(","),
        );

        let mut q = sqlx::query(&sql);
        for r in readings {
            q = q
                .bind(r.machine_id)
                .bind(r.therapy_id)
                .bind(r.signal_id)
                .bind(r.recorded_at)
                .bind(r.raw_value)
                .bind(r.value)
                .bind(&r.unit)
                .bind(&r.display_label);
        }

        q.execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Query readings for a therapy, ordered by recorded_at.
    pub async fn query_by_therapy(
        &self,
        therapy_id: i64,
        limit: Option<i64>,
    ) -> Result<Vec<Reading>, RepoError> {
        let limit = limit.unwrap_or(100);

        let rows = sqlx::query_as::<_, Reading>(
            "SELECT * FROM readings WHERE therapy_id = $1 ORDER BY recorded_at DESC LIMIT $2",
        )
        .bind(therapy_id)
        .bind(limit)
        .fetch_all(&self.read_pool)
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
        .fetch_all(&self.read_pool)
        .await?;

        Ok(rows)
    }

    /// Get the latest reading for each signal for a machine within a time window using DISTINCT ON.
    pub async fn machine_detail_in_window(
        &self,
        machine_id: i64,
        since: DateTime<Utc>,
        until: DateTime<Utc>,
    ) -> Result<Vec<TherapyDetailReading>, RepoError> {
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
              AND r.recorded_at >= $2
              AND r.recorded_at <= $3
            ORDER BY r.signal_id, r.recorded_at DESC
            "#,
        )
        .bind(machine_id)
        .bind(since)
        .bind(until)
        .fetch_all(&self.read_pool)
        .await?;

        Ok(rows)
    }

    /// Get aggregate statistics per signal for a machine within a time window.
    pub async fn aggregates_in_window(
        &self,
        machine_id: i64,
        since: DateTime<Utc>,
        until: DateTime<Utc>,
    ) -> Result<Vec<SignalAggregate>, RepoError> {
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
            WHERE r.machine_id = $1
              AND r.recorded_at >= $2
              AND r.recorded_at <= $3
              AND r.value IS NOT NULL
            GROUP BY r.signal_id, s.internal_name
            ORDER BY s.internal_name
            "#,
        )
        .bind(machine_id)
        .bind(since)
        .bind(until)
        .fetch_all(&self.read_pool)
        .await?;

        Ok(rows)
    }

    /// Get timeseries data for a machine within a time window.
    pub async fn timeseries_in_window(
        &self,
        machine_id: i64,
        since: DateTime<Utc>,
        until: DateTime<Utc>,
    ) -> Result<Vec<TimeseriesPoint>, RepoError> {
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
            WHERE r.machine_id = $1
              AND r.recorded_at >= $2
              AND r.recorded_at <= $3
              AND r.value IS NOT NULL
            ORDER BY r.recorded_at ASC, r.signal_id
            "#,
        )
        .bind(machine_id)
        .bind(since)
        .bind(until)
        .fetch_all(&self.read_pool)
        .await?;

        Ok(rows)
    }

    /// Get bucketed/downsampled timeseries for a machine within a time window.
    ///
    /// `bucket_interval` is a PostgreSQL interval string (e.g. `'10 minutes'`, `'1 hour'`).
    /// Returns AVG, MIN, MAX per bucket per signal — safe for unbounded durations.
    pub async fn bucketed_in_window(
        &self,
        machine_id: i64,
        since: DateTime<Utc>,
        until: DateTime<Utc>,
        bucket_interval: &str,
    ) -> Result<Vec<BucketedTimeseriesPoint>, RepoError> {
        let sql = format!(
            r#"
            SELECT
                r.signal_id,
                s.internal_name,
                AVG(r.value) AS avg_value,
                MIN(r.value) AS min_value,
                MAX(r.value) AS max_value,
                r.unit,
                date_trunc('{}', r.recorded_at) AS bucket
            FROM readings r
            JOIN signals s ON r.signal_id = s.id
            WHERE r.machine_id = $1
              AND r.recorded_at >= $2
              AND r.recorded_at <= $3
              AND r.value IS NOT NULL
            GROUP BY r.signal_id, s.internal_name, r.unit, bucket
            ORDER BY bucket ASC, r.signal_id
            "#,
            bucket_interval,
        );
        let rows = sqlx::query_as::<_, BucketedTimeseriesPoint>(&sql)
            .bind(machine_id)
            .bind(since)
            .bind(until)
            .fetch_all(&self.read_pool)
            .await?;

        Ok(rows)
    }

    /// Query readings for a machine recorded since the given timestamp.
    pub async fn query_by_machine_since(
        &self,
        machine_id: i64,
        since: DateTime<Utc>,
        limit: Option<i64>,
    ) -> Result<Vec<Reading>, RepoError> {
        let limit = limit.unwrap_or(1000);

        let rows = sqlx::query_as::<_, Reading>(
            r#"
            SELECT * FROM readings
            WHERE machine_id = $1 AND recorded_at >= $2
            ORDER BY recorded_at ASC
            LIMIT $3
            "#,
        )
        .bind(machine_id)
        .bind(since)
        .bind(limit)
        .fetch_all(&self.read_pool)
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
        .fetch_all(&self.read_pool)
        .await?;

        Ok(rows)
    }

    /// Get the latest reading per signal for a therapy via FK (DISTINCT ON).
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
        .fetch_all(&self.read_pool)
        .await?;

        Ok(rows)
    }

    /// Get aggregate statistics per signal for a therapy via FK.
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
            WHERE r.therapy_id = $1
              AND r.value IS NOT NULL
            GROUP BY r.signal_id, s.internal_name
            ORDER BY s.internal_name
            "#,
        )
        .bind(therapy_id)
        .fetch_all(&self.read_pool)
        .await?;

        Ok(rows)
    }

    /// Get timeseries data for a therapy via FK.
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
            WHERE r.therapy_id = $1
              AND r.value IS NOT NULL
            ORDER BY r.recorded_at ASC, r.signal_id
            "#,
        )
        .bind(therapy_id)
        .fetch_all(&self.read_pool)
        .await?;

        Ok(rows)
    }

    /// Get bucketed/downsampled timeseries for a therapy via FK.
    pub async fn therapy_timeseries_bucketed(
        &self,
        therapy_id: i64,
        bucket_interval: &str,
    ) -> Result<Vec<BucketedTimeseriesPoint>, RepoError> {
        let sql = format!(
            r#"
            SELECT
                r.signal_id,
                s.internal_name,
                AVG(r.value) AS avg_value,
                MIN(r.value) AS min_value,
                MAX(r.value) AS max_value,
                r.unit,
                date_trunc('{}', r.recorded_at) AS bucket
            FROM readings r
            JOIN signals s ON r.signal_id = s.id
            WHERE r.therapy_id = $1
              AND r.value IS NOT NULL
            GROUP BY r.signal_id, s.internal_name, r.unit, bucket
            ORDER BY bucket ASC, r.signal_id
            "#,
            bucket_interval,
        );
        let rows = sqlx::query_as::<_, BucketedTimeseriesPoint>(&sql)
            .bind(therapy_id)
            .fetch_all(&self.read_pool)
            .await?;

        Ok(rows)
    }
}
