//! Export API: CSV and JSON data export.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{StatusCode, header},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;

use crate::api::AppState;
use crate::domain::entities::Reading;

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
///
/// Export readings for a therapy session. Internamente resuelve la terapia
/// para obtener machine_id y ventana de tiempo, luego consulta por ese rango.
async fn export_readings(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ExportReadingsParams>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let therapy = state.therapy_repo.find_by_id(params.therapy_id).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()})))
    })?
    .ok_or_else(|| (StatusCode::NOT_FOUND, Json(json!({"error": "Therapy not found"}))))?;

    let since = therapy.started_at.unwrap_or(therapy.created_at);
    let until = therapy.ended_at.unwrap_or_else(Utc::now);

    let readings = state
        .readings_repo
        .query_by_machine_since(therapy.machine_id, since, None)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    // Filter to records within the therapy window
    let readings: Vec<Reading> = readings.into_iter()
        .filter(|r| r.recorded_at.is_some_and(|t| t <= until))
        .collect();

    let fmt = params.format.as_deref().unwrap_or("csv");

    match fmt {
        "json" => Ok(Json(json!(readings)).into_response()),
        _ => {
            let mut csv = String::from(
                "id,machine_id,signal_id,recorded_at,raw_value,value,unit,created_at\n",
            );
            for r in &readings {
                csv.push_str(&format!(
                    "{},{},{},{},{},{},{},{}\n",
                    r.id,
                    r.machine_id,
                    r.signal_id.map_or("".into(), |v: i64| v.to_string()),
                    r.recorded_at.map_or("".into(), |v: DateTime<Utc>| v.to_rfc3339()),
                    r.raw_value.map_or("".into(), |v: i64| v.to_string()),
                    r.value.map_or("".into(), |v: f64| v.to_string()),
                    r.unit.as_deref().unwrap_or(""),
                    r.created_at.to_rfc3339(),
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
