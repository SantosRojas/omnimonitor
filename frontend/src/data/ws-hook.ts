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

/**
 * Registers this machine with the server so its broadcasts flow to the browser.
 *
 * Sends the Subscribe command on mount and Unsubscribe on unmount. Does nothing
 * when `machineId` is empty. The connection itself is managed by
 * `startWsAdapter` at the App root.
 *
 * @param machineId — The machine to subscribe to.
 */
export function useMachineSubscription(machineId: string): void {
  useEffect(() => {
    if (!machineId) return;
    wsManager.subscribeMachine(machineId);
    return () => wsManager.unsubscribeMachine(machineId);
  }, [machineId]);
}
