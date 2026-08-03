//! Cylinder configs API: read/update/reset the shared gauge scale limits.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, put},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::api::AppState;

/// Known pressure types for the cylinder gauge scale.
const PRESSURE_TYPES: [&str; 5] = ["arterial", "venous", "tmp", "filter", "effluent"];

#[derive(Debug, Deserialize)]
pub struct UpdateCylinderConfigRequest {
    pub min_value: f64,
    pub max_value: f64,
    pub step_value: f64,
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/cylinder-configs", get(list_configs))
        .route("/cylinder-configs/reset", post(reset_configs))
        .route("/cylinder-configs/:pressure_type", put(update_config))
        .with_state(state)
}

/// GET /cylinder-configs — list all cylinder configs.
async fn list_configs(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let configs = state.cylinder_config_repo.list().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!(configs)))
}

/// PUT /cylinder-configs/:pressure_type — upsert one pressure-type config.
async fn update_config(
    State(state): State<Arc<AppState>>,
    Path(pressure_type): Path<String>,
    Json(req): Json<UpdateCylinderConfigRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    if !PRESSURE_TYPES.contains(&pressure_type.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": format!("Unknown pressure type '{}'", pressure_type)})),
        ));
    }

    let config = state
        .cylinder_config_repo
        .upsert(
            &pressure_type,
            req.min_value,
            req.max_value,
            req.step_value,
        )
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    Ok(Json(json!(config)))
}

/// POST /cylinder-configs/reset — restore all configs to their defaults.
async fn reset_configs(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let rows = state.cylinder_config_repo.reset().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!({ "rows": rows })))
}
