import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Signal } from "../../../core/types";
import { HttpSignalRepo } from "../../../data/repos/http-signal-repo";
import {
  getAccumNetRemoval,
  getAccumTherapyTime,
} from "../signal-configs";
import { useScadaStore } from "./scada-store";
import type {
  ScadaMachineState,
  TelemetryHistoryPoint,
  TelemetryReading,
} from "./scada-store";
import type { ScadaViewModel } from "./scada-view-model";

const signalRepo = new HttpSignalRepo();

const EMPTY_INFO: Record<string, TelemetryReading> = {};
const EMPTY_PRESSURES: Record<string, TelemetryReading> = {};
const EMPTY_FLOWS: Record<string, TelemetryReading> = {};
const EMPTY_HISTORY: TelemetryHistoryPoint[] = [];

/** Formats elapsed time since `start` (ISO) as HH:MM:SS. */
function formatElapsedSince(start: string): string {
  const startMs = Date.parse(start);
  if (Number.isNaN(startMs)) return "00:00:00";
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** First non-null therapy id found across the machine's classified readings. */
function findTherapyId(machine: ScadaMachineState | undefined): number | undefined {
  if (!machine) return undefined;
  for (const bucket of [machine.pressures, machine.flows, machine.info]) {
    for (const reading of Object.values(bucket)) {
      if (reading.therapy_id !== null && reading.therapy_id !== undefined) {
        return reading.therapy_id;
      }
    }
  }
  return undefined;
}

/**
 * Composes the SCADA view model for one machine from the classified
 * ScadaStore state plus the signal display-name map fetched from
 * `GET /api/signals`.
 */
export function useScadaViewModel(machineId: string): ScadaViewModel {
  const machine = useScadaStore((s) => s.machines[machineId]);

  const { data: signals } = useQuery<Signal[]>({
    queryKey: ["scada", "signals"],
    queryFn: () => signalRepo.list(),
  });

  const displayNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of signals ?? []) {
      map[s.internal_name] = s.display_name ?? s.internal_name;
    }
    return map;
  }, [signals]);

  const therapyTimeDisplay = useMemo(() => {
    if (machine?.therapyStart) {
      return formatElapsedSince(machine.therapyStart);
    }
    return getAccumTherapyTime(machine?.info ?? {});
  }, [machine]);

  const netRemovalDisplay = useMemo(
    () => getAccumNetRemoval(machine?.info ?? {}),
    [machine],
  );

  return {
    telemetry: {
      info: machine?.info ?? EMPTY_INFO,
      pressures: machine?.pressures ?? EMPTY_PRESSURES,
      flows: machine?.flows ?? EMPTY_FLOWS,
      history: machine?.history ?? EMPTY_HISTORY,
    },
    therapy: {
      active: machine?.therapyActive ?? false,
      stateName: machine?.therapyStateName ?? "",
      start: machine?.therapyStart ?? null,
      id: findTherapyId(machine),
    },
    presentation: {
      displayNameMap,
      therapyTimeDisplay,
      netRemovalDisplay,
    },
    device: {
      serialNumber: machine?.info["d_serial_number_to_odi"]?.value?.toString(),
    },
  };
}
