//! Shared test helpers for server integration tests.
//!
//! Usage:
//!   mod common;
//!   common::setup_db(&pool).await;

// Items in this module may appear unused from the perspective of a single test binary
// because each `tests/*.rs` file compiles as its own crate.
#![allow(dead_code)]

use axum::Router;
use axum::routing::get;
use sqlx::PgPool;
use std::sync::Arc;

use server::api::{AppState, build_router};
use server::infrastructure::postgres::{
    bridge_repo::BridgeRepo,
    equivalence_repo::EquivalenceRepo,
    machine_repo::MachineRepo,
    patient_repo::PatientRepo,
    readings_repo::ReadingsRepo,
    signal_repo::SignalRepo,
    therapy_repo::TherapyRepo,
    user_repo::UserRepo,
    version_repo::VersionRepo,
};
use server::infrastructure::ws_hub::WsHubState;
use server::schema::ALL_MIGRATIONS;

/// Apply all embedded migrations to the test database.
/// Uses the same runner as `server/src/main.rs`.
pub async fn setup_db(pool: &PgPool) {
    for migration in ALL_MIGRATIONS {
        sqlx::raw_sql(migration)
            .execute(pool)
            .await
            .expect("Failed to apply migration in test setup");
    }
}

/// Create repositories for a test database pool.
pub fn create_repos(pool: &PgPool) -> RepoBundle {
    RepoBundle {
        machine: MachineRepo::new(pool.clone()),
        patient: PatientRepo::new(pool.clone()),
        therapy: TherapyRepo::new(pool.clone()),
        readings: ReadingsRepo::new(pool.clone()),
        signal: SignalRepo::new(pool.clone()),
        version: VersionRepo::new(pool.clone()),
        user: UserRepo::new(pool.clone()),
        bridge: BridgeRepo::new(pool.clone()),
        equivalence: EquivalenceRepo::new(pool.clone()),
    }
}

/// Convenience wrapper holding all repository instances for a single pool.
pub struct RepoBundle {
    pub machine: MachineRepo,
    pub patient: PatientRepo,
    pub therapy: TherapyRepo,
    pub readings: ReadingsRepo,
    pub signal: SignalRepo,
    pub version: VersionRepo,
    pub user: UserRepo,
    pub bridge: BridgeRepo,
    pub equivalence: EquivalenceRepo,
}

/// Build a fully-wired Axum router with a test JWT secret.
/// Includes REST API + WebSocket routes.
/// Applies migrations first, so the caller does NOT need to call `setup_db`.
pub async fn build_test_app(pool: PgPool) -> axum::Router {
    setup_db(&pool).await;
    let repos = create_repos(&pool);
    let ws_hub = Arc::new(WsHubState::new(
        repos.machine.clone(),
        repos.patient.clone(),
        repos.therapy.clone(),
        repos.readings.clone(),
        repos.version.clone(),
        repos.bridge.clone(),
        0, // persistence_interval_secs: 0 = inmediato (comportamiento original)
    ));
    let state = Arc::new(AppState {
        jwt_secret: "test-jwt-secret".into(),
        db_pool: pool,
        equivalence_repo: repos.equivalence,
        machine_repo: repos.machine,
        patient_repo: repos.patient,
        therapy_repo: repos.therapy,
        readings_repo: repos.readings,
        signal_repo: repos.signal,
        version_repo: repos.version,
        user_repo: repos.user,
        bridge_repo: repos.bridge,
        ws_hub,
    });
    let rest_api = build_router(state.clone());
    let ws_routes = server::api::ws_routes(state);
    Router::new()
        .route("/health", get(health_check))
        .merge(rest_api)
        .merge(ws_routes)
}

/// Health check handler for test app.
async fn health_check() -> &'static str {
    "OK"
}

/// Generate a test JWT token using the shared test secret "test-jwt-secret".
/// The token has sub=1, role="admin", exp=24h from now.
pub fn test_jwt() -> String {
    use chrono::Utc;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use server::api::auth::Claims;

    let claims = Claims {
        sub: 1,
        role: "admin".into(),
        exp: (Utc::now() + chrono::Duration::hours(24)).timestamp() as usize,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(b"test-jwt-secret"),
    )
    .expect("test JWT encoding failed")
}

/// Create a reusable auth header value for test requests.
pub fn auth_header(token: &str) -> (&'static str, String) {
    ("authorization", format!("Bearer {}", token))
}
