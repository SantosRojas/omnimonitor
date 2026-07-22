import { wsManager } from "../ws-manager";
import { useLiveDataStore } from "../../store/live-data-store";
import { useMachineStatusStore } from "../../store/machine-status-store";
import type { WsMessage } from "../../core/types";

/**
 * Routes WebSocket messages to the appropriate Zustand stores.
 * Call once at app root to enable automatic store updates.
 */
export function startWsAdapter(wsUrl = "/ws/browser"): () => void {
  // Subscribe to ALL machines via wildcard — the ws-manager dispatches
  // by machine_id internally. We use a single subscriber to all.
  const unsubscribe = wsManager.subscribe("*", handleMessage);
  wsManager.connect(wsUrl);

  return unsubscribe;
}

function handleMessage(msg: WsMessage): void {
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
