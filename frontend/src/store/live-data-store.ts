import { create } from "zustand";
import type { ReadingsReplay, ReadingBroadcast } from "../core/types";

/**
 * Broadcast payload — the live WS view of what a machine is producing right now.
 * Both `ReadingsBroadcast` and `ReadingsReplay` share the same shape
 * (`machine_id` + `readings[]`), so we alias them here.
 */
export type ReadingsBroadcast = ReadingBroadcast | ReadingsReplay;

/* ── Live-data state ─────────────────────────────────────────── */

export interface LiveDataState {
  /**
   * A record keyed by `machine_id` (string) holding the most recent broadcast
   * received via WebSocket for that machine.
   */
  readings: Record<string, ReadingsBroadcast>;
}

export interface LiveDataActions {
  /**
   * Upserts the latest broadcast for a given machine.
   */
  updateReadings: (machineId: string, broadcast: ReadingsBroadcast) => void;

  /**
   * Removes all stored readings for a specific machine (e.g. when the
   * therapy ends or the machine goes offline).
   */
  clearMachine: (machineId: string) => void;
}

export type LiveDataStore = LiveDataState & LiveDataActions;

export const useLiveDataStore = create<LiveDataStore>((set) => ({
  readings: {},

  updateReadings: (machineId: string, broadcast: ReadingsBroadcast) =>
    set((state) => ({
      readings: { ...state.readings, [machineId]: broadcast },
    })),

  clearMachine: (machineId: string) =>
    set((state) => {
      const next = { ...state.readings };
      delete next[machineId];
      return { readings: next };
    }),
}));
