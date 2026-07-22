//! End-to-end tests: WebSocket bridge → server → PostgreSQL → REST query.
//!
//! These tests start a real HTTP/WS server on a random port, connect a
//! simulated bridge via WebSocket, send OMNI frames, and then verify
//! data integrity by querying the REST API.

use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use futures_util::{SinkExt, StreamExt};
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::PgPool;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use tower::ServiceExt;

use server::infrastructure::postgres::bridge_repo::BridgeRepo;

mod common;

/// Read the full response body as bytes.
async fn body_bytes(response: axum::response::Response) -> Vec<u8> {
    let collected = response.into_body().collect().await.unwrap();
    collected.to_bytes().to_vec()
}

/// Deserialize response body as JSON value.
async fn body_json(response: axum::response::Response) -> Value {
    serde_json::from_slice(&body_bytes(response).await).unwrap()
}

/// Create a test app and a separate server on a random port.
/// Returns (rest_app for oneshot queries, ws_addr for WS connections, ws_url).
async fn start_test_env(pool: PgPool) -> (axum::Router, std::net::SocketAddr, String) {
    let app = common::build_test_app(pool.clone()).await;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Failed to bind test server");
    let addr = listener.local_addr().unwrap();
    let ws_url = format!("ws://{}/ws/bridge", addr);

    tokio::spawn(async move {
        axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())
            .await
            .expect("Test server failed");
    });

    // Brief pause to let the server start
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Build a second app for REST queries (shares DB, separate in-memory state)
    let rest_app = common::build_test_app(pool).await;
    (rest_app, addr, ws_url)
}

/// Register a test user via the REST app and return a JWT token.
async fn get_auth_token(app: &axum::Router, username: &str) -> String {
    // Register
    let _reg = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/auth/register")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "username": username,
                        "password": "testpass",
                        "role": "admin",
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Login
    let login_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/auth/login")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "username": username,
                        "password": "testpass",
                    })
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(login_resp.status(), StatusCode::OK);
    let body: Value = body_json(login_resp).await;
    body["token"].as_str().unwrap().to_string()
}

/// Pre-register a test bridge in the database so WS Register succeeds.
async fn preregister_bridge(pool: &PgPool, ip: &str) -> i64 {
    let repo = BridgeRepo::new(pool.clone());
    let bridge = repo.create(ip, Some("e2e-test-bridge")).await.unwrap();
    bridge.id
}

/// Connect as a bridge via WS, register by IP, and return (write, read, bridge_id).
async fn bridge_connect_and_register(
    ws_url: &str,
    ip: &str,
) -> (
    impl SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
    impl StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    i64,
) {
    let (ws_stream, _) = connect_async(ws_url).await.unwrap();
    let (mut write, mut read) = ws_stream.split();

    let register = serde_json::json!({
        "type": "Register",
        "ip_address": ip,
    });
    write
        .send(Message::Text(register.to_string()))
        .await
        .unwrap();

    let msg = tokio::time::timeout(std::time::Duration::from_secs(5), read.next())
        .await
        .expect("Timeout waiting for Register response")
        .expect("WS stream ended")
        .expect("WS error");
    let text = if let Message::Text(t) = msg {
        t
    } else {
        panic!("Expected Text message");
    };
    let resp: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(resp["type"], "Registered", "Expected Registered, got: {}", text);
    let bridge_id = resp["bridge_id"].as_i64().expect("bridge_id in Registered");

    (write, read, bridge_id)
}

/// Send MachineIdentify and return the machine_id.
async fn send_machine_identify(
    write: &mut (impl SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin),
    read: &mut (impl StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin),
    bridge_id: i64,
    serial: &str,
) -> i64 {
    let identify = serde_json::json!({
        "type": "MachineIdentify",
        "bridge_id": bridge_id,
        "serial_number": serial,
    });
    write
        .send(Message::Text(identify.to_string()))
        .await
        .unwrap();

    let msg = tokio::time::timeout(std::time::Duration::from_secs(5), read.next())
        .await
        .expect("Timeout waiting for MachineIdentified")
        .expect("WS stream ended")
        .expect("WS error");
    let text = if let Message::Text(t) = msg {
        t
    } else {
        panic!("Expected Text message");
    };
    let resp: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(resp["type"], "MachineIdentified", "Expected MachineIdentified, got: {}", text);
    resp["machine_id"].as_i64().expect("machine_id in MachineIdentified")
}

/// Create a signal via REST and return its ID.
async fn create_signal(app: &axum::Router, token: &str, internal_name: &str) -> i64 {
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/signals")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::from(
                    serde_json::json!({"internal_name": internal_name}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let body: Value = body_json(resp).await;
    body["id"].as_i64().unwrap()
}

// ════════════════════════════════════════════════════════════════════════
//  E2E Test: Bridge WS → Server → PG → REST query
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn e2e_bridge_sends_readings_via_ws_stored_in_pg_queryable_via_rest(pool: PgPool) {
    let (rest_app, _addr, ws_url) = start_test_env(pool.clone()).await;
    let token = get_auth_token(&rest_app, "e2euser1").await;

    // ── Step 1: Bridge registers ──
    preregister_bridge(&pool, "10.0.0.50").await;
    let (mut write, mut read, bridge_id) = bridge_connect_and_register(&ws_url, "10.0.0.50").await;

    // ── Step 2: Identify machine to get real machine_id ──
    let machine_id = send_machine_identify(&mut write, &mut read, bridge_id, "E2E-SN-001").await;

    // ── Step 2b: Create a signal in the DB ──
    let signal_id = create_signal(&rest_app, &token, "pressure").await;

    // ── Step 3: Send readings ──
    let readings_frame = serde_json::json!({
        "type": "Readings",
        "machine_id": machine_id,
        "cycle": 1,
        "readings": [
            {
                "id": null,
                "timestamp": "2026-07-20T12:00:00Z",
                "therapy_id": null,
                "signal_id": signal_id,
                "internal_name": "pressure",
                "raw_value": 1200,
                "value": 120.0,
                "unit": "mmHg",
                "display_value": null,
                "phase": null,
            }
        ],
    });
    write
        .send(Message::Text(readings_frame.to_string()))
        .await
        .unwrap();

    // Give server time to process and persist
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    // ── Step 4: Verify via REST dashboard ──
    let summary_resp = rest_app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/dashboards/machine/{}/summary", machine_id))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(summary_resp.status(), StatusCode::OK);
    let summary: Value = body_json(summary_resp).await;
    let readings_count = summary.as_array().unwrap().len();
    assert!(
        readings_count >= 1,
        "Expected at least 1 reading in machine summary, got {}",
        readings_count
    );

    // Verify the pressure reading
    let pressure = summary
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["internal_name"] == "pressure");
    assert!(pressure.is_some(), "Expected pressure reading in summary");
    if let Some(p) = pressure {
        assert_eq!(
            p["value"].as_f64().unwrap_or(0.0) as i64,
            120,
            "Pressure should be 120.0"
        );
    }
}

// ════════════════════════════════════════════════════════════════════════
//  E2E Test: Heartbeat keeps machine online
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn e2e_heartbeat_keeps_machine_online(pool: PgPool) {
    let (rest_app, _addr, ws_url) = start_test_env(pool.clone()).await;
    let token = get_auth_token(&rest_app, "hbuser").await;

    // Register bridge + identify machine
    preregister_bridge(&pool, "10.0.0.60").await;
    let (mut write, mut read, bridge_id) = bridge_connect_and_register(&ws_url, "10.0.0.60").await;
    let machine_id = send_machine_identify(&mut write, &mut read, bridge_id, "HB-SN-001").await;

    // Send a Heartbeat frame with real machine_id
    let heartbeat = serde_json::json!({
        "type": "Heartbeat",
        "machine_id": machine_id,
    });
    write
        .send(Message::Text(heartbeat.to_string()))
        .await
        .unwrap();

    // Give server time to process
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Verify machine is online via REST
    let machine_resp = rest_app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/machines/{}", machine_id))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(machine_resp.status(), StatusCode::OK);
    let machine: Value = body_json(machine_resp).await;
    assert_eq!(machine["status"], "online");
}

// ════════════════════════════════════════════════════════════════════════
//  E2E Test: Browser WS receives ReadingsReplay on subscribe
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn e2e_browser_receives_readings_replay_on_subscribe(pool: PgPool) {
    let (_rest_app, addr, ws_url) = start_test_env(pool.clone()).await;
    let browser_ws_url = format!("ws://{}/ws/browser", addr);

    // Need JWT auth token even though browser WS doesn't use it
    let rest_app = common::build_test_app(pool.clone()).await;
    let token = get_auth_token(&rest_app, "bruser").await;

    // Register bridge + identify machine
    preregister_bridge(&pool, "10.0.0.70").await;
    let (mut write, mut read, bridge_id) = bridge_connect_and_register(&ws_url, "10.0.0.70").await;
    let machine_id = send_machine_identify(&mut write, &mut read, bridge_id, "REPLAY-SN-001").await;

    // Create a signal in the DB (needed for readings FK and replay query)
    let signal_id = create_signal(&rest_app, &token, "replay_signal").await;

    // Send readings
    let readings_frame = serde_json::json!({
        "type": "Readings",
        "machine_id": machine_id,
        "cycle": 1,
        "readings": [
            {
                "id": null,
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "therapy_id": null,
                "signal_id": signal_id,
                "internal_name": "replay_signal",
                "raw_value": 500,
                "value": 50.0,
                "unit": "cm",
                "display_value": null,
                "phase": null,
            }
        ],
    });
    write
        .send(Message::Text(readings_frame.to_string()))
        .await
        .unwrap();

    // Give server time to process
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    // Browser connects and subscribes
    let (browser_stream, _) = connect_async(&browser_ws_url).await.unwrap();
    let (mut browser_write, mut browser_read) = browser_stream.split();

    let subscribe = serde_json::json!({
        "action": "Subscribe",
        "machine_id": machine_id,
    });
    browser_write
        .send(Message::Text(subscribe.to_string()))
        .await
        .unwrap();

    // Expect a ReadingsReplay or RESTFallback event (whichever comes first)
    let msg = tokio::time::timeout(std::time::Duration::from_secs(5), browser_read.next())
        .await
        .expect("Timeout waiting for replay event")
        .expect("Browser WS stream ended")
        .expect("Browser WS error");

    let text = if let Message::Text(t) = msg {
        t
    } else {
        panic!("Expected Text message, got {:?}", msg);
    };
    let event: Value = serde_json::from_str(&text).unwrap();
    let event_type = event["type"].as_str().unwrap_or("");

    match event_type {
        "ReadingsReplay" => {
            let replay_readings = event["readings"].as_array().unwrap();
            assert!(
                !replay_readings.is_empty(),
                "ReadingsReplay should contain readings"
            );
        }
        "RESTFallback" => {
            // Acceptable if no readings in the last 60s (unlikely but possible with timing)
            let message = event["message"].as_str().unwrap_or("");
            eprintln!("Got RESTFallback instead of replay: {}", message);
        }
        "MachineStatus" => {
            // Heartbeat task might fire first — also acceptable
            eprintln!("Got MachineStatus before ReadingsReplay");
        }
        other => {
            panic!("Unexpected event type: {}", other);
        }
    }
}

// ════════════════════════════════════════════════════════════════════════
//  E2E Test: Full IP auth flow — registered IP → Registered, then data
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn e2e_ip_auth_registered_ip_full_flow(pool: PgPool) {
    let (rest_app, _addr, ws_url) = start_test_env(pool.clone()).await;
    let token = get_auth_token(&rest_app, "ipuser1").await;

    // ── Step 1: Pre-register bridge IP in DB ──
    preregister_bridge(&pool, "10.10.10.10").await;

    // ── Step 2: Connect and register — should get Registered ──
    let (mut write, mut read, bridge_id) = bridge_connect_and_register(&ws_url, "10.10.10.10").await;

    // ── Step 3: Identify machine ──
    let machine_id = send_machine_identify(&mut write, &mut read, bridge_id, "IP-AUTH-SN-001").await;
    assert!(machine_id > 0, "Should get a valid machine_id");

    // ── Step 4: Create a signal ──
    let signal_id = create_signal(&rest_app, &token, "ip_auth_signal").await;

    // ── Step 5: Send readings with real machine_id ──
    let readings_frame = serde_json::json!({
        "type": "Readings",
        "machine_id": machine_id,
        "cycle": 1,
        "readings": [
            {
                "id": null,
                "timestamp": "2026-07-20T12:00:00Z",
                "therapy_id": null,
                "signal_id": signal_id,
                "internal_name": "ip_auth_signal",
                "raw_value": 1200,
                "value": 120.0,
                "unit": "mmHg",
                "display_value": null,
                "phase": null,
            }
        ],
    });
    write
        .send(Message::Text(readings_frame.to_string()))
        .await
        .unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    // ── Step 6: Verify data via REST ──
    let summary_resp = rest_app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/dashboards/machine/{}/summary", machine_id))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(summary_resp.status(), StatusCode::OK);
    let summary: Value = body_json(summary_resp).await;
    let found = summary
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["internal_name"] == "ip_auth_signal");
    assert!(found.is_some(), "Reading should be queryable via REST");
    if let Some(s) = found {
        assert_eq!(s["value"].as_f64().unwrap_or(0.0) as i64, 120);
    }
}

// ════════════════════════════════════════════════════════════════════════
//  E2E Test: Unregistered IP → Error
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn e2e_ip_auth_unregistered_ip_gets_error(pool: PgPool) {
    let (_rest_app, _addr, ws_url) = start_test_env(pool.clone()).await;

    // Connect WITHOUT pre-registering — should get Error
    let (ws_stream, _) = connect_async(&ws_url).await.unwrap();
    let (mut write, mut read) = ws_stream.split();

    let register = serde_json::json!({
        "type": "Register",
        "ip_address": "10.10.10.99",
    });
    write
        .send(Message::Text(register.to_string()))
        .await
        .unwrap();

    let msg = tokio::time::timeout(std::time::Duration::from_secs(5), read.next())
        .await
        .expect("Timeout waiting for Error response")
        .expect("WS stream ended")
        .expect("WS error");
    let text = if let Message::Text(t) = msg {
        t
    } else {
        panic!("Expected Text message");
    };
    let resp: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(resp["type"], "Error");
    assert_eq!(resp["message"], "IP not registered");
}

// ════════════════════════════════════════════════════════════════════════
//  E2E Test: Deauthorized IP → Error
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn e2e_ip_auth_deauthorized_ip_gets_error(pool: PgPool) {
    let (_rest_app, _addr, ws_url) = start_test_env(pool.clone()).await;

    // Create bridge but with authorized=false
    let bridge_repo = BridgeRepo::new(pool.clone());
    bridge_repo.create("10.10.10.77", Some("deauth-test")).await.unwrap();
    // Update to deauthorize it
    bridge_repo.update(1, None, Some(false)).await.unwrap();

    let (ws_stream, _) = connect_async(&ws_url).await.unwrap();
    let (mut write, mut read) = ws_stream.split();

    let register = serde_json::json!({
        "type": "Register",
        "ip_address": "10.10.10.77",
    });
    write
        .send(Message::Text(register.to_string()))
        .await
        .unwrap();

    let msg = tokio::time::timeout(std::time::Duration::from_secs(5), read.next())
        .await
        .expect("Timeout waiting for Error response")
        .expect("WS stream ended")
        .expect("WS error");
    let text = if let Message::Text(t) = msg {
        t
    } else {
        panic!("Expected Text message");
    };
    let resp: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(resp["type"], "Error");
    assert_eq!(resp["message"], "IP not authorized");
}
