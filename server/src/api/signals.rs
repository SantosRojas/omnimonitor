//! Signals API: CRUD with value mappings and soft-delete audit.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::api::AppState;
use crate::infrastructure::postgres::RepoError;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/signals", get(list_signals))
        .route("/signals", post(create_signal))
        .route("/signals/:id", put(update_signal))
        .route("/signals/:id", delete(delete_signal))
        .route("/signals/:id/mappings", post(add_mapping))
        .route("/signals/:id/mappings/:mapping_id", delete(delete_mapping))
        .with_state(state)
}

#[derive(Debug, Deserialize)]
pub struct CreateSignalRequest {
    pub internal_name: String,
    pub display_name: Option<String>,
    pub unit: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSignalRequest {
    pub display_name: Option<String>,
    pub unit: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddMappingRequest {
    pub numeric_value: Option<String>,
    pub display_name: Option<String>,
}

/// GET /signals — list with value_mappings.
async fn list_signals(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let signals = state.signal_repo.list().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    let mut result = Vec::new();
    for signal in &signals {
        let mappings = state.signal_repo.list_mappings(signal.id).await.map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;
        result.push(json!({
            "signal": signal,
            "value_mappings": mappings,
        }));
    }

    Ok(Json(json!(result)))
}

/// POST /signals
async fn create_signal(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSignalRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let signal = state
        .signal_repo
        .create(&req.internal_name, req.display_name.as_deref(), req.unit.as_deref())
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    Ok((StatusCode::CREATED, Json(json!(signal))))
}

/// PUT /signals/:id
async fn update_signal(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateSignalRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let signal = state
        .signal_repo
        .update(id, req.display_name.as_deref(), req.unit.as_deref())
        .await
        .map_err(|e| match e {
            RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
            other => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": other.to_string()})),
            ),
        })?;

    Ok(Json(json!(signal)))
}

/// DELETE /signals/:id — soft-delete with audit.
async fn delete_signal(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let user_id = 0i64; // placeholder — will use auth context when middleware is wired

    state
        .signal_repo
        .soft_delete(id, user_id)
        .await
        .map_err(|e| match e {
            RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
            other => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": other.to_string()})),
            ),
        })?;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /signals/:id/mappings
async fn add_mapping(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<AddMappingRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let mapping = state
        .signal_repo
        .add_mapping(id, req.numeric_value.as_deref(), req.display_name.as_deref())
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    Ok((StatusCode::CREATED, Json(json!(mapping))))
}

/// DELETE /signals/:id/mappings/:mapping_id — soft-delete mapping.
async fn delete_mapping(
    State(state): State<Arc<AppState>>,
    Path((_signal_id, mapping_id)): Path<(i64, i64)>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let user_id = 0i64; // placeholder

    state
        .signal_repo
        .delete_mapping(mapping_id, user_id)
        .await
        .map_err(|e| match e {
            RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
            other => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": other.to_string()})),
            ),
        })?;

    Ok(StatusCode::NO_CONTENT)
}
