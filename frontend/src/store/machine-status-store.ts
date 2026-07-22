import { create } from "zustand";
import type { MachineStatusPayload } from "../core/types/machine";

export interface MachineStatusEntry {
  status: MachineStatusPayload;
  lastUpdated: number;
}

export interface MachineStatusState {
  machines: Record<string, MachineStatusEntry>;
}

export interface MachineStatusActions {
  updateMachineStatus: (machineId: string, payload: MachineStatusPayload) => void;
  removeMachine: (machineId: string) => void;
  clearAll: () => void;
}

export type MachineStatusStore = MachineStatusState & MachineStatusActions;

export const useMachineStatusStore = create<MachineStatusStore>((set) => ({
  machines: {},

  updateMachineStatus: (machineId, payload) =>
    set((state) => ({
      machines: {
        ...state.machines,
        [machineId]: {
          status: payload,
          lastUpdated: Date.now(),
        },
      },
    })),

  removeMachine: (machineId) =>
    set((state) => {
      const next = { ...state.machines };
      delete next[machineId];
      return { machines: next };
    }),

  clearAll: () => set({ machines: {} }),
}));
