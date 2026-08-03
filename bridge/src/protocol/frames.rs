//! WebSocket frame definitions for the Bridge ↔ Server protocol.
//!
//! All frames are JSON-serialized for debuggability and interoperability.

use serde::{Deserialize, Serialize};

use super::{DataAttribute, DictionaryEntry, TelemetryReading, VersionInfo};

/// WebSocket connection state for the bridge.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum WsState {
    Connected,
    Disconnected,
    Reconnecting,
}

/// Payload for the `SerialStatus` frame variant.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SerialStatusPayload {
    pub state: String,
    pub failure_count: u32,
    pub ws_state: String,
}

/// Frame sent from the Bridge to the Server.
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
        readings: Vec<TelemetryReading>,
    },
    Heartbeat {
        machine_id: i64,
    },
    SerialStatus(SerialStatusPayload),
    StoreInit {
        version: VersionInfo,
        attributes: Vec<DataAttribute>,
        dictionary: Vec<DictionaryEntry>,
    },
    /// Sent when metadata signals change during cyclical reading.
    /// Server updates therapies.therapy_type, kit, weight directly
    /// — NO readings inserted for these metadata signals.
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
    /// Sent when `c_trmt_main_state == 3` (End of therapy) is detected.
    /// Server closes the active therapy for this machine.
    TherapyEnd {
        machine_id: i64,
    },
}

/// Frame sent from the Server to the Bridge.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerFrame {
    VersionConfig {
        attributes: Vec<DataAttribute>,
        dictionary: Vec<DictionaryEntry>,
    },
    UnknownVersion,
    Ack,
    Registered {
        bridge_id: i64,
    },
    MachineIdentified {
        machine_id: i64,
    },
    /// Server notifies the bridge that its active therapy was closed from the
    /// UI. The bridge resets its metadata cache and re-sends `TherapySetup`.
    TherapyClosed {
        therapy_id: i64,
    },
    Error {
        message: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    fn round_trip<T: Serialize + for<'a> Deserialize<'a> + std::fmt::Debug + PartialEq>(
        value: &T,
        label: &str,
    ) {
        let json = serde_json::to_string(value).unwrap_or_else(|e| panic!("{} serialize: {e}", label));
        let deserialized: T =
            serde_json::from_str(&json).unwrap_or_else(|e| panic!("{} deserialize: {e}\nJSON: {json}", label));
        assert_eq!(*value, deserialized, "{} round-trip mismatch", label);
    }

    #[test]
    fn bridge_frame_register() {
        let frame = BridgeFrame::Register {
            ip_address: "10.0.0.50".into(),
        };
        round_trip(&frame, "BridgeFrame::Register");
        let json = serde_json::to_string(&frame).unwrap();
        assert!(json.contains("\"ip_address\":\"10.0.0.50\""), "Register should have ip_address: {json}");
    }

    #[test]
    fn bridge_frame_machine_identify() {
        let frame = BridgeFrame::MachineIdentify {
            bridge_id: 1,
            serial_number: "OMNI-2026-001".into(),
            ip_address: "192.168.1.50".into(),
        };
        round_trip(&frame, "BridgeFrame::MachineIdentify");
        let json = serde_json::to_value(&frame).unwrap();
        assert_eq!(json["type"], "MachineIdentify");
        assert_eq!(json["bridge_id"], 1);
        assert_eq!(json["serial_number"], "OMNI-2026-001");
        assert_eq!(json["ip_address"], "192.168.1.50");
    }

    #[test]
    fn server_frame_registered() {
        let frame = ServerFrame::Registered { bridge_id: 42 };
        round_trip(&frame, "ServerFrame::Registered");
        let json = serde_json::to_value(&frame).unwrap();
        assert_eq!(json["type"], "Registered");
        assert_eq!(json["bridge_id"], 42);
    }

    #[test]
    fn server_frame_machine_identified() {
        let frame = ServerFrame::MachineIdentified { machine_id: 99 };
        round_trip(&frame, "ServerFrame::MachineIdentified");
        let json = serde_json::to_value(&frame).unwrap();
        assert_eq!(json["type"], "MachineIdentified");
        assert_eq!(json["machine_id"], 99);
    }

    #[test]
    fn server_frame_therapy_closed() {
        let frame = ServerFrame::TherapyClosed { therapy_id: 123 };
        round_trip(&frame, "ServerFrame::TherapyClosed");
        let json = serde_json::to_value(&frame).unwrap();
        assert_eq!(json["type"], "TherapyClosed");
        assert_eq!(json["therapy_id"], 123);
    }

    #[test]
    fn bridge_frame_init_query() {
        let frame = BridgeFrame::InitQuery {
            fingerprint: "abc123def456".into(),
        };
        round_trip(&frame, "BridgeFrame::InitQuery");
    }

    #[test]
    fn bridge_frame_readings() {
        let reading = TelemetryReading {
            id: Some(1),
            timestamp: 1721476800000, // 2026-07-20T10:00:00Z en epoch millis
            therapy_id: Some(42),
            serial_session_id: Some(100),
            signal_id: 5,
            internal_name: "pressure".into(),
            raw_value: 12345,
            physical_value: crate::protocol::TelemetryValue::Number(12.345),
            value: Some(12.345),
            unit: "mmHg".into(),
            display_value: Some("12.3".into()),
            phase: Some("dialyzing".into()),
        };
        let frame = BridgeFrame::Readings {
            machine_id: 1,
            cycle: 42,
            readings: vec![reading],
        };
        round_trip(&frame, "BridgeFrame::Readings");

        // The server contract: `value` MUST be present in the serialized JSON
        // (server's BridgeTelemetryReading reads `value`, not `physical_value`).
        let json = serde_json::to_value(&frame).unwrap();
        let reading_json = &json["readings"][0];
        assert_eq!(reading_json["value"], 12.345);
        assert_eq!(reading_json["physical_value"], 12.345);
    }

    #[test]
    fn bridge_frame_heartbeat() {
        let frame = BridgeFrame::Heartbeat { machine_id: 1 };
        round_trip(&frame, "BridgeFrame::Heartbeat");
    }

    #[test]
    fn bridge_frame_store_init() {
        let version = VersionInfo {
            language_id: 1,
            system_sw: "1.0.0".into(),
            dss_fw: "2.0.0".into(),
            dss_hw: "3.0.0".into(),
            css_fw: "1.5.0".into(),
            css_hw: "2.1.0".into(),
            pss_fw: "1.0.0".into(),
            pss_hw: "1.0.0".into(),
            language1: "English".into(),
            language2: "Spanish".into(),
            language3: "".into(),
        };
        let attr = DataAttribute {
            handle: 1,
            data_type: crate::protocol::DataType::InputNumberUnsigned,
            size: 2,
            conversion_factor: 10,
            label_did: 100,
            unit_did: 200,
            signal_id: 5,
            internal_name: "pressure".into(),
        };
        let dict = DictionaryEntry {
            dict_id: 100,
            text: "Pressure".into(),
        };
        let frame = BridgeFrame::StoreInit {
            version,
            attributes: vec![attr],
            dictionary: vec![dict],
        };
        round_trip(&frame, "BridgeFrame::StoreInit");
    }

    #[test]
    fn server_frame_version_config() {
        let attr = DataAttribute {
            handle: 1,
            data_type: crate::protocol::DataType::InputNumberUnsigned,
            size: 2,
            conversion_factor: 10,
            label_did: 100,
            unit_did: 200,
            signal_id: 5,
            internal_name: "pressure".into(),
        };
        let dict = DictionaryEntry {
            dict_id: 100,
            text: "Pressure".into(),
        };
        let frame = ServerFrame::VersionConfig {
            attributes: vec![attr],
            dictionary: vec![dict],
        };
        round_trip(&frame, "ServerFrame::VersionConfig");
    }

    #[test]
    fn server_frame_unknown_version() {
        round_trip(&ServerFrame::UnknownVersion, "ServerFrame::UnknownVersion");
    }

    #[test]
    fn server_frame_ack() {
        round_trip(&ServerFrame::Ack, "ServerFrame::Ack");
    }

    #[test]
    fn server_frame_error() {
        let frame = ServerFrame::Error {
            message: "something went wrong".into(),
        };
        round_trip(&frame, "ServerFrame::Error");
    }

    #[test]
    fn bridge_frame_tag_dispatch() {
        // Verify the `type` field is correctly serialized for each variant
        let register = BridgeFrame::Register {
            ip_address: "10.0.0.50".into(),
        };
        let json = serde_json::to_value(&register).unwrap();
        assert_eq!(json["type"], "Register");

        let hb = BridgeFrame::Heartbeat { machine_id: 1 };
        let json = serde_json::to_value(&hb).unwrap();
        assert_eq!(json["type"], "Heartbeat");

        let ack = ServerFrame::Ack;
        let json = serde_json::to_value(&ack).unwrap();
        assert_eq!(json["type"], "Ack");
    }

    #[test]
    fn bridge_frame_therapy_setup() {
        let frame = BridgeFrame::TherapySetup {
            machine_id: 1,
            patient_id_str: "PAT-001".into(),
            therapy_type: Some("HD".into()),
            kit: Some("FX100".into()),
            weight: Some(70.5),
        };
        round_trip(&frame, "BridgeFrame::TherapySetup");
        let json = serde_json::to_value(&frame).unwrap();
        assert_eq!(json["type"], "TherapySetup");
        assert_eq!(json["therapy_type"], "HD");
    }

    #[test]
    fn bridge_frame_therapy_setup_minimal() {
        // Only machine_id and patient_id_str — no metadata yet
        let frame = BridgeFrame::TherapySetup {
            machine_id: 1,
            patient_id_str: "PAT-001".into(),
            therapy_type: None,
            kit: None,
            weight: None,
        };
        round_trip(&frame, "BridgeFrame::TherapySetup (minimal)");
        let json = serde_json::to_string(&frame).unwrap();
        assert!(!json.contains("therapy_type"), "None fields should be skipped");
    }

    #[test]
    fn bridge_frame_serial_status() {
        let payload = SerialStatusPayload {
            state: "Running".into(),
            failure_count: 0,
            ws_state: "connected".into(),
        };
        let frame = BridgeFrame::SerialStatus(payload);
        round_trip(&frame, "BridgeFrame::SerialStatus");
        let json = serde_json::to_value(&frame).unwrap();
        assert_eq!(json["type"], "SerialStatus");
        assert_eq!(json["state"], "Running");
        assert_eq!(json["failure_count"], 0);
        assert_eq!(json["ws_state"], "connected");
    }

    #[test]
    fn bridge_frame_serial_status_failed() {
        let payload = SerialStatusPayload {
            state: "FailedLimit".into(),
            failure_count: 5,
            ws_state: "disconnected".into(),
        };
        let frame = BridgeFrame::SerialStatus(payload);
        round_trip(&frame, "BridgeFrame::SerialStatus (failed)");
        let json = serde_json::to_value(&frame).unwrap();
        assert_eq!(json["type"], "SerialStatus");
        assert_eq!(json["state"], "FailedLimit");
        assert_eq!(json["failure_count"], 5);
        assert_eq!(json["ws_state"], "disconnected");
    }

    #[test]
    fn bridge_frame_therapy_end() {
        let frame = BridgeFrame::TherapyEnd { machine_id: 42 };
        round_trip(&frame, "BridgeFrame::TherapyEnd");
        let json = serde_json::to_value(&frame).unwrap();
        assert_eq!(json["type"], "TherapyEnd");
        assert_eq!(json["machine_id"], 42);
    }

    #[test]
    fn version_info_fingerprint_deterministic() {
        let v1 = VersionInfo {
            language_id: 1,
            system_sw: "1.0.0".into(),
            dss_fw: "2.0.0".into(),
            dss_hw: "3.0.0".into(),
            css_fw: "1.5.0".into(),
            css_hw: "2.1.0".into(),
            pss_fw: "1.0.0".into(),
            pss_hw: "1.0.0".into(),
            language1: "English".into(),
            language2: "Spanish".into(),
            language3: "".into(),
        };
        let v2 = VersionInfo {
            language_id: 1,
            system_sw: "1.0.0".into(),
            dss_fw: "2.0.0".into(),
            dss_hw: "3.0.0".into(),
            css_fw: "1.5.0".into(),
            css_hw: "2.1.0".into(),
            pss_fw: "1.0.0".into(),
            pss_hw: "1.0.0".into(),
            language1: "English".into(),
            language2: "Spanish".into(),
            language3: "".into(),
        };
        assert_eq!(v1.fingerprint(), v2.fingerprint(), "fingerprint must be deterministic");
        assert_eq!(
            v1.fingerprint().len(),
            16,
            "fingerprint must be 16 hex chars"
        );
    }
}
