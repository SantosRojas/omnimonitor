//! Server binary: REST + dual WebSocket server for omni-pdms-v2.
//!
//! Usage:
//!   cargo run -p server [--port 9000] [--db-url "postgres://override:..."]
//!
//! DB config via .env (Laravel-style):
//!   DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD

#![allow(clippy::print_stdout)]

use std::net::SocketAddr;
use std::sync::Arc;

use argon2::PasswordHasher;
use axum::{Json, Router, extract::State, http::StatusCode, routing::get};
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tracing::{error, info, warn};

use server::api::{self, AppState};
use server::infrastructure::postgres::{
    bridge_repo::BridgeRepo, equivalence_repo::EquivalenceRepo, machine_repo::MachineRepo,
    patient_repo::PatientRepo, readings_repo::ReadingsRepo, signal_repo::SignalRepo,
    therapy_repo::TherapyRepo, user_repo::UserRepo, version_repo::VersionRepo,
};
use server::infrastructure::{seed, ws_hub::WsHubState};
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
    frontend_dist: String,
}

fn build_db_url() -> String {
    let host = std::env::var("DB_HOST").unwrap_or_else(|_| "localhost".to_string());
    let port = std::env::var("DB_PORT").unwrap_or_else(|_| "5432".to_string());
    let database = std::env::var("DB_DATABASE").unwrap_or_else(|_| "pdms".to_string());
    let username = std::env::var("DB_USERNAME").unwrap_or_else(|_| "postgres".to_string());
    let password = std::env::var("DB_PASSWORD").unwrap_or_else(|_| "postgres".to_string());
    format!("postgres://{username}:{password}@{host}:{port}/{database}")
}

fn parse_args() -> Args {
    // Env var defaults (dotenvy::dotenv() loads .env before this)
    let mut db_url = build_db_url();
    let mut port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(9000);
    let jwt_secret = std::env::var("JWT_SECRET")
        .expect("JWT_SECRET must be set in environment");
    let admin_password = std::env::var("ADMIN_PASSWORD")
        .expect("ADMIN_PASSWORD must be set in environment");
    let mut frontend_dist = std::env::var("FRONTEND_DIST")
        .unwrap_or_else(|_| "frontend/dist".to_string());

    // CLI args override env vars (highest priority)
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
                    if let Ok(p) = v.parse() {
                        port = p;
                    }
                }
            }
            "--frontend-dist" => {
                if let Some(v) = args.next() {
                    frontend_dist = v;
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
        frontend_dist,
    }
}

// ───────────────────────────────────────────────
//  Migration runner
// ───────────────────────────────────────────────

/// Migration file names — mirrors the order in `ALL_MIGRATIONS`.
const MIGRATION_NAMES: &[&str] = &[
    "001_initial.sql",
    "002_unique_signal_name.sql",
    "003_drop_equiv_description.sql",
    "004_bridges.sql",
    "005_readings_perf_indexes.sql",
    "006_drop_readings_therapy_phase.sql",
];

async fn run_migrations(pool: &sqlx::PgPool) -> Result<(), sqlx::Error> {
    for (i, migration) in ALL_MIGRATIONS.iter().enumerate() {
        sqlx::raw_sql(migration).execute(pool).await?;
        let name = MIGRATION_NAMES.get(i).unwrap_or(&"unknown");
        info!("Applied migration {} ({})", i + 1, name);
    }
    Ok(())
}

/// Health check handler with DB ping.
async fn health_check(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        state.db_pool.acquire(),
    )
    .await
    {
        Ok(Ok(_)) => Ok(Json(serde_json::json!({"status": "ok"}))),
        _ => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"status": "degraded", "db": "unreachable"})),
        )),
    }
}

/// Build a CORS layer from the `CORS_ORIGINS` environment variable.
///
/// Parses comma-separated origins. Defaults to `http://localhost:5173`.
/// Set to `*` for permissive mode (dev only).
fn cors_layer() -> CorsLayer {
    let origins = std::env::var("CORS_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:5173".to_string());

    if origins == "*" {
        return CorsLayer::permissive();
    }

    let origins: Vec<_> = origins
        .split(',')
        .map(|o| o.trim().parse().expect("Invalid origin in CORS_ORIGINS"))
        .collect();

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::PATCH,
            axum::http::Method::DELETE,
            axum::http::Method::OPTIONS,
        ])
        .allow_headers(Any)
}

// ───────────────────────────────────────────────
//  Main
// ───────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load .env (if present — .gitignore already excludes it)
    let _ = dotenvy::dotenv();

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

    // ── Database pools (write + read, with retry loop) ──
    // write_pool: 10 conexiones para inserts/updates (bridge, repos)
    // read_pool:  30 conexiones para SELECT pesados (dashboard, timeseries)
    let write_pool = {
        let max_attempts = 10;
        let base_delay = std::time::Duration::from_secs(2);
        let max_delay = std::time::Duration::from_secs(30);
        let mut attempt = 0;

        loop {
            attempt += 1;
            match PgPoolOptions::new()
                .max_connections(10)
                .connect(&args.db_url)
                .await
            {
                Ok(pool) => break pool,
                Err(e) => {
                    if attempt >= max_attempts {
                        error!(
                            "Failed to connect to database after {max_attempts} attempts: {e}"
                        );
                        return Err(e.into());
                    }
                    let delay = (base_delay * 2u32.saturating_pow(attempt - 1)).min(max_delay);
                    warn!(
                        "DB connection attempt {attempt}/{max_attempts} failed, \
                         retrying in {delay}s... ({e})",
                        delay = delay.as_secs(),
                    );
                    tokio::time::sleep(delay).await;
                }
            }
        }
    };

    // Read pool: 30 conexiones para queries pesados (dashboard, timeseries)
    let read_pool = {
        let max_attempts = 10;
        let base_delay = std::time::Duration::from_secs(2);
        let max_delay = std::time::Duration::from_secs(30);
        let mut attempt = 0;

        loop {
            attempt += 1;
            match PgPoolOptions::new()
                .max_connections(30)
                .connect(&args.db_url)
                .await
            {
                Ok(pool) => break pool,
                Err(e) => {
                    if attempt >= max_attempts {
                        error!(
                            "Failed to connect read pool after {max_attempts} attempts: {e}"
                        );
                        return Err(e.into());
                    }
                    let delay = (base_delay * 2u32.saturating_pow(attempt - 1)).min(max_delay);
                    warn!(
                        "Read pool attempt {attempt}/{max_attempts} failed, \
                         retrying in {delay}s... ({e})",
                        delay = delay.as_secs(),
                    );
                    tokio::time::sleep(delay).await;
                }
            }
        }
    };
    info!("Read pool: 30 connections (isolated from write pool)");

    // Run migrations (usar write_pool)
    run_migrations(&write_pool).await?;
    info!("Database schema up to date");

    // ── Repositories ──────────────────────────────
    // ReadingsRepo usa read_pool separado para SELECT
    let bridge_repo = BridgeRepo::new(write_pool.clone());
    let equivalence_repo = EquivalenceRepo::new(write_pool.clone());
    let machine_repo = MachineRepo::new(write_pool.clone());
    let patient_repo = PatientRepo::new(write_pool.clone());
    let therapy_repo = TherapyRepo::new(write_pool.clone());
    let readings_repo = ReadingsRepo::new_with_read_pool(write_pool.clone(), read_pool.clone());
    let signal_repo = SignalRepo::new(write_pool.clone());
    let version_repo = VersionRepo::new(write_pool.clone());
    let user_repo = UserRepo::new(write_pool.clone());

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

    // ── Seed signals and value mappings ───────────
    match seed::run(&write_pool).await {
        Ok(_) => info!("Seed completed successfully"),
        Err(e) => error!("Seed failed: {}", e),
    }

    // ── Persistence interval ──────────────────────
    let persistence_interval_secs: u64 = std::env::var("PERSISTENCE_INTERVAL_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);
    info!(
        "Persistence interval: {}s (0 = immediate)",
        persistence_interval_secs
    );

    // ── WS hub state ──────────────────────────────
    let ws_hub = Arc::new(WsHubState::new(
        machine_repo.clone(),
        patient_repo.clone(),
        therapy_repo.clone(),
        readings_repo.clone(),
        version_repo.clone(),
        bridge_repo.clone(),
        persistence_interval_secs,
    ));

    // ── Stale machine watchdog (every 30s, 60s timeout) ──
    let watchdog_machine_repo = machine_repo.clone();
    let watchdog_ws_hub = ws_hub.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        interval.tick().await; // skip immediate first tick
        loop {
            interval.tick().await;
            match watchdog_machine_repo.set_stale_machines_offline(60).await {
                Ok(ids) => {
                    if !ids.is_empty() {
                        info!("Watchdog: marked {} stale machine(s) offline", ids.len());
                        for machine_id in &ids {
                            let event = server::infrastructure::ws_hub::BrowserEvent::MachineStatus {
                                machine_id: *machine_id,
                                status: "offline".into(),
                                last_seen_at: chrono::Utc::now().to_rfc3339(),
                            };
                            if let Ok(json) = serde_json::to_string(&event) {
                                watchdog_ws_hub.broadcast_to_machine(*machine_id, &json).await;
                            }
                        }
                    }
                }
                Err(e) => error!("Watchdog: stale machine check failed: {}", e),
            }
        }
    });

    // ── Unified app state ─────────────────────────
    let app_state = Arc::new(AppState {
        jwt_secret: args.jwt_secret.clone(),
        db_pool: write_pool.clone(),
        read_pool: read_pool.clone(),
        bridge_repo,
        equivalence_repo,
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

    // Build WS routes (no JWT auth — bridge WS register is the auth mechanism)
    let ws_routes = api::ws_routes(app_state.clone());

    // Combine everything into the main router (all Router<()> now)
    let app = Router::new()
        .merge(Router::new()
            .route("/health", get(health_check))
            .with_state(app_state.clone())
        )
        .merge(rest_api)
        .merge(ws_routes)
        .fallback_service(
            ServeDir::new(&args.frontend_dist)
                .fallback(ServeFile::new(format!("{}/index.html", &args.frontend_dist))),
        )
        .layer(cors_layer());

    // ── Start server ──────────────────────────────
    let addr: SocketAddr = ([0, 0, 0, 0], args.port).into();
    info!("Server listening on http://{}", addr);
    info!("REST API: http://{}/api/...", addr);
    info!("WS bridge: ws://{}/ws/bridge", addr);
    info!("WS browser: ws://{}/ws/browser", addr);
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

/// Wait for shutdown signal (SIGINT via Ctrl+C, or SIGTERM on Unix).
async fn shutdown_signal() {
    let ctrl_c = tokio::signal::ctrl_c();

    #[cfg(unix)]
    {
        use tokio::signal::unix::{self, SignalKind};

        let mut term_signal = unix::signal(SignalKind::terminate())
            .expect("Failed to install SIGTERM handler");

        tokio::select! {
            _ = ctrl_c => {},
            _ = term_signal.recv() => {},
        }
    }

    #[cfg(not(unix))]
    {
        ctrl_c.await.expect("Failed to install Ctrl+C handler");
    }

    info!("Shutdown signal received, starting graceful shutdown...");
}
