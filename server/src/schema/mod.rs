//! SQL migration strings embedded at compile time.
//!
//! Each migration is a `&str` constant. The server applies them in order
//! at startup via `sqlx::migrate!` or a custom runner.

/// Migration 001: initial schema — all base tables, constraints, and indexes.
pub const MIGRATION_001: &str = include_str!("001_initial.sql");

/// Ordered list of all migrations.
pub const ALL_MIGRATIONS: &[&str] = &[MIGRATION_001];
