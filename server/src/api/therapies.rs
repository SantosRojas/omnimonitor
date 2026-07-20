//! Therapies API: CRUD with filters and TherapySetup integration.

pub mod detail;

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, put},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;

use crate::api::AppState;
use crate::infrastructure::postgres::RepoError;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/therapies", get(list_therapies))
        .route("/therapies", post(create_therapy))
        .route("/therapies/:id", get(get_therapy))
        .route("/therapies/:id", put(update_therapy_status))
        .route("/therapies/:id/metadata", put(update_therapy_metadata))
        .with_state(state)
}

#[derive(Debug, Deserialize)]
pub struct ListTherapiesParams {
    pub patient_id: Option<i64>,
    pub machine_id: Option<i64>,
    pub status: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTherapyRequest {
    pub patient_id: i64,
    pub machine_id: i64,
    pub therapy_type: Option<String>,
    pub kit: Option<String>,
    pub weight: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateStatusRequest {
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMetadataRequest {
    pub therapy_type: Option<String>,
    pub kit: Option<String>,
    pub weight: Option<f64>,
}

/// GET /therapies
async fn list_therapies(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListTherapiesParams>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let date_from = params
        .date_from
        .as_ref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc));

    let date_to = params
        .date_to
        .as_ref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc));

    let therapies = state
        .therapy_repo
        .list(
            params.patient_id,
            params.machine_id,
            params.status.as_deref(),
            date_from,
            date_to,
        )
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    Ok(Json(json!(therapies)))
}

/// POST /therapies
async fn create_therapy(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateTherapyRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let therapy = state
        .therapy_repo
        .create(
            req.patient_id,
            req.machine_id,
            req.therapy_type.as_deref(),
            req.kit.as_deref(),
            req.weight,
        )
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    Ok((StatusCode::CREATED, Json(json!(therapy))))
}

/// GET /therapies/:id
async fn get_therapy(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let therapy = state
        .therapy_repo
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
                Json(json!({"error": format!("Therapy {} not found", id)})),
            )
        })?;

    Ok(Json(json!(therapy)))
}

/// PUT /therapies/:id
async fn update_therapy_status(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateStatusRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let valid = ["active", "completed", "cancelled"];
    if !valid.contains(&req.status.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": format!("Invalid status. Must be one of: {:?}", valid)})),
        ));
    }

    let therapy = state
        .therapy_repo
        .update_status(id, &req.status)
        .await
        .map_err(|e| match e {
            RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
            other => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": other.to_string()})),
            ),
        })?;

    Ok(Json(json!(therapy)))
}

/// PUT /therapies/:id/metadata — update therapy_type, kit, weight.
async fn update_therapy_metadata(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateMetadataRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let therapy = state
        .therapy_repo
        .update_metadata(
            id,
            req.therapy_type.as_deref(),
            req.kit.as_deref(),
            req.weight,
        )
        .await
        .map_err(|e| match e {
            RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
            other => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": other.to_string()})),
            ),
        })?;

    Ok(Json(json!(therapy)))
}
