//! Therapy detail endpoint using DISTINCT ON.
//!
//! Single query replaces the legacy ~20 correlated subqueries in the monitor.
//! Returns: `{ signal_id: { internal_name, value, unit, display_label, recorded_at }, ... }`

use std::collections::BTreeMap;
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
        .route("/therapies/:id/detail", get(therapy_detail))
        .with_state(state)
}

/// GET /therapies/:id/detail
async fn therapy_detail(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let readings = state
        .readings_repo
        .therapy_detail(id)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    // Pivot into BTreeMap: signal_id → { fields... }
    let mut pivoted = BTreeMap::new();
    for r in readings {
        pivoted.insert(
            r.signal_id,
            json!({
                "internal_name": r.internal_name,
                "value": r.value,
                "unit": r.unit,
                "display_label": r.display_label,
                "recorded_at": r.recorded_at,
            }),
        );
    }

    Ok(Json(json!(pivoted)))
}
