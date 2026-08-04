//! Dual WebSocket hub: bridge ingress + browser broadcast.
//!
//! Bridge connections receive raw OMNI machine data. Browser connections
//! subscribe/unsubscribe per `machine_id` and receive live broadcasts.

use std::collections::HashMap;

use std::sync::Arc;
use std::time::Duration;

use axum::extract::ws::{Message, WebSocket};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use tokio::sync::{mpsc, RwLock};
use tracing::{debug, error, info, warn};

use crate::domain::entities::{Reading, Therapy};
use crate::infrastructure::postgres::{
    bridge_repo::BridgeRepo,
    equivalence_repo::EquivalenceRepo,
    machine_repo::MachineRepo,
    patient_repo::PatientRepo,
    readings_repo::ReadingsRepo,
    signal_repo::SignalRepo,
    therapy_repo::TherapyRepo,
    version_repo::{InitAttribute, InitDictionary, VersionRepo},
    RepoError,
};

// ───────────────────────────────────────────────
//  Frame definitions
// ───────────────────────────────────────────────

/// Bridge → Server frames.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BridgeFrame {
    Register {
        ip_address: String,
    },
    MachineIdentify {
        bridge_id: i64,
        serial_number: String,
        ip_address: String,
    },
    InitQuery {
        fingerprint: String,
    },
    Readings {
        machine_id: i64,
        cycle: u64,
        readings: Vec<BridgeTelemetryReading>,
    },
    Heartbeat {
        machine_id: i64,
    },
    StoreInit {
        version: BridgeVersionInfo,
        attributes: Vec<BridgeDataAttribute>,
        dictionary: Vec<BridgeDictionaryEntry>,
    },
    TherapySetup {
        machine_id: i64,
        patient_id_str: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        therapy_type: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        kit: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        weight: Option<f64>,
        /// True when the bridge observed the previous session end before this
        /// setup: close every still-open therapy of the patient and start a
        /// brand-new one instead of continuing a stale session. Defaults to
        /// false so older bridges that omit the field keep the old behavior.
        #[serde(default)]
        new_therapy: bool,
    },
    SerialStatus {
        state: String,
        failure_count: u32,
        ws_state: String,
    },
    /// Sent when the bridge detects `c_trmt_main_state == 3` (End of therapy).
    TherapyEnd {
        machine_id: i64,
    },
}

/// Server → Bridge frames.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerFrame {
    VersionConfig {
        attributes: Vec<ServerDataAttribute>,
        dictionary: Vec<ServerDictionaryEntry>,
    },
    UnknownVersion,
    Ack,
    Registered {
        bridge_id: i64,
    },
    MachineIdentified {
        machine_id: i64,
    },
    /// Notifies the bridge that its active therapy was closed from the UI.
    /// The bridge resets its metadata cache and re-sends `TherapySetup`.
    TherapyClosed {
        therapy_id: i64,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BridgeTelemetryReading {
    pub id: Option<i64>,
    /// Unix epoch milliseconds (i64, no string parsing needed).
    pub timestamp: i64,
    pub therapy_id: Option<i64>,
    pub signal_id: i64,
    pub internal_name: String,
    pub raw_value: i64,
    pub value: Option<f64>,
    pub unit: String,
    pub phase: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BridgeVersionInfo {
    pub language_id: i32,
    pub system_sw: String,
    pub dss_fw: String,
    pub dss_hw: String,
    pub css_fw: String,
    pub css_hw: String,
    pub pss_fw: String,
    pub pss_hw: String,
    pub language1: String,
    pub language2: String,
    pub language3: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BridgeDataAttribute {
    pub handle: i32,
    pub data_type: String,
    pub size: i32,
    pub conversion_factor: i32,
    pub label_did: i32,
    pub unit_did: i32,
    pub signal_id: i32,
    pub internal_name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BridgeDictionaryEntry {
    pub dict_id: i32,
    pub text: String,
}

/// Serial status payload for a bridge, stored in-memory and broadcast to browsers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BridgeSerialStatusPayload {
    pub state: String,
    pub failure_count: u32,
    pub ws_state: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ServerDataAttribute {
    pub handle: i32,
    pub data_type: String,
    pub size: i32,
    pub conversion_factor: i32,
    pub label_did: i32,
    pub unit_did: i32,
    pub signal_id: i32,
    pub internal_name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ServerDictionaryEntry {
    pub dict_id: i32,
    pub text: String,
}

/// Browser subscription event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BrowserEvent {
    ReadingsBroadcast {
        machine_id: i64,
        cycle: u64,
        readings: Vec<BridgeTelemetryReading>,
        therapy_active: bool,
        therapy_state_name: String,
        therapy_start: Option<String>,
    },
    ReadingsReplay {
        machine_id: i64,
        readings: Vec<BridgeTelemetryReading>,
        replay_window_secs: i64,
    },
    MachineStatus {
        machine_id: i64,
        status: String,
        last_seen_at: String,
    },
    RESTFallback {
        machine_id: i64,
        message: String,
    },
    SerialStatus {
        bridge_id: i64,
        state: String,
        failure_count: u32,
        ws_state: String,
        updated_at: String,
    },
}

/// Browser → Server subscription command.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "action")]
pub enum BrowserCommand {
    Subscribe { machine_id: i64 },
    Unsubscribe { machine_id: i64 },
}

// ───────────────────────────────────────────────
//  Hub state
// ───────────────────────────────────────────────

/// Buffer del canal por browser subscriber. Si el cliente es lento,
/// el canal se llena y se desconecta en vez de acumular memoria infinita.
const BROWSER_CHANNEL_BUFFER: usize = 256;

type BrowserSenders = Arc<RwLock<HashMap<i64, Vec<mpsc::Sender<String>>>>>;

/// In-memory catalog for enriching incoming telemetry readings.
///
/// Mirrors the original pdms-omni behavior: `signals.unit` is the fallback
/// for a missing/empty unit from the bridge.
#[derive(Debug, Clone, Default)]
pub struct SignalCatalog {
    /// signal_id → canonical unit from the signals catalog.
    pub units: HashMap<i64, String>,
}

/// Shared state for the WebSocket hub.
#[derive(Debug, Clone)]
pub struct WsHubState {
    pub machine_repo: MachineRepo,
    pub patient_repo: PatientRepo,
    pub therapy_repo: TherapyRepo,
    pub readings_repo: ReadingsRepo,
    pub version_repo: VersionRepo,
    pub bridge_repo: BridgeRepo,
    pub signal_repo: SignalRepo,
    pub equivalence_repo: EquivalenceRepo,
    /// Catalog used to resolve units for readings.
    pub signal_catalog: Arc<RwLock<SignalCatalog>>,
    browser_subs: BrowserSenders,
    /// Outbound push channels to bridges, keyed by machine_id. Used to send
    /// server-initiated frames (e.g. `TherapyClosed`) to the connected bridge.
    bridge_senders: Arc<RwLock<HashMap<i64, mpsc::Sender<String>>>>,
    /// Latest serial status per bridge_id, stored in-memory.
    pub bridge_statuses: Arc<RwLock<HashMap<i64, BridgeSerialStatusPayload>>>,
    /// Timestamp (epoch ms) del último snapshot por máquina.
    /// Cada máquina lleva su propio timer — no se pierden snapshots por contención global.
    last_persist_per_machine: Arc<RwLock<HashMap<i64, u64>>>,
    /// Intervalo mínimo entre persists de snapshot (segundos). 0 = cada ciclo.
    persistence_interval_secs: u64,
}

impl WsHubState {
    pub fn new(
        machine_repo: MachineRepo,
        patient_repo: PatientRepo,
        therapy_repo: TherapyRepo,
        readings_repo: ReadingsRepo,
        version_repo: VersionRepo,
        bridge_repo: BridgeRepo,
        signal_repo: SignalRepo,
        equivalence_repo: EquivalenceRepo,
        persistence_interval_secs: u64,
    ) -> Self {
        Self {
            machine_repo,
            patient_repo,
            therapy_repo,
            readings_repo,
            version_repo,
            bridge_repo,
            signal_repo,
            equivalence_repo,
            signal_catalog: Arc::new(RwLock::new(SignalCatalog::default())),
            browser_subs: Arc::new(RwLock::new(HashMap::new())),
            bridge_senders: Arc::new(RwLock::new(HashMap::new())),
            bridge_statuses: Arc::new(RwLock::new(HashMap::new())),
            last_persist_per_machine: Arc::new(RwLock::new(HashMap::new())),
            persistence_interval_secs,
        }
    }

    /// (Re)load the in-memory signal catalog (units).
    pub async fn load_signal_catalog(&self) -> Result<(), RepoError> {
        let signals = self.signal_repo.list().await?;

        let mut units = HashMap::with_capacity(signals.len());
        for sig in &signals {
            if let Some(unit) = &sig.unit {
                if !unit.is_empty() {
                    units.insert(sig.id, unit.clone());
                }
            }
        }

        let mut catalog = self.signal_catalog.write().await;
        *catalog = SignalCatalog { units };
        info!(
            "Signal catalog loaded: {} units",
            catalog.units.len()
        );
        Ok(())
    }

    /// Enrich bridge readings with server-side catalog data:
    /// - `unit`: fallback to `signals.unit` when the bridge sent an empty value.
    pub async fn enrich_readings(&self, readings: &mut [BridgeTelemetryReading]) {
        let catalog = self.signal_catalog.read().await;
        enrich_readings_from_catalog(&catalog, readings);
    }

    /// Returns the configured persistence interval in seconds.
    pub fn persistence_interval_secs(&self) -> u64 {
        self.persistence_interval_secs
    }

    /// Current time as epoch milliseconds.
    fn epoch_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or(Duration::ZERO)
            .as_millis() as u64
    }

    /// Subscribe a browser sender to a machine_id.
    pub async fn subscribe_machine(&self, machine_id: i64, tx: mpsc::Sender<String>) {
        let mut subs = self.browser_subs.write().await;
        subs.entry(machine_id).or_default().push(tx);
        info!("Browser subscribed to machine {}", machine_id);
    }

    /// Unsubscribe a sender from all machines.
    pub async fn unsubscribe_sender(&self, tx: &mpsc::Sender<String>) {
        let mut subs = self.browser_subs.write().await;
        for (_, senders) in subs.iter_mut() {
            senders.retain(|s| !s.same_channel(tx));
        }
        subs.retain(|_, senders| !senders.is_empty());
    }

    /// Broadcast a JSON payload to ALL browser clients (regardless of machine subscription).
    /// Los clients lentos se descartan silenciosamente (bounded channel evita OOM).
    pub async fn broadcast_to_all_browsers(&self, payload: &str) {
        let subs = self.browser_subs.read().await;
        for (_, senders) in subs.iter() {
            for tx in senders {
                let _ = tx.try_send(payload.to_string());
            }
        }
    }

    /// Verifica si puede persistir un snapshot para una máquina específica.
    /// Cada máquina tiene su propio timer — no se pierden snapshots por contención global.
    /// Si `persistence_interval_secs == 0` o pasó el tiempo desde su último persist, retorna true.
    async fn check_persist_interval(&self, machine_id: i64) -> bool {
        let interval = self.persistence_interval_secs;
        if interval == 0 {
            return true; // modo inmediato: siempre persistir
        }
        let interval_ms = interval * 1000;
        let now = Self::epoch_ms();

        // Actualización atómica por máquina vía async write lock
        let mut timers = self.last_persist_per_machine.write().await;
        let last = timers.get(&machine_id).copied().unwrap_or(0);
        if now.saturating_sub(last) >= interval_ms {
            timers.insert(machine_id, now);
            true
        } else {
            false
        }
    }

    /// Broadcast a JSON payload to all browsers subscribed to a machine.
    /// Los clients lentos (buffer lleno) se descartan — bounded channel evita OOM.
    pub async fn broadcast_to_machine(&self, machine_id: i64, payload: &str) {
        let mut dead: Vec<usize> = Vec::new();
        {
            let subs = self.browser_subs.read().await;
            if let Some(senders) = subs.get(&machine_id) {
                for (i, tx) in senders.iter().enumerate() {
                    if tx.try_send(payload.to_string()).is_err() {
                        dead.push(i);
                    }
                }
            }
        }

        if !dead.is_empty() {
            let mut subs = self.browser_subs.write().await;
            if let Some(senders) = subs.get_mut(&machine_id) {
                for &i in dead.iter().rev() {
                    if i < senders.len() {
                        senders.remove(i);
                    }
                }
                if senders.is_empty() {
                    subs.remove(&machine_id);
                }
            }
        }
    }

    /// Notify the bridge of a machine that its active therapy was closed
    /// (e.g. from the UI). The bridge resets its metadata cache and re-sends
    /// TherapySetup so the server can create the next session.
    pub async fn notify_therapy_closed(&self, machine_id: i64, therapy_id: i64) {
        let payload = serde_json::to_string(&ServerFrame::TherapyClosed { therapy_id }).unwrap_or_default();
        let senders = self.bridge_senders.read().await;
        if let Some(tx) = senders.get(&machine_id) {
            let _ = tx.try_send(payload);
        }
    }
}

/// Pure enrichment: applies the catalog to readings (unit fallback).
pub fn enrich_readings_from_catalog(
    catalog: &SignalCatalog,
    readings: &mut [BridgeTelemetryReading],
) {
    for r in readings.iter_mut() {
        if r.unit.is_empty() {
            if let Some(unit) = catalog.units.get(&r.signal_id) {
                r.unit = unit.clone();
            }
        }
    }
}

// ───────────────────────────────────────────────
//  Bridge connection handler
// ───────────────────────────────────────────────

/// Handle a single bridge WebSocket connection.
pub async fn handle_bridge_connection(mut ws: WebSocket, state: Arc<WsHubState>) {
    let mut current_machine_id: Option<i64> = None;
    let mut current_bridge_id: Option<i64> = None;

    // Per-connection channel for server-initiated outbound pushes
    // (e.g. TherapyClosed when a therapy is closed from the UI).
    let (bridge_tx, mut bridge_rx) = mpsc::channel::<String>(16);

    loop {
        tokio::select! {
            // Incoming frames from the bridge
            msg = ws.recv() => {
                let msg = match msg {
                    Some(Ok(Message::Text(text))) => text,
                    Some(Ok(Message::Close(_))) => break,
                    Some(Ok(Message::Ping(payload))) => {
                        let _ = ws.send(Message::Pong(payload)).await;
                        continue;
                    }
                    Some(Ok(Message::Pong(_))) => continue,
                    Some(Err(e)) => {
                        error!("Bridge WS error: {}", e);
                        break;
                    }
                    None => break,
                    _ => continue,
                };

                let frame: BridgeFrame = match serde_json::from_str(&msg) {
                    Ok(f) => f,
                    Err(e) => {
                        warn!("Invalid bridge frame: {}", e);
                        let err = ServerFrame::Error {
                            message: format!("Invalid frame: {}", e),
                        };
                        let _ = ws
                            .send(Message::Text(serde_json::to_string(&err).unwrap()))
                            .await;
                        continue;
                    }
                };

                let is_machine_identify = matches!(frame, BridgeFrame::MachineIdentify { .. });
                let response = handle_bridge_frame(&state, &frame, &mut current_machine_id, &mut current_bridge_id).await;

                // Once the bridge identifies a machine, register its outbound
                // sender so the server can push frames to it (TherapyClosed).
                // Overwriting on re-identify is harmless.
                if is_machine_identify {
                    if let Some(mid) = current_machine_id {
                        state.bridge_senders.write().await.insert(mid, bridge_tx.clone());
                        info!("Registered bridge sender for machine {}", mid);
                    }
                }

                match response {
                    Ok(Some(resp_frame)) => {
                        let json = serde_json::to_string(&resp_frame).unwrap();
                        let _ = ws.send(Message::Text(json)).await;
                    }
                    Ok(None) => {}
                    Err(e) => {
                        let err = ServerFrame::Error {
                            message: e.to_string(),
                        };
                        let _ = ws
                            .send(Message::Text(serde_json::to_string(&err).unwrap()))
                            .await;
                    }
                }
            }

            // Outbound push from the hub to this bridge
            payload = bridge_rx.recv() => {
                match payload {
                    Some(json) => {
                        if ws.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
        }
    }

    if let Some(machine_id) = current_machine_id {
        state.bridge_senders.write().await.remove(&machine_id);
        if let Err(e) = state.machine_repo.set_offline(machine_id).await {
            error!("Failed to set machine {} offline on disconnect: {}", machine_id, e);
        }
    }

    if let Some(bridge_id) = current_bridge_id {
        if let Err(e) = state.bridge_repo.set_offline(bridge_id).await {
            error!("Failed to set bridge {} offline on disconnect: {}", bridge_id, e);
        }
    }

    info!("Bridge connection closed");
}

/// Validate that a frame's claimed machine_id matches the identified machine_id
/// for this bridge connection. Returns an error frame if validation fails.
fn validate_identified_machine(
    current_machine_id: Option<i64>,
    claimed_machine_id: i64,
    frame_type: &str,
) -> Result<(), ServerFrame> {
    match current_machine_id {
        Some(identified) if identified == claimed_machine_id => Ok(()),
        Some(identified) => {
            warn!(
                "{}: machine_id mismatch — claimed {}, identified {}",
                frame_type, claimed_machine_id, identified
            );
            Err(ServerFrame::Error {
                message: format!(
                    "Machine mismatch: claimed {} but bridge identified as {}",
                    claimed_machine_id, identified
                ),
            })
        }
        None => {
            warn!(
                "{} received before machine identification (machine_id={})",
                frame_type, claimed_machine_id
            );
            Err(ServerFrame::Error {
                message: "Bridge must identify a machine before sending data frames".into(),
            })
        }
    }
}

pub async fn handle_bridge_frame(
    state: &WsHubState,
    frame: &BridgeFrame,
    current_machine_id: &mut Option<i64>,
    current_bridge_id: &mut Option<i64>,
) -> Result<Option<ServerFrame>, RepoError> {
    match frame {
        BridgeFrame::Register { ip_address } => {
            match state.bridge_repo.find_by_ip(ip_address).await? {
                Some(bridge) if bridge.authorized => {
                    state.bridge_repo.set_online(bridge.id).await?;
                    *current_bridge_id = Some(bridge.id);
                    info!("Bridge {} registered (IP={})", bridge.id, ip_address);
                    Ok(Some(ServerFrame::Registered { bridge_id: bridge.id }))
                }
                Some(_) => {
                    warn!("Bridge IP {} exists but is deauthorized", ip_address);
                    Ok(Some(ServerFrame::Error { message: "IP not authorized".into() }))
                }
                None => {
                    warn!("Bridge IP {} not registered in bridges table", ip_address);
                    Ok(Some(ServerFrame::Error { message: "IP not registered".into() }))
                }
            }
        }

        BridgeFrame::MachineIdentify { bridge_id, serial_number, ip_address } => {
            info!("Bridge {} identifying machine by serial {} (IP {})", bridge_id, serial_number, ip_address);
            let machine = state
                .machine_repo
                .upsert_by_serial(serial_number, Some(ip_address), None, None)
                .await?;
            *current_machine_id = Some(machine.id);
            Ok(Some(ServerFrame::MachineIdentified { machine_id: machine.id }))
        }

        BridgeFrame::InitQuery { fingerprint } => {
            let version = state.version_repo.get_by_fingerprint(fingerprint).await?;

            match version {
                Some(v) => {
                    let attrs = state.version_repo.get_attributes(v.id).await?;
                    let dict = state.version_repo.get_dictionary(v.id).await?;

                    let server_attrs: Vec<ServerDataAttribute> = attrs
                        .into_iter()
                        .map(|a| ServerDataAttribute {
                            handle: a.handle,
                            data_type: a.data_type.unwrap_or_default(),
                            size: a.size.unwrap_or(0),
                            conversion_factor: a.conversion_factor.unwrap_or(1),
                            label_did: a.label_did.unwrap_or(0),
                            unit_did: a.unit_did.unwrap_or(0),
                            signal_id: a.signal_id.unwrap_or(0),
                            internal_name: a.internal_name.unwrap_or_default(),
                        })
                        .collect();

                    let server_dict: Vec<ServerDictionaryEntry> = dict
                        .into_iter()
                        .map(|d| ServerDictionaryEntry {
                            dict_id: d.dict_id,
                            text: d.text.unwrap_or_default(),
                        })
                        .collect();

                    Ok(Some(ServerFrame::VersionConfig {
                        attributes: server_attrs,
                        dictionary: server_dict,
                    }))
                }
                None => Ok(Some(ServerFrame::UnknownVersion)),
            }
        }

        BridgeFrame::Readings {
            machine_id,
            cycle,
            readings,
        } => {
            if let Err(err_frame) = validate_identified_machine(*current_machine_id, *machine_id, "Readings") {
                return Ok(Some(err_frame));
            }

            // Enrich with the server-side catalog: unit fallback (signals.unit).
            // Both the persisted rows and the live broadcast consume the enriched readings.
            let mut readings = readings.clone();
            state.enrich_readings(&mut readings).await;

            // ── Map readings to domain model (sin therapy_id aún) ──
            // El broadcast usa los readings mapeados sin therapy_id.
            let domain_readings: Vec<Reading> = readings
                .iter()
                .map(|r| Reading {
                    id: 0,
                    machine_id: *machine_id,
                    therapy_id: None,
                    signal_id: Some(r.signal_id),
                    recorded_at: chrono::DateTime::from_timestamp_millis(r.timestamp),
                    raw_value: Some(r.raw_value),
                    value: r.value,
                    unit: Some(r.unit.clone()),
                    created_at: Utc::now(),
                })
                .collect();

            // ── Resolve active therapy once per frame: used for FK linking on
            //    persist AND for the therapy-state fields of the broadcast. ──
            let active_therapy: Option<Therapy> = match state.therapy_repo.find_active_by_machine(*machine_id).await {
                Ok(t) => t,
                Err(e) => {
                    error!("Failed to check active therapy for machine {}: {}", machine_id, e);
                    None
                }
            };

            // ── Promote a 'planned' session to 'active' on first telemetry ──
            // The bridge creates therapies as 'planned' on TherapySetup; the
            // first Readings frame after that means the session is running, so
            // promote it to 'active' (which also backfills started_at).
            let mut therapy_activated = false;
            if let Some(therapy) = &active_therapy {
                if therapy.status.as_deref() == Some("planned") {
                    match state.therapy_repo.update_status(therapy.id, "active").await {
                        Ok(_) => {
                            therapy_activated = true;
                            info!(
                                "Promoted therapy {} to active on first telemetry (machine {})",
                                therapy.id, machine_id
                            );
                        }
                        Err(e) => {
                            error!(
                                "Failed to promote therapy {} to active for machine {}: {}",
                                therapy.id, machine_id, e
                            );
                        }
                    }
                }
            }

            // ── Persistence: solo si hay terapia activa ──
            // Resolvemos la terapia activa para vincular los readings con su FK.
            // En estados sin terapia activa (preparación, finalizada, etc.)
            // solo se hace broadcast en vivo.
            if state.check_persist_interval(*machine_id).await {
                if !domain_readings.is_empty() {
                    if let Some(therapy) = &active_therapy {
                        // Vincular readings con la terapia activa
                        let linked: Vec<Reading> = domain_readings.iter().map(|r| Reading {
                            therapy_id: Some(therapy.id),
                            ..r.clone()
                        }).collect();

                        if let Err(e) = state.readings_repo.insert_batch(&linked).await {
                            error!("Failed to insert readings for machine {}: {}", machine_id, e);
                        } else if state.persistence_interval_secs > 0 {
                            debug!("[persist] snapshot {} readings (machine {}, therapy {})",
                                linked.len(), machine_id, therapy.id);
                        }
                    } else {
                        debug!("[persist] skip — no active therapy for machine {}", machine_id);
                    }
                }
            }

            // ── Broadcast en tiempo real (siempre inmediato) ──
            // La terapia activa viaja en cada broadcast para que el SCADA
            // muestre el estado de terapia sin una round-trip REST adicional.
            let (therapy_active, therapy_state_name, therapy_start) = match &active_therapy {
                Some(therapy) => {
                    // If we just promoted the session, reflect the new status
                    // and start time in this very broadcast (the local Therapy
                    // struct still holds the pre-update values).
                    let status = if therapy_activated {
                        "active".to_string()
                    } else {
                        therapy.status.clone().unwrap_or_default()
                    };
                    let start = if therapy_activated {
                        Some(Utc::now().to_rfc3339())
                    } else {
                        therapy.started_at.map(|t| t.to_rfc3339())
                    };
                    (status != "completed", status, start)
                }
                None => (false, String::new(), None),
            };
            let event = BrowserEvent::ReadingsBroadcast {
                machine_id: *machine_id,
                cycle: *cycle,
                readings: readings.clone(),
                therapy_active,
                therapy_state_name,
                therapy_start,
            };
            if let Ok(json) = serde_json::to_string(&event) {
                state.broadcast_to_machine(*machine_id, &json).await;
            }

            Ok(None)
        }

        BridgeFrame::Heartbeat { machine_id } => {
            if let Err(err_frame) = validate_identified_machine(*current_machine_id, *machine_id, "Heartbeat") {
                return Ok(Some(err_frame));
            }

            state.machine_repo.touch_last_seen(*machine_id).await?;

            let event = BrowserEvent::MachineStatus {
                machine_id: *machine_id,
                status: "online".into(),
                last_seen_at: Utc::now().to_rfc3339(),
            };
            if let Ok(json) = serde_json::to_string(&event) {
                state.broadcast_to_machine(*machine_id, &json).await;
            }

            Ok(None)
        }

        BridgeFrame::SerialStatus { state: s, failure_count, ws_state } => {
            if let Some(bridge_id) = *current_bridge_id {
                // Store in-memory
                let payload = BridgeSerialStatusPayload {
                    state: s.clone(),
                    failure_count: *failure_count,
                    ws_state: ws_state.clone(),
                    updated_at: Utc::now().to_rfc3339(),
                };
                {
                    let mut statuses = state.bridge_statuses.write().await;
                    statuses.insert(bridge_id, payload.clone());
                }

                // Tap heartbeat
                if let Err(e) = state.bridge_repo.touch_last_seen(bridge_id).await {
                    warn!("Failed to touch bridge {} last_seen: {}", bridge_id, e);
                }

                // Broadcast to ALL browser clients (not per-machine)
                let event = BrowserEvent::SerialStatus {
                    bridge_id,
                    state: payload.state,
                    failure_count: payload.failure_count,
                    ws_state: payload.ws_state,
                    updated_at: payload.updated_at,
                };
                if let Ok(json) = serde_json::to_string(&event) {
                    state.broadcast_to_all_browsers(&json).await;
                }
            } else {
                warn!("SerialStatus received before bridge registration");
            }

            Ok(None)
        }

        BridgeFrame::StoreInit {
            version,
            attributes,
            dictionary,
        } => {
            let attrs: Vec<InitAttribute> = attributes
                .iter()
                .map(|a| InitAttribute {
                    handle: a.handle,
                    data_type: a.data_type.clone(),
                    size: a.size,
                    conversion_factor: a.conversion_factor,
                    label_did: a.label_did,
                    unit_did: a.unit_did,
                    signal_id: a.signal_id,
                    internal_name: a.internal_name.clone(),
                })
                .collect();

            let dict: Vec<InitDictionary> = dictionary
                .iter()
                .map(|d| InitDictionary {
                    dict_id: d.dict_id,
                    text: d.text.clone(),
                })
                .collect();

            let fingerprint = compute_fingerprint(version);

            state
                .version_repo
                .save_initialization(
                    &fingerprint,
                    Some(version.language_id),
                    Some(&version.system_sw),
                    Some(&version.dss_fw),
                    Some(&version.dss_hw),
                    Some(&version.css_fw),
                    Some(&version.css_hw),
                    Some(&version.pss_fw),
                    Some(&version.pss_hw),
                    Some(&version.language1),
                    Some(&version.language2),
                    Some(&version.language3),
                    &attrs,
                    &dict,
                )
                .await?;

            info!("Stored initialization for fingerprint {}", fingerprint);
            Ok(Some(ServerFrame::Ack))
        }

        BridgeFrame::TherapySetup {
            machine_id,
            patient_id_str,
            therapy_type,
            kit,
            weight,
            new_therapy,
        } => {
            if let Err(err_frame) = validate_identified_machine(*current_machine_id, *machine_id, "TherapySetup") {
                return Ok(Some(err_frame));
            }

            handle_therapy_setup(
                state,
                *machine_id,
                patient_id_str,
                therapy_type.as_deref(),
                kit.as_deref(),
                *weight,
                *new_therapy,
            )
            .await?;

            info!(
                "TherapySetup handled for machine {}, patient {}",
                machine_id, patient_id_str
            );
            Ok(Some(ServerFrame::Ack))
        }

        BridgeFrame::TherapyEnd { machine_id } => {
            if let Err(err_frame) = validate_identified_machine(*current_machine_id, *machine_id, "TherapyEnd") {
                return Ok(Some(err_frame));
            }

            match state.therapy_repo.find_active_by_machine(*machine_id).await {
                Ok(Some(therapy)) => {
                    let completed = state.therapy_repo.update_status(therapy.id, "completed").await;
                    match completed {
                        Ok(t) => {
                            info!(
                                "TherapyEnd: closed therapy {} (machine {}, status={:?})",
                                therapy.id, machine_id, t.status
                            );
                        }
                        Err(e) => {
                            error!(
                                "TherapyEnd: failed to close therapy {} for machine {}: {}",
                                therapy.id, machine_id, e
                            );
                        }
                    }
                }
                Ok(None) => {
                    info!(
                        "TherapyEnd: no active therapy to close for machine {}",
                        machine_id
                    );
                }
                Err(e) => {
                    error!(
                        "TherapyEnd: error finding active therapy for machine {}: {}",
                        machine_id, e
                    );
                }
            }

            Ok(Some(ServerFrame::Ack))
        }
    }
}

/// Handle TherapySetup from the bridge: find-or-create patient + therapy.
async fn handle_therapy_setup(
    state: &WsHubState,
    machine_id: i64,
    patient_id_str: &str,
    therapy_type: Option<&str>,
    kit: Option<&str>,
    weight: Option<f64>,
    new_therapy: bool,
) -> Result<(), RepoError> {
    let patient = match state.patient_repo.find_by_external_id(patient_id_str).await? {
        Some(p) => p,
        None => state.patient_repo.create(patient_id_str, None, None, None, None).await?,
    };

    // The bridge sends g_therapy_mode_set as a numeric code; resolve it to a
    // human-readable name via the equivalences table before persisting.
    let therapy_type = match therapy_type {
        Some(code) => match state
            .equivalence_repo
            .resolve_display_name("g_therapy_mode_set", code)
            .await?
        {
            Some(name) => Some(name),
            None => Some(code.to_owned()),
        },
        None => None,
    };

    // The bridge observed the previous session end (state 0 or 3): this setup
    // is a genuinely NEW session. Close every still-open therapy of the patient
    // (including a stale one left open on this same machine after a crash) and
    // start fresh, so the new session never continues a stale one.
    if new_therapy {
        let closed = state
            .therapy_repo
            .close_open_by_patient(patient.id, None)
            .await?;
        if closed > 0 {
            info!(
                "TherapySetup: auto-closed {} open therapies for patient {} before starting a new one",
                closed, patient.id
            );
        }
        create_new_therapy(
            state,
            patient.id,
            machine_id,
            therapy_type.as_deref(),
            kit,
            weight,
        )
        .await?;
        return Ok(());
    }

    match state.therapy_repo.find_active_by_machine(machine_id).await? {
        Some(therapy) if therapy.patient_id == patient.id => {
            // Same patient continues the session: refresh metadata only.
            state
                .therapy_repo
                .update_metadata(therapy.id, therapy_type.as_deref(), kit, weight, None)
                .await?;
            // Backfill start time for sessions created before the start-time fix.
            if therapy.started_at.is_none() {
                state.therapy_repo.ensure_started(therapy.id).await?;
            }
            // Close any OTHER open therapy of this patient (e.g. on another
            // machine) so the continued session is the only open one.
            let closed = state
                .therapy_repo
                .close_open_by_patient(patient.id, Some(therapy.id))
                .await?;
            if closed > 0 {
                info!(
                    "TherapySetup: auto-closed {} other open therapies for patient {} (continuing therapy {})",
                    closed, patient.id, therapy.id
                );
            }
        }
        Some(therapy) => {
            // Different patient on this machine: close the previous session
            // and start a new one, so each patient run gets its own therapy.
            info!(
                "TherapySetup: closing therapy {} for machine {} (patient {} -> {})",
                therapy.id, machine_id, therapy.patient_id, patient.id
            );
            state.therapy_repo.update_status(therapy.id, "completed").await?;
            // Close any open therapy the incoming patient may have elsewhere.
            let closed = state
                .therapy_repo
                .close_open_by_patient(patient.id, None)
                .await?;
            if closed > 0 {
                info!(
                    "TherapySetup: auto-closed {} open therapies for patient {} before starting a new one",
                    closed, patient.id
                );
            }
            create_new_therapy(
                state,
                patient.id,
                machine_id,
                therapy_type.as_deref(),
                kit,
                weight,
            )
            .await?;
        }
        None => {
            // Close any open therapy the patient may have on other machines
            // before creating the new one.
            let closed = state
                .therapy_repo
                .close_open_by_patient(patient.id, None)
                .await?;
            if closed > 0 {
                info!(
                    "TherapySetup: auto-closed {} open therapies for patient {} before starting a new one",
                    closed, patient.id
                );
            }
            create_new_therapy(
                state,
                patient.id,
                machine_id,
                therapy_type.as_deref(),
                kit,
                weight,
            )
            .await?;
        }
    }

    Ok(())
}

/// Create a new therapy for the patient, closing any open therapy first so
/// the one-open-therapy-per-patient invariant always holds. Retries once on a
/// unique-violation race (two setups creating concurrently): the conflicting
/// open therapy is closed and the create is retried.
async fn create_new_therapy(
    state: &WsHubState,
    patient_id: i64,
    machine_id: i64,
    therapy_type: Option<&str>,
    kit: Option<&str>,
    weight: Option<f64>,
) -> Result<(), RepoError> {
    let mut attempt = 0;
    loop {
        match state.therapy_repo.create(patient_id, machine_id, therapy_type, kit, weight).await {
            Ok(_) => return Ok(()),
            Err(RepoError::Conflict(_msg)) if attempt == 0 => {
                attempt += 1;
                let closed = state.therapy_repo.close_open_by_patient(patient_id, None).await?;
                if closed > 0 {
                    info!(
                        "TherapySetup: race resolved, auto-closed {} open therapies for patient {} before retrying create",
                        closed, patient_id
                    );
                }
            }
            Err(e) => return Err(e),
        }
    }
}

/// Compute deterministic fingerprint (mirrors bridge).
fn compute_fingerprint(version: &BridgeVersionInfo) -> String {
    let s = format!(
        "{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}",
        version.language_id,
        version.system_sw,
        version.dss_fw,
        version.dss_hw,
        version.css_fw,
        version.css_hw,
        version.pss_fw,
        version.pss_hw,
        version.language1,
        version.language2,
        version.language3,
    );
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in s.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}

// ───────────────────────────────────────────────
//  Browser connection handler
// ───────────────────────────────────────────────

/// Handle a single browser WebSocket connection.
///
/// Multiplexes between incoming WS commands (subscribe/unsubscribe)
/// and outbound broadcasts from the hub. Uses `tokio::select!`.
pub async fn handle_browser_connection(mut ws: WebSocket, state: Arc<WsHubState>) {
    let (browser_tx, mut browser_rx) = mpsc::channel::<String>(BROWSER_CHANNEL_BUFFER);

    loop {
        tokio::select! {
            // Incoming command from browser
            msg = ws.recv() => {
                let msg = match msg {
                    Some(Ok(Message::Text(text))) => text,
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(payload))) => {
                        let _ = ws.send(Message::Pong(payload)).await;
                        continue;
                    }
                    Some(Ok(Message::Pong(_))) => continue,
                    Some(Err(e)) => {
                        error!("Browser WS error: {}", e);
                        break;
                    }
                    _ => continue,
                };

                let cmd: BrowserCommand = match serde_json::from_str(&msg) {
                    Ok(c) => c,
                    Err(e) => {
                        warn!("Invalid browser command: {}", e);
                        continue;
                    }
                };

                match cmd {
                    BrowserCommand::Subscribe { machine_id } => {
                        state.subscribe_machine(machine_id, browser_tx.clone()).await;

                        // ── Replay last 60 seconds of readings ──
                        let since = Utc::now()
                            - chrono::Duration::try_seconds(60)
                                .unwrap_or(chrono::Duration::seconds(60));
                        match state.readings_repo.query_by_machine_since(machine_id, since, Some(200)).await
                        {
                            Ok(readings) if !readings.is_empty() => {
                                let bridge_readings: Vec<BridgeTelemetryReading> = readings
                                    .iter()
                                    .map(|r| BridgeTelemetryReading {
                                        id: Some(r.id),
                                        timestamp: r
                                            .recorded_at
                                            .map(|t| t.timestamp_millis())
                                            .unwrap_or(0),
                                        therapy_id: None, // ya no se persiste en readings
                                        signal_id: r.signal_id.unwrap_or(0),
                                        internal_name: String::new(),
                                        raw_value: r.raw_value.unwrap_or(0),
                                        value: r.value,
                                        unit: r.unit.clone().unwrap_or_default(),
                                        phase: None, // ya no se persiste en readings
                                    })
                                    .collect();

                                let replay_event = BrowserEvent::ReadingsReplay {
                                    machine_id,
                                    readings: bridge_readings,
                                    replay_window_secs: 60,
                                };
                                if let Ok(json) = serde_json::to_string(&replay_event) {
                                    let _ = browser_tx.send(json).await;
                                }
                            }
                            Ok(_) => {
                                // No readings in last 60s — check gap via latest reading
                                let gap_check = state
                                    .readings_repo
                                    .query_by_machine(machine_id, Some(1))
                                    .await
                                    .ok()
                                    .and_then(|r| r.into_iter().next());

                                if let Some(last) = gap_check {
                                    let age = Utc::now()
                                        - last.recorded_at.unwrap_or(Utc::now());
                                    if age > chrono::Duration::try_minutes(5)
                                        .unwrap_or(chrono::Duration::minutes(5))
                                    {
                                        let fallback = BrowserEvent::RESTFallback {
                                            machine_id,
                                            message: format!(
                                                "Last reading was {:.0} minutes ago. \
                                                 Use REST API for historical data.",
                                                age.num_minutes()
                                            ),
                                        };
                                        if let Ok(json) = serde_json::to_string(&fallback) {
                                            let _ = browser_tx.send(json).await;
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                warn!(
                                    "Failed to query readings for replay (machine {}): {}",
                                    machine_id, e
                                );
                            }
                        }
                    }
                    BrowserCommand::Unsubscribe { machine_id } => {
                        let mut subs = state.browser_subs.write().await;
                        if let Some(senders) = subs.get_mut(&machine_id) {
                            senders.retain(|s| !s.same_channel(&browser_tx));
                            if senders.is_empty() {
                                subs.remove(&machine_id);
                            }
                        }
                    }
                }
            }

            // Outgoing broadcast from hub
            payload = browser_rx.recv() => {
                match payload {
                    Some(json) => {
                        if ws.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
        }
    }

    state.unsubscribe_sender(&browser_tx).await;
    info!("Browser connection closed");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reading(signal_id: i64, value: Option<f64>, unit: &str) -> BridgeTelemetryReading {
        BridgeTelemetryReading {
            id: None,
            timestamp: 0,
            therapy_id: None,
            signal_id,
            internal_name: format!("s{signal_id}"),
            raw_value: 0,
            value,
            unit: unit.to_string(),
            phase: None,
        }
    }

    #[test]
    fn enrich_applies_unit_fallback() {
        let catalog = SignalCatalog {
            units: HashMap::from([(1, "mmHg".to_string())]),
        };

        let mut readings = vec![
            reading(1, Some(120.0), ""),
            reading(2, Some(3.0), ""),
            reading(3, Some(7.0), "x"),
        ];

        enrich_readings_from_catalog(&catalog, &mut readings);

        // unit fallback from signals catalog
        assert_eq!(readings[0].unit, "mmHg");
        // untouched: unknown signal keeps bridge unit
        assert_eq!(readings[2].unit, "x");
    }

    #[test]
    fn enrich_preserves_bridge_values_when_present() {
        let catalog = SignalCatalog {
            units: HashMap::from([(1, "mmHg".to_string())]),
        };

        let mut readings = vec![reading(1, Some(120.0), "kPa")];

        enrich_readings_from_catalog(&catalog, &mut readings);

        // bridge unit wins when non-empty
        assert_eq!(readings[0].unit, "kPa");
    }
}
