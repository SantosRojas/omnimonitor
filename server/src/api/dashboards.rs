//! Dashboards API: aggregate endpoints for real-time monitoring.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::Utc;
use serde_json::json;

use crate::api::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/dashboards/machine/:id/summary", get(machine_summary))
        .route("/dashboards/therapy/:id/aggregates", get(therapy_aggregates))
        .route("/dashboards/therapy/:id/timeseries", get(therapy_timeseries))
        .route("/dashboards/patient/:id/history", get(patient_history))
        .with_state(state)
}

/// GET /dashboards/machine/:id/summary — latest reading per signal (DISTINCT ON).
async fn machine_summary(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let summary = state.readings_repo.machine_summary(id).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!(summary)))
}

/// GET /dashboards/therapy/:id/aggregates — AVG, MIN, MAX, COUNT per signal.
async fn therapy_aggregates(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let aggregates = state.readings_repo.therapy_aggregates(id).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!(aggregates)))
}

/// GET /dashboards/therapy/:id/timeseries — bucketed/downsampled readings.
///
/// Calcula el tamaño del bucket automáticamente según la duración de la terapia:
///   bucket = max(duración / 500, persistence_interval)
/// Esto asegura ~500 puntos por señal como máximo, protegiendo al servidor de OOM.
/// Incluye AVG, MIN, MAX por bucket para graficar tendencia con rango.
async fn therapy_timeseries(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    // Obtener la terapia para calcular duración
    let therapy = state.therapy_repo.find_by_id(id).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;
    let therapy = therapy.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Therapy not found"})),
        )
    })?;

    // Duración en segundos
    let end = therapy.ended_at.unwrap_or_else(Utc::now);
    let duration_secs = (end - therapy.started_at.unwrap_or(end))
        .num_seconds()
        .unsigned_abs()
        .max(1); // evitar división por cero

    // Tamaño del bucket: apuntamos a ~500 puntos por señal
    let target_points: u64 = 500;
    let bucket_secs = (duration_secs / target_points)
        .max(state.ws_hub.persistence_interval_secs())
        .max(1); // piso 1 segundo

    // Convertir a string PostgreSQL: "10 seconds", "5 minutes", "1 hour", etc.
    let bucket_interval = if bucket_secs >= 3600 {
        format!("{} hours", bucket_secs / 3600)
    } else if bucket_secs >= 60 {
        format!("{} minutes", bucket_secs / 60)
    } else {
        format!("{} seconds", bucket_secs)
    };

    let points = state
        .readings_repo
        .therapy_timeseries_bucketed(id, &bucket_interval)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    Ok(Json(json!(points)))
}

/// GET /dashboards/patient/:id/history — therapies for a patient.
async fn patient_history(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let therapies = state.therapy_repo.list_by_patient(id).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!(therapies)))
}
