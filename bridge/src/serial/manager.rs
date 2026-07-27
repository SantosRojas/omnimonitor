//! Serial reader state machine with failure tracking.
//!
//! Ported from `pdms-omni/src/infrastructure/serial_manager.rs`.
//! Manages the reader lifecycle: Stopped → Initializing → Running → FailedLimit.
//!
//! Failures are counted via `record_failure()`. When `consecutive_failures`
//! reaches `max_failures`, the state transitions to `FailedLimit` and sends
//! a Stop command. Warnings (CRC errors, parse issues) are tracked separately
//! and do NOT count toward the failure limit.

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{Mutex, mpsc};

/// Commands sent to the serial reader loop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReaderCommand {
    Start {
        id: u64,
        new_therapy: bool,
    },
    Stop,
}

/// Snapshot of the reader's current state, inspectable via the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialReaderStatus {
    pub status: String, // "Stopped", "Initializing", "Running", "FailedLimit"
    pub consecutive_failures: u32,
    pub max_failures: u32,
    pub data_warnings: u32,
    pub cyclical_failures: u64, // Solo informativo, nunca causa FailedLimit
    pub close_therapy_on_stop: bool,
    pub pending_therapy_close: Option<i64>,
}

/// Thread-safe manager for the serial reader state machine.
///
/// Provides async methods to query and mutate the reader status, and a
/// channel to send commands to the serial reader loop.
pub struct SerialReaderManager {
    cmd_tx: mpsc::Sender<ReaderCommand>,
    state: Arc<Mutex<SerialReaderStatus>>,
}

impl SerialReaderManager {
    /// Creates a new manager with optional auto-start.
    ///
    /// Returns the manager handle, the command receiver (for the reader loop),
    /// and a clone of the shared state (for direct status inspection).
    pub fn new(
        max_failures: u32,
        start_active: bool,
    ) -> (
        Self,
        mpsc::Receiver<ReaderCommand>,
        Arc<Mutex<SerialReaderStatus>>,
    ) {
        let initial_status = if start_active {
            "Initializing"
        } else {
            "Stopped"
        };
        let state = Arc::new(Mutex::new(SerialReaderStatus {
            status: initial_status.to_string(),
            consecutive_failures: 0,
            max_failures,
            data_warnings: 0,
            cyclical_failures: 0,
            close_therapy_on_stop: true,
            pending_therapy_close: None,
        }));

        let (cmd_tx, cmd_rx) = mpsc::channel(16);
        // Pre-seed with the initial command so the reader thread always has a command to process
        let initial_cmd = if start_active {
            ReaderCommand::Start {
                id: chrono::Utc::now().timestamp_millis() as u64,
                new_therapy: false,
            }
        } else {
            ReaderCommand::Stop
        };
        let _ = cmd_tx.try_send(initial_cmd);

        (
            Self {
                cmd_tx,
                state: state.clone(),
            },
            cmd_rx,
            state,
        )
    }

    /// Returns a copy of the current status.
    pub async fn get_status(&self) -> SerialReaderStatus {
        self.state.lock().await.clone()
    }

    /// Requests the reader to start with a fresh session.
    pub async fn start(&self, new_therapy: bool) {
        let mut s = self.state.lock().await;
        s.status = "Initializing".to_string();
        s.consecutive_failures = 0;
        s.data_warnings = 0;
        let id = chrono::Utc::now().timestamp_millis() as u64;
        let _ = self
            .cmd_tx
            .send(ReaderCommand::Start { id, new_therapy })
            .await;
    }

    /// Requests the reader to stop.
    pub async fn stop(&self, close_therapy: bool) {
        let mut s = self.state.lock().await;
        s.status = "Stopped".to_string();
        s.close_therapy_on_stop = close_therapy;
        let _ = self.cmd_tx.send(ReaderCommand::Stop).await;
    }

    /// Mark session as actively running (after successful init).
    pub async fn set_running(&self) {
        let mut s = self.state.lock().await;
        s.status = "Running".to_string();
    }

    /// Record a successful cycle read; resets consecutive failure counter.
    pub async fn record_success(&self) {
        let mut s = self.state.lock().await;
        s.consecutive_failures = 0;
        s.cyclical_failures = 0;
        if s.status == "Initializing" {
            s.status = "Running".to_string();
        }
    }

    /// Record a data integrity warning (CRC, parse error, NAK, etc.).
    /// These do NOT count toward the failure limit and will NOT stop the reader.
    pub async fn record_warning(&self) {
        let mut s = self.state.lock().await;
        s.data_warnings += 1;
        // Keep status as-is; never transition to FailedLimit from warnings.
    }

    /// Immediately transition to FailedLimit (e.g. device init exhausted its own retries).
    /// Unlike `record_failure`, this doesn't depend on `max_failures`.
    pub async fn set_failed_limit(&self) {
        let mut s = self.state.lock().await;
        s.status = "FailedLimit".to_string();
        s.consecutive_failures = s.max_failures;
        s.close_therapy_on_stop = true;
        let _ = self.cmd_tx.send(ReaderCommand::Stop).await;
    }

    /// Notify the serial loop that a therapy has been closed manually from the UI.
    /// The serial loop will pick this up on its next cycle and reset its in-memory state.
    pub async fn request_therapy_close(&self, therapy_id: i64) {
        let mut s = self.state.lock().await;
        s.pending_therapy_close = Some(therapy_id);
    }

    /// Atomically read and clear the pending therapy close notification.
    pub async fn take_pending_therapy_close(&self) -> Option<i64> {
        let mut s = self.state.lock().await;
        s.pending_therapy_close.take()
    }

    /// Incrementa el contador informativo de fallos cíclicos.
    /// NUNCA transiciona a FailedLimit — solo informativo.
    pub async fn record_cyclical_failure(&self) {
        let mut s = self.state.lock().await;
        s.cyclical_failures += 1;
    }

    /// Returns the current cyclical failures count (informational only).
    pub async fn get_cyclical_failures(&self) -> u64 {
        self.state.lock().await.cyclical_failures
    }

    /// Record one connection failure (I/O error, timeout).
    /// Returns `true` if the failure limit has been reached and the reader
    /// should stop.
    pub async fn record_failure(&self) -> bool {
        let mut s = self.state.lock().await;
        s.consecutive_failures += 1;
        if s.consecutive_failures >= s.max_failures {
            s.status = "FailedLimit".to_string();
            s.close_therapy_on_stop = true;
            let _ = self.cmd_tx.send(ReaderCommand::Stop).await;
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn manager_starts_stopped() {
        let (mgr, _rx, _state) = SerialReaderManager::new(5, false);
        let status = mgr.get_status().await;
        assert_eq!(status.status, "Stopped");
        assert_eq!(status.consecutive_failures, 0);
        assert_eq!(status.max_failures, 5);
        assert_eq!(status.cyclical_failures, 0);
    }

    #[tokio::test]
    async fn manager_starts_initializing() {
        let (mgr, _rx, _state) = SerialReaderManager::new(3, true);
        let status = mgr.get_status().await;
        assert_eq!(status.status, "Initializing");
        assert_eq!(status.cyclical_failures, 0);
    }

    #[tokio::test]
    async fn record_success_transitions_to_running() {
        let (mgr, _rx, _state) = SerialReaderManager::new(5, true);
        let status = mgr.get_status().await;
        assert_eq!(status.status, "Initializing");

        mgr.record_success().await;
        let status = mgr.get_status().await;
        assert_eq!(status.status, "Running");
        assert_eq!(status.consecutive_failures, 0);
        assert_eq!(status.cyclical_failures, 0);
    }

    #[tokio::test]
    async fn failures_accumulate_and_trigger_stop() {
        let (mgr, mut rx, _state) = SerialReaderManager::new(3, false);
        let status = mgr.get_status().await;
        assert_eq!(status.status, "Stopped");

        // First failure
        let should_stop = mgr.record_failure().await;
        assert!(!should_stop, "Should not stop after 1 failure (max=3)");

        // Second failure
        let should_stop = mgr.record_failure().await;
        assert!(!should_stop, "Should not stop after 2 failures (max=3)");

        // Third failure → should stop
        let should_stop = mgr.record_failure().await;
        assert!(should_stop, "Should stop after 3 failures");

        let status = mgr.get_status().await;
        assert_eq!(status.status, "FailedLimit");
        assert_eq!(status.consecutive_failures, 3);

        // Should have sent a Stop command
        let cmd = rx.try_recv().ok();
        assert!(cmd.is_some(), "Should receive a command after failure limit");
    }

    #[tokio::test]
    async fn success_resets_failure_counter() {
        let (mgr, _rx, _state) = SerialReaderManager::new(5, false);

        mgr.record_failure().await;
        mgr.record_failure().await;
        assert_eq!(mgr.get_status().await.consecutive_failures, 2);

        mgr.record_success().await;
        assert_eq!(mgr.get_status().await.consecutive_failures, 0);
        assert_eq!(mgr.get_status().await.cyclical_failures, 0);
    }

    #[tokio::test]
    async fn cyclical_failures_accumulate_and_are_informational() {
        let (mgr, _rx, _state) = SerialReaderManager::new(5, false);

        assert_eq!(mgr.get_cyclical_failures().await, 0);

        for _ in 0..10 {
            mgr.record_cyclical_failure().await;
        }
        assert_eq!(mgr.get_cyclical_failures().await, 10);

        // record_success resets cyclical_failures
        mgr.record_success().await;
        assert_eq!(mgr.get_cyclical_failures().await, 0);
    }

    #[tokio::test]
    async fn warnings_do_not_trigger_stop() {
        let (mgr, _rx, _state) = SerialReaderManager::new(3, false);

        for _ in 0..10 {
            mgr.record_warning().await;
        }

        let status = mgr.get_status().await;
        assert_eq!(status.status, "Stopped");
        assert_eq!(status.data_warnings, 10);
        assert_eq!(status.consecutive_failures, 0);
    }

    #[tokio::test]
    async fn set_failed_limit_immediate() {
        let (mgr, _rx, _state) = SerialReaderManager::new(10, true);

        mgr.set_failed_limit().await;
        let status = mgr.get_status().await;
        assert_eq!(status.status, "FailedLimit");
        assert_eq!(status.consecutive_failures, 10);
    }

    #[tokio::test]
    async fn pending_therapy_close_atomic() {
        let (mgr, _rx, _state) = SerialReaderManager::new(5, false);

        mgr.request_therapy_close(42).await;
        assert_eq!(
            mgr.get_status().await.pending_therapy_close,
            Some(42)
        );

        let taken = mgr.take_pending_therapy_close().await;
        assert_eq!(taken, Some(42));
        assert_eq!(
            mgr.get_status().await.pending_therapy_close,
            None
        );
    }

    #[tokio::test]
    async fn start_sends_command() {
        let (mgr, mut rx, _state) = SerialReaderManager::new(5, false);

        // Consume the initial Stop command pre-seeded in the channel
        let initial = rx.recv().await;
        assert_eq!(initial, Some(ReaderCommand::Stop));

        mgr.start(false).await;
        let cmd = rx.recv().await;
        assert!(matches!(cmd, Some(ReaderCommand::Start { .. })));

        let status = mgr.get_status().await;
        assert_eq!(status.status, "Initializing");
    }

    #[tokio::test]
    async fn stop_sends_command() {
        let (mgr, mut rx, _state) = SerialReaderManager::new(5, true);

        // Consume the initial Start command pre-seeded in the channel
        let initial = rx.recv().await;
        assert!(matches!(initial, Some(ReaderCommand::Start { .. })));

        mgr.stop(true).await;
        let cmd = rx.recv().await;
        assert_eq!(cmd, Some(ReaderCommand::Stop));

        let status = mgr.get_status().await;
        assert_eq!(status.status, "Stopped");
    }
}
