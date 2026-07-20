//! Dashboards API: aggregate endpoints for real-time monitoring.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
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

/// GET /dashboards/therapy/:id/timeseries — readings ordered by timestamp.
async fn therapy_timeseries(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let points = state.readings_repo.therapy_timeseries(id).await.map_err(|e| {
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
