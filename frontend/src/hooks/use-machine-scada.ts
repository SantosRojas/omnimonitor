import { useMemo } from "react";
import { useLiveDataStore } from "../store/live-data-store";
import { useMachineStatusStore } from "../store/machine-status-store";
import { useAlarmStore } from "../store/alarm-store";
import type { ConnectionStatus } from "../features/scada/components";

interface ScadaData {
  machineId: string;
  /** Latest readings from live-data-store */
  readings: ReturnType<typeof useLiveDataStore.getState>["readings"][string] | undefined;
  /** Connection status from machine-status-store */
  connectionStatus: ConnectionStatus;
  /** Active (unacknowledged) alarms for this machine */
  activeAlarms: ReturnType<typeof useAlarmStore.getState>["alarms"];
  /** Current pressure value extracted from readings */
  pressure: number;
  /** Whether the machine appears to be actively running */
  isRunning: boolean;
}

/**
 * Composed hook that merges live data, machine status, and alarms
 * into a single SCADA-ready view for one machine.
 */
export function useMachineScada(machineId: string): ScadaData {
  const readings = useLiveDataStore((s) => s.readings[machineId]);
  const machineEntry = useMachineStatusStore((s) => s.machines[machineId]);
  // Select the raw array — keeps the same reference until the store modifies it.
  // Filter inside useMemo to avoid creating a new array on every render.
  const allAlarms = useAlarmStore((s) => s.alarms);

  return useMemo(() => {
    // Determine connection status
    const connectionStatus: ConnectionStatus =
      machineEntry?.status.status ?? "unknown";

    // Extract pressure from the latest reading
    const pressure =
      readings?.readings?.find((r) => r.display_label?.toLowerCase().includes("pressure"))
        ?.value ?? 0;

    // Heuristic: machine is "running" if we have recent readings
    const isRunning = readings !== undefined && readings.readings.length > 0;

    // Filter inside useMemo — only creates a new array when allAlarms changes
    const activeAlarms = allAlarms.filter(
      (a) => a.machineId === machineId && !a.acknowledged,
    );

    return {
      machineId,
      readings,
      connectionStatus,
      activeAlarms,
      pressure,
      isRunning,
    };
  }, [machineId, readings, machineEntry, allAlarms]);
}
