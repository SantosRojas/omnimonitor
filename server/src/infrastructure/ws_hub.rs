//! Dual WebSocket hub: bridge ingress + browser broadcast.
//!
//! Bridge connections receive raw OMNI machine data. Browser connections
//! subscribe/unsubscribe per `machine_id` and receive live broadcasts.

use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, RwLock};
use tracing::{error, info, warn};

use crate::domain::entities::Reading;
use crate::infrastructure::postgres::{
    machine_repo::MachineRepo,
    patient_repo::PatientRepo,
    readings_repo::ReadingsRepo,
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
        serial_number: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        mac_addr: Option<String>,
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
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BridgeTelemetryReading {
    pub id: Option<i64>,
    pub timestamp: String,
    pub therapy_id: Option<i64>,
    pub signal_id: i64,
    pub internal_name: String,
    pub raw_value: i64,
    pub value: Option<f64>,
    pub unit: String,
    pub display_value: Option<String>,
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
    },
    MachineStatus {
        machine_id: i64,
        status: String,
        last_seen_at: String,
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

type BrowserSenders = Arc<RwLock<HashMap<i64, Vec<mpsc::UnboundedSender<String>>>>>;

/// Shared state for the WebSocket hub.
#[derive(Debug, Clone)]
pub struct WsHubState {
    pub machine_repo: MachineRepo,
    pub patient_repo: PatientRepo,
    pub therapy_repo: TherapyRepo,
    pub readings_repo: ReadingsRepo,
    pub version_repo: VersionRepo,
    browser_subs: BrowserSenders,
}

impl WsHubState {
    pub fn new(
        machine_repo: MachineRepo,
        patient_repo: PatientRepo,
        therapy_repo: TherapyRepo,
        readings_repo: ReadingsRepo,
        version_repo: VersionRepo,
    ) -> Self {
        Self {
            machine_repo,
            patient_repo,
            therapy_repo,
            readings_repo,
            version_repo,
            browser_subs: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Subscribe a browser sender to a machine_id.
    pub async fn subscribe_machine(&self, machine_id: i64, tx: mpsc::UnboundedSender<String>) {
        let mut subs = self.browser_subs.write().await;
        subs.entry(machine_id).or_default().push(tx);
        info!("Browser subscribed to machine {}", machine_id);
    }

    /// Unsubscribe a sender from all machines.
    pub async fn unsubscribe_sender(&self, tx: &mpsc::UnboundedSender<String>) {
        let mut subs = self.browser_subs.write().await;
        for (_, senders) in subs.iter_mut() {
            senders.retain(|s| !s.same_channel(tx));
        }
        subs.retain(|_, senders| !senders.is_empty());
    }

    /// Broadcast a JSON payload to all browsers subscribed to a machine.
    pub async fn broadcast_to_machine(&self, machine_id: i64, payload: &str) {
        let mut dead: Vec<usize> = Vec::new();
        {
            let subs = self.browser_subs.read().await;
            if let Some(senders) = subs.get(&machine_id) {
                for (i, tx) in senders.iter().enumerate() {
                    if tx.send(payload.to_string()).is_err() {
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
}

// ───────────────────────────────────────────────
//  Bridge connection handler
// ───────────────────────────────────────────────

/// Handle a single bridge WebSocket connection.
pub async fn handle_bridge_connection(mut ws: WebSocket, state: Arc<WsHubState>) {
    let mut current_machine_id: Option<i64> = None;

    loop {
        let msg = match ws.recv().await {
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

        let response = handle_bridge_frame(&state, &frame, &mut current_machine_id).await;

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

    if let Some(machine_id) = current_machine_id {
        if let Err(e) = state.machine_repo.set_offline(machine_id).await {
            error!("Failed to set machine {} offline on disconnect: {}", machine_id, e);
        }
    }

    info!("Bridge connection closed");
}

async fn handle_bridge_frame(
    state: &WsHubState,
    frame: &BridgeFrame,
    current_machine_id: &mut Option<i64>,
) -> Result<Option<ServerFrame>, RepoError> {
    match frame {
        BridgeFrame::Register {
            serial_number,
            mac_addr,
        } => {
            let machine = state
                .machine_repo
                .upsert_by_serial(serial_number, mac_addr.as_deref(), None, None)
                .await?;
            *current_machine_id = Some(machine.id);
            info!("Bridge registered machine {} (serial={})", machine.id, serial_number);
            Ok(Some(ServerFrame::Ack))
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
            if current_machine_id.is_none() {
                *current_machine_id = Some(*machine_id);
            }

            let domain_readings: Vec<Reading> = readings
                .iter()
                .map(|r| Reading {
                    id: 0,
                    machine_id: *machine_id,
                    therapy_id: r.therapy_id,
                    signal_id: Some(r.signal_id),
                    recorded_at: chrono::DateTime::parse_from_rfc3339(&r.timestamp)
                        .ok()
                        .map(|dt| dt.with_timezone(&Utc)),
                    raw_value: Some(r.raw_value),
                    value: r.value,
                    unit: Some(r.unit.clone()),
                    display_label: r.display_value.clone(),
                    phase: r.phase.clone(),
                    created_at: Utc::now(),
                })
                .collect();

            if let Err(e) = state.readings_repo.insert_batch(&domain_readings).await {
                error!("Failed to insert readings for machine {}: {}", machine_id, e);
            }

            let event = BrowserEvent::ReadingsBroadcast {
                machine_id: *machine_id,
                cycle: *cycle,
                readings: readings.clone(),
            };
            if let Ok(json) = serde_json::to_string(&event) {
                state.broadcast_to_machine(*machine_id, &json).await;
            }

            Ok(None)
        }

        BridgeFrame::Heartbeat { machine_id } => {
            if current_machine_id.is_none() {
                *current_machine_id = Some(*machine_id);
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
        } => {
            handle_therapy_setup(
                state,
                *machine_id,
                patient_id_str,
                therapy_type.as_deref(),
                kit.as_deref(),
                *weight,
            )
            .await?;

            info!(
                "TherapySetup handled for machine {}, patient {}",
                machine_id, patient_id_str
            );
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
) -> Result<(), RepoError> {
    let patient = match state.patient_repo.find_by_external_id(patient_id_str).await? {
        Some(p) => p,
        None => state.patient_repo.create(patient_id_str).await?,
    };

    match state.therapy_repo.find_active_by_machine(machine_id).await? {
        Some(therapy) => {
            state
                .therapy_repo
                .update_metadata(therapy.id, therapy_type, kit, weight)
                .await?;
        }
        None => {
            state
                .therapy_repo
                .create(patient.id, machine_id, therapy_type, kit, weight)
                .await?;
        }
    }

    Ok(())
}

/// Compute deterministic fingerprint (mirrors bridge).
fn compute_fingerprint(version: &BridgeVersionInfo) -> String {
    let s = format!(
        "{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:",
        version.language_id,
        version.system_sw,
        version.dss_fw,
        version.dss_hw,
        version.css_fw,
        version.css_hw,
        version.pss_fw,
        version.pss_hw,
        version.language1,
        "",
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
    let (browser_tx, mut browser_rx) = mpsc::unbounded_channel::<String>();

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
