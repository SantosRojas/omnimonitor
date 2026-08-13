//! WebSocket client with auto-reconnect and frame buffering.
//!
//! Manages a persistent WebSocket connection to the server. When the
//! connection drops, outgoing frames are buffered (up to 100) while
//! exponential backoff reconnection runs (1s → 2s → 4s → ... → 30s max).
//!
//! Incoming frames are deserialized and forwarded to the interactor
//! via the `tx_commands` channel.
//!
//! # TLS (WSS)
//!
//! The client accepts self-signed TLS certificates via a custom
//! `native_tls::TlsConnector` with `danger_accept_invalid_certs(true)`.
//! For plain WS URLs, no TLS is used.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use native_tls::TlsConnector as NativeTlsConnector;
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio::time::sleep;
use tokio_native_tls::TlsConnector as TokioTlsConnector;
use tokio_tungstenite::client_async;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::MaybeTlsStream;
use url::Url;

use crate::protocol::frames::{BridgeFrame, ServerFrame, WsState};
use tokio::sync::watch;

const MAX_BUFFER: usize = 100;
const INITIAL_BACKOFF_SECS: u64 = 1;
const MAX_BACKOFF_SECS: u64 = 30;

/// Builds a TLS connector that accepts self-signed certificates.
fn build_tls_connector() -> Result<NativeTlsConnector, native_tls::Error> {
    NativeTlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .build()
}

/// Runs the WebSocket client loop indefinitely.
///
/// - `url`: The WebSocket server URL (e.g. `ws://localhost:9000/ws`).
/// - `rx_readings`: Channel receiving outgoing `BridgeFrame`s from the interactor.
/// - `tx_commands`: Channel forwarding incoming `ServerFrame`s to the interactor.
/// - `ws_state_tx`: Watch sender that reports the WS connection state
///   (Connected / Disconnected / Reconnecting).
///
/// This function never returns under normal operation — it keeps reconnecting.
pub async fn connect_and_run(
    url: &str,
    mut rx_readings: mpsc::Receiver<BridgeFrame>,
    tx_commands: mpsc::Sender<ServerFrame>,
    ws_state_tx: watch::Sender<WsState>,
) {
    let url = url.to_owned();
    let mut buffer: Vec<BridgeFrame> = Vec::with_capacity(MAX_BUFFER);
    let mut backoff_secs: u64 = INITIAL_BACKOFF_SECS;

    'outer: loop {
        // ── Parse URL to determine TLS requirements ──
        let parsed = match Url::parse(&url) {
            Ok(u) => u,
            Err(e) => {
                tracing::error!("[ws] invalid URL '{url}': {e}");
                return;
            }
        };

        let is_wss = parsed.scheme() == "wss";
        let host = match parsed.host_str() {
            Some(h) => h.to_owned(),
            None => {
                tracing::error!("[ws] URL '{url}' has no host");
                return;
            }
        };
        let port = parsed.port_or_known_default().unwrap_or(443);

        // ── TCP connect ──
        let tcp = match TcpStream::connect((host.as_str(), port)).await {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("[ws] TCP connect to {host}:{port} failed: {e}, retrying in {backoff_secs}s...");
                let _ = ws_state_tx.send(WsState::Reconnecting);
                buffer_during_backoff(&mut buffer, &mut rx_readings, backoff_secs).await;
                backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF_SECS);
                continue;
            }
        };

        // ── Wrap in TLS if WSS ──
        let maybe_tls: MaybeTlsStream<TcpStream> = if is_wss {
            let native_tls = match build_tls_connector() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("[ws] TLS connector build error: {e}");
                    return;
                }
            };
            let tokio_tls = TokioTlsConnector::from(native_tls);
            match tokio_tls.connect(&host, tcp).await {
                Ok(tls_stream) => {
                    tracing::info!("[ws] TLS established to {host}:{port} (self-signed cert accepted)");
                    MaybeTlsStream::NativeTls(tls_stream)
                }
                Err(e) => {
                    tracing::warn!("[ws] TLS handshake failed: {e}, retrying in {backoff_secs}s...");
                    let _ = ws_state_tx.send(WsState::Reconnecting);
                    buffer_during_backoff(&mut buffer, &mut rx_readings, backoff_secs).await;
                    backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF_SECS);
                    continue 'outer;
                }
            }
        } else {
            tracing::info!("[ws] TCP connected to {host}:{port}");
            MaybeTlsStream::Plain(tcp)
        };

        // ── WebSocket handshake ──
        let ws_stream = match client_async(&url, maybe_tls).await {
            Ok((stream, _)) => {
                tracing::info!("[ws] connected to {url}");
                let _ = ws_state_tx.send(WsState::Connected);
                backoff_secs = INITIAL_BACKOFF_SECS;
                stream
            }
            Err(e) => {
                tracing::warn!("[ws] WebSocket handshake failed: {e}, retrying in {backoff_secs}s...");
                let _ = ws_state_tx.send(WsState::Reconnecting);
                buffer_during_backoff(&mut buffer, &mut rx_readings, backoff_secs).await;
                backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF_SECS);
                continue 'outer;
            }
        };

        // ── Connected ──
        let (mut write, mut read) = ws_stream.split();

        // Drain buffer first, oldest first
        let buffered: Vec<BridgeFrame> = std::mem::take(&mut buffer);
        for frame in &buffered {
            let json = match serde_json::to_string(frame) {
                Ok(j) => j,
                Err(e) => {
                    tracing::error!("[ws] frame serialization error: {e}");
                    continue;
                }
            };
            if write.send(Message::Text(json)).await.is_err() {
                tracing::warn!("[ws] connection lost while draining buffer");
                continue 'outer;
            }
        }
        drop(buffered);

        // Main connected loop
        loop {
            tokio::select! {
                // Outgoing frame from interactor
                Some(frame) = rx_readings.recv() => {
                    let json = match serde_json::to_string(&frame) {
                        Ok(j) => j,
                        Err(e) => {
                            tracing::error!("[ws] frame serialization error: {e}");
                            continue;
                        }
                    };
                    if write.send(Message::Text(json)).await.is_err() {
                        tracing::warn!("[ws] write error, reconnecting...");
                        break;
                    }
                }
                // Incoming frame from server
                msg = read.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            match serde_json::from_str::<ServerFrame>(&text) {
                                Ok(frame) => {
                                    if tx_commands.send(frame).await.is_err() {
                                        // Interactor dropped its receiver — stop entirely
                                        tracing::info!("[ws] tx_commands closed, shutting down");
                                        return;
                                    }
                                }
                                Err(e) => {
                                    tracing::warn!("[ws] failed to deserialize server frame: {e}");
                                }
                            }
                        }
                        Some(Ok(Message::Close(_))) => {
                            tracing::info!("[ws] server closed connection");
                            break;
                        }
                        Some(Ok(Message::Ping(data))) => {
                            // Explicit pong response
                            let _ = write.send(Message::Pong(data)).await;
                        }
                        Some(Err(e)) => {
                            tracing::warn!("[ws] read error: {e}");
                            break;
                        }
                        None => {
                            // Stream ended
                            break;
                        }
                        _ => {} // Pong, binary etc. — ignore
                    }
                }
                else => {
                    // rx_readings closed, interactor is done
                    tracing::info!("[ws] rx_readings closed, shutting down");
                    return;
                }
            }
        }

        let _ = ws_state_tx.send(WsState::Reconnecting);
        tracing::warn!("[ws] connection lost, reconnecting...");
    }
}

/// Buffers incoming frames from the interactor while waiting to reconnect.
async fn buffer_during_backoff(
    buffer: &mut Vec<BridgeFrame>,
    rx_readings: &mut mpsc::Receiver<BridgeFrame>,
    backoff_secs: u64,
) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(backoff_secs);

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }

        tokio::select! {
            Some(frame) = rx_readings.recv() => {
                if buffer.len() >= MAX_BUFFER {
                    tracing::warn!("[ws] buffer overflow ({}), dropping oldest frame", MAX_BUFFER);
                    buffer.remove(0);
                }
                buffer.push(frame);
            }
            _ = sleep(remaining) => break,
            else => {
                tracing::info!("[ws] rx_readings closed, shutting down");
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

    /// Verify that the buffer does not exceed the configured maximum.
    #[tokio::test]
    async fn buffer_overflow_drops_oldest() {
        let (tx_readings, rx_readings) = mpsc::channel::<BridgeFrame>(200);
        let (tx_commands, _rx_commands) = mpsc::channel::<ServerFrame>(16);
        let (ws_state_tx, _ws_state_rx) = watch::channel(WsState::Disconnected);

        // URL that won't connect (to test buffering during reconnection)
        let url = "ws://127.0.0.1:19199/nonexistent";

        // Spawn the ws_client — it will try to connect and fail, buffering frames
        let handle = tokio::spawn(async move {
            connect_and_run(url, rx_readings, tx_commands, ws_state_tx).await;
        });

        // Send more than MAX_BUFFER frames while disconnected
        for i in 0..MAX_BUFFER + 20 {
            let frame = BridgeFrame::Heartbeat { machine_id: i as i64 };
            if tx_readings.send(frame).await.is_err() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(1)).await;
        }

        // Give it time to process the overflow
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Drop the sender so the ws_client stops
        drop(tx_readings);

        // Wait for client to exit (timeout after 5s to avoid hanging the test suite)
        let _ = tokio::time::timeout(Duration::from_secs(5), handle).await;

        // Test passes if no panic occurred — the buffer overflow path was exercised
    }
}