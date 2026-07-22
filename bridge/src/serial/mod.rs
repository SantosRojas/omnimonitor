//! Bridge serial I/O module.
//!
//! Ported from `pdms-omni/src/infrastructure/` with zero database dependencies.
//! Contains the low-level `SerialDeviceCommunicator` (framing, CRC) and the
//! `SerialReaderManager` state machine for failure tracking.

pub mod communicator;
pub mod manager;
