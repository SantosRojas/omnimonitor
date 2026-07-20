//! Machines API: list, detail, update, soft-delete.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, put},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::api::AppState;
use crate::infrastructure::postgres::RepoError;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/machines", get(list_machines))
        .route("/machines/:id", get(get_machine))
        .route("/machines/:id", put(update_machine))
        .route("/machines/:id", delete(delete_machine))
        .with_state(state)
}

#[derive(Debug, Deserialize)]
pub struct UpdateMachineRequest {
    pub label: Option<String>,
    pub ip_address: Option<String>,
    pub port: Option<i32>,
}

/// GET /machines
async fn list_machines(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let machines = state.machine_repo.list().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!(machines)))
}

/// GET /machines/:id
async fn get_machine(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let machine = state
        .machine_repo
        .find_by_id(id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"error": format!("Machine {} not found", id)})),
            )
        })?;

    Ok(Json(json!(machine)))
}

/// PUT /machines/:id
async fn update_machine(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateMachineRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let machine = state
        .machine_repo
        .update(id, req.label.as_deref(), req.ip_address.as_deref(), req.port)
        .await
        .map_err(|e| match e {
            RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
            other => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": other.to_string()})),
            ),
        })?;

    Ok(Json(json!(machine)))
}

/// DELETE /machines/:id
async fn delete_machine(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    state.machine_repo.soft_delete(id).await.map_err(|e| match e {
        RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
        other => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": other.to_string()})),
        ),
    })?;

    Ok(StatusCode::NO_CONTENT)
}
