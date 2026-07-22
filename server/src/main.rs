//! Server binary: REST + dual WebSocket server for omni-pdms-v2.
//!
//! Usage:
//!   cargo run -p server -- --db-url "postgres://user:pass@localhost/pdms" --port 9000

#![allow(clippy::print_stdout)]

use std::net::SocketAddr;
use std::sync::Arc;

use argon2::PasswordHasher;
use axum::{
    extract::{
        ws::WebSocketUpgrade,
        ConnectInfo, State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::CorsLayer;
use tracing::{error, info};

use server::api::{self, AppState};
use server::infrastructure::postgres::{
    machine_repo::MachineRepo, patient_repo::PatientRepo, readings_repo::ReadingsRepo,
    signal_repo::SignalRepo, therapy_repo::TherapyRepo, user_repo::UserRepo,
    version_repo::VersionRepo,
};
use server::infrastructure::ws_hub::{self, WsHubState};
use server::schema::ALL_MIGRATIONS;

// ───────────────────────────────────────────────
//  CLI configuration
// ───────────────────────────────────────────────

#[derive(Debug)]
struct Args {
    db_url: String,
    port: u16,
    jwt_secret: String,
    admin_password: String,
}

fn parse_args() -> Args {
    let mut db_url = "postgres://postgres:postgres@localhost:5432/pdms".to_string();
    let mut port = 9000u16;
    let mut jwt_secret = "change-me-in-production".to_string();
    let mut admin_password = "admin".to_string();

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--db-url" => {
                if let Some(v) = args.next() {
                    db_url = v;
                }
            }
            "--port" => {
                if let Some(v) = args.next() {
                    port = v.parse().unwrap_or(9000);
                }
            }
            "--jwt-secret" => {
                if let Some(v) = args.next() {
                    jwt_secret = v;
                }
            }
            "--admin-password" => {
                if let Some(v) = args.next() {
                    admin_password = v;
                }
            }
            _ => {}
        }
    }

    Args {
        db_url,
        port,
        jwt_secret,
        admin_password,
    }
}

// ───────────────────────────────────────────────
//  Migration runner
// ───────────────────────────────────────────────

async fn run_migrations(pool: &sqlx::PgPool) -> Result<(), sqlx::Error> {
    for (i, migration) in ALL_MIGRATIONS.iter().enumerate() {
        sqlx::raw_sql(migration).execute(pool).await?;
        info!("Applied migration {} from {}", i + 1, "001_initial.sql");
    }
    Ok(())
}

// ───────────────────────────────────────────────
//  WS handlers
// ───────────────────────────────────────────────

/// Bridge WebSocket handler.
async fn bridge_ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    info!("Bridge WS connection from {}", addr);
    ws.on_upgrade(move |socket| ws_hub::handle_bridge_connection(socket, state.ws_hub.clone()))
}

/// Browser WebSocket handler.
async fn browser_ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    info!("Browser WS connection from {}", addr);
    ws.on_upgrade(move |socket| {
        ws_hub::handle_browser_connection(socket, state.ws_hub.clone())
    })
}

/// Health check handler (no state needed).
async fn health_check() -> &'static str {
    "OK"
}

// ───────────────────────────────────────────────
//  Main
// ───────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,server=debug".into()),
        )
        .init();

    let args = parse_args();

    info!("╔══════════════════════════════════════════════╗");
    info!("║   omni-pdms-v2 · Server Core                 ║");
    info!("╚══════════════════════════════════════════════╝");
    info!("Port: {}", args.port);
    info!("DB: {}", args.db_url);

    // ── Database pool ──────────────────────────────
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&args.db_url)
        .await
        .map_err(|e| {
            error!("Failed to connect to database: {}", e);
            e
        })?;

    // Run migrations
    run_migrations(&pool).await?;
    info!("Database schema up to date");

    // ── Repositories ──────────────────────────────
    let machine_repo = MachineRepo::new(pool.clone());
    let patient_repo = PatientRepo::new(pool.clone());
    let therapy_repo = TherapyRepo::new(pool.clone());
    let readings_repo = ReadingsRepo::new(pool.clone());
    let signal_repo = SignalRepo::new(pool.clone());
    let version_repo = VersionRepo::new(pool.clone());
    let user_repo = UserRepo::new(pool.clone());

    // ── Seed admin user ────────────────────────────
    let existing = user_repo.find_by_username("admin").await.ok().flatten();
    if existing.is_none() {
        let salt = argon2::password_hash::SaltString::generate(
            &mut argon2::password_hash::rand_core::OsRng,
        );
        let hash = argon2::Argon2::default()
            .hash_password(args.admin_password.as_bytes(), &salt)
            .map_err(|e| format!("Password hashing failed: {}", e))?
            .to_string();

        user_repo
            .create("admin", &hash, "admin")
            .await
            .map_err(|e| format!("Failed to seed admin user: {}", e))?;

        info!("Seeded admin user (default password: '{}')", args.admin_password);
    }

    // ── WS hub state ──────────────────────────────
    let ws_hub = Arc::new(WsHubState::new(
        machine_repo.clone(),
        patient_repo.clone(),
        therapy_repo.clone(),
        readings_repo.clone(),
        version_repo.clone(),
    ));

    // ── Unified app state ─────────────────────────
    let app_state = Arc::new(AppState {
        jwt_secret: args.jwt_secret.clone(),
        machine_repo,
        patient_repo,
        therapy_repo,
        readings_repo,
        signal_repo,
        version_repo,
        user_repo,
        ws_hub,
    });

    // ── Build Axum router ──────────────────────────
    // Build REST API (each sub-router calls .with_state() internally → Router<()>)
    let rest_api = api::build_router(app_state.clone());

    // Build WS routes — start with Arc<AppState>-typed router, then provide state
    let ws_routes = Router::<Arc<AppState>>::new()
        .route("/ws/bridge", get(bridge_ws_handler))
        .route("/ws/browser", get(browser_ws_handler))
        .with_state(app_state); // returns Router<()>

    // Combine everything into the main router (all Router<()> now)
    let app = Router::new()
        .route("/health", get(health_check))
        .merge(rest_api)
        .merge(ws_routes)
        .layer(CorsLayer::permissive());

    // ── Start server ──────────────────────────────
    let addr: SocketAddr = ([0, 0, 0, 0], args.port).into();
    info!("Server listening on http://{}", addr);
    info!("WS bridge: ws://{}/ws/bridge", addr);
    info!("WS browser: ws://{}/ws/browser", addr);
    info!("REST API: http://{}/api/...", addr);
    info!("Health: http://{}/health", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    info!("Server shutdown complete");
    Ok(())
}

/// Wait for Ctrl+C signal.
async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to install Ctrl+C handler");
    info!("Shutdown signal received, starting graceful shutdown...");
}
