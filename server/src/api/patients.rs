//! Patients API: CRUD with unique external_id and optional patient info.

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, put},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::api::AppState;
use crate::infrastructure::postgres::RepoError;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/patients", get(list_patients))
        .route("/patients", post(create_patient))
        .route("/patients/search", get(search_patients))
        .route("/patients/:id", get(get_patient))
        .route("/patients/:id", put(update_patient))
        .with_state(state)
}

#[derive(Debug, Deserialize)]
pub struct ListPatientsParams {
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePatientRequest {
    pub external_id: String,
    pub name: Option<String>,
    pub age: Option<i32>,
    pub email: Option<String>,
    pub address: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePatientRequest {
    pub external_id: Option<String>,
    pub name: Option<String>,
    pub age: Option<i32>,
    pub email: Option<String>,
    pub address: Option<String>,
}

/// GET /patients
async fn list_patients(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListPatientsParams>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let patients = state
        .patient_repo
        .list(params.search.as_deref())
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    Ok(Json(json!(patients)))
}

/// POST /patients
async fn create_patient(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreatePatientRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let patient = state
        .patient_repo
        .create(
            &req.external_id,
            req.name.as_deref(),
            req.age,
            req.email.as_deref(),
            req.address.as_deref(),
        )
        .await
        .map_err(|e| match e {
            RepoError::Conflict(msg) => (StatusCode::CONFLICT, Json(json!({"error": msg}))),
            other => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": other.to_string()})),
            ),
        })?;

    Ok((StatusCode::CREATED, Json(json!(patient))))
}

/// GET /patients/search?q=term
async fn search_patients(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListPatientsParams>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let search = params.search.as_deref().unwrap_or("");
    let patients = state
        .patient_repo
        .list(Some(search))
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    Ok(Json(json!(patients)))
}

/// GET /patients/:id — includes therapy count.
async fn get_patient(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let patient = state
        .patient_repo
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
                Json(json!({"error": format!("Patient {} not found", id)})),
            )
        })?;

    let therapy_count = state.patient_repo.therapy_count(id).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!({
        "patient": patient,
        "therapy_count": therapy_count,
    })))
}

/// PUT /patients/:id
async fn update_patient(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdatePatientRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let patient = state
        .patient_repo
        .update(
            id,
            req.external_id.as_deref(),
            req.name.as_deref(),
            req.age,
            req.email.as_deref(),
            req.address.as_deref(),
        )
        .await
        .map_err(|e| match e {
            RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
            RepoError::Conflict(msg) => (StatusCode::CONFLICT, Json(json!({"error": msg}))),
            other => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": other.to_string()})),
            ),
        })?;

    Ok(Json(json!(patient)))
}
