//! Admin API: users, equivalences, machine-ips, comments, config, tokens, export.
//! All endpoints require admin role (enforced by JWT auth middleware on the parent router).

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
    Json, Router,
};
use argon2::PasswordHasher;
use serde::Deserialize;
use serde_json::json;

use crate::api::AppState;
use crate::infrastructure::postgres::RepoError;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        // Users CRUD
        .route("/admin/users", get(list_users))
        .route("/admin/users", post(create_user))
        .route("/admin/users/:id", patch(update_user))
        .route("/admin/users/:id", delete(delete_user))
        // Equivalences CRUD
        .route("/admin/equivalences", get(list_admin_equivalences))
        .route("/admin/equivalences", post(create_admin_equivalence))
        .route("/admin/equivalences/:id", patch(update_admin_equivalence))
        .route("/admin/equivalences/:id", delete(delete_admin_equivalence))
        // Machine IPs CRUD
        .route("/admin/machine-ips", get(list_machine_ips))
        .route("/admin/machine-ips", post(create_machine_ip))
        .route("/admin/machine-ips/:id", patch(update_machine_ip))
        .route("/admin/machine-ips/:id", delete(delete_machine_ip))
        // Bridges CRUD
        .route("/admin/bridges", get(list_bridges))
        .route("/admin/bridges", post(create_bridge))
        .route("/admin/bridges/:id", patch(update_bridge))
        .route("/admin/bridges/:id", delete(delete_bridge))
        // Therapy Comments
        .route("/admin/therapies/:id/comments", get(list_comments))
        .route("/admin/therapies/:id/comments", post(create_comment))
        .route("/admin/comments/:id", delete(delete_comment))
        // Config
        .route("/admin/config", get(get_config))
        // Tokens
        .route("/admin/tokens", post(generate_token))
        // Export
        .route("/admin/export/patients/:id", get(export_patient))
        .route("/admin/export/therapies/:id", get(export_therapy))
        .with_state(state)
}

// ── DTOs ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub username: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAdminEquivalenceRequest {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAdminEquivalenceRequest {
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMachineIpRequest {
    pub machine_id: i64,
    pub ip_address: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMachineIpRequest {
    pub ip_address: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateBridgeRequest {
    pub ip_address: String,
    pub label: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBridgeRequest {
    pub label: Option<String>,
    pub authorized: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub content: String,
}

// ── Users ─────────────────────────────────────────────

/// GET /admin/users
async fn list_users(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let users = state.user_repo.list().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;
    Ok(Json(json!(users)))
}

/// POST /admin/users
async fn create_user(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateUserRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    if !["admin", "operator", "viewer"].contains(&req.role.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid role. Must be admin, operator, or viewer"})),
        ));
    }

    let salt = argon2::password_hash::SaltString::generate(
        &mut argon2::password_hash::rand_core::OsRng,
    );
    let hash = argon2::Argon2::default()
        .hash_password(req.password.as_bytes(), &salt)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Password hashing failed: {}", e)})),
            )
        })?
        .to_string();

    let user = state
        .user_repo
        .create(&req.username, &hash, &req.role)
        .await
        .map_err(|e| {
            (
                StatusCode::CONFLICT,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    Ok((StatusCode::CREATED, Json(json!(user))))
}

/// PATCH /admin/users/:id
async fn update_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateUserRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let existing = state
        .user_repo
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
                Json(json!({"error": format!("User {} not found", id)})),
            )
        })?;

    let username = req.username.unwrap_or(existing.username);
    let role = req.role.unwrap_or(existing.role.unwrap_or_else(|| "viewer".into()));

    if !["admin", "operator", "viewer"].contains(&role.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid role"})),
        ));
    }

    let user = state
        .user_repo
        .update(id, &username, &role)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    Ok(Json(json!(user)))
}

/// DELETE /admin/users/:id
async fn delete_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    state.user_repo.delete(id).await.map_err(|e| match e {
        RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
        other => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": other.to_string()})),
        ),
    })?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Equivalences ──────────────────────────────────────

/// GET /admin/equivalences — maps to {id, from, to} format
async fn list_admin_equivalences(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let eqs = state.equivalence_repo.list().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    let result: Vec<serde_json::Value> = eqs
        .iter()
        .map(|e| {
            json!({
                "id": e.id,
                "from": e.input_value,
                "to": e.output_value,
            })
        })
        .collect();

    Ok(Json(json!(result)))
}

/// POST /admin/equivalences
async fn create_admin_equivalence(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateAdminEquivalenceRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let eq = state
        .equivalence_repo
        .create(&req.from, &req.to)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    Ok((
        StatusCode::CREATED,
        Json(json!({"id": eq.id, "from": eq.input_value, "to": eq.output_value})),
    ))
}

/// PATCH /admin/equivalences/:id
async fn update_admin_equivalence(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateAdminEquivalenceRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let eq = state
        .equivalence_repo
        .update(id, req.from.as_deref(), req.to.as_deref())
        .await
        .map_err(|e| match e {
            RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
            other => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": other.to_string()})),
            ),
        })?;

    Ok(Json(json!({"id": eq.id, "from": eq.input_value, "to": eq.output_value})))
}

/// DELETE /admin/equivalences/:id
async fn delete_admin_equivalence(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    state.equivalence_repo.delete(id).await.map_err(|e| match e {
        RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
        other => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": other.to_string()})),
        ),
    })?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Machine IPs ───────────────────────────────────────

/// GET /admin/machine-ips
async fn list_machine_ips(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let machines = state.machine_repo.list().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;

    let result: Vec<serde_json::Value> = machines
        .iter()
        .map(|m| {
            json!({
                "id": m.id,
                "machine_id": m.id,
                "ip_address": m.ip_address,
            })
        })
        .collect();

    Ok(Json(json!(result)))
}

/// POST /admin/machine-ips
async fn create_machine_ip(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateMachineIpRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let row = sqlx::query_as::<_, crate::domain::entities::Machine>(
        "UPDATE machines SET ip_address = $2 WHERE id = $1 RETURNING *",
    )
    .bind(req.machine_id)
    .bind(&req.ip_address)
    .fetch_optional(&state.db_pool)
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
            Json(json!({"error": format!("Machine {} not found", req.machine_id)})),
        )
    })?;

    Ok((
        StatusCode::CREATED,
        Json(json!({"id": row.id, "machine_id": row.id, "ip_address": row.ip_address})),
    ))
}

/// PATCH /admin/machine-ips/:id
async fn update_machine_ip(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateMachineIpRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let row = sqlx::query_as::<_, crate::domain::entities::Machine>(
        "UPDATE machines SET ip_address = $2 WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .bind(&req.ip_address)
    .fetch_optional(&state.db_pool)
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

    Ok(Json(json!({"id": row.id, "machine_id": row.id, "ip_address": row.ip_address})))
}

/// DELETE /admin/machine-ips/:id — clears the IP address
async fn delete_machine_ip(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let result = sqlx::query("UPDATE machines SET ip_address = NULL WHERE id = $1")
        .bind(id)
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
            Json(json!({"error": format!("Machine {} not found", id)})),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ── Bridges ───────────────────────────────────────────

/// GET /admin/bridges
async fn list_bridges(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let bridges = state.bridge_repo.list().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;
    Ok(Json(json!(bridges)))
}

/// POST /admin/bridges
async fn create_bridge(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateBridgeRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let bridge = state
        .bridge_repo
        .create(&req.ip_address, req.label.as_deref())
        .await
        .map_err(|e| match e {
            RepoError::Conflict(_) => (StatusCode::CONFLICT, Json(json!({"error": e.to_string()}))),
            _ => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            ),
        })?;

    Ok((StatusCode::CREATED, Json(json!(bridge))))
}

/// PATCH /admin/bridges/:id
async fn update_bridge(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateBridgeRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let bridge = state
        .bridge_repo
        .update(id, req.label.as_deref(), req.authorized)
        .await
        .map_err(|e| match e {
            RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
            _ => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            ),
        })?;

    Ok(Json(json!(bridge)))
}

/// DELETE /admin/bridges/:id
async fn delete_bridge(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    state.bridge_repo.delete(id).await.map_err(|e| match e {
        RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
        other => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": other.to_string()})),
        ),
    })?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Therapy Comments ──────────────────────────────────

/// GET /admin/therapies/:id/comments
async fn list_comments(
    State(state): State<Arc<AppState>>,
    Path(therapy_id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let rows = sqlx::query_as::<_, crate::domain::entities::TherapyNote>(
        "SELECT * FROM therapy_notes WHERE therapy_id = $1 ORDER BY created_at DESC",
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

/// POST /admin/therapies/:id/comments
async fn create_comment(
    State(state): State<Arc<AppState>>,
    Path(therapy_id): Path<i64>,
    Json(req): Json<CreateCommentRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let row = sqlx::query_as::<_, crate::domain::entities::TherapyNote>(
        "INSERT INTO therapy_notes (therapy_id, user_id, content) VALUES ($1, $2, $3) RETURNING *",
    )
    .bind(therapy_id)
    .bind(0i64) // placeholder — auth context not yet wired
    .bind(&req.content)
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

/// DELETE /admin/comments/:id
async fn delete_comment(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let result = sqlx::query("DELETE FROM therapy_notes WHERE id = $1")
        .bind(id)
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
            Json(json!({"error": format!("Comment {} not found", id)})),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ── Config ────────────────────────────────────────────

/// GET /admin/config
async fn get_config(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    Ok(Json(json!({
        "jwt_secret_configured": !state.jwt_secret.is_empty() && state.jwt_secret != "change-me-in-production",
        "version": env!("CARGO_PKG_VERSION"),
    })))
}

// ── Tokens ────────────────────────────────────────────

/// POST /admin/tokens — generates an admin JWT API token (30-day expiry)
async fn generate_token(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    use jsonwebtoken::{encode, EncodingKey, Header};

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let claims = serde_json::json!({
        "sub": "api-token",
        "role": "admin",
        "iat": now,
        "exp": now + 86400 * 30, // 30 days
    });

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Token generation failed: {}", e)})),
        )
    })?;

    Ok(Json(json!({"token": token})))
}

// ── Export ────────────────────────────────────────────

/// GET /admin/export/patients/:id
async fn export_patient(
    Path(_id): Path<i64>,
) -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({"error": "Patient export not yet implemented"})),
    )
}

/// GET /admin/export/therapies/:id
async fn export_therapy(
    Path(_id): Path<i64>,
) -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({"error": "Therapy export not yet implemented"})),
    )
}
