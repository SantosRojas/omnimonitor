//! Bridge binary: serial-to-WebSocket gateway for OMNI-ODI machines.
//!
//! # Usage
//!
//! ```sh
//! cargo run -p bridge -- --port COM1 --baud 115200 --ws ws://localhost:9000/ws
//! ```
//!
//! # Architecture
//!
//! Two async tasks connected by channels:
//!
//! - **Serial task**: runs the bridge interactor (init protocol → cyclical loop)
//! - **WS task**: manages the WebSocket connection with auto-reconnect
//!
//! Readings flow: serial → `tx_readings` channel → WS → server
//! Commands flow: server → WS → `tx_commands` channel → serial task
//!
//! # Configuration Precedence
//!
//! Config is loaded with the following precedence (later overrides earlier):
//!
//! 1. Hardcoded defaults
//! 2. `.env` file (loaded via `dotenvy`)
//! 3. Environment variables (`BRIDGE_*`)
//! 4. CLI arguments (`--port`, `--ws`, etc.)
//!
//! The bridge IP is always **auto-detected** at startup (`local_ip_address`); it is
//! used for IP-based register auth against the server and is never configurable.

use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::{Mutex, mpsc, watch};
use tracing_subscriber::fmt::time::ChronoLocal;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::Layer;

use bridge::interactor::run_bridge;
use bridge::protocol::frames::{BridgeFrame, ServerFrame, WsState};
use bridge::serial::communicator::{SerialConfig, SerialDeviceCommunicator};
use bridge::serial::manager::SerialReaderManager;
use bridge::ws_client::connect_and_run;

// ───────────────────────────────────────────────
//  Configuration
// ───────────────────────────────────────────────

/// Bridge configuration loaded with precedence:
/// defaults → .env → env vars (`BRIDGE_*`) → CLI args.
#[derive(Debug, Clone, PartialEq)]
pub struct BridgeConfig {
    pub port: String,
    pub baud: u32,
    pub ws_url: String,
    pub src_addr: u8,
    pub dst_addr: u8,
    pub bridge_ip: String,
    pub max_failures: u32,
    pub timeout_secs: u64,
    pub developer_mode: bool,
    /// Millisegundos entre ciclos de lectura exitosa.
    /// 0 = sin pausa (tan rápido como responda el serial).
    pub cycle_interval_ms: u64,
}

impl Default for BridgeConfig {
    fn default() -> Self {
        Self {
            port: String::new(),
            baud: 115200,
            ws_url: String::new(),
            src_addr: 11,
            dst_addr: 1,
            bridge_ip: String::new(),
            max_failures: 10,
            timeout_secs: 3,
            developer_mode: false,
            cycle_interval_ms: 1000,
        }
    }
}

/// Loads configuration with the precedence pipeline:
/// defaults → .env → env vars → CLI args.
///
/// Each later source overrides only if the value is explicitly provided.
/// `dotenvy::dotenv()` MUST be called before this so that `.env` values
/// are available as environment variables (without overriding real env vars).
pub fn load_config(args: &[String]) -> BridgeConfig {
    let mut config = BridgeConfig::default();

    // ── Override from env vars (includes .env via dotenvy) ──
    if let Ok(v) = std::env::var("BRIDGE_PORT") {
        config.port = v;
    }
    if let Ok(v) = std::env::var("BRIDGE_BAUD")
        && let Ok(n) = v.parse()
    {
        config.baud = n;
    }
    if let Ok(v) = std::env::var("BRIDGE_SRC_ADDR")
        && let Ok(n) = v.parse()
    {
        config.src_addr = n;
    }
    if let Ok(v) = std::env::var("BRIDGE_WS_URL") {
        config.ws_url = v;
    }
    if let Ok(v) = std::env::var("BRIDGE_DST_ADDR")
        && let Ok(n) = v.parse()
    {
        config.dst_addr = n;
    }
    if let Ok(v) = std::env::var("SERIAL_MAX_FAILURES") {
        tracing::info!("Using SERIAL_MAX_FAILURES from env: {}", v);
        if let Ok(n) = v.parse() {
            config.max_failures = n;
        }
    }
    if let Ok(v) = std::env::var("BRIDGE_TIMEOUT_SECS")
        && let Ok(n) = v.parse()
    {
        config.timeout_secs = n;
    }
    if let Ok(v) = std::env::var("BRIDGE_DEVELOPER_MODE") {
        config.developer_mode =
            v.eq_ignore_ascii_case("true") || v.eq_ignore_ascii_case("1") || v == "yes";
    }
    if let Ok(v) = std::env::var("BRIDGE_CYCLE_INTERVAL")
        && let Ok(n) = v.parse()
    {
        config.cycle_interval_ms = n;
    }

    // ── Override from CLI args ──
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--port" => {
                if i + 1 < args.len() {
                    config.port = args[i + 1].clone();
                    i += 2;
                } else {
                    eprintln!("Missing value for --port");
                    i += 1;
                }
            }
            "--baud" => {
                if i + 1 < args.len() {
                    config.baud = args[i + 1].parse().unwrap_or(config.baud);
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "--ws" => {
                if i + 1 < args.len() {
                    config.ws_url = args[i + 1].clone();
                    i += 2;
                } else {
                    eprintln!("Missing value for --ws");
                    i += 1;
                }
            }
            "--src-addr" => {
                if i + 1 < args.len() {
                    config.src_addr = args[i + 1].parse().unwrap_or(config.src_addr);
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "--dst-addr" => {
                if i + 1 < args.len() {
                    config.dst_addr = args[i + 1].parse().unwrap_or(config.dst_addr);
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "--developer-mode" => {
                config.developer_mode = true;
                i += 1;
            }
            "--cycle-interval" => {
                if i + 1 < args.len() {
                    config.cycle_interval_ms = args[i + 1].parse().unwrap_or(config.cycle_interval_ms);
                    i += 2;
                } else {
                    i += 1;
                }
            }
            _ => {
                i += 1;
            }
        }
    }

    config
}

/// Apply the locally detected IP to the config when detection succeeds.
///
/// The bridge IP is always auto-detected — there is no manual configuration
/// (the `BRIDGE_IP` env var and `--bridge-ip` CLI flag were removed). The
/// detected IP is used for IP-based register auth against the server.
///
/// Kept as a pure function so the behavior is deterministically testable
/// without touching real network interfaces.
fn apply_detected_ip(config: &mut BridgeConfig, detected: Option<String>) {
    if let Some(ip) = detected {
        config.bridge_ip = ip;
    }
}

/// Initializes the tracing/logging subsystem.
///
/// In **developer mode**: writes to both console (with ANSI) and daily rolling file at
/// `logs/bridge.log`, with `debug`-level verbosity for the bridge crate.
///
/// In **production mode** (default): lightweight console-only output at `info` level.
///
/// The `RUST_LOG` env var always overrides the default filter when set.
fn init_tracing(developer_mode: bool) -> Vec<tracing_appender::non_blocking::WorkerGuard> {
    let default_filter = if developer_mode {
        "debug,hyper=warn,tungstenite=warn,rustls=warn"
    } else {
        "info"
    };

    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(default_filter));

    if developer_mode {
        // ── Developer mode: console + daily rolling file ──
        let log_dir = PathBuf::from("logs");
        if let Err(e) = std::fs::create_dir_all(&log_dir) {
            eprintln!("[Tracing] WARNING: cannot create logs dir: {e}. Console only.");
            tracing_subscriber::fmt()
                .with_env_filter(filter)
                .with_timer(ChronoLocal::new("%Y-%m-%d %H:%M:%S".to_string()))
                .with_target(false)
                .init();
            return vec![];
        }

        let file_appender = tracing_appender::rolling::daily(&log_dir, "bridge.log");
        let (file_writer, file_guard) = tracing_appender::non_blocking(file_appender);
        let (console_writer, console_guard) = tracing_appender::non_blocking(std::io::stdout());

        let timer = ChronoLocal::new("%Y-%m-%d %H:%M:%S%.3f".to_string());

        let file_layer = tracing_subscriber::fmt::layer()
            .with_writer(file_writer)
            .with_ansi(false)
            .with_target(false)
            .with_timer(timer.clone())
            .with_level(true)
            .boxed();

        let console_layer = tracing_subscriber::fmt::layer()
            .with_writer(console_writer)
            .with_ansi(true)
            .with_target(false)
            .with_timer(timer)
            .with_level(true)
            .boxed();

        tracing_subscriber::Registry::default()
            .with(filter)
            .with(console_layer)
            .with(file_layer)
            .init();

        vec![file_guard, console_guard]
    } else {
        // ── Production mode: console only, simpler output ──
        tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_target(false)
            .init();

        vec![]
    }
}

// ───────────────────────────────────────────────
//  Main
// ───────────────────────────────────────────────

/// Core bridge logic — returns Ok on clean shutdown, Err on failure.
async fn run_bridge_instance(config: &BridgeConfig) -> Result<(), String> {
    tracing::info!(
        "bridge starting: port={}, baud={}, ws={}, src={}, dst={}, \
         bridge_ip={}, max_failures={}, timeout_secs={}, cycle_interval_ms={}",
        config.port,
        config.baud,
        config.ws_url,
        config.src_addr,
        config.dst_addr,
        config.bridge_ip,
        config.max_failures,
        config.timeout_secs,
        config.cycle_interval_ms,
    );

    // ── Open serial port ──
    let serial_config = SerialConfig {
        port_name: config.port.clone(),
        baudrate: config.baud,
        timeout_secs: config.timeout_secs,
        src_addr: config.src_addr,
        dst_addr: config.dst_addr,
    };

    let device = SerialDeviceCommunicator::new(serial_config)
        .map_err(|e| format!("Failed to open serial port: {e}"))?;

    let device = Arc::new(Mutex::new(device));

    // ── Create channels ──
    let (tx_readings, rx_readings) = mpsc::channel::<BridgeFrame>(256);
    let (tx_commands, rx_commands) = mpsc::channel::<ServerFrame>(16);

    // ── Create serial manager ──
    let (manager, _cmd_rx, _state) = SerialReaderManager::new(config.max_failures, true);

    // ── Determine serial number ──
    let serial_number = config.port.clone();

    // ── WS state watch channel (shared between WS client and interactor) ──
    let (ws_state_tx, ws_state_rx) = watch::channel(WsState::Disconnected);

    // ── Spawn WS client task ──
    let ws_url_clone = config.ws_url.clone();
    let ws_handle = tokio::spawn(async move {
        connect_and_run(&ws_url_clone, rx_readings, tx_commands, ws_state_tx).await;
    });

    // ── Spawn serial (interactor) task ──
    let device_clone = device.clone();
    let manager_clone = manager;
    let serial_number_clone = serial_number.clone();
    let bridge_ip_clone = config.bridge_ip.clone();
    let cycle_interval = config.cycle_interval_ms; // u64, Copy
    let serial_handle = tokio::spawn(async move {
        let mut device = device_clone.lock().await;
        run_bridge(
            &mut *device,
            &manager_clone,
            &serial_number_clone,
            tx_readings.clone(),
            rx_commands,
            &bridge_ip_clone,
            ws_state_rx,
            cycle_interval,
        )
        .await;
    });

    // ── Graceful shutdown ──
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.expect("Failed to listen for Ctrl+C");
        tracing::info!("Ctrl+C received, shutting down...");
        let _ = shutdown_tx.send(()).await;
    });

    tokio::select! {
        _ = shutdown_rx.recv() => {
            tracing::info!("Shutdown signal received");
            Ok(())
        }
        _ = ws_handle => {
            tracing::warn!("WS task ended unexpectedly");
            Err("WS client task terminated".into())
        }
        _ = serial_handle => {
            tracing::warn!("Serial task ended unexpectedly");
            Err("Serial interactor task terminated".into())
        }
    }
}

#[tokio::main]
async fn main() {
    // ── Load config upfront for validation ──
    let args: Vec<String> = std::env::args().collect();

    // Try .env in CWD first, then bridge/.env (for cargo run from workspace root).
    // Silently ignore if neither exists — env vars and CLI still work.
    dotenvy::dotenv().ok();
    dotenvy::from_path("bridge/.env").ok();

    let mut config = load_config(&args);

    // ── Auto-detect local IP ──
    // The bridge IP is always auto-detected (no manual configuration).
    // It is used for IP-based register auth against the server.
    let detected = local_ip_address::local_ip().ok().map(|ip| ip.to_string());
    if let Some(ip) = &detected {
        tracing::info!("auto-detected local IP: {}", ip);
    } else {
        tracing::warn!("local IP auto-detection failed");
    }
    apply_detected_ip(&mut config, detected);

    // ── Initialize tracing after config is loaded ──
    // Keep guards alive for the entire process lifetime (non-blocking writers)
    let _tracing_guards = init_tracing(config.developer_mode);

    if config.port.is_empty() || config.ws_url.is_empty() {
        eprintln!(
            "Usage: {} --port <PORT> --ws <WS_URL> \
              [--baud 115200] [--src-addr 11] [--dst-addr 16]",
            args[0]
        );
        std::process::exit(1);
    }

    // ── Main loop with restart on failure ──
    let mut backoff: u64 = 1;
    const MAX_BACKOFF: u64 = 30;

    loop {
        let result = run_bridge_instance(&config).await;

        match result {
            Ok(()) => {
                tracing::info!("Bridge shutdown complete");
                break;
            }
            Err(e) => {
                tracing::error!("Bridge failed: {e}");
                tracing::info!("Restarting bridge in {backoff}s...");
                tokio::time::sleep(std::time::Duration::from_secs(backoff)).await;

                // Exponential backoff capped at MAX_BACKOFF
                backoff = (backoff * 2).min(MAX_BACKOFF);
            }
        }
    }
}

// ───────────────────────────────────────────────
//  Tests
// ───────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Serializes tests that read or mutate process-global env vars.
    /// `std::env::set_var`/`remove_var` affect the whole process, so env-based
    /// tests must never run concurrently or they corrupt each other.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    /// Guards an env-dependent test body against concurrent env mutation.
    fn lock_env() -> std::sync::MutexGuard<'static, ()> {
        ENV_LOCK.lock().unwrap()
    }

    // ── CLI-only tests (deterministic, no env interference) ──

    #[test]
    fn load_config_all_cli_args() {
        let args = vec![
            "bridge".to_string(),
            "--port".to_string(),
            "COM1".to_string(),
            "--baud".to_string(),
            "9600".to_string(),
            "--ws".to_string(),
            "ws://localhost:9000".to_string(),
            "--src-addr".to_string(),
            "2".to_string(),
            "--dst-addr".to_string(),
            "32".to_string(),
        ];
        let config = load_config(&args);
        assert_eq!(config.port, "COM1");
        assert_eq!(config.baud, 9600);
        assert_eq!(config.ws_url, "ws://localhost:9000");
        assert_eq!(config.src_addr, 2);
        assert_eq!(config.dst_addr, 32);
    }

    #[test]
    fn load_config_defaults_with_minimal_cli() {
        // Env tests are serialized via ENV_LOCK, so no env var can leak here.
        let _guard = lock_env();
        let args = vec![
            "bridge".to_string(),
            "--port".to_string(),
            "COM2".to_string(),
            "--ws".to_string(),
            "ws://host:8080/ws".to_string(),
        ];
        let config = load_config(&args);
        assert_eq!(config.port, "COM2");
        assert_eq!(config.baud, BridgeConfig::default().baud);
        assert_eq!(config.ws_url, "ws://host:8080/ws");
        assert_eq!(config.src_addr, BridgeConfig::default().src_addr);
        assert_eq!(config.dst_addr, BridgeConfig::default().dst_addr);
        assert_eq!(config.bridge_ip, BridgeConfig::default().bridge_ip);
        assert_eq!(config.max_failures, BridgeConfig::default().max_failures);
        assert_eq!(config.timeout_secs, BridgeConfig::default().timeout_secs);
        assert_eq!(config.cycle_interval_ms, BridgeConfig::default().cycle_interval_ms);
    }

    #[test]
    fn load_config_partial_cli() {
        let args = vec![
            "bridge".to_string(),
            "--port".to_string(),
            "/dev/ttyUSB0".to_string(),
            "--ws".to_string(),
            "ws://10.0.0.1:9000".to_string(),
            "--baud".to_string(),
            "115200".to_string(),
        ];
        let config = load_config(&args);
        assert_eq!(config.port, "/dev/ttyUSB0");
        assert_eq!(config.baud, 115200);
        assert_eq!(config.ws_url, "ws://10.0.0.1:9000");
    }

    #[test]
    fn load_config_missing_port_returns_empty() {
        let _guard = lock_env();
        let args = vec![
            "bridge".to_string(),
            "--ws".to_string(),
            "ws://localhost".to_string(),
        ];
        let config = load_config(&args);
        assert_eq!(config.port, "");
        assert_eq!(config.ws_url, "ws://localhost");
    }

    #[test]
    fn load_config_invalid_baud_cli_keeps_current() {
        let _guard = lock_env();
        let args = vec![
            "bridge".to_string(),
            "--port".to_string(),
            "COM1".to_string(),
            "--baud".to_string(),
            "not-a-number".to_string(),
            "--ws".to_string(),
            "ws://localhost".to_string(),
        ];
        let config = load_config(&args);
        assert_eq!(config.baud, BridgeConfig::default().baud);
    }

    // ── Environment variable tests ──
    //
    // NOTE: these set process-global env vars and MAY interfere if tests
    // run in parallel. Use `cargo test -p bridge -- --test-threads=1` for
    // deterministic env var isolation.

    #[test]
    fn load_config_env_overrides_defaults() {
        let _guard = lock_env();
        // SAFETY: serialized by ENV_LOCK — no concurrent env access
        unsafe { std::env::set_var("BRIDGE_BAUD", "19200"); }

        let args = vec![
            "bridge".to_string(),
            "--port".to_string(),
            "COM1".to_string(),
            "--ws".to_string(),
            "ws://localhost:9000".to_string(),
        ];
        let config = load_config(&args);
        assert_eq!(config.baud, 19200);

        unsafe { std::env::remove_var("BRIDGE_BAUD"); }
    }

    #[test]
    fn load_config_cli_overrides_env() {
        let _guard = lock_env();
        unsafe { std::env::set_var("BRIDGE_BAUD", "9600"); }
        unsafe { std::env::set_var("BRIDGE_PORT", "COM3"); }

        let args = vec![
            "bridge".to_string(),
            "--baud".to_string(),
            "115200".to_string(),
            "--port".to_string(),
            "COM1".to_string(),
            "--ws".to_string(),
            "ws://localhost:9000".to_string(),
        ];
        let config = load_config(&args);
        assert_eq!(config.baud, 115200); // CLI overrides env
        assert_eq!(config.port, "COM1");  // CLI overrides env

        unsafe { std::env::remove_var("BRIDGE_BAUD"); }
        unsafe { std::env::remove_var("BRIDGE_PORT"); }
    }

    #[test]
    fn load_config_invalid_env_value_ignored() {
        let _guard = lock_env();
        unsafe { std::env::set_var("BRIDGE_TIMEOUT_SECS", "not-a-number"); }

        let args = vec![
            "bridge".to_string(),
            "--port".to_string(),
            "COM1".to_string(),
            "--ws".to_string(),
            "ws://localhost:9000".to_string(),
        ];
        let config = load_config(&args);
        assert_eq!(config.timeout_secs, BridgeConfig::default().timeout_secs);

        unsafe { std::env::remove_var("BRIDGE_TIMEOUT_SECS"); }
    }

    #[test]
    fn load_config_cycle_interval_env_var() {
        let _guard = lock_env();
        unsafe { std::env::set_var("BRIDGE_CYCLE_INTERVAL", "2000"); }

        let args = vec![
            "bridge".to_string(),
            "--port".to_string(),
            "COM1".to_string(),
            "--ws".to_string(),
            "ws://localhost:9000".to_string(),
        ];
        let config = load_config(&args);
        assert_eq!(config.cycle_interval_ms, 2000);

        unsafe { std::env::remove_var("BRIDGE_CYCLE_INTERVAL"); }
    }

    #[test]
    fn load_config_cycle_interval_cli() {
        let args = vec![
            "bridge".to_string(),
            "--port".to_string(),
            "COM1".to_string(),
            "--ws".to_string(),
            "ws://localhost:9000".to_string(),
            "--cycle-interval".to_string(),
            "3000".to_string(),
        ];
        let config = load_config(&args);
        assert_eq!(config.cycle_interval_ms, 3000);
    }

    #[test]
    fn apply_detected_ip_sets_ip_when_detected() {
        let mut config = BridgeConfig::default();
        apply_detected_ip(&mut config, Some("10.0.0.9".into()));
        assert_eq!(config.bridge_ip, "10.0.0.9");
    }

    #[test]
    fn apply_detected_ip_keeps_empty_when_detection_fails() {
        let mut config = BridgeConfig::default();
        apply_detected_ip(&mut config, None);
        assert_eq!(config.bridge_ip, "");
    }

    #[test]
    fn apply_detected_ip_overwrites_existing_value() {
        let mut config = BridgeConfig {
            bridge_ip: "192.168.1.50".into(),
            ..Default::default()
        };
        apply_detected_ip(&mut config, Some("10.0.0.5".into()));
        assert_eq!(config.bridge_ip, "10.0.0.5");
    }

    #[test]
    fn load_config_env_and_cli_combined() {
        let _guard = lock_env();
        unsafe { std::env::set_var("SERIAL_MAX_FAILURES", "3"); }
        unsafe { std::env::set_var("BRIDGE_TIMEOUT_SECS", "5"); }

        let args = vec![
            "bridge".to_string(),
            "--port".to_string(),
            "COM1".to_string(),
            "--ws".to_string(),
            "ws://localhost:9000".to_string(),
        ];
        let config = load_config(&args);
        assert_eq!(config.max_failures, 3);   // from env
        assert_eq!(config.timeout_secs, 5);   // from env

        unsafe { std::env::remove_var("SERIAL_MAX_FAILURES"); }
        unsafe { std::env::remove_var("BRIDGE_TIMEOUT_SECS"); }
    }
}
