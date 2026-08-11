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
                .uri("/api/auth/register")
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
                .uri("/api/auth/register")
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
                .uri("/api/auth/register")
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
                .uri("/api/auth/register")
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
                .uri("/api/auth/register")
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
                .uri("/api/auth/register")
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
                .uri("/api/auth/login")
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
                .uri("/api/auth/register")
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
                .uri("/api/auth/login")
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
                .uri("/api/auth/login")
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
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/machines")
                .header("authorization", format!("Bearer {}", token))
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
async fn machines_get_not_found(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/machines/999999")
                .method(Method::GET)
                .header("authorization", format!("Bearer {}", token))
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
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/machines/999999")
                .method(Method::PUT)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
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
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/machines/999999")
                .method(Method::DELETE)
                .header("authorization", format!("Bearer {}", token))
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
    let token = common::test_jwt();

    // Create
    let create_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/patients")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", &token))
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
                .uri("/api/patients")
                .header("authorization", format!("Bearer {}", &token))
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
    let token = common::test_jwt();

    let payload = serde_json::json!({"external_id": "DUP"}).to_string();

    let res1 = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/patients")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", &token))
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
                .uri("/api/patients")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", &token))
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
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/patients/999999")
                .method(Method::GET)
                .header("authorization", format!("Bearer {}", token))
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
    let token = common::test_jwt();

    // Create patient
    let create_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/patients")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", &token))
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
                .uri(&format!("/api/patients/{}", patient_id))
                .method(Method::GET)
                .header("authorization", format!("Bearer {}", &token))
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
    let token = common::test_jwt();

    // Create
    let create_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/patients")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", &token))
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
                .uri(&format!("/api/patients/{}", patient_id))
                .method(Method::PUT)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", &token))
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
    let token = common::test_jwt();

    // Create two patients
    for ext_id in &["SEARCH-ONE", "SEARCH-TWO", "OTHER"] {
        app.clone()
            .oneshot(
                Request::builder()
                    .uri("/api/patients")
                    .method(Method::POST)
                    .header("content-type", "application/json")
                    .header("authorization", format!("Bearer {}", &token))
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
                .uri("/api/patients?search=SEARCH")
                .header("authorization", format!("Bearer {}", &token))
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
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/therapies")
                .header("authorization", format!("Bearer {}", token))
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
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/therapies/999999")
                .method(Method::GET)
                .header("authorization", format!("Bearer {}", token))
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
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/therapies/1")
                .method(Method::PUT)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
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
    let token = common::test_jwt();

    // Create signal
    let create_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/signals")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", &token))
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
                .uri("/api/signals")
                .header("authorization", format!("Bearer {}", &token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_resp.status(), StatusCode::OK);
    let body: Value = body_json(list_resp).await;
    assert!(!body.as_array().unwrap().is_empty());
    // Response structure: flat array of signals (see HttpSignalRepo in the frontend)
    assert!(body[0].get("internal_name").is_some());
    assert!(body[0].get("id").is_some());
}

#[sqlx::test]
async fn signals_update_not_found(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/signals/999999")
                .method(Method::PUT)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
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
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/signals/999999")
                .method(Method::DELETE)
                .header("authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn signals_full_crud(pool: PgPool) {
    let app = common::build_test_app(pool.clone()).await;
    let token = common::test_jwt();

    // Pre-insert a user with id=1 (the sub of `common::test_jwt()`) to satisfy
    // the FK constraints on deleted_by/changed_by in the delete handlers.
    sqlx::query(
        "INSERT INTO users (id, username, password_hash, role) \
         VALUES (1, 'test-admin', '', 'admin') ON CONFLICT (id) DO NOTHING",
    )
    .execute(&pool)
    .await
    .unwrap();

    // Create
    let create_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/signals")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", &token))
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
                .uri(&format!("/api/signals/{}", signal_id))
                .method(Method::PUT)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", &token))
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
                .uri(&format!("/api/signals/{}/mappings", signal_id))
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", &token))
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
                .uri(&format!("/api/signals/{}/mappings/{}", signal_id, mapping_id))
                .method(Method::DELETE)
                .header("authorization", format!("Bearer {}", &token))
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
                .uri(&format!("/api/signals/{}", signal_id))
                .method(Method::DELETE)
                .header("authorization", format!("Bearer {}", &token))
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
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/dashboards/machine/999999/summary")
                .header("authorization", format!("Bearer {}", token))
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
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/dashboards/therapy/999999/aggregates")
                .header("authorization", format!("Bearer {}", token))
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
    let app = common::build_test_app(pool.clone()).await;
    let token = common::test_jwt();

    // Crear terapia primero (el handler necesita la duración)
    let repos = common::create_repos(&pool);
    let patient = repos.patient.create("TS-PATIENT", None, None, None, None).await.unwrap();
    let machine = repos
        .machine
        .upsert_by_serial("TS-MACHINE", None, None, None)
        .await
        .unwrap();
    let therapy = repos
        .therapy
        .create(patient.id, machine.id, Some("HD"), None, None)
        .await
        .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .uri(&format!("/api/dashboards/therapy/{}/timeseries", therapy.id))
                .header("authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = body_json(response).await;
    // Array vacío (no hay readings para esta terapia)
    let arr = body.as_array().unwrap();
    assert!(arr.is_empty());
}

#[sqlx::test]
async fn dashboards_patient_history_empty(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/dashboards/patient/999999/history")
                .header("authorization", format!("Bearer {}", token))
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
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/export/therapies?format=csv")
                .header("authorization", format!("Bearer {}", token))
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
    let app = common::build_test_app(pool.clone()).await;
    let token = common::test_jwt();

    // Crear una terapia existente sin readings (el handler resuelve la terapia
    // por id y devuelve 404 si no existe).
    let repos = common::create_repos(&pool);
    let patient = repos.patient.create("EXP-PATIENT", None, None, None, None).await.unwrap();
    let machine = repos
        .machine
        .upsert_by_serial("EXP-MACHINE", None, None, None)
        .await
        .unwrap();
    let therapy = repos
        .therapy
        .create(patient.id, machine.id, Some("HD"), None, None)
        .await
        .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .uri(&format!("/api/export/readings?therapy_id={}&format=csv", therapy.id))
                .header("authorization", format!("Bearer {}", token))
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
    let app = common::build_test_app(pool.clone()).await;
    let token = common::test_jwt();

    let repos = common::create_repos(&pool);
    let patient = repos.patient.create("EXP2-PATIENT", None, None, None, None).await.unwrap();
    let machine = repos
        .machine
        .upsert_by_serial("EXP2-MACHINE", None, None, None)
        .await
        .unwrap();
    let therapy = repos
        .therapy
        .create(patient.id, machine.id, Some("HD"), None, None)
        .await
        .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .uri(&format!("/api/export/readings?therapy_id={}&format=json", therapy.id))
                .header("authorization", format!("Bearer {}", token))
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
//  Bridges admin API tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn bridges_admin_create_duplicate_ip_returns_conflict(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let token = common::test_jwt();
    let payload = serde_json::json!({"ip_address": "10.0.0.50", "label": "RPi-ICU-3"}).to_string();

    let create = |app: axum::Router| {
        app.oneshot(
            Request::builder()
                .uri("/api/admin/bridges")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::from(payload.clone()))
                .unwrap(),
        )
    };

    // First creation succeeds
    let res1 = create(app.clone()).await.unwrap();
    assert_eq!(res1.status(), StatusCode::CREATED);
    let body: Value = body_json(res1).await;
    assert_eq!(body["ip_address"], "10.0.0.50");
    assert_eq!(body["authorized"], true);

    // Duplicate IP → 409 Conflict
    let res2 = create(app).await.unwrap();
    assert_eq!(res2.status(), StatusCode::CONFLICT);
    let err: Value = body_json(res2).await;
    assert!(err["error"].as_str().unwrap().contains("already exists"));
}

#[sqlx::test]
async fn bridges_admin_update_and_delete(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let token = common::test_jwt();

    // Create
    let create_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/admin/bridges")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::from(
                    serde_json::json!({"ip_address": "10.0.0.60", "label": "RPi-ER"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create_res.status(), StatusCode::CREATED);
    let created: Value = body_json(create_res).await;
    let id = created["id"].as_i64().unwrap();

    // PATCH label + deauthorize
    let patch_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/api/admin/bridges/{}", id))
                .method(Method::PATCH)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::from(
                    serde_json::json!({"label": "RPi-ER-2", "authorized": false}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(patch_res.status(), StatusCode::OK);
    let patched: Value = body_json(patch_res).await;
    assert_eq!(patched["label"], "RPi-ER-2");
    assert_eq!(patched["authorized"], false);

    // DELETE
    let delete_res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/api/admin/bridges/{}", id))
                .method(Method::DELETE)
                .header("authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(delete_res.status(), StatusCode::NO_CONTENT);

    // GET list no longer contains it
    let list_res = app
        .oneshot(
            Request::builder()
                .uri("/api/admin/bridges")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_res.status(), StatusCode::OK);
    let list: Value = body_json(list_res).await;
    assert!(list.as_array().unwrap().is_empty());
}

// ════════════════════════════════════════════════════════════════════════
//  Admin users: email + password reset tests
// ════════════════════════════════════════════════════════════════════════

/// Create a user via the admin API. Returns the created user JSON.
async fn create_user_via_admin(app: &axum::Router, token: &str, username: &str) -> Value {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/admin/users")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::from(
                    serde_json::json!({
                        "username": username,
                        "password": "initial-pass",
                        "role": "operator"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    body_json(response).await
}

#[sqlx::test]
async fn admin_create_user_with_email(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let token = common::test_jwt();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/admin/users")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::from(
                    serde_json::json!({
                        "username": "admin-email-user",
                        "password": "secret",
                        "role": "viewer",
                        "email": "admin-user@example.com"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    let body: Value = body_json(response).await;
    assert_eq!(body["email"], "admin-user@example.com");
}

#[sqlx::test]
async fn admin_create_user_email_conflict(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let token = common::test_jwt();

    let create = |app: axum::Router, username: &str| {
        app.oneshot(
            Request::builder()
                .uri("/api/admin/users")
                .method(Method::POST)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::from(
                    serde_json::json!({
                        "username": username,
                        "password": "secret",
                        "role": "viewer",
                        "email": "shared@example.com"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
    };

    let res1 = create(app.clone(), "admin-user-1").await.unwrap();
    assert_eq!(res1.status(), StatusCode::CREATED);

    let res2 = create(app, "admin-user-2").await.unwrap();
    assert_eq!(res2.status(), StatusCode::CONFLICT);
    let err: Value = body_json(res2).await;
    assert!(err["error"].as_str().unwrap().contains("Email"));
}

#[sqlx::test]
async fn admin_update_user_email(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let token = common::test_jwt();
    let created = create_user_via_admin(&app, &token, "upd-user").await;
    let id = created["id"].as_i64().unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .uri(&format!("/api/admin/users/{}", id))
                .method(Method::PATCH)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::from(
                    serde_json::json!({"email": "upd@example.com"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = body_json(response).await;
    assert_eq!(body["email"], "upd@example.com");
}

#[sqlx::test]
async fn admin_reset_user_password(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let token = common::test_jwt();
    let created = create_user_via_admin(&app, &token, "reset-user").await;
    let id = created["id"].as_i64().unwrap();

    let reset_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&format!("/api/admin/users/{}/password", id))
                .method(Method::PUT)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::from(
                    serde_json::json!({"new_password": "admin-reset-pass"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(reset_resp.status(), StatusCode::OK);

    // The reset password must work for login
    let login_resp = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/login")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "reset-user", "password": "admin-reset-pass"})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(login_resp.status(), StatusCode::OK);
}

#[sqlx::test]
async fn admin_reset_password_not_found(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let token = common::test_jwt();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/admin/users/999999/password")
                .method(Method::PUT)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::from(
                    serde_json::json!({"new_password": "whatever"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ════════════════════════════════════════════════════════════════════════
//  Profile (users/me) API tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn profile_get_me_returns_email(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let admin_token = common::test_jwt();
    let created = create_user_via_admin(&app, &admin_token, "profile-user").await;
    let user_id = created["id"].as_i64().unwrap();
    let user_token = common::jwt_for(user_id, "operator");

    // Set email first via PATCH
    let patch_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/users/me")
                .method(Method::PATCH)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", user_token))
                .body(Body::from(
                    serde_json::json!({"email": "profile@example.com"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(patch_resp.status(), StatusCode::OK);

    // GET /users/me returns the profile with email, never password_hash
    let get_resp = app
        .oneshot(
            Request::builder()
                .uri("/api/users/me")
                .method(Method::GET)
                .header("authorization", format!("Bearer {}", user_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get_resp.status(), StatusCode::OK);
    let body: Value = body_json(get_resp).await;
    assert_eq!(body["id"], user_id);
    assert_eq!(body["username"], "profile-user");
    assert_eq!(body["email"], "profile@example.com");
    assert_eq!(body["role"], "operator");
    assert!(body.get("password_hash").is_none(), "profile must not leak password_hash");
}

#[sqlx::test]
async fn profile_get_me_not_found(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let token = common::jwt_for(999_999, "admin");

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/users/me")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn profile_patch_email_conflict(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let admin_token = common::test_jwt();
    let user_a = create_user_via_admin(&app, &admin_token, "profile-a").await;
    let user_b = create_user_via_admin(&app, &admin_token, "profile-b").await;
    let token_a = common::jwt_for(user_a["id"].as_i64().unwrap(), "operator");
    let token_b = common::jwt_for(user_b["id"].as_i64().unwrap(), "operator");

    // User A claims the email
    let set_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/users/me")
                .method(Method::PATCH)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token_a))
                .body(Body::from(
                    serde_json::json!({"email": "shared@example.com"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(set_resp.status(), StatusCode::OK);

    // User B tries the same email → 409
    let conflict_resp = app
        .oneshot(
            Request::builder()
                .uri("/api/users/me")
                .method(Method::PATCH)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token_b))
                .body(Body::from(
                    serde_json::json!({"email": "shared@example.com"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(conflict_resp.status(), StatusCode::CONFLICT);
    let err: Value = body_json(conflict_resp).await;
    assert!(err["error"].as_str().unwrap().contains("Email"));
}

#[sqlx::test]
async fn profile_change_password_wrong_current(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let admin_token = common::test_jwt();
    let created = create_user_via_admin(&app, &admin_token, "pw-user").await;
    let user_id = created["id"].as_i64().unwrap();
    let token = common::jwt_for(user_id, "operator");

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/users/me/password")
                .method(Method::PUT)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::from(
                    serde_json::json!({
                        "current_password": "wrong",
                        "new_password": "new-pass-123"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn profile_change_password_success_then_login(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let admin_token = common::test_jwt();
    let created = create_user_via_admin(&app, &admin_token, "pw-user2").await;
    let user_id = created["id"].as_i64().unwrap();
    let token = common::jwt_for(user_id, "operator");

    // Initial password works
    let login_initial = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/auth/login")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "pw-user2", "password": "initial-pass"})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(login_initial.status(), StatusCode::OK);

    // Change password
    let change_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/users/me/password")
                .method(Method::PUT)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::from(
                    serde_json::json!({
                        "current_password": "initial-pass",
                        "new_password": "changed-pass"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(change_resp.status(), StatusCode::OK);

    // Old password no longer works
    let login_old = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/auth/login")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "pw-user2", "password": "initial-pass"})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(login_old.status(), StatusCode::UNAUTHORIZED);

    // New password works
    let login_new = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/login")
                .method(Method::POST)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "pw-user2", "password": "changed-pass"})
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(login_new.status(), StatusCode::OK);
}

// ════════════════════════════════════════════════════════════════════════
//  Health check makes sure basic routing works
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn health_check_returns_ok(pool: PgPool) {
    let app = common::build_test_app(pool).await;
    let token = common::test_jwt();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}
