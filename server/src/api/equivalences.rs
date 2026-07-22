//! Equivalences API: standalone input→output value mapping CRUD.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::api::AppState;
use crate::infrastructure::postgres::RepoError;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/equivalences", get(list_equivalences))
        .route("/equivalences", post(create_equivalence))
        .route("/equivalences/:id", patch(update_equivalence))
        .route("/equivalences/:id", delete(delete_equivalence))
        .with_state(state)
}

#[derive(Debug, Deserialize)]
pub struct CreateEquivalenceRequest {
    pub input_value: String,
    pub output_value: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEquivalenceRequest {
    pub input_value: Option<String>,
    pub output_value: Option<String>,
    pub description: Option<String>,
}

async fn list_equivalences(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let equivalences = state.equivalence_repo.list().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;
    Ok(Json(json!(equivalences)))
}

async fn create_equivalence(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateEquivalenceRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let eq = state
        .equivalence_repo
        .create(&req.input_value, &req.output_value, req.description.as_deref())
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;
    Ok((StatusCode::CREATED, Json(json!(eq))))
}

async fn update_equivalence(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateEquivalenceRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let eq = state
        .equivalence_repo
        .update(
            id,
            req.input_value.as_deref(),
            req.output_value.as_deref(),
            req.description.as_deref(),
        )
        .await
        .map_err(|e| match e {
            RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
            other => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": other.to_string()})),
            ),
        })?;
    Ok(Json(json!(eq)))
}

async fn delete_equivalence(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    state
        .equivalence_repo
        .delete(id)
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
