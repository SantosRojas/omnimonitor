import { wsManager } from "../ws-manager";
import { useLiveDataStore } from "../../store/live-data-store";
import { useMachineStatusStore } from "../../store/machine-status-store";
import { useBridgeStatusStore } from "../../store/bridge-status-store";
import type { WsMessage } from "../../core/types";

/**
 * Routes WebSocket messages to the appropriate Zustand stores.
 * Call once at app root to enable automatic store updates.
 */
export function startWsAdapter(wsUrl = "/ws/browser"): () => void {
  // Subscribe to ALL machines via wildcard — the ws-manager dispatches
  // by machine_id internally. We use a single subscriber to all.
  const unsubscribeMachine = wsManager.subscribe("*", handleMachineMessage);
  // Subscribe to all messages (including non-machine messages like SerialStatus)
  const unsubscribeGlobal = wsManager.subscribeGlobal(handleGlobalMessage);
  wsManager.connect(wsUrl);

  return () => {
    unsubscribeMachine();
    unsubscribeGlobal();
  };
}

function handleMachineMessage(msg: WsMessage): void {
  switch (msg.type) {
    case "ReadingsBroadcast":
    case "ReadingsReplay":
      useLiveDataStore.getState().updateReadings(msg.machine_id, msg);
      break;

    case "MachineStatus":
      useMachineStatusStore
        .getState()
        .updateMachineStatus(msg.machine_id, msg.status);
      break;

    case "RESTFallback":
      // Log or handle gracefully — no store action needed
      console.warn("[ws-adapter] REST fallback:", msg.reason);
      break;
  }
}

function handleGlobalMessage(msg: WsMessage): void {
  switch (msg.type) {
    case "SerialStatus":
      useBridgeStatusStore
        .getState()
        .updateBridgeStatus(
          msg.bridge_id,
          msg.state,
          msg.failure_count,
          msg.ws_state,
          msg.updated_at,
        );
      break;
  }
}


