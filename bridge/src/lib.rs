//! Bridge library crate: protocol types, serial communication, and interactor.
//!
//! Exported for integration/E2E testing. The binary entry point is in `main.rs`.

pub mod protocol;
pub mod serial;
pub mod ws_client;
pub mod interactor;
