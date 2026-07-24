//! Authentication API: register, login, JWT middleware.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Instant;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::info;

use crate::api::AppState;
use crate::infrastructure::postgres::RepoError;

// ───────────────────────────────────────────────
//  Types
// ───────────────────────────────────────────────

/// JWT claims.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: i64,
    pub role: String,
    pub exp: usize,
}

/// Register request body.
#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub role: Option<String>,
}

/// Login request body.
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

/// Login response with JWT token.
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user_id: i64,
    pub role: String,
}

// ───────────────────────────────────────────────
//  Rate limiter
// ───────────────────────────────────────────────

/// Simple in-memory sliding-window rate limiter per IP.
/// Allows up to `max_requests` per `window_secs` per client IP.
struct RateLimiter {
    inner: Mutex<RateLimiterInner>,
    max_requests: usize,
    window_secs: u64,
}

struct RateLimiterInner {
    requests: HashMap<String, Vec<Instant>>,
}

impl RateLimiter {
    fn new(max_requests: usize, window_secs: u64) -> Self {
        Self {
            inner: Mutex::new(RateLimiterInner {
                requests: HashMap::new(),
            }),
            max_requests,
            window_secs,
        }
    }

    fn check(&self, client_ip: &str) -> bool {
        let now = Instant::now();
        let window = std::time::Duration::from_secs(self.window_secs);
        let mut inner = self.inner.lock().expect("rate limiter lock");
        let timestamps = inner.requests.entry(client_ip.to_string()).or_default();

        // Remove entries outside the window
        timestamps.retain(|t| now.duration_since(*t) < window);

        if timestamps.len() >= self.max_requests {
            false // rate limited
        } else {
            timestamps.push(now);
            true // allowed
        }
    }
}

/// Global rate limiter for auth endpoints: 10 requests/min per IP.
static AUTH_RATE_LIMITER: std::sync::LazyLock<RateLimiter> =
    std::sync::LazyLock::new(|| RateLimiter::new(10, 60));

/// Extract client IP from request, falling back to "unknown".
fn client_ip(headers: &axum::http::HeaderMap, _state: &Arc<AppState>) -> String {
    if let Some(v) = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next().map(|s| s.trim().to_string()))
    {
        return v;
    }
    if let Some(v) = headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
    {
        return v;
    }
    "unknown".to_string()
}

// ───────────────────────────────────────────────
//  Router
// ───────────────────────────────────────────────

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .with_state(state)
}

// ───────────────────────────────────────────────
//  Handlers
// ───────────────────────────────────────────────

/// POST /auth/register — create a new user.
async fn register(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let role = req.role.as_deref().unwrap_or("viewer");

    if !["admin", "operator", "viewer"].contains(&role) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid role. Must be admin, operator, or viewer"})),
        ));
    }

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(req.password.as_bytes(), &salt)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Password hashing failed: {}", e)})),
            )
        })?
        .to_string();

    match state.user_repo.create(&req.username, &hash, role).await {
        Ok(user) => {
            info!("Created user {} (id={}, role={})", user.username, user.id, role);
            Ok((
                StatusCode::CREATED,
                Json(json!({"id": user.id, "username": user.username, "role": user.role})),
            ))
        }
        Err(RepoError::Database(e)) => {
            if let Some(sqlx_err) = e.as_database_error() {
                if sqlx_err.constraint() == Some("users_username_key") {
                    return Err((
                        StatusCode::CONFLICT,
                        Json(json!({"error": "Username already exists"})),
                    ));
                }
            }
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            ))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )),
    }
}

/// POST /auth/login — authenticate and return a JWT.
async fn login(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    // Rate limiting check
    let ip = client_ip(&headers, &state);
    if !AUTH_RATE_LIMITER.check(&ip) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": "Too many requests. Please try again later."})),
        ));
    }
    let user = state
        .user_repo
        .find_by_username(&req.username)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Invalid username or password"})),
            )
        })?;

    let parsed_hash = PasswordHash::new(&user.password_hash).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Invalid password hash format"})),
        )
    })?;

    Argon2::default()
        .verify_password(req.password.as_bytes(), &parsed_hash)
        .map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Invalid username or password"})),
            )
        })?;

    let role = user.role.clone().unwrap_or_else(|| "viewer".into());
    let exp = (chrono::Utc::now() + chrono::Duration::hours(24)).timestamp() as usize;

    let claims = Claims {
        sub: user.id,
        role: role.clone(),
        exp,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("JWT encoding failed: {}", e)})),
        )
    })?;

    Ok(Json(LoginResponse {
        token,
        user_id: user.id,
        role,
    }))
}

// ───────────────────────────────────────────────
//  JWT Middleware
// ───────────────────────────────────────────────

/// Extract and validate JWT from Authorization header.
pub fn validate_token(
    headers: &HeaderMap,
    jwt_secret: &str,
) -> Result<Claims, (StatusCode, Json<serde_json::Value>)> {
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Missing Authorization header"})),
            )
        })?;

    let token = auth_header.strip_prefix("Bearer ").ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Invalid Authorization format. Use: Bearer <token>"})),
        )
    })?;

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": format!("Invalid token: {}", e)})),
        )
    })?;

    Ok(token_data.claims)
}

/// Axum middleware that validates JWT and injects Claims into request extensions.
pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    mut req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, (StatusCode, Json<serde_json::Value>)> {
    let claims = validate_token(&headers, &state.jwt_secret)?;
    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}

/// Extract Claims from request extensions (set by auth_middleware).
pub fn get_claims(
    req: &axum::extract::Request,
) -> Result<Claims, (StatusCode, Json<serde_json::Value>)> {
    req.extensions()
        .get::<Claims>()
        .cloned()
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Not authenticated"})),
            )
        })
}

/// Require a specific role from request extensions.
pub fn require_role(
    req: &axum::extract::Request,
    allowed: &[&str],
) -> Result<Claims, (StatusCode, Json<serde_json::Value>)> {
    let claims = get_claims(req)?;
    if allowed.contains(&claims.role.as_str()) {
        Ok(claims)
    } else {
        Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": format!("Insufficient permissions. Required role(s): {:?}", allowed)})),
        ))
    }
}
