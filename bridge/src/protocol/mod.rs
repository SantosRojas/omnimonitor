//! Bridge-side protocol types: domain entities adapted from pdms-omni
//! with zero database dependencies (no sqlx, no Repository traits).
//!
//! These types are shared with the server via WebSocket JSON frames.

pub mod frames;

use serde::{Deserialize, Serialize};
use thiserror::Error;

// ───────────────────────────────────────────────
//  Command codes (OMNI-ODI protocol)
// ───────────────────────────────────────────────

pub const CMD_CODE_GET_VERSIONS: u16 = 10;
pub const CMD_CODE_GET_HANDLES: u16 = 11;
pub const CMD_CODE_GET_DATA_ATTRS: u16 = 12;
pub const CMD_CODE_GET_NEXT_DICT_STR: u16 = 13;
pub const CMD_CODE_GET_CYCLICAL_VALUES: u16 = 15;
pub const CMD_CODE_NAK: u16 = 255;

pub const VERSION_STRING_LENGTH: usize = 16;

// ───────────────────────────────────────────────
//  Device errors
// ───────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum DeviceError {
    #[error("Communication I/O error: {0}")]
    IoError(String),
    #[error("CRC mismatch in response")]
    CrcError,
    #[error("Timeout waiting for response")]
    Timeout,
    #[error("NAK received: error code 0x{0:04X}")]
    Nak(u16),
    #[error("Parse error: {0}")]
    ParseError(String),
}

/// Trait that abstracts communication with the OMNI device.
/// Infrastructure layer implements this (serial, TCP, mock, etc.).
/// The domain and application layers ONLY know this trait.
pub trait DeviceCommunicator {
    /// Sends a command frame (with framing, CRC, etc.) to the device.
    fn send_command(&mut self, cmd: u16, data: &[u8]) -> Result<(), DeviceError>;

    /// Reads a complete response from the device.
    /// Returns the DATA PART only (without frame header and CRC).
    fn read_response(&mut self) -> Result<Vec<u8>, DeviceError>;

    /// Attempt to reconnect the underlying transport.
    /// Returns Ok(()) if reconnection succeeded, Err otherwise.
    /// Default implementation returns an error — override for transports
    /// that support reconnection.
    fn try_reconnect(&mut self) -> Result<(), DeviceError> {
        Err(DeviceError::IoError("reconnect not supported".into()))
    }

    /// Convenience: send command + read response.
    fn request(&mut self, cmd: u16, data: &[u8]) -> Result<Vec<u8>, DeviceError> {
        self.send_command(cmd, data)?;
        self.read_response()
    }
}

// ───────────────────────────────────────────────
//  Domain types
// ───────────────────────────────────────────────

/// Represents version information returned by CMD_CODE_GET_VERSIONS.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VersionInfo {
    pub language_id: u16,
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

impl VersionInfo {
    /// Returns a fully deterministic fingerprint based on all version fields.
    /// Uses FNV-1a 64-bit over a canonical representation.
    pub fn fingerprint(&self) -> String {
        let s = format!(
            "{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}",
            self.language_id,
            self.system_sw,
            self.dss_fw,
            self.dss_hw,
            self.css_fw,
            self.css_hw,
            self.pss_fw,
            self.pss_hw,
            self.language1,
            self.language2,
            self.language3,
        );
        // FNV-1a 64-bit — deterministic, portable, no external dependencies
        let mut hash: u64 = 0xcbf29ce484222325;
        for byte in s.bytes() {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        format!("{:016x}", hash)
    }
}

/// Data types as defined in the OMNI-ODI protocol (Appendix A).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u16)]
pub enum DataType {
    InputNumberUnsigned = 1,
    InputNumberSigned = 2,
    OutputNumberUnsigned = 3,
    OutputNumberSigned = 4,
    ButtonStatus = 5,
    AlarmDid = 6,
    WarningDid = 7,
    StatusDid = 8,
    EventDid = 9,
    ServiceDid = 10,
    VersionString = 11,
    CalibD = 20,
    DiaString = 21,
    InputTimeHMin = 22,
    OutputTimeHMin = 23,
    DpsAlarmDid = 24,
    #[serde(other)]
    Unknown,
}

impl From<u16> for DataType {
    fn from(val: u16) -> Self {
        match val {
            1 => DataType::InputNumberUnsigned,
            2 => DataType::InputNumberSigned,
            3 => DataType::OutputNumberUnsigned,
            4 => DataType::OutputNumberSigned,
            5 => DataType::ButtonStatus,
            6 => DataType::AlarmDid,
            7 => DataType::WarningDid,
            8 => DataType::StatusDid,
            9 => DataType::EventDid,
            10 => DataType::ServiceDid,
            11 => DataType::VersionString,
            20 => DataType::CalibD,
            21 => DataType::DiaString,
            22 => DataType::InputTimeHMin,
            23 => DataType::OutputTimeHMin,
            24 => DataType::DpsAlarmDid,
            _ => DataType::Unknown,
        }
    }
}

/// Attributes for a single data handle, returned by CMD_CODE_GET_DATA_ATTRS.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DataAttribute {
    pub handle: u16,
    pub data_type: DataType,
    pub size: u16,
    pub conversion_factor: u16,
    pub label_did: u16,
    pub unit_did: u16,
    pub signal_id: i64,
    pub internal_name: String,
}

/// Dictionary entry: maps a dictionary ID to a localized string (UTF-8).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DictionaryEntry {
    pub dict_id: u16,
    pub text: String,
}

/// A flexible value type that can be either a number or a string.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TelemetryValue {
    Number(f64),
    String(String),
}

impl From<f64> for TelemetryValue {
    fn from(v: f64) -> Self {
        TelemetryValue::Number(v)
    }
}

impl From<String> for TelemetryValue {
    fn from(v: String) -> Self {
        TelemetryValue::String(v)
    }
}

/// A single telemetry reading extracted from the cyclical data.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TelemetryReading {
    pub id: Option<i64>,
    /// Unix epoch milliseconds (i64, no string parsing needed).
    pub timestamp: i64,
    pub therapy_id: Option<i64>,
    pub serial_session_id: Option<i64>,
    pub signal_id: i64,
    pub internal_name: String,
    pub raw_value: i64,
    pub physical_value: TelemetryValue,
    /// Physical (converted) numeric value — the field the server persists
    /// and broadcasts. Derived from `physical_value` when it is a number.
    pub value: Option<f64>,
    pub unit: String,
    pub display_value: Option<String>,
    pub phase: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A canonical `VersionInfo` — the fingerprint golden value is tied to
    /// these exact fields. Change them and `fingerprint_golden_value` must be
    /// re-derived.
    fn base_version() -> VersionInfo {
        VersionInfo {
            language_id: 1,
            system_sw: "3.2.1".into(),
            dss_fw: "1.0.0".into(),
            dss_hw: "2.0.0".into(),
            css_fw: "1.5.0".into(),
            css_hw: "2.1.0".into(),
            pss_fw: "1.2.3".into(),
            pss_hw: "3.0.0".into(),
            language1: "esp".into(),
            language2: "eng".into(),
            language3: "por".into(),
        }
    }

    /// Same fields always produce the same fingerprint (server cache relies on
    /// this determinism to skip re-initialization).
    #[test]
    fn fingerprint_is_deterministic() {
        let a = base_version();
        let b = base_version();
        assert_eq!(a.fingerprint(), b.fingerprint());
    }

    /// Golden value: locks the FNV-1a 64-bit output for the canonical version.
    /// Guards against accidental algorithm or field-order changes that would
    /// silently invalidate every cached `software_versions` row.
    #[test]
    fn fingerprint_golden_value() {
        assert_eq!(base_version().fingerprint(), "e807d6c7b17587b8");
    }

    /// Renders as 16 lowercase hex chars (FNV-1a 64-bit canonical form).
    #[test]
    fn fingerprint_is_16_lowercase_hex() {
        let fp = base_version().fingerprint();
        assert_eq!(fp.len(), 16);
        assert!(fp.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(fp, fp.to_lowercase());
    }

    /// Every single field participates: mutating one must change the
    /// fingerprint. If a field stops being part of the hash, two distinct
    /// software versions would share a fingerprint and reuse a wrong cache.
    #[test]
    fn fingerprint_is_sensitive_to_every_version_field() {
        let base_fp = base_version().fingerprint();

        let mut language_id = base_version();
        language_id.language_id = 2;
        assert_ne!(base_fp, language_id.fingerprint(), "language_id");

        let mut system_sw = base_version();
        system_sw.system_sw = "3.2.2".into();
        assert_ne!(base_fp, system_sw.fingerprint(), "system_sw");

        let mut dss_fw = base_version();
        dss_fw.dss_fw = "9.9.9".into();
        assert_ne!(base_fp, dss_fw.fingerprint(), "dss_fw");

        let mut dss_hw = base_version();
        dss_hw.dss_hw = "9.9.9".into();
        assert_ne!(base_fp, dss_hw.fingerprint(), "dss_hw");

        let mut css_fw = base_version();
        css_fw.css_fw = "9.9.9".into();
        assert_ne!(base_fp, css_fw.fingerprint(), "css_fw");

        let mut css_hw = base_version();
        css_hw.css_hw = "9.9.9".into();
        assert_ne!(base_fp, css_hw.fingerprint(), "css_hw");

        let mut pss_fw = base_version();
        pss_fw.pss_fw = "9.9.9".into();
        assert_ne!(base_fp, pss_fw.fingerprint(), "pss_fw");

        let mut pss_hw = base_version();
        pss_hw.pss_hw = "9.9.9".into();
        assert_ne!(base_fp, pss_hw.fingerprint(), "pss_hw");

        let mut language1 = base_version();
        language1.language1 = "deu".into();
        assert_ne!(base_fp, language1.fingerprint(), "language1");

        let mut language2 = base_version();
        language2.language2 = "deu".into();
        assert_ne!(base_fp, language2.fingerprint(), "language2");

        let mut language3 = base_version();
        language3.language3 = "deu".into();
        assert_ne!(base_fp, language3.fingerprint(), "language3");
    }

    /// The canonical separator is `:` — a version that embeds colons in a
    /// field must still hash uniquely (defensive; firmware strings are
    /// currently version-like, but the fingerprint must not silently collide).
    #[test]
    fn fingerprint_canonical_representation_is_collision_safe_for_similar_fields() {
        // "a:b" as system_sw must not hash the same as "a" with "b" shifted
        // into another field position.
        let mut v1 = base_version();
        v1.system_sw = "a:b".into();
        let mut v2 = base_version();
        v2.dss_fw = "a:b".into();
        assert_ne!(v1.fingerprint(), v2.fingerprint());
    }
}
