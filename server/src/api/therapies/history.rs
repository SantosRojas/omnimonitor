//! Therapy history and comments endpoints.
//!
//! Public (auth-protected, not admin-only) endpoints for viewing
//! historical readings and managing therapy notes.
//!
//! Compare: old pdms-omni had these under `/api/therapy-history` and
//! `/api/therapies/:id/comments`. Here they live at the same paths
//! but without the admin-role gate.

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Extension, Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::api::auth::Claims;
use crate::api::AppState;

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub content: String,
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/therapies/:id/history", get(therapy_history))
        .route("/therapies/:id/comments", get(list_comments))
        .route("/therapies/:id/comments", post(create_comment))
        .route("/therapies/comments/:comment_id", delete(delete_comment))
        .with_state(state)
}

// ── History ──────────────────────────────────────────────────

/// A single reading row for the history view — includes signal
/// metadata from the signals table so the frontend can chart by
/// internal_name without a second lookup.
#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct HistoryReadingRow {
    pub id: i64,
    pub machine_id: i64,
    pub therapy_id: Option<i64>,
    pub signal_id: Option<i64>,
    pub recorded_at: Option<chrono::DateTime<chrono::Utc>>,
    pub raw_value: Option<i64>,
    pub value: Option<f64>,
    pub unit: Option<String>,
    pub display_label: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// Resolved via LEFT JOIN signals
    pub internal_name: Option<String>,
}

/// GET /therapies/:id/history
///
/// Returns all readings for a therapy with signal names, ordered by recorded_at DESC.
/// Optional `?limit=N` (default 1000, max 10000).
async fn therapy_history(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Query(query): Query<HistoryQuery>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let limit = query.limit.unwrap_or(1000).min(10000);

    let rows = sqlx::query_as::<_, HistoryReadingRow>(
        r#"SELECT r.id, r.machine_id, r.therapy_id, r.signal_id,
                  r.recorded_at, r.raw_value, r.value, r.unit,
                  r.display_label, r.created_at,
                  s.internal_name
           FROM readings r
           LEFT JOIN signals s ON s.id = r.signal_id
           WHERE r.therapy_id = $1
           ORDER BY r.recorded_at DESC
           LIMIT $2"#,
    )
    .bind(id)
    .bind(limit)
    .fetch_all(&state.read_pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!(rows)))
}

// ── Comments ────────────────────────────────────────────────

/// Joined comment row with resolved username.
#[derive(sqlx::FromRow, serde::Serialize)]
pub struct CommentRow {
    pub id: i64,
    pub therapy_id: i64,
    pub user_id: i64,
    pub username: String,
    pub content: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// GET /therapies/:id/comments
///
/// Returns notes for a therapy, ordered by most recent first.
/// Includes the username from the users table.
async fn list_comments(
    State(state): State<Arc<AppState>>,
    Path(therapy_id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let rows = sqlx::query_as::<_, CommentRow>(
        r#"SELECT n.id, n.therapy_id, n.user_id, u.username, n.content, n.created_at
           FROM therapy_notes n
           JOIN users u ON u.id = n.user_id
           WHERE n.therapy_id = $1
           ORDER BY n.created_at DESC"#,
    )
    .bind(therapy_id)
    .fetch_all(&state.db_pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok(Json(json!(rows)))
}

/// POST /therapies/:id/comments
///
/// Create a new note on a therapy. Requires JWT auth (user must be logged in).
async fn create_comment(
    Extension(claims): Extension<Claims>,
    State(state): State<Arc<AppState>>,
    Path(therapy_id): Path<i64>,
    Json(req): Json<CreateCommentRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    if req.content.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Comment content cannot be empty"})),
        ));
    }

    let row = sqlx::query_as::<_, crate::domain::entities::TherapyNote>(
        "INSERT INTO therapy_notes (therapy_id, user_id, content) VALUES ($1, $2, $3) RETURNING *",
    )
    .bind(therapy_id)
    .bind(claims.sub)
    .bind(req.content.trim())
    .fetch_one(&state.db_pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    Ok((StatusCode::CREATED, Json(json!(row))))
}

/// DELETE /therapies/comments/:comment_id
///
/// Delete a therapy note. Anyone authenticated can delete (the frontend
/// only enables this for admins, but the endpoint is open to auth users).
async fn delete_comment(
    State(state): State<Arc<AppState>>,
    Path(comment_id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let result = sqlx::query("DELETE FROM therapy_notes WHERE id = $1")
        .bind(comment_id)
        .execute(&state.db_pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": format!("Comment {} not found", comment_id)})),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}
