import { create } from "zustand";

export interface Alarm {
  id: string;
  machineId: string;
  severity: "critical" | "warning" | "info";
  message: string;
  timestamp: string;
  acknowledged: boolean;
  source?: string;
}

export interface AlarmState {
  alarms: Alarm[];
}

export interface AlarmActions {
  addAlarm: (alarm: Alarm) => void;
  acknowledgeAlarm: (alarmId: string) => void;
  acknowledgeAllForMachine: (machineId: string) => void;
  clearMachineAlarms: (machineId: string) => void;
  clearAll: () => void;
}

export type AlarmStore = AlarmState & AlarmActions;

export const useAlarmStore = create<AlarmStore>((set) => ({
  alarms: [],

  addAlarm: (alarm) =>
    set((state) => ({
      alarms: [...state.alarms, alarm],
    })),

  acknowledgeAlarm: (alarmId) =>
    set((state) => ({
      alarms: state.alarms.map((a) =>
        a.id === alarmId ? { ...a, acknowledged: true } : a,
      ),
    })),

  acknowledgeAllForMachine: (machineId) =>
    set((state) => ({
      alarms: state.alarms.map((a) =>
        a.machineId === machineId ? { ...a, acknowledged: true } : a,
      ),
    })),

  clearMachineAlarms: (machineId) =>
    set((state) => ({
      alarms: state.alarms.filter((a) => a.machineId !== machineId),
    })),

  clearAll: () => set({ alarms: [] }),
}));
