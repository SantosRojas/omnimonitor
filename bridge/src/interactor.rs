//! Bridge interactor — initialization protocol and cyclical data loop.
//!
//! Orchestrates the serial ↔ WebSocket pipeline:
//!
//! 1. **Init protocol**: registers with the server, queries version fingerprint,
//!    and either loads cached configuration or performs a full serial init
//!    (get_versions → get_data_handles → get_all_data_attributes → get_dictionary).
//!
//! 2. **Cyclical loop**: reads cyclical values from the OMNI device, detects
//!    metadata signal changes (therapy_type, kit, weight, patient_id), sends
//!    `TherapySetup` frames on metadata change, and sends `Readings` frames
//!    with non-metadata signals.
//!
//! 3. **Failure tracking**: records successes and failures via `SerialReaderManager`.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

use serde_json::Value;
use tokio::sync::{mpsc, watch};
use tokio::time::{sleep, Duration};

use crate::protocol::frames::{BridgeFrame, SerialStatusPayload, ServerFrame, WsState};
use crate::protocol::{
    CMD_CODE_GET_CYCLICAL_VALUES, CMD_CODE_GET_DATA_ATTRS, CMD_CODE_GET_HANDLES,
    CMD_CODE_GET_NEXT_DICT_STR, CMD_CODE_GET_VERSIONS, CMD_CODE_NAK, DataAttribute, DataType,
    DeviceCommunicator, DeviceError, DictionaryEntry, TelemetryReading, TelemetryValue,
    VersionInfo, VERSION_STRING_LENGTH,
};
use crate::serial::manager::SerialReaderManager;

/// Default capture names when env var is empty: all signals from pdms-omni
/// that represent telemetry (not metadata).
const DEFAULT_CAPTURE_NAMES: &str = "c_press_ep_act,c_pump_bs_bl_flow_act,c_pump_fs_mid_flow_act,d_renal_dose_act,c_acc_therapy_time_act,c_net_rem_flow_act,c_acc_net_rem_vol_act,c_press_ap_act,c_press_vp_act,c_press_fp_act,c_press_tmp_act";

/// Default metadata names when env var is empty: signals used for therapy
/// and patient identification (never sent as readings).
const DEFAULT_METADATA_NAMES: &str = "d_serial_number_to_odi,g_patient_id_str,g_therapy_mode_set,g_anticoag_mode_set,d_kit_type_str,g_patient_data_weight_set";

/// Cycle interval when no readings are available (device not responding).
const IDLE_CYCLE_MS: u64 = 1000;

/// Umbral de fallos cíclicos antes de intentar auto-reconexión.
const MAX_CYCLICAL_FAILURES_BEFORE_RECONNECT: u64 = 50;

/// State held across the cyclical loop.
struct CyclicalState {
    handles: Vec<u16>,
    attr_cache: HashMap<u16, DataAttribute>,
    dict_cache: HashMap<u16, String>,
    /// Last known metadata values for change detection.
    metadata_cache: HashMap<String, Option<Value>>,
    patient_id_str: String,
    /// Serial number extracted from the `d_serial_number_to_odi` signal.
    serial_number_str: Option<String>,
    cycle: u64,
}

impl CyclicalState {
    fn new() -> Self {
        Self {
            handles: Vec::new(),
            attr_cache: HashMap::new(),
            dict_cache: HashMap::new(),
            metadata_cache: HashMap::new(),
            patient_id_str: String::new(),
            serial_number_str: None,
            cycle: 0,
        }
    }

    /// Load configuration from a `VersionConfig` received from the server.
    fn load_from_version_config(
        &mut self,
        attrs: Vec<DataAttribute>,
        dictionary: Vec<DictionaryEntry>,
    ) {
        self.attr_cache.clear();
        self.handles.clear();
        self.dict_cache.clear();

        for attr in &attrs {
            self.handles.push(attr.handle);
            self.attr_cache.insert(attr.handle, attr.clone());
        }
        for entry in &dictionary {
            self.dict_cache.insert(entry.dict_id, entry.text.clone());
        }
    }
}

// ──────────────────────────────────────────────────────────────
//  Init protocol helpers
// ──────────────────────────────────────────────────────────────

/// Sends a `Register` frame with the bridge's IP address and waits
/// for a `Registered { bridge_id }` response.
async fn send_register(
    bridge_ip: &str,
    tx_readings: &mpsc::Sender<BridgeFrame>,
    rx_commands: &mut mpsc::Receiver<ServerFrame>,
) -> Result<i64, String> {
    let frame = BridgeFrame::Register {
        ip_address: bridge_ip.to_owned(),
    };
    tx_readings.send(frame).await.map_err(|e| format!("Failed to send register: {e}"))?;

    let timeout = Duration::from_secs(10);
    loop {
        match tokio::time::timeout(timeout, rx_commands.recv()).await {
            Ok(Some(ServerFrame::Registered { bridge_id })) => {
                tracing::info!("[bridge] registered with bridge_id={}", bridge_id);
                return Ok(bridge_id);
            }
            Ok(Some(ServerFrame::Error { message })) => {
                return Err(format!("Server error during register: {message}"));
            }
            Ok(Some(_)) => {
                // Unexpected frame — keep waiting for Registered
                continue;
            }
            Ok(None) => return Err("Server command channel closed".into()),
            Err(_) => return Err("Timeout waiting for register response".into()),
        }
    }
}

/// Sends an `InitQuery` frame and returns the server's response.
async fn send_init_query(
    fingerprint: &str,
    tx_readings: &mpsc::Sender<BridgeFrame>,
    rx_commands: &mut mpsc::Receiver<ServerFrame>,
) -> Result<InitQueryResult, String> {
    let frame = BridgeFrame::InitQuery {
        fingerprint: fingerprint.to_owned(),
    };
    tx_readings.send(frame).await.map_err(|e| format!("Failed to send init_query: {e}"))?;

    let timeout = Duration::from_secs(30);
    loop {
        match tokio::time::timeout(timeout, rx_commands.recv()).await {
            Ok(Some(ServerFrame::VersionConfig { attributes, dictionary })) => {
                return Ok(InitQueryResult::Known { attributes, dictionary });
            }
            Ok(Some(ServerFrame::UnknownVersion)) => {
                return Ok(InitQueryResult::Unknown);
            }
            Ok(Some(ServerFrame::Error { message })) => {
                return Err(format!("Server error during init_query: {message}"));
            }
            Ok(Some(_)) => continue, // ignore Ack or other frames
            Ok(None) => return Err("Server command channel closed".into()),
            Err(_) => return Err("Timeout waiting for init_query response".into()),
        }
    }
}

enum InitQueryResult {
    Known {
        attributes: Vec<DataAttribute>,
        dictionary: Vec<DictionaryEntry>,
    },
    Unknown,
}

/// Sends a `StoreInit` frame and waits for `Ack`.
async fn send_store_init(
    version: &VersionInfo,
    attributes: &[DataAttribute],
    dictionary: &[DictionaryEntry],
    tx_readings: &mpsc::Sender<BridgeFrame>,
    rx_commands: &mut mpsc::Receiver<ServerFrame>,
) -> Result<(), String> {
    let frame = BridgeFrame::StoreInit {
        version: version.clone(),
        attributes: attributes.to_vec(),
        dictionary: dictionary.to_vec(),
    };
    tx_readings.send(frame).await.map_err(|e| format!("Failed to send store_init: {e}"))?;

    let timeout = Duration::from_secs(60);
    loop {
        match tokio::time::timeout(timeout, rx_commands.recv()).await {
            Ok(Some(ServerFrame::Ack)) => return Ok(()),
            Ok(Some(ServerFrame::Error { message })) => {
                return Err(format!("Server error during store_init: {message}"));
            }
            Ok(Some(_)) => continue,
            Ok(None) => return Err("Server command channel closed".into()),
            Err(_) => return Err("Timeout waiting for store_init Ack".into()),
        }
    }
}

// ──────────────────────────────────────────────────────────────
//  Serial protocol helpers (init Phases 2a–2c)
// ──────────────────────────────────────────────────────────────

/// Sends a `MachineIdentify` frame and waits for `MachineIdentified` response.
async fn send_machine_identify(
    bridge_id: i64,
    serial_number: &str,
    ip_address: &str,
    tx_readings: &mpsc::Sender<BridgeFrame>,
    rx_commands: &mut mpsc::Receiver<ServerFrame>,
) -> Result<i64, String> {
    let frame = BridgeFrame::MachineIdentify {
        bridge_id,
        serial_number: serial_number.to_owned(),
        ip_address: ip_address.to_owned(),
    };
    tx_readings.send(frame).await.map_err(|e| format!("Failed to send machine_identify: {e}"))?;

    let timeout = Duration::from_secs(10);
    loop {
        match tokio::time::timeout(timeout, rx_commands.recv()).await {
            Ok(Some(ServerFrame::MachineIdentified { machine_id })) => {
                tracing::info!("[bridge] machine identified: id={}", machine_id);
                return Ok(machine_id);
            }
            Ok(Some(ServerFrame::Error { message })) => {
                return Err(format!("Server error during machine_identify: {message}"));
            }
            Ok(Some(_)) => continue,
            Ok(None) => return Err("Server command channel closed".into()),
            Err(_) => return Err("Timeout waiting for MachineIdentified".into()),
        }
    }
}

/// PHASE 2a: get_data_handles — sends CMD_CODE_GET_HANDLES.
fn get_data_handles(device: &mut impl DeviceCommunicator) -> Result<Vec<u16>, String> {
    let data = device
        .request(CMD_CODE_GET_HANDLES, &[])
        .map_err(|e| format!("get_data_handles failed: {e}"))?;

    if data.len() < 4 {
        return Err("Handles response too short".into());
    }

    let resp_cmd = u16::from_le_bytes(data[0..2].try_into().unwrap());
    if resp_cmd == CMD_CODE_NAK {
        return Err(format!("NAK in get_data_handles"));
    }

    let num_handles = u16::from_le_bytes(data[2..4].try_into().unwrap()) as usize;
    let expected_len = 4 + num_handles * 2;
    if data.len() < expected_len {
        return Err(format!(
            "Expected {expected_len} bytes for {num_handles} handles, got {}",
            data.len()
        ));
    }

    let mut handles = Vec::with_capacity(num_handles);
    for i in 0..num_handles {
        let offset = 4 + i * 2;
        let handle = u16::from_le_bytes(data[offset..offset + 2].try_into().unwrap());
        handles.push(handle);
    }

    Ok(handles)
}

/// PHASE 2b: get_all_data_attributes — gets attributes for each handle.
fn get_all_data_attributes(
    device: &mut impl DeviceCommunicator,
    handles: &[u16],
    attr_cache: &mut HashMap<u16, DataAttribute>,
) -> Result<Vec<DataAttribute>, String> {
    let mut attrs = Vec::with_capacity(handles.len());
    attr_cache.clear();

    for &handle in handles {
        let handle_bytes = handle.to_le_bytes();
        let data = device
            .request(CMD_CODE_GET_DATA_ATTRS, &handle_bytes)
            .map_err(|e| format!("get_data_attrs for handle 0x{handle:04X} failed: {e}"))?;

        if data.len() < 12 {
            return Err(format!(
                "Data attrs response too short for handle 0x{handle:04X}"
            ));
        }

        let resp_cmd = u16::from_le_bytes(data[0..2].try_into().unwrap());
        if resp_cmd == CMD_CODE_NAK {
            return Err(format!("NAK in get_data_attrs for handle 0x{handle:04X}"));
        }

        let data_type = DataType::from(u16::from_le_bytes(data[2..4].try_into().unwrap()));
        let size = u16::from_le_bytes(data[4..6].try_into().unwrap());
        let factor = u16::from_le_bytes(data[6..8].try_into().unwrap());
        let label_did = u16::from_le_bytes(data[8..10].try_into().unwrap());
        let unit_did = u16::from_le_bytes(data[10..12].try_into().unwrap());

        let name_bytes = &data[12..];
        let internal_name = if let Some(null_pos) = name_bytes.iter().position(|&b| b == 0) {
            String::from_utf8_lossy(&name_bytes[..null_pos]).to_string()
        } else {
            String::from_utf8_lossy(name_bytes).trim().to_string()
        };

        let attr = DataAttribute {
            handle,
            data_type,
            size,
            conversion_factor: factor,
            label_did,
            unit_did,
            signal_id: 0, // Will be assigned by server
            internal_name,
        };

        attr_cache.insert(handle, attr.clone());
        attrs.push(attr);
    }

    Ok(attrs)
}

/// PHASE 2c: get_dictionary — iteratively fetches entire dictionary.
fn get_dictionary(
    device: &mut impl DeviceCommunicator,
    dict_cache: &mut HashMap<u16, String>,
) -> Result<Vec<DictionaryEntry>, String> {
    const MAX_DICT_ENTRIES: usize = 20_000;
    let mut entries = Vec::new();
    dict_cache.clear();
    let mut prev_id: u16 = 0;
    let mut seen_ids = std::collections::HashSet::new();

    loop {
        let id_bytes = prev_id.to_le_bytes();
        let data = device
            .request(CMD_CODE_GET_NEXT_DICT_STR, &id_bytes)
            .map_err(|e| format!("get_dictionary failed at prev_id={prev_id}: {e}"))?;

        if data.len() < 4 {
            return Err("Dictionary response too short".into());
        }

        let resp_cmd = u16::from_le_bytes(data[0..2].try_into().unwrap());
        if resp_cmd == CMD_CODE_NAK {
            return Err(format!("NAK in get_dictionary at prev_id={prev_id}"));
        }

        let dict_id = u16::from_le_bytes(data[2..4].try_into().unwrap());

        // dict_id == 0 means end of dictionary
        if dict_id == 0 {
            break;
        }

        if !seen_ids.insert(dict_id) {
            return Err(format!(
                "Dictionary loop detected: repeated dict_id={dict_id} after {} entries",
                entries.len()
            ));
        }

        let str_bytes = &data[4..];
        let text = if let Some(null_pos) = str_bytes.iter().position(|&b| b == 0) {
            String::from_utf8_lossy(&str_bytes[..null_pos]).to_string()
        } else {
            String::from_utf8_lossy(str_bytes).to_string()
        };

        let entry = DictionaryEntry {
            dict_id,
            text: text.clone(),
        };
        dict_cache.insert(dict_id, text);
        entries.push(entry);

        if entries.len() >= MAX_DICT_ENTRIES {
            return Err(format!(
                "Dictionary exceeded safety limit ({MAX_DICT_ENTRIES} entries)"
            ));
        }

        prev_id = dict_id;
    }

    Ok(entries)
}

/// Read raw integer value from bytes based on size and data type.
fn read_raw_value(bytes: &[u8], size: usize, data_type: DataType) -> i64 {
    let is_signed = matches!(
        data_type,
        DataType::InputNumberSigned | DataType::OutputNumberSigned
    );

    match size {
        1 => {
            if is_signed {
                bytes[0] as i8 as i64
            } else {
                bytes[0] as i64
            }
        }
        2 => {
            let val = u16::from_le_bytes(bytes[..2].try_into().unwrap());
            if is_signed {
                val as i16 as i64
            } else {
                val as i64
            }
        }
        4 => {
            let val = u32::from_le_bytes(bytes[..4].try_into().unwrap());
            if is_signed {
                val as i32 as i64
            } else {
                val as i64
            }
        }
        _ => {
            if size >= 2 {
                u16::from_le_bytes(bytes[..2].try_into().unwrap()) as i64
            } else if !bytes.is_empty() {
                bytes[0] as i64
            } else {
                0
            }
        }
    }
}

// ──────────────────────────────────────────────────────────────
//  Cyclical loop
// ──────────────────────────────────────────────────────────────

/// Extract the machine serial number from cyclical readings.
/// Looks for the `d_serial_number_to_odi` signal discovered during init.
fn extract_serial_from_readings(readings: &[TelemetryReading]) -> Option<String> {
    for r in readings {
        if r.internal_name == "d_serial_number_to_odi" {
            let serial = match &r.physical_value {
                TelemetryValue::String(s) => s.trim().to_string(),
                TelemetryValue::Number(n) => n.to_string(),
            };
            if !serial.is_empty() {
                return Some(serial);
            }
        }
    }
    None
}

/// Read cyclical values from the device and produce telemetry readings,
/// while extracting metadata signals for the `TherapySetup` frame.
///
/// * `capture_names` — internal_names to include as readings (persisted).
/// * `metadata_names` — internal_names to extract for TherapySetup (never persist).
///   Signals in NEITHER set are skipped entirely.
fn read_cyclical_values(
    device: &mut impl DeviceCommunicator,
    state: &mut CyclicalState,
    capture_names: &HashSet<String>,
    metadata_names: &HashSet<String>,
) -> Result<Vec<TelemetryReading>, DeviceError> {
    let data = device.request(CMD_CODE_GET_CYCLICAL_VALUES, &[])?;

    if data.len() < 2 {
        return Err(DeviceError::ParseError("Cyclical response too short".into()));
    }

    let resp_cmd = u16::from_le_bytes(data[0..2].try_into().unwrap());
    if resp_cmd == CMD_CODE_NAK {
        let err_code = if data.len() >= 4 {
            u16::from_le_bytes(data[2..4].try_into().unwrap())
        } else {
            0
        };
        return Err(DeviceError::Nak(err_code));
    }

    let values_data = &data[2..];
    let mut offset = 0;
    let mut readings = Vec::new();

    for &handle in &state.handles {
        let attr = match state.attr_cache.get(&handle) {
            Some(a) => a,
            None => {
                tracing::warn!("No attribute for handle 0x{handle:04X}, skipping");
                continue;
            }
        };

        let size = attr.size as usize;
        if offset + size > values_data.len() {
            tracing::warn!(
                "Insufficient data at offset {offset} for '{}' (need {size} bytes)",
                attr.internal_name
            );
            break;
        }

        let slice = &values_data[offset..offset + size];
        let raw_value = read_raw_value(slice, size, attr.data_type);

        let physical_value = match attr.data_type {
            DataType::DiaString | DataType::VersionString => {
                let text = if let Some(null_pos) = slice.iter().position(|&b| b == 0) {
                    String::from_utf8_lossy(&slice[..null_pos])
                } else {
                    String::from_utf8_lossy(slice)
                };
                TelemetryValue::String(text.trim().to_string())
            }
            _ => {
                if attr.conversion_factor > 0 {
                    TelemetryValue::Number(raw_value as f64 / attr.conversion_factor as f64)
                } else {
                    TelemetryValue::Number(raw_value as f64)
                }
            }
        };

        // Lookup unit string from in-memory dictionary cache
        let unit = state
            .dict_cache
            .get(&attr.unit_did)
            .cloned()
            .unwrap_or_default();

        offset += size;

        let name_lower = attr.internal_name.to_lowercase();

        // ── Metadata: extract for TherapySetup, skip from readings ──
        if metadata_names.contains(&name_lower) {
            let value = match &physical_value {
                TelemetryValue::Number(n) => Some(Value::Number(
                    serde_json::Number::from_f64(*n).unwrap_or(serde_json::Number::from(0)),
                )),
                TelemetryValue::String(s) => Some(Value::String(s.clone())),
            };
            state
                .metadata_cache
                .insert(attr.internal_name.clone(), value);

            // Special: patient_id_str for therapy setup convenience
            if attr.internal_name == "g_patient_id_str" {
                if let TelemetryValue::String(ref s) = physical_value {
                    let trimmed = s.trim().to_string();
                    if !trimmed.is_empty() {
                        state.patient_id_str = trimmed;
                    }
                }
            }

            // Special: serial number for machine discovery
            if attr.internal_name == "d_serial_number_to_odi" {
                if let TelemetryValue::String(ref s) = physical_value {
                    let trimmed = s.trim().to_string();
                    if !trimmed.is_empty() {
                        state.serial_number_str = Some(trimmed);
                    }
                }
            }

            // Never persist metadata as readings
            continue;
        }

        // ── Telemetry: include in readings only if in capture_names ──
        if !capture_names.is_empty() && !capture_names.contains(&name_lower) {
            continue;
        }

        readings.push(TelemetryReading {
            id: None,
            timestamp: chrono::Utc::now().timestamp_millis(),
            therapy_id: None,
            serial_session_id: None,
            signal_id: attr.signal_id,
            internal_name: attr.internal_name.clone(),
            raw_value,
            physical_value,
            unit,
            display_value: None,
            phase: None,
        });
    }

    Ok(readings)
}

/// Build a `TherapySetup` frame from the current metadata cache.
fn build_therapy_setup(state: &CyclicalState, machine_id: i64) -> BridgeFrame {
    let therapy_type = state
        .metadata_cache
        .get("g_therapy_mode_set")
        .and_then(|v| v.as_ref())
        .and_then(|v| v.as_str().map(|s| s.to_owned()));

    let kit = state
        .metadata_cache
        .get("d_kit_type_str")
        .and_then(|v| v.as_ref())
        .and_then(|v| v.as_str().map(|s| s.to_owned()));

    let weight = state
        .metadata_cache
        .get("g_patient_data_weight_set")
        .and_then(|v| v.as_ref())
        .and_then(|v| v.as_f64());

    BridgeFrame::TherapySetup {
        machine_id,
        patient_id_str: state.patient_id_str.clone(),
        therapy_type,
        kit,
        weight,
    }
}

/// Tracks whether metadata has changed since the last `TherapySetup` was sent.
struct MetadataTracker {
    last_sent: Option<HashMap<String, Option<Value>>>,
}

impl MetadataTracker {
    fn new() -> Self {
        Self { last_sent: None }
    }

    /// Returns `true` if the metadata has changed since the last sent snapshot.
    fn has_changed(&self, current: &HashMap<String, Option<Value>>) -> bool {
        match &self.last_sent {
            None => true,
            Some(prev) => prev != current,
        }
    }

    /// Update the snapshot to the current metadata state.
    fn snapshot(&mut self, current: &HashMap<String, Option<Value>>) {
        self.last_sent = Some(current.clone());
    }
}

// ──────────────────────────────────────────────────────────────
//  Main entry point
// ──────────────────────────────────────────────────────────────

/// Runs the full bridge interactor loop.
///
/// 1. **Init protocol**: register (by IP) → init_query → (load cache | full serial init)
/// 2. **Serial discovery**: first cyclical read → extract serial → MachineIdentify
/// 3. **Cyclical loop**: read cyclical values → detect metadata → send frames
///
/// # Arguments
///
/// * `device` - The serial device communicator (already opened).
/// * `manager` - The serial reader manager for failure tracking.
/// * `serial_number` - The machine's serial number.
/// * `tx_readings` - Channel to send outgoing `BridgeFrame`s to the WS client.
/// * `rx_commands` - Channel to receive incoming `ServerFrame`s from the WS client.
/// * `bridge_ip` - The bridge's own IP address for IP-based register auth.
pub async fn run_bridge(
    device: &mut impl DeviceCommunicator,
    manager: &SerialReaderManager,
    _serial_number: &str,
    tx_readings: mpsc::Sender<BridgeFrame>,
    mut rx_commands: mpsc::Receiver<ServerFrame>,
    bridge_ip: &str,
    ws_state_rx: watch::Receiver<WsState>,
) {
    tracing::info!("[bridge] starting interactor for bridge_ip={bridge_ip}");

    // ════════════════════════════════════════════════════════════
    //  PHASE 1: IDENTIFICATION — Get Version Numbers
    // ════════════════════════════════════════════════════════════
    tracing::info!("[bridge] [1] CMD_GET_VERSIONS");

    let version = match get_versions(device) {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("[bridge] get_versions failed: {e}");
            manager.record_failure().await;
            return;
        }
    };

    let fingerprint = version.fingerprint();
    tracing::info!("[bridge] fingerprint: {fingerprint}");

    // ════════════════════════════════════════════════════════════
    //  PHASE 2: WS INIT PROTOCOL
    // ════════════════════════════════════════════════════════════

    // Step 1: Register with server by IP → get bridge_id
    // ── Capture filters ──
    let capture_names: HashSet<String> = std::env::var("CAPTURE_NAMES")
        .ok()
        .filter(|v| !v.is_empty())
        .map(|v| v.split(',').map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()).collect())
        .unwrap_or_else(|| {
            DEFAULT_CAPTURE_NAMES
                .split(',')
                .map(|s| s.trim().to_lowercase())
                .collect()
        });

    let metadata_names: HashSet<String> = std::env::var("CAPTURE_METADATA_NAMES")
        .ok()
        .filter(|v| !v.is_empty())
        .map(|v| v.split(',').map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()).collect())
        .unwrap_or_else(|| {
            DEFAULT_METADATA_NAMES
                .split(',')
                .map(|s| s.trim().to_lowercase())
                .collect()
        });

    tracing::info!("[bridge] capture_names={} signals, metadata_names={} signals", capture_names.len(), metadata_names.len());

    tracing::info!("[bridge] sending register (IP={bridge_ip})...");
    let bridge_id = match send_register(bridge_ip, &tx_readings, &mut rx_commands).await {
        Ok(id) => {
            tracing::info!("[bridge] registered successfully, bridge_id={id}");
            id
        }
        Err(e) => {
            tracing::error!("[bridge] register failed: {e}");
            manager.record_failure().await;
            return;
        }
    };

    // Step 2: Query server for version cache
    tracing::info!("[bridge] sending init_query...");
    let mut state = CyclicalState::new();

    match send_init_query(&fingerprint, &tx_readings, &mut rx_commands).await {
        Ok(InitQueryResult::Known {
            attributes,
            dictionary,
        }) => {
            tracing::info!(
                "[bridge] server has cached config ({} attrs, {} dict entries)",
                attributes.len(),
                dictionary.len()
            );
            state.load_from_version_config(attributes, dictionary);
        }
        Ok(InitQueryResult::Unknown) => {
            tracing::info!("[bridge] server does not know this version — performing full serial init");
            if let Err(e) = full_serial_init(device, &mut state) {
                tracing::error!("[bridge] full serial init failed: {e}");
                manager.record_failure().await;
                return;
            }

            // Send store_init to server
            let attrs: Vec<DataAttribute> = state.attr_cache.values().cloned().collect();
            let dict: Vec<DictionaryEntry> = state
                .dict_cache
                .iter()
                .map(|(id, text)| DictionaryEntry {
                    dict_id: *id,
                    text: text.clone(),
                })
                .collect();

            tracing::info!(
                "[bridge] sending store_init ({} attrs, {} dict entries)...",
                attrs.len(),
                dict.len()
            );

            if let Err(e) = send_store_init(&version, &attrs, &dict, &tx_readings, &mut rx_commands).await {
                tracing::error!("[bridge] store_init failed: {e}");
                manager.record_failure().await;
                return;
            }
            tracing::info!("[bridge] store_init acknowledged");

            // ── Signal ID fix: re-query signal IDs after StoreInit ──
            // After store_init, the server has real catalog signal IDs.
            // Re-send InitQuery to fetch them back, then update attr_cache.
            tracing::info!("[bridge] re-querying signal IDs after StoreInit...");
            match send_init_query(&fingerprint, &tx_readings, &mut rx_commands).await {
                Ok(InitQueryResult::Known { attributes, dictionary }) => {
                    state.load_from_version_config(attributes, dictionary);
                    tracing::info!("[bridge] signal IDs updated from server after StoreInit");
                }
                Ok(InitQueryResult::Unknown) => {
                    tracing::error!("[bridge] server returned UnknownVersion after StoreInit — this should not happen");
                    manager.record_failure().await;
                    return;
                }
                Err(e) => {
                    tracing::error!("[bridge] re-query after StoreInit failed: {e}");
                    manager.record_failure().await;
                    return;
                }
            }
        }
        Err(e) => {
            tracing::error!("[bridge] init_query failed: {e}");
            manager.record_failure().await;
            return;
        }
    }

    // ════════════════════════════════════════════════════════════
    //  PHASE 3: CYCLICAL LOOP
    // ════════════════════════════════════════════════════════════

    // Use Arc<AtomicI64> so the heartbeat task and main loop share the
    // resolved machine_id (starts at 0 until serial discovery completes).
    let machine_id = Arc::new(AtomicI64::new(0));
    let mut serial_resolved = false;

    manager.set_running().await;
    tracing::info!("[bridge] entering cyclical loop (bridge_id={bridge_id})");

    // ── Heartbeat task (every 30s) ──
    // Uses the shared atomic machine_id — updates when serial is resolved.
    let hb_tx = tx_readings.clone();
    let hb_machine_id = machine_id.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        interval.tick().await; // Skip immediate first tick — give init time
        loop {
            interval.tick().await;
            let mid = hb_machine_id.load(Ordering::Relaxed);
            if hb_tx
                .send(BridgeFrame::Heartbeat { machine_id: mid })
                .await
                .is_err()
            {
                tracing::debug!("[bridge] heartbeat channel closed, stopping");
                break;
            }
            tracing::trace!("[bridge] heartbeat sent (machine_id={mid})");
        }
    });

    let mut meta_tracker = MetadataTracker::new();
    let mut last_status_send = tokio::time::Instant::now();
    const STATUS_INTERVAL_SECS: u64 = 5;

    loop {
        // Check for pending therapy close
        if let Some(therapy_id) = manager.take_pending_therapy_close().await {
            tracing::info!("[bridge] pending therapy close: {therapy_id}");
            // The server closes therapy on its side. We reset state.
            state.metadata_cache.clear();
            meta_tracker = MetadataTracker::new();
        }

        // ── Status broadcast (every 5s) ──
        if last_status_send.elapsed() >= Duration::from_secs(STATUS_INTERVAL_SECS) {
            let s = manager.get_status().await;
            let ws = ws_state_rx.borrow().clone();
            let ws_label = match ws {
                WsState::Connected => "connected",
                WsState::Disconnected => "disconnected",
                WsState::Reconnecting => "reconnecting",
            };
            let payload = SerialStatusPayload {
                state: s.status,
                failure_count: s.consecutive_failures,
                ws_state: ws_label.to_owned(),
            };
            if tx_readings.send(BridgeFrame::SerialStatus(payload)).await.is_err() {
                tracing::error!("[bridge] tx_readings closed, stopping");
                break;
            }
            last_status_send = tokio::time::Instant::now();
        }

        // ── Auto-reconnect check ──
        if state.cycle > 0 && state.cycle % 50 == 0 {
            let cf = manager.get_cyclical_failures().await;
            if cf >= MAX_CYCLICAL_FAILURES_BEFORE_RECONNECT {
                tracing::warn!(
                    "[bridge] cyclical failures ({}) >= threshold ({}), reopening serial port...",
                    cf, MAX_CYCLICAL_FAILURES_BEFORE_RECONNECT
                );
                match device.try_reconnect() {
                    Ok(()) => {
                        tracing::info!("[bridge] serial port reopened successfully");
                        manager.record_success().await;
                    }
                    Err(e) => {
                        tracing::error!("[bridge] failed to reopen serial port: {e}");
                        if manager.record_failure().await {
                            break;
                        }
                    }
                }
            }
        }

        // Read cyclical values
        match read_cyclical_values(device, &mut state, &capture_names, &metadata_names) {
            Ok(readings) => {
                manager.record_success().await;

                // ── Serial discovery (first successful cycle only) ──
                if !serial_resolved {
                    let serial = extract_serial_from_readings(&readings)
                        .or_else(|| state.serial_number_str.clone());
                    if let Some(serial) = serial {
                        tracing::info!(
                            "[bridge] discovered serial '{serial}' from cyclical data, sending MachineIdentify..."
                        );
                        match send_machine_identify(
                            bridge_id,
                            &serial,
                            bridge_ip,
                            &tx_readings,
                            &mut rx_commands,
                        )
                        .await
                        {
                            Ok(mid) => {
                                machine_id.store(mid, Ordering::Relaxed);
                                serial_resolved = true;
                                tracing::info!(
                                    "[bridge] machine identified: id={mid}, serial={serial}"
                                );
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "[bridge] machine identify failed (will retry): {e}"
                                );
                            }
                        }
                    }
                }

                let current_machine_id = machine_id.load(Ordering::Relaxed);

                // ── Metadata change detection ──
                if meta_tracker.has_changed(&state.metadata_cache) {
                    let therapy_setup = build_therapy_setup(&state, current_machine_id);
                    tracing::info!(
                        "[bridge] metadata changed, sending TherapySetup"
                    );
                    if tx_readings.send(therapy_setup).await.is_err() {
                        tracing::error!("[bridge] tx_readings closed, stopping");
                        break;
                    }
                    meta_tracker.snapshot(&state.metadata_cache);
                }

                // ── Send readings (non-metadata signals only) ──
                if !readings.is_empty() {
                    let readings_frame = BridgeFrame::Readings {
                        machine_id: current_machine_id,
                        cycle: state.cycle,
                        readings,
                    };
                    if tx_readings.send(readings_frame).await.is_err() {
                        tracing::error!("[bridge] tx_readings closed, stopping");
                        break;
                    }
                    state.cycle += 1;
                }
            }
            Err(DeviceError::Timeout) => {
                let cf = manager.get_cyclical_failures().await;
                tracing::warn!(
                    "[bridge] [cycle={}] cyclical read timeout (consecutive_cyclical_failures={})",
                    state.cycle, cf
                );
                manager.record_cyclical_failure().await;
                sleep(Duration::from_millis(IDLE_CYCLE_MS)).await;
            }
            Err(DeviceError::CrcError) => {
                tracing::warn!(
                    "[bridge] [cycle={}] CRC mismatch in response",
                    state.cycle
                );
                manager.record_warning().await;
            }
            Err(DeviceError::ParseError(ref msg)) => {
                tracing::warn!(
                    "[bridge] [cycle={}] parse error: {}",
                    state.cycle, msg
                );
                manager.record_warning().await;
            }
            Err(DeviceError::Nak(err_code)) => {
                tracing::warn!(
                    "[bridge] [cycle={}] NAK (code=0x{err_code:04X})",
                    state.cycle
                );
                manager.record_warning().await;
            }
            Err(DeviceError::IoError(ref msg)) => {
                tracing::error!(
                    "[bridge] [cycle={}] I/O error: {}",
                    state.cycle, msg
                );
                if manager.record_failure().await {
                    tracing::error!("[bridge] connection failure limit reached, stopping reader");
                    break;
                }
                sleep(Duration::from_millis(IDLE_CYCLE_MS)).await;
            }
        }
    }

    tracing::info!("[bridge] interactor loop ended (bridge_id={bridge_id})");
}

/// Phase 1 (serial): Get version info from device.
fn get_versions(device: &mut impl DeviceCommunicator) -> Result<VersionInfo, String> {
    let data = device
        .request(CMD_CODE_GET_VERSIONS, &[])
        .map_err(|e| format!("CMD_GET_VERSIONS failed: {e}"))?;

    if data.len() < 2 {
        return Err("Response too short for versions".into());
    }

    let resp_cmd = u16::from_le_bytes(data[0..2].try_into().unwrap());
    if resp_cmd == CMD_CODE_NAK {
        let err_code = if data.len() >= 4 {
            u16::from_le_bytes(data[2..4].try_into().unwrap())
        } else {
            0
        };
        return Err(format!("NAK in get_versions (code=0x{err_code:04X})"));
    }

    let expected_len = 2 + 2 + (7 * VERSION_STRING_LENGTH) + (3 * VERSION_STRING_LENGTH);
    if data.len() < expected_len {
        return Err(format!(
            "Versions response too short: {} bytes, expected >= {expected_len}",
            data.len()
        ));
    }

    let language_id = u16::from_le_bytes(data[2..4].try_into().unwrap());

    let read_version = |offset: usize| -> String {
        let slice = &data[offset..offset + VERSION_STRING_LENGTH];
        let text = if let Some(null_pos) = slice.iter().position(|&b| b == 0) {
            String::from_utf8_lossy(&slice[..null_pos])
        } else {
            String::from_utf8_lossy(slice)
        };
        text.trim().to_string()
    };

    let base = 4;
    Ok(VersionInfo {
        language_id,
        system_sw: read_version(base),
        dss_fw: read_version(base + 16),
        dss_hw: read_version(base + 32),
        css_fw: read_version(base + 48),
        css_hw: read_version(base + 64),
        pss_fw: read_version(base + 80),
        pss_hw: read_version(base + 96),
        language1: read_version(base + 112),
        language2: read_version(base + 128),
        language3: read_version(base + 144),
    })
}

/// Full serial initialization (Phases 2a–2c) for unknown versions.
fn full_serial_init(
    device: &mut impl DeviceCommunicator,
    state: &mut CyclicalState,
) -> Result<(), String> {
    // Phase 2a: Get data handles
    tracing::info!("[bridge] [2] CMD_GET_HANDLES");
    let handles = get_data_handles(device)?;
    state.handles = handles.clone();
    tracing::info!("[bridge] got {} handle(s)", handles.len());

    // Phase 2b: Get data attributes for each handle
    tracing::info!("[bridge] [3] CMD_GET_DATA_ATTRS for {} handle(s)...", handles.len());
    let attrs = get_all_data_attributes(device, &handles, &mut state.attr_cache)?;
    tracing::info!("[bridge] got {} attribute(s)", attrs.len());

    // Phase 2c: Get dictionary
    tracing::info!("[bridge] [4] CMD_GET_NEXT_DICT_STR (building dictionary)...");
    let dict = get_dictionary(device, &mut state.dict_cache)?;
    tracing::info!("[bridge] dictionary complete: {} entries", dict.len());

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;


    /// MetadataTracker starts as changed (first cycle always sends TherapySetup).
    #[test]
    fn metadata_tracker_starts_changed() {
        let tracker = MetadataTracker::new();
        let current = HashMap::new();
        assert!(tracker.has_changed(&current));
    }

    /// MetadataTracker detects no change when same values are provided.
    #[test]
    fn metadata_tracker_no_change() {
        let mut tracker = MetadataTracker::new();
        let mut current = HashMap::new();
        current.insert("test".to_string(), Some(Value::String("val".to_owned())));
        assert!(tracker.has_changed(&current));
        tracker.snapshot(&current);
        assert!(!tracker.has_changed(&current));
    }

    /// MetadataTracker detects change when value differs.
    #[test]
    fn metadata_tracker_detects_change() {
        let mut tracker = MetadataTracker::new();
        let mut current = HashMap::new();
        current.insert("test".to_string(), Some(Value::String("val".to_owned())));
        tracker.snapshot(&current);

        let mut changed = HashMap::new();
        changed.insert("test".to_string(), Some(Value::String("new_val".to_owned())));
        assert!(tracker.has_changed(&changed));
    }

    /// Build TherapySetup with all fields populated.
    #[test]
    fn build_therapy_setup_all_fields() {
        let mut state = CyclicalState::new();
        state.patient_id_str = "PAT-001".to_owned();
        state.metadata_cache.insert(
            "g_therapy_mode_set".to_owned(),
            Some(Value::String("HD".to_owned())),
        );
        state.metadata_cache.insert(
            "d_kit_type_str".to_owned(),
            Some(Value::String("FX100".to_owned())),
        );
        state.metadata_cache.insert(
            "g_patient_data_weight_set".to_owned(),
            Some(Value::Number(serde_json::Number::from_f64(70.5).unwrap())),
        );

        let frame = build_therapy_setup(&state, 1);
        match frame {
            BridgeFrame::TherapySetup {
                machine_id,
                patient_id_str,
                therapy_type,
                kit,
                weight,
            } => {
                assert_eq!(machine_id, 1);
                assert_eq!(patient_id_str, "PAT-001");
                assert_eq!(therapy_type, Some("HD".to_owned()));
                assert_eq!(kit, Some("FX100".to_owned()));
                assert!((weight.unwrap() - 70.5).abs() < f64::EPSILON);
            }
            _ => panic!("Expected TherapySetup frame"),
        }
    }

    /// Build TherapySetup with minimal fields (no metadata discovered yet).
    #[test]
    fn build_therapy_setup_minimal() {
        let state = CyclicalState::new();
        let frame = build_therapy_setup(&state, 42);
        match frame {
            BridgeFrame::TherapySetup {
                machine_id,
                patient_id_str,
                therapy_type,
                kit,
                weight,
            } => {
                assert_eq!(machine_id, 42);
                assert_eq!(patient_id_str, "");
                assert_eq!(therapy_type, None);
                assert_eq!(kit, None);
                assert_eq!(weight, None);
            }
            _ => panic!("Expected TherapySetup frame"),
        }
    }

    /// CyclicalState::load_from_version_config populates caches correctly.
    #[test]
    fn load_from_version_config_populates_cache() {
        let mut state = CyclicalState::new();
        let attr = DataAttribute {
            handle: 1,
            data_type: DataType::InputNumberUnsigned,
            size: 2,
            conversion_factor: 10,
            label_did: 100,
            unit_did: 200,
            signal_id: 5,
            internal_name: "pressure".into(),
        };
        let dict = DictionaryEntry {
            dict_id: 200,
            text: "mmHg".into(),
        };

        state.load_from_version_config(vec![attr], vec![dict]);

        assert_eq!(state.handles, vec![1]);
        assert!(state.attr_cache.contains_key(&1));
        assert_eq!(state.dict_cache.get(&200), Some(&"mmHg".to_owned()));
    }

    /// Read raw value helper works for various types/sizes.
    #[test]
    fn read_raw_value_various_types() {
        // Unsigned 1 byte
        let bytes = [0xFFu8];
        assert_eq!(read_raw_value(&bytes, 1, DataType::InputNumberUnsigned), 255);

        // Signed 1 byte
        assert_eq!(read_raw_value(&bytes, 1, DataType::InputNumberSigned), -1);

        // Unsigned 2 bytes LE
        let bytes = [0x00, 0x80];
        assert_eq!(read_raw_value(&bytes, 2, DataType::InputNumberUnsigned), 32768);

        // Signed 2 bytes
        assert_eq!(read_raw_value(&bytes, 2, DataType::InputNumberSigned), -32768);

        // Unsigned 4 bytes LE
        let bytes = [0xFF, 0xFF, 0xFF, 0x7F];
        assert_eq!(
            read_raw_value(&bytes, 4, DataType::InputNumberUnsigned),
            2147483647
        );

        // Signed 4 bytes
        let bytes = [0x00, 0x00, 0x00, 0x80];
        assert_eq!(read_raw_value(&bytes, 4, DataType::InputNumberSigned), -2147483648);
    }

}
