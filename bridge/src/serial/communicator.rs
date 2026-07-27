//! Serial port implementation of `DeviceCommunicator`.
//!
//! Handles framing, CRC (non-standard CCITT16), and RS-232 I/O.
//!
//! Frame structure (Little Endian):
//!   [msg_length: u16][src_appl: u8][dst_appl: u8][data_part...][crc: u16]
//!
//! msg_length includes the entire frame (header + data + crc).
//! CRC is calculated over (msg_length - 2) bytes (everything except the CRC itself).

use crate::protocol::{DeviceCommunicator, DeviceError};
use serialport::SerialPort;
use std::io::{Read, Write};
use std::time::Duration;

/// Configuration for a serial port connection to an OMNI-ODI device.
#[derive(Debug, Clone)]
pub struct SerialConfig {
    pub port_name: String,
    pub baudrate: u32,
    pub timeout_secs: u64,
    pub src_addr: u8,
    pub dst_addr: u8,
}

/// Communicates with an OMNI-ODI device over a serial (RS-232) port.
///
/// Uses custom framing with a non-standard CCITT16 CRC:
///   [msg_length: u16][src: u8][dst: u8][data_part...][crc: u16]
pub struct SerialDeviceCommunicator {
    port: Box<dyn SerialPort>,
    config: SerialConfig,
}

impl SerialDeviceCommunicator {
    /// Opens the serial port with the given configuration.
    pub fn new(config: SerialConfig) -> Result<Self, String> {
        let port = serialport::new(&config.port_name, config.baudrate)
            .timeout(Duration::from_secs(config.timeout_secs))
            .data_bits(serialport::DataBits::Eight)
            .stop_bits(serialport::StopBits::One)
            .parity(serialport::Parity::None)
            .open()
            .map_err(|e| format!("Failed to open serial port {}: {}", config.port_name, e))?;

        Ok(Self { port, config })
    }

    /// CRC calculation as defined in Appendix B of the Communication Description.
    /// Non-standard CCITT16 (polynomial 0x1021).
    ///
    /// Important: The CRC is calculated over (nLngInBytes - 2) bytes
    /// (i.e., the entire frame MINUS the 2-byte CRC field itself).
    pub fn calculate_crc(buf: &[u8]) -> u16 {
        const CCITT16_POLYNOM: u16 = 0x1021;
        let mut crc: u16 = 0;

        // Length to process: total frame length minus the CRC field (2 bytes)
        let n_bytes = buf.len();
        if n_bytes < 2 {
            return 0;
        }
        let process_len = n_bytes - 2;

        let num_words = (process_len & 0xFFFE) / 2;
        let is_odd = process_len % 2 != 0;

        for i in 0..num_words {
            let hbit = crc & 0x8000;
            if hbit != 0 {
                crc ^= CCITT16_POLYNOM;
            }
            let data = u16::from_le_bytes(buf[i * 2..i * 2 + 2].try_into().unwrap());
            crc ^= data;
        }

        if is_odd {
            let hbit = crc & 0x8000;
            if hbit != 0 {
                crc ^= CCITT16_POLYNOM;
            }
            let data =
                u16::from_le_bytes(buf[num_words * 2..num_words * 2 + 2].try_into().unwrap())
                    & 0x00FF;
            crc ^= data;
        }

        crc
    }

    /// Builds a complete frame for transmission.
    ///
    /// Structure: [msg_length: u16][src: u8][dst: u8][data_part...][crc: u16]
    fn build_frame(&self, data_part: &[u8]) -> Vec<u8> {
        // msg_length = header(4) + data_part + crc(2)
        let msg_length = (4 + data_part.len() + 2) as u16;

        let mut frame = Vec::with_capacity(msg_length as usize);
        frame.extend_from_slice(&msg_length.to_le_bytes());
        frame.push(self.config.src_addr);
        frame.push(self.config.dst_addr);
        frame.extend_from_slice(data_part);

        // Append placeholder for CRC (2 bytes)
        frame.extend_from_slice(&0x0000u16.to_le_bytes());

        // Calculate CRC over the whole frame (the function itself subtracts 2)
        let crc = Self::calculate_crc(&frame);

        // Write the actual CRC at the end
        let crc_offset = frame.len() - 2;
        frame[crc_offset..crc_offset + 2].copy_from_slice(&crc.to_le_bytes());

        frame
    }

    /// Reads a complete response frame from the serial port.
    /// Returns the DATA PART only (without header and CRC).
    fn read_frame(&mut self) -> Result<Vec<u8>, DeviceError> {
        // 1. Read the first 2 bytes to get message length
        let mut len_buf = [0u8; 2];
        self.port.read_exact(&mut len_buf).map_err(|e| {
            if e.kind() == std::io::ErrorKind::TimedOut {
                DeviceError::Timeout
            } else {
                DeviceError::IoError(e.to_string())
            }
        })?;

        let msg_length = u16::from_le_bytes(len_buf) as usize;
        if msg_length < 6 {
            // Minimum: length(2) + src(1) + dst(1) + cmd(2) ... but we already read 2
            return Err(DeviceError::ParseError(format!(
                "Invalid message length: {}",
                msg_length
            )));
        }

        // 2. Read the remaining bytes
        let remaining = msg_length - 2;
        let mut rest_buf = vec![0u8; remaining];
        self.port.read_exact(&mut rest_buf).map_err(|e| {
            if e.kind() == std::io::ErrorKind::TimedOut {
                DeviceError::Timeout
            } else {
                DeviceError::IoError(e.to_string())
            }
        })?;

        // 3. Reconstruct full frame for CRC check
        let mut full_frame = Vec::with_capacity(msg_length);
        full_frame.extend_from_slice(&len_buf);
        full_frame.extend_from_slice(&rest_buf);

        // 4. Verify CRC
        let received_crc =
            u16::from_le_bytes(full_frame[msg_length - 2..msg_length].try_into().unwrap());
        let calculated_crc = Self::calculate_crc(&full_frame);

        if received_crc != calculated_crc {
            return Err(DeviceError::CrcError);
        }

        // 5. Extract data part: skip header(4 bytes) and exclude CRC(2 bytes)
        // full_frame = [length(2)][src(1)][dst(1)][data_part...][crc(2)]
        let data_part = full_frame[4..msg_length - 2].to_vec();

        Ok(data_part)
    }
}

impl DeviceCommunicator for SerialDeviceCommunicator {
    fn try_reconnect(&mut self) -> Result<(), DeviceError> {
        tracing::warn!(
            "[serial] attempting to reopen {} (baud={})...",
            self.config.port_name, self.config.baudrate
        );
        let port = serialport::new(&self.config.port_name, self.config.baudrate)
            .timeout(Duration::from_secs(self.config.timeout_secs))
            .data_bits(serialport::DataBits::Eight)
            .stop_bits(serialport::StopBits::One)
            .parity(serialport::Parity::None)
            .open()
            .map_err(|e| DeviceError::IoError(format!("reconnect failed: {e}")))?;
        self.port = port;
        tracing::info!("[serial] reconnected successfully");
        Ok(())
    }

    fn send_command(&mut self, cmd: u16, data: &[u8]) -> Result<(), DeviceError> {
        // Build data_part: [cmd_code: u16][data...]
        let mut data_part = Vec::with_capacity(2 + data.len());
        data_part.extend_from_slice(&cmd.to_le_bytes());
        data_part.extend_from_slice(data);

        let frame = self.build_frame(&data_part);
        self.port
            .write_all(&frame)
            .map_err(|e| DeviceError::IoError(e.to_string()))?;
        self.port
            .flush()
            .map_err(|e| DeviceError::IoError(e.to_string()))?;

        Ok(())
    }

    fn read_response(&mut self) -> Result<Vec<u8>, DeviceError> {
        self.read_frame()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// CRC round-trip test: build a frame, verify the CRC passes,
    /// then corrupt one byte and verify CRC fails.
    #[test]
    fn crc_round_trip_valid() {
        let config = SerialConfig {
            port_name: "COM_FAKE".into(),
            baudrate: 115200,
            timeout_secs: 1,
            src_addr: 1,
            dst_addr: 1,
        };

        // We can't open a real port, but we can test CRC directly
        // Simulate a valid frame: length(2) + src(1) + dst(1) + cmd(2) + crc(2)
        // data part = command bytes (cmd=10 = GET_VERSIONS)
        let data_part = vec![0x0A, 0x00]; // CMD_CODE_GET_VERSIONS as u16 LE
        let communicator = SerialDeviceCommunicator::new(config).ok();
        let _ = communicator; // Not used - we test static CRC

        // Build a frame manually (same logic as build_frame)
        let frame = {
            let msg_length = (4 + data_part.len() + 2) as u16;
            let mut f = Vec::with_capacity(msg_length as usize);
            f.extend_from_slice(&msg_length.to_le_bytes());
            f.push(1);  // src_addr
            f.push(1); // dst_addr
            f.extend_from_slice(&data_part);
            f.extend_from_slice(&0x0000u16.to_le_bytes());
            let crc = SerialDeviceCommunicator::calculate_crc(&f);
            let crc_offset = f.len() - 2;
            f[crc_offset..crc_offset + 2].copy_from_slice(&crc.to_le_bytes());
            f
        };

        // Verify CRC on valid frame
        let calculated = SerialDeviceCommunicator::calculate_crc(&frame);
        let stored_crc = u16::from_le_bytes(frame[frame.len() - 2..].try_into().unwrap());
        assert_eq!(calculated, stored_crc, "CRC should match on valid frame");

        // Corrupt a byte in the data portion
        let mut corrupted = frame.clone();
        corrupted[4] ^= 0xFF; // flip all bits in first data byte
        let calculated_corrupted = SerialDeviceCommunicator::calculate_crc(&corrupted);
        let stored_crc_corrupted =
            u16::from_le_bytes(corrupted[corrupted.len() - 2..].try_into().unwrap());
        assert_ne!(
            calculated_corrupted, stored_crc_corrupted,
            "CRC should not match on corrupted frame"
        );
    }

    /// CRC is deterministic: same input always produces same output.
    #[test]
    fn crc_deterministic() {
        let buf = vec![
            0x08, 0x00, // msg_length = 8
            0x01,       // src
            0x10,       // dst
            0x0A, 0x00, // cmd
            0x00, 0x00, // placeholder crc
        ];
        let crc1 = SerialDeviceCommunicator::calculate_crc(&buf);
        let crc2 = SerialDeviceCommunicator::calculate_crc(&buf);
        assert_eq!(crc1, crc2, "CRC must be deterministic");
    }

    /// CRC on empty (or too short) buffer returns 0.
    #[test]
    fn crc_empty_buffer() {
        assert_eq!(SerialDeviceCommunicator::calculate_crc(&[]), 0);
        assert_eq!(SerialDeviceCommunicator::calculate_crc(&[0x00]), 0);
    }

    /// CRC should not be zero on a realistic minimal frame.
    #[test]
    fn crc_non_zero_realistic_frame() {
        let buf = vec![
            0x08, 0x00, 0x01, 0x10, 0x0A, 0x00, 0x00, 0x00,
        ];
        let crc = SerialDeviceCommunicator::calculate_crc(&buf);
        assert_ne!(crc, 0, "CRC should be non-zero on a realistic frame");
    }

    /// Odd-length data (after CRC subtraction) CRC calculation.
    #[test]
    fn crc_odd_data_length() {
        // Buffer where process_len = n_bytes - 2 is odd
        // n_bytes = 7 → process_len = 5
        let buf = vec![0x07, 0x00, 0x01, 0x10, 0x0A, 0x00, 0x00];
        let crc = SerialDeviceCommunicator::calculate_crc(&buf);
        // Just ensure no panic and result is deterministic
        let crc2 = SerialDeviceCommunicator::calculate_crc(&buf);
        assert_eq!(crc, crc2);
    }
}
