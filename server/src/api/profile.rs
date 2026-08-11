//! Profile API: the current user's own profile, email and password management.
//! All endpoints are JWT-protected and operate on `Claims.sub`.

use std::sync::Arc;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch, put},
    Extension, Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::api::AppState;
use crate::api::auth::Claims;
use crate::domain::entities::User;
use crate::infrastructure::postgres::RepoError;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/users/me", get(get_me))
        .route("/users/me", patch(update_me))
        .route("/users/me/password", put(change_my_password))
        .with_state(state)
}

// ── DTOs ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub username: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

// ── Handlers ──────────────────────────────────────────

/// Serialize a user's public profile — never leaks `password_hash`.
fn profile_json(user: &User) -> serde_json::Value {
    json!({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "created_at": user.created_at,
    })
}

/// GET /users/me — current user's profile (includes email).
async fn get_me(
    Extension(claims): Extension<Claims>,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let user = state
        .user_repo
        .find_by_id(claims.sub)
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
                Json(json!({"error": format!("User {} not found", claims.sub)})),
            )
        })?;

    Ok(Json(profile_json(&user)))
}

/// PATCH /users/me — update own username and/or email.
async fn update_me(
    Extension(claims): Extension<Claims>,
    State(state): State<Arc<AppState>>,
    Json(req): Json<UpdateProfileRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let existing = state
        .user_repo
        .find_by_id(claims.sub)
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
                Json(json!({"error": format!("User {} not found", claims.sub)})),
            )
        })?;

    let username = req.username.unwrap_or(existing.username);
    let role = existing.role.clone().unwrap_or_else(|| "viewer".into());

    let user = state
        .user_repo
        .update(claims.sub, Some(&username), Some(&role), req.email.as_deref())
        .await
        .map_err(|e| match e {
            RepoError::Conflict(msg) => (StatusCode::CONFLICT, Json(json!({"error": msg}))),
            other => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": other.to_string()})),
            ),
        })?;

    Ok(Json(profile_json(&user)))
}

/// PUT /users/me/password — change own password after verifying the current one.
async fn change_my_password(
    Extension(claims): Extension<Claims>,
    State(state): State<Arc<AppState>>,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let user = state
        .user_repo
        .find_by_id(claims.sub)
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
                Json(json!({"error": format!("User {} not found", claims.sub)})),
            )
        })?;

    let parsed_hash = PasswordHash::new(&user.password_hash).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Invalid password hash format"})),
        )
    })?;

    Argon2::default()
        .verify_password(req.current_password.as_bytes(), &parsed_hash)
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Current password is incorrect"})),
            )
        })?;

    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(req.new_password.as_bytes(), &salt)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Password hashing failed: {}", e)})),
            )
        })?
        .to_string();

    state
        .user_repo
        .update_password_hash(claims.sub, &hash)
        .await
        .map_err(|e| match e {
            RepoError::NotFound(msg) => (StatusCode::NOT_FOUND, Json(json!({"error": msg}))),
            other => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": other.to_string()})),
            ),
        })?;

    Ok(Json(json!({"message": "Password updated successfully"})))
}
