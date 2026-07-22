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
use axum::{routing::get, Router};
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tracing::{error, info};

use server::api::{self, AppState};
use server::infrastructure::postgres::{
    equivalence_repo::EquivalenceRepo, machine_repo::MachineRepo, patient_repo::PatientRepo,
    readings_repo::ReadingsRepo, signal_repo::SignalRepo, therapy_repo::TherapyRepo,
    user_repo::UserRepo, version_repo::VersionRepo,
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
    let mut jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "change-me-in-production".to_string());
    let mut admin_password = std::env::var("ADMIN_PASSWORD")
        .unwrap_or_else(|_| "admin".to_string());
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
const MIGRATION_NAMES: &[&str] = &["001_initial.sql", "002_unique_signal_name.sql"];

async fn run_migrations(pool: &sqlx::PgPool) -> Result<(), sqlx::Error> {
    for (i, migration) in ALL_MIGRATIONS.iter().enumerate() {
        sqlx::raw_sql(migration).execute(pool).await?;
        let name = MIGRATION_NAMES.get(i).unwrap_or(&"unknown");
        info!("Applied migration {} ({})", i + 1, name);
    }
    Ok(())
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
    let equivalence_repo = EquivalenceRepo::new(pool.clone());
    let machine_repo = MachineRepo::new(pool.clone());
    let patient_repo = PatientRepo::new(pool.clone());
    let therapy_repo = TherapyRepo::new(pool.clone());
    let readings_repo = ReadingsRepo::new(pool.clone());
    let signal_repo = SignalRepo::new(pool.clone());
    let version_repo = VersionRepo::new(pool.clone());
    let user_repo = UserRepo::new(pool.clone());

    // ── Stale machine checker (every 30s, 60s timeout) ──
    let stale_checker_repo = machine_repo.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            match stale_checker_repo.set_stale_machines_offline(60).await {
                Ok(count) => {
                    if count > 0 {
                        info!("Marked {} stale machine(s) offline", count);
                    }
                }
                Err(e) => error!("Stale machine check failed: {}", e),
            }
        }
    });

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
    match seed::run(&pool).await {
        Ok(_) => info!("Seed completed successfully"),
        Err(e) => error!("Seed failed: {}", e),
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
        db_pool: pool.clone(),
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
    let ws_routes = api::ws_routes(app_state);

    // Combine everything into the main router (all Router<()> now)
    let app = Router::new()
        .route("/health", get(health_check))
        .merge(rest_api)
        .merge(ws_routes)
        .fallback_service(
            ServeDir::new(&args.frontend_dist)
                .fallback(ServeFile::new(format!("{}/index.html", &args.frontend_dist))),
        )
        .layer(CorsLayer::permissive());

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

/// Wait for Ctrl+C signal.
async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to install Ctrl+C handler");
    info!("Shutdown signal received, starting graceful shutdown...");
}
