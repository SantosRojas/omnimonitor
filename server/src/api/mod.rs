//! REST API route handlers.

pub mod auth;
pub mod dashboards;
pub mod export;
pub mod machines;
pub mod patients;
pub mod signals;
pub mod therapies;

use std::sync::Arc;

use axum::Router;

use crate::infrastructure::postgres::{
    machine_repo::MachineRepo, patient_repo::PatientRepo, readings_repo::ReadingsRepo,
    signal_repo::SignalRepo, therapy_repo::TherapyRepo, user_repo::UserRepo,
    version_repo::VersionRepo,
};
use crate::infrastructure::ws_hub::WsHubState;

/// Shared application state available to all handlers (REST + WS).
#[derive(Debug, Clone)]
pub struct AppState {
    pub jwt_secret: String,
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
pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .merge(auth::router(state.clone()))
        .merge(machines::router(state.clone()))
        .merge(patients::router(state.clone()))
        .merge(therapies::router(state.clone()))
        .merge(therapies::detail::router(state.clone()))
        .merge(signals::router(state.clone()))
        .merge(dashboards::router(state.clone()))
        .merge(export::router(state.clone()))
}
