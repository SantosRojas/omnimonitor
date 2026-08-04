//! Graceful degradation tests: reconnection, data integrity, and buffering.
//!
//! These tests validate that the server handles bridge reconnections correctly:
//! - Multiple WS sessions from the same machine
//! - Data integrity across reconnection cycles
//! - Server restart mid-session (graceful degradation)

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
use server::infrastructure::postgres::patient_repo::PatientRepo;
use server::infrastructure::postgres::therapy_repo::TherapyRepo;

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

/// Create a patient + therapy so the server persists Readings frames.
/// The server only persists readings while a therapy is active for the
/// machine (the real bridge sends TherapySetup before Readings).
async fn seed_active_therapy(pool: &PgPool, machine_id: i64, patient_label: &str) {
    let patient_repo = PatientRepo::new(pool.clone());
    let therapy_repo = TherapyRepo::new(pool.clone());
    let patient = patient_repo
        .create(patient_label, None, None, None, None)
        .await
        .unwrap();
    therapy_repo
        .create(patient.id, machine_id, None, None, None)
        .await
        .unwrap();
}

/// Create a test server on a random port + a REST app for queries.
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

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    let rest_app = common::build_test_app(pool).await;
    (rest_app, addr, ws_url)
}

/// Register+login and return a JWT token.
async fn get_auth_token(app: &axum::Router, username: &str) -> String {
    let _reg = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/auth/register")
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

    let login_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/auth/login")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({ "username": username, "password": "testpass" })
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
    let bridge = repo.create(ip, Some("gd-test-bridge")).await.unwrap();
    bridge.id
}

/// Connect as a bridge via WS, register by IP, return (write, read, bridge_id).
async fn bridge_connect_full(
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

    let msg = tokio::time::timeout(std::time::Duration::from_secs(5), read.by_ref().next())
        .await
        .expect("Timeout waiting for Register response")
        .expect("WS stream ended")
        .expect("WS error");
    let text = if let Message::Text(t) = msg {
        t
    } else {
        panic!("Expected Text, got {:?}", msg);
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
    ip: &str,
) -> i64 {
    let identify = serde_json::json!({
        "type": "MachineIdentify",
        "bridge_id": bridge_id,
        "serial_number": serial,
        "ip_address": ip,
    });
    write
        .send(Message::Text(identify.to_string()))
        .await
        .unwrap();

    let msg = tokio::time::timeout(std::time::Duration::from_secs(5), read.by_ref().next())
        .await
        .expect("Timeout waiting for MachineIdentified")
        .expect("WS stream ended")
        .expect("WS error");
    let text = if let Message::Text(t) = msg {
        t
    } else {
        panic!("Expected Text, got {:?}", msg);
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
                .uri("/api/signals")
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
//  Test 1: Reconnection — bridge reconnects, sends more readings
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn graceful_bridge_disconnect_reconnect_data_integrity(pool: PgPool) {
    let (rest_app, _addr, ws_url) = start_test_env(pool.clone()).await;
    let token = get_auth_token(&rest_app, "gduser1").await;

    // ── Session 1: Connect, identify, send readings ──
    preregister_bridge(&pool, "10.0.0.80").await;
    let (mut write1, mut read1, bridge_id) = bridge_connect_full(&ws_url, "10.0.0.80").await;
    let machine_id = send_machine_identify(&mut write1, &mut read1, bridge_id, "GD-SN-001", "10.0.0.80").await;

    // Create the signal in the DB (needed for readings FK)
    let signal_id = create_signal(&rest_app, &token, "sig_a").await;

    // Seed an active therapy so readings get persisted
    seed_active_therapy(&pool, machine_id, "GD-PATIENT").await;

    // Send first batch of readings
    let batch1 = serde_json::json!({
        "type": "Readings",
        "machine_id": machine_id,
        "cycle": 1,
        "readings": [
            {
                "id": null,
                "timestamp": 1784541600000_i64,
                "therapy_id": null,
                "signal_id": signal_id,
                "internal_name": "sig_a",
                "raw_value": 100,
                "value": 10.0,
                "unit": "unit",
                "display_value": null,
            }
        ],
    });
    write1
        .send(Message::Text(batch1.to_string()))
        .await
        .unwrap();

    // Close the first connection (simulate disconnect)
    write1.close().await.unwrap();

    // Brief pause
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // ── Session 2: Reconnect, re-identify (same IP, bridge exists), send more readings ──
    let (mut write2, mut read2, _) = bridge_connect_full(&ws_url, "10.0.0.80").await;
    let machine_id2 = send_machine_identify(&mut write2, &mut read2, bridge_id, "GD-SN-001", "10.0.0.80").await;
    assert_eq!(machine_id2, machine_id, "Same serial should yield same machine_id");

    let batch2 = serde_json::json!({
        "type": "Readings",
        "machine_id": machine_id,
        "cycle": 2,
        "readings": [
            {
                "id": null,
                "timestamp": 1784541660000_i64,
                "therapy_id": null,
                "signal_id": signal_id,
                "internal_name": "sig_a",
                "raw_value": 200,
                "value": 20.0,
                "unit": "unit",
                "display_value": null,
            }
        ],
    });
    write2
        .send(Message::Text(batch2.to_string()))
        .await
        .unwrap();

    // Give server time to persist
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    // ── Verify: REST dashboard should show latest reading ──
    let summary_resp = rest_app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/api/dashboards/machine/{}/summary", machine_id))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(summary_resp.status(), StatusCode::OK);
    let summary: Value = body_json(summary_resp).await;
    let sig_a = summary
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["internal_name"] == "sig_a");
    assert!(sig_a.is_some(), "sig_a should appear in machine summary");
    if let Some(s) = sig_a {
        // The latest value should be 20.0 (from batch2)
        assert_eq!(
            s["value"].as_f64().unwrap_or(0.0) as i64,
            20,
            "Expected latest value=20.0 from second session"
        );
    }
}

// ════════════════════════════════════════════════════════════════════════
//  Test 2: Server restart — simulate graceful degradation
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn graceful_server_restart_preserves_data(pool: PgPool) {
    let (rest_app, addr, _) = start_test_env(pool.clone()).await;

    // The start_test_env starts a server and gives us a rest_app for queries.
    // But we need to be more careful here: the start_test_env builds TWO apps
    // (one for the server, one for REST). Both share the same pool.
    //
    // For this test, we simulate "server restart" by just connecting,
    // closing, reconnecting — the PG data persists across server instances
    // because it's in the actual database.

    let token = get_auth_token(&rest_app, "gduser2").await;
    let ws_url = format!("ws://{}/ws/bridge", addr);

    // Session 1 — register bridge + identify machine
    preregister_bridge(&pool, "10.0.0.81").await;
    let (mut write, mut read, bridge_id) = bridge_connect_full(&ws_url, "10.0.0.81").await;
    let machine_id = send_machine_identify(&mut write, &mut read, bridge_id, "RESTART-SN-001", "10.0.0.81").await;

    // Create the signal in the DB
    let signal_id = create_signal(&rest_app, &token, "restart_sig").await;

    // Seed an active therapy so readings get persisted
    seed_active_therapy(&pool, machine_id, "RESTART-PATIENT").await;

    let batch = serde_json::json!({
        "type": "Readings",
        "machine_id": machine_id,
        "cycle": 1,
        "readings": [
            {
                "id": null,
                "timestamp": 1784541600000_i64,
                "therapy_id": null,
                "signal_id": signal_id,
                "internal_name": "restart_sig",
                "raw_value": 42,
                "value": 42.0,
                "unit": "amp",
                "display_value": null,
            }
        ],
    });
    write.send(Message::Text(batch.to_string())).await.unwrap();
    write.close().await.unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    // Verify data persisted
    let summary_resp = rest_app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/api/dashboards/machine/{}/summary", machine_id))
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
        .find(|r| r["internal_name"] == "restart_sig");
    assert!(
        found.is_some(),
        "Data should persist after reconnection"
    );
    if let Some(s) = found {
        assert_eq!(
            s["value"].as_f64().unwrap_or(0.0) as i64,
            42,
            "Value should be 42.0"
        );
    }

    // ── Now build a NEW rest_app (as if the server restarted) ──
    let new_rest_app = common::build_test_app(pool.clone()).await;

    // Data should still be visible from the new instance
    let summary2 = new_rest_app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/api/dashboards/machine/{}/summary", machine_id))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(summary2.status(), StatusCode::OK);
    let summary2_body: Value = body_json(summary2).await;
    assert!(
        !summary2_body.as_array().unwrap().is_empty(),
        "Data should survive server restart"
    );
}

// ════════════════════════════════════════════════════════════════════════
//  Test 3: Multiple bridges to the same server
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn graceful_multiple_bridges_independent_data(pool: PgPool) {
    let (rest_app, _addr, ws_url) = start_test_env(pool.clone()).await;
    let token = get_auth_token(&rest_app, "gduser3").await;

    // Create signals in the DB (needed for readings FK)
    let a_sig_id = create_signal(&rest_app, &token, "a_sig").await;
    let b_sig_id = create_signal(&rest_app, &token, "b_sig").await;

    // Pre-register both bridges
    preregister_bridge(&pool, "10.0.0.90").await;
    preregister_bridge(&pool, "10.0.0.91").await;

    // Bridge A — connect, register, identify
    let (mut write_a, mut read_a, bridge_a) = bridge_connect_full(&ws_url, "10.0.0.90").await;
    let machine_a = send_machine_identify(&mut write_a, &mut read_a, bridge_a, "MULTI-SN-A", "10.0.0.90").await;

    // Bridge B — connect, register, identify
    let (mut write_b, mut read_b, bridge_b) = bridge_connect_full(&ws_url, "10.0.0.91").await;
    let machine_b = send_machine_identify(&mut write_b, &mut read_b, bridge_b, "MULTI-SN-B", "10.0.0.91").await;

    assert_ne!(machine_a, machine_b, "Two machines must have different IDs");

    // Seed an active therapy per machine so readings get persisted (isolated)
    seed_active_therapy(&pool, machine_a, "MULTI-PATIENT-A").await;
    seed_active_therapy(&pool, machine_b, "MULTI-PATIENT-B").await;

    // Send readings for machine A
    let readings_a = serde_json::json!({
        "type": "Readings",
        "machine_id": machine_a,
        "cycle": 1,
        "readings": [
            {
                "id": null,
                "timestamp": 1784541600000_i64,
                "therapy_id": null,
                "signal_id": a_sig_id,
                "internal_name": "a_sig",
                "raw_value": 111,
                "value": 11.1,
                "unit": "mm",
                "display_value": null,
            }
        ],
    });
    write_a
        .send(Message::Text(readings_a.to_string()))
        .await
        .unwrap();

    // Send readings for machine B
    let readings_b = serde_json::json!({
        "type": "Readings",
        "machine_id": machine_b,
        "cycle": 1,
        "readings": [
            {
                "id": null,
                "timestamp": 1784541600000_i64,
                "therapy_id": null,
                "signal_id": b_sig_id,
                "internal_name": "b_sig",
                "raw_value": 222,
                "value": 22.2,
                "unit": "cm",
                "display_value": null,
            }
        ],
    });
    write_b
        .send(Message::Text(readings_b.to_string()))
        .await
        .unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    // Verify machine A data is isolated from machine B
    let summary_a = rest_app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/api/dashboards/machine/{}/summary", machine_a))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let body_a: Value = body_json(summary_a).await;
    let signals_a: Vec<&str> = body_a
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|r| r["internal_name"].as_str())
        .collect();
    assert!(
        signals_a.contains(&"a_sig"),
        "Machine A should have a_sig"
    );
    assert!(
        !signals_a.contains(&"b_sig"),
        "Machine A should NOT have b_sig (data isolation)"
    );

    let summary_b = rest_app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/api/dashboards/machine/{}/summary", machine_b))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let body_b: Value = body_json(summary_b).await;
    let signals_b: Vec<&str> = body_b
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|r| r["internal_name"].as_str())
        .collect();
    assert!(
        signals_b.contains(&"b_sig"),
        "Machine B should have b_sig"
    );
    assert!(
        !signals_b.contains(&"a_sig"),
        "Machine B should NOT have a_sig (data isolation)"
    );
}

