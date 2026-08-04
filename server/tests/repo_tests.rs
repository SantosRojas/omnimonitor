//! Integration tests for all PostgreSQL repositories.
//!
//! These tests use `#[sqlx::test]` which creates a fresh database per test
//! using the `DATABASE_URL` environment variable. The migration is applied
//! manually inside each test via `common::setup_db`.

use sqlx::PgPool;

use server::domain::entities::Reading;
use server::infrastructure::postgres::bridge_repo::BridgeRepo;
use server::infrastructure::postgres::machine_repo::MachineRepo;
use server::infrastructure::postgres::patient_repo::PatientRepo;
use server::infrastructure::postgres::readings_repo::ReadingsRepo;
use server::infrastructure::postgres::signal_repo::SignalRepo;
use server::infrastructure::postgres::therapy_repo::TherapyRepo;
use server::infrastructure::postgres::user_repo::UserRepo;
use server::infrastructure::postgres::version_repo::{InitAttribute, InitDictionary, VersionRepo};
use server::infrastructure::postgres::RepoError;

mod common;

// ════════════════════════════════════════════════════════════════════════
//  MachineRepo tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn machine_upsert_creates(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = MachineRepo::new(pool);
    let m = repo.upsert_by_serial("SN-001", None, None, None).await.unwrap();
    assert_eq!(m.serial_number, "SN-001");
    assert_eq!(m.status.as_deref(), Some("online"));
    assert!(m.last_seen_at.is_some());
}

#[sqlx::test]
async fn machine_upsert_updates_existing(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = MachineRepo::new(pool);
    repo.upsert_by_serial("SN-001", Some("10.0.0.1"), Some(9000), None)
        .await
        .unwrap();
    // Second upsert with different IP — COALESCE should NOT override non-null
    let m = repo
        .upsert_by_serial("SN-001", Some("10.0.0.2"), None, None)
        .await
        .unwrap();
    assert_eq!(m.serial_number, "SN-001");
    // COALESCE($2, machines.ip_address) — $2 is Some("10.0.0.2") → should take the new value
    assert_eq!(m.ip_address.as_deref(), Some("10.0.0.2"));
    // port was None in second call → COALESCE preserves old value
    assert_eq!(m.port, Some(9000));
}

#[sqlx::test]
async fn machine_find_by_serial(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = MachineRepo::new(pool);
    repo.upsert_by_serial("SN-FIND", None, None, None).await.unwrap();
    let found = repo.find_by_serial("SN-FIND").await.unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap().serial_number, "SN-FIND");
    let not_found = repo.find_by_serial("NONEXISTENT").await.unwrap();
    assert!(not_found.is_none());
}

#[sqlx::test]
async fn machine_find_by_id(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = MachineRepo::new(pool);
    let m = repo.upsert_by_serial("SN-ID", None, None, None).await.unwrap();
    let found = repo.find_by_id(m.id).await.unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap().id, m.id);
    let not_found = repo.find_by_id(999_999).await.unwrap();
    assert!(not_found.is_none());
}

#[sqlx::test]
async fn machine_list(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = MachineRepo::new(pool);
    assert!(repo.list().await.unwrap().is_empty());
    repo.upsert_by_serial("SN-A", None, None, None).await.unwrap();
    repo.upsert_by_serial("SN-B", None, None, None).await.unwrap();
    let all = repo.list().await.unwrap();
    assert_eq!(all.len(), 2);
}

#[sqlx::test]
async fn machine_update(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = MachineRepo::new(pool);
    let m = repo.upsert_by_serial("SN-UPD", None, None, None).await.unwrap();
    let updated = repo
        .update(m.id, Some("Lab Machine"), Some("10.0.0.99"), Some(8080))
        .await
        .unwrap();
    assert_eq!(updated.label.as_deref(), Some("Lab Machine"));
    assert_eq!(updated.ip_address.as_deref(), Some("10.0.0.99"));
    assert_eq!(updated.port, Some(8080));
}

#[sqlx::test]
async fn machine_update_not_found(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = MachineRepo::new(pool);
    let err = repo.update(999_999, None, None, None).await.unwrap_err();
    assert!(matches!(err, RepoError::NotFound(_)));
}

#[sqlx::test]
async fn machine_soft_delete(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = MachineRepo::new(pool);
    let m = repo.upsert_by_serial("SN-DEL", None, None, None).await.unwrap();
    repo.soft_delete(m.id).await.unwrap();
    // The machine still exists but status = 'deleted'
    let found = repo.find_by_id(m.id).await.unwrap().unwrap();
    assert_eq!(found.status.as_deref(), Some("deleted"));
}

#[sqlx::test]
async fn machine_soft_delete_not_found(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = MachineRepo::new(pool);
    let err = repo.soft_delete(999_999).await.unwrap_err();
    assert!(matches!(err, RepoError::NotFound(_)));
}

#[sqlx::test]
async fn machine_set_online_offline(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = MachineRepo::new(pool);
    let m = repo.upsert_by_serial("SN-STATUS", None, None, None).await.unwrap();
    repo.set_offline(m.id).await.unwrap();
    let found = repo.find_by_id(m.id).await.unwrap().unwrap();
    assert_eq!(found.status.as_deref(), Some("offline"));
    repo.set_online(m.id).await.unwrap();
    let found = repo.find_by_id(m.id).await.unwrap().unwrap();
    assert_eq!(found.status.as_deref(), Some("online"));
}

#[sqlx::test]
async fn machine_touch_last_seen(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = MachineRepo::new(pool);
    let m = repo.upsert_by_serial("SN-TOUCH", None, None, None).await.unwrap();
    // Allow a small delay to ensure timestamp advances
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    repo.touch_last_seen(m.id).await.unwrap();
    let found = repo.find_by_id(m.id).await.unwrap().unwrap();
    assert_eq!(found.status.as_deref(), Some("online"));
    assert!(found.last_seen_at.is_some());
}

// ════════════════════════════════════════════════════════════════════════
//  PatientRepo tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn patient_create_and_find(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = PatientRepo::new(pool);
    let p = repo.create("EXT-001", None, None, None, None).await.unwrap();
    assert_eq!(p.external_id, "EXT-001");
    let by_id = repo.find_by_id(p.id).await.unwrap().unwrap();
    assert_eq!(by_id.id, p.id);
    let by_ext = repo.find_by_external_id("EXT-001").await.unwrap().unwrap();
    assert_eq!(by_ext.id, p.id);
    let not_found = repo.find_by_external_id("NONEXISTENT").await.unwrap();
    assert!(not_found.is_none());
}

#[sqlx::test]
async fn patient_create_duplicate(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = PatientRepo::new(pool);
    repo.create("EXT-DUP", None, None, None, None).await.unwrap();
    let err = repo.create("EXT-DUP", None, None, None, None).await.unwrap_err();
    assert!(matches!(err, RepoError::Conflict(_)));
    assert!(err.to_string().contains("EXT-DUP"));
}

#[sqlx::test]
async fn patient_list(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = PatientRepo::new(pool);
    assert!(repo.list(None).await.unwrap().is_empty());
    repo.create("P-001", None, None, None, None).await.unwrap();
    repo.create("P-002", None, None, None, None).await.unwrap();
    let all = repo.list(None).await.unwrap();
    assert_eq!(all.len(), 2);
}

#[sqlx::test]
async fn patient_list_search(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = PatientRepo::new(pool);
    repo.create("PATIENT-ONE", None, None, None, None).await.unwrap();
    repo.create("PATIENT-TWO", None, None, None, None).await.unwrap();
    repo.create("OTHER-THING", None, None, None, None).await.unwrap();
    let results = repo.list(Some("PATIENT")).await.unwrap();
    assert_eq!(results.len(), 2);
}

#[sqlx::test]
async fn patient_update(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = PatientRepo::new(pool);
    let p = repo.create("OLD-ID", None, None, None, None).await.unwrap();
    let updated = repo.update(p.id, Some("NEW-ID"), None, None, None, None).await.unwrap();
    assert_eq!(updated.external_id, "NEW-ID");
    assert!(updated.updated_at.is_some());
}

#[sqlx::test]
async fn patient_update_not_found(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = PatientRepo::new(pool);
    let err = repo.update(999_999, Some("ANY"), None, None, None, None).await.unwrap_err();
    assert!(matches!(err, RepoError::NotFound(_)));
}

#[sqlx::test]
async fn patient_update_duplicate(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = PatientRepo::new(pool);
    repo.create("A", None, None, None, None).await.unwrap();
    let p2 = repo.create("B", None, None, None, None).await.unwrap();
    let err = repo.update(p2.id, Some("A"), None, None, None, None).await.unwrap_err();
    assert!(matches!(err, RepoError::Conflict(_)));
}

#[sqlx::test]
async fn patient_therapy_count(pool: PgPool) {
    common::setup_db(&pool).await;
    // Set up: a patient, a machine, a therapy
    let patient_repo = PatientRepo::new(pool.clone());
    let machine_repo = MachineRepo::new(pool.clone());
    let therapy_repo = TherapyRepo::new(pool.clone());
    let patient = patient_repo.create("COUNT-TEST", None, None, None, None).await.unwrap();
    let machine = machine_repo.upsert_by_serial("SN-COUNT", None, None, None).await.unwrap();
    let first = therapy_repo.create(patient.id, machine.id, None, None, None).await.unwrap();
    // A patient can only have one open therapy: close the first before a second one.
    therapy_repo.update_status(first.id, "completed").await.unwrap();
    therapy_repo.create(patient.id, machine.id, Some("HD"), None, None).await.unwrap();
    assert_eq!(patient_repo.therapy_count(patient.id).await.unwrap(), 2);
    assert_eq!(patient_repo.therapy_count(999_999).await.unwrap(), 0);
}

// ════════════════════════════════════════════════════════════════════════
//  TherapyRepo tests
// ════════════════════════════════════════════════════════════════════════

/// Helper: create a patient + machine and return their IDs.
async fn seed_patient_and_machine(pool: &PgPool) -> (i64, i64) {
    let patient_repo = PatientRepo::new(pool.clone());
    let machine_repo = MachineRepo::new(pool.clone());
    let patient = patient_repo.create("THERAPY-PATIENT", None, None, None, None).await.unwrap();
    let machine = machine_repo
        .upsert_by_serial("THERAPY-MACHINE", None, None, None)
        .await
        .unwrap();
    (patient.id, machine.id)
}

#[sqlx::test]
async fn therapy_create_and_find(pool: PgPool) {
    common::setup_db(&pool).await;
    let (pid, mid) = seed_patient_and_machine(&pool).await;
    let repo = TherapyRepo::new(pool);
    let t = repo.create(pid, mid, Some("HD"), Some("Kit-A"), Some(75.0)).await.unwrap();
    assert_eq!(t.patient_id, pid);
    assert_eq!(t.machine_id, mid);
    assert_eq!(t.therapy_type.as_deref(), Some("HD"));
    assert_eq!(t.status.as_deref(), Some("planned"));
    // find_by_id
    let found = repo.find_by_id(t.id).await.unwrap().unwrap();
    assert_eq!(found.id, t.id);
    let not_found = repo.find_by_id(999_999).await.unwrap();
    assert!(not_found.is_none());
}

#[sqlx::test]
async fn therapy_list_filters(pool: PgPool) {
    common::setup_db(&pool).await;
    let (pid, mid) = seed_patient_and_machine(&pool).await;
    let repo = TherapyRepo::new(pool);
    // Create two therapies (the first is closed so the patient has only one open).
    let t1 = repo.create(pid, mid, Some("HD"), None, None).await.unwrap();
    repo.update_status(t1.id, "completed").await.unwrap();
    repo.create(pid, mid, Some("PD"), None, None).await.unwrap();
    // List all
    assert_eq!(repo.list(None, None, None, None, None).await.unwrap().len(), 2);
    // Filter by machine
    assert_eq!(repo.list(None, Some(mid), None, None, None).await.unwrap().len(), 2);
    // Filter by patient
    assert_eq!(repo.list(Some(pid), None, None, None, None).await.unwrap().len(), 2);
    // Filter by nonexistent patient
    assert!(repo.list(Some(999_999), None, None, None, None).await.unwrap().is_empty());
}

#[sqlx::test]
async fn therapy_update_status(pool: PgPool) {
    common::setup_db(&pool).await;
    let (pid, mid) = seed_patient_and_machine(&pool).await;
    let repo = TherapyRepo::new(pool);
    let t = repo.create(pid, mid, None, None, None).await.unwrap();
    assert_eq!(t.status.as_deref(), Some("planned"));
    // Activate → started_at should be set
    let active = repo.update_status(t.id, "active").await.unwrap();
    assert_eq!(active.status.as_deref(), Some("active"));
    assert!(active.started_at.is_some());
    // Complete → ended_at should be set
    let done = repo.update_status(t.id, "completed").await.unwrap();
    assert_eq!(done.status.as_deref(), Some("completed"));
    assert!(done.ended_at.is_some());
}

#[sqlx::test]
async fn therapy_update_status_not_found(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = TherapyRepo::new(pool);
    let err = repo.update_status(999_999, "active").await.unwrap_err();
    assert!(matches!(err, RepoError::NotFound(_)));
}

#[sqlx::test]
async fn therapy_update_metadata(pool: PgPool) {
    common::setup_db(&pool).await;
    let (pid, mid) = seed_patient_and_machine(&pool).await;
    let repo = TherapyRepo::new(pool);
    let t = repo.create(pid, mid, None, None, None).await.unwrap();
    let updated = repo.update_metadata(t.id, Some("HD"), Some("Kit-X"), Some(80.0), None).await.unwrap();
    assert_eq!(updated.therapy_type.as_deref(), Some("HD"));
    assert_eq!(updated.kit.as_deref(), Some("Kit-X"));
    assert_eq!(updated.weight, Some(80.0));
}

#[sqlx::test]
async fn therapy_update_metadata_not_found(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = TherapyRepo::new(pool);
    let err = repo.update_metadata(999_999, None, None, None, None).await.unwrap_err();
    assert!(matches!(err, RepoError::NotFound(_)));
}

#[sqlx::test]
async fn therapy_find_active_by_machine(pool: PgPool) {
    common::setup_db(&pool).await;
    let (pid, mid) = seed_patient_and_machine(&pool).await;
    let repo = TherapyRepo::new(pool);
    // No active therapy yet
    assert!(repo.find_active_by_machine(mid).await.unwrap().is_none());
    // Create a planned therapy
    repo.create(pid, mid, None, None, None).await.unwrap();
    let active = repo.find_active_by_machine(mid).await.unwrap();
    assert!(active.is_some());
    assert_eq!(active.unwrap().machine_id, mid);
}

#[sqlx::test]
async fn therapy_list_by_patient_and_machine(pool: PgPool) {
    common::setup_db(&pool).await;
    let (pid, mid) = seed_patient_and_machine(&pool).await;
    let repo = TherapyRepo::new(pool);
    let t1 = repo.create(pid, mid, None, None, None).await.unwrap();
    repo.update_status(t1.id, "completed").await.unwrap();
    repo.create(pid, mid, None, None, None).await.unwrap();
    assert_eq!(repo.list_by_patient(pid).await.unwrap().len(), 2);
    assert_eq!(repo.list_by_machine(mid).await.unwrap().len(), 2);
    assert!(repo.list_by_patient(999_999).await.unwrap().is_empty());
    assert!(repo.list_by_machine(999_999).await.unwrap().is_empty());
}

/// The DB-level invariant (uq_therapies_one_open_per_patient): a patient can
/// never have two open therapies at once. The second `create` for the same
/// patient must fail with a Conflict, even on a different machine.
#[sqlx::test]
async fn therapy_create_rejects_second_open_for_patient(pool: PgPool) {
    common::setup_db(&pool).await;
    let (pid, mid) = seed_patient_and_machine(&pool).await;
    let repo = TherapyRepo::new(pool);
    repo.create(pid, mid, Some("HD"), None, None).await.unwrap();
    let err = repo.create(pid, mid, Some("PD"), None, None).await.unwrap_err();
    assert!(matches!(err, RepoError::Conflict(_)));
    // Still exactly one open therapy for the patient.
    let all = repo.list_by_patient(pid).await.unwrap();
    assert_eq!(all.len(), 1);
    let open: Vec<_> = all
        .iter()
        .filter(|t| matches!(t.status.as_deref(), Some("active") | Some("planned")))
        .collect();
    assert_eq!(open.len(), 1, "exactly one open therapy must remain");
}

/// The invariant only restricts OPEN therapies: once the open therapy is
/// closed (completed), a new one can be created for the same patient.
#[sqlx::test]
async fn therapy_open_promotion_still_allows_same_patient_after_close(pool: PgPool) {
    common::setup_db(&pool).await;
    let (pid, mid) = seed_patient_and_machine(&pool).await;
    let repo = TherapyRepo::new(pool);
    let t = repo.create(pid, mid, Some("HD"), None, None).await.unwrap();
    // Close it (simulating TherapyEnd or a manual close).
    let done = repo.update_status(t.id, "completed").await.unwrap();
    assert_eq!(done.status.as_deref(), Some("completed"));
    // A new therapy for the same patient is now allowed.
    let second = repo.create(pid, mid, Some("PD"), None, None).await.unwrap();
    assert_eq!(second.status.as_deref(), Some("planned"));
    assert_eq!(repo.list_by_patient(pid).await.unwrap().len(), 2);
}

// ════════════════════════════════════════════════════════════════════════
//  SignalRepo tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn signal_create_and_find(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = SignalRepo::new(pool);
    let s = repo.create("g_pressure_set", Some("Pressure Set"), Some("mmHg")).await.unwrap();
    assert_eq!(s.internal_name, "g_pressure_set");
    assert_eq!(s.display_name.as_deref(), Some("Pressure Set"));
    // Find by id
    let found = repo.find_by_id(s.id).await.unwrap().unwrap();
    assert_eq!(found.id, s.id);
    // Find by name
    let found = repo.find_by_name("g_pressure_set").await.unwrap().unwrap();
    assert_eq!(found.id, s.id);
    // Not found
    assert!(repo.find_by_id(999_999).await.unwrap().is_none());
    assert!(repo.find_by_name("NONEXISTENT").await.unwrap().is_none());
}

#[sqlx::test]
async fn signal_list(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = SignalRepo::new(pool);
    assert!(repo.list().await.unwrap().is_empty());
    repo.create("sig_a", None, None).await.unwrap();
    repo.create("sig_b", None, None).await.unwrap();
    assert_eq!(repo.list().await.unwrap().len(), 2);
}

#[sqlx::test]
async fn signal_update(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = SignalRepo::new(pool);
    let s = repo.create("sig", None, None).await.unwrap();
    let updated = repo.update(s.id, Some("New Name"), Some("cm")).await.unwrap();
    assert_eq!(updated.display_name.as_deref(), Some("New Name"));
    assert_eq!(updated.unit.as_deref(), Some("cm"));
}

#[sqlx::test]
async fn signal_update_not_found(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = SignalRepo::new(pool);
    let err = repo.update(999_999, None, None).await.unwrap_err();
    assert!(matches!(err, RepoError::NotFound(_)));
}

#[sqlx::test]
async fn signal_soft_delete(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = SignalRepo::new(pool.clone());
    let s = repo.create("to-delete", None, None).await.unwrap();
    // Create a user first so the FK constraint on deleted_by is satisfied
    let user_repo = server::infrastructure::postgres::user_repo::UserRepo::new(pool);
    let user = user_repo.create("signal-test-user", "hash", "admin").await.unwrap();
    repo.soft_delete(s.id, user.id).await.unwrap();
    // Should no longer be found
    assert!(repo.find_by_id(s.id).await.unwrap().is_none());
    // Should not appear in list
    assert!(repo.list().await.unwrap().is_empty());
}

#[sqlx::test]
async fn signal_soft_delete_not_found(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = SignalRepo::new(pool);
    let err = repo.soft_delete(999_999, 1).await.unwrap_err();
    assert!(matches!(err, RepoError::NotFound(_)));
}

#[sqlx::test]
async fn signal_value_mappings(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = SignalRepo::new(pool.clone());
    let s = repo.create("sig-map", None, None).await.unwrap();
    // Create a user for FK constraint (deleted_by, changed_by)
    let user_repo = server::infrastructure::postgres::user_repo::UserRepo::new(pool);
    let user = user_repo.create("map-test-user", "hash", "admin").await.unwrap();

    // Add mappings
    let m1 = repo.add_mapping(s.id, Some("0"), Some("Off")).await.unwrap();
    let _m2 = repo.add_mapping(s.id, Some("1"), Some("On")).await.unwrap();
    assert_eq!(m1.signal_id, s.id);
    // List mappings
    let mappings = repo.list_mappings(s.id).await.unwrap();
    assert_eq!(mappings.len(), 2);
    // Find specific mapping
    let found = repo.find_mapping(m1.id).await.unwrap().unwrap();
    assert_eq!(found.id, m1.id);
    // Delete mapping
    repo.delete_mapping(m1.id, user.id).await.unwrap();
    let remaining = repo.list_mappings(s.id).await.unwrap();
    assert_eq!(remaining.len(), 1);
}

#[sqlx::test]
async fn signal_delete_mapping_not_found(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = SignalRepo::new(pool);
    let err = repo.delete_mapping(999_999, 1).await.unwrap_err();
    assert!(matches!(err, RepoError::NotFound(_)));
}

// ════════════════════════════════════════════════════════════════════════
//  ReadingsRepo tests
// ════════════════════════════════════════════════════════════════════════

/// Helper: create a machine + signal and a therapy in the test database.
async fn seed_readings_prereqs(pool: &PgPool) -> (MachineRepo, ReadingsRepo, i64, i64, i64) {
    let machine_repo = MachineRepo::new(pool.clone());
    let signal_repo = SignalRepo::new(pool.clone());
    let patient_repo = PatientRepo::new(pool.clone());
    let therapy_repo = TherapyRepo::new(pool.clone());

    let machine = machine_repo.upsert_by_serial("RD-MACH", None, None, None).await.unwrap();
    let signal_a = signal_repo.create("sig_a", None, None).await.unwrap();
    let _signal_b = signal_repo.create("sig_b", None, None).await.unwrap();
    let patient = patient_repo.create("RD-PATIENT", None, None, None, None).await.unwrap();
    let therapy = therapy_repo.create(patient.id, machine.id, None, None, None).await.unwrap();

    (
        machine_repo,
        ReadingsRepo::new(pool.clone()),
        machine.id,
        therapy.id,
        signal_a.id,
    )
}

fn make_reading(
    machine_id: i64,
    therapy_id: i64,
    signal_id: i64,
    value: f64,
    recorded_at: &str,
) -> Reading {
    Reading {
        id: 0,
        machine_id,
        therapy_id: Some(therapy_id),
        signal_id: Some(signal_id),
        recorded_at: Some(chrono::DateTime::parse_from_rfc3339(recorded_at).unwrap().into()),
        raw_value: Some(value as i64),
        value: Some(value),
        unit: Some("mmHg".into()),
        created_at: chrono::Utc::now(),
    }
}

#[sqlx::test]
async fn readings_insert_batch_and_query(pool: PgPool) {
    common::setup_db(&pool).await;
    let (_, readings_repo, machine_id, therapy_id, signal_id) = seed_readings_prereqs(&pool).await;

    let readings = vec![
        make_reading(machine_id, therapy_id, signal_id, 120.0, "2026-07-20T10:00:00Z"),
        make_reading(machine_id, therapy_id, signal_id, 121.0, "2026-07-20T10:01:00Z"),
    ];
    readings_repo.insert_batch(&readings).await.unwrap();

    let by_therapy = readings_repo.query_by_therapy(therapy_id, None).await.unwrap();
    assert_eq!(by_therapy.len(), 2);

    let by_machine = readings_repo.query_by_machine(machine_id, None).await.unwrap();
    assert_eq!(by_machine.len(), 2);

    let by_machine_limited = readings_repo.query_by_machine(machine_id, Some(1)).await.unwrap();
    assert_eq!(by_machine_limited.len(), 1);
}

#[sqlx::test]
async fn readings_insert_empty_batch(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = ReadingsRepo::new(pool);
    // Should not error on empty batch
    repo.insert_batch(&[]).await.unwrap();
}

#[sqlx::test]
async fn readings_therapy_detail_distinct_on(pool: PgPool) {
    common::setup_db(&pool).await;
    let (_machine_repo, readings_repo, machine_id, therapy_id, signal_a) =
        seed_readings_prereqs(&pool).await;

    // Helper creates both "sig_a" and "sig_b" — look up the second signal
    let signal_repo = SignalRepo::new(pool.clone());
    let signal_b = signal_repo.find_by_name("sig_b").await.unwrap().unwrap();

    // Insert readings: 2 for signal_a, 1 for signal_b
    readings_repo
        .insert_batch(&[
            make_reading(machine_id, therapy_id, signal_a, 100.0, "2026-07-20T10:00:00Z"),
            make_reading(machine_id, therapy_id, signal_a, 110.0, "2026-07-20T10:01:00Z"),
            make_reading(machine_id, therapy_id, signal_b.id, 200.0, "2026-07-20T10:00:00Z"),
        ])
        .await
        .unwrap();

    let detail = readings_repo.therapy_detail(therapy_id).await.unwrap();
    // DISTINCT ON should return 1 row per signal = 2 total
    assert_eq!(detail.len(), 2);
    // Each signal_id appears at most once
    let signal_ids: Vec<_> = detail.iter().map(|r| r.signal_id).collect();
    let mut deduped = signal_ids.clone();
    deduped.sort();
    deduped.dedup();
    assert_eq!(signal_ids.len(), deduped.len());
}

#[sqlx::test]
async fn readings_therapy_aggregates(pool: PgPool) {
    common::setup_db(&pool).await;
    let (_machine_repo, readings_repo, machine_id, therapy_id, signal_id) = seed_readings_prereqs(&pool).await;

    readings_repo
        .insert_batch(&[
            make_reading(machine_id, therapy_id, signal_id, 100.0, "2026-07-20T10:00:00Z"),
            make_reading(machine_id, therapy_id, signal_id, 110.0, "2026-07-20T10:01:00Z"),
            make_reading(machine_id, therapy_id, signal_id, 90.0, "2026-07-20T10:02:00Z"),
        ])
        .await
        .unwrap();

    let agg = readings_repo.therapy_aggregates(therapy_id).await.unwrap();
    assert_eq!(agg.len(), 1);
    assert_eq!(agg[0].count, 3);
    assert_eq!(agg[0].avg_value.unwrap() as i64, 100); // (100+110+90)/3 = 100
    assert_eq!(agg[0].min_value.unwrap() as i64, 90);
    assert_eq!(agg[0].max_value.unwrap() as i64, 110);
}

#[sqlx::test]
async fn readings_therapy_timeseries(pool: PgPool) {
    common::setup_db(&pool).await;
    let (_, readings_repo, machine_id, therapy_id, signal_id) = seed_readings_prereqs(&pool).await;

    readings_repo
        .insert_batch(&[
            make_reading(machine_id, therapy_id, signal_id, 100.0, "2026-07-20T10:00:00Z"),
            make_reading(machine_id, therapy_id, signal_id, 110.0, "2026-07-20T10:01:00Z"),
        ])
        .await
        .unwrap();

    let ts = readings_repo.therapy_timeseries(therapy_id).await.unwrap();
    assert_eq!(ts.len(), 2);
    // Ordered by recorded_at ASC
    assert!(ts[0].recorded_at <= ts[1].recorded_at);
}

#[sqlx::test]
async fn readings_machine_summary(pool: PgPool) {
    common::setup_db(&pool).await;
    let (_machine_repo, readings_repo, machine_id, therapy_id, signal_a) = seed_readings_prereqs(&pool).await;
    let signal_repo = SignalRepo::new(pool);
    let signal_b = signal_repo.find_by_name("sig_b").await.unwrap().unwrap();

    readings_repo
        .insert_batch(&[
            make_reading(machine_id, therapy_id, signal_a, 50.0, "2026-07-20T10:00:00Z"),
            make_reading(machine_id, therapy_id, signal_a, 55.0, "2026-07-20T10:01:00Z"),
            make_reading(machine_id, therapy_id, signal_b.id, 30.0, "2026-07-20T10:00:00Z"),
        ])
        .await
        .unwrap();

    let summary = readings_repo.machine_summary(machine_id).await.unwrap();
    assert_eq!(summary.len(), 2); // DISTINCT ON → 1 per signal
}

// ════════════════════════════════════════════════════════════════════════
//  UserRepo tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn user_create_and_find(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = UserRepo::new(pool);
    let u = repo.create("alice", "hash123", "operator").await.unwrap();
    assert_eq!(u.username, "alice");
    assert_eq!(u.role.as_deref(), Some("operator"));

    let by_username = repo.find_by_username("alice").await.unwrap().unwrap();
    assert_eq!(by_username.id, u.id);

    let by_id = repo.find_by_id(u.id).await.unwrap().unwrap();
    assert_eq!(by_id.id, u.id);

    let not_found = repo.find_by_username("nobody").await.unwrap();
    assert!(not_found.is_none());
}

#[sqlx::test]
async fn user_list(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = UserRepo::new(pool);
    assert!(repo.list().await.unwrap().is_empty());
    repo.create("u1", "h1", "viewer").await.unwrap();
    repo.create("u2", "h2", "admin").await.unwrap();
    assert_eq!(repo.list().await.unwrap().len(), 2);
}

#[sqlx::test]
async fn user_duplicate_username(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = UserRepo::new(pool);
    repo.create("bob", "hash1", "viewer").await.unwrap();
    let result = repo.create("bob", "hash2", "admin").await;
    let err = result.unwrap_err();
    assert!(matches!(err, RepoError::Database(_)));
    // Not a RepoError::Conflict because the repo doesn't catch unique violations
    // It returns RepoError::Database wrapping the sqlx error
}

// ════════════════════════════════════════════════════════════════════════
//  VersionRepo tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn version_save_and_retrieve(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = VersionRepo::new(pool);

    let attrs = vec![
        InitAttribute {
            handle: 1,
            data_type: "U16".into(),
            size: 2,
            conversion_factor: 1,
            label_did: 100,
            unit_did: 200,
            signal_id: 10,
            internal_name: "sig_a".into(),
        },
    ];
    let dict = vec![
        InitDictionary {
            dict_id: 1,
            text: "Pressure".into(),
        },
    ];

    let version_id = repo
        .save_initialization(
            "fp_test_v1",
            Some(1),
            Some("SW1.0"),
            Some("FW2.0"),
            Some("HW3.0"),
            Some("FW4.0"),
            Some("HW5.0"),
            Some("FW6.0"),
            Some("HW7.0"),
            Some("Lang1"),
            None,
            None,
            &attrs,
            &dict,
        )
        .await
        .unwrap();

    assert!(version_id > 0);

    // Retrieve by fingerprint
    let version = repo.get_by_fingerprint("fp_test_v1").await.unwrap().unwrap();
    assert_eq!(version.fingerprint, "fp_test_v1");
    assert_eq!(version_id, version.id);

    // Retrieve attributes
    let retrieved_attrs = repo.get_attributes(version_id).await.unwrap();
    assert_eq!(retrieved_attrs.len(), 1);
    assert_eq!(retrieved_attrs[0].handle, 1);

    // Retrieve dictionary
    let retrieved_dict = repo.get_dictionary(version_id).await.unwrap();
    assert_eq!(retrieved_dict.len(), 1);
    assert_eq!(retrieved_dict[0].dict_id, 1);

    // Non-existent fingerprint
    assert!(repo.get_by_fingerprint("nonexistent").await.unwrap().is_none());
}

#[sqlx::test]
async fn version_save_reinitialization(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = VersionRepo::new(pool);

    // First save
    let attrs_v1 = vec![InitAttribute {
        handle: 1,
        data_type: "U16".into(),
        size: 2,
        conversion_factor: 1,
        label_did: 100,
        unit_did: 200,
        signal_id: 10,
        internal_name: "sig_a".into(),
    }];

    repo.save_initialization(
        "fp_reinit",
        Some(1),
        None, None, None, None, None, None, None, None, None, None,
        &attrs_v1,
        &[],
    )
    .await
    .unwrap();

    // Re-init with different attributes (upsert + replace)
    let attrs_v2 = vec![InitAttribute {
        handle: 2,
        data_type: "S16".into(),
        size: 2,
        conversion_factor: 10,
        label_did: 101,
        unit_did: 201,
        signal_id: 11,
        internal_name: "sig_b".into(),
    }];

    repo.save_initialization(
        "fp_reinit",
        Some(1),
        None, None, None, None, None, None, None, None, None, None,
        &attrs_v2,
        &[],
    )
    .await
    .unwrap();

    // Retrieve version by fingerprint first, then get attributes
    let version = repo.get_by_fingerprint("fp_reinit").await.unwrap().unwrap();
    let attrs = repo.get_attributes(version.id).await.unwrap();
    assert_eq!(attrs.len(), 1);
    assert_eq!(attrs[0].handle, 2);
}

// ════════════════════════════════════════════════════════════════════════
//  BridgeRepo tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn bridge_create_and_find_by_ip(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = BridgeRepo::new(pool);
    let b = repo.create("10.0.0.50", Some("ICU-RPi-3")).await.unwrap();
    assert_eq!(b.ip_address, "10.0.0.50");
    assert_eq!(b.label.as_deref(), Some("ICU-RPi-3"));
    assert!(b.authorized);
    assert_eq!(b.status, "offline");

    let found = repo.find_by_ip("10.0.0.50").await.unwrap().unwrap();
    assert_eq!(found.id, b.id);

    let not_found = repo.find_by_ip("10.0.0.99").await.unwrap();
    assert!(not_found.is_none());
}

#[sqlx::test]
async fn bridge_create_duplicate_ip(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = BridgeRepo::new(pool);
    repo.create("10.0.0.50", None).await.unwrap();
    let err = repo.create("10.0.0.50", None).await.unwrap_err();
    // BridgeRepo::create doesn't catch unique violations explicitly,
    // so sqlx errors surface as RepoError::Database
    assert!(matches!(err, RepoError::Database(_)));
}

#[sqlx::test]
async fn bridge_set_online_offline(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = BridgeRepo::new(pool);
    let b = repo.create("10.0.0.51", None).await.unwrap();
    assert_eq!(b.status, "offline");

    repo.set_online(b.id).await.unwrap();
    let online = repo.find_by_ip("10.0.0.51").await.unwrap().unwrap();
    assert_eq!(online.status, "online");
    assert!(online.last_seen_at.is_some());

    repo.set_offline(b.id).await.unwrap();
    let offline = repo.find_by_ip("10.0.0.51").await.unwrap().unwrap();
    assert_eq!(offline.status, "offline");
}

#[sqlx::test]
async fn bridge_list(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = BridgeRepo::new(pool);
    assert!(repo.list().await.unwrap().is_empty());

    repo.create("10.0.0.52", None).await.unwrap();
    repo.create("10.0.0.53", None).await.unwrap();
    let all = repo.list().await.unwrap();
    assert_eq!(all.len(), 2);
}

#[sqlx::test]
async fn bridge_update(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = BridgeRepo::new(pool);
    let b = repo.create("10.0.0.54", Some("Old Label")).await.unwrap();

    let updated = repo.update(b.id, Some("New Label"), Some(false)).await.unwrap();
    assert_eq!(updated.label.as_deref(), Some("New Label"));
    assert!(!updated.authorized);
    assert!(updated.updated_at.is_some());
}

#[sqlx::test]
async fn bridge_update_not_found(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = BridgeRepo::new(pool);
    let err = repo.update(999_999, None, None).await.unwrap_err();
    assert!(matches!(err, RepoError::NotFound(_)));
}

#[sqlx::test]
async fn bridge_delete(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = BridgeRepo::new(pool);
    let b = repo.create("10.0.0.55", None).await.unwrap();

    repo.delete(b.id).await.unwrap();
    let found = repo.find_by_ip("10.0.0.55").await.unwrap();
    assert!(found.is_none());
}

#[sqlx::test]
async fn bridge_delete_not_found(pool: PgPool) {
    common::setup_db(&pool).await;
    let repo = BridgeRepo::new(pool);
    let err = repo.delete(999_999).await.unwrap_err();
    assert!(matches!(err, RepoError::NotFound(_)));
}

// ════════════════════════════════════════════════════════════════════════
//  WsHub handle_bridge_frame tests
// ════════════════════════════════════════════════════════════════════════

#[sqlx::test]
async fn handle_bridge_serial_status_stores_in_memory(pool: PgPool) {
    use server::infrastructure::ws_hub::{
        BridgeFrame, BridgeSerialStatusPayload, WsHubState, handle_bridge_frame,
    };

    common::setup_db(&pool).await;
    let repos = common::create_repos(&pool);

    // Register a bridge in DB BEFORE moving repos into WsHubState
    let bridge = repos.bridge.create("10.0.0.99", None).await.unwrap();

    let ws_hub = WsHubState::new(
        repos.machine,
        repos.patient,
        repos.therapy,
        repos.readings,
        repos.version,
        repos.bridge,
        repos.signal,
        repos.equivalence,
        0, // persistence_interval_secs: 0 = inmediato
    );

    let frame = BridgeFrame::SerialStatus {
        state: "running".into(),
        failure_count: 0,
        ws_state: "connected".into(),
    };

    let mut current_machine_id: Option<i64> = None;
    let mut current_bridge_id: Option<i64> = Some(bridge.id);

    let result = handle_bridge_frame(
        &ws_hub,
        &frame,
        &mut current_machine_id,
        &mut current_bridge_id,
    )
    .await;

    assert!(result.is_ok(), "handle_bridge_frame should succeed: {:?}", result);

    // Verify in-memory storage
    let statuses = ws_hub.bridge_statuses.read().await;
    let payload: &BridgeSerialStatusPayload = statuses
        .get(&bridge.id)
        .expect("bridge should have a stored serial status");

    assert_eq!(payload.state, "running");
    assert_eq!(payload.failure_count, 0);
    assert_eq!(payload.ws_state, "connected");
    assert!(!payload.updated_at.is_empty(), "updated_at should be set");
}

#[sqlx::test]
async fn handle_bridge_serial_status_before_registration_logs_warning(pool: PgPool) {
    use server::infrastructure::ws_hub::{
        BridgeFrame, WsHubState, handle_bridge_frame,
    };

    common::setup_db(&pool).await;
    let repos = common::create_repos(&pool);
    let ws_hub = WsHubState::new(
        repos.machine,
        repos.patient,
        repos.therapy,
        repos.readings,
        repos.version,
        repos.bridge,
        repos.signal,
        repos.equivalence,
        0, // persistence_interval_secs: 0 = inmediato
    );

    let frame = BridgeFrame::SerialStatus {
        state: "running".into(),
        failure_count: 0,
        ws_state: "connected".into(),
    };

    let mut current_machine_id: Option<i64> = None;
    let mut current_bridge_id: Option<i64> = None; // No bridge registered

    let result = handle_bridge_frame(
        &ws_hub,
        &frame,
        &mut current_machine_id,
        &mut current_bridge_id,
    )
    .await;

    assert!(result.is_ok(), "handle_bridge_frame should still return Ok when unregistered");

    // No bridge status should be stored
    let statuses = ws_hub.bridge_statuses.read().await;
    assert!(statuses.is_empty(), "no statuses should be stored without registration");
}

/// `new_therapy: true` must close a stale open therapy of the same
/// patient/machine (left 'active' by a crash before TherapyEnd) and start a
/// brand-new one.
#[sqlx::test]
async fn handle_bridge_therapy_setup_new_therapy_closes_stale(pool: PgPool) {
    use server::infrastructure::ws_hub::{
        BridgeFrame, WsHubState, handle_bridge_frame,
    };

    common::setup_db(&pool).await;
    let repos = common::create_repos(&pool);

    // Seed patient + machine + an ACTIVE therapy (as if a previous session
    // never received TherapyEnd).
    let patient = repos
        .patient
        .create("NEW-THERAPY-PATIENT", None, None, None, None)
        .await
        .unwrap();
    let machine = repos
        .machine
        .upsert_by_serial("NEW-THERAPY-MACHINE", None, None, None)
        .await
        .unwrap();
    let stale = repos
        .therapy
        .create(patient.id, machine.id, Some("HD"), None, None)
        .await
        .unwrap();
    let stale = repos.therapy.update_status(stale.id, "active").await.unwrap();
    assert_eq!(stale.status.as_deref(), Some("active"));

    let ws_hub = WsHubState::new(
        repos.machine.clone(),
        repos.patient.clone(),
        repos.therapy.clone(),
        repos.readings,
        repos.version,
        repos.bridge,
        repos.signal,
        repos.equivalence,
        0, // persistence_interval_secs: 0 = inmediato
    );

    let frame = BridgeFrame::TherapySetup {
        machine_id: machine.id,
        patient_id_str: patient.external_id.clone(),
        therapy_type: Some("HD".into()),
        kit: None,
        weight: None,
        new_therapy: true,
    };

    let mut current_machine_id: Option<i64> = Some(machine.id);
    let mut current_bridge_id: Option<i64> = None;

    let result = handle_bridge_frame(
        &ws_hub,
        &frame,
        &mut current_machine_id,
        &mut current_bridge_id,
    )
    .await;

    assert!(result.is_ok(), "handle_bridge_frame should succeed: {:?}", result);

    // Stale therapy must be closed (completed).
    let closed = repos.therapy.find_by_id(stale.id).await.unwrap().unwrap();
    assert_eq!(closed.status.as_deref(), Some("completed"));

    // A new therapy must exist for the patient/machine (and only one open).
    let all = repos.therapy.list_by_patient(patient.id).await.unwrap();
    let open: Vec<_> = all
        .iter()
        .filter(|t| matches!(t.status.as_deref(), Some("active") | Some("planned")))
        .collect();
    assert_eq!(open.len(), 1, "exactly one open therapy should remain");
    let fresh = &open[0];
    assert_ne!(fresh.id, stale.id, "the new therapy must differ from the stale one");
    assert_eq!(fresh.machine_id, machine.id);
    assert_eq!(fresh.patient_id, patient.id);
}

/// `new_therapy: false` (bridge restarted mid-session) must keep the existing
/// same-patient/machine therapy: refresh metadata, do NOT create a duplicate.
#[sqlx::test]
async fn handle_bridge_therapy_setup_continuation_no_duplicate(pool: PgPool) {
    use server::infrastructure::ws_hub::{
        BridgeFrame, WsHubState, handle_bridge_frame,
    };

    common::setup_db(&pool).await;
    let repos = common::create_repos(&pool);

    let patient = repos
        .patient
        .create("CONT-PATIENT", None, None, None, None)
        .await
        .unwrap();
    let machine = repos
        .machine
        .upsert_by_serial("CONT-MACHINE", None, None, None)
        .await
        .unwrap();
    let existing = repos
        .therapy
        .create(patient.id, machine.id, Some("HD"), None, None)
        .await
        .unwrap();

    let ws_hub = WsHubState::new(
        repos.machine.clone(),
        repos.patient.clone(),
        repos.therapy.clone(),
        repos.readings,
        repos.version,
        repos.bridge,
        repos.signal,
        repos.equivalence,
        0, // persistence_interval_secs: 0 = inmediato
    );

    let frame = BridgeFrame::TherapySetup {
        machine_id: machine.id,
        patient_id_str: patient.external_id.clone(),
        therapy_type: Some("HD".into()),
        kit: Some("FX100".into()),
        weight: Some(72.0),
        new_therapy: false,
    };

    let mut current_machine_id: Option<i64> = Some(machine.id);
    let mut current_bridge_id: Option<i64> = None;

    let result = handle_bridge_frame(
        &ws_hub,
        &frame,
        &mut current_machine_id,
        &mut current_bridge_id,
    )
    .await;

    assert!(result.is_ok(), "handle_bridge_frame should succeed: {:?}", result);

    // No duplicate: exactly one therapy for the patient, still the same row.
    let all = repos.therapy.list_by_patient(patient.id).await.unwrap();
    assert_eq!(all.len(), 1, "continuation must not create a duplicate therapy");
    assert_eq!(all[0].id, existing.id);

    // Metadata was refreshed on the continued session.
    let continued = repos.therapy.find_by_id(existing.id).await.unwrap().unwrap();
    assert_eq!(continued.kit.as_deref(), Some("FX100"));
    assert_eq!(continued.weight, Some(72.0));
}
