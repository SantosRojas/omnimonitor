import { useEffect, useState, useCallback, useRef } from "react";
import { wsManager } from "./ws-manager";
import type { WsMessage } from "../core/types";

/**
 * React hook that subscribes to real-time WebSocket data for a single machine.
 *
 * On mount it subscribes via the singleton `wsManager` and stores the latest
 * message received for `machineId`. On unmount it unsubscribes automatically.
 *
 * @param machineId — The machine to subscribe to.
 * @param wsUrl     — WebSocket endpoint (defaults to the dev‑proxy path). The
 *                    connection is lazily established on first hook mount and
 *                    torn down when no subscribers remain.
 */
export function useWsMachine(
  machineId: string,
  wsUrl = "/ws/browser",
): WsMessage | null {
  const [latest, setLatest] = useState<WsMessage | null>(null);
  const connectedRef = useRef(false);

  const callback = useCallback(
    (msg: WsMessage) => {
      setLatest(msg);
    },
    [], // stable identity — never re-creates
  );

  useEffect(() => {
    // Connect the singleton on first hook usage
    if (!connectedRef.current) {
      wsManager.connect(wsUrl);
      connectedRef.current = true;
    }

    const unsubscribe = wsManager.subscribe(machineId, callback);

    return () => {
      unsubscribe();

      // If there are no more subscribers at all, tear down the connection.
      // (We don't have direct access to the subscriber count from here, but
      //  the manager handles cleanup internally. We leave the connection open
      //  for other potential subscribers.)
    };
  }, [machineId, wsUrl, callback]);

  return latest;
}
