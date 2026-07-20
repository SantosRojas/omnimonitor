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

mod interactor;
mod protocol;
mod serial;
mod ws_client;

use std::sync::Arc;

use tokio::sync::{Mutex, mpsc};

use crate::interactor::run_bridge;
use crate::protocol::frames::{BridgeFrame, ServerFrame};
use crate::serial::communicator::{SerialConfig, SerialDeviceCommunicator};
use crate::serial::manager::SerialReaderManager;
use crate::ws_client::connect_and_run;

/// Default serial port parameters.
const DEFAULT_BAUD: u32 = 115200;
const DEFAULT_SRC_ADDR: u8 = 1;
const DEFAULT_DST_ADDR: u8 = 16;
const DEFAULT_TIMEOUT_SECS: u64 = 3;
const DEFAULT_MAX_FAILURES: u32 = 10;

#[tokio::main]
async fn main() {
    // ── Parse CLI args ──
    let args: Vec<String> = std::env::args().collect();

    let (port, baud, ws_url, src_addr, dst_addr) = parse_args(&args);

    if port.is_empty() || ws_url.is_empty() {
        eprintln!("Usage: {} --port <PORT> --ws <WS_URL> [--baud 115200] [--src-addr 1] [--dst-addr 16]", args[0]);
        std::process::exit(1);
    }

    // Initialize tracing (simple env_logger style — use RUST_LOG for level)
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tracing::info!(
        "bridge starting: port={port}, baud={baud}, ws={ws_url}, src={src_addr}, dst={dst_addr}"
    );

    // ── Open serial port ──
    let config = SerialConfig {
        port_name: port.clone(),
        baudrate: baud,
        timeout_secs: DEFAULT_TIMEOUT_SECS,
        src_addr,
        dst_addr,
    };

    let device = match SerialDeviceCommunicator::new(config) {
        Ok(d) => d,
        Err(e) => {
            tracing::error!("Failed to open serial port: {e}");
            std::process::exit(1);
        }
    };

    let device = Arc::new(Mutex::new(device));

    // ── Create channels ──
    // readings channel: serial/interactor → WS → server
    let (tx_readings, rx_readings) = mpsc::channel::<BridgeFrame>(256);
    // commands channel: server → WS → serial/interactor
    let (tx_commands, rx_commands) = mpsc::channel::<ServerFrame>(16);

    // ── Create serial manager ──
    let (manager, _cmd_rx, _state) =
        SerialReaderManager::new(DEFAULT_MAX_FAILURES, true);

    // ── Determine serial number ──
    let serial_number = port.clone(); // fallback: use port name

    // ── Spawn WS client task ──
    let ws_url_clone = ws_url.clone();
    let ws_handle = tokio::spawn(async move {
        connect_and_run(&ws_url_clone, rx_readings, tx_commands).await;
    });

    // ── Spawn serial (interactor) task ──
    let device_clone = device.clone();
    let manager_clone = manager;
    let serial_number_clone = serial_number.clone();
    let serial_handle = tokio::spawn(async move {
        let mut device = device_clone.lock().await;
        run_bridge(
            &mut *device,
            &manager_clone,
            &serial_number_clone,
            tx_readings.clone(),
            rx_commands,
        )
        .await;
    });

    // ── Graceful shutdown ──
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

    // Handle Ctrl+C
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.expect("Failed to listen for Ctrl+C");
        tracing::info!("Ctrl+C received, shutting down...");
        let _ = shutdown_tx.send(()).await;
    });

    // Wait for shutdown signal or task completion
    tokio::select! {
        _ = shutdown_rx.recv() => {
            tracing::info!("Shutdown signal received");
        }
        _ = ws_handle => {
            tracing::info!("WS task ended");
        }
        _ = serial_handle => {
            tracing::info!("Serial task ended");
        }
    }

    tracing::info!("Bridge shutdown complete");
}

/// Parses CLI arguments.
///
/// Supported flags:
/// - `--port <port>` (required): Serial port name (e.g. COM1, /dev/ttyUSB0)
/// - `--ws <url>` (required): WebSocket server URL (e.g. ws://localhost:9000/ws)
/// - `--baud <rate>` (optional, default: 115200): Baud rate
/// - `--src-addr <addr>` (optional, default: 1): Source application address
/// - `--dst-addr <addr>` (optional, default: 16): Destination application address
fn parse_args(args: &[String]) -> (String, u32, String, u8, u8) {
    let mut port = String::new();
    let mut baud = DEFAULT_BAUD;
    let mut ws_url = String::new();
    let mut src_addr = DEFAULT_SRC_ADDR;
    let mut dst_addr = DEFAULT_DST_ADDR;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--port" => {
                if i + 1 < args.len() {
                    port = args[i + 1].clone();
                    i += 2;
                } else {
                    eprintln!("Missing value for --port");
                    i += 1;
                }
            }
            "--baud" => {
                if i + 1 < args.len() {
                    baud = args[i + 1].parse().unwrap_or(DEFAULT_BAUD);
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "--ws" => {
                if i + 1 < args.len() {
                    ws_url = args[i + 1].clone();
                    i += 2;
                } else {
                    eprintln!("Missing value for --ws");
                    i += 1;
                }
            }
            "--src-addr" => {
                if i + 1 < args.len() {
                    src_addr = args[i + 1].parse().unwrap_or(DEFAULT_SRC_ADDR);
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "--dst-addr" => {
                if i + 1 < args.len() {
                    dst_addr = args[i + 1].parse().unwrap_or(DEFAULT_DST_ADDR);
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

    (port, baud, ws_url, src_addr, dst_addr)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_args_all_provided() {
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
        let (port, baud, ws_url, src_addr, dst_addr) = parse_args(&args);
        assert_eq!(port, "COM1");
        assert_eq!(baud, 9600);
        assert_eq!(ws_url, "ws://localhost:9000");
        assert_eq!(src_addr, 2);
        assert_eq!(dst_addr, 32);
    }

    #[test]
    fn parse_args_defaults() {
        let args = vec![
            "bridge".to_string(),
            "--port".to_string(),
            "COM2".to_string(),
            "--ws".to_string(),
            "ws://host:8080/ws".to_string(),
        ];
        let (port, baud, ws_url, src_addr, dst_addr) = parse_args(&args);
        assert_eq!(port, "COM2");
        assert_eq!(baud, DEFAULT_BAUD);
        assert_eq!(ws_url, "ws://host:8080/ws");
        assert_eq!(src_addr, DEFAULT_SRC_ADDR);
        assert_eq!(dst_addr, DEFAULT_DST_ADDR);
    }

    #[test]
    fn parse_args_partial() {
        let args = vec![
            "bridge".to_string(),
            "--port".to_string(),
            "/dev/ttyUSB0".to_string(),
            "--ws".to_string(),
            "ws://10.0.0.1:9000".to_string(),
            "--baud".to_string(),
            "115200".to_string(),
        ];
        let (port, baud, ws_url, _, _) = parse_args(&args);
        assert_eq!(port, "/dev/ttyUSB0");
        assert_eq!(baud, 115200);
        assert_eq!(ws_url, "ws://10.0.0.1:9000");
    }

    #[test]
    fn parse_args_missing_port() {
        // Missing --port should return empty string
        let args = vec![
            "bridge".to_string(),
            "--ws".to_string(),
            "ws://localhost".to_string(),
        ];
        let (port, _, ws_url, _, _) = parse_args(&args);
        assert_eq!(port, ""); // port is required
        assert_eq!(ws_url, "ws://localhost");
    }

    #[test]
    fn parse_args_invalid_baud_defaults() {
        // Invalid baud value should use default
        let args = vec![
            "bridge".to_string(),
            "--port".to_string(),
            "COM1".to_string(),
            "--baud".to_string(),
            "not-a-number".to_string(),
            "--ws".to_string(),
            "ws://localhost".to_string(),
        ];
        let (_, baud, _, _, _) = parse_args(&args);
        assert_eq!(baud, DEFAULT_BAUD);
    }
}
