import { useEffect, useState, useCallback } from "react";
import { wsManager } from "./ws-manager";
import type { WsMessage } from "../core/types";

/**
 * React hook that subscribes to real-time WebSocket data for a single machine.
 *
 * On mount it subscribes via the singleton `wsManager` and stores the latest
 * message received for `machineId`. On unmount it unsubscribes automatically.
 *
 * The WebSocket connection itself is managed by `startWsAdapter` at the App
 * root — this hook only adds a per-machine subscriber for local component state.
 *
 * @param machineId — The machine to subscribe to.
 */
export function useWsMachine(machineId: string): WsMessage | null {
  const [latest, setLatest] = useState<WsMessage | null>(null);

  const callback = useCallback(
    (msg: WsMessage) => {
      setLatest(msg);
    },
    [], // stable identity — never re-creates
  );

  useEffect(() => {
    const unsubscribe = wsManager.subscribe(machineId, callback);
    return () => unsubscribe();
  }, [machineId, callback]);

  return latest;
}
