//! Server-side domain entities with sqlx + serde support.
//!
//! All entities are persisted exclusively via PostgreSQL (sqlx::FromRow)
//! and serialized for API responses (serde::Serialize).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Bridge (RPi) registered by IP for WebSocket authentication.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Bridge {
    pub id: i64,
    pub ip_address: String,
    pub label: Option<String>,
    pub authorized: bool,
    pub status: String,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: Option<DateTime<Utc>>,
}

/// Registered OMNI machine. Auto-created on bridge connect.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Machine {
    pub id: i64,
    pub serial_number: String,
    pub software_version: Option<String>,
    pub ip_address: Option<String>,
    pub port: Option<i32>,
    pub label: Option<String>,
    pub status: Option<String>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Patient record linked to therapies.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Patient {
    pub id: i64,
    pub external_id: String,
    pub name: Option<String>,
    pub age: Option<i32>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: Option<DateTime<Utc>>,
}

/// Therapy session linking a patient to a machine.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Therapy {
    pub id: i64,
    pub patient_id: i64,
    pub machine_id: i64,
    pub started_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
    pub status: Option<String>,
    pub therapy_type: Option<String>,
    pub kit: Option<String>,
    pub weight: Option<f64>,
    pub end_weight: Option<f64>,
    pub created_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub deleted_by: Option<i64>,
    pub delete_reason: Option<String>,
}

/// Therapy row enriched for list responses with the patient's external identifier.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TherapyListItem {
    pub id: i64,
    pub patient_id: i64,
    pub machine_id: i64,
    pub started_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
    pub status: Option<String>,
    pub therapy_type: Option<String>,
    pub kit: Option<String>,
    pub weight: Option<f64>,
    pub end_weight: Option<f64>,
    pub created_at: DateTime<Utc>,
    pub patient_external_id: Option<String>,
    pub patient_name: Option<String>,
    pub patient_age: Option<i32>,
}

/// Cylinder/gauge scale configuration for a pressure type.
///
/// min/max/step define the graduated cylinder scale used in the SCADA view.
/// Shared across all web clients via `cylinder_configs` in PostgreSQL.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CylinderConfig {
    pub pressure_type: String,
    pub min_value: f64,
    pub max_value: f64,
    pub step_value: f64,
    pub updated_at: DateTime<Utc>,
}

/// OMNI signal catalog entry.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Signal {
    pub id: i64,
    pub internal_name: String,
    pub display_name: Option<String>,
    pub unit: Option<String>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub deleted_by: Option<i64>,
}

/// Authenticated user.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub password_hash: String,
    pub email: Option<String>,
    pub role: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Known software version (firmware/hardware combination) with cached attributes.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SoftwareVersion {
    pub id: i64,
    pub fingerprint: String,
    pub language_id: Option<i32>,
    pub system_sw: Option<String>,
    pub dss_fw: Option<String>,
    pub dss_hw: Option<String>,
    pub css_fw: Option<String>,
    pub css_hw: Option<String>,
    pub pss_fw: Option<String>,
    pub pss_hw: Option<String>,
    pub language1: Option<String>,
    pub language2: Option<String>,
    pub language3: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Standalone input-to-output value equivalence mapping.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Equivalence {
    pub id: i64,
    pub input_value: String,
    pub output_value: String,
    pub created_at: DateTime<Utc>,
}

/// Maps a numeric value to a human-readable display name for a signal.
/// `numeric_value` is stored as DECIMAL in PostgreSQL and mapped via String
/// to avoid pulling in `rust_decimal` or `bigdecimal` dependencies.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ValueMapping {
    pub id: i64,
    pub signal_id: i64,
    pub numeric_value: Option<String>,
    pub display_name: Option<String>,
}

/// Nurse/operator note attached to a therapy session.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TherapyNote {
    pub id: i64,
    pub therapy_id: i64,
    pub user_id: i64,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

/// A single telemetry reading persisted from bridge data.
/// Solo se persisten readings durante terapia activa.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Reading {
    pub id: i64,
    pub machine_id: i64,
    pub therapy_id: Option<i64>,
    pub signal_id: Option<i64>,
    pub recorded_at: Option<DateTime<Utc>>,
    pub raw_value: Option<i64>,
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub created_at: DateTime<Utc>,
}
