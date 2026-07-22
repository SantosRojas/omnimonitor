//! Integration tests for all REST API handlers.
//!
//! Each test creates a fresh PostgreSQL database, applies the migration,
//! builds a fully-wired Axum router, and sends HTTP requests via `tower::ServiceExt::oneshot`.

use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::PgPool;
use tower::ServiceExt;

mod common;

/// Read the full response body into bytes.
async fn body_bytes(response: axum::response::Response) -> Vec<u8> {
    let collected = response.into_body().collect().await.unwrap();
    collected.to_bytes().to_vec()
}

/// Deserialize response body as JSON value.
async fn body_json(response: axum::response::Response) -> Value {
    serde_json::from_slice(&body_bytes(response).await).unwrap()
}

// ════════════════════════════════════════════════════════════════════════
//  Auth API tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn auth_register_creates_user(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/register")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "newuser", "password": "secret123", "role": "operator"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    let body: Value = body_json(response).await;
    assert_eq!(body["username"], "newuser");
    assert_eq!(body["role"], "operator");
}

#[sqlx::test]
async fn auth_register_defaults_to_viewer(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/register")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "viewer1", "password": "secret"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    let body: Value = body_json(response).await;
    assert_eq!(body["role"], "viewer");
}

#[sqlx::test]
async fn auth_register_duplicate_username(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    let payload = serde_json::json!({"username": "dup", "password": "secret", "role": "viewer"}).to_string();

    // First registration succeeds
    let res1 = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/auth/register")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(payload.clone()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res1.status(), StatusCode::CREATED);

    // Second registration with same username → 409
    let res2 = app
        .oneshot(
            Request::builder()
                .uri("/auth/register")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res2.status(), StatusCode::CONFLICT);
}

#[sqlx::test]
async fn auth_register_invalid_role(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/register")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "bad", "password": "secret", "role": "superadmin"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn auth_login_success(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    // Register first
    let _ = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/auth/register")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "logintest", "password": "pass123", "role": "admin"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Login
    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/login")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "logintest", "password": "pass123"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = body_json(response).await;
    assert!(body["token"].as_str().unwrap().len() > 20);
    assert_eq!(body["role"], "admin");
}

#[sqlx::test]
async fn auth_login_wrong_password(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    // Register
    let _ = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/auth/register")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "loginfail", "password": "correct"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Login with wrong password
    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/login")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "loginfail", "password": "wrong"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn auth_login_nonexistent_user(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/login")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "nobody", "password": "anything"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

// ════════════════════════════════════════════════════════════════════════
//  Machines API tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn machines_list_empty(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(Request::builder().uri("/machines").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = body_json(response).await;
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[sqlx::test]
async fn machines_get_not_found(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/machines/999999")
                .method(Method::GET)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn machines_update_not_found(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/machines/999999")
                .method(Method::PUT)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"label": "Ghost Machine"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn machines_delete_not_found(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/machines/999999")
                .method(Method::DELETE)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ════════════════════════════════════════════════════════════════════════
//  Patients API tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn patients_create_and_list(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    // Create
    let create_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/patients")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"external_id": "PAT-001"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create_resp.status(), StatusCode::CREATED);

    // List
    let list_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/patients")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_resp.status(), StatusCode::OK);
    let body: Value = body_json(list_resp).await;
    assert_eq!(body.as_array().unwrap().len(), 1);
    assert_eq!(body[0]["external_id"], "PAT-001");
}

#[sqlx::test]
async fn patients_create_duplicate(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    let payload = serde_json::json!({"external_id": "DUP"}).to_string();

    let res1 = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/patients")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(payload.clone()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res1.status(), StatusCode::CREATED);

    let res2 = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/patients")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res2.status(), StatusCode::CONFLICT);
}

#[sqlx::test]
async fn patients_get_not_found(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/patients/999999")
                .method(Method::GET)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn patients_get_with_therapy_count(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    // Create patient
    let create_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/patients")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"external_id": "PCNT-001"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let created: Value = body_json(create_resp).await;
    let patient_id = created["id"].as_i64().unwrap();

    // Get patient with therapy count (should be 0)
    let get_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/patients/{}", patient_id))
                .method(Method::GET)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get_resp.status(), StatusCode::OK);
    let body: Value = body_json(get_resp).await;
    assert_eq!(body["therapy_count"], 0);
}

#[sqlx::test]
async fn patients_update(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    // Create
    let create_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/patients")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"external_id": "OLD"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let created: Value = body_json(create_resp).await;
    let patient_id = created["id"].as_i64().unwrap();

    // Update
    let update_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/patients/{}", patient_id))
                .method(Method::PUT)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"external_id": "NEW"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(update_resp.status(), StatusCode::OK);
    let body: Value = body_json(update_resp).await;
    assert_eq!(body["external_id"], "NEW");
}

#[sqlx::test]
async fn patients_list_search(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    // Create two patients
    for ext_id in &["SEARCH-ONE", "SEARCH-TWO", "OTHER"] {
        app.clone()
            .oneshot(
                Request::builder()
                    .uri("/patients")
                    .method(Method::POST)
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({"external_id": ext_id}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
    }

    // Search
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/patients?search=SEARCH")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body: Value = body_json(resp).await;
    assert_eq!(body.as_array().unwrap().len(), 2);
}

// ════════════════════════════════════════════════════════════════════════
//  Therapies API tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn therapies_list_empty(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/therapies")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = body_json(response).await;
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[sqlx::test]
async fn therapies_get_not_found(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/therapies/999999")
                .method(Method::GET)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn therapies_update_status_invalid(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/therapies/1")
                .method(Method::PUT)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"status": "invalid_status"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

// ════════════════════════════════════════════════════════════════════════
//  Signals API tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn signals_create_and_list(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    // Create signal
    let create_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/signals")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"internal_name": "g_pressure", "display_name": "Pressure", "unit": "mmHg"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create_resp.status(), StatusCode::CREATED);

    // List
    let list_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/signals")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_resp.status(), StatusCode::OK);
    let body: Value = body_json(list_resp).await;
    assert!(!body.as_array().unwrap().is_empty());
    // Response structure: [{ signal: {...}, value_mappings: [...] }]
    assert!(body[0].get("signal").is_some());
    assert!(body[0].get("value_mappings").is_some());
}

#[sqlx::test]
async fn signals_update_not_found(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/signals/999999")
                .method(Method::PUT)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"display_name": "Ghost"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn signals_delete_not_found(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/signals/999999")
                .method(Method::DELETE)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn signals_full_crud(pool: PgPool) {
    let app = common::build_test_app(pool).await;

    // Create
    let create_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/signals")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"internal_name": "sig_crud", "display_name": "CRUD Signal", "unit": "cm"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create_resp.status(), StatusCode::CREATED);
    let created: Value = body_json(create_resp).await;
    let signal_id = created["id"].as_i64().unwrap();

    // Update
    let update_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/signals/{}", signal_id))
                .method(Method::PUT)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"display_name": "Updated Signal"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(update_resp.status(), StatusCode::OK);
    let body: Value = body_json(update_resp).await;
    assert_eq!(body["display_name"], "Updated Signal");

    // Add mapping
    let mapping_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/signals/{}/mappings", signal_id))
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"numeric_value": "0", "display_name": "Off"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(mapping_resp.status(), StatusCode::CREATED);
    let mapping_body: Value = body_json(mapping_resp).await;
    let mapping_id = mapping_body["id"].as_i64().unwrap();

    // Delete mapping
    let del_map_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/signals/{}/mappings/{}", signal_id, mapping_id))
                .method(Method::DELETE)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(del_map_resp.status(), StatusCode::NO_CONTENT);

    // Delete signal
    let del_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/signals/{}", signal_id))
                .method(Method::DELETE)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(del_resp.status(), StatusCode::NO_CONTENT);
}

// ════════════════════════════════════════════════════════════════════════
//  Dashboards API tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn dashboards_machine_summary_empty(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/dashboards/machine/999999/summary")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = body_json(response).await;
    assert!(body.as_array().unwrap().is_empty());
}

#[sqlx::test]
async fn dashboards_therapy_aggregates_empty(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/dashboards/therapy/999999/aggregates")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = body_json(response).await;
    assert!(body.as_array().unwrap().is_empty());
}

#[sqlx::test]
async fn dashboards_therapy_timeseries_empty(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/dashboards/therapy/999999/timeseries")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = body_json(response).await;
    assert!(body.as_array().unwrap().is_empty());
}

#[sqlx::test]
async fn dashboards_patient_history_empty(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/dashboards/patient/999999/history")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = body_json(response).await;
    assert!(body.as_array().unwrap().is_empty());
}

// ════════════════════════════════════════════════════════════════════════
//  Export API tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn export_therapies_csv_empty(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/export/therapies?format=csv")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let content_type = response.headers().get("content-type").unwrap().to_str().unwrap().to_string();
    assert!(content_type.contains("csv"));
}

#[sqlx::test]
async fn export_readings_csv_empty(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/export/readings?therapy_id=999999&format=csv")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let content_type = response.headers().get("content-type").unwrap().to_str().unwrap().to_string();
    assert!(content_type.contains("csv"));
}

#[sqlx::test]
async fn export_readings_json_empty(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/export/readings?therapy_id=999999&format=json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = body_json(response).await;
    assert!(body.as_array().unwrap().is_empty());
}

// ════════════════════════════════════════════════════════════════════════
//  Health check makes sure basic routing works
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn health_check_returns_ok(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}
