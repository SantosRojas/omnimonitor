//! Export API: CSV and JSON data export.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{StatusCode, header},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::api::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/export/therapies", get(export_therapies))
        .route("/export/readings", get(export_readings))
        .with_state(state)
}

#[derive(Debug, Deserialize)]
pub struct ExportTherapiesParams {
    pub format: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ExportReadingsParams {
    pub therapy_id: i64,
    pub format: Option<String>,
}

/// GET /export/therapies?format=csv
async fn export_therapies(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ExportTherapiesParams>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let therapies = state
        .therapy_repo
        .list(None, None, None, None, None)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    let fmt = params.format.as_deref().unwrap_or("csv");

    match fmt {
        "json" => Ok(Json(json!(therapies)).into_response()),
        _ => {
            let mut csv =
                String::from("id,patient_id,machine_id,started_at,ended_at,status,therapy_type,kit,weight,created_at\n");
            for t in &therapies {
                csv.push_str(&format!(
                    "{},{},{},{:?},{:?},{},{:?},{:?},{:?},{}\n",
                    t.id,
                    t.patient_id,
                    t.machine_id,
                    t.started_at,
                    t.ended_at,
                    t.status.as_deref().unwrap_or(""),
                    t.therapy_type,
                    t.kit,
                    t.weight,
                    t.created_at,
                ));
            }
            Ok((
                [(header::CONTENT_TYPE, "text/csv; charset=utf-8")],
                csv,
            )
                .into_response())
        }
    }
}

/// GET /export/readings?therapy_id=X&format=csv|json
async fn export_readings(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ExportReadingsParams>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let readings = state
        .readings_repo
        .query_by_therapy(params.therapy_id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    let fmt = params.format.as_deref().unwrap_or("csv");

    match fmt {
        "json" => Ok(Json(json!(readings)).into_response()),
        _ => {
            let mut csv = String::from(
                "id,machine_id,therapy_id,signal_id,recorded_at,raw_value,value,unit,display_label,phase,created_at\n",
            );
            for r in &readings {
                csv.push_str(&format!(
                    "{},{},{:?},{:?},{:?},{:?},{:?},{:?},{:?},{:?},{}\n",
                    r.id,
                    r.machine_id,
                    r.therapy_id,
                    r.signal_id,
                    r.recorded_at,
                    r.raw_value,
                    r.value,
                    r.unit,
                    r.display_label,
                    r.phase,
                    r.created_at,
                ));
            }
            Ok((
                [(header::CONTENT_TYPE, "text/csv; charset=utf-8")],
                csv,
            )
                .into_response())
        }
    }
}
