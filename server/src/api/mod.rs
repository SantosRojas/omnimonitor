//! REST API route handlers.

pub mod admin;
pub mod auth;
pub mod equivalences;
pub mod dashboards;
pub mod export;
pub mod machines;
pub mod patients;
pub mod signals;
pub mod therapies;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::{
        ws::WebSocketUpgrade,
        ConnectInfo, State,
    },
    middleware,
    response::IntoResponse,
    routing::get,
    Router,
};

use crate::infrastructure::postgres::{
    equivalence_repo::EquivalenceRepo, machine_repo::MachineRepo, patient_repo::PatientRepo,
    readings_repo::ReadingsRepo, signal_repo::SignalRepo, therapy_repo::TherapyRepo,
    user_repo::UserRepo, version_repo::VersionRepo,
};
use crate::infrastructure::ws_hub::{self, WsHubState};

/// Shared application state available to all handlers (REST + WS).
#[derive(Debug, Clone)]
pub struct AppState {
    pub jwt_secret: String,
    pub db_pool: sqlx::PgPool,
    pub equivalence_repo: EquivalenceRepo,
    pub machine_repo: MachineRepo,
    pub patient_repo: PatientRepo,
    pub therapy_repo: TherapyRepo,
    pub readings_repo: ReadingsRepo,
    pub signal_repo: SignalRepo,
    pub version_repo: VersionRepo,
    pub user_repo: UserRepo,
    pub ws_hub: Arc<WsHubState>,
}

/// Build the complete REST API router by merging all sub-routers.
/// Returns Router<()> after providing state via .with_state().
///
/// Routes are split into two groups:
/// - Unprotected: `/auth/register`, `/auth/login` — no JWT required
/// - Protected: everything else — JWT auth middleware applied
pub fn build_router(state: Arc<AppState>) -> Router {
    // Unprotected routes — no auth required
    let unprotected = auth::router(state.clone());

    // Protected routes — JWT auth middleware applied to all
    let protected = Router::new()
        .merge(admin::router(state.clone()))
        .merge(equivalences::router(state.clone()))
        .merge(machines::router(state.clone()))
        .merge(patients::router(state.clone()))
        .merge(therapies::router(state.clone()))
        .merge(therapies::detail::router(state.clone()))
        .merge(signals::router(state.clone()))
        .merge(dashboards::router(state.clone()))
        .merge(export::router(state.clone()))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::auth_middleware,
        ));

    // Nest everything under /api prefix
    Router::new()
        .nest("/api", Router::new().merge(unprotected).merge(protected))
}

/// Build the WebSocket router — NOT wrapped in JWT auth.
pub fn ws_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/ws/bridge", get(bridge_ws_handler))
        .route("/ws/browser", get(browser_ws_handler))
        .with_state(state)
}

/// Bridge WebSocket handler.
async fn bridge_ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::info!("Bridge WS connection from {}", addr);
    ws.on_upgrade(move |socket| ws_hub::handle_bridge_connection(socket, state.ws_hub.clone()))
}

/// Browser WebSocket handler.
async fn browser_ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::info!("Browser WS connection from {}", addr);
    ws.on_upgrade(move |socket| ws_hub::handle_browser_connection(socket, state.ws_hub.clone()))
}
