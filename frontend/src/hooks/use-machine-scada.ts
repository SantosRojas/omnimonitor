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
  const alarms = useAlarmStore((s) =>
    s.alarms.filter((a) => a.machineId === machineId && !a.acknowledged),
  );

  return useMemo(() => {
    // Determine connection status
    const connectionStatus: ConnectionStatus =
      machineEntry?.status.status === "online"
        ? "online"
        : machineEntry?.status.status === "error"
          ? "error"
          : "offline";

    // Extract pressure from the latest reading
    const pressure =
      readings?.readings?.find((r) => r.display_label?.toLowerCase().includes("pressure"))
        ?.value ?? 0;

    // Heuristic: machine is "running" if we have recent readings
    const isRunning = readings !== undefined && readings.readings.length > 0;

    return {
      machineId,
      readings,
      connectionStatus,
      activeAlarms: alarms,
      pressure,
      isRunning,
    };
  }, [machineId, readings, machineEntry, alarms]);
}
