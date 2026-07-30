//! SQL migration strings embedded at compile time.
//!
//! Each migration is a `&str` constant. The server applies them in order
//! at startup via `sqlx::migrate!` or a custom runner.

/// Migration 001: initial schema — all base tables, constraints, and indexes.
pub const MIGRATION_001: &str = include_str!("001_initial.sql");

/// Migration 002: unique constraint on signals.internal_name.
pub const MIGRATION_002: &str = include_str!("002_unique_signal_name.sql");

/// Migration 003: remove unused description column from equivalences.
pub const MIGRATION_003: &str = include_str!("003_drop_equiv_description.sql");

/// Migration 004: create bridges table for IP-based auth.
pub const MIGRATION_004: &str = include_str!("004_bridges.sql");

/// Migration 005: performance indexes for readings queries.
pub const MIGRATION_005: &str = include_str!("005_readings_perf_indexes.sql");

/// Migration 006: drop therapy_id and phase from readings (only persist during active therapy).
pub const MIGRATION_006: &str = include_str!("006_drop_readings_therapy_phase.sql");

/// Migration 007: optional patient info fields + end weight on therapies.
pub const MIGRATION_007: &str = include_str!("007_patient_info_and_end_weight.sql");

/// Ordered list of all migrations.
pub const ALL_MIGRATIONS: &[&str] = &[
    MIGRATION_001, MIGRATION_002, MIGRATION_003, MIGRATION_004, MIGRATION_005, MIGRATION_006,
    MIGRATION_007,
];
