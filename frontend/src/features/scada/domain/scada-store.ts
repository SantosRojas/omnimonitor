import { create } from "zustand";
import type { Reading } from "../../../core/types";
import { isFlowSignal, isPressureSignal } from "./signal-classifier";

/** Maximum number of telemetry history points kept per machine. */
export const MAX_HISTORY = 50;

/** A WS reading carrying the `internal_name` used for classification. */
export interface TelemetryReading extends Reading {
  internal_name: string;
}

/**
 * One snapshot of the machine's pressure/flow values, keyed by
 * `internal_name`, with the arrival `timestamp` of the broadcast.
 */
export interface TelemetryHistoryPoint {
  timestamp: string;
  [key: string]: number | string;
}

/** Classified telemetry + therapy state for a single machine. */
export interface ScadaMachineState {
  pressures: Record<string, TelemetryReading>;
  flows: Record<string, TelemetryReading>;
  info: Record<string, TelemetryReading>;
  history: TelemetryHistoryPoint[];
  therapyActive: boolean;
  therapyStateName: string;
  therapyStart: string | null;
  connected: boolean;
  cycle: number;
}

export interface ScadaStore {
  /** Per-machine classified state, keyed by `machine_id` (string). */
  machines: Record<string, ScadaMachineState>;

  /**
   * Classifies the latest broadcast readings into pressures/flows/info,
   * appends a history point (capped at MAX_HISTORY), and stores the
   * therapy state delivered by the server on the same broadcast.
   */
  updateReadings: (
    machineId: string,
    readings: Reading[],
    cycle: number,
    therapyActive: boolean,
    therapyStateName: string,
    therapyStart: string | null,
  ) => void;

  /** Marks a machine as connected/disconnected without touching telemetry. */
  setConnected: (machineId: string, connected: boolean) => void;

  /** Removes all stored state for a machine (e.g. when it goes offline). */
  reset: (machineId: string) => void;
}

const EMPTY_MACHINE: ScadaMachineState = {
  pressures: {},
  flows: {},
  info: {},
  history: [],
  therapyActive: false,
  therapyStateName: "",
  therapyStart: null,
  connected: false,
  cycle: 0,
};

export const useScadaStore = create<ScadaStore>()((set) => ({
  machines: {},

  updateReadings: (
    machineId,
    readings,
    cycle,
    therapyActive,
    therapyStateName,
    therapyStart,
  ) =>
    set((state) => {
      const prev = state.machines[machineId] ?? EMPTY_MACHINE;
      const pressures: Record<string, TelemetryReading> = {};
      const flows: Record<string, TelemetryReading> = {};
      // Info signals (patient data, serial number) persist across broadcasts
      // so the patient card does not flicker when a signal is omitted.
      const info: Record<string, TelemetryReading> = { ...prev.info };
      const historyPoint: TelemetryHistoryPoint = {
        timestamp: new Date().toISOString(),
      };

      for (const reading of readings) {
        if (isPressureSignal(reading.internal_name)) {
          pressures[reading.internal_name] = reading;
          if (typeof reading.value === "number") {
            historyPoint[reading.internal_name] = reading.value;
          }
        } else if (isFlowSignal(reading.internal_name)) {
          flows[reading.internal_name] = reading;
          if (typeof reading.value === "number") {
            historyPoint[reading.internal_name] = reading.value;
          }
        } else {
          info[reading.internal_name] = reading;
        }
      }

      const history = [...prev.history, historyPoint].slice(-MAX_HISTORY);

      return {
        machines: {
          ...state.machines,
          [machineId]: {
            pressures,
            flows,
            info,
            history,
            therapyActive,
            therapyStateName,
            therapyStart,
            connected: prev.connected,
            cycle,
          },
        },
      };
    }),

  setConnected: (machineId, connected) =>
    set((state) => ({
      machines: {
        ...state.machines,
        [machineId]: {
          ...(state.machines[machineId] ?? EMPTY_MACHINE),
          connected,
        },
      },
    })),

  reset: (machineId) =>
    set((state) => {
      const machines = { ...state.machines };
      delete machines[machineId];
      return { machines };
    }),
}));
